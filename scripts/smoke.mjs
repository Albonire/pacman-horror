// Prueba de humo de extremo a extremo sobre la compilacion (dist/index.html).
// Uso: npm run build && npm run smoke
// Variables: CHROME_PATH para elegir el ejecutable de Chromium (por defecto el de Puppeteer o /opt/pw-browsers).
//
// Recorre: advertencia -> menu -> dificultad -> ficha del nivel -> juego (teclado real) -> pausa ->
// ajustes -> muerte con screamer -> victoria del nivel. Falla ante cualquier error de consola o excepcion.

import fs from "fs";
import http from "http";
import path from "path";
import puppeteer from "puppeteer";

const dist = path.resolve("dist");
if (!fs.existsSync(path.join(dist, "index.html"))) {
  console.error("No existe dist/index.html. Ejecuta `npm run build` primero.");
  process.exit(2);
}

const server = http.createServer((req, res) => {
  const p = req.url.split("?")[0] === "/" ? "/index.html" : req.url.split("?")[0];
  fs.readFile(path.join(dist, p), (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(data);
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

const candidates = [process.env.CHROME_PATH, "/opt/pw-browsers/chromium"].filter(Boolean);
const executablePath = candidates.find((c) => fs.existsSync(c));
const browser = await puppeteer.launch({
  headless: true,
  executablePath,
  args: [
    "--no-sandbox", "--disable-setuid-sandbox",
    "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist",
    "--autoplay-policy=no-user-gesture-required",
  ],
});
const page = await browser.newPage();
await page.setViewport({ width: 800, height: 450 });
// calidad baja y advertencia sin aceptar: SwiftShader (GPU por software) es lento
await page.evaluateOnNewDocument(() => {
  try { localStorage.setItem("umbral.settings.v1", JSON.stringify({ quality: "low" })); } catch { /* sin almacenamiento */ }
});
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push("consola: " + m.text()); });
page.on("pageerror", (e) => errors.push("excepcion: " + (e.stack || e.message)));

let step = 0;
const checks = [];
function check(name, ok, detail = "") {
  checks.push({ name, ok });
  console.log(`${ok ? "OK  " : "FALLA"} ${++step}. ${name}${detail ? " (" + detail + ")" : ""}`);
}
const phase = () => page.evaluate(() => window.__umbral.phase);
const waitPhase = (p, timeout = 60000) =>
  page.waitForFunction((x) => window.__umbral.phase === x, { timeout }, p).then(() => true, () => false);
/** Mantiene teclas pulsadas hasta que la simulacion avance `seconds` (el render por software va a pocos fps). */
async function holdFor(keys, seconds) {
  const t0 = await page.evaluate(() => window.__umbral.sim.time);
  for (const k of keys) await page.keyboard.down(k);
  await page.waitForFunction((t, s) => window.__umbral.sim.time >= t + s, { timeout: 60000 }, t0, seconds).catch(() => {});
  const snap = await page.evaluate(() => { const p = window.__umbral.sim.player; return { running: p.running, stamina: p.stamina, speed: p.speed }; });
  for (const k of keys.slice().reverse()) await page.keyboard.up(k);
  return snap;
}
const clickText = (text) =>
  page.evaluate((t) => {
    const els = [...document.querySelectorAll("button, [role=button]")];
    const el = els.find((e) => e.textContent && e.textContent.includes(t));
    if (!el) return false;
    el.click();
    return true;
  }, text);

try {
  await page.goto(`http://127.0.0.1:${port}/?debug`, { waitUntil: "load", timeout: 60000 });
  check("el motor arranca y llega al menu", await page.waitForFunction(() => window.__umbral && window.__umbral.phase === "menu", { timeout: 120000 }).then(() => true, () => false));

  const warned = await clickText("ENTIENDO");
  check("la advertencia de contenido se acepta", warned);
  check("menu principal visible", await page.evaluate(() => document.body.innerText.includes("JUGAR")));

  check("pulsar JUGAR abre la dificultad", await clickText("JUGAR") && await page.evaluate(() => document.body.innerText.includes("PESADILLA")));
  check("elegir dificultad", await clickText("NORMAL"));
  check("DESCENDER carga el nivel y muestra la ficha", await clickText("DESCENDER") && await waitPhase("briefing"));
  check("ENTRAR comienza la partida", await clickText("ENTRAR") && await waitPhase("playing"));

  // controles con teclado real
  await page.evaluate(() => { const g = window.__umbral; g.sim.player.invuln = 99; window.__t0 = { x: g.sim.player.x, z: g.sim.player.z }; });
  await holdFor(["KeyW"], 1.6);
  const moved = await page.evaluate(() => { const p = window.__umbral.sim.player; return Math.hypot(p.x - window.__t0.x, p.z - window.__t0.z); });
  check("W mueve al jugador hacia delante", moved > 1.5, moved.toFixed(2) + " u");

  const run = await holdFor(["KeyW", "ShiftLeft"], 0.8);
  check("Shift activa el sprint y gasta resistencia", run.running === true && run.stamina < 100, "stamina " + run.stamina.toFixed(0) + ", " + run.speed.toFixed(1) + " u/s");

  await page.keyboard.press("KeyF");
  const lightOff = await page.evaluate(() => window.__umbral.sim.player.flashlightOn === false);
  await page.keyboard.press("KeyF");
  check("F apaga y enciende la linterna", lightOff);

  // audio: el contexto suspendido por el navegador se recupera solo, y un grafo roto se reconstruye
  const audioState = () => page.evaluate(() => window.__umbral.audio.S && window.__umbral.audio.S.ctx.state);
  const ctxRunning = await page.waitForFunction(() => window.__umbral.audio.S && window.__umbral.audio.S.ctx.state === "running", { timeout: 20000 }).then(() => true, () => false);
  check("el audio esta sonando durante la partida", ctxRunning, String(await audioState()));
  await page.evaluate(() => window.__umbral.audio.S.ctx.suspend());
  check("un contexto de audio suspendido se reanuda solo", await page.waitForFunction(() => window.__umbral.audio.S.ctx.state === "running", { timeout: 15000 }).then(() => true, () => false));
  await page.evaluate(() => { window.__ctxBefore = window.__umbral.audio.S.ctx; window.__umbral.audio.S.master.disconnect(); });
  check("si el grafo se rompe (silencio absoluto) el audio se reconstruye", await page.waitForFunction(() => window.__umbral.audio.S && window.__umbral.audio.S.ctx !== window.__ctxBefore && window.__umbral.audio.S.ctx.state === "running", { timeout: 40000 }).then(() => true, () => false));

  // pausa y ajustes
  await page.keyboard.press("Escape");
  check("Escape pausa", await waitPhase("paused", 10000));
  check("el panel de ajustes se abre desde la pausa", await clickText("AJUSTES") && await page.evaluate(() => /sensibilidad/i.test(document.body.innerText)));
  await clickText("LISTO");
  check("se puede reanudar", await clickText("REANUDAR") && await waitPhase("playing", 10000));

  // muerte: un fantasma despierto encima del jugador
  const died = await page.evaluate(() => {
    window.__scareSeen = false;
    setInterval(() => { for (const el of document.querySelectorAll("canvas")) if (el.style.opacity === "1" && el.width > 300) window.__scareSeen = true; }, 40);
    const g = window.__umbral, s = g.sim, p = s.player;
    p.invuln = 0;
    const gh = s.ghosts[0];
    gh.mode = "chase";
    p.x = gh.x; p.z = gh.z; // el jugador pisa al fantasma
    return true;
  });
  check("preparar la muerte", died);
  await page.evaluate(() => { window.__peak = 0; setInterval(() => { window.__peak = Math.max(window.__peak, window.__umbral.audio.lastPeak || 0); }, 50); });
  check("el fantasma atrapa y empieza el susto de muerte", await waitPhase("dying", 40000));
  check("el screamer 2D se muestra durante la muerte", await page.waitForFunction(() => window.__scareSeen === true, { timeout: 60000 }).then(() => true, () => false));
  check("el grito del susto de muerte suena (pico de salida > 0,15)", await page.evaluate(() => window.__peak) > 0.15, String(await page.evaluate(() => window.__peak)));
  check("tras el susto se pierde una vida y se reaparece", await waitPhase("playing", 90000) && await page.evaluate(() => window.__umbral.sim.lives < window.__umbral.sim.diff.lives));

  // victoria
  await page.evaluate(() => {
    const g = window.__umbral, s = g.sim;
    s.ghosts.length = 0;
    s.exitUnlocked = true; s.maze.exitUnlocked = true;
    const w = s.maze.cellToWorld(s.maze.exit[0], s.maze.exit[1]);
    s.player.x = w.x; s.player.z = w.z;
  });
  check("llegar a la salida completa el nivel", await waitPhase("levelclear", 60000));
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("umbral.progress.v1") || "{}"));
  check("el progreso se guarda, desbloquea el siguiente nivel y conserva la advertencia aceptada", saved.unlocked >= 1 && saved.highScore > 0 && saved.warningAccepted === true, JSON.stringify(saved));
} catch (e) {
  errors.push("script: " + (e.stack || e.message));
}

check("sin errores de consola ni excepciones", errors.length === 0, errors.slice(0, 3).join(" | "));
await browser.close();
server.close();

const failed = checks.filter((c) => !c.ok);
console.log(failed.length ? `\n${failed.length} comprobaciones fallaron` : "\nTodas las comprobaciones pasaron");
process.exit(failed.length ? 1 : 0);

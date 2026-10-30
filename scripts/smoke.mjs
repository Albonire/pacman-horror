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
// cuenta las peticiones de pantalla completa (el navegador sin cabeza no concede pantalla completa real)
await page.evaluateOnNewDocument(() => {
  window.__fsCalls = 0;
  Element.prototype.requestFullscreen = function () { window.__fsCalls++; return Promise.resolve(); };
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

  // clic real del raton (con pointerdown), como el de una persona
  const rect = await page.evaluate(() => {
    const el = [...document.querySelectorAll("button")].find((e) => e.textContent && e.textContent.includes("ENTIENDO"));
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  const warned = !!rect && (await page.mouse.click(rect.x, rect.y), true);
  check("la advertencia de contenido se acepta", warned);
  check("el primer clic pide pantalla completa", await page.evaluate(() => window.__fsCalls) === 1, String(await page.evaluate(() => window.__fsCalls)));
  check("menu principal visible", await page.evaluate(() => document.body.innerText.includes("JUGAR")));

  check("pulsar JUGAR abre la dificultad", await clickText("JUGAR") && await page.evaluate(() => document.body.innerText.includes("PESADILLA")));
  check("elegir dificultad", await clickText("NORMAL"));
  check("DESCENDER carga el nivel y muestra la ficha", await clickText("DESCENDER") && await waitPhase("briefing"));
  check("ENTRAR comienza la partida", await clickText("ENTRAR") && await waitPhase("playing"));
  check("la pantalla completa se pide una sola vez en toda la sesion", await page.evaluate(() => window.__fsCalls) === 1);

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

  // un reloj de audio que deja de avanzar (el contexto dice "running") tambien se detecta y se reconstruye
  const rebuilds0 = await page.evaluate(() => window.__umbral.audio.diag().rebuilds);
  await page.evaluate(() => { const c = window.__umbral.audio.S.ctx; const t = c.currentTime; Object.defineProperty(c, "currentTime", { get: () => t, configurable: true }); });
  check("un reloj de audio parado se detecta y se reconstruye", await page.waitForFunction((b) => window.__umbral.audio.diag().rebuilds > b && window.__umbral.audio.S.ctx.state === "running", { timeout: 40000 }, rebuilds0).then(() => true, () => false), await page.evaluate(() => JSON.stringify(window.__umbral.audio.diag())));

  // autocuracion: una ganancia colapsada se restaura sola, sin reconstruir el contexto
  const healBase = await page.evaluate(() => { const A = window.__umbral.audio; window.__ctxHeal = A.S.ctx; return A.diag().heals; });
  await new Promise((r) => setTimeout(r, 2200));
  await page.evaluate(() => { const S = window.__umbral.audio.S; const t = S.ctx.currentTime; S.master.gain.cancelScheduledValues(t); S.master.gain.setValueAtTime(0.0005, t); S.sfx.gain.cancelScheduledValues(t); S.sfx.gain.setValueAtTime(0, t); });
  // el valor leido en el hilo principal tarda un instante en reflejar el colapso: primero se espera a verlo
  await page.waitForFunction(() => window.__umbral.audio.S.master.gain.value < 0.1, { timeout: 3000, polling: 50 }).catch(() => {});
  const healed = await page.waitForFunction(() => { const S = window.__umbral.audio.S; return S.master.gain.value > 0.5 && S.sfx.gain.value > 1; }, { timeout: 8000, polling: 200 }).then(() => true, () => false);
  check("una ganancia colapsada (master y sfx) se cura sola en pocos segundos", healed && await page.evaluate((b) => window.__umbral.audio.diag().heals > b, healBase), await page.evaluate(() => JSON.stringify(window.__umbral.audio.diag())));
  check("la cura no reconstruye el contexto", await page.evaluate(() => window.__umbral.audio.S.ctx === window.__ctxHeal));
  check("el listener de gestos temprano se desactiva con el contexto en marcha", await page.evaluate(() => window.__umbral.audio.earlyBound === false));
  check("los sonidos frecuentes quedan pre-renderizados", await page.waitForFunction(() => window.__umbral.audio.diag().baked === 7, { timeout: 20000 }).then(() => true, () => false), String(await page.evaluate(() => window.__umbral.audio.diag().baked)));

  // si el navegador se niega a crear contextos (dos veces), el motor no se queda sin grafo y se recupera solo
  await page.evaluate(() => {
    const Orig = window.AudioContext; let n = 0;
    window.__ctxFailBefore = window.__umbral.audio.S.ctx;
    window.AudioContext = function (o) { if (n++ < 2) throw new Error("fallo simulado"); window.AudioContext = Orig; return new Orig(o); };
    window.__ctxFailBefore.close();
  });
  const recovered = await page.waitForFunction(() => { const S = window.__umbral.audio.S; return S && S.ctx !== window.__ctxFailBefore && S.ctx.state === "running"; }, { timeout: 40000 }).then(() => true, () => false);
  check("si falla la creacion del contexto (2 veces) el audio se recupera solo", recovered, await page.evaluate(() => JSON.stringify(window.__umbral.audio.diag())));

  // registro de vuelo: F9 abre el panel con lineas del contexto y se guarda para sobrevivir a una recarga
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "F9" })));
  const logTxt = await page.evaluate(() => document.querySelector("[data-audio-log] pre")?.textContent ?? "");
  check("F9 abre el registro de audio con lineas del contexto y los eventos", /Registro de audio/.test(await page.evaluate(() => document.querySelector("[data-audio-log]")?.textContent ?? "")) && /st=running/.test(logTxt) && /reconstruccion fallida/.test(logTxt), logTxt.slice(-300));
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "F9" })));
  check("F9 vuelve a cerrar el registro", await page.evaluate(() => !document.querySelector("[data-audio-log]")));
  // abrir el registro libera el puntero y el juego se pausa: se reanuda desde el menu de pausa
  if (await page.evaluate(() => window.__umbral.phase) === "paused") await clickText("REANUDAR");
  await waitPhase("playing", 10000);
  const stored = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem("umbral.audiolog.v1") || "null"); } catch { return null; } });
  check("el registro se guarda en localStorage", !!stored && stored.lines.length >= 5, stored ? String(stored.lines.length) : "vacio");

  // pausa y ajustes
  await page.keyboard.press("Escape");
  check("Escape pausa", await waitPhase("paused", 10000));
  check("el panel de ajustes se abre desde la pausa", await clickText("AJUSTES") && await page.evaluate(() => /sensibilidad/i.test(document.body.innerText)));
  check("un clic en el menu de pausa no reanuda el audio", await page.evaluate(() => window.__umbral.audio.diag().wantRunning === false));
  await clickText("LISTO");
  check("se puede reanudar", await clickText("REANUDAR") && await waitPhase("playing", 10000));

  // escondites e interruptores con E (sin pointer lock, como en modo teclado)
  const hidePrep = await page.evaluate(() => {
    const g = window.__umbral, s = g.sim;
    // el fallo original: en modo solo teclado E giraba en vez de interactuar
    g.applySettings({ ...g.settings, controlMode: "keyboard" }, false);
    for (const gh of s.ghosts) { gh.mode = "dormant"; gh.wakeTimer = 9999; }
    s.zoneLit.fill(5);
    const h = s.hideSpots[0];
    s.player.x = h.x; s.player.z = h.z;
    s.player.vx = 0; s.player.vz = 0;
    s.hideCd = 0;
    return { hint: s.interactHint, spots: s.hideSpots.length };
  });
  check("junto al armario la pista es esconderse", hidePrep.spots > 0 && hidePrep.hint === "hide", hidePrep.hint ?? "sin pista");
  await page.keyboard.press("KeyE");
  check("E se esconde en el armario en modo teclado", await page.waitForFunction(() => window.__umbral.sim.hidden !== null, { timeout: 10000 }).then(() => true, () => false));

  await page.evaluate(() => { window.__umbral.rig.mode = "tp"; });
  check("dentro del escondite la camara se fuerza en primera persona", await page.waitForFunction(() => window.__umbral.rig.forceFp === true, { timeout: 10000 }).then(() => true, () => false));
  await page.keyboard.press("KeyC");
  check("C no cambia la camara dentro del escondite", await page.evaluate(() => window.__umbral.rig.mode === "tp"));
  const hideHud = await page.evaluate(() => {
    const el = document.querySelector('[data-hud="hide"]');
    return el ? el.style.opacity : "-";
  });
  check("el HUD muestra la vision por las ranuras", hideHud === "1", hideHud);

  // contener el aliento con Espacio dentro del armario
  const st0 = await page.evaluate(() => window.__umbral.sim.player.stamina);
  await page.keyboard.down("Space");
  const held = await page.waitForFunction(() => window.__umbral.sim.holdingBreath === true, { timeout: 15000 }).then(() => true, () => false);
  await page.waitForFunction((t) => window.__umbral.sim.time >= t + 0.8, { timeout: 30000 }, await page.evaluate(() => window.__umbral.sim.time)).catch(() => {});
  const st1 = await page.evaluate(() => window.__umbral.sim.player.stamina);
  await page.keyboard.up("Space");
  check("Espacio contiene el aliento dentro del armario y gasta aliento", held && st1 < st0, st0.toFixed(0) + " -> " + st1.toFixed(0));

  await page.keyboard.press("KeyE");
  check("E vuelve a salir del escondite", await page.waitForFunction(() => window.__umbral.sim.hidden === null, { timeout: 10000 }).then(() => true, () => false));

  const swPrep = await page.evaluate(() => {
    const s = window.__umbral.sim;
    const sw = s.switches[0];
    s.zoneLit[sw.zone] = 0;
    s.player.x = sw.x; s.player.z = sw.z;
    s.player.vx = 0; s.player.vz = 0;
    s.hideCd = 0;
    // aparta los armarios para que no roben la interaccion
    window.__savedHideSpots = s.hideSpots;
    s.hideSpots = [];
    return { zone: sw.zone, hint: s.interactHint };
  });
  check("junto al interruptor la pista es encender la luz", swPrep.hint === "switch", swPrep.hint ?? "sin pista");
  await page.keyboard.press("KeyE");
  check("E enciende la luz de la zona", await page.waitForFunction((z) => window.__umbral.sim.zoneLit[z] > 5, { timeout: 10000 }, swPrep.zone).then(() => true, () => false));
  await page.evaluate(() => {
    const s = window.__umbral.sim;
    s.hideSpots = window.__savedHideSpots;
    delete window.__savedHideSpots;
  });

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
  check("tras el susto se pierde una vida y se reaparece", await waitPhase("playing", 120000) && await page.evaluate(() => window.__umbral.sim.lives < window.__umbral.sim.diff.lives));

  // flecha de la salida con la salida abierta y el jugador lejos
  await page.evaluate(() => {
    const s = window.__umbral.sim; s.player.invuln = 99; s.exitUnlocked = true; s.maze.exitUnlocked = true;
    const w = s.maze.cellToWorld(s.layout.player[0], s.layout.player[1]);
    s.player.x = w.x; s.player.z = w.z;
  });
  check("con la salida abierta aparece la flecha que la indica", await page.waitForFunction(() => document.querySelector('[data-hud="exitArrow"]')?.style.opacity === "1", { timeout: 40000 }).then(() => true, () => false));

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

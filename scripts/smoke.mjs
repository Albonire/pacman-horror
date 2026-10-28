import http from "http";
import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";

const dist = path.resolve("dist");
const server = http.createServer((req, res) => {
  const p = req.url === "/" ? "/index.html" : req.url.split("?")[0];
  fs.readFile(path.join(dist, p), (err, data) => {
    if (err) { res.writeHead(404); res.end("not found"); return; }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(data);
  });
});
await new Promise((r) => server.listen(4173, "127.0.0.1", r));

const browser = await puppeteer.launch({
  headless: true,
  args: [
    "--no-sandbox", "--disable-setuid-sandbox",
    "--enable-unsafe-swiftshader", "--use-angle=swiftshader",
    "--window-size=1280,800",
  ],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
page.on("pageerror", (e) => errors.push("pageerror: " + (e.stack || e.message)));

await page.goto("http://127.0.0.1:4173/", { waitUntil: "networkidle0", timeout: 30000 });
await new Promise((r) => setTimeout(r, 600));

const menuTitle = await page.evaluate(() => document.body.innerText.includes("PROTOCOLO UMBRAL"));
console.log("menu title visible:", menuTitle);

// click INICIAR PROTOCOLO
await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) => x.textContent.includes("INICIAR"));
  if (b) b.click();
});
await new Promise((r) => setTimeout(r, 1200));

const canvasInfo = await page.evaluate(() => {
  const c = document.querySelector("canvas");
  return c ? { w: c.width, h: c.height, cw: c.clientWidth, ch: c.clientHeight } : null;
});
console.log("3D canvas:", canvasInfo);

const dotsAt = () => page.evaluate(() => {
  const m = document.body.innerText.match(/NODOS (\d+) \/ (\d+)/);
  return m ? { left: +m[1], total: +m[2] } : null;
});
const d1 = await dotsAt();
console.log("HUD dots (t1):", d1);

// move the player around
await page.keyboard.down("KeyW"); await new Promise((r) => setTimeout(r, 350));
await page.keyboard.down("KeyA"); await new Promise((r) => setTimeout(r, 350));
await page.keyboard.up("KeyA"); await new Promise((r) => setTimeout(r, 250));
await page.keyboard.down("KeyD"); await new Promise((r) => setTimeout(r, 350));
await page.keyboard.up("KeyD"); await new Promise((r) => setTimeout(r, 250));
await page.keyboard.up("KeyW");
// toggle camera + radar + flashlight
await page.keyboard.press("KeyC"); await new Promise((r) => setTimeout(r, 300));
await page.keyboard.down("Space"); await new Promise((r) => setTimeout(r, 600));
await page.keyboard.up("Space");
await page.keyboard.press("KeyF"); await new Promise((r) => setTimeout(r, 200));
await page.keyboard.press("KeyC"); await new Promise((r) => setTimeout(r, 300));
// mouse look (in case pointer locked)
await page.mouse.move(640, 400); await page.mouse.move(720, 360); await page.mouse.move(560, 440);
await new Promise((r) => setTimeout(r, 1200));

const d2 = await dotsAt();
console.log("HUD dots (t2):", d2);
const radarVisible = await page.evaluate(() => {
  const c = document.querySelectorAll("canvas")[1];
  return c ? c.parentElement.style.opacity : null;
});
console.log("radar wrap opacity (after release, expect 0):", radarVisible);

// check WebGL actually rendering: sample canvas pixels via toDataURL length as a proxy
const glOk = await page.evaluate(() => {
  const c = document.querySelector("canvas");
  try {
    const gl = c.getContext("webgl2") || c.getContext("webgl");
    return !!gl && gl.getParameter(gl.VERSION) !== null;
  } catch { return false; }
});
console.log("webgl context present:", glOk);

await page.screenshot({ path: "scripts/smoke.png" });
console.log("errors:", errors.length);
errors.slice(0, 25).forEach((e) => console.log("  ", e));

await browser.close();
server.close();
process.exit(errors.length ? 1 : 0);

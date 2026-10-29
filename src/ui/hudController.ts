// Controlador imperativo del HUD: el motor llama a update() cada frame; solo se toca el DOM cuando cambia un valor.

import type { HudApi, HudState } from "../engine/types";

const pad = (n: number, w = 6) => String(Math.max(0, Math.floor(n))).padStart(w, "0");

function q<T extends HTMLElement>(root: HTMLElement, name: string): T {
  const el = root.querySelector<T>(`[data-hud="${name}"]`);
  if (!el) throw new Error(`HUD: falta [data-hud="${name}"]`);
  return el;
}

export class HudController implements HudApi {
  private root: HTMLElement;
  private el: Record<string, HTMLElement> = {};
  private last: Partial<Record<string, string>> = {};
  private msgTimer: number | null = null;
  private flashTimer: number | null = null;
  private lastLives = -1;
  private lastMaxLives = -1;

  constructor(root: HTMLElement) {
    this.root = root;
    for (const n of ["score", "high", "level", "nodes", "lives", "stamina", "battery", "bite", "staminaLabel", "batteryLabel",
      "power", "powerFill", "message", "hint", "radar", "popups", "vignette", "flash", "exit", "fruit", "mute", "cam",
      "crosshair", "hide"]) {
      this.el[n] = q(root, n);
    }
  }

  private set(key: string, name: string, value: string, fn: (v: string) => void): void {
    if (this.last[key] === value) return;
    this.last[key] = value;
    fn(value);
    void name;
  }

  setVisible(v: boolean): void { this.root.style.opacity = v ? "1" : "0"; }

  update(s: HudState): void {
    const e = this.el;
    this.set("score", "score", pad(s.score), (v) => { e.score.textContent = v; });
    this.set("high", "high", pad(s.highScore), (v) => { e.high.textContent = v; });
    this.set("level", "level", s.levelLabel, (v) => { e.level.textContent = v; });
    this.set("nodes", "nodes", `${s.dotsLeft}|${s.totalDots}`, () => {
      e.nodes.textContent = s.dotsLeft > 0 ? `NODOS ${String(s.dotsLeft).padStart(3, "0")}` : "SALIDA ABIERTA";
      e.nodes.classList.toggle("hud-ok", s.dotsLeft === 0);
    });
    if (this.lastLives !== s.lives || this.lastMaxLives !== s.maxLives) {
      this.lastLives = s.lives; this.lastMaxLives = s.maxLives;
      const total = Math.max(s.lives, s.maxLives);
      let html = "";
      for (let i = 0; i < total; i++) html += `<span class="pac-life ${i < s.lives ? "on" : "off"}"></span>`;
      e.lives.innerHTML = html;
    }
    const st = Math.round(s.stamina * 100), ba = Math.round(s.battery * 100);
    this.set("stamina", "stamina", `${st}|${s.exhausted}`, () => {
      (e.stamina as HTMLElement).style.width = `${st}%`;
      e.stamina.classList.toggle("bar-warn", s.exhausted || st < 25);
    });
    this.set("battery", "battery", `${ba}|${s.lightOn}`, () => {
      (e.battery as HTMLElement).style.width = `${ba}%`;
      e.battery.classList.toggle("bar-warn", ba < 25);
      e.battery.classList.toggle("bar-off", !s.lightOn);
    });
    const bi = Math.round(s.bite * 100);
    this.set("bite", "bite", String(bi), () => {
      (e.bite as HTMLElement).style.width = `${bi}%`;
      e.bite.classList.toggle("bar-ready", bi >= 100);
    });
    this.set("power", "power", s.powerFrac > 0 ? "1" : "0", (v) => { e.power.style.opacity = v; });
    if (s.powerFrac > 0) {
      (e.powerFill as HTMLElement).style.width = `${Math.round(s.powerFrac * 100)}%`;
      e.powerFill.classList.toggle("blink", s.powerLow);
    }
    this.set("fruit", "fruit", s.fruitName ?? "", (v) => {
      e.fruit.textContent = v ? `${v} DISPONIBLE` : "";
      e.fruit.style.opacity = v ? "1" : "0";
    });
    this.set("cam", "cam", `${s.camera}|${s.hidden}`, () => {
      e.cam.textContent = s.hidden ? "ESCONDIDO" : s.camera === "fp" ? "1ª PERSONA [C]" : "3ª PERSONA [C]";
    });
    this.set("crosshair", "crosshair", s.crosshair ? "1" : "0", (v) => { e.crosshair.style.opacity = v; });
    this.set("hide", "hide", s.hidden ? "1" : "0", (v) => { e.hide.style.opacity = v; });
    this.set("mute", "mute", String(s.muted), (v) => { e.mute.style.opacity = v === "true" ? "1" : "0"; });
  }

  message(text: string, seconds: number, tone: "info" | "warn" | "good" = "info"): void {
    const m = this.el.message;
    m.textContent = text;
    m.dataset.tone = tone;
    m.style.opacity = "1";
    if (this.msgTimer !== null) window.clearTimeout(this.msgTimer);
    this.msgTimer = window.setTimeout(() => { m.style.opacity = "0"; }, seconds * 1000);
  }

  popup(text: string, tone: "points" | "combo" | "bonus" = "points", sx = 0.5, sy = 0.5): void {
    const d = document.createElement("div");
    d.className = `hud-popup hud-popup-${tone}`;
    d.textContent = text;
    d.style.left = `${Math.max(5, Math.min(95, sx * 100))}%`;
    d.style.top = `${Math.max(10, Math.min(85, sy * 100))}%`;
    this.el.popups.appendChild(d);
    window.setTimeout(() => d.remove(), 1300);
  }

  flash(color: string, opacity: number, seconds: number): void {
    const f = this.el.flash;
    f.style.transition = "none";
    f.style.background = color;
    f.style.opacity = String(opacity);
    void f.offsetWidth;
    f.style.transition = `opacity ${seconds}s ease-out`;
    f.style.opacity = "0";
    if (this.flashTimer !== null) window.clearTimeout(this.flashTimer);
  }

  setVignette(opacity: number): void { this.el.vignette.style.opacity = String(opacity); }

  showHint(text: string | null): void {
    this.set("hint", "hint", text ?? "", (v) => {
      this.el.hint.textContent = v;
      this.el.hint.style.opacity = v ? "1" : "0";
    });
  }

  setSonarVisible(v: boolean): void {
    this.set("radar", "radar", String(v), (x) => { this.el.radar.style.opacity = x === "true" ? "1" : "0"; });
  }
}

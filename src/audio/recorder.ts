// Registro de vuelo del audio: una linea por segundo con el estado del contexto y del grafo, mas los eventos
// (cambios de estado, curas, reconstrucciones, pausas, cambios de dispositivo). Se guarda en localStorage para
// sobrevivir a la recarga de la pagina (que es justo lo que el usuario hace cuando el sonido se corta) y se
// muestra con F9 con un boton para copiarlo.

const KEY = "umbral.audiolog.v1";
const KEEP = `${KEY}.keep`;
const MAX_LINES = 300;
const SHOWN_LINES = 140;
const SHOWN_PREV = 80;

type Fields = Record<string, string | number | boolean | null | undefined>;

interface Saved { started: string; env: string; lines: string[] }

function readSaved(key = KEY): Saved | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch { return null; }
}

export class AudioRecorder {
  private lines: string[] = [];
  private prev: Saved | null = null;
  private readonly started = typeof Date !== "undefined" ? new Date().toISOString() : "";
  private readonly t0 = typeof performance !== "undefined" ? performance.now() : 0;
  private ticks = 0;
  private longCount = 0;
  private longMax = 0;
  private observer: PerformanceObserver | null = null;
  private panel: HTMLElement | null = null;
  private body: HTMLPreElement | null = null;
  private refresh: number | null = null;
  private installed = false;

  /** Engancha el observador de tareas largas, los eventos del documento y la tecla F9. Idempotente. */
  install(): void {
    if (this.installed || typeof window === "undefined") return;
    this.installed = true;
    // una recarga rapida no debe borrar el registro largo de la sesion que fallo: se conserva el ultimo con >= 30 lineas
    this.prev = readSaved();
    try {
      if (this.prev && this.prev.lines.length >= 30) localStorage.setItem(KEEP, JSON.stringify(this.prev));
      else this.prev = readSaved(KEEP) ?? this.prev;
    } catch { /* sin almacenamiento */ }
    try {
      this.observer = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) { this.longCount++; this.longMax = Math.max(this.longMax, e.duration); }
      });
      this.observer.observe({ entryTypes: ["longtask"] });
    } catch { /* el navegador no expone tareas largas */ }
    document.addEventListener("visibilitychange", () => this.event(`visibilidad: ${document.visibilityState}`));
    document.addEventListener("fullscreenchange", () => this.event(`pantalla completa: ${document.fullscreenElement ? "si" : "no"}`));
    document.addEventListener("pointerlockchange", () => this.event(`puntero: ${document.pointerLockElement ? "bloqueado" : "libre"}`));
    window.addEventListener("pagehide", () => this.save());
    window.addEventListener("online", () => this.event("red: en linea"));
    try {
      navigator.mediaDevices?.addEventListener?.("devicechange", () => this.event("cambio de dispositivo de audio"));
    } catch { /* sin mediaDevices */ }
    window.addEventListener("keydown", (e) => { if (e.key === "F9") { e.preventDefault(); this.toggle(); } });
    window.addEventListener("error", (e) => this.event(`error: ${e.message}`));
    window.addEventListener("unhandledrejection", (e) => this.event(`promesa rechazada: ${String((e.reason as Error)?.message ?? e.reason)}`));
  }

  private stamp(): string { return ((performance.now() - this.t0) / 1000).toFixed(1).padStart(7); }

  private push(line: string): void {
    this.lines.push(line);
    if (this.lines.length > MAX_LINES) this.lines.splice(0, this.lines.length - MAX_LINES);
  }

  /** Evento puntual (siempre se guarda). */
  event(msg: string): void {
    this.push(`${this.stamp()}  ** ${msg}`);
    this.save();
  }

  /** Linea periodica (1 Hz). Los contadores de tareas largas se reinician en cada llamada. */
  tick(f: Fields): void {
    const parts: string[] = [];
    for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== null) parts.push(`${k}=${v}`);
    if (this.longCount) parts.push(`lt=${this.longCount}/${Math.round(this.longMax)}ms`);
    this.longCount = 0; this.longMax = 0;
    this.push(`${this.stamp()}  ${parts.join(" ")}`);
    if (++this.ticks % 5 === 0) this.save();
  }

  get recent(): string[] { return this.lines.slice(-12); }

  private env(): string {
    try {
      const n = navigator as Navigator & { deviceMemory?: number };
      return `${n.userAgent} | nucleos=${n.hardwareConcurrency ?? "?"} memoria=${n.deviceMemory ?? "?"}GB`;
    } catch { return "?"; }
  }

  save(): void {
    try { localStorage.setItem(KEY, JSON.stringify({ started: this.started, env: this.env(), lines: this.lines } satisfies Saved)); }
    catch { /* almacenamiento bloqueado o lleno */ }
  }

  /** Texto completo (sesion anterior incluida) para pegarlo en un informe. */
  text(): string {
    const out: string[] = [`UMBRAL registro de audio, sesion ${this.started}`, this.env(), ""];
    if (this.prev?.lines.length) {
      out.push(`--- sesion anterior (${this.prev.started}), ultimas ${SHOWN_PREV} lineas ---`);
      out.push(...this.prev.lines.slice(-SHOWN_PREV), "", "--- sesion actual ---");
    }
    out.push(...this.lines.slice(-SHOWN_LINES));
    return out.join("\n");
  }

  toggle(): void {
    if (typeof document === "undefined") return;
    if (this.panel) { this.close(); return; }
    try { document.exitPointerLock?.(); } catch { /* ya libre */ }
    const panel = document.createElement("div");
    panel.setAttribute("data-audio-log", "1");
    panel.style.cssText = "position:fixed;inset:4% 4% 4% 4%;z-index:99999;background:rgba(6,4,4,.96);color:#cfd8c8;"
      + "border:1px solid #5a3a3a;font:12px/1.35 ui-monospace,Consolas,monospace;display:flex;flex-direction:column;padding:10px;gap:8px";
    const bar = document.createElement("div");
    bar.style.cssText = "display:flex;gap:8px;align-items:center";
    const title = document.createElement("strong");
    title.textContent = "Registro de audio (F9 para cerrar)";
    title.style.flex = "1";
    const copy = document.createElement("button");
    copy.textContent = "Copiar";
    const close = document.createElement("button");
    close.textContent = "Cerrar";
    for (const b of [copy, close]) b.style.cssText = "font:inherit;padding:4px 12px;background:#1a1212;color:#e8d8d0;border:1px solid #5a3a3a;cursor:pointer";
    copy.onclick = () => {
      const txt = this.text();
      const done = () => { copy.textContent = "Copiado"; setTimeout(() => { copy.textContent = "Copiar"; }, 1500); };
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(txt).then(done, () => this.fallbackCopy(txt, done));
      else this.fallbackCopy(txt, done);
    };
    close.onclick = () => this.close();
    bar.append(title, copy, close);
    const body = document.createElement("pre");
    body.style.cssText = "margin:0;flex:1;overflow:auto;white-space:pre-wrap;word-break:break-all;user-select:text";
    panel.append(bar, body);
    document.body.appendChild(panel);
    this.panel = panel; this.body = body;
    const draw = () => {
      if (!this.body) return;
      const stick = body.scrollTop + body.clientHeight >= body.scrollHeight - 30;
      body.textContent = this.text();
      if (stick) body.scrollTop = body.scrollHeight;
    };
    draw();
    body.scrollTop = body.scrollHeight;
    this.refresh = window.setInterval(draw, 1000);
  }

  private fallbackCopy(txt: string, done: () => void): void {
    const ta = document.createElement("textarea");
    ta.value = txt;
    ta.style.cssText = "position:fixed;left:-9999px";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); done(); } catch { /* el usuario puede seleccionar el texto a mano */ }
    ta.remove();
  }

  private close(): void {
    if (this.refresh !== null) window.clearInterval(this.refresh);
    this.refresh = null;
    this.panel?.remove();
    this.panel = null; this.body = null;
  }

  /** True si el panel esta abierto (pruebas). */
  get open(): boolean { return this.panel !== null; }
}

/** Instancia unica: el motor, el juego y las pruebas comparten el mismo registro. */
export const recorder = new AudioRecorder();

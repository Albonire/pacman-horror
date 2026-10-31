// Motor de audio de UMBRAL: implementa GameAudio con Web Audio (100% procedural).

import type { ThemeId } from "../config/campaign";
import type { FaceKind } from "../gfx/faces";
import { Ambience, THEME_AUDIO } from "./ambience";
import { Dread, type DreadKind } from "./dread";
import { MenuBed } from "./menubed";
import { Drone, Siren } from "./music";
import { bakeAll, bakedReady } from "./baked";
import { recorder } from "./recorder";
import * as fx from "./sfx";
import { Synth } from "./synth";
import type { AudioFrame, GameAudio } from "./types";
import { BreathEngine, GhostVoice } from "./voices";

/**
 * Tabla de mezcla: factor aplicado a cada efecto. Calibrada midiendo picos con un OfflineAudioContext
 * (el compresor del bus maestro aporta ganancia de compensacion, asi que los transitorios suben mucho).
 */
const MIX = {
  waka: 0.4, step: 0.6, bite: 0.26, ghostEaten: 0.32, pellet: 0.5, heartbeat: 0.75, scream: 0.8,
  screamerFlash: 0.95, scareHit: 0.9, pickup: 0.5, switchOn: 0.6, hide: 0.7, dread: 0.6, flashlight: 0.6, fruit: 0.5, wake: 0.6, pant: 1.1,
} as const;

/** Buffer elegido a mano desde el panel F9 (clave nueva: la automatica de la version anterior se ignora). */
const LATENCY_KEY = "umbral.audio.latency.v2";
/** Opciones del panel F9: nombre y `latencyHint` (Chrome recorta los numericos a ~0,17 a 0,19 s). */
const LATENCY_CHOICES: [string, AudioContextLatencyCategory | number][] = [["Buffer corto", "playback"], ["Buffer medio", 0.1], ["Buffer largo", 0.2]];

function loadLatency(): AudioContextLatencyCategory | number {
  try {
    const v = Number(localStorage.getItem(LATENCY_KEY));
    if (v > 0 && v <= 0.5) return v;
  } catch { /* sin almacenamiento */ }
  return "playback";
}

/** Pico de salida por debajo del cual se considera silencio (-80 dB). */
const QUIET_PEAK = 1e-4;

export class HorrorAudio implements GameAudio {
  private S: Synth | null = null;
  private volume = 0.8;
  private muted = false;
  private theme: ThemeId = "offices";
  private ambience: Ambience | null = null;
  private drone: Drone | null = null;
  private siren: Siren | null = null;
  private dread: Dread | null = null;
  private bed: MenuBed | null = null;
  private bedOn = false;
  private breath = new BreathEngine();
  private voices = new Map<number, GhostVoice>();
  private suspended = false;
  /** Estado que queremos: el contexto debe estar sonando salvo durante la pausa. */
  private wantRunning = false;
  private chain: Promise<void> = Promise.resolve();
  private watchdog: number | null = null;
  private meterTimer: number | null = null;
  private lastRebuild = -100;
  private pending: { fn: (S: Synth) => void; mix: number; t: number }[] = [];
  private buf: Float32Array<ArrayBuffer> | null = null;
  private gestureBound = false;
  private earlyBound = false;
  onStatus?: (msg: string) => void;
  lastPeak = 0;
  // diagnostico del vigilante de reloj
  private clockWall = 0;
  private clockAudio = 0;
  private stalledFor = 0;
  private rebuilds = 0;
  private lastReason = "";
  private clockRatio = 1;
  private everRan = false;
  private notRunningFor = 0;
  private lastFail = -100;
  private quietFor = 0;
  private lastDead = -100;
  private heals = 0;
  private lastTick = { wall: 0, made: 0, params: 0 };
  private bakesQueued = false;
  private quietHealed = false;
  /** Tamano de buffer pedido al navegador: "playback" (~20 ms) o, si se detectan microcortes, el maximo. */
  private latency: AudioContextLatencyCategory | number = loadLatency();
  /** Marcas (s) de saltos del reloj de audio respecto al de pared. */
  private hiccups: number[] = [];
  private bornAt = 0;
  private stateChangedAt = 0;
  private visChangedAt = 0;
  private lastChoppyNote = -100;
  private quietRebuilds = 0;

  /** `factory` y `assumeRunning` permiten pruebas con un OfflineAudioContext. */
  constructor(private factory?: () => AudioContext, private assumeRunning = false) {
    if (!this.assumeRunning && typeof window !== "undefined") {
      recorder.install();
      recorder.actions = LATENCY_CHOICES.map(([label, hint]) => ({ label, run: () => this.setLatency(hint) }));
      this.bindEarlyGestures();
    }
  }

  private bindEarlyGestures(): void {
    if (this.earlyBound || typeof window === "undefined") return;
    this.earlyBound = true;
    for (const ev of ["pointerdown", "keydown", "touchstart", "click"]) {
      window.addEventListener(ev, this.onEarlyGesture, true);
    }
  }

  private unbindEarlyGestures(): void {
    if (!this.earlyBound || typeof window === "undefined") return;
    this.earlyBound = false;
    for (const ev of ["pointerdown", "keydown", "touchstart", "click"]) {
      window.removeEventListener(ev, this.onEarlyGesture, true);
    }
  }

  /**
   * Primer gesto: crea el contexto. Despues solo reintenta reanudarlo mientras no este en marcha; no se quita
   * aqui porque `resume()` es asincrono, sino en el evento `statechange` a `running` (ver `watchState`).
   * Nunca anula una pausa: si el juego suspendio el audio, un clic en el menu de pausa no lo vuelve a encender.
   */
  private onEarlyGesture = (): void => {
    if (!this.S) this.resume();
    else this.kick();
  };

  /** Debe llamarse desde un gesto del usuario (clic/tecla). */
  resume(): void {
    if (this.suspended || !this.wantRunning) recorder.event("audio reanudado");
    this.suspended = false;
    this.wantRunning = true;
    this.startWatching();
    if (!this.S) {
      let next: Synth;
      try { next = new Synth(this.factory?.(), { latency: this.latency }); } catch (e) {
        // el vigilante lo reintenta cada segundo (wantRunning ya esta activo)
        recorder.event(`no se pudo crear el contexto: ${String((e as Error)?.message ?? e)}`);
        return;
      }
      recorder.event(`contexto creado (${next.ctx.sampleRate} Hz, pedido ${this.latency}, latencia base ${(next.ctx.baseLatency ?? 0).toFixed(3)} s)`);
      this.adopt(next);
    }
    this.apply();
  }

  /** Pone en marcha un Synth nuevo con el volumen, silencio y tema actuales. */
  private adopt(next: Synth): void {
    this.S = next;
    this.bornAt = performance.now() / 1000;
    this.hiccups = [];
    next.setVolume(this.volume);
    next.setMuted(this.muted);
    this.startLayers();
    this.watchState();
    this.bakesQueued = false;
  }

  suspend(): void {
    if (!this.suspended) recorder.event("audio en pausa");
    this.suspended = true;
    this.wantRunning = false;
    this.apply();
  }

  /**
   * Lleva el contexto al estado deseado. Las peticiones se serializan: pausar y reanudar muy seguido ya no deja
   * el contexto suspendido (antes, `resume()` miraba un estado que `suspend()` todavia no habia aplicado).
   */
  private apply(): void {
    if (this.assumeRunning) return;
    this.chain = this.chain.then(async () => {
      const ctx = this.S?.ctx;
      if (!ctx || ctx.state === "closed") return;
      // una promesa de resume()/suspend() que nunca se resuelve bloquearia la cadena para siempre: se abandona a los 2 s
      const limit = new Promise<void>((r) => setTimeout(r, 2000));
      try {
        if (this.wantRunning) { if (ctx.state !== "running") await Promise.race([ctx.resume(), limit]); }
        else if (ctx.state === "running") await Promise.race([ctx.suspend(), limit]);
      } catch { /* sin gesto del usuario: el vigilante reintentara */ }
    });
  }

  /** Si el navegador detiene el contexto por su cuenta, se intenta reanudar al instante (sin esperar al vigilante). */
  private watchState(): void {
    const ctx = this.S?.ctx;
    if (!ctx || this.assumeRunning) return;
    ctx.onstatechange = () => {
      recorder.event(`contexto: ${ctx.state}`);
      this.stateChangedAt = performance.now() / 1000;
      if (ctx.state === "running") { this.everRan = true; this.unbindEarlyGestures(); }
      if (this.wantRunning && ctx.state !== "running" && ctx.state !== "closed" && this.S?.ctx === ctx) this.apply();
    };
    if (ctx.state === "running") { this.everRan = true; this.unbindEarlyGestures(); }
  }

  private startWatching(): void {
    if (this.assumeRunning || typeof window === "undefined") return;
    if (this.watchdog === null) this.watchdog = window.setInterval(() => this.watch(), 1000);
    if (this.meterTimer === null) this.meterTimer = window.setInterval(() => this.meter(0.5), 500);
    if (!this.gestureBound) {
      this.gestureBound = true;
      for (const ev of ["keydown", "pointerdown", "focus", "pageshow"]) window.addEventListener(ev, this.kick, true);
      document.addEventListener("visibilitychange", this.kick);
      document.addEventListener("visibilitychange", this.onVisibility);
      window.addEventListener("focus", this.onVisibility);
      document.addEventListener("pointerlockchange", this.kick);
    }
  }

  private stopWatching(): void {
    if (this.watchdog !== null) window.clearInterval(this.watchdog);
    if (this.meterTimer !== null) window.clearInterval(this.meterTimer);
    this.watchdog = null; this.meterTimer = null;
    if (this.gestureBound) {
      this.gestureBound = false;
      for (const ev of ["keydown", "pointerdown", "focus", "pageshow"]) window.removeEventListener(ev, this.kick, true);
      document.removeEventListener("visibilitychange", this.kick);
      document.removeEventListener("visibilitychange", this.onVisibility);
      window.removeEventListener("focus", this.onVisibility);
      document.removeEventListener("pointerlockchange", this.kick);
    }
  }

  private onVisibility = (): void => { this.visChangedAt = performance.now() / 1000; };

  /** Cualquier gesto del usuario es una oportunidad para reanudar un contexto que el navegador haya detenido. */
  private kick = (): void => {
    if (this.wantRunning) {
      if (!this.S) this.resume();
      else if (this.S.ctx.state !== "running") this.apply();
    }
  };

  /** Vigilante (1 Hz): reanuda, cura, reconstruye si hace falta y deja una linea en el registro de vuelo. */
  private watch(): void {
    if (!this.wantRunning) { this.notRunningFor = 0; return; }
    const S = this.S;
    if (!S) { this.rebuild("sin contexto"); return; }
    const st = S.ctx.state as string;
    this.record(S);
    if (st === "closed") { this.rebuild("el contexto se cerro"); return; }
    if (st !== "running") {
      this.apply(); this.clockWall = 0;
      const visible = typeof document === "undefined" || document.visibilityState === "visible";
      // ya sono antes y lleva segundos sin volver: la promesa de resume() quedo colgada o el dispositivo cambio
      this.notRunningFor = this.everRan && visible ? this.notRunningFor + 1 : 0;
      if (this.notRunningFor >= 5) { this.notRunningFor = 0; this.rebuild(`el contexto sigue ${st}`); }
      return;
    }
    this.notRunningFor = 0; this.everRan = true;
    if (this.clockStalled(S)) { this.rebuild("el reloj de audio no avanza"); return; }
    this.noteChoppy(S);
    this.heal(S);
    // vacia los efectos que llegaron mientras el contexto estaba parado (si no son muy viejos)
    const now = performance.now();
    const todo = this.pending.splice(0);
    for (const e of todo) if (now - e.t < 1500) this.with(e.fn, e.mix);
    if (!this.bakesQueued) { this.bakesQueued = true; this.scheduleBakes(S); }
  }

  /** Restaura ganancias fuera de su valor nominal y deja constancia. */
  private heal(S: Synth): boolean {
    const fixes = S.heal();
    if (!fixes.length) return false;
    this.heals += fixes.length;
    recorder.event(`cura: ${fixes.join("; ")}`);
    return true;
  }

  /** Sonidos frecuentes pre-renderizados: se calculan tras el primer segundo de audio, de uno en uno, fuera del camino critico. */
  private scheduleBakes(S: Synth): void {
    if (typeof window === "undefined") return;
    window.setTimeout(() => { if (this.S === S) bakeAll(S); }, 1500);
  }

  /** Una linea del registro de vuelo. */
  private record(S: Synth): void {
    const c = S.ctx as AudioContext & { outputLatency?: number; playoutStats?: { fallbackFramesEvents?: number; fallbackFramesDuration?: number } };
    const wall = performance.now();
    const st = S.stats;
    const dt = (wall - this.lastTick.wall) / 1000;
    const rate = (a: number, b: number) => (this.lastTick.wall && dt > 0.2 ? Math.round((a - b) / dt) : 0);
    const nodes = rate(st.made, this.lastTick.made), params = rate(st.params, this.lastTick.params);
    this.lastTick = { wall, made: st.made, params: st.params };
    const g = (p: AudioParam) => (Number.isFinite(p.value) ? p.value.toFixed(2) : "NaN");
    const ps = c.playoutStats;
    recorder.tick({
      st: c.state, clk: this.clockRatio.toFixed(2), bl: (c.baseLatency ?? 0).toFixed(3), ol: (c.outputLatency ?? 0).toFixed(3),
      m: g(S.master.gain), sfx: g(S.sfx.gain), amb: g(S.amb.gain), mus: g(S.music.gain), voi: g(S.voice.gain),
      lp: S.isMuffled ? S.lp.frequency.value.toFixed(0) : "-",
      live: st.live, nps: nodes, pps: params, pk: this.lastPeak.toFixed(3),
      rb: this.rebuilds, hl: this.heals, hc: this.hiccups.length, vis: typeof document !== "undefined" && document.visibilityState === "visible" ? 1 : 0,
      fb: ps ? `${ps.fallbackFramesEvents ?? 0}/${(ps.fallbackFramesDuration ?? 0).toFixed(2)}` : undefined,
    });
  }

  /**
   * El contexto puede decir "running" y no avanzar (cambio de dispositivo de salida, hilo de audio ahogado):
   * el reloj del contexto debe avanzar casi al ritmo del reloj de pared. Tres segundos seguidos a menos de la
   * mitad cuentan como parado y se reconstruye el grafo.
   */
  private clockStalled(S: Synth): boolean {
    const wall = performance.now() / 1000, audio = S.ctx.currentTime;
    if (this.clockWall > 0) {
      const dw = wall - this.clockWall, da = audio - this.clockAudio;
      if (dw > 0.2) this.clockRatio = da / dw;
      this.noteHiccup(wall, dw, da);
      // un hilo de temporizadores atrasado (pestana en segundo plano) infla dw: solo cuenta si el contexto no avanza casi nada
      this.stalledFor = dw > 0.5 && da < dw * 0.5 ? this.stalledFor + dw : 0;
    }
    this.clockWall = wall; this.clockAudio = audio;
    return this.stalledFor >= 3;
  }

  /**
   * Microcortes: con el contexto en marcha el reloj de audio debe avanzar al ritmo del de pared. Saltos de mas del 15 %
   * en un intervalo de ~1 s (se para y luego se pone al dia) indican que el hilo de audio del sistema se retrasa y
   * se oiria como cortes. Se ignoran los primeros segundos, los cambios de estado y las pestanas ocultas.
   */
  private noteHiccup(wall: number, dw: number, da: number): void {
    if (dw < 0.7 || dw > 2 || Math.abs(da / dw - 1) <= 0.15) return;
    if (wall - this.bornAt < 6 || wall - this.stateChangedAt < 3 || wall - this.visChangedAt < 3) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    this.hiccups.push(wall);
  }

  /**
   * Cuatro saltos en un minuto quedan anotados en el registro. No se cambia el buffer por cuenta propia: en un equipo
   * real (PipeWire) el buffer largo subio la latencia de salida de ~0,07 s a ~0,53 s sin eliminar los saltos.
   */
  private noteChoppy(S: Synth): void {
    const wall = performance.now() / 1000;
    this.hiccups = this.hiccups.filter((t) => wall - t < 60);
    if (this.hiccups.length < 4 || wall - this.lastChoppyNote < 60) return;
    this.lastChoppyNote = wall;
    recorder.event(`microcortes del reloj de audio: ${this.hiccups.length} en 60 s (base ${(S.ctx.baseLatency ?? 0).toFixed(3)} s, salida ${((S.ctx as AudioContext & { outputLatency?: number }).outputLatency ?? 0).toFixed(3)} s)`);
  }

  /** Cambia el tamano de buffer de salida (panel F9) y reconstruye el contexto con el. Se recuerda para la proxima vez. */
  setLatency(hint: AudioContextLatencyCategory | number): void {
    this.latency = hint;
    try {
      if (hint === "playback") localStorage.removeItem(LATENCY_KEY);
      else localStorage.setItem(LATENCY_KEY, String(hint));
    } catch { /* sin almacenamiento */ }
    recorder.event(`buffer elegido: ${hint}`);
    this.lastRebuild = -100;
    this.rebuild(`buffer de salida cambiado a ${hint}`);
  }

  /** Estado del audio para depuracion (`__umbral.audio.diag()` con `?debug`). */
  diag(): Record<string, unknown> {
    const S = this.S;
    return {
      state: S?.ctx.state ?? "sin contexto", clock: S ? +S.ctx.currentTime.toFixed(2) : 0,
      baseLatency: S ? +(S.ctx.baseLatency ?? 0).toFixed(4) : 0, live: S?.live ?? 0,
      wantRunning: this.wantRunning, suspended: this.suspended, rebuilds: this.rebuilds, lastReason: this.lastReason,
      peak: +this.lastPeak.toFixed(3), stalledFor: +this.stalledFor.toFixed(1), pending: this.pending.length,
      latency: this.latency, hiccups: this.hiccups.length, heals: this.heals, clockRatio: +this.clockRatio.toFixed(2), quietFor: +this.quietFor.toFixed(1),
      nodes: S?.stats.made ?? 0, params: S?.stats.params ?? 0, baked: S ? bakedReady(S) : 0, log: recorder.recent,
    };
  }

  /** Mide la salida: NaN/Inf o silencio sostenido significan que el grafo se rompio. */
  private meter(dt: number): void {
    const S = this.S;
    if (!S || !this.wantRunning || S.ctx.state !== "running") { this.quietFor = 0; return; }
    if (!this.buf) this.buf = new Float32Array(S.analyser.fftSize) as Float32Array<ArrayBuffer>;
    S.analyser.getFloatTimeDomainData(this.buf);
    let peak = 0, bad = false;
    for (let i = 0; i < this.buf.length; i++) {
      const v = this.buf[i];
      if (!Number.isFinite(v)) { bad = true; break; }
      const a = Math.abs(v);
      if (a > peak) peak = a;
    }
    this.lastPeak = Math.max(peak, this.lastPeak * 0.8);
    if (bad) { this.rebuild("salida con NaN"); return; }
    const audible = !this.muted && this.volume > 0.01;
    // silencios legitimos: ducking previo a un susto, muerte en curso (paso bajo y corte de capas)
    const excused = S.ducked || S.isMuffled || performance.now() / 1000 - this.lastDead < 8;
    if (peak >= QUIET_PEAK) { this.quietFor = 0; this.quietRebuilds = 0; return; }
    this.quietFor = audible && !excused ? this.quietFor + dt : 0;
    // primero se intenta curar (ganancia colapsada); si sigue mudo, se reconstruye (como mucho 3 veces seguidas)
    if (this.quietFor > 3 && !this.quietHealed) { this.quietHealed = true; this.heal(S); }
    else if (this.quietFor > 6 && this.quietRebuilds < 3) { this.quietRebuilds++; this.quietHealed = false; this.rebuild("silencio sostenido"); }
    if (this.quietFor === 0) this.quietHealed = false;
  }

  /** Crea un grafo nuevo (y un AudioContext nuevo) conservando volumen, silencio y tema. Nunca deja el motor sin grafo. */
  private rebuild(reason: string): void {
    const now = typeof performance !== "undefined" ? performance.now() / 1000 : 0;
    if (now - this.lastRebuild < 8 || now - this.lastFail < 1) return;
    // el contexto nuevo se crea primero: si el navegador se niega, el motor sigue como estaba y se reintenta en 1 s
    let next: Synth;
    try { next = new Synth(this.factory?.(), { latency: this.latency }); } catch (e) {
      this.lastFail = now;
      recorder.event(`reconstruccion fallida (${reason}): ${String((e as Error)?.message ?? e)}`);
      return;
    }
    this.lastRebuild = now;
    console.warn(`[audio] reiniciando: ${reason}`);
    recorder.event(`reconstruir: ${reason}`);
    this.rebuilds++; this.lastReason = reason;
    this.clockWall = 0; this.stalledFor = 0; this.notRunningFor = 0;
    const old = this.S;
    this.ambience = null; this.drone = null; this.siren = null; this.dread = null;
    this.bed?.dispose(); this.bed = null;
    for (const v of this.voices.values()) { try { v.dispose(); } catch { /* ya parado */ } }
    this.voices.clear();
    if (old) { try { old.removeMuffle(); void old.ctx.close().catch(() => {}); } catch { /* ya cerrado */ } }
    this.quietFor = 0; this.pending = []; this.buf = null; this.lastPeak = 0;
    this.adopt(next);
    this.apply();
    this.onStatus?.("Audio reiniciado");
  }

  private startLayers(): void {
    const S = this.S!;
    const ta = THEME_AUDIO[this.theme];
    S.setReverb(ta.reverbSeconds, ta.reverbDamp);
    this.ambience = new Ambience(S, this.theme);
    this.drone = new Drone(S, ta.droneRoot);
    this.siren = new Siren(S);
    this.dread = new Dread(S);
    this.bed = new MenuBed(S, this.bedOn);
  }

  /** Ambiente del menu: encendido en menu y ficha de nivel, apagado en partida. */
  setMenuBed(on: boolean): void {
    this.bedOn = on;
    this.bed?.set(on);
  }

  setVolume(v: number): void { this.volume = v; this.S?.setVolume(v); }
  setMuted(m: boolean): void { this.muted = m; this.S?.setMuted(m); }

  setTheme(theme: ThemeId): void {
    this.theme = theme;
    const S = this.S;
    if (!S) return;
    this.ambience?.stop(1.5);
    this.drone?.dispose();
    const ta = THEME_AUDIO[theme];
    S.setReverb(ta.reverbSeconds, ta.reverbDamp);
    this.ambience = new Ambience(S, theme);
    this.drone = new Drone(S, ta.droneRoot);
  }

  update(f: AudioFrame): void {
    const S = this.S;
    if (!S || this.suspended) return;
    if (!this.assumeRunning && S.ctx.state !== "running") { this.kick(); return; }
    S.setListener(f.listener.x, f.listener.y, f.listener.z, f.listener.fx, f.listener.fy, f.listener.fz);
    this.ambience?.update(f.dt);
    this.ambience?.setDark(f.darkness);
    this.drone?.update(f.tension);
    this.siren?.update(f.dt, { progress: f.progress, chasing: f.chasing, tension: f.tension, powered: f.powered, powerLow: f.powerLow });
    // durante la muerte se corta todo lo organico: el silencio previo al grito debe ser real
    if (f.dead) this.lastDead = performance.now() / 1000;
    else {
      this.dread?.update({ dt: f.dt, tension: f.tension, chasing: f.chasing, intensity: f.dread * (1 + f.darkness * 1.2), listener: { x: f.listener.x, z: f.listener.z, fx: f.listener.fx, fz: f.listener.fz } });
      this.breath.update(S, f.dt, {
        exertion: f.exertion, tension: f.tension, running: f.running, exhausted: f.exhausted,
        hidden: f.hidden, hiddenNearGhost: f.hiddenNearGhost, holding: f.holding,
      });
      if (f.exhausted) {
        S.duck(0.28, 0.45);
      }
    }
    // suenan hasta los 3 fantasmas mas cercanos con espacializacion HRTF, oclusion y escucha agudizada al esconderse
    const near = f.ghosts.length > 3 ? [...f.ghosts].sort((x, y) => x.dist - y.dist).slice(0, 3) : f.ghosts;
    for (const g of near) {
      let v = this.voices.get(g.kind);
      if (!v) { v = new GhostVoice(S, g.kind); this.voices.set(g.kind, v); }
      v.update(f.dt, g, f.tension, !!f.hidden);
    }
  }

  /** Ejecuta un efecto aplicando su ajuste de mezcla (ver MIX). */
  private with(fn: (S: Synth) => void, mix = 1): void {
    const S = this.S;
    if (!S) return;
    if (!this.assumeRunning && S.ctx.state !== "running") {
      // contexto parado por el navegador: se intenta reanudar y el efecto espera un instante
      if (this.wantRunning && this.pending.length < 8) { this.pending.push({ fn, mix, t: performance.now() }); this.kick(); }
      return;
    }
    S.trim = mix;
    try { fn(S); } finally { S.trim = 1; }
  }

  playDot(streak: number): void { this.with((S) => fx.waka(S, streak), MIX.waka); }
  playPellet(): void { this.with((S) => fx.pellet(S), MIX.pellet); }
  playPowerEnd(): void { this.with((S) => fx.powerEnd(S)); }
  playGhostEaten(combo: number): void { this.with((S) => fx.ghostEaten(S, combo), MIX.ghostEaten); }
  playFruitSpawn(): void { this.with((S) => fx.fruitSpawn(S)); }
  playFruit(): void { this.with((S) => fx.fruitEaten(S), MIX.fruit); }
  playStep(running: boolean): void { this.with((S) => fx.step(S, running), MIX.step); }
  playExhausted(): void {
    this.with((S) => {
      S.duck(0.24, 2.6);
      S.muffle(1050, 0.18, 1.5, 1.2);
      this.breath.gasp(S);
      fx.heartbeat(S, 1.0);
    }, MIX.pant);
  }
  playRecovered(): void { this.with((S) => this.breath.sigh(S)); }
  playBatteryDead(): void { this.with((S) => fx.batteryDead(S)); }
  playFlashlight(on: boolean): void { this.with((S) => fx.flashlight(S, on), MIX.flashlight); }
  playExitUnlocked(): void { this.with((S) => fx.exitUnlocked(S)); }
  playLevelComplete(): void { this.with((S) => fx.levelComplete(S)); }
  playExtraLife(): void { this.with((S) => fx.extraLife(S)); }
  playWake(kind: number, startled: boolean): void { this.with((S) => fx.wake(S, kind, startled), MIX.wake); }
  playStartle(kind: number): void { this.with((S) => fx.startle(S, kind)); }
  playFreeze(frozen: boolean): void { this.with((S) => fx.freeze(S, frozen)); }
  playBite(): void { this.with((S) => fx.bite(S), MIX.bite); }
  playPing(): void { this.with((S) => fx.ping(S)); }
  playWaveChange(chase: boolean): void { this.with((S) => fx.waveChange(S, chase)); }
  playWrap(): void { this.with((S) => fx.wrap(S)); }
  playDeathScream(kind: FaceKind, gain = 1): void { this.with((S) => fx.deathScream(S, kind, gain), MIX.scream); }
  playGameOver(): void { this.with((S) => fx.gameOver(S)); }
  playUiClick(): void { this.with((S) => fx.uiClick(S)); }
  playStinger(strength: number): void { this.with((S) => fx.stinger(S, strength)); }
  playBang(x: number, y: number, z: number): void { this.with((S) => fx.bang(S, x, y, z)); }
  playWhisper(x: number, y: number, z: number): void { this.with((S) => fx.whisper(S, x, y, z)); }
  playFootsteps(x: number, y: number, z: number): void { this.with((S) => fx.footsteps(S, x, y, z)); }
  playBeacon(x: number, y: number, z: number): void { this.with((S) => fx.beacon(S, x, y, z), MIX.hide); }
  playBlackout(on: boolean): void { this.with((S) => fx.blackout(S, on)); }
  playScreamerFlash(strength = 1): void { this.with((S) => fx.screamerFlash(S, strength), MIX.screamerFlash); }
  duck(level: number, secs: number): void { this.S?.duck(level, secs); }
  playPickup(): void { this.with((S) => fx.pickup(S), MIX.pickup); }
  playSwitch(): void { this.with((S) => fx.switchOn(S), MIX.switchOn); }
  playHide(inside: boolean): void { this.with((S) => fx.hide(S, inside), MIX.hide); }
  playGasp(): void { this.with((S) => fx.gasp(S), MIX.hide); }
  playHeartbeat(strength: number): void { this.with((S) => fx.heartbeat(S, strength), MIX.heartbeat); }
  playScareHit(strength: number): void { this.with((S) => fx.scareHit(S, strength), MIX.scareHit); }
  playDread(kind: string): void {
    this.with((S) => this.dread?.play(kind as DreadKind, { dt: 0, tension: 0, chasing: false, intensity: 1, listener: { x: S.ctx.listener.positionX?.value ?? 0, z: S.ctx.listener.positionZ?.value ?? 0, fx: S.ctx.listener.forwardX?.value ?? 0, fz: S.ctx.listener.forwardZ?.value ?? -1 } }), MIX.dread);
  }
  playSteamWarning(x: number, y: number, z: number): void { this.with((S) => fx.steamWarning(S, x, y, z), 0.55); }
  playSteamBurst(x: number, y: number, z: number): void { this.with((S) => fx.steamBurst(S, x, y, z), 0.65); }
  playSteamCough(): void { this.with((S) => fx.steamCough(S), 0.65); }
  playBreakerTrip(x: number, y: number, z: number): void { this.with((S) => fx.breakerTrip(S, x, y, z), 0.7); }
  playMazeShift(x: number, y: number, z: number): void { this.with((S) => fx.mazeShift(S, x, y, z), 0.65); }

  dispose(): void {
    this.unbindEarlyGestures();
    this.stopWatching();
    this.wantRunning = false;
    this.bed?.dispose();
    this.bed = null;
    for (const v of this.voices.values()) v.dispose();
    this.voices.clear();
    this.ambience?.stop(0.1);
    this.drone?.dispose();
    this.siren?.dispose();
    this.dread?.dispose();
    const S = this.S;
    this.S = null;
    if (S) void S.ctx.close();
  }
}

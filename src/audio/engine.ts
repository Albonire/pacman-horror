// Motor de audio de UMBRAL: implementa GameAudio con Web Audio (100% procedural).

import type { ThemeId } from "../config/campaign";
import { Ambience, THEME_AUDIO } from "./ambience";
import { Dread, type DreadKind } from "./dread";
import { Drone, Siren } from "./music";
import * as fx from "./sfx";
import { Synth } from "./synth";
import type { AudioFrame, GameAudio } from "./types";
import { BreathEngine, GhostVoice } from "./voices";

/**
 * Tabla de mezcla: factor aplicado a cada efecto. Calibrada midiendo picos con un OfflineAudioContext
 * (el compresor del bus maestro aporta ganancia de compensacion, asi que los transitorios suben mucho).
 */
const MIX = {
  waka: 0.4, step: 0.6, bite: 0.26, ghostEaten: 0.32, pellet: 0.5, heartbeat: 0.75, scream: 0.4,
  screamerFlash: 0.3, scareHit: 0.4, dread: 0.6, flashlight: 0.6, fruit: 0.5, wake: 0.6, pant: 1.1,
} as const;

export class HorrorAudio implements GameAudio {
  private S: Synth | null = null;
  private volume = 0.8;
  private muted = false;
  private theme: ThemeId = "offices";
  private ambience: Ambience | null = null;
  private drone: Drone | null = null;
  private siren: Siren | null = null;
  private dread: Dread | null = null;
  private breath = new BreathEngine();
  private voices = new Map<number, GhostVoice>();
  private suspended = false;
  /** Estado que queremos: el contexto debe estar sonando salvo durante la pausa. */
  private wantRunning = false;
  private chain: Promise<void> = Promise.resolve();
  private watchdog: number | null = null;
  private meterTimer: number | null = null;
  private silentFor = 0;
  private lastRebuild = -100;
  private pending: { fn: (S: Synth) => void; mix: number; t: number }[] = [];
  private buf: Float32Array<ArrayBuffer> | null = null;
  private gestureBound = false;
  onStatus?: (msg: string) => void;
  lastPeak = 0;

  /** `factory` y `assumeRunning` permiten pruebas con un OfflineAudioContext. */
  constructor(private factory?: () => AudioContext, private assumeRunning = false) {}

  /** Debe llamarse desde un gesto del usuario (clic/tecla). */
  resume(): void {
    if (!this.S) {
      try { this.S = new Synth(this.factory?.()); } catch { return; }
      this.S.setVolume(this.volume);
      this.S.setMuted(this.muted);
      this.startLayers();
      this.startWatching();
    }
    this.suspended = false;
    this.wantRunning = true;
    this.apply();
  }

  suspend(): void {
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
      try {
        if (this.wantRunning) { if (ctx.state !== "running") await ctx.resume(); }
        else if (ctx.state === "running") await ctx.suspend();
      } catch { /* sin gesto del usuario: el vigilante reintentara */ }
    });
  }

  private startWatching(): void {
    if (this.assumeRunning || typeof window === "undefined") return;
    if (this.watchdog === null) this.watchdog = window.setInterval(() => this.watch(), 1000);
    if (this.meterTimer === null) this.meterTimer = window.setInterval(() => this.meter(0.5), 500);
    if (!this.gestureBound) {
      this.gestureBound = true;
      for (const ev of ["keydown", "pointerdown", "focus"]) window.addEventListener(ev, this.kick, true);
      document.addEventListener("visibilitychange", this.kick);
      document.addEventListener("pointerlockchange", this.kick);
    }
  }

  private stopWatching(): void {
    if (this.watchdog !== null) window.clearInterval(this.watchdog);
    if (this.meterTimer !== null) window.clearInterval(this.meterTimer);
    this.watchdog = null; this.meterTimer = null;
    if (this.gestureBound) {
      this.gestureBound = false;
      for (const ev of ["keydown", "pointerdown", "focus"]) window.removeEventListener(ev, this.kick, true);
      document.removeEventListener("visibilitychange", this.kick);
      document.removeEventListener("pointerlockchange", this.kick);
    }
  }

  /** Cualquier gesto del usuario es una oportunidad para reanudar un contexto que el navegador haya detenido. */
  private kick = (): void => {
    if (this.wantRunning && this.S && this.S.ctx.state !== "running") this.apply();
  };

  /** Vigilante (1 Hz): reanuda un contexto detenido por el navegador y reconstruye uno cerrado. */
  private watch(): void {
    const S = this.S;
    if (!S || !this.wantRunning) return;
    const st = S.ctx.state as string;
    if (st === "closed") { this.rebuild("el contexto se cerro"); return; }
    if (st !== "running") { this.apply(); return; }
    // vacia los efectos que llegaron mientras el contexto estaba parado (si no son muy viejos)
    const now = performance.now();
    const todo = this.pending.splice(0);
    for (const e of todo) if (now - e.t < 1500) this.with(e.fn, e.mix);
  }

  /** Mide la salida: NaN/Inf o silencio absoluto sostenido significan que el grafo se rompio. */
  private meter(dt: number): void {
    const S = this.S;
    if (!S || !this.wantRunning || S.ctx.state !== "running") { this.silentFor = 0; return; }
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
    const audible = !this.muted && this.volume > 0.01;
    this.silentFor = audible && peak === 0 ? this.silentFor + dt : 0;
    if (bad) this.rebuild("salida con NaN");
    else if (this.silentFor > 4) this.rebuild("silencio absoluto");
  }

  /** Crea un grafo nuevo (y un AudioContext nuevo) conservando volumen, silencio y tema. */
  private rebuild(reason: string): void {
    const now = typeof performance !== "undefined" ? performance.now() / 1000 : 0;
    if (now - this.lastRebuild < 8) return;
    this.lastRebuild = now;
    console.warn(`[audio] reiniciando: ${reason}`);
    const old = this.S;
    this.S = null;
    this.ambience = null; this.drone = null; this.siren = null; this.dread = null;
    for (const v of this.voices.values()) { try { v.dispose(); } catch { /* ya parado */ } }
    this.voices.clear();
    if (old) { try { void old.ctx.close(); } catch { /* ya cerrado */ } }
    this.silentFor = 0; this.pending = []; this.buf = null; this.lastPeak = 0;
    try { this.S = new Synth(this.factory?.()); } catch { return; }
    this.S.setVolume(this.volume);
    this.S.setMuted(this.muted);
    this.startLayers();
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
    this.drone?.update(f.tension);
    this.siren?.update(f.dt, { progress: f.progress, chasing: f.chasing, tension: f.tension, powered: f.powered, powerLow: f.powerLow });
    this.dread?.update({ dt: f.dt, tension: f.tension, chasing: f.chasing, intensity: f.dread, listener: { x: f.listener.x, z: f.listener.z, fx: f.listener.fx, fz: f.listener.fz } });
    this.breath.update(S, f.dt, { exertion: f.exertion, tension: f.tension, running: f.running, exhausted: f.exhausted });
    for (const g of f.ghosts) {
      let v = this.voices.get(g.kind);
      if (!v) { v = new GhostVoice(S, g.kind); this.voices.set(g.kind, v); }
      v.update(f.dt, g, f.tension);
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
  playExhausted(): void { this.with((S) => this.breath.gasp(S), MIX.pant); }
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
  playDeathScream(kind: number): void { this.with((S) => fx.deathScream(S, kind), MIX.scream); }
  playGameOver(): void { this.with((S) => fx.gameOver(S)); }
  playUiClick(): void { this.with((S) => fx.uiClick(S)); }
  playStinger(strength: number): void { this.with((S) => fx.stinger(S, strength)); }
  playBang(x: number, y: number, z: number): void { this.with((S) => fx.bang(S, x, y, z)); }
  playWhisper(x: number, y: number, z: number): void { this.with((S) => fx.whisper(S, x, y, z)); }
  playFootsteps(x: number, y: number, z: number): void { this.with((S) => fx.footsteps(S, x, y, z)); }
  playBlackout(on: boolean): void { this.with((S) => fx.blackout(S, on)); }
  playScreamerFlash(): void { this.with((S) => fx.screamerFlash(S), MIX.screamerFlash); }
  duck(level: number, secs: number): void { this.S?.duck(level, secs); }
  playHeartbeat(strength: number): void { this.with((S) => fx.heartbeat(S, strength), MIX.heartbeat); }
  playScareHit(strength: number): void { this.with((S) => fx.scareHit(S, strength), MIX.scareHit); }
  playDread(kind: string): void {
    this.with((S) => this.dread?.play(kind as DreadKind, { dt: 0, tension: 0, chasing: false, intensity: 1, listener: { x: S.ctx.listener.positionX?.value ?? 0, z: S.ctx.listener.positionZ?.value ?? 0, fx: S.ctx.listener.forwardX?.value ?? 0, fz: S.ctx.listener.forwardZ?.value ?? -1 } }), MIX.dread);
  }

  dispose(): void {
    this.stopWatching();
    this.wantRunning = false;
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

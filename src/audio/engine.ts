// Motor de audio de UMBRAL: implementa GameAudio con Web Audio (100% procedural).

import type { ThemeId } from "../config/campaign";
import { Ambience, THEME_AUDIO } from "./ambience";
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
  waka: 0.4, step: 0.6, bite: 0.26, ghostEaten: 0.32, pellet: 0.5, heartbeat: 0.75, scream: 0.55,
  screamerFlash: 0.3, flashlight: 0.6, fruit: 0.5, wake: 0.6, pant: 1.1,
} as const;

export class HorrorAudio implements GameAudio {
  private S: Synth | null = null;
  private volume = 0.8;
  private muted = false;
  private theme: ThemeId = "offices";
  private ambience: Ambience | null = null;
  private drone: Drone | null = null;
  private siren: Siren | null = null;
  private breath = new BreathEngine();
  private voices = new Map<number, GhostVoice>();
  private suspended = false;

  /** `factory` y `assumeRunning` permiten pruebas con un OfflineAudioContext. */
  constructor(private factory?: () => AudioContext, private assumeRunning = false) {}

  /** Debe llamarse desde un gesto del usuario (clic/tecla). */
  resume(): void {
    if (!this.S) {
      try { this.S = new Synth(this.factory?.()); } catch { return; }
      this.S.setVolume(this.volume);
      this.S.setMuted(this.muted);
      this.startLayers();
    }
    this.suspended = false;
    if (!this.assumeRunning && this.S.ctx.state !== "running") void this.S.ctx.resume();
  }

  suspend(): void {
    this.suspended = true;
    if (this.S && this.S.ctx.state === "running") void this.S.ctx.suspend();
  }

  private startLayers(): void {
    const S = this.S!;
    const ta = THEME_AUDIO[this.theme];
    S.setReverb(ta.reverbSeconds, ta.reverbDamp);
    this.ambience = new Ambience(S, this.theme);
    this.drone = new Drone(S, ta.droneRoot);
    this.siren = new Siren(S);
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
    if (!S || this.suspended || (!this.assumeRunning && S.ctx.state !== "running")) return;
    S.setListener(f.listener.x, f.listener.y, f.listener.z, f.listener.fx, f.listener.fy, f.listener.fz);
    this.ambience?.update(f.dt);
    this.drone?.update(f.tension);
    this.siren?.update(f.dt, { progress: f.progress, chasing: f.chasing, tension: f.tension, powered: f.powered, powerLow: f.powerLow });
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
    if (!S || (!this.assumeRunning && S.ctx.state !== "running")) return;
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
  playHeartbeat(strength: number): void { this.with((S) => fx.heartbeat(S, strength), MIX.heartbeat); }

  dispose(): void {
    for (const v of this.voices.values()) v.dispose();
    this.voices.clear();
    this.ambience?.stop(0.1);
    this.drone?.dispose();
    this.siren?.dispose();
    const S = this.S;
    this.S = null;
    if (S) void S.ctx.close();
  }
}

// Voces continuas: la respiracion de Pac-Man y las voces posicionales de cada fantasma.

import type { AudioGhost } from "./types";
import type { Synth } from "./synth";

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const rnd = Math.random;

/**
 * Respiracion de Pac-Man. Ritmo y fuerza dependen del esfuerzo, el miedo y el agotamiento:
 * respiracion lenta y hueca en calma, jadeo humedo y voceado al correr, estertor al agotarse.
 */
export class BreathEngine {
  private timer = 1.2;
  private level = 0.1;

  update(S: Synth, dt: number, st: { exertion: number; tension: number; running: boolean; exhausted: boolean; hidden?: boolean; hiddenNearGhost?: boolean }): void {
    if (st.hidden) {
      const fear = st.hiddenNearGhost ? 0.95 : clamp(st.tension * 0.8 + 0.35, 0.3, 0.9);
      this.level += (fear - this.level) * Math.min(1, dt * 2.5);
      this.timer -= dt;
      if (this.timer <= 0) {
        this.breathLocker(S, this.level, !!st.hiddenNearGhost);
        this.timer = lerp(2.8, 1.3, this.level) * (0.85 + rnd() * 0.25);
      }
      return;
    }
    const target = clamp(0.08 + st.exertion * 0.85 + st.tension * 0.4 + (st.running ? 0.25 : 0) + (st.exhausted ? 0.3 : 0), 0, 1);
    this.level += (target - this.level) * Math.min(1, dt * 1.5);
    this.timer -= dt;
    if (this.timer <= 0) {
      this.breath(S, this.level, st.exhausted);
      this.timer = lerp(4.6, 0.5, this.level) * (0.88 + rnd() * 0.24);
    }
  }

  breathLocker(S: Synth, i: number, nearGhost: boolean): void {
    const dur = nearGhost ? 0.75 : 1.15;
    const vol = lerp(0.05, 0.16, i);
    const t = S.now;
    // inhalacion sorda y amortiguada por el metal
    S.noise({ kind: "pink", t, dur: dur * 0.45, a: 0.15, vol: vol * 0.65, bp: 550, bp1: 1050, q: 2.2, dest: S.voice, send: 0.18 });
    // exhalacion contenida
    const te = t + dur * 0.4;
    S.noise({ kind: "pink", t: te, dur: dur * 0.55, a: 0.1, vol: vol * 0.85, bp: 800, bp1: 420, q: 2.5, dest: S.voice, send: 0.22 });
    if (nearGhost) {
      // estertor asfixiado cuando el fantasma pasa junto al armario
      S.tone({ type: "sawtooth", t, f0: 165, f1: 130, dur: dur * 0.35, a: 0.1, vol: vol * 0.2, lp: 420, dest: S.voice });
    }
  }

  breath(S: Synth, i: number, exhausted: boolean): void {
    const inh = lerp(1.05, 0.2, i), exh = lerp(1.6, 0.3, i);
    const vol = lerp(0.045, 0.24, i) * (exhausted ? 1.4 : 1);
    const t = S.now;
    // inhalacion: ruido rosa con paso banda ascendente + formante agudo + algo de voz
    S.noise({ kind: "pink", t, dur: inh, a: inh * 0.55, vol, bp: 820, bp1: 1750, q: 1.1, dest: S.voice, send: 0.08 });
    S.noise({ kind: "pink", t, dur: inh, a: inh * 0.55, vol: vol * 0.35, bp: 2600, bp1: 3300, q: 3, dest: S.voice });
    if (i > 0.45) S.tone({ type: "sawtooth", t, f0: 150, f1: 205, dur: inh, a: inh * 0.5, vol: vol * 0.16, lp: 700, dest: S.voice });
    // exhalacion
    const te = t + inh * 0.9;
    S.noise({ kind: "pink", t: te, dur: exh, a: exh * 0.2, vol: vol * 1.15, bp: 1150, bp1: 520, q: 1.4, dest: S.voice, send: 0.1 });
    if (i > 0.3) S.tone({ type: "sawtooth", t: te, f0: 125, f1: 90, dur: exh, a: exh * 0.2, vol: vol * 0.28, lp: 520, dest: S.voice });
    if (exhausted) S.tone({ f0: 2150, f1: 1650, t, dur: inh * 0.9, a: inh * 0.4, vol: 0.011, dest: S.voice });
  }

  gasp(S: Synth): void {
    const t = S.now;
    S.noise({ kind: "pink", t, dur: 0.55, a: 0.3, vol: 0.34, bp: 700, bp1: 2000, q: 1.0, dest: S.voice, send: 0.2 });
    S.noise({ kind: "pink", t, dur: 0.55, a: 0.3, vol: 0.12, bp: 2800, bp1: 3600, q: 3, dest: S.voice });
    S.tone({ f0: 2300, f1: 1700, t, dur: 0.6, a: 0.3, vol: 0.02, dest: S.voice });
    S.tone({ type: "sawtooth", f0: 170, f1: 240, t, dur: 0.55, a: 0.3, vol: 0.06, lp: 800, dest: S.voice });
    this.timer = Math.max(this.timer, 0.9);
  }

  sigh(S: Synth): void {
    const t = S.now;
    S.noise({ kind: "pink", t, dur: 1.5, a: 0.25, vol: 0.14, bp: 1000, bp1: 380, q: 1.2, dest: S.voice, send: 0.2 });
    S.tone({ type: "sawtooth", f0: 120, f1: 84, t, dur: 1.4, a: 0.25, vol: 0.05, lp: 500, dest: S.voice });
  }
}

/** Voz posicional de un fantasma: silenciada durante el acecho (emboscada sin aviso acustico). */
export class GhostVoice {
  private out: GainNode;
  private panner: PannerNode;

  constructor(private S: Synth, readonly kind: number) {
    const ctx = S.ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.panner = S.panner(0, 1, 0);
    this.out.connect(this.panner);
    this.panner.connect(S.sfx);
  }

  update(_dt: number, g: AudioGhost, _tension: number): void {
    // Los fantasmas acechan en absoluto silencio (emboscada sin radar acustico previo)
    this.out.gain.value = 0;
    this.S.setPannerPos(this.panner, g.x, g.y, g.z);
  }

  dispose(): void {
    this.out.disconnect();
    this.panner.disconnect();
  }
}

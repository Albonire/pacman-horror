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

  update(S: Synth, dt: number, st: { exertion: number; tension: number; running: boolean; exhausted: boolean; hidden?: boolean; hiddenNearGhost?: boolean; holding?: boolean }): void {
    if (st.hidden) {
      if (st.holding) { this.timer = 1.2; return; } // contiene el aliento: ni un soplo
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
/**
 * Voz posicional de un fantasma. Son criaturas de sigilo: cuando el fantasma "hace ruido" se oyen arrastrar los
 * pies, un estertor y, muy cerca, un gruñido grave; cuando "calla" (`g.silent`) no suena nada y llega sin aviso.
 * El cambio entre ambos estados es gradual para que no delate el momento exacto.
 */
export class GhostVoice {
  private out: GainNode;
  private panner: PannerNode;
  private loud = 0;
  private stepT = 0.4;
  private breathT = 1.8;
  private growlT = 0;

  constructor(private S: Synth, readonly kind: number) {
    const ctx = S.ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.panner = S.panner(0, 1, 0);
    this.out.connect(this.panner);
    this.panner.connect(S.sfx);
  }

  update(dt: number, g: AudioGhost, _tension: number): void {
    const S = this.S;
    // lejos y en silencio no hay nada que mover: ahorra automatizacion de parametros
    if (g.dist > 16 && this.loud < 0.08) { this.loud = 0; return; }
    S.setPannerPos(this.panner, g.x, g.y, g.z);
    const hunting = (g.mode === "chase" || g.mode === "scatter") && !g.frozen;
    const want = hunting && !g.silent ? 1 : 0;
    this.loud += (want - this.loud) * Math.min(1, dt * 2.2);
    if (this.loud < 0.08 || g.dist > 16) return;
    const prox = clamp(1 - g.dist / 16, 0, 1);
    const vol = this.loud * (0.12 + prox * prox * 0.88);
    const dest = this.panner;

    // pasos pesados arrastrados: mas seguidos cuanto mas cerca (y mas rapido se mueve)
    this.stepT -= dt;
    if (this.stepT <= 0) {
      this.stepT = lerp(1.15, 0.5, prox) * (0.9 + rnd() * 0.25);
      S.noise({ kind: "brown", lp: 520, hp: 40, dur: 0.16, a: 0.004, vol: 0.5 * vol, dest, send: 0.12 });
      S.tone({ f0: 70, f1: 38, dur: 0.14, a: 0.003, vol: 0.34 * vol, lp: 220, dest });
      // arrastre humedo entre paso y paso
      S.noise({ kind: "pink", bp: 900, bp1: 350, q: 1.4, dur: 0.22, a: 0.05, vol: 0.12 * vol, t: S.now + 0.12, dest, send: 0.18 });
    }

    // estertor lento cuando esta a unos 10 u o menos
    if (g.dist < 10) {
      this.breathT -= dt;
      if (this.breathT <= 0) {
        this.breathT = lerp(3.4, 1.6, prox) * (0.9 + rnd() * 0.3);
        S.noise({ kind: "pink", bp: 420, bp1: 1100, q: 2.2, dur: 0.9, a: 0.35, vol: 0.22 * vol, dest, send: 0.3 });
        S.noise({ kind: "pink", bp: 900, bp1: 360, q: 2.4, dur: 0.8, a: 0.12, vol: 0.2 * vol, t: S.now + 0.85, dest, send: 0.3 });
      }
    }

    // gruñido grave muy cerca
    if (g.dist < 5) {
      this.growlT -= dt;
      if (this.growlT <= 0) {
        this.growlT = 2.4 + rnd() * 1.6;
        S.formantVoice({ t: S.now, f0: 62, f1: 44, dur: 1.1, vol: 0.34 * vol, a: 0.15, formants: [[260, 3.5, 1.4], [760, 4.5, 1.0]], dist: true, vibRate: 28, vibDepth: 70, noiseMix: 0.3, dest });
      }
    }
  }

  dispose(): void {
    this.out.disconnect();
    this.panner.disconnect();
  }
}

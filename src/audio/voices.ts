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

  update(S: Synth, dt: number, st: { exertion: number; tension: number; running: boolean; exhausted: boolean }): void {
    const target = clamp(0.08 + st.exertion * 0.85 + st.tension * 0.4 + (st.running ? 0.25 : 0) + (st.exhausted ? 0.3 : 0), 0, 1);
    this.level += (target - this.level) * Math.min(1, dt * 1.5);
    this.timer -= dt;
    if (this.timer <= 0) {
      this.breath(S, this.level, st.exhausted);
      this.timer = lerp(4.6, 0.5, this.level) * (0.88 + rnd() * 0.24);
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

/** Ganancia por tipo, calibrada midiendo RMS aislado a 6 u (objetivo ~0,03 en persecucion). */
const KIND_GAIN = [1, 4, 5.5, 2];

/** Voz posicional de un fantasma: cada uno tiene una firma sonora propia. */
export class GhostVoice {
  private out: GainNode;
  private panner: PannerNode;
  private nodes: AudioScheduledSourceNode[] = [];
  private timer = 0;
  private crackle: GainNode | null = null;
  private lfoGain: GainNode | null = null;

  constructor(private S: Synth, readonly kind: number) {
    const ctx = S.ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.panner = S.panner(0, 1, 0);
    this.out.connect(this.panner);
    this.panner.connect(S.sfx);
    const send = ctx.createGain(); send.gain.value = 0.35;
    this.panner.connect(send); send.connect(S.reverbSend);

    const start = (n: AudioScheduledSourceNode) => { n.start(); this.nodes.push(n); };
    if (kind === 0) {
      // gruñido grave que respira
      const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = 52;
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 190;
      const g = ctx.createGain(); g.gain.value = 0.5;
      o.connect(lp); lp.connect(g); g.connect(this.out);
      const n = S.noiseSource("brown"); const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 240; bp.Q.value = 1.2;
      const ng = ctx.createGain(); ng.gain.value = 0.7;
      n.connect(bp); bp.connect(ng); ng.connect(this.out);
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.55;
      const lg = ctx.createGain(); lg.gain.value = 0.3; lfo.connect(lg); lg.connect(g.gain); lg.connect(ng.gain);
      this.lfoGain = lg;
      start(o); start(n); start(lfo);
    } else if (kind === 2) {
      // acufeno
      for (const f of [3150, 3188]) {
        const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = f;
        const g = ctx.createGain(); g.gain.value = 0.05;
        o.connect(g); g.connect(this.out); start(o);
      }
      const n = S.noiseSource("white"); const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 6500;
      const ng = ctx.createGain(); ng.gain.value = 0.05;
      n.connect(hp); hp.connect(ng); ng.connect(this.out); start(n);
    } else if (kind === 3) {
      // estatica que crepita
      const n = S.noiseSource("white"); const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1700; bp.Q.value = 0.6;
      const g = ctx.createGain(); g.gain.value = 0.4;
      n.connect(bp); bp.connect(g); g.connect(this.out);
      this.crackle = g; start(n);
    } else {
      // Emboscadora: susurro de fondo (la caja de musica se programa en update)
      const n = S.noiseSource("pink"); const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 2300; bp.Q.value = 3;
      const g = ctx.createGain(); g.gain.value = 0.05;
      n.connect(bp); bp.connect(g); g.connect(this.out); start(n);
    }
  }

  update(dt: number, g: AudioGhost, tension: number): void {
    const S = this.S;
    const t = S.now;
    const dist = g.dist;
    let base = 0;
    switch (g.mode) {
      case "dormant": base = g.startled ? 0.75 : 0.2; break;
      case "scatter": base = 0.5; break;
      case "chase": base = 0.85 + tension * 0.2; break;
      case "frightened": base = 0.3; break;
      default: base = 0;
    }
    if (g.frozen) base *= this.kind === 3 ? 1.2 : 0.4;
    const df = Math.pow(clamp(1 - dist / 30, 0, 1), 1.5);
    this.out.gain.setTargetAtTime(base * df * 0.9 * KIND_GAIN[this.kind], t, 0.12);
    S.setPannerPos(this.panner, g.x, g.y, g.z);
    if (this.lfoGain) this.lfoGain.gain.setTargetAtTime(g.mode === "chase" ? 0.45 : 0.25, t, 0.3);

    this.timer -= dt;
    if (this.timer > 0 || base * df < 0.02) return;
    const k = this.kind;
    if (k === 1 && g.mode !== "eaten") {
      // caja de musica en menor
      const scale = [659.25, 783.99, 880, 987.77, 1174.66, 1318.5];
      const f = scale[Math.floor(rnd() * scale.length)];
      S.tone({ f0: f, dur: 1.4, vol: 0.5, a: 0.004, dest: this.out });
      S.tone({ f0: f * 2.76, dur: 0.7, vol: 0.12, a: 0.003, dest: this.out });
      this.timer = (g.mode === "dormant" ? 1.9 : 0.6) + rnd() * 0.5;
    } else if (k === 3) {
      if (g.frozen) {
        S.tone({ f0: 2200, dur: 0.03, vol: 0.5, dest: this.out });
        this.timer = 0.33;
        if (this.crackle) this.crackle.gain.setTargetAtTime(0.1, t, 0.05);
      } else if (this.crackle) {
        for (let s = 0; s < 4; s++) this.crackle.gain.setValueAtTime(rnd() < 0.55 ? 0.15 + rnd() * 0.85 : 0, t + s * 0.05);
        this.timer = 0.2;
      }
    } else if (k === 0 && g.mode === "chase" && rnd() < 0.4) {
      S.formantVoice({ f0: 90 + rnd() * 30, f1: 60, dur: 0.6, vol: 0.5, formants: [[300, 4, 1], [850, 6, 0.5]], dist: true, vibRate: 24, noiseMix: 0.2, dest: this.out, send: 0.2 });
      this.timer = 1.4 + rnd() * 1.6;
    } else this.timer = 0.4;
  }

  dispose(): void {
    for (const n of this.nodes) { try { n.stop(); } catch { /* ya parado */ } }
    this.out.disconnect(); this.panner.disconnect();
  }
}

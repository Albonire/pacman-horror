// Ambientes sonoros por tema: capas continuas + eventos aleatorios lejanos.

import type { ThemeId } from "../config/campaign";
import type { Synth } from "./synth";

const rnd = Math.random;

export interface ThemeAudio {
  reverbSeconds: number;
  reverbDamp: number;
  droneRoot: number;
}

export const THEME_AUDIO: Record<ThemeId, ThemeAudio> = {
  offices: { reverbSeconds: 1.9, reverbDamp: 0.55, droneRoot: 55 },
  pool: { reverbSeconds: 4.0, reverbDamp: 0.3, droneRoot: 49 },
  arcade: { reverbSeconds: 1.6, reverbDamp: 0.5, droneRoot: 58.3 },
  boiler: { reverbSeconds: 2.8, reverbDamp: 0.6, droneRoot: 46.2 },
  ward: { reverbSeconds: 2.4, reverbDamp: 0.4, droneRoot: 52 },
  stomach: { reverbSeconds: 1.3, reverbDamp: 0.85, droneRoot: 41.2 },
};

export class Ambience {
  private out: GainNode;
  private nodes: AudioScheduledSourceNode[] = [];
  private timer = 3;
  private beat = 0;
  private arpStep = 0;
  private arpT = 0;
  private alive = true;

  constructor(private S: Synth, readonly theme: ThemeId) {
    const ctx = S.ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(S.amb);
    const send = ctx.createGain(); send.gain.value = 0.25; this.out.connect(send); send.connect(S.reverbSend);
    this.out.gain.setTargetAtTime(1, S.now, 0.8);
    this.build();
  }

  private src<T extends AudioScheduledSourceNode>(n: T): T { n.start(); this.nodes.push(n); return n; }

  private osc(type: OscillatorType, f: number, gain: number, lp?: number, bp?: [number, number]): OscillatorNode {
    const ctx = this.S.ctx;
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
    let node: AudioNode = o;
    if (bp) { const b = ctx.createBiquadFilter(); b.type = "bandpass"; b.frequency.value = bp[0]; b.Q.value = bp[1]; node.connect(b); node = b; }
    if (lp) { const l = ctx.createBiquadFilter(); l.type = "lowpass"; l.frequency.value = lp; node.connect(l); node = l; }
    const g = ctx.createGain(); g.gain.value = gain;
    node.connect(g); g.connect(this.out);
    return this.src(o);
  }

  private noiseBed(kind: "white" | "pink" | "brown", gain: number, opts: { lp?: number; hp?: number; bp?: number; q?: number } = {}): GainNode {
    const ctx = this.S.ctx;
    const n = this.S.noiseSource(kind);
    let node: AudioNode = n;
    if (opts.hp) { const f = ctx.createBiquadFilter(); f.type = "highpass"; f.frequency.value = opts.hp; node.connect(f); node = f; }
    if (opts.lp) { const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = opts.lp; node.connect(f); node = f; }
    if (opts.bp) { const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = opts.bp; f.Q.value = opts.q ?? 1; node.connect(f); node = f; }
    const g = ctx.createGain(); g.gain.value = gain;
    node.connect(g); g.connect(this.out);
    this.src(n);
    return g;
  }

  private lfo(target: AudioParam, rate: number, depth: number): void {
    const ctx = this.S.ctx;
    const l = ctx.createOscillator(); l.frequency.value = rate;
    const g = ctx.createGain(); g.gain.value = depth;
    l.connect(g); g.connect(target);
    this.src(l);
  }

  private build(): void {
    switch (this.theme) {
      case "offices": {
        this.osc("sawtooth", 60, 0.1, 420, [180, 3]);
        this.osc("sawtooth", 120.4, 0.05, 700, [360, 4]);
        this.osc("square", 180.2, 0.012, 900, [540, 6]);
        this.noiseBed("brown", 0.5, { lp: 420 });
        const flick = this.noiseBed("white", 0.012, { hp: 5200 });
        this.lfo(flick.gain, 11, 0.01);
        break;
      }
      case "pool": {
        const w = this.noiseBed("pink", 0.2, { bp: 520, q: 0.6 });
        this.lfo(w.gain, 0.17, 0.12);
        const w2 = this.noiseBed("pink", 0.12, { bp: 1500, q: 0.8 });
        this.lfo(w2.gain, 0.23, 0.09);
        this.noiseBed("brown", 0.3, { lp: 200 });
        this.osc("sine", 48, 0.08);
        break;
      }
      case "arcade": {
        this.osc("sawtooth", 100, 0.06, 500, [200, 2]);
        this.noiseBed("brown", 0.35, { lp: 350 });
        this.noiseBed("white", 0.01, { hp: 6000 });
        const crt = this.osc("sine", 2600, 0.004);
        this.lfo(crt.frequency, 0.05, 40);
        break;
      }
      case "boiler": {
        this.noiseBed("brown", 0.85, { lp: 130 });
        const pipe = this.noiseBed("pink", 0.1, { bp: 300, q: 8 });
        this.lfo(pipe.gain, 0.08, 0.08);
        this.osc("sawtooth", 41.2, 0.09, 160);
        break;
      }
      case "ward": {
        this.osc("sine", 100, 0.07);
        this.osc("sine", 200.5, 0.035);
        this.noiseBed("brown", 0.25, { lp: 300 });
        this.noiseBed("white", 0.008, { hp: 7000 });
        break;
      }
      case "stomach": {
        const w = this.noiseBed("brown", 0.9, { lp: 95 });
        this.lfo(w.gain, 0.09, 0.4);
        const g = this.noiseBed("pink", 0.14, { bp: 260, q: 2 });
        this.lfo(g.gain, 0.31, 0.12);
        this.osc("sine", 34, 0.12);
        break;
      }
    }
  }

  update(dt: number): void {
    if (!this.alive) return;
    const S = this.S;
    this.timer -= dt;
    // latido gigante en el estomago
    if (this.theme === "stomach") {
      this.beat -= dt;
      if (this.beat <= 0) {
        this.beat = 1.15;
        S.tone({ f0: 46, f1: 30, dur: 0.35, vol: 0.45, lp: 120, a: 0.02, dest: this.out });
        S.tone({ f0: 40, f1: 28, dur: 0.4, vol: 0.32, lp: 110, a: 0.02, t: S.now + 0.28, dest: this.out });
      }
    }
    // arpegio lejano de maquina arcade averiada
    if (this.theme === "arcade") {
      this.arpT -= dt;
      if (this.arpT <= 0) {
        this.arpT = 0.42 + (rnd() < 0.1 ? 0.4 : 0);
        const scale = [220, 261.6, 329.6, 261.6, 196, 246.9, 329.6, 392];
        const f = scale[this.arpStep++ % scale.length] * (rnd() < 0.05 ? 1.06 : 1);
        S.tone({ type: "square", f0: f, dur: 0.22, vol: 0.012, lp: 1100, dest: this.out, detune: -rnd() * 30, send: 0.5 });
      }
    }
    if (this.theme === "ward") {
      this.beat -= dt;
      if (this.beat <= 0) {
        this.beat = 1.25;
        S.tone({ f0: 880, dur: 0.13, vol: 0.012, dest: this.out, send: 0.3 });
      }
    }
    if (this.timer > 0) return;
    this.timer = 4 + rnd() * 8;
    const r = rnd();
    switch (this.theme) {
      case "offices":
        if (r < 0.35) S.tone({ f0: 480, dur: 0.12, vol: 0.02, dest: this.out, send: 0.8, t: S.now }), S.tone({ f0: 620, dur: 0.12, vol: 0.02, dest: this.out, send: 0.8, t: S.now + 0.18 });
        else if (r < 0.7) S.noise({ kind: "brown", lp: 260, dur: 0.3, vol: 0.18, dest: this.out, send: 0.6 });
        else S.formantVoice({ f0: 85, f1: 70, dur: 0.9, vol: 0.05, formants: [[300, 5, 1], [800, 6, 0.4]], dest: this.out, send: 0.6, noiseMix: 0.3 });
        break;
      case "pool": {
        for (let i = 0; i < 1 + Math.floor(rnd() * 3); i++) S.tone({ f0: 1500 + rnd() * 700, f1: 600, dur: 0.14, vol: 0.05, t: S.now + i * 0.37, dest: this.out, send: 1.2 });
        if (r < 0.3) S.noise({ bp: 800, bp1: 300, q: 1, dur: 0.9, vol: 0.12, a: 0.3, dest: this.out, send: 0.8 });
        break;
      }
      case "arcade":
        if (r < 0.4) S.tone({ type: "square", f0: 988, dur: 0.07, vol: 0.02, dest: this.out, send: 0.6 }), S.tone({ type: "square", f0: 1319, dur: 0.14, vol: 0.02, t: S.now + 0.07, dest: this.out, send: 0.6 });
        else S.noise({ hp: 3000, dur: 0.5, vol: 0.05, dest: this.out });
        break;
      case "boiler":
        if (r < 0.5) S.noise({ hp: 2500, dur: 1.6, vol: 0.14, a: 0.3, dest: this.out, send: 0.3 });
        else S.tone({ f0: 180, f1: 120, dur: 1.2, vol: 0.05, lp: 500, dest: this.out, send: 0.7 }), S.noise({ kind: "brown", lp: 400, dur: 0.25, vol: 0.25, dest: this.out });
        break;
      case "ward":
        if (r < 0.4) S.tone({ f0: 880, dur: 2.2, vol: 0.012, dest: this.out, send: 0.4 });
        else S.tone({ f0: 1700, f1: 700, dur: 0.12, vol: 0.04, dest: this.out, send: 1.0 });
        break;
      case "stomach":
        S.noise({ kind: "pink", bp: 180 + rnd() * 120, bp1: 420 + rnd() * 200, q: 2.5, dur: 1.1, vol: 0.28, a: 0.25, dest: this.out, send: 0.2 });
        break;
    }
  }

  /** En zonas oscuras el ambiente se apaga: queda el silencio incomodo. */
  setDark(d: number): void {
    if (this.alive) this.S.ramp(this.out.gain, 1 - 0.55 * d, 0.6);
  }

  stop(fade = 1.2): void {
    this.alive = false;
    const t = this.S.now;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setTargetAtTime(0, t, fade / 3);
    window.setTimeout(() => {
      for (const n of this.nodes) { try { n.stop(); } catch { /* noop */ } }
      try { this.out.disconnect(); } catch { /* noop */ }
    }, fade * 1000 + 300);
  }
}

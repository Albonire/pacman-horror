// Capas musicales adaptativas: dron desafinable por tension y la "sirena" estilo Pac-Man que sube con el progreso.

import type { Synth } from "./synth";

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export class Drone {
  private gain: GainNode;
  private filter: BiquadFilterNode;
  private oscs: OscillatorNode[] = [];
  private tritone: OscillatorNode;
  private tritoneGain: GainNode;
  private lfo: OscillatorNode;
  private lfoGain: GainNode;

  constructor(private S: Synth, root = 55) {
    const ctx = S.ctx;
    this.gain = ctx.createGain(); this.gain.gain.value = 0;
    this.gain.connect(S.music);
    this.filter = ctx.createBiquadFilter(); this.filter.type = "lowpass"; this.filter.frequency.value = 800;
    this.filter.connect(this.gain);
    const send = ctx.createGain(); send.gain.value = 0.4; this.gain.connect(send); send.connect(S.reverbSend);
    for (const mult of [1, 1.5, 2, 3]) {
      const o = ctx.createOscillator(); o.type = "triangle"; o.frequency.value = root * mult;
      const g = ctx.createGain(); g.gain.value = 0.12 / Math.sqrt(mult);
      o.connect(g); g.connect(this.filter); o.start();
      this.oscs.push(o);
    }
    this.tritone = ctx.createOscillator(); this.tritone.type = "sine"; this.tritone.frequency.value = root * Math.SQRT2 * 2;
    this.tritoneGain = ctx.createGain(); this.tritoneGain.gain.value = 0;
    this.tritone.connect(this.tritoneGain); this.tritoneGain.connect(this.filter); this.tritone.start();
    this.lfo = ctx.createOscillator(); this.lfo.frequency.value = 0.3;
    this.lfoGain = ctx.createGain(); this.lfoGain.gain.value = 0;
    this.lfo.connect(this.lfoGain);
    for (const o of this.oscs) this.lfoGain.connect(o.detune);
    this.lfoGain.connect(this.tritone.detune);
    this.lfo.start();
  }

  private lastT = -1;

  /** Maximo 10 Hz y solo si el objetivo cambia mas de ~2 % (ver `Synth.ramp`): antes eran 5 llamadas a parametros por frame. */
  update(tension: number): void {
    const S = this.S, t = S.now;
    if (t - this.lastT < 0.1) return;
    this.lastT = t;
    S.ramp(this.gain.gain, 0.05 + tension * 0.2, 0.5);
    S.ramp(this.lfoGain.gain, tension * 95, 0.4);
    S.ramp(this.lfo.frequency, 0.2 + tension * 2.3, 0.4);
    S.ramp(this.filter.frequency, 600 + tension * 1500, 0.5);
    S.ramp(this.tritoneGain.gain, tension > 0.55 ? 0.15 : 0, 0.5);
  }

  dispose(): void {
    for (const o of [...this.oscs, this.tritone, this.lfo]) { try { o.stop(); } catch { /* noop */ } }
    this.gain.disconnect();
  }
}

/**
 * Sirena de persecucion: un lamento grave que sube de tono segun los nodos devorados (como el original),
 * pero sucio y desafinado. Con poder activo cambia a un gemido rapido de fantasma asustado.
 */
export class Siren {
  private osc: OscillatorNode;
  private osc2: OscillatorNode;
  private lfo: OscillatorNode;
  private lfoGain: GainNode;
  private gain: GainNode;
  private filter: BiquadFilterNode;
  private blinkT = 0;

  constructor(private S: Synth) {
    const ctx = S.ctx;
    this.osc = ctx.createOscillator(); this.osc.type = "sawtooth"; this.osc.frequency.value = 110;
    this.osc2 = ctx.createOscillator(); this.osc2.type = "square"; this.osc2.frequency.value = 110; this.osc2.detune.value = 19;
    this.filter = ctx.createBiquadFilter(); this.filter.type = "lowpass"; this.filter.frequency.value = 620; this.filter.Q.value = 5;
    this.gain = ctx.createGain(); this.gain.gain.value = 0;
    const g2 = ctx.createGain(); g2.gain.value = 0.45;
    this.osc.connect(this.filter); this.osc2.connect(g2); g2.connect(this.filter);
    this.filter.connect(this.gain); this.gain.connect(S.music);
    const send = ctx.createGain(); send.gain.value = 0.45; this.gain.connect(send); send.connect(S.reverbSend);
    this.lfo = ctx.createOscillator(); this.lfo.frequency.value = 1;
    this.lfoGain = ctx.createGain(); this.lfoGain.gain.value = 22;
    this.lfo.connect(this.lfoGain); this.lfoGain.connect(this.osc.frequency); this.lfoGain.connect(this.osc2.frequency);
    this.osc.start(); this.osc2.start(); this.lfo.start();
  }

  private lastT = -1;

  update(dt: number, s: { progress: number; chasing: boolean; tension: number; powered: boolean; powerLow: boolean }): void {
    const S = this.S, t = S.now;
    if (s.powered) {
      S.ramp(this.osc.frequency, 310, 0.1);
      S.ramp(this.osc2.frequency, 310, 0.1);
      S.ramp(this.lfo.frequency, 7.5, 0.1);
      S.ramp(this.lfoGain.gain, 95, 0.1);
      S.ramp(this.filter.frequency, 1100, 0.1);
      this.blinkT += dt;
      const blink = s.powerLow && Math.sin(this.blinkT * 22) > 0 ? 0.3 : 1;
      S.ramp(this.gain.gain, 0.06 * blink, 0.04);
      return;
    }
    if (t - this.lastT < 0.1) return;
    this.lastT = t;
    const base = 92 + 95 * clamp(s.progress, 0, 1);
    S.ramp(this.osc.frequency, base, 0.2);
    S.ramp(this.osc2.frequency, base, 0.2);
    S.ramp(this.lfo.frequency, 0.75 + s.progress * 1.1 + s.tension * 0.8, 0.3);
    S.ramp(this.lfoGain.gain, base * 0.2, 0.3);
    S.ramp(this.filter.frequency, 480 + s.tension * 520, 0.3);
    S.ramp(this.gain.gain, s.chasing ? 0.03 + s.tension * 0.04 : 0, 0.6);
  }

  dispose(): void {
    for (const o of [this.osc, this.osc2, this.lfo]) { try { o.stop(); } catch { /* noop */ } }
    this.gain.disconnect();
  }
}

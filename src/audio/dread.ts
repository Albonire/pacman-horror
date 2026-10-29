// Sonidos de pavor ambientales: eventos esporadicos y posicionales (voces en las paredes, arrastres
// de metal, aranazos, una nana infantil lejana, respiracion pegada a la nuca...). No sirven de aviso
// de nada: existen solo para que el jugador no se sienta nunca a solas.

import type { Synth } from "./synth";

const rnd = Math.random;
const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)];

export type DreadKind =
  | "moan" | "choir" | "scrape" | "scratch" | "lullaby" | "throb" | "inhale"
  | "farScream" | "creak" | "behind" | "knock" | "radio";

export interface DreadState {
  dt: number;
  tension: number; // 0..1
  chasing: boolean;
  listener: { x: number; z: number; fx: number; fz: number };
  /** 0 = sin sustos de audio; 1 = normal; >1 mas frecuentes. */
  intensity: number;
}

export class Dread {
  private timer = 14;
  private bus: GainNode;
  private last: DreadKind[] = [];
  private active = 0;

  constructor(private S: Synth) {
    const ctx = S.ctx;
    this.bus = ctx.createGain();
    this.bus.gain.value = 0.9;
    this.bus.connect(S.master);
    const send = ctx.createGain(); send.gain.value = 0.6;
    this.bus.connect(send); send.connect(S.reverbSend);
  }

  update(s: DreadState): void {
    if (s.intensity <= 0) return;
    this.timer -= s.dt * (0.8 + s.tension * 0.9) * s.intensity;
    if (this.timer > 0) return;
    this.timer = 9 + rnd() * 16;
    if (this.active > 2) return;
    const weights: [DreadKind, number][] = [
      ["moan", 12], ["choir", 8], ["scrape", 12], ["scratch", 12], ["lullaby", 8], ["throb", 7],
      ["inhale", 9], ["farScream", 5], ["creak", 10], ["behind", 8], ["knock", 9], ["radio", 6],
    ];
    const pool = weights.filter(([k]) => !this.last.includes(k));
    const total = pool.reduce((a, [, w]) => a + w, 0);
    let r = rnd() * total;
    let kind: DreadKind = "moan";
    for (const [k, w] of pool) { r -= w; if (r <= 0) { kind = k; break; } }
    this.last.unshift(kind);
    this.last.length = Math.min(this.last.length, 4);
    this.play(kind, s);
  }

  /** Posicion aleatoria alrededor del jugador (detras o a los lados con mas probabilidad). */
  private spot(s: DreadState, min: number, max: number, behind = 0.5): { x: number; y: number; z: number } {
    const { x, z, fx, fz } = s.listener;
    const base = Math.atan2(fz, fx);
    const back = rnd() < behind;
    const a = base + (back ? Math.PI : 0) + (rnd() - 0.5) * (back ? 1.6 : Math.PI * 1.6);
    const d = min + rnd() * (max - min);
    return { x: x + Math.cos(a) * d, y: 0.8 + rnd() * 1.2, z: z + Math.sin(a) * d };
  }

  /** Fuente posicional con una ganancia de compensacion (las distancias largas atenuan mucho). */
  private panner(p: { x: number; y: number; z: number }, ref = 2, rolloff = 1.1, boost = 1): AudioNode {
    const S = this.S;
    const pn = S.panner(p.x, p.y, p.z, ref, rolloff);
    const g = S.ctx.createGain();
    g.gain.value = boost;
    pn.connect(g);
    g.connect(this.bus);
    return pn;
  }

  private track(seconds: number): void {
    this.active++;
    window.setTimeout(() => { this.active = Math.max(0, this.active - 1); }, seconds * 1000);
  }

  play(kind: DreadKind, s: DreadState): void {
    const S = this.S;
    switch (kind) {
      case "moan": {
        // voz humana larga y cansada tras una pared
        const pn = this.panner(this.spot(s, 5, 12, 0.4), 2.5, 1.1, 7);
        const f0 = 150 + rnd() * 70;
        const dur = 2.6 + rnd() * 2;
        S.formantVoice({ f0, f1: f0 * (0.62 + rnd() * 0.2), dur, vol: 0.34, a: 0.5, formants: [[420, 7, 1], [800, 8, 0.7], [2400, 10, 0.2]], vibRate: 4.2, vibDepth: 40, noiseMix: 0.12, dest: pn, send: 0.4 });
        S.formantVoice({ f0: f0 * 1.5, f1: f0 * 1.0, dur: dur * 0.85, t: S.now + 0.3, vol: 0.14, a: 0.6, formants: [[520, 7, 1], [1000, 8, 0.6]], vibRate: 5.1, vibDepth: 55, dest: pn });
        this.track(dur);
        break;
      }
      case "choir": {
        // racimo de segundas menores que crece despacio y se corta
        const root = pick([196, 207.7, 233.1]);
        const dur = 6 + rnd() * 3;
        for (const [m, v] of [[1, 0.05], [1.0595, 0.045], [1.189, 0.04], [1.5, 0.035], [1.5874, 0.03]] as const) {
          for (const dt of [-6, 5]) S.tone({ type: "triangle", f0: root * m, dur, vol: v, a: dur * 0.65, detune: dt, lp: 1500, dest: this.bus, send: 0.8, vibRate: 0.3 + rnd() * 0.4, vibDepth: 14 });
        }
        S.formantVoice({ f0: root, f1: root * 1.01, dur, vol: 0.12, a: dur * 0.6, formants: [[500, 6, 1], [1100, 8, 0.6]], vibRate: 5, vibDepth: 25, dest: this.bus, send: 0.9 });
        this.track(dur);
        break;
      }
      case "scrape": {
        // algo pesado arrastrandose sobre metal
        const pn = this.panner(this.spot(s, 5, 12, 0.45), 2, 1.1, 10);
        const dur = 1.6 + rnd() * 1.4;
        const t = S.now;
        S.tone({ type: "sawtooth", f0: 95 + rnd() * 40, f1: 60 + rnd() * 30, dur, a: 0.15, vol: 0.2, lp: 900, bp: 520, q: 2.5, dest: pn });
        S.noise({ bp: 900, bp1: 2600, q: 5, dur, vol: 0.4, a: 0.2, dest: pn, t });
        S.noise({ kind: "brown", lp: 260, dur, vol: 0.35, a: 0.25, dest: pn, t });
        this.track(dur);
        break;
      }
      case "scratch": {
        // aranazos rapidos dentro de la pared
        const pn = this.panner(this.spot(s, 3, 8, 0.4), 1.6, 1.1, 5);
        let t = S.now;
        const n = 8 + Math.floor(rnd() * 14);
        for (let i = 0; i < n; i++) {
          const d = 0.025 + rnd() * 0.05;
          S.noise({ hp: 2800, bp: 4200 + rnd() * 2400, q: 1.5, dur: d, vol: 0.4 + rnd() * 0.3, a: 0.003, t, dest: pn });
          t += d + (rnd() < 0.2 ? 0.2 + rnd() * 0.3 : 0.015 + rnd() * 0.05);
        }
        this.track(t - S.now);
        break;
      }
      case "lullaby": {
        // tarareo de nina, desafinado, muy lejos
        const pn = this.panner(this.spot(s, 9, 18, 0.3), 3, 0.9, 6);
        const notes = [329.6, 392, 329.6, 293.7, 246.9, 261.6, 293.7, 246.9];
        let t = S.now;
        for (let i = 0; i < notes.length; i++) {
          const d = 0.55 + (i % 4 === 3 ? 0.4 : 0);
          const wobble = 1 + (rnd() - 0.5) * 0.025;
          S.formantVoice({ f0: notes[i] * wobble, f1: notes[i] * wobble * 0.995, dur: d, t, vol: 0.2, a: 0.07, formants: [[320, 8, 1], [820, 9, 0.35]], vibRate: 5.5, vibDepth: 28, dest: pn, send: 0.6 });
          t += d * 0.95;
        }
        this.track(t - S.now);
        break;
      }
      case "throb": {
        // dos graves casi iguales que laten: se sienten en el pecho mas que se oyen
        const dur = 5 + rnd() * 2;
        for (const f of [41, 43.4]) S.tone({ f0: f, dur, a: dur * 0.4, vol: 0.14, lp: 120, dest: this.bus });
        S.noise({ kind: "brown", lp: 90, dur, a: dur * 0.4, vol: 0.14, dest: this.bus });
        this.track(dur);
        break;
      }
      case "inhale": {
        // una enorme inspiracion que crece y se corta en seco: silencio justo despues
        const dur = 2.4 + rnd() * 1.2;
        const t = S.now;
        S.noise({ kind: "pink", bp: 600, bp1: 2800, q: 1.2, dur, a: dur * 0.9, vol: 0.5, dest: this.bus, t });
        S.noise({ kind: "pink", bp: 3000, bp1: 5200, q: 3, dur, a: dur * 0.9, vol: 0.12, dest: this.bus, t });
        S.tone({ type: "sawtooth", f0: 70, f1: 130, dur, a: dur * 0.9, vol: 0.08, lp: 400, dest: this.bus });
        this.track(dur);
        break;
      }
      case "farScream": {
        // un grito humano lejano que no ayuda a nadie
        const pn = this.panner(this.spot(s, 12, 22, 0.3), 3, 0.8, 7);
        const f0 = 520 + rnd() * 200;
        S.formantVoice({ f0, f1: f0 * 1.7, dur: 1.5, vol: 0.5, a: 0.04, formants: [[900, 7, 1], [1700, 9, 0.9], [3100, 10, 0.6]], dist: true, vibRate: 9, vibDepth: 60, noiseMix: 0.1, dest: pn, send: 0.8 });
        S.noise({ hp: 1500, dur: 1.2, vol: 0.14, a: 0.05, dest: pn });
        this.track(1.6);
        break;
      }
      case "creak": {
        // puerta que se abre sola
        const pn = this.panner(this.spot(s, 5, 11, 0.4), 2, 1.1, 9);
        const dur = 1.4 + rnd() * 1.0;
        S.tone({ type: "sawtooth", f0: 180 + rnd() * 60, f1: 340 + rnd() * 120, dur, a: 0.1, vol: 0.18, bp: 700, q: 6, vibRate: 11, vibDepth: 70, dest: pn });
        S.tone({ type: "square", f0: 320, f1: 520, dur: dur * 0.8, a: 0.2, vol: 0.05, lp: 1400, dest: pn });
        S.noise({ bp: 1500, bp1: 600, q: 8, dur, vol: 0.12, a: 0.2, dest: pn });
        this.track(dur);
        break;
      }
      case "behind": {
        // alguien respira pegado a tu nuca
        const { x, z, fx, fz } = s.listener;
        const p = { x: x - fx * 0.9, y: 1.0, z: z - fz * 0.9 };
        const pn = this.panner(p, 0.7, 1.4, 4);
        let t = S.now + 0.1;
        for (let i = 0; i < 3; i++) {
          const inh = 0.7 + rnd() * 0.2, exh = 1.1 + rnd() * 0.3;
          S.noise({ kind: "pink", t, dur: inh, a: inh * 0.6, vol: 0.28, bp: 700, bp1: 1500, q: 1.2, dest: pn });
          S.noise({ kind: "pink", t: t + inh * 0.9, dur: exh, a: exh * 0.2, vol: 0.34, bp: 1100, bp1: 450, q: 1.3, dest: pn });
          S.tone({ type: "sawtooth", f0: 96, f1: 70, t: t + inh * 0.9, dur: exh, a: exh * 0.2, vol: 0.06, lp: 400, dest: pn });
          t += inh + exh + 0.25;
        }
        this.track(t - S.now);
        break;
      }
      case "knock": {
        // tres golpes lentos desde dentro de una pared
        const pn = this.panner(this.spot(s, 4, 9, 0.3), 2, 1.1, 1.8);
        const gap = 0.55 + rnd() * 0.35;
        for (let i = 0; i < 3; i++) {
          const t = S.now + i * gap;
          S.noise({ kind: "brown", lp: 500, dur: 0.18, vol: 0.9, a: 0.002, t, dest: pn });
          S.tone({ f0: 140, f1: 55, dur: 0.2, vol: 0.7, a: 0.002, t, dest: pn });
        }
        this.track(gap * 3 + 0.3);
        break;
      }
      case "radio": {
        // radio mal sintonizada con una voz que casi dice algo
        const pn = this.panner(this.spot(s, 4, 9, 0.4), 2, 1.1, 12);
        const dur = 2.5 + rnd() * 1.5;
        const t = S.now;
        S.noise({ bp: 1800, q: 0.7, dur, vol: 0.2, a: 0.2, dest: pn, t });
        for (let i = 0; i < 6; i++) {
          const d = 0.18 + rnd() * 0.2;
          S.formantVoice({ f0: 110 + rnd() * 40, f1: 100 + rnd() * 40, dur: d, t: t + 0.3 + i * (d + 0.08), vol: 0.22, a: 0.02, formants: [[pick([350, 500, 700]), 8, 1], [pick([1100, 1700, 2200]), 10, 0.7]], vibRate: 0, dest: pn });
        }
        S.tone({ f0: 1000, dur: 0.08, vol: 0.03, t: t + dur, dest: pn });
        this.track(dur);
        break;
      }
    }
  }

  dispose(): void {
    try { this.bus.disconnect(); } catch { /* noop */ }
  }
}

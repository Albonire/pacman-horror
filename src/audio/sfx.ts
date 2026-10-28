// Efectos de un solo disparo (todos sinteticos). Cada funcion recibe el Synth y parametros ligeros.

import type { Synth } from "./synth";

const rnd = Math.random;

/** "Waka waka" corrupto: dos notas alternas retro + crujido humedo de masticar. */
export function waka(S: Synth, streak: number): void {
  const up = streak % 2 === 0;
  const creep = Math.min(1, streak / 24); // cuanto mas comes, mas se desafina
  const f0 = up ? 250 : 470, f1 = up ? 470 : 250;
  S.tone({ type: "square", f0, f1, dur: 0.085, vol: 0.2, lp: 1700, a: 0.003, detune: (rnd() - 0.5) * 70 * creep });
  S.noise({ bp: 1600 + rnd() * 700, q: 1.3, dur: 0.07, vol: 0.3, a: 0.002, send: 0.1 });
  S.noise({ kind: "brown", lp: 420, dur: 0.1, vol: 0.55, a: 0.003 });
  S.tone({ f0: 112, f1: 58, dur: 0.1, vol: 0.4 });
  if (streak > 9 && rnd() < 0.25) S.tone({ type: "sawtooth", f0: f0 * 0.5, f1: f1 * 0.5, dur: 0.22, vol: 0.09, lp: 600, send: 0.45 });
}

export function pellet(S: Synth): void {
  S.tone({ type: "sawtooth", f0: 58, f1: 280, dur: 0.95, vol: 0.2, lp: 1000, a: 0.05, send: 0.4 });
  S.tone({ type: "square", f0: 130, f1: 540, dur: 0.5, vol: 0.07, lp: 2200 });
  S.noise({ bp: 400, bp1: 3200, q: 2, dur: 0.75, vol: 0.22, send: 0.3 });
  S.tone({ f0: 46, f1: 26, dur: 1.1, vol: 0.55 });
  S.noise({ kind: "brown", lp: 200, dur: 0.6, vol: 0.4 });
}

export function powerEnd(S: Synth): void {
  S.tone({ type: "triangle", f0: 520, f1: 130, dur: 0.7, vol: 0.12, lp: 1200, send: 0.4 });
}

export function ghostEaten(S: Synth, combo: number): void {
  const base = 300 * Math.pow(1.19, Math.min(combo, 5));
  S.tone({ type: "square", f0: base, f1: base * 2.6, dur: 0.3, vol: 0.2, lp: 2500 });
  S.noise({ bp: 520, bp1: 140, q: 3, dur: 0.28, vol: 0.6 });
  S.tone({ f0: 90, f1: 40, dur: 0.3, vol: 0.8 });
  S.formantVoice({ f0: 720, f1: 150, dur: 0.55, vol: 0.3, formants: [[800, 5, 1], [1450, 7, 0.7]], vibRate: 30, send: 0.4 });
}

export function fruitSpawn(S: Synth): void {
  [988, 1319, 1175].forEach((f, i) => S.tone({ type: "sine", f0: f, dur: 0.9, vol: 0.05, t: S.now + i * 0.16, send: 0.7, detune: -12 }));
}

export function fruitEaten(S: Synth): void {
  S.noise({ bp: 1200, bp1: 300, q: 2, dur: 0.22, vol: 0.7, send: 0.2 });
  S.tone({ type: "triangle", f0: 400, f1: 900, dur: 0.25, vol: 0.25, send: 0.4 });
  S.tone({ f0: 80, f1: 40, dur: 0.25, vol: 0.8 });
}

export function step(S: Synth, running: boolean): void {
  const v = running ? 0.5 : 0.33;
  S.noise({ kind: "brown", lp: 380, dur: 0.1, vol: v, a: 0.004 });
  S.tone({ f0: 88, f1: 52, dur: 0.09, vol: v * 0.9 });
  if (running || rnd() < 0.3) S.noise({ bp: 1300, q: 0.9, dur: 0.045, vol: v * 0.3, send: 0.1 });
}

export function bite(S: Synth): void {
  S.noise({ hp: 2600, dur: 0.04, vol: 0.5 });
  S.tone({ f0: 170, f1: 66, dur: 0.14, vol: 0.8 });
  S.noise({ bp: 3200, q: 5, dur: 0.03, vol: 0.3, t: S.now + 0.06 });
  S.noise({ kind: "brown", lp: 500, dur: 0.12, vol: 0.5 });
}

export function flashlight(S: Synth, on: boolean): void {
  S.tone({ type: "square", f0: on ? 1900 : 1100, dur: 0.025, vol: 0.16, lp: 4000 });
  S.noise({ hp: 3000, dur: 0.02, vol: 0.2 });
}

export function batteryDead(S: Synth): void {
  S.tone({ type: "sawtooth", f0: 420, f1: 38, dur: 0.7, vol: 0.12, lp: 900, send: 0.3 });
  S.noise({ hp: 2000, dur: 0.5, vol: 0.1 });
}

export function exitUnlocked(S: Synth): void {
  S.noise({ kind: "brown", lp: 320, dur: 0.6, vol: 0.55 });
  S.tone({ f0: 52, f1: 30, dur: 0.9, vol: 0.55 });
  [261.6, 329.6, 392, 523.3].forEach((f, i) => S.tone({ type: "triangle", f0: f, dur: 1.6, vol: 0.09, t: S.now + 0.25 + i * 0.13, send: 0.6, lp: 3000 }));
  S.tone({ f0: 1046.5, dur: 2.2, vol: 0.05, t: S.now + 0.8, send: 0.7 });
  S.tone({ f0: 1568, dur: 2.6, vol: 0.035, t: S.now + 0.9, send: 0.7 });
}

export function levelComplete(S: Synth): void {
  [392, 493.9, 587.3, 784, 987.8, 1174.7].forEach((f, i) => S.tone({ type: "sine", f0: f, dur: 1.8, vol: 0.08, t: S.now + i * 0.14, send: 0.8 }));
  S.noise({ kind: "brown", lp: 260, dur: 1.2, vol: 0.4 });
  S.tone({ f0: 60, f1: 38, dur: 1.4, vol: 0.4 });
}

export function extraLife(S: Synth): void {
  [523, 659, 784, 1047, 1319].forEach((f, i) => S.tone({ type: "square", f0: f, dur: 0.14, vol: 0.06, t: S.now + i * 0.085, lp: 3000, send: 0.3 }));
}

/** Estimulo al despertar un fantasma: golpe grave y firma propia de cada uno. */
export function wake(S: Synth, kind: number, startled: boolean): void {
  const k = startled ? 1 : 0.6;
  S.tone({ type: "sawtooth", f0: 62, f1: 96, dur: 1.4, vol: 0.2 * k, lp: 420, a: 0.25, send: 0.5 });
  S.tone({ f0: 52, f1: 28, dur: 0.9, vol: 0.5 * k });
  switch (kind) {
    case 0:
      S.formantVoice({ f0: 72, f1: 46, dur: 1.1, vol: 0.55 * k, formants: [[300, 4, 1], [900, 6, 0.55], [2200, 8, 0.2]], dist: true, vibRate: 28, vibDepth: 80, noiseMix: 0.25 });
      break;
    case 1:
      [1319, 1175, 987.8, 1175].forEach((f, i) => S.tone({ f0: f, dur: 1.4, vol: 0.07 * k, t: S.now + 0.1 + i * 0.22, send: 0.8, detune: -20 }));
      break;
    case 2:
      S.tone({ f0: 2800, f1: 4200, dur: 1.0, vol: 0.05 * k, a: 0.4, send: 0.3 });
      S.tone({ f0: 2830, f1: 4260, dur: 1.0, vol: 0.05 * k, a: 0.4 });
      break;
    default:
      S.noise({ hp: 2000, dur: 0.7, vol: 0.28 * k, a: 0.02 });
      S.tone({ f0: 2200, dur: 0.06, vol: 0.12 * k });
      break;
  }
}

export function startle(S: Synth, kind: number): void {
  S.noise({ bp: 1900, bp1: 800, q: 4, dur: 0.9, vol: 0.12, a: 0.3, send: 0.5 });
  S.tone({ type: "triangle", f0: 110 + kind * 8, f1: 130, dur: 0.9, vol: 0.08, a: 0.4, lp: 400, send: 0.5 });
}

export function freeze(S: Synth, frozen: boolean): void {
  if (frozen) {
    S.tone({ type: "square", f0: 2300, dur: 0.05, vol: 0.09, lp: 5000 });
    S.noise({ hp: 3000, dur: 0.12, vol: 0.12 });
  } else {
    S.noise({ hp: 1500, dur: 0.22, vol: 0.18 });
    S.tone({ type: "sawtooth", f0: 180, f1: 60, dur: 0.25, vol: 0.1, lp: 700 });
  }
}

export function ping(S: Synth): void {
  S.tone({ f0: 1400, dur: 0.5, vol: 0.2, send: 0.4 });
  S.tone({ f0: 1050, dur: 0.6, vol: 0.12, t: S.now + 0.12, send: 0.5 });
}

export function waveChange(S: Synth, chase: boolean): void {
  S.tone({ type: "sawtooth", f0: 48, f1: chase ? 72 : 42, dur: 1.8, vol: 0.18, lp: 260, a: 0.5, send: 0.5 });
  S.noise({ kind: "pink", bp: 220, bp1: chase ? 700 : 150, q: 2, dur: 1.6, vol: 0.1, a: 0.6 });
}

export function wrap(S: Synth): void {
  S.noise({ bp: 200, bp1: 1400, q: 1.5, dur: 0.55, vol: 0.22, a: 0.1, send: 0.4 });
  S.tone({ f0: 70, f1: 36, dur: 0.6, vol: 0.3 });
}

/** Grito mortal: voz con formantes + rafaga de ruido + impacto grave + chirrido de cuerdas. */
export function deathScream(S: Synth, kind: number): void {
  const P = [
    { f0: 360, f1: 1500, formants: [[700, 6, 1], [1250, 8, 0.9], [2600, 9, 0.6]] as [number, number, number][], growl: true },
    { f0: 640, f1: 2300, formants: [[900, 7, 1], [1900, 9, 1], [3300, 10, 0.8]] as [number, number, number][], growl: false },
    { f0: 880, f1: 3200, formants: [[1100, 8, 1], [2400, 10, 0.9], [4200, 12, 0.7]] as [number, number, number][], growl: false },
    { f0: 300, f1: 1300, formants: [[600, 5, 1], [1500, 8, 0.8], [3000, 9, 0.7]] as [number, number, number][], growl: true },
  ][kind % 4];
  S.formantVoice({ f0: P.f0, f1: P.f1, dur: 1.3, vol: 0.62, a: 0.02, formants: P.formants, dist: true, vibRate: 14, vibDepth: 55, noiseMix: 0.18, send: 0.35 });
  S.formantVoice({ f0: P.f0 * 0.5, f1: P.f1 * 0.52, dur: 1.2, vol: 0.38, a: 0.03, formants: P.formants, dist: true, vibRate: 9, vibDepth: 70, send: 0.3 });
  if (P.growl) S.formantVoice({ f0: 62, f1: 40, dur: 1.4, vol: 0.5, formants: [[260, 4, 1], [800, 6, 0.6]], dist: true, vibRate: 32, vibDepth: 90, noiseMix: 0.3 });
  S.noise({ hp: 700, dur: 1.0, vol: 0.45, a: 0.004, send: 0.3 });
  S.noise({ kind: "brown", lp: 220, dur: 0.9, vol: 0.7, a: 0.004 });
  S.tone({ f0: 72, f1: 24, dur: 1.2, vol: 0.9, a: 0.004 });
  for (let i = 0; i < 5; i++) S.tone({ type: "sawtooth", f0: 680 + i * 11, f1: 1180 + i * 17, dur: 1.0, vol: 0.05, lp: 3200, a: 0.03, detune: (i - 2) * 9, send: 0.4 });
  if (kind === 2) { S.tone({ f0: 3400, dur: 1.2, vol: 0.06 }); S.tone({ f0: 3470, dur: 1.2, vol: 0.06 }); }
  if (kind === 3) S.noise({ bp: 2200, q: 0.5, dur: 1.2, vol: 0.4, a: 0.01 });
}

export function gameOver(S: Synth): void {
  [220, 196, 174.6, 146.8].forEach((f, i) => S.tone({ type: "triangle", f0: f, f1: f * 0.97, dur: 1.9, vol: 0.12, t: S.now + 0.3 + i * 0.7, send: 0.8, lp: 900, a: 0.1 }));
  S.tone({ type: "square", f0: 440, f1: 90, dur: 2.2, vol: 0.06, lp: 700, send: 0.5 });
  S.noise({ kind: "brown", lp: 160, dur: 3.2, vol: 0.4, a: 0.8 });
  S.tone({ f0: 38, f1: 24, dur: 3.2, vol: 0.5, a: 0.6 });
}

export function uiClick(S: Synth): void {
  S.tone({ type: "square", f0: 880, f1: 600, dur: 0.04, vol: 0.05, lp: 3000 });
}

export function stinger(S: Synth, strength: number): void {
  const s = Math.max(0.2, Math.min(1.2, strength));
  [233.1, 246.9, 311.1, 349.2].forEach((f, i) => S.tone({ type: "sawtooth", f0: f, f1: f * 1.03, dur: 1.1, vol: 0.075 * s, lp: 1400, a: 0.02, detune: (i - 1.5) * 6, send: 0.5 }));
  S.tone({ f0: 55, f1: 30, dur: 0.9, vol: 0.6 * s });
  S.noise({ kind: "brown", lp: 250, dur: 0.7, vol: 0.5 * s });
}

export function bang(S: Synth, x: number, y: number, z: number): void {
  const p = S.panner(x, y, z, 2, 1.0);
  p.connect(S.sfx);
  const send = S.ctx.createGain(); send.gain.value = 0.5; p.connect(send); send.connect(S.reverbSend);
  S.noise({ kind: "brown", lp: 700, dur: 0.4, vol: 1.0, a: 0.002, dest: p });
  S.tone({ f0: 130, f1: 40, dur: 0.35, vol: 0.9, a: 0.002, dest: p });
  S.tone({ f0: 840, dur: 1.3, vol: 0.05, dest: p });
  S.noise({ bp: 2400, q: 3, dur: 0.1, vol: 0.3, dest: p });
}

export function whisper(S: Synth, x: number, y: number, z: number): void {
  const p = S.panner(x, y, z, 1.4, 1.0);
  p.connect(S.voice);
  const send = S.ctx.createGain(); send.gain.value = 0.7; p.connect(send); send.connect(S.reverbSend);
  const n = 5 + Math.floor(rnd() * 3);
  let t = S.now;
  for (let i = 0; i < n; i++) {
    const c = 1500 + rnd() * 2200;
    const d = 0.1 + rnd() * 0.09;
    S.noise({ bp: c, bp1: c * (0.7 + rnd() * 0.6), q: 3.5, dur: d, vol: 0.5, a: 0.03, t, dest: p, kind: "pink" });
    S.noise({ bp: 500 + rnd() * 400, q: 4, dur: d, vol: 0.18, a: 0.03, t, dest: p, kind: "pink" });
    t += d + 0.03 + rnd() * 0.07;
  }
}

export function footsteps(S: Synth, x: number, y: number, z: number): void {
  const p = S.panner(x, y, z, 1.8, 1.1);
  p.connect(S.sfx);
  const send = S.ctx.createGain(); send.gain.value = 0.35; p.connect(send); send.connect(S.reverbSend);
  for (let i = 0; i < 6; i++) {
    const t = S.now + i * 0.46 + rnd() * 0.03;
    S.noise({ kind: "brown", lp: 300, dur: 0.11, vol: 0.7, t, dest: p });
    S.tone({ f0: 95, f1: 55, dur: 0.1, vol: 0.5, t, dest: p });
  }
}

export function blackout(S: Synth, on: boolean): void {
  if (!on) {
    S.tone({ type: "sawtooth", f0: 900, f1: 28, dur: 1.0, vol: 0.18, lp: 1200, send: 0.5 });
    S.noise({ hp: 1800, dur: 0.5, vol: 0.2 });
    S.tone({ f0: 40, f1: 24, dur: 1.0, vol: 0.5 });
  } else {
    S.noise({ hp: 2000, dur: 0.15, vol: 0.3 });
    S.tone({ type: "sawtooth", f0: 90, f1: 1100, dur: 0.35, vol: 0.1, lp: 3000, send: 0.3 });
    S.tone({ type: "square", f0: 120, dur: 0.05, vol: 0.12, t: S.now + 0.32 });
  }
}

export function screamerFlash(S: Synth): void {
  S.noise({ hp: 1100, dur: 0.38, vol: 0.5, a: 0.002 });
  S.formantVoice({ f0: 1900, f1: 3300, dur: 0.34, vol: 0.4, a: 0.005, formants: [[1500, 8, 1], [3000, 10, 0.8]], dist: true, send: 0.2 });
  S.tone({ f0: 66, f1: 28, dur: 0.5, vol: 0.8, a: 0.002 });
}

export function heartbeat(S: Synth, strength: number): void {
  const s = 0.3 + 0.7 * Math.max(0, Math.min(1, strength));
  S.tone({ f0: 58, f1: 38, dur: 0.17, vol: 0.4 * s, lp: 180, a: 0.012, dest: S.voice });
  S.tone({ f0: 50, f1: 34, dur: 0.2, vol: 0.28 * s, lp: 160, a: 0.012, t: S.now + 0.19, dest: S.voice });
}

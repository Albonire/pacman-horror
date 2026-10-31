// Efectos de un solo disparo (todos sinteticos). Cada funcion recibe el Synth y parametros ligeros.

import * as baked from "./baked";
import type { Synth } from "./synth";
import type { FaceKind } from "../gfx/faces";

const rnd = Math.random;

/** "Waka waka" corrupto: dos notas alternas retro + crujido humedo de masticar (pre-renderizado, ver baked.ts). */
export function waka(S: Synth, streak: number): void {
  const up = streak % 2 === 0;
  const creep = Math.min(1, streak / 24); // cuanto mas comes, mas se desafina
  baked.waka(S, up, creep);
  if (streak > 9 && rnd() < 0.25) S.tone({ type: "sawtooth", f0: (up ? 250 : 470) * 0.5, f1: (up ? 470 : 250) * 0.5, dur: 0.22, vol: 0.09, lp: 600, send: 0.45 });
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
  baked.step(S, running);
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

/**
 * Grito mortal, sincronizado con la embestida (el destello blanco llega a ~0,44 s):
 * 1) tension ascendente (cuerdas que suben y aire que se infla) mientras el fantasma se lanza,
 * 2) impacto grave + el grito en coro (voz principal, octava inferior y tres voces desafinadas),
 * 3) chillido ametrallado (AM rapida) y 4) corte seco con acufeno y latidos.
 */
export function deathScream(S: Synth, kind: FaceKind, gain = 1): void {
  if (gain <= 0) return;
  const g = Math.min(1, gain);
  const P = [
    { f0: 420, f1: 1850, formants: [[820, 2.6, 1.5], [1850, 3.2, 1.3], [3200, 4.0, 1.0], [4400, 5.0, 0.7]] as [number, number, number][], growl: true },
    { f0: 820, f1: 3100, formants: [[950, 2.8, 1.6], [2200, 3.4, 1.4], [3600, 4.2, 1.1], [4800, 5.0, 0.8]] as [number, number, number][], growl: false },
    { f0: 680, f1: 2600, formants: [[880, 2.7, 1.5], [1950, 3.3, 1.3], [3400, 4.0, 1.0], [4200, 4.8, 0.8]] as [number, number, number][], growl: false },
    { f0: 340, f1: 1600, formants: [[680, 2.4, 1.4], [1600, 3.0, 1.2], [2900, 3.8, 1.0], [4000, 4.5, 0.7]] as [number, number, number][], growl: true },
  ][kind % 4];
  const t0 = S.now;
  // el golpe se adelanta la latencia de salida (con latencyHint "playback" es mayor) para que siga coincidiendo con el destello
  const hit = Math.max(t0 + 0.1, t0 + 0.38 - S.lead);
  const dur = 1.55;

  // 1) aspiracion previa: el aire que entra justo antes del grito (sube y se corta en seco)
  S.noise({ kind: "pink", bp: 380, bp1: 3400, q: 1.6, dur: 0.38, a: 0.34, vol: 0.5 * g, t: t0, send: 0.25 });
  S.tone({ f0: 60, f1: 130, t: t0, dur: 0.38, a: 0.34, vol: 0.3 * g, lp: 240 });

  // 2) impacto
  S.tone({ f0: 92, f1: 20, t: hit, dur: 1.6, vol: 0.95 * g, a: 0.001 });
  S.noise({ kind: "brown", lp: 300, t: hit, dur: 1.2, vol: 0.85 * g, a: 0.002 });
  S.noise({ hp: 1100, t: hit, dur: 1.25, vol: 0.7 * g, a: 0.002, send: 0.4 });

  // 3) voz: la muestra real en tres capas (principal, grave que se arrastra y aguda que chilla).
  //    Cada fantasma la toca a otra altura. Sin muestra (aun decodificando) se sintetiza la voz.
  const buf = S.getSample("scream");
  if (buf) {
    const base = 0.96 + (kind % 4) * 0.03;
    const layer = (o: { at: number; rate: number; vol: number; hp: number; lp: number; send: number; holdTo: number; fadeTo: number; pan?: number }): void => {
      const src = S.ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = o.rate;
      const hp = S.ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = o.hp;
      const eq = S.ctx.createBiquadFilter(); eq.type = "peaking"; eq.frequency.value = 3100; eq.Q.value = 1.2; eq.gain.value = 2.5;
      const lp = S.ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = o.lp;
      const env = S.ctx.createGain();
      const v = Math.min(1, Math.max(0.05, o.vol * g * S.trim));
      env.gain.setValueAtTime(0.0001, o.at);
      env.gain.linearRampToValueAtTime(v, o.at + 0.012);
      env.gain.setValueAtTime(v, o.at + o.holdTo);
      env.gain.exponentialRampToValueAtTime(0.0001, o.at + o.fadeTo);
      src.connect(hp); hp.connect(eq); eq.connect(lp); lp.connect(env);
      if (o.pan !== undefined && typeof S.ctx.createStereoPanner === "function") {
        const pn = S.ctx.createStereoPanner(); pn.pan.value = o.pan; env.connect(pn); S.out(pn, S.voice, o.send);
      } else S.out(env, S.voice, o.send);
      src.start(o.at);
      src.stop(o.at + o.fadeTo + 0.05);
    };
    // principal: la muestra entera, con su cola natural
    layer({ at: hit, rate: base, vol: 0.6, hp: 85, lp: 9500, send: 0.14, holdTo: buf.duration / base - 0.5, fadeTo: buf.duration / base + 0.05 });
    // grave: mas lenta (casi una quinta por debajo), entra algo despues y se arrastra hasta apagarse. Alarga el grito
    layer({ at: hit + 0.2, rate: base * 0.68, vol: 0.4, hp: 60, lp: 2600, send: 0.32, holdTo: 3.2, fadeTo: 5.3, pan: -0.25 });
    // aguda: un coro desafinado que solo vive el primer tramo (el chillido de los dientes)
    layer({ at: hit + 0.04, rate: base * 1.19, vol: 0.16, hp: 1500, lp: 9000, send: 0.2, holdTo: 1.5, fadeTo: 2.6, pan: 0.3 });
  } else {
    // respaldo: sintesis de voz por formantes
    S.formantVoice({ t: hit, f0: P.f0, f1: P.f1, dur, vol: 0.95 * g, a: 0.005, formants: P.formants, dist: true, vibRate: 36, vibDepth: 120, noiseMix: 0.4, send: 0.4 });
    S.formantVoice({ t: hit + 0.02, f0: P.f0 * 1.06, f1: P.f1 * 0.92, dur: dur * 0.9, vol: 0.75 * g, a: 0.01, formants: P.formants, dist: true, vibRate: 42, vibDepth: 140, noiseMix: 0.35, send: 0.45 });
    S.formantVoice({ t: hit, f0: P.f0 * 0.5, f1: P.f1 * 0.48, dur: dur * 0.85, vol: 0.65 * g, a: 0.015, formants: P.formants, dist: true, vibRate: 26, vibDepth: 90, noiseMix: 0.3, send: 0.3 });
    if (P.growl) {
      S.formantVoice({ t: hit, f0: 72, f1: 42, dur: 1.5, vol: 0.8 * g, formants: [[260, 3.5, 1.4], [780, 4.5, 1.0]], dist: true, vibRate: 48, vibDepth: 160, noiseMix: 0.45 });
    }
  }

  // 4) agonia: el oido se cierra mientras la voz se apaga, y el corazon se frena
  S.muffle(420, 3.4, 1.6, 1.2, hit + 0.9);
  const tTail = hit + 1.9;
  S.tone({ f0: 4180, t: tTail, dur: 3.4, vol: 0.07 * g, a: 0.6, lp: 6000 });
  const beats = [0, 0.62, 1.34, 2.2, 3.28];
  beats.forEach((d, i) => S.tone({ f0: 54 - i * 3, f1: 30, t: tTail + d, dur: 0.22 + i * 0.03, vol: (0.62 - i * 0.1) * g, lp: 170, a: 0.01 }));
}

/** Pulso grave y calido que viene de la salida abierta (espacializado: indica la direccion). */
export function beacon(S: Synth, x: number, y: number, z: number): void {
  const p = S.panner(x, y, z, 3, 0.55);
  p.connect(S.sfx);
  const send = S.ctx.createGain(); send.gain.value = 0.5; p.connect(send); send.connect(S.reverbSend);
  S.tone({ f0: 98, f1: 90, dur: 1.7, vol: 0.55, a: 0.2, lp: 700, dest: p });
  S.tone({ f0: 147, f1: 140, dur: 1.4, vol: 0.28, a: 0.28, lp: 800, t: S.now + 0.12, dest: p });
  S.tone({ f0: 196, dur: 1.1, vol: 0.12, a: 0.3, lp: 900, t: S.now + 0.3, dest: p });
}

/** Jadeo al quedarse sin aliento dentro del armario: una bocanada brusca y un golpe sordo de la caja. */
export function gasp(S: Synth): void {
  baked.gasp(S);
}

/** Golpe de susto sincronizado con cada destello de la cara: acorde disonante, latigazo de aire y sub-grave. */
export function scareHit(S: Synth, strength: number): void {
  const s = Math.max(0.4, Math.min(1.5, strength));
  [233.1, 246.9, 277.2, 349.2, 370, 466.2].forEach((f, i) =>
    S.tone({
      type: "sawtooth",
      f0: f * 2.3,
      f1: f * 1.65,
      dur: 0.3,
      vol: 0.16 * s,
      lp: 4200,
      a: 0.001,
      detune: (i - 2.5) * 18,
      send: 0.35,
    }),
  );
  S.noise({ hp: 750, dur: 0.25, vol: 0.92 * s, a: 0.001 });
  S.tone({ f0: 108, f1: 24, dur: 0.42, vol: 1.0 * s, a: 0.001 });
  S.tone({ type: "square", f0: 3800, f1: 1350, dur: 0.14, vol: 0.14 * s, a: 0.001 });
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

/**
 * Estallido sonoro de screamer fugaz (fuerte pero momentaneo, ~0,32 s):
 * 1) Ducking instantaneo del ambiente para maximo contraste dinamico.
 * 2) Golpe seco de pecho (sub-grave 128->22 Hz + transitorio explosivo de ruido y metal).
 * 3) Rafaga de chillido desgarrado en el bus de voz (corte de muestra de grito + formantes distorsionados)
 *    que golpea al instante y se corta en seco en cuanto desaparece la cara.
 */
export function screamerFlash(S: Synth, strength = 1): void {
  const s = Math.max(0.45, Math.min(1.35, strength));
  const t0 = S.now;

  // Silencia de golpe el fondo durante 0,45 s para que el impacto sobresalte de verdad y vuelva enseguida
  S.duck(0.04, 0.45, 0.35);

  // 1) Impacto fisico en el pecho (ataque de 1 ms, caida sub-grave y latigazo de aire/metal)
  S.tone({ f0: 135, f1: 18, t: t0, dur: 0.36, vol: 1.0 * s, a: 0.001, dest: S.voice });
  S.tone({ type: "triangle", f0: 280, f1: 38, t: t0, dur: 0.26, vol: 0.95 * s, a: 0.001, dest: S.voice });
  S.tone({ f0: 62, f1: 28, t: t0, dur: 0.42, vol: 0.88 * s, a: 0.001, lp: 160, dest: S.voice });
  S.noise({ kind: "white", hp: 680, t: t0, dur: 0.26, vol: 1.0 * s, a: 0.001, dest: S.voice, send: 0.22 });
  S.noise({ kind: "pink", bp: 2950, bp1: 1350, q: 2.8, t: t0, dur: 0.28, vol: 0.88 * s, a: 0.001, dest: S.voice, send: 0.25 });

  // 1b) Transitorio de alta frecuencia estridente (golpe de cuchilla / chirrido punzante que causa sobresalto reflejo inmediato)
  S.tone({ type: "sawtooth", f0: 5200, f1: 2600, t: t0, dur: 0.12, vol: 0.32 * s, a: 0.0005, hp: 2200, dest: S.voice });
  S.tone({ type: "square", f0: 3850, f1: 1950, t: t0, dur: 0.15, vol: 0.24 * s, a: 0.0005, bp: 3200, q: 4.5, dest: S.voice });
  S.noise({ hp: 4200, t: t0, dur: 0.09, vol: 0.45 * s, a: 0.0005, dest: S.voice });

  // 2) Rafaga corta de la muestra de grito (si ya esta decodificada) cortada en seco a ~0,30 s
  const buf = S.getSample("scream");
  if (buf) {
    const src = S.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = 1.08 + rnd() * 0.18;
    const hp = S.ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 220;
    const eq = S.ctx.createBiquadFilter(); eq.type = "peaking"; eq.frequency.value = 2850; eq.Q.value = 1.1; eq.gain.value = 4.5;
    const env = S.ctx.createGain();
    const v = Math.min(1, 0.92 * s * S.trim);
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.linearRampToValueAtTime(v, t0 + 0.003);
    env.gain.setValueAtTime(v, t0 + 0.19);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.31);
    src.connect(hp); hp.connect(eq); eq.connect(env);
    S.out(env, S.voice, 0.2);
    src.start(t0, 0.06);
    src.stop(t0 + 0.33);
  }

  // 3) Chillido sintetico por formantes distorsionados + cluster disonante agudo (ataque instantaneo, corte rapido)
  S.formantVoice({
    t: t0,
    f0: 840,
    f1: 2750,
    dur: 0.3,
    vol: 0.95 * s,
    a: 0.002,
    formants: [[1050, 3.2, 1.5], [2350, 4.0, 1.4], [3650, 4.8, 1.1]],
    dist: true,
    vibRate: 46,
    vibDepth: 175,
    noiseMix: 0.45,
    dest: S.voice,
    send: 0.22,
  });
  S.formantVoice({
    t: t0 + 0.008,
    f0: 1580,
    f1: 3450,
    dur: 0.26,
    vol: 0.82 * s,
    a: 0.002,
    formants: [[1480, 4.5, 1.4], [2980, 5.5, 1.2], [4300, 6.0, 0.9]],
    dist: true,
    vibRate: 54,
    vibDepth: 190,
    noiseMix: 0.38,
    dest: S.voice,
    send: 0.18,
  });

  // Acorde metalico de tritono en puñalada
  [293.7, 311.1, 415.3, 587.3, 830.6, 1174.7].forEach((f, i) =>
    S.tone({
      type: "sawtooth",
      f0: f * 2.1,
      f1: f * 1.45,
      t: t0,
      dur: 0.26,
      vol: 0.17 * s,
      lp: 4800,
      a: 0.001,
      detune: (i - 2.5) * 22,
      dest: S.voice,
      send: 0.25,
    }),
  );
}

export function heartbeat(S: Synth, strength: number): void {
  baked.heartbeat(S, 0.3 + 0.7 * Math.max(0, Math.min(1, strength)));
}

/** Pila recogida: clic metalico y un acorde corto y limpio (lo unico "bueno" que suena). */
export function pickup(S: Synth): void {
  S.noise({ bp: 3500, q: 4, dur: 0.05, vol: 0.4, a: 0.002 });
  [523.3, 659.3, 784].forEach((f, i) => S.tone({ type: "triangle", f0: f, dur: 0.5, vol: 0.12, t: S.now + 0.05 + i * 0.07, send: 0.6, lp: 3000 }));
  S.tone({ f0: 90, f1: 60, dur: 0.12, vol: 0.4 });
}

/** Palanca de fusibles: golpe seco, zumbido electrico y tubos que chisporrotean. */
export function switchOn(S: Synth): void {
  S.noise({ kind: "brown", lp: 600, dur: 0.18, vol: 0.9, a: 0.002 });
  S.tone({ f0: 160, f1: 55, dur: 0.25, vol: 0.8, a: 0.002 });
  S.tone({ type: "sawtooth", f0: 60, f1: 120, dur: 1.4, vol: 0.12, lp: 500, a: 0.1, send: 0.4 });
  for (let i = 0; i < 6; i++) S.noise({ hp: 3000, dur: 0.04, vol: 0.2, t: S.now + 0.25 + i * 0.09 + Math.random() * 0.05 });
}

/** Entrar o salir del armario: chirrido de bisagra y portazo suave; dentro, el mundo suena amortiguado. */
export function hide(S: Synth, inside: boolean): void {
  S.tone({ type: "sawtooth", f0: inside ? 240 : 380, f1: inside ? 380 : 240, dur: 0.55, vol: 0.12, bp: 800, q: 5, vibRate: 12, vibDepth: 60, a: 0.05 });
  S.noise({ kind: "brown", lp: 400, dur: 0.15, vol: 0.7, t: S.now + 0.5, a: 0.002 });
  S.tone({ f0: 120, f1: 50, dur: 0.2, vol: 0.6, t: S.now + 0.5, a: 0.002 });
  if (inside) S.duck(0.3, 2.5);
}

/** Aviso de tuberia a punto de reventar: traqueteo metalico y silbido creciente espacializado. */
export function steamWarning(S: Synth, x: number, y: number, z: number): void {
  const p = S.panner(x, y, z, 2.2, 0.9);
  p.connect(S.sfx);
  const send = S.ctx.createGain(); send.gain.value = 0.35; p.connect(send); send.connect(S.reverbSend);
  S.tone({ type: "triangle", f0: 620, f1: 1850, dur: 1.15, vol: 0.14, a: 0.15, lp: 3200, dest: p });
  S.noise({ bp: 2400, bp1: 4200, q: 4.5, dur: 1.2, vol: 0.32, a: 0.2, dest: p });
  for (let i = 0; i < 3; i++) {
    S.tone({ f0: 180 + i * 35, f1: 75, dur: 0.09, vol: 0.35, t: S.now + i * 0.28, dest: p });
  }
}

/** Estallido de vapor a presion en un pasillo (espacializado). */
export function steamBurst(S: Synth, x: number, y: number, z: number): void {
  const p = S.panner(x, y, z, 2.6, 0.85);
  p.connect(S.sfx);
  const send = S.ctx.createGain(); send.gain.value = 0.45; p.connect(send); send.connect(S.reverbSend);
  // Golpe metalico inicial de la valvula + chorro denso de vapor
  S.tone({ f0: 145, f1: 42, dur: 0.28, vol: 0.75, a: 0.003, dest: p });
  S.noise({ kind: "white", bp: 1800, bp1: 1100, q: 1.4, dur: 2.6, vol: 0.65, a: 0.02, dest: p });
  S.noise({ kind: "pink", hp: 2600, dur: 2.2, vol: 0.38, a: 0.05, dest: p });
}

/** Tos ahogada y quemadura leve al respirar vapor hirviendo. */
export function steamCough(S: Synth): void {
  S.noise({ kind: "pink", bp: 950, bp1: 480, q: 2.8, dur: 0.26, vol: 0.42, a: 0.01, send: 0.3 });
  S.formantVoice({ f0: 165, f1: 95, dur: 0.28, vol: 0.32, formants: [[620, 4, 1], [1380, 5, 0.6]], noiseMix: 0.45, send: 0.25 });
  S.tone({ f0: 72, f1: 38, dur: 0.24, vol: 0.45 });
}

/** Disparo de disyuntor / apagon general de sector desde la caja de fusibles (espacializado). */
export function breakerTrip(S: Synth, x: number, y: number, z: number): void {
  const p = S.panner(x, y, z, 3.0, 0.7);
  p.connect(S.sfx);
  const send = S.ctx.createGain(); send.gain.value = 0.55; p.connect(send); send.connect(S.reverbSend);
  // Chispa electrica + golpe seco de palanca + caida grave de transformador
  S.noise({ hp: 2400, dur: 0.16, vol: 0.55, a: 0.002, dest: p });
  S.tone({ type: "sawtooth", f0: 140, f1: 48, dur: 0.24, vol: 0.65, lp: 900, dest: p });
  S.tone({ type: "sawtooth", f0: 380, f1: 28, dur: 1.15, vol: 0.28, lp: 800, a: 0.04, dest: p });
  S.tone({ f0: 54, f1: 22, dur: 1.2, vol: 0.6, dest: p });
}

/** Roce sordo de muros de hormigon/piedra al cambiar un pasillo a espaldas del jugador. */
export function mazeShift(S: Synth, x: number, y: number, z: number): void {
  const p = S.panner(x, y, z, 2.5, 0.8);
  p.connect(S.sfx);
  const send = S.ctx.createGain(); send.gain.value = 0.6; p.connect(send); send.connect(S.reverbSend);
  S.noise({ kind: "brown", lp: 240, dur: 1.1, vol: 0.75, a: 0.08, dest: p });
  S.tone({ type: "triangle", f0: 62, f1: 31, dur: 1.05, vol: 0.65, a: 0.06, lp: 180, dest: p });
  S.noise({ kind: "pink", bp: 340, bp1: 180, q: 3.0, dur: 0.85, vol: 0.35, a: 0.1, dest: p });
}


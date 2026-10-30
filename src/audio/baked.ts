// Sonidos frecuentes que se pre-renderizan una vez (OfflineAudioContext) y despues se reproducen con 2 nodos en
// lugar de 8 a 16. Cada "receta" sirve para las dos vias: sintesis en vivo (mientras el sonido aun no esta listo o
// si el navegador no permite renderizar fuera de linea) y pre-renderizado (volumen 1, el volumen real se aplica al
// reproducir). Asi el sonido es el mismo en ambos casos.

import type { Synth } from "./synth";

const rnd = Math.random;

type Dest = AudioNode | undefined;

function stepRecipe(S: Synth, v: number, click: boolean, dest?: Dest): void {
  S.noise({ kind: "brown", lp: 380, dur: 0.1, vol: v, a: 0.004, dest });
  S.tone({ f0: 88, f1: 52, dur: 0.09, vol: v * 0.9, dest });
  if (click) S.noise({ bp: 1300, q: 0.9, dur: 0.045, vol: v * 0.3, send: 0.1, dest });
}

function wakaRecipe(S: Synth, up: boolean, detune: number): void {
  const f0 = up ? 250 : 470, f1 = up ? 470 : 250;
  S.tone({ type: "square", f0, f1, dur: 0.085, vol: 0.2, lp: 1700, a: 0.003, detune });
  S.noise({ bp: 1600 + rnd() * 700, q: 1.3, dur: 0.07, vol: 0.3, a: 0.002, send: 0.1 });
  S.noise({ kind: "brown", lp: 420, dur: 0.1, vol: 0.55, a: 0.003 });
  S.tone({ f0: 112, f1: 58, dur: 0.1, vol: 0.4 });
}

function heartbeatRecipe(S: Synth, s: number): void {
  S.tone({ f0: 58, f1: 38, dur: 0.17, vol: 0.4 * s, lp: 180, a: 0.012, dest: S.voice });
  S.tone({ f0: 50, f1: 34, dur: 0.2, vol: 0.28 * s, lp: 160, a: 0.012, t: S.now + 0.19, dest: S.voice });
}

function gaspRecipe(S: Synth): void {
  S.noise({ kind: "pink", bp: 500, bp1: 1500, q: 1.6, dur: 0.42, a: 0.03, vol: 0.55 });
  S.noise({ kind: "pink", bp: 1200, bp1: 600, q: 2, dur: 0.3, a: 0.02, t: S.now + 0.18, vol: 0.3 });
  S.tone({ f0: 90, f1: 40, dur: 0.18, vol: 0.5, lp: 220, a: 0.004 });
}

function ghostStepRecipe(S: Synth, vol: number, dest: Dest, send: number): void {
  S.noise({ kind: "brown", lp: 520, hp: 40, dur: 0.16, a: 0.004, vol: 0.5 * vol, dest, send });
  S.tone({ f0: 70, f1: 38, dur: 0.14, a: 0.003, vol: 0.34 * vol, lp: 220, dest });
  // arrastre humedo entre paso y paso
  S.noise({ kind: "pink", bp: 900, bp1: 350, q: 1.4, dur: 0.22, a: 0.05, vol: 0.12 * vol, t: S.now + 0.12, dest, send: send * 1.5 });
}

/** Paso del jugador. */
export function step(S: Synth, running: boolean): void {
  const v = running ? 0.5 : 0.33;
  const click = running || rnd() < 0.3;
  if (S.playBaked(click ? "stepRun" : "stepWalk", { vol: v, rate: 0.94 + rnd() * 0.12 })) return;
  stepRecipe(S, v, click);
}

/** Las dos notas del "waka" (sin la nota grave rara, que sigue siendo en vivo). */
export function waka(S: Synth, up: boolean, creep: number): void {
  const cents = (rnd() - 0.5) * 70 * creep;
  if (S.playBaked(up ? "wakaUp" : "wakaDown", { vol: 1, rate: Math.pow(2, cents / 1200) })) return;
  wakaRecipe(S, up, cents);
}

/** Un latido doble (bus de voz). */
export function heartbeat(S: Synth, s: number): void {
  if (S.playBaked("heartbeat", { vol: s, dest: S.voice })) return;
  heartbeatRecipe(S, s);
}

/** Jadeo al esconderse. */
export function gasp(S: Synth): void {
  if (S.playBaked("gasp", { vol: 1 })) return;
  gaspRecipe(S);
}

/** Paso arrastrado de un fantasma hacia el panner `dest`. */
export function ghostStep(S: Synth, vol: number, dest: AudioNode): void {
  if (S.playBaked("ghostStep", { vol, dest, send: 0.12, rate: 0.92 + rnd() * 0.16 })) return;
  ghostStepRecipe(S, vol, dest, 0.12);
}

const KEYS = ["stepWalk", "stepRun", "wakaUp", "wakaDown", "heartbeat", "gasp", "ghostStep"] as const;

/** Encola el pre-renderizado de todos los sonidos (uno a uno, en segundo plano). */
export function bakeAll(S: Synth): void {
  S.bake("stepWalk", 0.13, 4, (s) => stepRecipe(s, 1, false));
  S.bake("stepRun", 0.13, 4, (s) => stepRecipe(s, 1, true));
  S.bake("wakaUp", 0.15, 3, (s) => wakaRecipe(s, true, 0));
  S.bake("wakaDown", 0.15, 3, (s) => wakaRecipe(s, false, 0));
  S.bake("heartbeat", 0.45, 2, (s) => heartbeatRecipe(s, 1));
  S.bake("gasp", 0.55, 2, (s) => gaspRecipe(s));
  S.bake("ghostStep", 0.4, 4, (s) => ghostStepRecipe(s, 1, undefined, 0));
}

/** Cuantos sonidos pre-renderizados estan listos. */
export function bakedReady(S: Synth): number {
  return KEYS.filter((k) => S.hasBaked(k)).length;
}

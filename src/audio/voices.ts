// Voces continuas: la respiracion de Pac-Man (con resonancia mandibular e intracraneal al agotarse)
// y las voces posicionales 3D HRTF de cada fantasma (con oclusion tras muros, escucha agudizada al
// esconderse y susurros sinteticos procedurales por formantes).

import type { AudioGhost } from "./types";
import { ghostStep } from "./baked";
import type { Synth } from "./synth";

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const rnd = Math.random;

/** Vocales formanticas base [F1, F2, F3] para articular silabas susurradas en espanol. */
const VOWELS: Record<"a" | "e" | "i" | "o" | "u", [number, number, number]> = {
  a: [740, 1280, 2450],
  e: [480, 1920, 2550],
  i: [310, 2280, 2950],
  o: [510, 890, 2380],
  u: [340, 720, 2280],
};

interface SyllableSpec {
  v: "a" | "e" | "i" | "o" | "u";
  /** Frecuencia central del ataque consonantico fricativo/plosivo (0 = sin consonante inicial). */
  consBp?: number;
  consDur?: number;
  dur: number;
  pitchMul: number;
  sibilantTail?: boolean;
}

/**
 * Patrones foneticos cripticos (sin texto en pantalla): cadencias silabicas que evocan
 * "pa-k-man", "te-ve-o", "a-qui-es-tas", "no-res-pi-res", "tras-de-ti" y "sa-le-ya".
 */
const WHISPER_PATTERNS: readonly (readonly SyllableSpec[])[] = [
  // "pa - k - man"
  [
    { v: "a", consBp: 1400, consDur: 0.035, dur: 0.24, pitchMul: 1.05 },
    { v: "a", consBp: 2600, consDur: 0.05, dur: 0.34, pitchMul: 0.86, sibilantTail: true },
  ],
  // "te - ve - o"
  [
    { v: "e", consBp: 3400, consDur: 0.04, dur: 0.20, pitchMul: 1.08 },
    { v: "e", consBp: 1100, consDur: 0.03, dur: 0.26, pitchMul: 0.98 },
    { v: "o", dur: 0.36, pitchMul: 0.82 },
  ],
  // "a - qui - es - tas"
  [
    { v: "a", dur: 0.18, pitchMul: 0.96 },
    { v: "i", consBp: 2400, consDur: 0.04, dur: 0.22, pitchMul: 1.12 },
    { v: "e", dur: 0.18, pitchMul: 1.0, sibilantTail: true },
    { v: "a", consBp: 3500, consDur: 0.04, dur: 0.32, pitchMul: 0.85, sibilantTail: true },
  ],
  // "no - res - pi - res"
  [
    { v: "o", consBp: 900, consDur: 0.03, dur: 0.22, pitchMul: 0.95 },
    { v: "e", consBp: 1800, consDur: 0.035, dur: 0.20, pitchMul: 1.04, sibilantTail: true },
    { v: "i", consBp: 1500, consDur: 0.035, dur: 0.24, pitchMul: 1.10 },
    { v: "e", consBp: 1800, consDur: 0.03, dur: 0.34, pitchMul: 0.84, sibilantTail: true },
  ],
  // "tras - de - ti"
  [
    { v: "a", consBp: 3200, consDur: 0.045, dur: 0.25, pitchMul: 1.02, sibilantTail: true },
    { v: "e", consBp: 1900, consDur: 0.03, dur: 0.19, pitchMul: 0.94 },
    { v: "i", consBp: 3600, consDur: 0.04, dur: 0.35, pitchMul: 0.88 },
  ],
  // "sa - le - ya"
  [
    { v: "a", consBp: 4400, consDur: 0.06, dur: 0.24, pitchMul: 1.06 },
    { v: "e", consBp: 1400, consDur: 0.03, dur: 0.22, pitchMul: 0.96 },
    { v: "a", consBp: 2200, consDur: 0.04, dur: 0.36, pitchMul: 0.82 },
  ],
];

/**
 * Respiracion de Pac-Man. Ritmo y fuerza dependen del esfuerzo, el miedo y el agotamiento:
 * respiracion lenta y hueca en calma, jadeo humedo y voceado al correr, y al agotarse por completo,
 * resonancia cavernosa dentro de la propia mandibula acompanada de latidos intracraneales.
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
        this.timer = lerp(2.6, 1.15, this.level) * (0.85 + rnd() * 0.25);
      }
      return;
    }
    const target = clamp(0.08 + st.exertion * 0.85 + st.tension * 0.4 + (st.running ? 0.25 : 0) + (st.exhausted ? 0.35 : 0), 0, 1);
    this.level += (target - this.level) * Math.min(1, dt * 1.8);
    this.timer -= dt;
    if (this.timer <= 0) {
      this.breath(S, this.level, st.exhausted);
      const minCycle = st.exhausted ? 0.38 : 0.5;
      this.timer = lerp(4.6, minCycle, this.level) * (0.88 + rnd() * 0.24);
    }
  }

  breathLocker(S: Synth, i: number, nearGhost: boolean): void {
    const dur = nearGhost ? 0.72 : 1.1;
    const vol = lerp(0.05, 0.16, i);
    const t = S.now;
    // inhalacion sorda y amortiguada por el escondite
    S.noise({ kind: "pink", t, dur: dur * 0.45, a: 0.15, vol: vol * 0.65, bp: 550, bp1: 1050, q: 2.2, dest: S.voice, send: 0.18 });
    // exhalacion contenida dentro de la mandibula cerrada
    const te = t + dur * 0.4;
    S.noise({ kind: "pink", t: te, dur: dur * 0.55, a: 0.1, vol: vol * 0.85, bp: 800, bp1: 420, q: 2.5, dest: S.voice, send: 0.22 });
    if (nearGhost) {
      // estertor asfixiado y pulso en las sienes cuando el fantasma ronda el escondite
      S.tone({ type: "sawtooth", t, f0: 165, f1: 130, dur: dur * 0.35, a: 0.1, vol: vol * 0.2, lp: 420, dest: S.voice });
      S.tone({ f0: 52, f1: 34, t, dur: 0.16, a: 0.01, vol: vol * 0.55, lp: 140, dest: S.voice });
    }
  }

  breath(S: Synth, i: number, exhausted: boolean): void {
    const inh = lerp(1.05, exhausted ? 0.16 : 0.2, i);
    const exh = lerp(1.6, exhausted ? 0.24 : 0.3, i);
    const vol = lerp(0.045, 0.26, i) * (exhausted ? 1.48 : 1);
    const t = S.now;
    // inhalacion: ruido rosa con paso banda ascendente + formante agudo + algo de voz
    S.noise({ kind: "pink", t, dur: inh, a: inh * 0.55, vol, bp: 820, bp1: 1750, q: 1.1, dest: S.voice, send: 0.08 });
    S.noise({ kind: "pink", t, dur: inh, a: inh * 0.55, vol: vol * 0.35, bp: 2600, bp1: 3300, q: 3, dest: S.voice });
    if (i > 0.45) S.tone({ type: "sawtooth", t, f0: 150, f1: 205, dur: inh, a: inh * 0.5, vol: vol * 0.16, lp: 700, dest: S.voice });
    // exhalacion
    const te = t + inh * 0.9;
    S.noise({ kind: "pink", t: te, dur: exh, a: exh * 0.2, vol: vol * 1.15, bp: 1150, bp1: 520, q: 1.4, dest: S.voice, send: 0.1 });
    if (i > 0.3) S.tone({ type: "sawtooth", t: te, f0: 125, f1: 90, dur: exh, a: exh * 0.2, vol: vol * 0.28, lp: 520, dest: S.voice });
    if (exhausted || i > 0.78) {
      // Resonancia hueca dentro de la cavidad mandibular de Pac-Man + latido intracraneal ensordecedor
      const jawGain = exhausted ? 1.0 : (i - 0.78) / 0.22;
      S.formantVoice({
        t: te, dur: exh * 1.05, f0: 112, f1: 76, vol: vol * 0.55 * jawGain, a: exh * 0.18,
        formants: [[380, 5.2, 1.35], [920, 6.0, 0.85], [2150, 7.5, 0.32]],
        noiseMix: 0.55, vibRate: 14, vibDepth: 35, dest: S.voice, send: 0.14,
      });
      if (exhausted) {
        S.tone({ f0: 2150, f1: 1650, t, dur: inh * 0.9, a: inh * 0.4, vol: 0.015, dest: S.voice });
        // Latido doble pesado que retumba en los oidos mientras falta el aire
        S.tone({ f0: 54, f1: 32, t, dur: 0.16, a: 0.008, vol: 0.34, lp: 150, dest: S.voice });
        S.tone({ f0: 46, f1: 28, t: t + 0.16, dur: 0.19, a: 0.01, vol: 0.26, lp: 135, dest: S.voice });
      }
    }
  }

  gasp(S: Synth): void {
    const t = S.now;
    S.noise({ kind: "pink", t, dur: 0.55, a: 0.25, vol: 0.38, bp: 700, bp1: 2000, q: 1.0, dest: S.voice, send: 0.2 });
    S.noise({ kind: "pink", t, dur: 0.55, a: 0.25, vol: 0.15, bp: 2800, bp1: 3600, q: 3, dest: S.voice });
    S.tone({ f0: 2300, f1: 1700, t, dur: 0.6, a: 0.25, vol: 0.024, dest: S.voice });
    // Estertor cavernoso dentro de las fauces y golpe de sangre en los oidos
    S.formantVoice({
      t, dur: 0.62, f0: 158, f1: 92, vol: 0.22, a: 0.12,
      formants: [[390, 5.0, 1.4], [940, 5.8, 0.9], [2200, 7.0, 0.4]],
      noiseMix: 0.5, vibRate: 18, vibDepth: 45, dest: S.voice, send: 0.18,
    });
    S.tone({ f0: 56, f1: 26, t, dur: 0.35, a: 0.006, vol: 0.42, lp: 150, dest: S.voice });
    this.timer = Math.max(this.timer, 0.75);
  }

  sigh(S: Synth): void {
    const t = S.now;
    S.noise({ kind: "pink", t, dur: 1.5, a: 0.25, vol: 0.14, bp: 1000, bp1: 380, q: 1.2, dest: S.voice, send: 0.2 });
    S.tone({ type: "sawtooth", f0: 120, f1: 84, t, dur: 1.4, a: 0.25, vol: 0.05, lp: 500, dest: S.voice });
  }
}

/**
 * Voz posicional 3D HRTF de un fantasma con oclusion tras muros y susurros sinteticos procedurales.
 * - Espacializacion binaural HRTF real: permite distinguir izquierda/derecha/delante/detras con precision,
 *   especialmente util al estar inmovil dentro de un escondite.
 * - Oclusion acustica: cuando hay muros entre el fantasma y Pac-Man (`g.occluded`), un filtro paso bajo
 *   amortigua los agudos (~620 Hz) y aumenta el envio a reverberacion; al tener linea de vision se abre (~14.5 kHz).
 * - Escucha agudizada al esconderse (`hidden`): amplifica el rango auditivo (hasta 22 u) y la definicion de
 *   los pasos, jadeos y susurros.
 */
export class GhostVoice {
  private occFilter: BiquadFilterNode;
  private panner: PannerNode;
  private revSend: GainNode;
  private loud = 0;
  private stepT = 0.35;
  private stepSide = 0;
  private breathT = 1.4;
  private growlT = 0.8;
  private whisperT = 3.5 + rnd() * 3.0;
  private lastPhrase = -1;

  constructor(private S: Synth, readonly kind: number) {
    const ctx = S.ctx;
    this.occFilter = ctx.createBiquadFilter();
    this.occFilter.type = "lowpass";
    this.occFilter.frequency.value = 12000;
    this.occFilter.Q.value = 0.55;

    // HRTF (hq = true) para localizacion espacial 3D precisa de pasos, jadeos y susurros
    this.panner = S.panner(0, 1.2, 0, 2.1, 1.15, true);
    this.revSend = ctx.createGain();
    this.revSend.gain.value = 0.22;

    this.occFilter.connect(this.panner);
    this.panner.connect(S.sfx);
    this.panner.connect(this.revSend);
    this.revSend.connect(S.reverbSend);
  }

  update(dt: number, g: AudioGhost, tension: number, hidden = false): void {
    const S = this.S;
    const maxDist = hidden ? 22 : 16;
    if (g.dist > maxDist && this.loud < 0.06) { this.loud = 0; return; }
    S.setPannerPos(this.panner, g.x, g.y, g.z);

    // Oclusion tras muros: sonido amortiguado y cavernoso detras de paredes, nitido en el mismo pasillo
    const occluded = !!g.occluded;
    const targetCutoff = occluded ? (hidden ? 780 : 620) : 14500;
    const targetReverb = occluded ? 0.44 : 0.18;
    S.ramp(this.occFilter.frequency, targetCutoff, 0.14);
    S.ramp(this.revSend.gain, targetReverb, 0.14);

    const activeMode = (g.mode === "chase" || g.mode === "scatter" || g.mode === "frightened") && !g.frozen;
    const want = activeMode && !g.silent ? 1 : 0;
    this.loud += (want - this.loud) * Math.min(1, dt * 2.5);
    if (this.loud < 0.06 || g.dist > maxDist) return;

    const prox = clamp(1 - g.dist / maxDist, 0, 1);
    const hiddenBoost = hidden ? 1.35 : 1.0;
    const occGain = occluded ? 0.72 : 1.0;
    const vol = clamp(this.loud * (0.14 + prox * prox * 0.92) * hiddenBoost * occGain, 0, 1.35);
    const dest = this.occFilter;
    const speed = g.speed ?? 1.2;
    const isMoving = speed > 0.08;

    // 1. Pasos pesados y arrastrados 3D: sincronizados con la velocidad real del fantasma
    if (isMoving) {
      const speedFactor = clamp(speed / 1.2, 0.6, 1.85);
      this.stepT -= dt * speedFactor;
      if (this.stepT <= 0) {
        this.stepT = lerp(0.95, 0.42, prox) * (0.92 + rnd() * 0.16);
        this.stepSide = 1 - this.stepSide;
        ghostStep(S, vol * (this.stepSide ? 1.0 : 0.88), dest);
      }
    } else {
      this.stepT = 0.18;
    }

    // 2. Jadeos y estertor 3D: se oyen desde mas lejos cuando estas escondido en silencio,
    //    y se aceleran si el fantasma se detiene frente a tu escondite a olfatear/inspeccionar
    const breathRange = hidden ? 15 : 11;
    if (g.dist < breathRange) {
      const inspecting = !isMoving && g.dist < 3.2;
      this.breathT -= dt * (inspecting ? 1.65 : 1 + prox * 0.4);
      if (this.breathT <= 0) {
        this.breathT = lerp(2.8, 1.15, prox) * (0.88 + rnd() * 0.25);
        const pitchShift = 1 + (this.kind - 1.5) * 0.12;
        const bVol = vol * (inspecting ? 0.42 : 0.28);
        // Inhalacion aspera + exhalacion gutural espacializada
        S.noise({ kind: "pink", bp: 440 * pitchShift, bp1: 1180 * pitchShift, q: 2.1, dur: 0.65, a: 0.22, vol: bVol, dest });
        S.noise({ kind: "pink", bp: 960 * pitchShift, bp1: 340 * pitchShift, q: 2.4, dur: 0.72, a: 0.1, vol: bVol * 0.92, t: S.now + 0.6, dest });
        if (prox > 0.35 || inspecting) {
          S.formantVoice({
            t: S.now + 0.58, f0: 86 * pitchShift, f1: 58 * pitchShift, dur: 0.68,
            vol: bVol * 0.55, a: 0.12,
            formants: [[320 * pitchShift, 4.0, 1.2], [880 * pitchShift, 5.0, 0.8]],
            noiseMix: 0.45, vibRate: 19, vibDepth: 45, dest, send: 0,
          });
        }
      }
    }

    // 3. Gruñido grave a corta distancia
    if (g.dist < (hidden ? 6.5 : 5.0) && g.mode !== "frightened") {
      this.growlT -= dt;
      if (this.growlT <= 0) {
        this.growlT = 2.2 + rnd() * 1.5;
        S.formantVoice({
          t: S.now, f0: 62 + this.kind * 6, f1: 42 + this.kind * 4, dur: 1.05,
          vol: 0.34 * vol, a: 0.14,
          formants: [[260, 3.5, 1.4], [760, 4.5, 1.0]],
          dist: true, vibRate: 28, vibDepth: 70, noiseMix: 0.3, dest, send: 0,
        });
      }
    }

    // 4. Ecos de voz y susurros sinteticos procedurales en 3D (mas frecuentes al buscar o acechar un escondite)
    const whisperRange = hidden ? 19 : 14;
    if (g.dist < whisperRange && g.mode !== "frightened") {
      const rateMul = (g.searching ? 1.75 : 1.0) * (hidden ? 1.45 : 1.0) * (0.85 + tension * 0.5);
      this.whisperT -= dt * rateMul;
      if (this.whisperT <= 0) {
        this.whisperT = (hidden || g.searching ? 4.2 : 6.8) + rnd() * 4.5;
        this.whisperPhrase(vol * (hidden ? 0.85 : 0.72), dest);
      }
    }
  }

  /**
   * Sintetiza una frase susurrada articulada por silabas formanticas y consonantes fricativas
   * a traves del nodo 3D del fantasma, sin mostrar ningun texto en pantalla.
   */
  whisperPhrase(vol: number, dest: AudioNode = this.occFilter): void {
    const S = this.S;
    let idx = Math.floor(rnd() * WHISPER_PATTERNS.length);
    if (idx === this.lastPhrase) idx = (idx + 1) % WHISPER_PATTERNS.length;
    this.lastPhrase = idx;
    const pattern = WHISPER_PATTERNS[idx];

    // Timbre propio de cada entidad (0 Acechador grave, 1 Emboscadora espectral, 2 Resonador metalico, 3 Estatico quebrado)
    const baseF0 = [92, 168, 126, 108][this.kind % 4];
    const formantScale = [0.92, 1.16, 1.04, 0.96][this.kind % 4];
    const vibRate = [14, 7.5, 24, 34][this.kind % 4];

    let t = S.now + 0.02;
    for (let i = 0; i < pattern.length; i++) {
      const syl = pattern[i];
      if (syl.consBp) {
        const cd = syl.consDur ?? 0.04;
        S.noise({
          kind: "white", t, dur: cd * 1.2, a: 0.004,
          vol: vol * 0.34, bp: syl.consBp * formantScale, q: 3.8, dest, send: 0,
        });
        t += cd * 0.75;
      }

      const [f1, f2, f3] = VOWELS[syl.v];
      const f0 = baseF0 * syl.pitchMul * (0.97 + rnd() * 0.06);
      const dur = syl.dur * (0.94 + rnd() * 0.12);

      // Nucleo vocalico susurrado con formantes articulados y aliento espectral
      S.formantVoice({
        t, dur, f0, f1: f0 * 0.88, vol: vol * 0.46, a: dur * 0.25,
        formants: [
          [f1 * formantScale, 5.5, 1.15],
          [f2 * formantScale, 7.0, 0.95],
          [f3 * formantScale, 8.5, 0.45],
        ],
        noiseMix: 0.68, dist: this.kind === 0 || this.kind === 3,
        vibRate, vibDepth: 42, dest, send: 0,
      });

      // Capa de aspiracion susurrada que sigue el segundo formante
      S.noise({
        kind: "pink", t, dur, a: dur * 0.22,
        vol: vol * 0.32, bp: f2 * formantScale, bp1: f1 * formantScale, q: 3.2, dest, send: 0,
      });

      if (syl.sibilantTail) {
        S.noise({
          kind: "white", t: t + dur * 0.72, dur: 0.085, a: 0.01,
          vol: vol * 0.26, hp: 3200, bp: 4600 * formantScale, q: 2.8, dest, send: 0,
        });
      }

      t += dur + 0.035 + rnd() * 0.03;
    }
  }

  dispose(): void {
    try {
      this.occFilter.disconnect();
      this.panner.disconnect();
      this.revSend.disconnect();
    } catch { /* ya desconectado */ }
  }
}


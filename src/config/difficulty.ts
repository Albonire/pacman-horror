// Dificultades. Todos los multiplicadores se aplican sobre la definicion del nivel.

export type DifficultyId = "easy" | "normal" | "nightmare" | "oneLife";

export interface DifficultyDef {
  id: DifficultyId;
  label: string;
  tagline: string;
  lives: number;
  ghostSpeed: number; // multiplicador de velocidad de fantasmas
  frightTime: number; // multiplicador de la duracion del poder
  chaseBias: number; // >1 = fases de persecucion mas largas / dispersion mas corta
  releaseSpeed: number; // >1 = los fantasmas salen antes
  mistake: number; // prob. de que un fantasma elija un giro al azar en vez del optimo
  staminaDrain: number;
  batteryDrain: number;
  ambientScares: number; // frecuencia del director de sustos (1 = normal)
  extraGhosts: number; // fantasmas adicionales por encima de lo que define el nivel (max 4)
  scoreMult: number;
}

export const DIFFICULTIES: Record<DifficultyId, DifficultyDef> = {
  easy: {
    id: "easy",
    label: "APRENDIZ",
    tagline: "5 vidas. Fantasmas lentos. Poder más largo.",
    lives: 5,
    ghostSpeed: 0.88,
    frightTime: 1.3,
    chaseBias: 0.75,
    releaseSpeed: 0.7,
    mistake: 0.12,
    staminaDrain: 0.8,
    batteryDrain: 0.8,
    ambientScares: 0.6,
    extraGhosts: 0,
    scoreMult: 1,
  },
  normal: {
    id: "normal",
    label: "NORMAL",
    tagline: "3 vidas. La experiencia pensada.",
    lives: 3,
    ghostSpeed: 1,
    frightTime: 1,
    chaseBias: 1,
    releaseSpeed: 1,
    mistake: 0.04,
    staminaDrain: 1,
    batteryDrain: 1,
    ambientScares: 1,
    extraGhosts: 0,
    scoreMult: 1.5,
  },
  nightmare: {
    id: "nightmare",
    label: "PESADILLA",
    tagline: "2 vidas. Fantasmas rápidos y certeros. Sin piedad.",
    lives: 2,
    ghostSpeed: 1.1,
    frightTime: 0.7,
    chaseBias: 1.35,
    releaseSpeed: 1.5,
    mistake: 0,
    staminaDrain: 1.2,
    batteryDrain: 1.25,
    ambientScares: 1.6,
    extraGhosts: 1,
    scoreMult: 2.5,
  },
  oneLife: {
    id: "oneLife",
    label: "MUERTE SÚBITA",
    tagline: "1 vida. Pesadilla sin segunda oportunidad.",
    lives: 1,
    ghostSpeed: 1.1,
    frightTime: 0.7,
    chaseBias: 1.35,
    releaseSpeed: 1.5,
    mistake: 0,
    staminaDrain: 1.2,
    batteryDrain: 1.25,
    ambientScares: 1.8,
    extraGhosts: 1,
    scoreMult: 4,
  },
};

export const DIFFICULTY_ORDER: DifficultyId[] = ["easy", "normal", "nightmare", "oneLife"];

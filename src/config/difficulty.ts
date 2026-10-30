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
  // IA de caceria
  viewCells: number; // alcance visual en celdas
  fovDeg: number; // apertura total del cono de vision
  hearCells: number; // radio de oido en celdas
  memory: number; // segundos recordando la ultima posicion vista u oida
  searchTime: number; // segundos barriendo la zona tras perder el rastro
  stalkerSpeed: number; // multiplicador exclusivo de El Acechador en persecucion
  stalkerDelay: number; // retraso (s) del rastro que sigue El Acechador
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
    viewCells: 6,
    fovDeg: 100,
    hearCells: 6,
    memory: 2.0,
    searchTime: 2.0,
    stalkerSpeed: 1.10,
    stalkerDelay: 2.6,
  },
  normal: {
    id: "normal",
    label: "NORMAL",
    tagline: "4 vidas. La experiencia pensada.",
    lives: 4,
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
    viewCells: 9,
    fovDeg: 110,
    hearCells: 9,
    memory: 3.5,
    searchTime: 3,
    stalkerSpeed: 1.35,
    stalkerDelay: 1.8,
  },
  nightmare: {
    id: "nightmare",
    label: "PESADILLA",
    tagline: "3 vidas. Fantasmas rápidos y certeros. Sin piedad.",
    lives: 3,
    ghostSpeed: 1.05,
    frightTime: 0.8,
    chaseBias: 1.2,
    releaseSpeed: 1.12,
    mistake: 0,
    staminaDrain: 1.2,
    batteryDrain: 1.25,
    ambientScares: 1.6,
    extraGhosts: 1,
    scoreMult: 2.5,
    viewCells: 11,
    fovDeg: 120,
    hearCells: 11,
    memory: 5,
    searchTime: 3.5,
    stalkerSpeed: 1.45,
    stalkerDelay: 1.2,
  },
  oneLife: {
    id: "oneLife",
    label: "MUERTE SÚBITA",
    tagline: "1 vida. Pesadilla sin segunda oportunidad.",
    lives: 1,
    ghostSpeed: 1.08,
    frightTime: 0.7,
    chaseBias: 1.35,
    releaseSpeed: 1.2,
    mistake: 0,
    staminaDrain: 1.2,
    batteryDrain: 1.25,
    ambientScares: 1.8,
    extraGhosts: 1,
    scoreMult: 4,
    viewCells: 12,
    fovDeg: 120,
    hearCells: 12,
    memory: 5.5,
    searchTime: 4,
    stalkerSpeed: 1.45,
    stalkerDelay: 1.2,
  },
};

export const DIFFICULTY_ORDER: DifficultyId[] = ["easy", "normal", "nightmare", "oneLife"];

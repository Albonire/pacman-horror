// Campana de 6 niveles. Cada nivel define su tema visual y los parametros de la simulacion.

export type ThemeId = "offices" | "pool" | "arcade" | "boiler" | "ward" | "stomach";

export interface LevelDef {
  id: number;
  name: string;
  subtitle: string;
  flavor: string;
  theme: ThemeId;
  W: number;
  H: number;
  seed: number;
  loopChance: number;
  braid: number;
  ghosts: number; // cuantos fantasmas (1-4), en orden Blinky, Pinky, Inky, Clyde
  ghostSpeed: number; // multiplicador respecto a GHOST_SPEED_BASE
  frightTime: number; // segundos de poder
  /** Duraciones alternas: dispersion, persecucion, dispersion, ... El ultimo valor puede ser Infinity. */
  waves: number[];
  /** Segundos desde el inicio de cada intento tras los cuales despierta cada fantasma. */
  releaseTimes: [number, number, number, number];
  /** Puntos comidos tras los cuales despierta cada fantasma. */
  releaseDots: [number, number, number, number];
  fruitName: string;
}

export const CAMPAIGN: LevelDef[] = [
  {
    id: 0,
    name: "OFICINAS AMARILLAS",
    subtitle: "NIVEL 0",
    flavor: "El zumbido de 60 Hz nunca se detiene. Algo te mira desde el final del pasillo.",
    theme: "offices",
    W: 19, H: 19, seed: 7919, loopChance: 0.14, braid: 0.85,
    ghosts: 2, ghostSpeed: 0.95, frightTime: 10,
    waves: [10, 12, 10, 14, 8, 16, 6, Infinity],
    releaseTimes: [0, 14, 30, 48], releaseDots: [0, 14, 40, 70],
    fruitName: "OJO",
  },
  {
    id: 1,
    name: "LAS PISCINAS",
    subtitle: "NIVEL 1",
    flavor: "El agua no refleja nada. A veces, algo respira bajo la superficie.",
    theme: "pool",
    W: 19, H: 23, seed: 15838, loopChance: 0.15, braid: 0.85,
    ghosts: 3, ghostSpeed: 1.0, frightTime: 9,
    waves: [10, 14, 9, 15, 8, 17, 6, Infinity],
    releaseTimes: [0, 12, 26, 42], releaseDots: [0, 12, 34, 60],
    fruitName: "OJO",
  },
  {
    id: 2,
    name: "SALÓN RECREATIVO",
    subtitle: "NIVEL 2",
    flavor: "Las máquinas siguen encendidas. Todas muestran tu nombre. GAME OVER.",
    theme: "arcade",
    W: 23, H: 23, seed: 23757, loopChance: 0.16, braid: 0.85,
    ghosts: 4, ghostSpeed: 1.04, frightTime: 8,
    waves: [9, 14, 9, 16, 8, 18, 6, Infinity],
    releaseTimes: [0, 11, 24, 38], releaseDots: [0, 11, 30, 52],
    fruitName: "CEREZA PODRIDA",
  },
  {
    id: 3,
    name: "EL SUBSUELO",
    subtitle: "NIVEL 3",
    flavor: "Tuberías que laten. El vapor oculta lo que se acerca.",
    theme: "boiler",
    W: 23, H: 23, seed: 31676, loopChance: 0.17, braid: 0.9,
    ghosts: 4, ghostSpeed: 1.08, frightTime: 7,
    waves: [9, 16, 8, 18, 7, 20, 5, Infinity],
    releaseTimes: [0, 10, 22, 34], releaseDots: [0, 10, 26, 46],
    fruitName: "MANZANA PODRIDA",
  },
  {
    id: 4,
    name: "EL SANATORIO",
    subtitle: "NIVEL 4",
    flavor: "Camillas vacías. Nombres tachados en las paredes. Todos eran jugadores.",
    theme: "ward",
    W: 23, H: 27, seed: 39595, loopChance: 0.18, braid: 0.9,
    ghosts: 4, ghostSpeed: 1.12, frightTime: 6,
    waves: [8, 18, 8, 20, 6, 22, 5, Infinity],
    releaseTimes: [0, 10, 20, 32], releaseDots: [0, 10, 24, 42],
    fruitName: "MELÓN PODRIDO",
  },
  {
    id: 5,
    name: "EL HAMBRE",
    subtitle: "NIVEL FINAL",
    flavor: "Las paredes son carne. Siempre tuviste hambre. Ahora ella tiene hambre de ti.",
    theme: "stomach",
    W: 27, H: 27, seed: 47514, loopChance: 0.19, braid: 0.9,
    ghosts: 4, ghostSpeed: 1.16, frightTime: 5,
    waves: [8, 20, 7, 22, 6, 24, 5, Infinity],
    releaseTimes: [0, 9, 18, 28], releaseDots: [0, 12, 28, 46],
    fruitName: "LLAVE",
  },
];

import type { ThemeId } from "../../config/campaign";
import type { TexSet } from "../texkit";
import { arcadeCeiling, arcadeFloor, arcadeWall } from "./arcade";
import { boilerCeiling, boilerFloor, boilerWall } from "./boiler";
import { officesCeiling, officesFloor, officesWall } from "./offices";
import { poolCeiling, poolFloor, poolWall } from "./pool";
import { stomachCeiling, stomachFloor, stomachWall } from "./stomach";
import { wardCeiling, wardFloor, wardWall } from "./ward";

export interface ThemeTextures {
  wall: TexSet;
  floor: TexSet;
  ceiling: TexSet;
}

export interface ThemeVisual {
  id: ThemeId;
  fogColor: number;
  fogDensity: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  ambient: number;
  ambientIntensity: number;
  exposure: number;
  fixtureColor: number;
  /** Si existe, cada luminaria toma un color de la lista. */
  fixtureColors?: number[];
  fixtureIntensity: number; // intensidad de cada luz puntual del techo
  fixtureDistance: number;
  fixtureEvery: number; // una luminaria por cada N salas en diagonal
  fixtureStyle: "tube" | "panel" | "orb";
  brokenChance: number;
  deadChance: number;
  bloom: { strength: number; radius: number; threshold: number };
  grade: { tint: [number, number, number]; saturation: number; contrast: number };
  voidColor: number;
  headlamp: number;
  /** Celdas cubiertas por una tesela de suelo/techo. */
  floorCells: number;
  wallBump: number;
  /** Superficie de agua sobre el suelo (Piscinas). */
  water?: boolean;
  /** Las paredes laten con este color (El Hambre). */
  pulse?: { color: number; speed: number; amount: number };
  /** Rugosidad/brillo de las superficies: valores bajos = humedo. */
  textures: () => ThemeTextures;
}

const OFFICES: ThemeVisual = {
  id: "offices",
  fogColor: 0x120f06,
  fogDensity: 0.05,
  hemiSky: 0x7a6a3a,
  hemiGround: 0x2a2210,
  hemiIntensity: 0.4,
  ambient: 0x3a3018,
  ambientIntensity: 0.28,
  exposure: 1.0,
  fixtureColor: 0xffe9a8,
  fixtureIntensity: 9,
  fixtureDistance: 12,
  fixtureEvery: 3,
  fixtureStyle: "tube",
  brokenChance: 0.22,
  deadChance: 0.1,
  bloom: { strength: 0.32, radius: 0.5, threshold: 0.95 },
  grade: { tint: [1.04, 1.0, 0.86], saturation: 0.95, contrast: 1.05 },
  voidColor: 0x030201,
  headlamp: 0xfff0c0,
  floorCells: 2,
  wallBump: 0.8,
  textures: () => ({ wall: officesWall(), floor: officesFloor(), ceiling: officesCeiling() }),
};

const POOL: ThemeVisual = {
  id: "pool",
  fogColor: 0x061418,
  fogDensity: 0.046,
  hemiSky: 0x5aa0a8,
  hemiGround: 0x10282c,
  hemiIntensity: 0.42,
  ambient: 0x1a3c40,
  ambientIntensity: 0.32,
  exposure: 1.0,
  fixtureColor: 0xcfffff,
  fixtureIntensity: 10,
  fixtureDistance: 13,
  fixtureEvery: 3,
  fixtureStyle: "panel",
  brokenChance: 0.12,
  deadChance: 0.12,
  bloom: { strength: 0.38, radius: 0.55, threshold: 0.9 },
  grade: { tint: [0.9, 1.0, 1.05], saturation: 0.88, contrast: 1.05 },
  voidColor: 0x010608,
  headlamp: 0xe8ffff,
  floorCells: 2,
  wallBump: 0.7,
  water: true,
  textures: () => ({ wall: poolWall(), floor: poolFloor(), ceiling: poolCeiling() }),
};

const ARCADE: ThemeVisual = {
  id: "arcade",
  fogColor: 0x07040f,
  fogDensity: 0.054,
  hemiSky: 0x3a2a70,
  hemiGround: 0x0a0618,
  hemiIntensity: 0.38,
  ambient: 0x24103e,
  ambientIntensity: 0.34,
  exposure: 1.1,
  fixtureColor: 0xff40b0,
  fixtureColors: [0xff2fa0, 0x2ee6ff, 0x8a4cff, 0xffd21a, 0x2ee6ff, 0xff2fa0],
  fixtureIntensity: 11,
  fixtureDistance: 11,
  fixtureEvery: 2,
  fixtureStyle: "tube",
  brokenChance: 0.2,
  deadChance: 0.14,
  bloom: { strength: 0.6, radius: 0.7, threshold: 0.75 },
  grade: { tint: [1.0, 0.96, 1.08], saturation: 1.15, contrast: 1.1 },
  voidColor: 0x050010,
  headlamp: 0xfff0ff,
  floorCells: 2,
  wallBump: 0.6,
  textures: () => ({ wall: arcadeWall(), floor: arcadeFloor(), ceiling: arcadeCeiling() }),
};

const BOILER: ThemeVisual = {
  id: "boiler",
  fogColor: 0x120a06,
  fogDensity: 0.06,
  hemiSky: 0x5a4030,
  hemiGround: 0x180c08,
  hemiIntensity: 0.34,
  ambient: 0x2a1a10,
  ambientIntensity: 0.3,
  exposure: 1.0,
  fixtureColor: 0xffa050,
  fixtureColors: [0xffa050, 0xffa050, 0xff3a20, 0xffa050, 0xffb870],
  fixtureIntensity: 12,
  fixtureDistance: 10,
  fixtureEvery: 3,
  fixtureStyle: "tube",
  brokenChance: 0.3,
  deadChance: 0.15,
  bloom: { strength: 0.45, radius: 0.6, threshold: 0.85 },
  grade: { tint: [1.06, 0.95, 0.84], saturation: 0.9, contrast: 1.15 },
  voidColor: 0x050200,
  headlamp: 0xffe0b0,
  floorCells: 2,
  wallBump: 1.0,
  textures: () => ({ wall: boilerWall(), floor: boilerFloor(), ceiling: boilerCeiling() }),
};

const WARD: ThemeVisual = {
  id: "ward",
  fogColor: 0x0a1410,
  fogDensity: 0.055,
  hemiSky: 0x5a7a68,
  hemiGround: 0x101a14,
  hemiIntensity: 0.4,
  ambient: 0x1a2a20,
  ambientIntensity: 0.32,
  exposure: 1.0,
  fixtureColor: 0xc8ffd8,
  fixtureIntensity: 10,
  fixtureDistance: 12,
  fixtureEvery: 3,
  fixtureStyle: "panel",
  brokenChance: 0.38,
  deadChance: 0.14,
  bloom: { strength: 0.35, radius: 0.5, threshold: 0.9 },
  grade: { tint: [0.92, 1.04, 0.96], saturation: 0.75, contrast: 1.1 },
  voidColor: 0x020504,
  headlamp: 0xeaffef,
  floorCells: 2,
  wallBump: 0.7,
  textures: () => ({ wall: wardWall(), floor: wardFloor(), ceiling: wardCeiling() }),
};

const STOMACH: ThemeVisual = {
  id: "stomach",
  fogColor: 0x1a0508,
  fogDensity: 0.07,
  hemiSky: 0x8a3038,
  hemiGround: 0x2a0808,
  hemiIntensity: 0.5,
  ambient: 0x3a1010,
  ambientIntensity: 0.42,
  exposure: 1.1,
  fixtureColor: 0xff8a50,
  fixtureColors: [0xff8a50, 0xffd060, 0xff5a40, 0xa0ff70],
  fixtureIntensity: 9,
  fixtureDistance: 10,
  fixtureEvery: 3,
  fixtureStyle: "orb",
  brokenChance: 0,
  deadChance: 0.05,
  bloom: { strength: 0.5, radius: 0.8, threshold: 0.7 },
  grade: { tint: [1.1, 0.9, 0.9], saturation: 1.1, contrast: 1.1 },
  voidColor: 0x120204,
  headlamp: 0xffd8c8,
  floorCells: 2,
  wallBump: 1.3,
  pulse: { color: 0xff3a3a, speed: 1.9, amount: 0.9 },
  textures: () => ({ wall: stomachWall(), floor: stomachFloor(), ceiling: stomachCeiling() }),
};

/**
 * Oscurecimiento global de los mapas: menos luz de relleno (los pasillos dependen de la linterna y de las
 * pocas luminarias vivas), mas luminarias muertas o rotas y mas niebla. Los valores de cada tema de arriba
 * son el punto de partida; aqui se aplica el mismo factor a todos para que la progresion entre niveles se conserve.
 */
export const DARKEN = { fill: 0.62, fixture: 0.88, fog: 1.08, dead: 1.45, broken: 1.2, exposure: 0.95 };

function darker(t: ThemeVisual): ThemeVisual {
  return {
    ...t,
    hemiIntensity: t.hemiIntensity * DARKEN.fill,
    ambientIntensity: t.ambientIntensity * DARKEN.fill,
    fixtureIntensity: t.fixtureIntensity * DARKEN.fixture,
    fogDensity: t.fogDensity * DARKEN.fog,
    deadChance: Math.min(0.5, t.deadChance * DARKEN.dead),
    brokenChance: t.brokenChance === 0 ? 0 : Math.min(0.55, t.brokenChance * DARKEN.broken),
    exposure: t.exposure * DARKEN.exposure,
  };
}

export const THEMES: Record<ThemeId, ThemeVisual> = {
  offices: darker(OFFICES),
  pool: darker(POOL),
  arcade: darker(ARCADE),
  boiler: darker(BOILER),
  ward: darker(WARD),
  stomach: darker(STOMACH),
};

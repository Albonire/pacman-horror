import type { ThemeId } from "../../config/campaign";
import type { TexSet } from "../texkit";
import { officesCeiling, officesFloor, officesWall } from "./offices";

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
  fixtureIntensity: number; // intensidad de cada luz puntual del techo
  fixtureDistance: number;
  fixtureEvery: number; // una luminaria por cada N celdas (en diagonal)
  fixtureStyle: "tube" | "panel";
  brokenChance: number;
  bloom: { strength: number; radius: number; threshold: number };
  grade: { tint: [number, number, number]; saturation: number; contrast: number };
  voidColor: number;
  headlamp: number;
  /** Celdas cubiertas por una tesela de suelo/techo. */
  floorCells: number;
  wallBump: number;
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
  bloom: { strength: 0.32, radius: 0.5, threshold: 0.95 },
  grade: { tint: [1.04, 1.0, 0.86], saturation: 0.95, contrast: 1.05 },
  voidColor: 0x030201,
  headlamp: 0xfff0c0,
  floorCells: 2,
  wallBump: 1.0,
  textures: () => ({ wall: officesWall(), floor: officesFloor(), ceiling: officesCeiling() }),
};

// Los demas temas se completan mas adelante; hasta entonces reutilizan Oficinas con otra paleta.
function variant(id: ThemeId, patch: Partial<ThemeVisual>): ThemeVisual {
  return { ...OFFICES, id, ...patch };
}

export const THEMES: Record<ThemeId, ThemeVisual> = {
  offices: OFFICES,
  pool: variant("pool", {}),
  arcade: variant("arcade", {}),
  boiler: variant("boiler", {}),
  ward: variant("ward", {}),
  stomach: variant("stomach", {}),
};

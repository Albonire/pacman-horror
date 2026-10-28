import type { GhostKind } from "./ghost";

/** Eventos que la simulacion emite para que el motor reaccione (audio, efectos, UI). */
export type SimEvent =
  | { type: "dot"; x: number; z: number; points: number }
  | { type: "pellet"; x: number; z: number }
  | { type: "powerEnd" }
  | { type: "ghostEaten"; ghost: GhostKind; points: number; combo: number; x: number; z: number }
  | { type: "fruitSpawn"; x: number; z: number }
  | { type: "fruitExpire" }
  | { type: "fruitEaten"; points: number; x: number; z: number }
  | { type: "ghostWake"; ghost: GhostKind; startled: boolean }
  | { type: "ghostStartle"; ghost: GhostKind }
  | { type: "waveChange"; mode: "scatter" | "chase" }
  | { type: "caught"; ghost: GhostKind }
  | { type: "exitUnlocked" }
  | { type: "levelComplete" }
  | { type: "extraLife" }
  | { type: "wrap"; who: "player" | GhostKind }
  | { type: "step"; running: boolean }
  | { type: "exhausted" }
  | { type: "recovered" }
  | { type: "batteryDead" }
  | { type: "frozen"; ghost: GhostKind; frozen: boolean };

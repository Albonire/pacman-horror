import type { DifficultyId } from "../config/difficulty";
import type { Settings } from "./settings";

export type Phase =
  | "menu"
  | "loading"
  | "briefing"
  | "playing"
  | "paused"
  | "dying"
  | "gameover"
  | "levelclear"
  | "victory";

export interface RunSummary {
  difficulty: DifficultyId;
  levelIndex: number;
  levelName: string;
  score: number;
  highScore: number;
  newHighScore: boolean;
  lives: number;
  timeSeconds: number;
  ghostsEaten: number;
  deaths: number;
  dotsEaten: number;
  totalDots: number;
  isFinalLevel: boolean;
  caughtBy: number | null;
}

export interface HudState {
  score: number;
  highScore: number;
  lives: number;
  maxLives: number;
  dotsLeft: number;
  totalDots: number;
  levelLabel: string;
  stamina: number; // 0..1
  battery: number; // 0..1
  bite: number; // 0..1, 1 = listo para morder
  exhausted: boolean;
  lightOn: boolean;
  powerFrac: number; // 0..1, 0 = sin poder
  powerLow: boolean;
  camera: "fp" | "tp";
  /** El jugador esta dentro de un escondite (primera persona forzada). */
  hidden: boolean;
  /** Retícula de mira: solo en primera persona y fuera del escondite. */
  crosshair: boolean;
  sonar: boolean;
  exitOpen: boolean;
  fruitName: string | null;
  muted: boolean;
}

/** Superficie que el motor usa para hablar con la interfaz (implementada por React). */
export interface HudApi {
  update(s: HudState): void;
  message(text: string, seconds: number, tone?: "info" | "warn" | "good"): void;
  /** Texto flotante; sx, sy en 0..1 (pantalla) si se proyecta desde una posicion 3D. */
  popup(text: string, tone?: "points" | "combo" | "bonus", sx?: number, sy?: number): void;
  setVisible(v: boolean): void;
  /** Destello a pantalla completa: color css, opacidad inicial, duracion en segundos. */
  flash(color: string, opacity: number, seconds: number): void;
  setVignette(opacity: number): void;
  showHint(text: string | null): void;
  setSonarVisible(v: boolean): void;
}

export interface GameCallbacks {
  onPhase(phase: Phase): void;
  onSettings(s: Settings): void;
}

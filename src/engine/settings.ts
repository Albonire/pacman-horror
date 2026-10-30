// Ajustes del usuario y progreso guardado (localStorage con tolerancia a fallos).

import { CAMPAIGN } from "../config/campaign";

export type ScareLevel = "full" | "reduced" | "nofullscreen" | "off";
export type Quality = "high" | "medium" | "low";
export type ControlMode = "mouse" | "keyboard";

export interface Settings {
  sensitivity: number; // 0.3 .. 2.5
  invertY: boolean;
  fov: number; // horizontal, 70 .. 110
  volume: number; // 0 .. 1
  scares: ScareLevel;
  headBob: boolean;
  quality: Quality;
  controlMode: ControlMode;
  brightness: number; // 0.7 .. 1.6
  muted: boolean;
  /** Pide pantalla completa con el primer clic o toque dentro del juego. */
  fullscreen: boolean;
  /** Baja la resolucion de render solo cuando el equipo no da los fps. */
  dynamicRes: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  sensitivity: 1,
  invertY: false,
  fov: 90,
  volume: 0.8,
  scares: "full",
  headBob: true,
  quality: "high",
  controlMode: "mouse",
  brightness: 1,
  muted: false,
  fullscreen: true,
  dynamicRes: true,
};

export interface Progress {
  highScore: number;
  unlocked: number; // indice maximo de nivel desbloqueado
  bestScoreByLevel: Record<string, number>;
  warningAccepted: boolean;
  completedRuns: number;
}

export const DEFAULT_PROGRESS: Progress = {
  highScore: 0,
  unlocked: 0,
  bestScoreByLevel: {},
  warningAccepted: false,
  completedRuns: 0,
};

const SETTINGS_KEY = "umbral.settings.v1";
const PROGRESS_KEY = "umbral.progress.v1";
const MIGRATION_CONTROL_KEY = "umbral.migrated.control_v2";

function read<T extends object>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return { ...fallback };
    const parsed = JSON.parse(raw) as Partial<T>;
    return { ...fallback, ...parsed };
  } catch {
    return { ...fallback };
  }
}

function write(key: string, value: object): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage not available
  }
}

export function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}

export function sanitizeSettings(s: Settings): Settings {
  return {
    ...s,
    sensitivity: clamp(Number(s.sensitivity) || 1, 0.2, 3),
    fov: clamp(Number(s.fov) || 90, 60, 115),
    volume: clamp(Number.isFinite(Number(s.volume)) ? Number(s.volume) : 0.8, 0, 1),
    brightness: clamp(Number(s.brightness) || 1, 0.6, 1.8),
    scares: (["full", "reduced", "nofullscreen", "off"] as const).includes(s.scares) ? s.scares : "full",
    quality: (["high", "medium", "low"] as const).includes(s.quality) ? s.quality : "high",
    controlMode: s.controlMode === "keyboard" ? "keyboard" : "mouse",
    fullscreen: s.fullscreen !== false,
    dynamicRes: s.dynamicRes !== false,
  };
}

export function loadSettings(): Settings {
  const s = read(SETTINGS_KEY, DEFAULT_SETTINGS);
  if (s.fov === 78) s.fov = DEFAULT_SETTINGS.fov; // old default value (vertical fov)
  // migrate legacy controlMode: "keyboard" caused by previous bug in onLockError
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      if (window.localStorage.getItem(MIGRATION_CONTROL_KEY) !== "1") {
        window.localStorage.setItem(MIGRATION_CONTROL_KEY, "1");
        if (s.controlMode === "keyboard") {
          s.controlMode = "mouse";
          write(SETTINGS_KEY, s);
        }
      }
    }
  } catch {
    // localStorage not available
  }
  return sanitizeSettings(s);
}
export function saveSettings(s: Settings): void { write(SETTINGS_KEY, s); }
/** Descarta valores corruptos del almacenamiento (tipos erroneos, niveles fuera de rango). */
export function sanitizeProgress(p: Progress, levelCount: number): Progress {
  const num = (v: unknown, d: number): number => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : d);
  const best: Record<string, number> = {};
  if (p.bestScoreByLevel && typeof p.bestScoreByLevel === "object") {
    for (const [k, v] of Object.entries(p.bestScoreByLevel)) if (/^\d+$/.test(k) && Number(k) < levelCount) best[k] = num(v, 0);
  }
  return {
    highScore: num(p.highScore, 0),
    unlocked: clamp(Math.floor(num(p.unlocked, 0)), 0, Math.max(0, levelCount - 1)),
    bestScoreByLevel: best,
    warningAccepted: p.warningAccepted === true,
    completedRuns: Math.floor(num(p.completedRuns, 0)),
  };
}

export function loadProgress(): Progress { return sanitizeProgress(read(PROGRESS_KEY, DEFAULT_PROGRESS), CAMPAIGN.length); }
export function saveProgress(p: Progress): void { write(PROGRESS_KEY, p); }

// Ajustes del usuario y progreso guardado (localStorage con tolerancia a fallos).

export type ScareLevel = "full" | "reduced" | "off";
export type Quality = "high" | "medium" | "low";
export type ControlMode = "mouse" | "keyboard";

export interface Settings {
  sensitivity: number; // 0.3 .. 2.5
  invertY: boolean;
  fov: number; // 60 .. 100
  volume: number; // 0 .. 1
  scares: ScareLevel;
  headBob: boolean;
  quality: Quality;
  controlMode: ControlMode;
  brightness: number; // 0.7 .. 1.6
  muted: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  sensitivity: 1,
  invertY: false,
  fov: 78,
  volume: 0.8,
  scares: "full",
  headBob: true,
  quality: "high",
  controlMode: "mouse",
  brightness: 1,
  muted: false,
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
    /* almacenamiento no disponible: se ignora */
  }
}

export function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}

export function sanitizeSettings(s: Settings): Settings {
  return {
    ...s,
    sensitivity: clamp(Number(s.sensitivity) || 1, 0.2, 3),
    fov: clamp(Number(s.fov) || 78, 55, 110),
    volume: clamp(Number.isFinite(Number(s.volume)) ? Number(s.volume) : 0.8, 0, 1),
    brightness: clamp(Number(s.brightness) || 1, 0.6, 1.8),
    scares: (["full", "reduced", "off"] as const).includes(s.scares) ? s.scares : "full",
    quality: (["high", "medium", "low"] as const).includes(s.quality) ? s.quality : "high",
    controlMode: s.controlMode === "keyboard" ? "keyboard" : "mouse",
  };
}

export function loadSettings(): Settings { return sanitizeSettings(read(SETTINGS_KEY, DEFAULT_SETTINGS)); }
export function saveSettings(s: Settings): void { write(SETTINGS_KEY, s); }
export function loadProgress(): Progress { return read(PROGRESS_KEY, DEFAULT_PROGRESS); }
export function saveProgress(p: Progress): void { write(PROGRESS_KEY, p); }

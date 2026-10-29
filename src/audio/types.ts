import type { ThemeId } from "../config/campaign";
import type { GhostMode } from "../sim/ghost";

export interface AudioGhost {
  kind: 0 | 1 | 2 | 3;
  x: number;
  y: number;
  z: number;
  mode: GhostMode;
  frozen: boolean;
  startled: boolean;
  dist: number; // distancia al jugador en el mundo
}

export interface AudioFrame {
  dt: number;
  listener: { x: number; y: number; z: number; fx: number; fy: number; fz: number };
  tension: number; // 0..1
  exertion: number; // 0..1 (esfuerzo fisico -> respiracion)
  exhausted: boolean;
  moving: boolean;
  running: boolean;
  powered: boolean;
  powerLow: boolean;
  progress: number; // 0..1 de puntos comidos
  chasing: boolean;
  sonar: boolean;
  theme: ThemeId;
  ghosts: AudioGhost[];
  /** Frecuencia de los sonidos de pavor ambientales (0 = ninguno). */
  dread: number;
}

/** Superficie de audio que usa el motor. Implementada por HorrorAudio (Web Audio) y NullAudio (silencio). */
export interface GameAudio {
  /** Aviso de estado del audio (p. ej. reinicio tras un fallo). */
  onStatus?: (msg: string) => void;
  /** Pico reciente de la salida (solo depuracion). */
  readonly lastPeak?: number;
  /** Baja ambiente y musica un instante antes de un susto. */
  duck?(level: number, secs: number): void;
  resume(): void;
  suspend(): void;
  setVolume(v: number): void;
  setMuted(m: boolean): void;
  setTheme(theme: ThemeId): void;
  update(f: AudioFrame): void;

  playDot(streak: number): void;
  playPellet(): void;
  playPowerEnd(): void;
  playGhostEaten(combo: number): void;
  playFruitSpawn(): void;
  playFruit(): void;
  playStep(running: boolean): void;
  playExhausted(): void;
  playRecovered(): void;
  playBatteryDead(): void;
  playFlashlight(on: boolean): void;
  playExitUnlocked(): void;
  playLevelComplete(): void;
  playExtraLife(): void;
  playWake(kind: number, startled: boolean): void;
  playStartle(kind: number): void;
  playFreeze(frozen: boolean): void;
  playBite(): void;
  playPing(): void;
  playWaveChange(chase: boolean): void;
  playWrap(): void;
  /** Susto de muerte: grito unico del fantasma. */
  playDeathScream(kind: number): void;
  playGameOver(): void;
  playUiClick(): void;
  /** Sustos ambientales. */
  playStinger(strength: number): void;
  playBang(x: number, y: number, z: number): void;
  playWhisper(x: number, y: number, z: number): void;
  playFootsteps(x: number, y: number, z: number): void;
  playBlackout(on: boolean): void;
  /** Efecto de screamer de flash (cara a pantalla completa). */
  playScreamerFlash(): void;
  playHeartbeat(strength: number): void;
  /** Golpe de susto sincronizado con un destello de screamer. */
  playScareHit(strength: number): void;
  /** Fuerza un sonido de pavor concreto (depuracion y pruebas). */
  playDread(kind: string): void;
  dispose(): void;
}

export class NullAudio implements GameAudio {
  resume(): void {}
  suspend(): void {}
  setVolume(): void {}
  setMuted(): void {}
  setTheme(): void {}
  update(): void {}
  playDot(): void {}
  playPellet(): void {}
  playPowerEnd(): void {}
  playGhostEaten(): void {}
  playFruitSpawn(): void {}
  playFruit(): void {}
  playStep(): void {}
  playExhausted(): void {}
  playRecovered(): void {}
  playBatteryDead(): void {}
  playFlashlight(): void {}
  playExitUnlocked(): void {}
  playLevelComplete(): void {}
  playExtraLife(): void {}
  playWake(): void {}
  playStartle(): void {}
  playFreeze(): void {}
  playBite(): void {}
  playPing(): void {}
  playWaveChange(): void {}
  playWrap(): void {}
  playDeathScream(): void {}
  playGameOver(): void {}
  playUiClick(): void {}
  playStinger(): void {}
  playBang(): void {}
  playWhisper(): void {}
  playFootsteps(): void {}
  playBlackout(): void {}
  playScreamerFlash(): void {}
  playHeartbeat(): void {}
  playScareHit(): void {}
  playDread(): void {}
  dispose(): void {}
}

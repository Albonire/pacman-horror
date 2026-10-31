import type { ThemeId } from "../config/campaign";
import type { FaceKind } from "../gfx/faces";
import type { GhostMode } from "../sim/ghost";

export interface AudioGhost {
  /** Se mueve en silencio: no hay pasos, ni respiracion, ni gruñido que lo delaten. */
  silent?: boolean;
  kind: FaceKind;
  x: number;
  y: number;
  z: number;
  mode: GhostMode;
  frozen: boolean;
  startled: boolean;
  dist: number; // distancia al jugador en el mundo
  /** True si hay al menos un muro entre el fantasma y el oyente (amortigua agudos y refuerza el eco). */
  occluded?: boolean;
  /** Velocidad actual en celdas/s (0 si esta detenido frente a un escondite). */
  speed?: number;
  /** True si el fantasma busca un rastro reciente o inspecciona un escondite cercano. */
  searching?: boolean;
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
  /** 0..1: cuan dentro de una zona oscura esta el jugador. */
  darkness: number;
  /** True si el jugador esta escondido en un armario. */
  hidden?: boolean;
  /** True si un fantasma peligroso esta cerca del escondite. */
  hiddenNearGhost?: boolean;
  /** Contiene la respiracion: no suena la respiracion, solo el corazon. */
  holding?: boolean;
  /** True durante la secuencia de muerte: se corta la respiracion para dejar silencio real. */
  dead?: boolean;
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
  /** Susto de muerte: grito unico del fantasma. `gain` lo atenua segun el nivel de sustos. */
  playDeathScream(kind: FaceKind, gain?: number): void;
  /** Ambiente del menu (bucle grabado): true en menu y ficha de nivel. */
  setMenuBed?(on: boolean): void;
  playGameOver(): void;
  playUiClick(): void;
  /** Sustos ambientales. */
  playStinger(strength: number): void;
  playBang(x: number, y: number, z: number): void;
  playWhisper(x: number, y: number, z: number): void;
  playFootsteps(x: number, y: number, z: number): void;
  /** Pulso de la salida abierta, desde la direccion de la salida. */
  playBeacon(x: number, y: number, z: number): void;
  playBlackout(on: boolean): void;
  /** Efecto de screamer de flash (cara a pantalla completa): impacto fuerte y momentaneo. */
  playScreamerFlash(strength?: number): void;
  playHeartbeat(strength: number): void;
  playPickup(): void;
  playSwitch(): void;
  playHide(inside: boolean): void;
  /** Jadeo al agotar el aliento dentro del armario. */
  playGasp(): void;
  /** Golpe de susto sincronizado con un destello de screamer. */
  playScareHit(strength: number): void;
  /** Fuerza un sonido de pavor concreto (depuracion y pruebas). */
  playDread(kind: string): void;
  /** Eventos ambientales dinamicos (vapor, apagones de zona y pasillos cambiantes). */
  playSteamWarning(x: number, y: number, z: number): void;
  playSteamBurst(x: number, y: number, z: number): void;
  playSteamCough(): void;
  playBreakerTrip(x: number, y: number, z: number): void;
  playMazeShift(x: number, y: number, z: number): void;
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
  playDeathScream(_kind?: FaceKind, _gain?: number): void {}
  playGameOver(): void {}
  playUiClick(): void {}
  playStinger(): void {}
  playBang(): void {}
  playWhisper(): void {}
  playFootsteps(): void {}
  playBeacon(): void {}
  playBlackout(): void {}
  playScreamerFlash(_strength?: number): void {}
  playHeartbeat(): void {}
  playPickup(): void {}
  playSwitch(): void {}
  playHide(): void {}
  playGasp(): void {}
  playScareHit(): void {}
  playDread(): void {}
  playSteamWarning(): void {}
  playSteamBurst(): void {}
  playSteamCough(): void {}
  playBreakerTrip(): void {}
  playMazeShift(): void {}
  dispose(): void {}
}

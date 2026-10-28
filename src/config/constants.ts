// PROTOCOLO UMBRAL — constantes globales

export const CELL = 1.7;          // tamaño de celda en unidades del mundo
export const WALL_H = 2.7;        // altura de las paredes
export const EYE_H = 1.55;        // altura de cámara en primera persona

// Movimiento (celdas / segundo)
export const PLAYER_SPEED = 5.1;
export const PLAYER_RUN_SPEED = 7.3;
export const GHOST_SPEED = 4.55;
export const GHOST_FRIGHT_SPEED = 2.7;
export const GHOST_EATEN_SPEED = 8.6;

// Estados / tiempos (segundos)
export const FRIGHT_TIME = 10;
export const EATEN_RESPAWN_TIME = 4.5;
export const INVULN_TIME = 2.2;
export const POWER_HOLD_TIME = 1.5;
export const RADAR_PING_INTERVAL = 2.0;
export const RADAR_SLOW = 0.42;
export const STAMINA_PANT_TIME = 3.0;

// Jugador
export const PLAYER_LIVES = 3;
export const STAMINA_MAX = 100;
export const STAMINA_DRAIN = 30;     // por seg corriendo
export const STAMINA_RECOVER = 24;   // por seg quieto/caminando
export const BATTERY_MAX = 100;
export const BATTERY_DRAIN = 3.5;    // por seg con linterna encendida
export const BATTERY_RECOVER = 6.5;  // por seg con linterna apagada
export const BATTERY_STARE_DRAIN = 9; // drenaje extra al mirar al Estático

// Interacción (en celdas)
export const INTERACT_RANGE = 1.15;
export const DOT_COLLECT_RANGE = 0.6;
export const GHOST_TOUCH_RANGE = 0.66;

// IA
export const GHOST_HEAR_RADIUS = 10;
export const RADAR_NOISE_RADIUS = 8;
export const RUN_NOISE_RADIUS = 6;
export const ESTATICO_FREEZE_RANGE = 11;
export const ESTATICO_STARE_LIMIT = 4.0; // seg mirando para drenar batería extra

// Niveles: semilla y prob. de bucles (más bucles = más flanqueo)
export const LEVELS: { seed: number; loopChance: number }[] = [
  { seed: 7919, loopChance: 0.14 },
  { seed: 15838, loopChance: 0.16 },
  { seed: 23757, loopChance: 0.18 },
];

// Paleta Backrooms (Nivel 0)
export const COLORS = {
  fog: 0x0b0a06,
  wall: 0xc8b568,
  wallDark: 0x6b5c33,
  floor: 0x8f7e4f,
  ceiling: 0x9a927a,
  baseboard: 0x3a2f1c,
  dot: 0xffbf40,
  pellet: 0xff5a1f,
  exitLocked: 0x552222,
  exitOpen: 0x39ff6a,
  flashlight: 0xfff2c8,
  ghostRed: 0x1a0d0d,
  ghostPale: 0xd8d2c4,
  ghostRing: 0x6e4a2a,
  ghostStatic: 0xb9b3a6,
  frightened: 0x4a6cff,
};

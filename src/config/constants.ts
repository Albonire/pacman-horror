// UMBRAL: constantes globales de la simulacion y el render.
// Unidades del mundo: metros aproximados. Las velocidades de fantasmas van en celdas/s.

export const CELL = 2.4; // lado de una celda del laberinto
export const WALL_H = 3.4; // altura de paredes
export const EYE_H = 0.82; // altura de los ojos de Pac-Man (es bajito: todo se ve enorme)

// ---------------- Jugador ----------------
export const PLAYER_RADIUS = 0.34;
export const PLAYER_WALK = 3.7; // u/s
export const PLAYER_RUN = 5.8; // u/s
export const PLAYER_ACCEL = 26; // u/s^2
export const PLAYER_DECEL = 34; // u/s^2
export const SONAR_SLOW = 0.5; // multiplicador de velocidad con el sonar abierto

export const STAMINA_MAX = 100;
export const STAMINA_DRAIN = 20; // por segundo corriendo
export const STAMINA_RECOVER = 16; // por segundo sin correr
export const STAMINA_EXHAUST_BELOW = 0; // al llegar a 0 queda agotado
export const STAMINA_RESUME_AT = 25; // se puede volver a correr al recuperar esto

export const BATTERY_MAX = 100;
export const BATTERY_DRAIN = 2.3; // por segundo con la luz encendida
export const BATTERY_RECOVER = 5.5; // por segundo con la luz apagada
export const BATTERY_STARE_DRAIN = 5; // extra mientras el Estatico esta congelado

// ---------------- Fantasmas ----------------
export const GHOST_RADIUS = 0.5;
export const GHOST_CATCH_DIST = 0.82; // distancia centro a centro que cuenta como atrapado
export const GHOST_SPEED_BASE = 1.25; // celdas/s
export const GHOST_FRIGHT_FACTOR = 0.55;
export const GHOST_EATEN_SPEED = 3.4; // celdas/s
export const GHOST_TUNNEL_FACTOR = 0.7;
export const GHOST_HEAR_RADIUS = 9; // celdas (distancia BFS)

// ---------------- Mecanicas ----------------
export const DOT_EAT_RANGE = 0.78;
export const PELLET_EAT_RANGE = 0.95;
export const FRUIT_EAT_RANGE = 0.95;
export const EXTRA_LIFE_SCORE = 10000;
export const RESPAWN_GRACE = 5; // segundos sin fantasmas activos tras reaparecer
export const INVULN_TIME = 2.0;
export const SONAR_PING_INTERVAL = 2.0;

export const SCORE = {
  dot: 10,
  pellet: 50,
  ghostCombo: [200, 400, 800, 1600],
  fruitBase: 300,
  levelClear: 1000,
} as const;

export const COLORS = {
  dot: 0xffd24a,
  pacman: 0xf5d20a,
  exitLocked: 0x6b1c1c,
  exitOpen: 0x39ff6a,
  frightened: 0x3b5bff,
} as const;

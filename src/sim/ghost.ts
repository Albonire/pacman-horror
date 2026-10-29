// Estado de un fantasma + IA de seleccion de direccion en la rejilla (pura, testeable).

import { GHOST_HEAR_RADIUS } from "../config/constants";
import { DIRS, UNREACHABLE, type Cell, type Maze } from "./maze";
import type { Rng } from "./rng";

export type GhostKind = 0 | 1 | 2 | 3; // 0 Blinky, 1 Pinky, 2 Inky, 3 Clyde
export type GhostMode = "dormant" | "scatter" | "chase" | "frightened" | "eaten";

export const GHOST_NAMES = ["EL ACECHADOR", "LA EMBOSCADORA", "EL RESONADOR", "EL ESTÁTICO"] as const;

export class GhostSim {
  readonly kind: GhostKind;
  readonly spawn: Cell;
  readonly corner: Cell;

  mode: GhostMode = "dormant";
  // movimiento en rejilla
  cx: number;
  cy: number;
  dx = 0;
  dy = 1;
  p = 0;
  moving = false;
  // posicion en el mundo (se actualiza en refreshWorld)
  x = 0;
  z = 0;
  yaw = 0;

  /** Cuenta atras (s) para despertar tras ser comido o al iniciar un intento. */
  wakeTimer = 0;
  /** Despierta por proximidad aunque no le toque aun. */
  startled = false;
  reverseQueued = false;
  frozen = false; // El Estatico: inmovil mientras se le mira
  watched = 0; // segundos acumulados siendo mirado
  speedCells = 1.5; // velocidad efectiva calculada en cada tick
  /** Segundos desde que desperto (para animaciones de aparicion). */
  awakeFor = 0;
  /** Impulso de velocidad tras dejar de ser observado (El Estatico). */
  dash = 0;

  private field: Int16Array;

  constructor(kind: GhostKind, maze: Maze, spawn: Cell, corner: Cell) {
    this.kind = kind;
    this.spawn = spawn;
    this.corner = corner;
    this.cx = spawn[0];
    this.cy = spawn[1];
    this.field = new Int16Array(maze.W * maze.H);
    this.resetToSpawn(maze, "dormant");
  }

  get cell(): Cell { return [this.cx, this.cy]; }
  get active(): boolean { return this.mode !== "dormant"; }
  /** Puede matar al jugador. */
  get lethal(): boolean { return this.mode === "scatter" || this.mode === "chase"; }

  resetToSpawn(maze: Maze, mode: GhostMode): void {
    this.cx = this.spawn[0];
    this.cy = this.spawn[1];
    this.p = 0;
    this.moving = false;
    this.mode = mode;
    this.frozen = false;
    this.watched = 0;
    this.reverseQueued = false;
    this.startled = false;
    this.awakeFor = 0;
    this.dash = 0;
    // mira hacia un pasillo abierto
    let best: Cell = [0, 1];
    for (const d of DIRS) if (maze.isWalkable(this.cx + d[0], this.cy + d[1])) { best = d; break; }
    this.dx = best[0];
    this.dy = best[1];
    this.refreshWorld(maze);
  }

  /** La arista actual cruza el tunel (celda destino fuera de la rejilla): mide 2 celdas fisicas. */
  private crossesTunnel(maze: Maze): boolean {
    const nx = this.cx + this.dx;
    return this.cy === maze.tunnelRow && this.dy === 0 && (nx < 0 || nx >= maze.W);
  }

  /** Calcula x/z/yaw a partir de la celda y el progreso. En el tunel la ruta pasa por dos medias celdas conectoras. */
  refreshWorld(maze: Maze): void {
    const a = maze.cellToWorld(this.cx, this.cy);
    if (this.crossesTunnel(maze)) {
      const b = maze.cellToWorld(this.cx + this.dx, this.cy);
      const s = this.p * 2;
      if (s < 1) {
        this.x = a.x + (b.x - a.x) * s;
      } else {
        const fromX = b.x - Math.sign(this.dx) * maze.tunnelShift;
        const c = maze.cellToWorld(maze.wrapX(this.cx + this.dx, this.cy), this.cy);
        this.x = fromX + (c.x - fromX) * (s - 1);
      }
      this.z = a.z;
    } else {
      const b = maze.cellToWorld(this.cx + this.dx, this.cy + this.dy);
      this.x = a.x + (b.x - a.x) * this.p;
      this.z = a.z + (b.z - a.z) * this.p;
    }
    this.yaw = Math.atan2(this.dx, this.dy);
  }

  /** Avanza `dt` segundos a `speedCells` celdas/s; `decide` se llama al llegar a cada celda. */
  advance(maze: Maze, dt: number, decide: (g: GhostSim) => Cell | null): boolean {
    let wrapped = false;
    if (!this.moving) {
      const nd = decide(this);
      if (nd && maze.isWalkable(this.cx + nd[0], this.cy + nd[1])) {
        this.dx = nd[0]; this.dy = nd[1]; this.moving = true;
      } else { this.refreshWorld(maze); return false; }
    }
    let remaining = this.speedCells * dt; // celdas fisicas por recorrer
    for (let guard = 0; remaining > 1e-9 && guard < 8; guard++) {
      const len = this.crossesTunnel(maze) ? 2 : 1;
      const need = (1 - this.p) * len;
      if (remaining < need) { this.p += remaining / len; remaining = 0; break; }
      remaining -= need;
      const oldX = this.cx;
      this.cx = maze.wrapX(this.cx + this.dx, this.cy + this.dy);
      this.cy = this.cy + this.dy;
      if (Math.abs(this.cx - oldX) > 1) wrapped = true;
      this.p = 0;
      const nd = decide(this);
      if (nd && maze.isWalkable(this.cx + nd[0], this.cy + nd[1])) {
        this.dx = nd[0]; this.dy = nd[1];
      } else { this.moving = false; break; }
    }
    this.refreshWorld(maze);
    return wrapped;
  }

  fieldTo(maze: Maze, target: Cell): Int16Array {
    return maze.distanceField([target], this.field);
  }
}

// ---------------- IA ----------------

export interface AIContext {
  maze: Maze;
  playerCell: Cell;
  playerHeading: Cell; // direccion cardinal en la que mira/avanza el jugador
  playerNoisy: boolean; // corriendo o con el sonar abierto
  ghosts: readonly GhostSim[];
  rng: Rng;
  mistake: number; // prob. de giro aleatorio
  hearRadius?: number;
}

/** Objetivo de persecucion de cada fantasma (versiones del Pac-Man clasico adaptadas). */
export function chaseTarget(g: GhostSim, ctx: AIContext): Cell {
  const { maze, playerCell: pc, playerHeading: ph } = ctx;
  switch (g.kind) {
    case 0: // Acechador: directo
      return pc;
    case 1: { // Emboscadora: 4 celdas por delante; si esta cerca, directo
      if (maze.distance(g.cell, pc) <= 3) return pc;
      return maze.nearestWalkable([pc[0] + ph[0] * 4, pc[1] + ph[1] * 4]);
    }
    case 2: { // Resonador: flanqueo con el Acechador, o te oye si haces ruido
      const hear = ctx.hearRadius ?? GHOST_HEAR_RADIUS;
      if (ctx.playerNoisy && maze.distance(g.cell, pc) <= hear) return pc;
      const blinky = ctx.ghosts.find((o) => o.kind === 0 && o.active) ?? g;
      const px = pc[0] + ph[0] * 2, py = pc[1] + ph[1] * 2;
      return maze.nearestWalkable([blinky.cx + 2 * (px - blinky.cx), blinky.cy + 2 * (py - blinky.cy)]);
    }
    default: // Estatico: timido
      return maze.distance(g.cell, pc) > 8 ? pc : g.corner;
  }
}

function walkableDirs(g: GhostSim, maze: Maze): Cell[] {
  const out: Cell[] = [];
  for (const d of DIRS) if (maze.isWalkable(g.cx + d[0], g.cy + d[1])) out.push(d);
  return out;
}

/**
 * Elige una direccion en una celda. Reglas clasicas: nunca da media vuelta salvo que
 * se haya encolado una inversion (cambio de fase) o sea un callejon sin salida.
 */
function pickLegal(g: GhostSim, maze: Maze): { options: Cell[]; forced: Cell | null } {
  const all = walkableDirs(g, maze);
  const rev: Cell = [-g.dx, -g.dy];
  const hasRev = all.some((d) => d[0] === rev[0] && d[1] === rev[1]);
  if (g.reverseQueued) {
    g.reverseQueued = false;
    if (hasRev) return { options: [], forced: rev };
  }
  const options = all.filter((d) => !(d[0] === rev[0] && d[1] === rev[1]));
  if (!options.length) return { options, forced: hasRev ? rev : null };
  return { options, forced: null };
}

/** Direccion a seguir hacia un objetivo: minimiza la distancia BFS sin dar media vuelta. */
export function chooseToward(g: GhostSim, ctx: AIContext, target: Cell): Cell | null {
  const { maze, rng } = ctx;
  const { options, forced } = pickLegal(g, maze);
  if (forced) return forced;
  if (!options.length) return null;
  if (options.length === 1) return options[0];
  if (ctx.mistake > 0 && rng() < ctx.mistake) return options[Math.floor(rng() * options.length)];
  const field = g.fieldTo(maze, target);
  let best = options[0], bd = Infinity;
  for (const d of options) {
    const nx = maze.wrapX(g.cx + d[0], g.cy + d[1]), ny = g.cy + d[1];
    const dist = field[ny * maze.W + nx];
    if (dist < bd) { bd = dist; best = d; }
  }
  if (bd >= UNREACHABLE) return options[Math.floor(rng() * options.length)];
  return best;
}

/** Huida (asustado): se aleja del jugador con algo de azar. */
export function chooseFlee(g: GhostSim, ctx: AIContext): Cell | null {
  const { maze, rng } = ctx;
  const { options, forced } = pickLegal(g, maze);
  if (forced) return forced;
  if (!options.length) return null;
  if (options.length === 1) return options[0];
  if (rng() < 0.35) return options[Math.floor(rng() * options.length)];
  const field = maze.distanceField([ctx.playerCell]);
  let best = options[0], bd = -1;
  for (const d of options) {
    const nx = maze.wrapX(g.cx + d[0], g.cy + d[1]), ny = g.cy + d[1];
    const dist = field[ny * maze.W + nx];
    if (dist > bd && dist < UNREACHABLE) { bd = dist; best = d; }
  }
  return best;
}


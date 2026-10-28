import { CELL } from "../config/constants";
import type { LevelLayout } from "./layout";

export type Cell = [number, number];

/** Direcciones en el orden de prioridad del Pac-Man clasico: arriba, izquierda, abajo, derecha. */
export const DIRS: readonly Cell[] = [
  [0, -1],
  [-1, 0],
  [0, 1],
  [1, 0],
];

export const UNREACHABLE = 9999;

export function cellKey(x: number, y: number): string {
  return x + "," + y;
}

export class Maze {
  readonly W: number;
  readonly H: number;
  readonly tunnelRow: number;
  readonly rows: string[];
  readonly exit: Cell;
  readonly exitDir: Cell;
  exitUnlocked = false;

  constructor(layout: Pick<LevelLayout, "grid" | "W" | "H" | "tunnelRow" | "exit" | "exitDir">) {
    this.W = layout.W;
    this.H = layout.H;
    this.tunnelRow = layout.tunnelRow;
    this.rows = layout.grid;
    this.exit = layout.exit;
    this.exitDir = layout.exitDir;
  }

  get worldWidth(): number { return this.W * CELL; }
  get worldDepth(): number { return this.H * CELL; }
  /** Posicion |x| a partir de la cual el cuerpo se teletransporta al otro extremo del tunel. */
  get tunnelLimit(): number { return this.worldWidth / 2 + CELL / 2; }
  /** Desplazamiento aplicado al envolver (el conector oscuro mide una celda en total). */
  get tunnelShift(): number { return this.worldWidth + CELL; }

  wrapX(x: number, y: number): number {
    if (y === this.tunnelRow) {
      if (x < 0) return this.W - 1;
      if (x >= this.W) return 0;
    }
    return x;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.W && y >= 0 && y < this.H;
  }

  /** Caracter de la celda (con envoltura en el tunel). Fuera de limites es muro. */
  ch(x: number, y: number): string {
    const wx = this.wrapX(x, y);
    if (!this.inBounds(wx, y)) return "#";
    return this.rows[y][wx];
  }

  /** Transitable para IA/pathfinding (con envoltura del tunel). */
  isWalkable(x: number, y: number): boolean {
    const c = this.ch(x, y);
    if (c === "#") return false;
    if (c === "S") return this.exitUnlocked;
    return true;
  }

  /**
   * Solido para el cuerpo del jugador (colision continua). Sin envoltura: las celdas
   * -1 y W de la fila del tunel son una prolongacion abierta que luego se teletransporta.
   */
  isSolid(x: number, y: number): boolean {
    if (y < 0 || y >= this.H) return true;
    if (x < 0 || x >= this.W) return y !== this.tunnelRow;
    const c = this.rows[y][x];
    if (c === "#") return true;
    if (c === "S") return !this.exitUnlocked;
    return false;
  }

  neighbors(x: number, y: number): { x: number; y: number; dx: number; dy: number }[] {
    const out: { x: number; y: number; dx: number; dy: number }[] = [];
    for (const [dx, dy] of DIRS) {
      if (this.isWalkable(x + dx, y + dy)) out.push({ x: this.wrapX(x + dx, y + dy), y: y + dy, dx, dy });
    }
    return out;
  }

  cellToWorld(col: number, row: number): { x: number; z: number } {
    return { x: (col - (this.W - 1) / 2) * CELL, z: (row - (this.H - 1) / 2) * CELL };
  }

  worldToCell(x: number, z: number): Cell {
    const cx = Math.round(x / CELL + (this.W - 1) / 2);
    const cy = Math.round(z / CELL + (this.H - 1) / 2);
    return [Math.max(0, Math.min(this.W - 1, cx)), Math.max(0, Math.min(this.H - 1, cy))];
  }

  /** Celda sin recortar a los limites (util en la prolongacion del tunel). */
  worldToCellRaw(x: number, z: number): Cell {
    return [Math.round(x / CELL + (this.W - 1) / 2), Math.round(z / CELL + (this.H - 1) / 2)];
  }

  /** Linea de vision entre celdas (Bresenham). */
  hasLineOfSight(ax: number, ay: number, bx: number, by: number): boolean {
    let x0 = ax, y0 = ay;
    const dx = Math.abs(bx - x0), dy = Math.abs(by - y0);
    const sx = x0 < bx ? 1 : -1, sy = y0 < by ? 1 : -1;
    let err = dx - dy;
    for (let guard = 0; guard < 256; guard++) {
      if (!(x0 === ax && y0 === ay) && !(x0 === bx && y0 === by) && this.ch(x0, y0) === "#") return false;
      if (x0 === bx && y0 === by) return true;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
    }
    return false;
  }

  /** Rayo continuo en el plano XZ: true si no hay muro entre los dos puntos del mundo. */
  rayClear(x0: number, z0: number, x1: number, z1: number, step = 0.35): boolean {
    const dx = x1 - x0, dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    const n = Math.max(1, Math.ceil(len / step));
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const [cx, cy] = this.worldToCellRaw(x0 + dx * t, z0 + dz * t);
      if (this.isSolid(cx, cy)) return false;
    }
    return true;
  }

  /** Distancia BFS (en celdas) desde cualquiera de los destinos a cada celda. */
  distanceField(targets: readonly Cell[], out?: Int16Array): Int16Array {
    const { W, H } = this;
    const dist = out ?? new Int16Array(W * H);
    dist.fill(UNREACHABLE);
    const queue = new Int32Array(W * H);
    let head = 0, tail = 0;
    for (const [x, y] of targets) {
      const i = y * W + x;
      if (dist[i] === 0) continue;
      dist[i] = 0;
      queue[tail++] = i;
    }
    while (head < tail) {
      const i = queue[head++];
      const x = i % W, y = (i - x) / W;
      const d = dist[i] + 1;
      for (let k = 0; k < 4; k++) {
        const nx0 = x + DIRS[k][0], ny = y + DIRS[k][1];
        if (!this.isWalkable(nx0, ny)) continue;
        const nx = this.wrapX(nx0, ny);
        const j = ny * W + nx;
        if (dist[j] <= d) continue;
        dist[j] = d;
        queue[tail++] = j;
      }
    }
    return dist;
  }

  /** Distancia BFS entre dos celdas. */
  distance(a: Cell, b: Cell): number {
    if (a[0] === b[0] && a[1] === b[1]) return 0;
    return this.distanceField([b])[a[1] * this.W + a[0]];
  }

  /** Celda transitable mas cercana (por distancia euclidiana) a una celda cualquiera. */
  nearestWalkable(cell: Cell): Cell {
    const cx = Math.max(0, Math.min(this.W - 1, cell[0]));
    const cy = Math.max(0, Math.min(this.H - 1, cell[1]));
    if (this.isWalkable(cx, cy)) return [cx, cy];
    let best: Cell = [cx, cy];
    let bd = Infinity;
    for (let y = 0; y < this.H; y++) for (let x = 0; x < this.W; x++) {
      if (!this.isWalkable(x, y)) continue;
      const d = (x - cell[0]) ** 2 + (y - cell[1]) ** 2;
      if (d < bd) { bd = d; best = [x, y]; }
    }
    return best;
  }

  /** Celdas transitables adyacentes (grado en el grafo del laberinto). */
  degree(x: number, y: number): number {
    let d = 0;
    for (const [dx, dy] of DIRS) if (this.isWalkable(x + dx, y + dy)) d++;
    return d;
  }
}

import { CELL } from "../config/constants";

export type Cell = [number, number];

export class Maze {
  grid: string[];
  W: number;
  H: number;
  tunnelRow: number;
  exitUnlocked = false;
  exitCell: Cell = [0, 0];

  constructor(grid: string[], W: number, H: number, tunnelRow: number, exitCell: Cell) {
    this.grid = grid;
    this.W = W;
    this.H = H;
    this.tunnelRow = tunnelRow;
    this.exitCell = exitCell;
  }

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

  charAt(x: number, y: number): string {
    const wx = this.wrapX(x, y);
    if (!this.inBounds(wx, y)) return "#";
    return this.grid[y][wx];
  }

  isWalkable(x: number, y: number): boolean {
    const wx = this.wrapX(x, y);
    if (!this.inBounds(wx, y)) return false;
    const ch = this.grid[y][wx];
    if (ch === "#") return false;
    if (ch === "S") return this.exitUnlocked;
    return true;
  }

  neighbors(x: number, y: number): { x: number; y: number; dx: number; dy: number }[] {
    const out: { x: number; y: number; dx: number; dy: number }[] = [];
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
    for (const [dx, dy] of dirs) {
      if (this.isWalkable(x + dx, y + dy)) {
        out.push({ x: this.wrapX(x + dx, y + dy), y: y + dy, dx, dy });
      }
    }
    return out;
  }

  cellToWorld(col: number, row: number): { x: number; z: number } {
    return {
      x: (col - (this.W - 1) / 2) * CELL,
      z: (row - (this.H - 1) / 2) * CELL,
    };
  }

  /** Línea de visión en la cuadrícula (Bresenham sobre celdas). */
  hasLineOfSight(ax: number, ay: number, bx: number, by: number): boolean {
    let x0 = ax, y0 = ay;
    const x1 = bx, y1 = by;
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    while (true) {
      if (!(x0 === ax && y0 === ay) && !(x0 === x1 && y0 === y1)) {
        const ch = this.charAt(x0, y0);
        if (ch === "#") return false;
      }
      if (x0 === x1 && y0 === y1) return true;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
    }
  }
}

const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

function manhattan(a: Cell, b: Cell): number {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
}

/** A* sobre la cuadrícula. Devuelve la ruta (lista de celdas) o null. */
export function astar(maze: Maze, start: Cell, goal: Cell): Cell[] | null {
  const key = (c: Cell) => c[0] + "," + c[1];
  const startK = key(start), goalK = key(goal);
  const open = new Map<string, number>(); // fScore
  const gScore = new Map<string, number>();
  const came = new Map<string, Cell>();
  gScore.set(startK, 0);
  open.set(startK, manhattan(start, goal));
  const openList: Cell[] = [start];

  const inOpen = new Set<string>([startK]);
  while (openList.length) {
    // nodo con menor f
    let bestIdx = 0;
    for (let i = 1; i < openList.length; i++) {
      const k = key(openList[i]);
      const bk = key(openList[bestIdx]);
      if ((open.get(k) ?? Infinity) < (open.get(bk) ?? Infinity)) bestIdx = i;
    }
    const current = openList.splice(bestIdx, 1)[0];
    inOpen.delete(key(current));
    const ck = key(current);
    if (ck === goalK) {
      const path: Cell[] = [current];
      let cur = ck;
      while (came.has(cur)) {
        const prev = came.get(cur)!;
        path.unshift(prev);
        cur = key(prev);
      }
      return path;
    }
    const g = gScore.get(ck) ?? Infinity;
    for (const n of maze.neighbors(current[0], current[1])) {
      const nk = key([n.x, n.y]);
      const tentative = g + 1;
      if (tentative < (gScore.get(nk) ?? Infinity)) {
        came.set(nk, current);
        gScore.set(nk, tentative);
        open.set(nk, tentative + manhattan([n.x, n.y], goal));
        if (!inOpen.has(nk)) {
          openList.push([n.x, n.y]);
          inOpen.add(nk);
        }
      }
    }
  }
  return null;
}

/** Distancia BFS (nº de celdas) entre dos celdas. Infinito si no hay camino. */
export function bfsDist(maze: Maze, start: Cell, goal: Cell): number {
  if (start[0] === goal[0] && start[1] === goal[1]) return 0;
  const key = (c: Cell) => c[0] + "," + c[1];
  const seen = new Set<string>([key(start)]);
  const q: { c: Cell; d: number }[] = [{ c: start, d: 0 }];
  while (q.length) {
    const { c, d } = q.shift()!;
    for (const n of maze.neighbors(c[0], c[1])) {
      const nc: Cell = [n.x, n.y];
      const k = key(nc);
      if (seen.has(k)) continue;
      if (nc[0] === goal[0] && nc[1] === goal[1]) return d + 1;
      seen.add(k);
      q.push({ c: nc, d: d + 1 });
    }
  }
  return Infinity;
}

/** Celda transitable más cercana a `cell` (BFS atravesando muros). Para objetivos fuera de corredor. */
export function nearestWalkable(maze: Maze, cell: Cell): Cell {
  if (maze.isWalkable(cell[0], cell[1])) return cell;
  const seen = new Set<string>([cell.join(",")]);
  const q: Cell[] = [cell];
  while (q.length) {
    const c = q.shift()!;
    for (const [dx, dy] of DIRS4) {
      const nx = maze.wrapX(c[0] + dx, c[1] + dy), ny = c[1] + dy;
      if (!maze.inBounds(nx, ny)) continue;
      const k = nx + "," + ny;
      if (seen.has(k)) continue;
      seen.add(k);
      if (maze.isWalkable(nx, ny)) return [nx, ny];
      q.push([nx, ny]);
    }
  }
  return cell;
}

/** Campo de distancia BFS multi-fuente (para tensión de audio). */
export function bfsField(maze: Maze, sources: Cell[]): number[][] {
  const dist: number[][] = Array.from({ length: maze.H }, () => Array.from({ length: maze.W }, () => Infinity));
  const q: { x: number; y: number; d: number }[] = [];
  for (const [x, y] of sources) {
    if (dist[y][x] === 0) continue;
    dist[y][x] = 0;
    q.push({ x, y, d: 0 });
  }
  let head = 0;
  while (head < q.length) {
    const { x, y, d } = q[head++];
    for (const [dx, dy] of DIRS4) {
      const nx = maze.wrapX(x + dx, y + dy), ny = y + dy;
      if (!maze.inBounds(nx, ny)) continue;
      if (!maze.isWalkable(nx, ny)) continue;
      if (dist[ny][nx] <= d + 1) continue;
      dist[ny][nx] = d + 1;
      q.push({ x: nx, y: ny, d: d + 1 });
    }
  }
  return dist;
}

// Colision del cuerpo del jugador contra la rejilla de muros y cajas extra (props).
// Se usa una caja alineada a los ejes (AABB) con movimiento por ejes separados:
// da deslizamiento perfecto a lo largo de muros hechos de muchas celdas, sin trabarse en las juntas.

import { CELL } from "../config/constants";
import type { Maze } from "./maze";

export interface AABB {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

const HALF = CELL / 2;

export function cellBox(maze: Maze, cx: number, cy: number): AABB {
  const w = maze.cellToWorld(cx, cy);
  return { minX: w.x - HALF, maxX: w.x + HALF, minZ: w.z - HALF, maxZ: w.z + HALF };
}

export interface MoveResult {
  hitX: boolean;
  hitZ: boolean;
}

const RES: MoveResult = { hitX: false, hitZ: false };

function overlapsBox(x: number, z: number, r: number, b: AABB): boolean {
  return x + r > b.minX && x - r < b.maxX && z + r > b.minZ && z - r < b.maxZ;
}

/** Empuja a `pos` fuera de las cajas solapadas a lo largo de un eje. Devuelve true si hubo contacto. */
function resolveAxis(
  maze: Maze,
  colliders: readonly AABB[],
  pos: { x: number; z: number },
  r: number,
  axis: "x" | "z",
  dir: number,
): boolean {
  let hit = false;
  const [c0x, c0y] = maze.worldToCellRaw(pos.x - r, pos.z - r);
  const [c1x, c1y] = maze.worldToCellRaw(pos.x + r, pos.z + r);
  const push = (b: AABB) => {
    if (!overlapsBox(pos.x, pos.z, r, b)) return;
    hit = true;
    if (axis === "x") {
      if (dir > 0) pos.x = b.minX - r;
      else if (dir < 0) pos.x = b.maxX + r;
      else pos.x = pos.x < (b.minX + b.maxX) / 2 ? b.minX - r : b.maxX + r;
    } else {
      if (dir > 0) pos.z = b.minZ - r;
      else if (dir < 0) pos.z = b.maxZ + r;
      else pos.z = pos.z < (b.minZ + b.maxZ) / 2 ? b.minZ - r : b.maxZ + r;
    }
  };
  for (let cy = c0y; cy <= c1y; cy++) {
    for (let cx = c0x; cx <= c1x; cx++) {
      if (maze.isSolid(cx, cy)) push(cellBox(maze, cx, cy));
    }
  }
  for (const b of colliders) push(b);
  return hit;
}

/** Mueve un cuerpo cuadrado de semilado `r` por (dx, dz) deslizando contra muros y props. */
export function moveAndSlide(
  maze: Maze,
  colliders: readonly AABB[],
  pos: { x: number; z: number },
  dx: number,
  dz: number,
  r: number,
): MoveResult {
  RES.hitX = false;
  RES.hitZ = false;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) / (r * 0.8)));
  const sx = dx / steps, sz = dz / steps;
  for (let i = 0; i < steps; i++) {
    pos.x += sx;
    if (resolveAxis(maze, colliders, pos, r, "x", sx)) RES.hitX = true;
    pos.z += sz;
    if (resolveAxis(maze, colliders, pos, r, "z", sz)) RES.hitZ = true;
  }
  return RES;
}

/** Saca al cuerpo de cualquier solape (p. ej. tras una puerta que se cierra o un reinicio). */
export function depenetrate(maze: Maze, colliders: readonly AABB[], pos: { x: number; z: number }, r: number): void {
  for (let i = 0; i < 3; i++) {
    const a = resolveAxis(maze, colliders, pos, r, "x", 0);
    const b = resolveAxis(maze, colliders, pos, r, "z", 0);
    if (!a && !b) break;
  }
}

/** Distancia libre a lo largo de un rayo en XZ antes de tocar un muro (para la camara en 3a persona). */
export function rayDistance(maze: Maze, x: number, z: number, dirX: number, dirZ: number, maxDist: number): number {
  const step = 0.12;
  for (let d = step; d <= maxDist; d += step) {
    const [cx, cy] = maze.worldToCellRaw(x + dirX * d, z + dirZ * d);
    if (maze.isSolid(cx, cy)) return Math.max(0, d - step);
  }
  return maxDist;
}

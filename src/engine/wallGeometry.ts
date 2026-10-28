// Geometria de paredes fusionada: solo las caras expuestas, con variacion de UV (espejo) para
// romper la repeticion y oclusion ambiental horneada en las esquinas concavas.

import * as THREE from "three";
import { CELL, WALL_H } from "../config/constants";
import { hash2 } from "../gfx/noise";
import type { Maze } from "../sim/maze";

const HALF = CELL / 2;

interface Face { nx: number; nz: number }
const FACES: Face[] = [
  { nx: 0, nz: -1 },
  { nx: 0, nz: 1 },
  { nx: -1, nz: 0 },
  { nx: 1, nz: 0 },
];

export interface WallGeometryOptions {
  /** Incluye las paredes laterales de las medias celdas conectoras del tunel. */
  withConnectors?: boolean;
  aoStrength?: number;
}

export function buildWallGeometry(maze: Maze, opts: WallGeometryOptions = {}): THREE.BufferGeometry {
  const ao = opts.aoStrength ?? 0.7;
  const pos: number[] = [];
  const nor: number[] = [];
  const uvs: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];

  const isWall = (x: number, y: number) => maze.ch(x, y) === "#" || (x < 0 || x >= maze.W) && y !== maze.tunnelRow;

  const addFace = (wx: number, wz: number, f: Face, aoL: number, aoR: number, seed: number, length = CELL) => {
    // vector derecho visto desde fuera: (-n) x up = (nz, 0, -nx)
    const rx = f.nz, rz = -f.nx;
    const cx = wx + f.nx * HALF, cz = wz + f.nz * HALF;
    const hl = length / 2;
    const flip = hash2(Math.round(wx * 10), Math.round(wz * 10), seed) < 0.5;
    const base = pos.length / 3;
    const verts: [number, number, number, number, number, number][] = [
      // x, y, z, u, v, ao
      [cx - rx * hl, 0, cz - rz * hl, 0, 0, aoL],
      [cx + rx * hl, 0, cz + rz * hl, 1, 0, aoR],
      [cx + rx * hl, WALL_H, cz + rz * hl, 1, 1, aoR],
      [cx - rx * hl, WALL_H, cz - rz * hl, 0, 1, aoL],
    ];
    for (const [x, y, z, u, v, a] of verts) {
      pos.push(x, y, z);
      nor.push(f.nx, 0, f.nz);
      uvs.push(flip ? 1 - u : u, v);
      col.push(a, a, a);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };

  for (let y = 0; y < maze.H; y++) {
    for (let x = 0; x < maze.W; x++) {
      if (maze.rows[y][x] !== "#") continue;
      const w = maze.cellToWorld(x, y);
      for (const f of FACES) {
        if (isWall(x + f.nx, y + f.nz)) continue; // cara oculta
        if (!maze.inBounds(x + f.nx, y + f.nz) && !(y + f.nz === maze.tunnelRow)) continue; // exterior
        // esquinas: izquierda = -r, derecha = +r  (r = (nz, -nx))
        const rx = f.nz, rz = -f.nx;
        const corner = (sgn: number): number => {
          const ax = x + rx * sgn, ay = y + rz * sgn; // celda contigua en esa direccion
          const fx = ax + f.nx, fy = ay + f.nz; // diagonal frontal
          const aWall = isWall(ax, ay), fWall = isWall(fx, fy);
          if (aWall && fWall) return 1 - ao * 0.55; // esquina concava
          if (!aWall && fWall) return 1 - ao * 0.25;
          return 1;
        };
        addFace(w.x, w.z, f, corner(-1), corner(1), 31);
      }
    }
  }

  if (opts.withConnectors) {
    // medias celdas conectoras a ambos lados de la fila del tunel: paredes laterales
    const ty = maze.tunnelRow;
    for (const side of [-1, 1]) {
      const edge = side * (maze.worldWidth / 2);
      const cxm = edge + side * (CELL / 4); // centro de la media celda
      for (const dz of [-1, 1]) {
        const wz = maze.cellToWorld(0, ty).z + dz * CELL;
        // cara orientada hacia el pasillo del tunel (normal en -dz)
        const f: Face = { nx: 0, nz: -dz };
        addFace(cxm, wz, f, 1, 1, 77, CELL / 2);
      }
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

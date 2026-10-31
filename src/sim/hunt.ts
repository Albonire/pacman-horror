// Percepcion, memoria y objetivos de caceria de los fantasmas. Logica pura sobre la rejilla.
// Los fantasmas no tienen voz: su presion viene del posicionamiento, no de subir la velocidad global.

import { CELL } from "../config/constants";
import type { AIContext, GhostSim } from "./ghost";
import { DIRS, type Cell, type Maze } from "./maze";

/** Distancia (celdas) a la que notan al jugador aunque no lo esten mirando. */
const CLOSE_SENSE = 1.6;

/** Celdas [dx, dy] que barren alrededor del ultimo avistamiento durante la busqueda. */
const SEARCH_RING: readonly Cell[] = [
  [0, 0], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1],
];

/** Vector de mirada del fantasma en el mundo (yaw = atan2(dx, dy)). */
function facing(g: GhostSim): [number, number] {
  return [Math.sin(g.yaw), Math.cos(g.yaw)];
}

/** Distancia euclidiana en celdas. */
function cellDistance(g: GhostSim, x: number, z: number): number {
  return Math.hypot(g.x - x, g.z - z) / CELL;
}

/** True si una nube de vapor en erupcion se interpone en el segmento visual entre dos puntos. */
export function blockedBySteam(
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  activeSteam?: readonly { x: number; z: number }[],
): boolean {
  if (!activeSteam || !activeSteam.length) return false;
  const dx = x1 - x0, dz = z1 - z0;
  const len2 = dx * dx + dz * dz;
  if (len2 < 1.4) return false; // a quemarropa el vapor no impide verte
  for (const s of activeSteam) {
    const t = Math.max(0, Math.min(1, ((s.x - x0) * dx + (s.z - z0) * dz) / len2));
    const px = x0 + dx * t, pz = z0 + dz * t;
    if ((s.x - px) ** 2 + (s.z - pz) ** 2 < 1.25 * 1.25) return true;
  }
  return false;
}

/** True si el fantasma tiene al jugador en su cono de vision y sin muro ni cortina de vapor de por medio. */
export function canSee(g: GhostSim, maze: Maze, ctx: AIContext): boolean {
  const d = cellDistance(g, ctx.playerX, ctx.playerZ);
  if (d > ctx.viewCells) return false;
  if (d > CLOSE_SENSE) {
    const [fx, fz] = facing(g);
    const dx = ctx.playerX - g.x, dz = ctx.playerZ - g.z;
    const len = Math.hypot(dx, dz) || 1;
    if ((fx * dx + fz * dz) / len < ctx.fovCos) return false;
  }
  if (d > 3.5 && blockedBySteam(g.x, g.z, ctx.playerX, ctx.playerZ, ctx.activeSteam)) return false;
  return maze.rayClear(g.x, g.z, ctx.playerX, ctx.playerZ, 0.4);
}

/** True si el ruido del jugador llega al fantasma (correr amplia el radio). */
export function canHear(g: GhostSim, ctx: AIContext): boolean {
  if (!ctx.playerNoisy) return false;
  const range = ctx.hearCells * (ctx.playerRunning ? 1.25 : 1);
  return cellDistance(g, ctx.playerX, ctx.playerZ) <= range;
}

/**
 * Actualiza la memoria del fantasma. Ver al jugador fija la ultima posicion exacta;
 * oirlo la aproxima; si deja de percibirlo empieza a contar el olvido.
 */
export function noticePlayer(g: GhostSim, ctx: AIContext, dt: number): void {
  const sees = canSee(g, ctx.maze, ctx);
  const hears = !sees && canHear(g, ctx);
  if (sees || hears) {
    g.sawPlayer = sees;
    g.lastSeen = [ctx.playerCell[0], ctx.playerCell[1]];
    g.lastHeading = [ctx.playerHeading[0], ctx.playerHeading[1]];
    g.lostT = 0;
    return;
  }
  g.sawPlayer = false;
  if (!g.lastSeen) return;
  g.lostT += dt;
  if (g.lostT > ctx.memory + ctx.searchTime) {
    g.lastSeen = null;
    g.lostT = 0;
  }
}

/** Celda de barrido alrededor del ultimo avistamiento: en equipo cada fantasma de apoyo explora una rama distinta. */
export function searchTarget(g: GhostSim, ctx: AIContext): Cell {
  const base = g.lastSeen ?? ctx.playerCell;
  const step = Math.floor(g.lostT * 0.8 + g.kind * 2.1);
  if (g.kind !== 0 && otherHunters(g, ctx).length > 0) {
    const branches = DIRS.filter(([dx, dy]) => ctx.maze.isWalkable(base[0] + dx, base[1] + dy));
    if (branches.length >= 2) {
      const dir = branches[(step + g.kind) % branches.length];
      return ctx.maze.nearestWalkable(junctionAhead(ctx.maze, base, dir, 3));
    }
  }
  const off = SEARCH_RING[step % SEARCH_RING.length];
  return ctx.maze.nearestWalkable([base[0] + off[0], base[1] + off[1]]);
}

/** Vector cardinal de una direccion de rejilla; util para "detras del jugador". */
function viewDir(v: Cell): [number, number] {
  if (Math.abs(v[0]) >= Math.abs(v[1])) return [Math.sign(v[0]) || 0, 0];
  return [0, Math.sign(v[1]) || 0];
}

/**
 * El Acechador prioriza llegar por detras: sigue el rastro retrasado del jugador
 * (por donde ha pasado) y, si lo tiene delante de la cara, rodea hasta la espalda.
 */
function stalkTarget(g: GhostSim, ctx: AIContext): Cell {
  const pc = ctx.playerCell;
  const [vx, vz] = viewDir(ctx.playerView);
  const behind = ctx.maze.nearestWalkable([pc[0] - vx * 2, pc[1] - vz * 2]);
  const sample = ctx.trail.at(ctx.time - ctx.trailDelay);
  if (!sample) return behind;
  const cell = ctx.maze.nearestWalkable(ctx.maze.worldToCell(sample.x, sample.z));
  const ahead = (cell[0] - pc[0]) * vx + (cell[1] - pc[1]) * vz;
  const close = Math.hypot(g.cx - pc[0], g.cy - pc[1]) <= 4;
  if (ahead > 1 && close) return behind;
  return cell;
}

/** Flanqueo del Resonador usando al Acechador como referencia. */
function flankTarget(g: GhostSim, ctx: AIContext, lead: number): Cell {
  const pc = ctx.playerCell, ph = ctx.playerHeading;
  const stalker = ctx.ghosts.find((o) => o.kind === 0 && o.active) ?? g;
  const px = pc[0] + ph[0] * lead, py = pc[1] + ph[1] * lead;
  return ctx.maze.nearestWalkable([stalker.cx + 2 * (px - stalker.cx), stalker.cy + 2 * (py - stalker.cy)]);
}

/**
 * Siguiente decision del jugador si sigue recto: avanza por el pasillo desde `from` en la direccion `heading`
 * hasta el proximo cruce (celda con mas de una salida que no sea volver atras) o `maxSteps` celdas. Es donde
 * hay que esperarlo para cortarle el paso.
 */
export function junctionAhead(maze: Maze, from: Cell, heading: Cell, maxSteps: number): Cell {
  let x = from[0], y = from[1];
  let dx = heading[0], dy = heading[1];
  if (!dx && !dy) return from;
  for (let i = 0; i < maxSteps; i++) {
    const opts = DIRS.filter(([ox, oy]) => !(ox === -dx && oy === -dy) && maze.isWalkable(x + ox, y + oy));
    if (opts.length === 0) return [x, y]; // callejon sin salida
    if (opts.length > 1) return [x, y]; // cruce: aqui elige
    [dx, dy] = opts[0];
    x += dx; y += dy;
  }
  return [x, y];
}

/** Otros fantasmas peligrosos (que pueden matar) distintos de `g`. */
function otherHunters(g: GhostSim, ctx: AIContext): GhostSim[] {
  return ctx.ghosts.filter((o) => o !== g && o.lethal);
}

/**
 * Objetivo cuando el fantasma ve al jugador ahora mismo. Ya no todos van directos al jugador: cada uno conserva su
 * papel y se reparten el trabajo. El Acechador aprieta de frente; los demas se adelantan al siguiente cruce del
 * jugador para cerrarle la salida cuando alguien ya lo tiene pegado ("pinza").
 */
function sightedTarget(g: GhostSim, ctx: AIContext): Cell {
  const pc = ctx.playerCell;
  const d = Math.hypot(g.cx - pc[0], g.cy - pc[1]);
  if (d <= 2.5) return pc; // al alcance: siempre directo
  const hunters = otherHunters(g, ctx);
  const nearest = hunters.reduce((m, o) => Math.min(m, Math.hypot(o.cx - pc[0], o.cy - pc[1])), Infinity);
  const covered = nearest <= 6 && d >= nearest + 2; // otro ya esta encima: yo corto la huida
  const ahead = ctx.maze.nearestWalkable(junctionAhead(ctx.maze, pc, ctx.playerHeading, 5));
  switch (g.kind) {
    case 0: // Acechador: de frente, pero si otro lo adelanta se cuelga de la espalda
      return covered ? ctx.maze.nearestWalkable(junctionAhead(ctx.maze, pc, [-ctx.playerHeading[0], -ctx.playerHeading[1]], 3)) : pc;
    case 1: // Emboscadora: siempre al cruce de delante
      return ahead;
    case 2: // Resonador: flanquea al jugador usando al Acechador; si esta cubierto corta por delante
      return covered ? ahead : ctx.playerNoisy ? pc : flankTarget(g, ctx, 2);
    default: // Estatico: timido, mantiene su papel (ver chaseTarget)
      return d > (ctx.playerNoisy ? 4 : 8) ? pc : g.corner;
  }
}

/**
 * Objetivo de persecucion. Viendo al jugador se reparten los papeles; con memoria va a la ultima posicion conocida
 * (y luego barre la zona); sin memoria usa el rol de cada fantasma.
 */
export function chaseTarget(g: GhostSim, ctx: AIContext): Cell {
  const pc = ctx.playerCell;
  const tactics = ctx.tactics ?? 2;
  if (tactics >= 1 && g.sawPlayer && g.lastSeen) return sightedTarget(g, ctx);
  if (g.lastSeen) {
    if (g.lostT > ctx.memory) return searchTarget(g, ctx);
    // la Emboscadora y el Resonador predicen a donde fue: siguen el pasillo desde donde lo vieron por ultima vez
    if (tactics >= 2 && (g.kind === 1 || g.kind === 2)) return ctx.maze.nearestWalkable(junctionAhead(ctx.maze, g.lastSeen, g.lastHeading, 4));
    return g.lastSeen;
  }
  switch (g.kind) {
    case 0: // El Acechador: llega por detras siguiendo el rastro
      return stalkTarget(g, ctx);
    case 1: { // La Emboscadora: corta la ruta por delante
      const d = Math.hypot(g.cx - pc[0], g.cy - pc[1]);
      if (d <= 3) return pc;
      const stalker = ctx.ghosts.find((o) => o.kind === 0 && o.active);
      const stalkerDist = stalker ? Math.hypot(stalker.cx - pc[0], stalker.cy - pc[1]) : 99;
      return ctx.maze.nearestWalkable([pc[0] + ctx.playerHeading[0] * (stalkerDist <= 5 ? 5 : 4), pc[1] + ctx.playerHeading[1] * (stalkerDist <= 5 ? 5 : 4)]);
    }
    case 2: // El Resonador: rastrea ruido o flanquea
      return ctx.playerNoisy && cellDistance(g, ctx.playerX, ctx.playerZ) <= ctx.hearCells
        ? pc
        : flankTarget(g, ctx, 2);
    default: { // El Estatico: timido, se acerca solo si lo provocan
      const d = Math.hypot(g.cx - pc[0], g.cy - pc[1]);
      return d > (ctx.playerNoisy ? 4 : 8) ? pc : g.corner;
    }
  }
}

/** True si el fantasma sigue interesado en el jugador (anula la dispersion). */
export function isAlerted(g: GhostSim): boolean {
  return g.lastSeen !== null;
}

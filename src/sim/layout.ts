// Generador procedural de laberintos para UMBRAL.
//  - DFS (recursive backtracker) + bucles + trenzado de callejones sin salida.
//  - Fila central abierta que envuelve (tunel clasico de Pac-Man).
//  - La salida es siempre una celda "hoja" (grado 1): sellarla no desconecta nada.
//  - Cada resultado se valida; si falla se reintenta con una semilla derivada (determinista).

import { Maze, DIRS, UNREACHABLE, type Cell } from "./maze";
import { mulberry32, shuffle, type Rng } from "./rng";

export interface LayoutSpec {
  W: number; // impar, (W-1)/2 impar para que el centro sea una "sala"
  H: number; // impar, (H-1)/2 impar
  seed: number;
  loopChance: number; // prob. de abrir muros entre pasillos paralelos
  braid: number; // prob. de eliminar cada callejon sin salida
}

export interface LevelLayout {
  grid: string[];
  W: number;
  H: number;
  tunnelRow: number;
  spec: LayoutSpec;
  resolvedSeed: number;
  player: Cell;
  exit: Cell;
  exitDir: Cell; // de la celda de salida hacia su unico vecino
  ghosts: Cell[];
  pellets: Cell[];
  fruit: Cell;
  center: Cell;
  deadEnds: Cell[];
  totalDots: number;
  /** Zonas oscuras: sin luminarias hasta que se enciende su interruptor. `r` en celdas. */
  zones: DarkZone[];
  /** Pilas recogibles (recargan la linterna). */
  batteries: Cell[];
  /** Cajas de fusibles: encienden la zona oscura asociada. */
  switches: { cell: Cell; zone: number; wall: Cell }[];
  /** Escondites junto a una pared (`wall` apunta de la celda hacia el hueco). */
  hideSpots: { cell: Cell; wall: Cell }[];
}

export interface DarkZone { cell: Cell; r: number }

type Grid = boolean[][]; // true = corredor

function degreeOpen(g: Grid, W: number, tunnelRow: number, x: number, y: number): number {
  let d = 0;
  const at = (cx: number, cy: number) => {
    if (cy === tunnelRow) cx = ((cx % W) + W) % W;
    return g[cy]?.[cx] === true;
  };
  if (at(x + 1, y)) d++;
  if (at(x - 1, y)) d++;
  if (at(x, y + 1)) d++;
  if (at(x, y - 1)) d++;
  return d;
}

function carve(W: number, H: number, rng: Rng): Grid {
  const g: Grid = Array.from({ length: H }, () => Array.from({ length: W }, () => false));
  const seen: boolean[][] = Array.from({ length: H }, () => Array.from({ length: W }, () => false));
  const stack: Cell[] = [[1, 1]];
  seen[1][1] = true;
  g[1][1] = true;
  const dirs: Cell[] = [[2, 0], [-2, 0], [0, 2], [0, -2]];
  while (stack.length) {
    const [x, y] = stack[stack.length - 1];
    const opts = dirs.filter(([dx, dy]) => {
      const nx = x + dx, ny = y + dy;
      return nx > 0 && nx < W - 1 && ny > 0 && ny < H - 1 && !seen[ny][nx];
    });
    if (!opts.length) { stack.pop(); continue; }
    const [dx, dy] = opts[Math.floor(rng() * opts.length)];
    const nx = x + dx, ny = y + dy;
    g[ny][nx] = true;
    g[y + dy / 2][x + dx / 2] = true;
    seen[ny][nx] = true;
    stack.push([nx, ny]);
  }
  return g;
}

function gridToRows(g: Grid, W: number, H: number, mark: (x: number, y: number) => string): string[] {
  const rows: string[] = [];
  for (let y = 0; y < H; y++) {
    let r = "";
    for (let x = 0; x < W; x++) r += g[y][x] ? mark(x, y) : "#";
    rows.push(r);
  }
  return rows;
}

function tempMaze(g: Grid, W: number, H: number, tunnelRow: number): Maze {
  const rows = gridToRows(g, W, H, () => ".");
  return new Maze({ grid: rows, W, H, tunnelRow, exit: [0, 0], exitDir: [0, 1] });
}

/** Estimacion rapida de puntos antes de generar la cuadricula final (casi todas las celdas abiertas llevan uno). */
function totalDotsEstimate(openCells: number): number { return openCells - 12; }

function build(spec: LayoutSpec, seed: number): LevelLayout | null {
  const { W, H } = spec;
  const rng = mulberry32(seed);
  const g = carve(W, H, rng);
  const tunnelRow = (H - 1) / 2;
  const cx = (W - 1) / 2, cy = (H - 1) / 2;

  // bucles: abre muros entre corredores paralelos
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    if (g[y][x]) continue;
    const horiz = g[y][x - 1] && g[y][x + 1];
    const vert = g[y - 1][x] && g[y + 1][x];
    if ((horiz || vert) && rng() < spec.loopChance) g[y][x] = true;
  }
  // tunel central abierto de borde a borde
  for (let x = 0; x < W; x++) g[tunnelRow][x] = true;

  const open: Cell[] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g[y][x]) open.push([x, y]);
  const dist2 = (a: Cell, tx: number, ty: number) => (a[0] - tx) ** 2 + (a[1] - ty) ** 2;
  const nearestTo = (list: Cell[], tx: number, ty: number): Cell | null => {
    let best: Cell | null = null, bd = Infinity;
    for (const c of list) { const d = dist2(c, tx, ty); if (d < bd) { bd = d; best = c; } }
    return best;
  };

  // jugador: fila inferior, lo mas cerca posible del eje central
  const bottomRow = H - 2;
  const player = nearestTo(open.filter(([, y]) => y === bottomRow), cx, bottomRow);
  if (!player) return null;

  // salida: hoja alejada del jugador, preferentemente en la mitad superior
  const mz = tempMaze(g, W, H, tunnelRow);
  const fromPlayer = mz.distanceField([player]);
  const leaves = open.filter(([x, y]) => y !== tunnelRow && x > 0 && x < W - 1 && degreeOpen(g, W, tunnelRow, x, y) === 1);
  const upper = leaves.filter(([, y]) => y <= cy);
  const pool = upper.length ? upper : leaves;
  if (!pool.length) return null;
  let exit = pool[0];
  let bestScore = -1;
  for (const c of pool) {
    const d = fromPlayer[c[1] * W + c[0]];
    if (d >= UNREACHABLE) continue;
    const score = d + rng() * 1.5;
    if (score > bestScore) { bestScore = score; exit = c; }
  }
  if (bestScore < 0) return null;

  // trenzado: elimina la mayoria de callejones (excepto la salida)
  const dead = shuffle(rng, open.filter(([x, y]) => degreeOpen(g, W, tunnelRow, x, y) === 1 && !(x === exit[0] && y === exit[1])));
  for (const [x, y] of dead) {
    if (degreeOpen(g, W, tunnelRow, x, y) !== 1) continue;
    if (rng() > spec.braid) continue;
    const cands: Cell[] = [];
    for (const [dx, dy] of DIRS) {
      const wx = x + dx, wy = y + dy, bx = x + dx * 2, by = y + dy * 2;
      if (wx < 1 || wx > W - 2 || wy < 1 || wy > H - 2) continue;
      if (g[wy][wx] || !g[by]?.[bx]) continue;
      if (Math.abs(wx - exit[0]) + Math.abs(wy - exit[1]) <= 1) continue; // no tocar el entorno de la salida
      if (bx === exit[0] && by === exit[1]) continue;
      cands.push([wx, wy]);
    }
    if (cands.length) {
      const [wx, wy] = cands[Math.floor(rng() * cands.length)];
      g[wy][wx] = true;
    }
  }

  // refresco de listas tras el trenzado
  const open2: Cell[] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g[y][x]) open2.push([x, y]);

  const used = new Set<string>();
  const take = (c: Cell) => used.add(c[0] + "," + c[1]);
  const isFree = (c: Cell) => !used.has(c[0] + "," + c[1]);
  take(player); take(exit);

  // fantasmas: 4 celdas dispersas cerca del centro
  const byCenter = [...open2].filter(isFree).sort((a, b) => dist2(a, cx, cy) - dist2(b, cx, cy));
  const ghosts: Cell[] = [];
  for (const c of byCenter) {
    if (ghosts.length >= 4) break;
    if (ghosts.every((o) => Math.hypot(o[0] - c[0], o[1] - c[1]) >= 2)) { ghosts.push(c); take(c); }
  }
  for (const c of byCenter) {
    if (ghosts.length >= 4) break;
    if (isFree(c)) { ghosts.push(c); take(c); }
  }
  if (ghosts.length < 4) return null;

  // pellets: una por esquina y una en cada borde lateral (alternadas en altura), fuera de la fila del tunel
  const corners: Cell[] = [[1, 1], [W - 2, 1], [1, H - 2], [W - 2, H - 2], [1, cy - 4], [W - 2, cy + 4]];
  const pellets: Cell[] = [];
  for (const corner of corners) {
    const c = nearestTo(open2.filter((o) => isFree(o) && o[1] !== tunnelRow), corner[0], corner[1]);
    if (!c) return null;
    pellets.push(c); take(c);
  }

  // fruta: debajo de la guarida
  const fruit = nearestTo(open2.filter((o) => isFree(o) && o[1] !== tunnelRow), cx, cy + 4);
  if (!fruit) return null;

  // ---- extras de jugabilidad (despues de todo lo anterior: no alteran el laberinto ni su semilla) ----
  const eu = (a: Cell, b: Cell) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const freeCells = () => open2.filter((o) => isFree(o) && o[1] !== tunnelRow);
  const area = W * H;
  const zoneCount = area >= 650 ? 4 : area >= 480 ? 3 : 2;
  const zones: DarkZone[] = [];
  const zr = 3.2;
  const zoneCands = shuffle(rng, freeCells());
  for (const relax of [0, 3]) {
    for (const c of zoneCands) {
      if (zones.length >= zoneCount) break;
      if (eu(c, player) < 8 - relax || eu(c, exit) < 6 - relax) continue;
      if (zones.some((z) => eu(z.cell, c) < 9 - relax)) continue;
      zones.push({ cell: c, r: zr });
    }
  }
  const switches: { cell: Cell; zone: number; wall: Cell }[] = [];
  const wallOf = (c: Cell): Cell | null => {
    const w = DIRS.filter(([dx, dy]) => !g[c[1] + dy]?.[c[0] + dx]);
    return w.length ? w[Math.floor(rng() * w.length)] : null;
  };
  zones.forEach((z, zi) => {
    // interruptor en el borde de la zona
    const ring = freeCells().filter((c) => { const d = eu(c, z.cell); return d >= z.r - 0.6 && d <= z.r + 1.8 && wallOf(c); });
    const pick = ring.length ? ring[Math.floor(rng() * ring.length)] : null;
    if (!pick) return;
    take(pick);
    switches.push({ cell: pick, zone: zi, wall: wallOf(pick)! });
  });
  const batteries: Cell[] = [];
  const batteryCount = Math.max(3, Math.round(totalDotsEstimate(open2.length) / 80));
  for (const z of zones) {
    const near = freeCells().filter((c) => eu(c, z.cell) <= 2.2);
    if (near.length && batteries.length < batteryCount) { const c = near[Math.floor(rng() * near.length)]; batteries.push(c); take(c); }
  }
  for (const c of shuffle(rng, freeCells())) {
    if (batteries.length >= batteryCount) break;
    if (eu(c, player) < 5 || batteries.some((b) => eu(b, c) < 5)) continue;
    batteries.push(c); take(c);
  }
  const hideSpots: { cell: Cell; wall: Cell }[] = [];
  const hideCount = Math.max(3, Math.round(open2.length / 38));
  for (const c of shuffle(rng, freeCells())) {
    if (hideSpots.length >= hideCount) break;
    if (eu(c, player) < 3.5 || hideSpots.some((h) => eu(h.cell, c) < 5)) continue;
    const wN = !g[c[1] - 1]?.[c[0]], wS = !g[c[1] + 1]?.[c[0]], wW = !g[c[1]]?.[c[0] - 1], wE = !g[c[1]]?.[c[0] + 1];
    // pasillo recto de dos paredes opuestas: el armario va en una de ellas
    let wall: Cell | null = null;
    if (wN && wS && !wW && !wE) wall = rng() < 0.5 ? [0, -1] : [0, 1];
    else if (wW && wE && !wN && !wS) wall = rng() < 0.5 ? [-1, 0] : [1, 0];
    if (!wall) continue;
    hideSpots.push({ cell: c, wall }); take(c);
  }

  const exitNeighbors = DIRS.filter(([dx, dy]) => g[exit[1] + dy]?.[exit[0] + dx]);
  if (exitNeighbors.length !== 1) return null;
  const exitDir: Cell = [exitNeighbors[0][0], exitNeighbors[0][1]];

  const key = (x: number, y: number) => x + "," + y;
  const special = new Map<string, string>();
  special.set(key(player[0], player[1]), "P");
  special.set(key(exit[0], exit[1]), "S");
  ghosts.forEach((c) => special.set(key(c[0], c[1]), "E"));
  pellets.forEach((c) => special.set(key(c[0], c[1]), "O"));
  const grid = gridToRows(g, W, H, (x, y) => {
    const s = special.get(key(x, y));
    if (s) return s;
    if (y === tunnelRow && (x === 0 || x === W - 1)) return "_";
    return ".";
  });

  let totalDots = 0;
  for (const r of grid) for (const ch of r) if (ch === ".") totalDots++;

  const deadEnds = open2.filter(([x, y]) => degreeOpen(g, W, tunnelRow, x, y) === 1);

  return {
    grid, W, H, tunnelRow, spec, resolvedSeed: seed,
    player, exit, exitDir, ghosts, pellets, fruit,
    center: [cx, cy], deadEnds, totalDots,
    zones, batteries, switches, hideSpots,
  };
}

/** Comprueba invariantes del nivel. Devuelve la lista de problemas (vacia = valido). */
export function validateLayout(l: LevelLayout): string[] {
  const issues: string[] = [];
  const { W, H } = l;
  if (l.grid.length !== H) issues.push("filas incorrectas");
  if (l.grid.some((r) => r.length !== W)) issues.push("columnas incorrectas");
  // borde solido salvo el tunel
  for (let x = 0; x < W; x++) {
    if (l.grid[0][x] !== "#" || l.grid[H - 1][x] !== "#") issues.push("borde horizontal abierto");
  }
  for (let y = 0; y < H; y++) {
    if (y === l.tunnelRow) continue;
    if (l.grid[y][0] !== "#" || l.grid[y][W - 1] !== "#") issues.push("borde vertical abierto en fila " + y);
  }
  const maze = new Maze(l);
  const field = maze.distanceField([l.player]);
  let corridor = 0, unreachable = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ch = l.grid[y][x];
    if (ch === "#" || ch === "S") continue;
    corridor++;
    if (field[y * W + x] >= UNREACHABLE) unreachable++;
  }
  if (unreachable) issues.push(`${unreachable} celdas inalcanzables con la salida sellada`);
  if (l.grid[l.exit[1]][l.exit[0]] !== "S") issues.push("la salida no esta marcada");
  const exitDeg = DIRS.filter(([dx, dy]) => l.grid[l.exit[1] + dy]?.[l.exit[0] + dx] !== undefined && l.grid[l.exit[1] + dy][l.exit[0] + dx] !== "#").length;
  if (exitDeg !== 1) issues.push("la salida no es una hoja (grado " + exitDeg + ")");
  maze.exitUnlocked = true;
  const open = maze.distanceField([l.player]);
  if (open[l.exit[1] * W + l.exit[0]] >= UNREACHABLE) issues.push("salida inalcanzable al abrirse");
  if (open[l.exit[1] * W + l.exit[0]] < Math.floor(Math.min(W, H) * 0.9)) issues.push("salida demasiado cerca del jugador");
  const uniq = new Set(l.ghosts.map((c) => c.join(",")));
  if (uniq.size !== 4) issues.push("fantasmas duplicados");
  for (const c of [...l.ghosts, ...l.pellets, l.fruit]) {
    if (field[c[1] * W + c[0]] >= UNREACHABLE) issues.push("elemento inalcanzable en " + c.join(","));
  }
  if (l.totalDots < 60) issues.push("muy pocos puntos");
  const reach = (c: Cell) => field[c[1] * W + c[0]] < UNREACHABLE && l.grid[c[1]][c[0]] !== "#";
  if (l.zones.length < 2) issues.push("faltan zonas oscuras");
  if (l.batteries.length < 3) issues.push("faltan pilas");
  if (l.hideSpots.length < 3) issues.push("faltan escondites");
  if (l.switches.length < 1) issues.push("falta un interruptor");
  for (const z of l.zones) if (!reach(z.cell)) issues.push("zona inalcanzable");
  for (const c of l.batteries) if (!reach(c)) issues.push("pila inalcanzable en " + c.join(","));
  for (const sw of l.switches) {
    if (!reach(sw.cell)) issues.push("interruptor inalcanzable");
    if (l.grid[sw.cell[1] + sw.wall[1]]?.[sw.cell[0] + sw.wall[0]] !== "#") issues.push("interruptor sin pared");
  }
  for (const h of l.hideSpots) {
    if (!reach(h.cell)) issues.push("escondite inalcanzable");
    if (l.grid[h.cell[1] + h.wall[1]]?.[h.cell[0] + h.wall[0]] !== "#") issues.push("escondite sin pared");
  }
  return issues;
}

/** Genera un nivel valido. Determinista para una misma especificacion. */
export function generateLayout(spec: LayoutSpec): LevelLayout {
  for (let attempt = 0; attempt < 40; attempt++) {
    const seed = (spec.seed + attempt * 7919) >>> 0;
    const l = build(spec, seed);
    if (l && validateLayout(l).length === 0) return l;
  }
  throw new Error(`No se pudo generar un nivel valido para la semilla ${spec.seed}`);
}

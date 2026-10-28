// Generador procedural de laberintos (garantiza conectividad + bucles + túnel envolvente)

export interface LevelData {
  grid: string[];
  W: number;
  H: number;
  tunnelRow: number;
  player: [number, number];
  exit: [number, number];
  ghosts: [number, number][];
  pellets: [number, number][];
  totalDots: number;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateGrid(W: number, H: number, rng: () => number, loopChance: number): { g: string[][]; tunnelRow: number } {
  const g: string[][] = Array.from({ length: H }, () => Array.from({ length: W }, () => "#"));
  const visited: boolean[][] = Array.from({ length: H }, () => Array.from({ length: W }, () => false));
  const stack: [number, number][] = [[1, 1]];
  visited[1][1] = true;
  g[1][1] = ".";
  const dirs = [[2, 0], [-2, 0], [0, 2], [0, -2]];
  while (stack.length) {
    const [x, y] = stack[stack.length - 1];
    const opts = dirs.filter(([dx, dy]) => {
      const nx = x + dx, ny = y + dy;
      return nx > 0 && nx < W - 1 && ny > 0 && ny < H - 1 && !visited[ny][nx];
    });
    if (opts.length === 0) {
      stack.pop();
      continue;
    }
    const [dx, dy] = opts[Math.floor(rng() * opts.length)];
    const nx = x + dx, ny = y + dy;
    g[ny][nx] = ".";
    g[y + dy / 2][x + dx / 2] = ".";
    visited[ny][nx] = true;
    stack.push([nx, ny]);
  }
  // bucles: abre paredes entre corredores paralelos
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      if (g[y][x] !== "#") continue;
      const horiz = g[y][x - 1] === "." && g[y][x + 1] === ".";
      const vert = g[y - 1][x] === "." && g[y + 1][x] === ".";
      if ((horiz || vert) && rng() < loopChance) g[y][x] = ".";
    }
  }
  const tunnelRow = Math.floor(H / 2);
  for (let x = 0; x < W; x++) g[tunnelRow][x] = ".";
  return { g, tunnelRow };
}

export function buildLevel(W: number, H: number, seed: number, loopChance: number): LevelData {
  const rng = mulberry32(seed);
  const { g, tunnelRow } = generateGrid(W, H, rng, loopChance);
  const cells: [number, number][] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g[y][x] === ".") cells.push([x, y]);
  const cx = (W - 1) / 2, cy = (H - 1) / 2;
  const dist = (x: number, y: number, tx: number, ty: number) => Math.hypot(x - tx, y - ty);
  const isCorr = (x: number, y: number) => g[y] !== undefined && g[y][x] === ".";

  // grado de cada celda corredor (con wrap horizontal en el túnel)
  const degree = (x: number, y: number) => {
    let d = 0;
    if (isCorr(x + 1, y)) d++;
    if (isCorr(x - 1, y)) d++;
    if (isCorr(x, y + 1)) d++;
    if (isCorr(x, y - 1)) d++;
    if (y === tunnelRow) {
      if (x === 0 && isCorr(W - 1, y)) d++;
      if (x === W - 1 && isCorr(0, y)) d++;
    }
    return d;
  };

  const used = new Set<string>();
  const take = (c: [number, number]) => used.add(c.join(","));
  const free = (list: [number, number][]) => list.filter((c) => !used.has(c.join(",")));
  const nearest = (list: [number, number][], tx: number, ty: number): [number, number] =>
    [...list].sort((a, b) => dist(a[0], a[1], tx, ty) - dist(b[0], b[1], tx, ty))[0];

  // SALIDA: celda sin salida (grado 1) más cercana al centro superior.
  // Al ser una hoja del grafo, sellarla (bloquearla) no desconecta el laberinto.
  const deadEnds = cells.filter((c) => degree(c[0], c[1]) === 1);
  let exit: [number, number];
  if (deadEnds.length) {
    exit = nearest(deadEnds, cx, 1);
  } else {
    const minRow = Math.min(...cells.map((c) => c[1]));
    exit = nearest(cells.filter(([, y]) => y === minRow), cx, cy);
  }
  take(exit);

  // JUGADOR: corredor inferior-central
  const maxRow = Math.max(...cells.map((c) => c[1]));
  const player = nearest(free(cells.filter(([, y]) => y === maxRow)), cx, cy);
  take(player);

  // FANTASMAS: 4 celdas libres cerca del centro, dispersas
  const nearCenter = free([...cells].sort((a, b) => dist(a[0], a[1], cx, cy) - dist(b[0], b[1], cx, cy)));
  const ghosts: [number, number][] = [];
  for (const c of nearCenter) {
    if (ghosts.length >= 4) break;
    if (ghosts.every((o) => Math.hypot(o[0] - c[0], o[1] - c[1]) >= 2)) { ghosts.push([c[0], c[1]]); take(c); }
  }
  for (const c of nearCenter) {
    if (ghosts.length >= 4) break;
    if (!ghosts.some((o) => o[0] === c[0] && o[1] === c[1])) { ghosts.push([c[0], c[1]]); take(c); }
  }

  // POWER PELTS: 4 celdas libres cerca de las esquinas
  const corners: [number, number][] = [[1, 1], [W - 2, 1], [1, H - 2], [W - 2, H - 2]];
  const pellets: [number, number][] = [];
  for (const corner of corners) {
    const c = nearest(free(cells), corner[0], corner[1]);
    pellets.push([c[0], c[1]]);
    take(c);
  }

  const set = (x: number, y: number, ch: string) => { g[y][x] = ch; };
  set(player[0], player[1], "P");
  set(exit[0], exit[1], "S");
  ghosts.forEach((c) => set(c[0], c[1], "E"));
  pellets.forEach((c) => set(c[0], c[1], "O"));

  let totalDots = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g[y][x] === ".") totalDots++;

  return {
    grid: g.map((r) => r.join("")),
    W, H, tunnelRow,
    player: [player[0], player[1]],
    exit: [exit[0], exit[1]],
    ghosts: ghosts.map((c) => [c[0], c[1]]),
    pellets: pellets.map((c) => [c[0], c[1]]),
    totalDots,
  };
}

// Standalone maze generator + validator (mirrors src/config/levels.ts logic)
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateGrid(W, H, seed, loopChance) {
  const rng = mulberry32(seed);
  const g = Array.from({ length: H }, () => Array.from({ length: W }, () => "#"));
  const visited = Array.from({ length: H }, () => Array.from({ length: W }, () => false));
  const stack = [[1, 1]];
  visited[1][1] = true; g[1][1] = ".";
  const dirs = [[2, 0], [-2, 0], [0, 2], [0, -2]];
  while (stack.length) {
    const [x, y] = stack[stack.length - 1];
    const opts = dirs.filter(([dx, dy]) => {
      const nx = x + dx, ny = y + dy;
      return nx > 0 && nx < W - 1 && ny > 0 && ny < H - 1 && !visited[ny][nx];
    });
    if (opts.length === 0) { stack.pop(); continue; }
    const [dx, dy] = opts[Math.floor(rng() * opts.length)];
    const nx = x + dx, ny = y + dy;
    g[ny][nx] = ".";
    g[y + dy / 2][x + dx / 2] = ".";
    visited[ny][nx] = true;
    stack.push([nx, ny]);
  }
  // add loops
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    if (g[y][x] !== "#") continue;
    const horiz = g[y][x - 1] === "." && g[y][x + 1] === ".";
    const vert = g[y - 1][x] === "." && g[y + 1][x] === ".";
    if ((horiz || vert) && rng() < loopChance) g[y][x] = ".";
  }
  // tunnel row (wrap corridor)
  const tunnelRow = Math.floor(H / 2);
  for (let x = 0; x < W; x++) g[tunnelRow][x] = ".";
  return { g, tunnelRow };
}

function corridorCells(g, W, H) {
  const out = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g[y][x] === ".") out.push([x, y]);
  return out;
}

export function buildLevel(W, H, seed, loopChance) {
  const { g, tunnelRow } = generateGrid(W, H, seed, loopChance);
  const cells = corridorCells(g, W, H);
  const cx = (W - 1) / 2, cy = (H - 1) / 2;
  const dist = (x, y, tx, ty) => Math.hypot(x - tx, y - ty);

  // player: bottom-center
  const bottom = cells.filter(([, y]) => y === Math.max(...cells.map((c) => c[1])));
  const player = bottom.sort((a, b) => dist(a[0], a[1], cx, cy) - dist(b[0], b[1], cx, cy))[0];
  // exit: top-center
  const top = cells.filter(([, y]) => y === Math.min(...cells.map((c) => c[1])));
  const exit = top.sort((a, b) => dist(a[0], a[1], cx, cy) - dist(b[0], b[1], cx, cy))[0];
  // ghosts: 4 corridor cells near center, spread
  const nearCenter = [...cells].sort((a, b) => dist(a[0], a[1], cx, cy) - dist(b[0], b[1], cx, cy));
  const ghosts = [];
  for (const c of nearCenter) {
    if (ghosts.length >= 4) break;
    if (ghosts.every((o) => Math.hypot(o[0] - c[0], o[1] - c[1]) >= 2)) ghosts.push(c);
  }
  while (ghosts.length < 4) ghosts.push(nearCenter[ghosts.length % nearCenter.length]);
  // pellets: near 4 corners
  const corners = [[1, 1], [W - 2, 1], [1, H - 2], [W - 2, H - 2]];
  const pellets = corners.map((c) => [...cells].sort((a, b) => dist(a[0], a[1], c[0], c[1]) - dist(b[0], b[1], c[0], c[1]))[0]);

  const set = (x, y, ch) => { g[y][x] = ch; };
  set(player[0], player[1], "P");
  set(exit[0], exit[1], "S");
  ghosts.forEach((c) => set(c[0], c[1], "E"));
  pellets.forEach((c) => set(c[0], c[1], "O"));

  return { grid: g.map((r) => r.join("")), W, H, tunnelRow, player, exit, ghosts, pellets };
}

// ---- validate ----
function validate(lv) {
  const { grid, W, H, tunnelRow, player, exit, ghosts, pellets } = lv;
  // row lengths
  for (const r of grid) if (r.length !== W) throw new Error("row length " + r.length);
  const wrapX = (x, y) => { if (y === tunnelRow) { if (x < 0) return W - 1; if (x >= W) return 0; } return x; };
  const walk = (x, y) => { x = wrapX(x, y); if (x < 0 || x >= W || y < 0 || y >= H) return false; return grid[y][x] !== "#"; };
  // BFS from player
  const seen = new Set([player.join(",")]);
  const q = [player];
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = wrapX(x + dx, y + dy), ny = y + dy;
      if (!walk(x + dx, y + dy)) continue;
      const k = nx + "," + ny;
      if (!seen.has(k)) { seen.add(k); q.push([nx, ny]); }
    }
  }
  let dots = 0, unreachable = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (grid[y][x] === ".") { dots++; if (!seen.has(x + "," + y)) unreachable++; }
  }
  const chk = (c, name) => { if (!seen.has(c.join(","))) console.log(`  !! ${name} unreachable at ${c}`); };
  chk(exit, "exit"); ghosts.forEach((c, i) => chk(c, "ghost" + i)); pellets.forEach((c, i) => chk(c, "pellet" + i));
  console.log(`dots=${dots} unreachableDots=${unreachable} ghosts=${ghosts.length} pellets=${pellets.length}`);
  console.log(grid.join("\n"));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (let s = 1; s <= 3; s++) {
    console.log(`\n===== LEVEL seed=${s} =====`);
    validate(buildLevel(19, 21, s * 7919, 0.14));
  }
}

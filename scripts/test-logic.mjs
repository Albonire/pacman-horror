// src/config/levels.ts
function mulberry32(seed) {
  let a = seed >>> 0;
  return function() {
    a |= 0;
    a = a + 1831565813 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function generateGrid(W, H, rng, loopChance) {
  const g = Array.from({ length: H }, () => Array.from({ length: W }, () => "#"));
  const visited = Array.from({ length: H }, () => Array.from({ length: W }, () => false));
  const stack = [[1, 1]];
  visited[1][1] = true;
  g[1][1] = ".";
  const dirs = [[2, 0], [-2, 0], [0, 2], [0, -2]];
  while (stack.length) {
    const [x, y] = stack[stack.length - 1];
    const opts = dirs.filter(([dx2, dy2]) => {
      const nx2 = x + dx2, ny2 = y + dy2;
      return nx2 > 0 && nx2 < W - 1 && ny2 > 0 && ny2 < H - 1 && !visited[ny2][nx2];
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
function buildLevel(W, H, seed, loopChance) {
  const rng = mulberry32(seed);
  const { g, tunnelRow } = generateGrid(W, H, rng, loopChance);
  const cells = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g[y][x] === ".") cells.push([x, y]);
  const cx = (W - 1) / 2, cy = (H - 1) / 2;
  const dist = (x, y, tx, ty) => Math.hypot(x - tx, y - ty);
  const isCorr = (x, y) => g[y] !== void 0 && g[y][x] === ".";
  const degree = (x, y) => {
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
  const used = /* @__PURE__ */ new Set();
  const take = (c) => used.add(c.join(","));
  const free = (list) => list.filter((c) => !used.has(c.join(",")));
  const nearest = (list, tx, ty) => [...list].sort((a, b) => dist(a[0], a[1], tx, ty) - dist(b[0], b[1], tx, ty))[0];
  const deadEnds = cells.filter((c) => degree(c[0], c[1]) === 1);
  let exit;
  if (deadEnds.length) {
    exit = nearest(deadEnds, cx, 1);
  } else {
    const minRow = Math.min(...cells.map((c) => c[1]));
    exit = nearest(cells.filter(([, y]) => y === minRow), cx, cy);
  }
  take(exit);
  const maxRow = Math.max(...cells.map((c) => c[1]));
  const player = nearest(free(cells.filter(([, y]) => y === maxRow)), cx, cy);
  take(player);
  const nearCenter = free([...cells].sort((a, b) => dist(a[0], a[1], cx, cy) - dist(b[0], b[1], cx, cy)));
  const ghosts = [];
  for (const c of nearCenter) {
    if (ghosts.length >= 4) break;
    if (ghosts.every((o) => Math.hypot(o[0] - c[0], o[1] - c[1]) >= 2)) {
      ghosts.push([c[0], c[1]]);
      take(c);
    }
  }
  for (const c of nearCenter) {
    if (ghosts.length >= 4) break;
    if (!ghosts.some((o) => o[0] === c[0] && o[1] === c[1])) {
      ghosts.push([c[0], c[1]]);
      take(c);
    }
  }
  const corners = [[1, 1], [W - 2, 1], [1, H - 2], [W - 2, H - 2]];
  const pellets = [];
  for (const corner of corners) {
    const c = nearest(free(cells), corner[0], corner[1]);
    pellets.push([c[0], c[1]]);
    take(c);
  }
  const set = (x, y, ch) => {
    g[y][x] = ch;
  };
  set(player[0], player[1], "P");
  set(exit[0], exit[1], "S");
  ghosts.forEach((c) => set(c[0], c[1], "E"));
  pellets.forEach((c) => set(c[0], c[1], "O"));
  let totalDots = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g[y][x] === ".") totalDots++;
  return {
    grid: g.map((r) => r.join("")),
    W,
    H,
    tunnelRow,
    player: [player[0], player[1]],
    exit: [exit[0], exit[1]],
    ghosts: ghosts.map((c) => [c[0], c[1]]),
    pellets: pellets.map((c) => [c[0], c[1]]),
    totalDots
  };
}

// src/config/constants.ts
var CELL = 1.7;
var LEVELS = [
  { seed: 7919, loopChance: 0.14 },
  { seed: 15838, loopChance: 0.16 },
  { seed: 23757, loopChance: 0.18 }
];

// src/entities/Pathfinding.ts
var Maze = class {
  grid;
  W;
  H;
  tunnelRow;
  exitUnlocked = false;
  exitCell = [0, 0];
  constructor(grid, W, H, tunnelRow, exitCell) {
    this.grid = grid;
    this.W = W;
    this.H = H;
    this.tunnelRow = tunnelRow;
    this.exitCell = exitCell;
  }
  wrapX(x, y) {
    if (y === this.tunnelRow) {
      if (x < 0) return this.W - 1;
      if (x >= this.W) return 0;
    }
    return x;
  }
  inBounds(x, y) {
    return x >= 0 && x < this.W && y >= 0 && y < this.H;
  }
  charAt(x, y) {
    const wx = this.wrapX(x, y);
    if (!this.inBounds(wx, y)) return "#";
    return this.grid[y][wx];
  }
  isWalkable(x, y) {
    const wx = this.wrapX(x, y);
    if (!this.inBounds(wx, y)) return false;
    const ch = this.grid[y][wx];
    if (ch === "#") return false;
    if (ch === "S") return this.exitUnlocked;
    return true;
  }
  neighbors(x, y) {
    const out = [];
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [dx, dy] of dirs) {
      if (this.isWalkable(x + dx, y + dy)) {
        out.push({ x: this.wrapX(x + dx, y + dy), y: y + dy, dx, dy });
      }
    }
    return out;
  }
  cellToWorld(col, row) {
    return {
      x: (col - (this.W - 1) / 2) * CELL,
      z: (row - (this.H - 1) / 2) * CELL
    };
  }
  /** Línea de visión en la cuadrícula (Bresenham sobre celdas). */
  hasLineOfSight(ax, ay, bx, by) {
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
      if (e2 > -dy) {
        err -= dy;
        x0 += sx;
      }
      if (e2 < dx) {
        err += dx;
        y0 += sy;
      }
    }
  }
};
var DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
function manhattan(a, b) {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
}
function astar(maze, start, goal) {
  const key = (c) => c[0] + "," + c[1];
  const startK = key(start), goalK = key(goal);
  const open = /* @__PURE__ */ new Map();
  const gScore = /* @__PURE__ */ new Map();
  const came = /* @__PURE__ */ new Map();
  gScore.set(startK, 0);
  open.set(startK, manhattan(start, goal));
  const openList = [start];
  const inOpen = /* @__PURE__ */ new Set([startK]);
  while (openList.length) {
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
      const path = [current];
      let cur = ck;
      while (came.has(cur)) {
        const prev = came.get(cur);
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
function bfsDist(maze, start, goal) {
  if (start[0] === goal[0] && start[1] === goal[1]) return 0;
  const key = (c) => c[0] + "," + c[1];
  const seen = /* @__PURE__ */ new Set([key(start)]);
  const q = [{ c: start, d: 0 }];
  while (q.length) {
    const { c, d } = q.shift();
    for (const n of maze.neighbors(c[0], c[1])) {
      const nc = [n.x, n.y];
      const k = key(nc);
      if (seen.has(k)) continue;
      if (nc[0] === goal[0] && nc[1] === goal[1]) return d + 1;
      seen.add(k);
      q.push({ c: nc, d: d + 1 });
    }
  }
  return Infinity;
}
function bfsField(maze, sources) {
  const dist = Array.from({ length: maze.H }, () => Array.from({ length: maze.W }, () => Infinity));
  const q = [];
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

// scripts/test-logic.ts
var failures = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error("  FAIL:", msg);
    failures++;
  } else console.log("  ok:", msg);
}
function bfsReachable(maze, start) {
  const seen = /* @__PURE__ */ new Set([start.join(",")]);
  const q = [start];
  while (q.length) {
    const [x, y] = q.shift();
    for (const n of maze.neighbors(x, y)) {
      const k = n.x + "," + n.y;
      if (!seen.has(k)) {
        seen.add(k);
        q.push([n.x, n.y]);
      }
    }
  }
  return seen;
}
for (let li = 0; li < LEVELS.length; li++) {
  const cfg = LEVELS[li];
  console.log(`
=== LEVEL ${li} (seed ${cfg.seed}) ===`);
  const lv = buildLevel(19, 21, cfg.seed, cfg.loopChance);
  const maze = new Maze(lv.grid, lv.W, lv.H, lv.tunnelRow, lv.exit);
  assert(lv.grid.length === 21, "21 rows");
  assert(lv.grid.every((r) => r.length === 19), "all rows 19 cols");
  const reach = bfsReachable(maze, lv.player);
  let dots = 0, unreachableDots = 0;
  for (let y = 0; y < lv.H; y++) for (let x = 0; x < lv.W; x++) {
    if (lv.grid[y][x] === ".") {
      dots++;
      if (!reach.has(x + "," + y)) unreachableDots++;
    }
  }
  assert(unreachableDots === 0, `all ${dots} dots reachable with exit locked (unreachable=${unreachableDots})`);
  assert(lv.ghosts.every((g) => reach.has(g.join(","))), "all ghost spawns reachable");
  assert(lv.pellets.every((p) => reach.has(p.join(","))), "all pellets reachable");
  maze.exitUnlocked = true;
  const reachU = bfsReachable(maze, lv.player);
  assert(reachU.has(lv.exit.join(",")), "exit reachable when unlocked");
  maze.exitUnlocked = false;
  assert(!maze.isWalkable(lv.exit[0], lv.exit[1]), "exit blocked while locked");
  maze.exitUnlocked = true;
  assert(maze.isWalkable(lv.exit[0], lv.exit[1]), "exit walkable when unlocked");
  maze.exitUnlocked = false;
  maze.exitUnlocked = true;
  const path = astar(maze, lv.player, lv.exit);
  assert(path !== null && path.length > 1, "astar finds path player->exit");
  if (path) {
    let valid = true;
    for (let i = 1; i < path.length; i++) {
      const dx = Math.abs(path[i][0] - path[i - 1][0]);
      const dy = Math.abs(path[i][1] - path[i - 1][1]);
      const adj = dx === 1 && dy === 0 || dx === 0 && dy === 1 || dy === 0 && path[i - 1][1] === lv.tunnelRow && dx === lv.W - 1;
      if (!adj || !maze.isWalkable(path[i][0], path[i][1])) {
        valid = false;
        break;
      }
    }
    assert(valid, "astar path is contiguous & walkable");
    assert(bfsDist(maze, lv.player, lv.exit) === path.length - 1, "astar length == bfs shortest");
  }
  for (const g of lv.ghosts) {
    const p = astar(maze, lv.player, g);
    assert(p !== null, `astar path player->ghost ${g}`);
  }
  const field = bfsField(maze, lv.ghosts);
  const pd = field[lv.player[1]][lv.player[0]];
  assert(Number.isFinite(pd) && pd > 0, `bfsField finite at player (${pd})`);
  assert(maze.isWalkable(-1, lv.tunnelRow), "wrap: x=-1 on tunnel row walkable");
  assert(maze.isWalkable(lv.W, lv.tunnelRow), "wrap: x=W on tunnel row walkable");
  const wrapNeighbors = maze.neighbors(0, lv.tunnelRow);
  assert(wrapNeighbors.some((n) => n.x === lv.W - 1), "neighbors of (0,tunnel) include wrap (W-1)");
  assert(maze.hasLineOfSight(lv.player[0], lv.player[1], lv.player[0], lv.player[1]), "LOS self true");
  let losTrue = false, losFalse = false;
  const nb = maze.neighbors(lv.player[0], lv.player[1]);
  if (nb.length) {
    losTrue = maze.hasLineOfSight(lv.player[0], lv.player[1], nb[0].x, nb[0].y);
  }
  outer: for (let y = 1; y < lv.H - 1; y++) for (let x = 1; x < lv.W - 1; x++) {
    if (lv.grid[y][x] === "#" && lv.grid[y][x - 1] !== "#" && lv.grid[y][x + 1] !== "#") {
      losFalse = !maze.hasLineOfSight(x - 1, y, x + 1, y);
      break outer;
    }
  }
  assert(losTrue, "LOS to adjacent corridor true");
  assert(losFalse, "LOS blocked across a wall");
  const c0 = maze.cellToWorld(0, 0);
  const c1 = maze.cellToWorld(lv.W - 1, lv.H - 1);
  assert(Math.abs(c0.x + c1.x) < 1e-6 && Math.abs(c0.z + c1.z) < 1e-6, "cellToWorld centered at origin");
}
console.log(`
${failures === 0 ? "ALL TESTS PASSED" : failures + " TEST(S) FAILED"}`);
process.exit(failures === 0 ? 0 : 1);

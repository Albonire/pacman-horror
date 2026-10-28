import { buildLevel } from "../src/config/levels";
import { Maze, astar, bfsDist, bfsField } from "../src/entities/Pathfinding";
import { LEVELS } from "../src/config/constants";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { console.error("  FAIL:", msg); failures++; }
  else console.log("  ok:", msg);
}

function bfsReachable(maze: Maze, start: [number, number]): Set<string> {
  const seen = new Set<string>([start.join(",")]);
  const q: [number, number][] = [start];
  while (q.length) {
    const [x, y] = q.shift()!;
    for (const n of maze.neighbors(x, y)) {
      const k = n.x + "," + n.y;
      if (!seen.has(k)) { seen.add(k); q.push([n.x, n.y]); }
    }
  }
  return seen;
}

for (let li = 0; li < LEVELS.length; li++) {
  const cfg = LEVELS[li];
  console.log(`\n=== LEVEL ${li} (seed ${cfg.seed}) ===`);
  const lv = buildLevel(19, 21, cfg.seed, cfg.loopChance);
  const maze = new Maze(lv.grid, lv.W, lv.H, lv.tunnelRow, lv.exit);

  // dims
  assert(lv.grid.length === 21, "21 rows");
  assert(lv.grid.every((r) => r.length === 19), "all rows 19 cols");

  // reachability from player
  const reach = bfsReachable(maze, lv.player);
  let dots = 0, unreachableDots = 0;
  for (let y = 0; y < lv.H; y++) for (let x = 0; x < lv.W; x++) {
    if (lv.grid[y][x] === ".") { dots++; if (!reach.has(x + "," + y)) unreachableDots++; }
  }
  assert(unreachableDots === 0, `all ${dots} dots reachable with exit locked (unreachable=${unreachableDots})`);
  assert(lv.ghosts.every((g) => reach.has(g.join(","))), "all ghost spawns reachable");
  assert(lv.pellets.every((p) => reach.has(p.join(","))), "all pellets reachable");

  // exit reachable when unlocked (locked it is a sealed door at a dead-end)
  maze.exitUnlocked = true;
  const reachU = bfsReachable(maze, lv.player);
  assert(reachU.has(lv.exit.join(",")), "exit reachable when unlocked");
  maze.exitUnlocked = false;

  // exit lock
  assert(!maze.isWalkable(lv.exit[0], lv.exit[1]), "exit blocked while locked");
  maze.exitUnlocked = true;
  assert(maze.isWalkable(lv.exit[0], lv.exit[1]), "exit walkable when unlocked");
  maze.exitUnlocked = false;

  // astar player -> exit (unlocked)
  maze.exitUnlocked = true;
  const path = astar(maze, lv.player, lv.exit);
  assert(path !== null && path.length > 1, "astar finds path player->exit");
  if (path) {
    let valid = true;
    for (let i = 1; i < path.length; i++) {
      const dx = Math.abs(path[i][0] - path[i - 1][0]);
      const dy = Math.abs(path[i][1] - path[i - 1][1]);
      // adjacent (accounting for wrap on tunnel row)
      const adj = (dx === 1 && dy === 0) || (dx === 0 && dy === 1) ||
        (dy === 0 && (path[i - 1][1] === lv.tunnelRow) && (dx === lv.W - 1));
      if (!adj || !maze.isWalkable(path[i][0], path[i][1])) { valid = false; break; }
    }
    assert(valid, "astar path is contiguous & walkable");
    assert(bfsDist(maze, lv.player, lv.exit) === path.length - 1, "astar length == bfs shortest");
  }

  // astar player -> each ghost
  for (const g of lv.ghosts) {
    const p = astar(maze, lv.player, g);
    assert(p !== null, `astar path player->ghost ${g}`);
  }

  // bfsField from ghosts: player cell finite
  const field = bfsField(maze, lv.ghosts);
  const pd = field[lv.player[1]][lv.player[0]];
  assert(Number.isFinite(pd) && pd > 0, `bfsField finite at player (${pd})`);

  // wrap on tunnel row
  assert(maze.isWalkable(-1, lv.tunnelRow), "wrap: x=-1 on tunnel row walkable");
  assert(maze.isWalkable(lv.W, lv.tunnelRow), "wrap: x=W on tunnel row walkable");
  const wrapNeighbors = maze.neighbors(0, lv.tunnelRow);
  assert(wrapNeighbors.some((n) => n.x === lv.W - 1), "neighbors of (0,tunnel) include wrap (W-1)");

  // line of sight
  assert(maze.hasLineOfSight(lv.player[0], lv.player[1], lv.player[0], lv.player[1]), "LOS self true");
  // find an adjacent corridor cell and a wall between
  let losTrue = false, losFalse = false;
  const nb = maze.neighbors(lv.player[0], lv.player[1]);
  if (nb.length) {
    losTrue = maze.hasLineOfSight(lv.player[0], lv.player[1], nb[0].x, nb[0].y);
  }
  // LOS across a wall: find two corridor cells separated by a wall
  outer: for (let y = 1; y < lv.H - 1; y++) for (let x = 1; x < lv.W - 1; x++) {
    if (lv.grid[y][x] === "#" && lv.grid[y][x - 1] !== "#" && lv.grid[y][x + 1] !== "#") {
      losFalse = !maze.hasLineOfSight(x - 1, y, x + 1, y);
      break outer;
    }
  }
  assert(losTrue, "LOS to adjacent corridor true");
  assert(losFalse, "LOS blocked across a wall");

  // cellToWorld centered
  const c0 = maze.cellToWorld(0, 0);
  const c1 = maze.cellToWorld(lv.W - 1, lv.H - 1);
  assert(Math.abs(c0.x + c1.x) < 1e-6 && Math.abs(c0.z + c1.z) < 1e-6, "cellToWorld centered at origin");
}

console.log(`\n${failures === 0 ? "ALL TESTS PASSED" : failures + " TEST(S) FAILED"}`);
process.exit(failures === 0 ? 0 : 1);

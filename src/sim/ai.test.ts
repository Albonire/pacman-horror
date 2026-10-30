import { describe, expect, it } from "vitest";
import { CELL } from "../config/constants";
import { GhostSim, type AIContext } from "./ghost";
import { canHear, canSee, chaseTarget, junctionAhead, noticePlayer, searchTarget } from "./hunt";
import { Maze } from "./maze";
import { Trail } from "./trail";

function createTestMaze(): Maze {
  // 9x9 test grid with an open corridor at x=1 (y=1..7) and a wall at (4,4)
  const grid = [
    "#########",
    "#.......#",
    "#.#####.#",
    "#.#...#.#",
    "#.#.#.#.#",
    "#.#...#.#",
    "#.#####.#",
    "#.......#",
    "#########",
  ];
  return new Maze({
    W: 9,
    H: 9,
    grid,
    tunnelRow: 4,
    exit: [1, 1],
    exitDir: [0, -1],
  });
}

function createAIContext(maze: Maze, overrides?: Partial<AIContext>): AIContext {
  const pWorld = maze.cellToWorld(1, 5);
  const trail = new Trail(10);
  return {
    maze,
    playerCell: [1, 5],
    playerHeading: [0, -1],
    playerNoisy: false,
    ghosts: [],
    rng: () => 0.5,
    mistake: 0,
    time: 10,
    playerX: pWorld.x,
    playerZ: pWorld.z,
    playerView: [0, -1],
    playerRunning: false,
    trail,
    trailDelay: 2.0,
    memory: 2.0,
    searchTime: 2.0,
    viewCells: 6,
    fovCos: Math.cos((100 / 2) * (Math.PI / 180)),
    hearCells: 6,
    ...overrides,
  };
}

describe("ghost sensory perception (fovCos, rayClear)", () => {
  it("detects player inside vision cone and rejects player outside vision cone at distance", () => {
    const maze = createTestMaze();
    const ghost = new GhostSim(0, maze, [1, 3], [1, 1]);
    ghost.mode = "chase";

    const gPos = maze.cellToWorld(1, 3);
    ghost.cx = 1;
    ghost.cy = 3;
    ghost.x = gPos.x;
    ghost.z = gPos.z;
    ghost.yaw = 0; // facing +z (towards cell y = 5)

    // player at (1, 5) -> 2 cells in front, within viewCells (6)
    const pPosFacing = maze.cellToWorld(1, 5);
    const ctxFacing = createAIContext(maze, {
      playerCell: [1, 5],
      playerX: pPosFacing.x,
      playerZ: pPosFacing.z,
      viewCells: 6,
    });
    expect(canSee(ghost, maze, ctxFacing)).toBe(true);

    // player at (1, 1) -> 2 cells behind ghost (distance 2 > CLOSE_SENSE 1.6)
    const pPosBehind = maze.cellToWorld(1, 1);
    const ctxBehind = createAIContext(maze, {
      playerCell: [1, 1],
      playerX: pPosBehind.x,
      playerZ: pPosBehind.z,
      viewCells: 6,
    });
    expect(canSee(ghost, maze, ctxBehind)).toBe(false);
  });

  it("detects player at very close range regardless of orientation (close sense)", () => {
    const maze = createTestMaze();
    const ghost = new GhostSim(0, maze, [1, 3], [1, 1]);
    const gPos = maze.cellToWorld(1, 3);
    ghost.cx = 1;
    ghost.cy = 3;
    ghost.x = gPos.x;
    ghost.z = gPos.z;
    ghost.yaw = 0; // facing south (+z)

    // player 1.0 cell behind ghost at (1, 2), distance 1.0 <= CLOSE_SENSE 1.6
    const pPosClose = maze.cellToWorld(1, 2);
    const ctxCloseBehind = createAIContext(maze, {
      playerCell: [1, 2],
      playerX: pPosClose.x,
      playerZ: pPosClose.z,
    });
    expect(canSee(ghost, maze, ctxCloseBehind)).toBe(true);
  });

  it("fails vision check when obstructed by a wall (rayClear)", () => {
    const maze = createTestMaze();
    const ghost = new GhostSim(0, maze, [1, 4], [1, 1]);
    const gPos = maze.cellToWorld(1, 4);
    ghost.cx = 1;
    ghost.cy = 4;
    ghost.x = gPos.x;
    ghost.z = gPos.z;
    ghost.yaw = Math.PI / 2; // facing east (+x)

    // player at (7, 4) directly east, separated by wall at (2, 4)
    const pPosBlocked = maze.cellToWorld(7, 4);
    const ctxBlocked = createAIContext(maze, {
      playerCell: [7, 4],
      playerX: pPosBlocked.x,
      playerZ: pPosBlocked.z,
      viewCells: 8,
    });
    expect(maze.rayClear(ghost.x, ghost.z, ctxBlocked.playerX, ctxBlocked.playerZ, 0.4)).toBe(false);
    expect(canSee(ghost, maze, ctxBlocked)).toBe(false);
  });
});

describe("running step noise detection", () => {
  it("ignores quiet player and detects noisy player within hearCells radius", () => {
    const maze = createTestMaze();
    const ghost = new GhostSim(2, maze, [1, 1], [1, 1]);
    const gPos = maze.cellToWorld(1, 1);
    ghost.cx = 1;
    ghost.cy = 1;
    ghost.x = gPos.x;
    ghost.z = gPos.z;

    const pPos4 = maze.cellToWorld(1, 5);
    const ctxQuiet = createAIContext(maze, {
      playerCell: [1, 5],
      playerX: pPos4.x,
      playerZ: pPos4.z,
      playerNoisy: false,
      hearCells: 6,
    });
    expect(canHear(ghost, ctxQuiet)).toBe(false);

    const ctxNoisyWalking = createAIContext(maze, {
      playerCell: [1, 5],
      playerX: pPos4.x,
      playerZ: pPos4.z,
      playerNoisy: true,
      playerRunning: false,
      hearCells: 6,
    });
    expect(canHear(ghost, ctxNoisyWalking)).toBe(true);
  });

  it("expands hearing radius by 25% when player is running", () => {
    const maze = createTestMaze();
    const ghost = new GhostSim(2, maze, [1, 1], [1, 1]);
    const gPos = maze.cellToWorld(1, 1);
    ghost.cx = 1;
    ghost.cy = 1;
    ghost.x = gPos.x;
    ghost.z = gPos.z;

    // distance = 7.0 cells (gPos.z + 7.0 * CELL)
    // hearCells = 6: walking limit = 6.0, running limit = 7.5
    const pZ7 = gPos.z + 7.0 * CELL;

    const ctxWalking = createAIContext(maze, {
      playerCell: [1, 8],
      playerX: gPos.x,
      playerZ: pZ7,
      playerNoisy: true,
      playerRunning: false,
      hearCells: 6,
    });
    expect(canHear(ghost, ctxWalking)).toBe(false);

    const ctxRunning = createAIContext(maze, {
      playerCell: [1, 8],
      playerX: gPos.x,
      playerZ: pZ7,
      playerNoisy: true,
      playerRunning: true,
      hearCells: 6,
    });
    expect(canHear(ghost, ctxRunning)).toBe(true);

    // distance = 8.0 cells (> 7.5 limit even running)
    const pZ8 = gPos.z + 8.0 * CELL;
    const ctxTooFar = createAIContext(maze, {
      playerCell: [1, 8],
      playerX: gPos.x,
      playerZ: pZ8,
      playerNoisy: true,
      playerRunning: true,
      hearCells: 6,
    });
    expect(canHear(ghost, ctxTooFar)).toBe(false);
  });
});

describe("sensory memory expiration", () => {
  it("tracks last seen position, searches perimeter, and expires after memory + searchTime", () => {
    const maze = createTestMaze();
    const ghost = new GhostSim(0, maze, [1, 1], [1, 1]);
    const gPos = maze.cellToWorld(1, 1);
    ghost.cx = 1;
    ghost.cy = 1;
    ghost.x = gPos.x;
    ghost.z = gPos.z;
    ghost.yaw = 0; // facing south (+z)

    const pPosSeen = maze.cellToWorld(1, 3);
    const ctx = createAIContext(maze, {
      playerCell: [1, 3],
      playerX: pPosSeen.x,
      playerZ: pPosSeen.z,
      memory: 2.0,
      searchTime: 1.5,
      viewCells: 6,
    });

    // ghost sees player
    noticePlayer(ghost, ctx, 0.1);
    expect(ghost.lastSeen).toEqual([1, 3]);
    expect(ghost.sawPlayer).toBe(true);
    expect(ghost.lostT).toBe(0);

    // move player out of sight and sound
    const pHidden = maze.cellToWorld(7, 7);
    const ctxHidden = createAIContext(maze, {
      playerCell: [7, 7],
      playerX: pHidden.x,
      playerZ: pHidden.z,
      memory: 2.0,
      searchTime: 1.5,
      viewCells: 2,
    });

    // lost for 1.0s (<= memory 2.0s) -> chases lastSeen
    noticePlayer(ghost, ctxHidden, 1.0);
    expect(ghost.lastSeen).toEqual([1, 3]);
    expect(ghost.sawPlayer).toBe(false);
    expect(ghost.lostT).toBeCloseTo(1.0);
    expect(chaseTarget(ghost, ctxHidden)).toEqual([1, 3]);

    // lost for 2.5s (> memory 2.0s, <= memory + searchTime 3.5s) -> searches perimeter
    noticePlayer(ghost, ctxHidden, 1.5);
    expect(ghost.lostT).toBeCloseTo(2.5);
    const searchCell = chaseTarget(ghost, ctxHidden);
    expect(searchCell).toEqual(searchTarget(ghost, ctxHidden));

    // lost for 3.6s (> 3.5s) -> memory expires completely
    noticePlayer(ghost, ctxHidden, 1.1);
    expect(ghost.lastSeen).toBeNull();
    expect(ghost.lostT).toBe(0);
  });
});

describe("Blinky stalker target calculation", () => {
  it("targets delayed player trail when available", () => {
    const maze = createTestMaze();
    const ghost = new GhostSim(0, maze, [1, 1], [1, 1]);
    ghost.cx = 1;
    ghost.cy = 1;
    ghost.refreshWorld(maze);

    const trail = new Trail(10);
    // player moved from (1, 5) at t=7.0 to (1, 7) at t=9.0
    const p1World = maze.cellToWorld(1, 5);
    const p2World = maze.cellToWorld(1, 7);
    trail.push(7.0, p1World.x, p1World.z);
    trail.push(9.0, p2World.x, p2World.z);

    const ctx = createAIContext(maze, {
      playerCell: [1, 7],
      playerX: p2World.x,
      playerZ: p2World.z,
      playerView: [0, 1],
      trail,
      trailDelay: 2.0,
      time: 9.0, // delayed time is 7.0
    });

    // Blinky (kind 0) without active visual memory follows delayed trail
    ghost.lastSeen = null;
    const target = chaseTarget(ghost, ctx);
    expect(target).toEqual([1, 5]);
  });

  it("falls back to cell behind player when trail is missing", () => {
    const maze = createTestMaze();
    const ghost = new GhostSim(0, maze, [1, 1], [1, 1]);
    const emptyTrail = new Trail(10);

    const ctx = createAIContext(maze, {
      playerCell: [1, 5],
      playerView: [0, 1], // looking south (+z)
      trail: emptyTrail,
      time: 10,
    });

    ghost.lastSeen = null;
    const target = chaseTarget(ghost, ctx);
    // behind player looking south is north: [1, 5 - 2] = [1, 3]
    expect(target).toEqual([1, 3]);
  });

  it("prioritizes direct visual memory over stalker trail when player was recently seen", () => {
    const maze = createTestMaze();
    const ghost = new GhostSim(0, maze, [1, 1], [1, 1]);
    const trail = new Trail(10);
    const pDelayed = maze.cellToWorld(1, 3);
    trail.push(5.0, pDelayed.x, pDelayed.z);

    const ctx = createAIContext(maze, {
      playerCell: [1, 5],
      trail,
      trailDelay: 2.0,
      time: 7.0,
      memory: 2.0,
    });

    // ghost recently saw player at (1, 4) with lostT 0.5s <= memory 2.0s
    ghost.lastSeen = [1, 4];
    ghost.lostT = 0.5;
    expect(chaseTarget(ghost, ctx)).toEqual([1, 4]);
  });

  describe("reparto de papeles cuando ven al jugador", () => {
    it("junctionAhead sigue el pasillo (y sus giros) hasta el limite de pasos", () => {
      const maze = createTestMaze();
      expect(junctionAhead(maze, [1, 5], [0, -1], 3)).toEqual([1, 2]);
      // el pasillo gira al llegar a la fila 1 y sigue por ella
      expect(junctionAhead(maze, [1, 5], [0, -1], 5)).toEqual([2, 1]);
      expect(junctionAhead(maze, [1, 5], [0, 0], 5)).toEqual([1, 5]);
    });

    it("la Emboscadora que ve al jugador se adelanta a donde va, no a donde esta", () => {
      const maze = createTestMaze();
      const ghost = new GhostSim(1, maze, [1, 1], [1, 1]);
      ghost.sawPlayer = true;
      ghost.lastSeen = [1, 5];
      const ctx = createAIContext(maze, { playerCell: [1, 5], playerHeading: [0, -1] });
      expect(chaseTarget(ghost, ctx)).toEqual([2, 1]);
    });

    it("el Acechador que ve al jugador va directo; si otro ya lo tiene encima, se cuelga de su espalda", () => {
      const maze = createTestMaze();
      const blinky = new GhostSim(0, maze, [1, 1], [1, 1]);
      blinky.sawPlayer = true;
      blinky.lastSeen = [1, 5];
      const ctx = createAIContext(maze, { playerCell: [1, 5], playerHeading: [0, -1], ghosts: [blinky] });
      expect(chaseTarget(blinky, ctx)).toEqual([1, 5]);

      const other = new GhostSim(1, maze, [1, 4], [1, 4]);
      other.mode = "chase";
      const covered = createAIContext(maze, { playerCell: [1, 5], playerHeading: [0, -1], ghosts: [blinky, other] });
      // la espalda del jugador (que va al norte) es el sur: [1,6], [1,7] y el giro al este
      expect(chaseTarget(blinky, covered)).toEqual([2, 7]);
    });

    it("al alcance (2,5 celdas o menos) todos van directos", () => {
      const maze = createTestMaze();
      const pinky = new GhostSim(1, maze, [1, 3], [1, 3]);
      pinky.sawPlayer = true;
      pinky.lastSeen = [1, 5];
      const ctx = createAIContext(maze, { playerCell: [1, 5], playerHeading: [0, -1] });
      expect(chaseTarget(pinky, ctx)).toEqual([1, 5]);
    });
  });
});

// Nucleo de la simulacion de UMBRAL. Logica pura: sin DOM, sin three.js, determinista con rng.
// El motor de render consume su estado y drena `events` en cada frame.

import * as K from "../config/constants";
import type { DifficultyDef } from "../config/difficulty";
import type { LevelDef } from "../config/campaign";
import { type AABB, depenetrate } from "./collision";
import type { SimEvent } from "./events";
import {
  GhostSim, chaseTarget, chooseFlee, chooseToward,
  type AIContext, type GhostKind,
} from "./ghost";
import { generateLayout, type LevelLayout } from "./layout";
import { DIRS, Maze, type Cell } from "./maze";
import { PlayerSim, type PlayerInput } from "./player";
import { mulberry32, type Rng } from "./rng";

export type SimState = "playing" | "caught" | "complete";

export interface SimInit {
  level: LevelDef;
  difficulty: DifficultyDef;
  layout?: LevelLayout;
  rng?: Rng;
  score?: number;
  lives?: number;
}

export interface PelletState {
  cell: Cell;
  x: number;
  z: number;
  eaten: boolean;
}

const STARTLE_DIST = 3.6;
const STARTLE_DELAY = 0.9;
const GAZE_COS = Math.cos((38 * Math.PI) / 180);
const FRUIT_LIFETIME = 14;

export class Simulation {
  readonly level: LevelDef;
  readonly diff: DifficultyDef;
  readonly layout: LevelLayout;
  readonly maze: Maze;
  readonly player = new PlayerSim();
  readonly rng: Rng;

  ghosts: GhostSim[] = [];
  colliders: AABB[] = [];
  events: SimEvent[] = [];
  state: SimState = "playing";
  caughtBy: GhostSim | null = null;

  // progreso
  totalDots: number;
  dotsEaten = 0;
  readonly dotGrid: Uint8Array;
  pellets: PelletState[] = [];
  fruit = { active: false, x: 0, z: 0, timer: 0, spawned: 0 };
  score: number;
  rawPoints = 0;
  lives: number;
  extraLifeGiven = false;
  stats = { deaths: 0, ghostsEaten: 0, fruitEaten: 0, pellets: 0 };

  time = 0;
  attemptTime = 0;
  exitUnlocked = false;

  // fases
  waveIndex = 0;
  waveMode: "scatter" | "chase" = "scatter";
  waveTimer = 0;
  frightTimer = 0;
  frightTotal = 0;
  combo = 0;

  private ctx: AIContext;
  private ctxNoMistake: AIContext;

  constructor(init: SimInit) {
    this.level = init.level;
    this.diff = init.difficulty;
    this.layout = init.layout ?? generateLayout({
      W: init.level.W, H: init.level.H, seed: init.level.seed,
      loopChance: init.level.loopChance, braid: init.level.braid,
    });
    this.maze = new Maze(this.layout);
    this.rng = init.rng ?? mulberry32((init.level.seed ^ 0x9e3779b9) >>> 0);
    this.score = init.score ?? 0;
    this.lives = init.lives ?? init.difficulty.lives;

    const { W, H } = this.maze;
    this.dotGrid = new Uint8Array(W * H);
    let n = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (this.layout.grid[y][x] === ".") { this.dotGrid[y * W + x] = 1; n++; }
    }
    this.totalDots = n;

    this.pellets = this.layout.pellets.map((cell) => {
      const w = this.maze.cellToWorld(cell[0], cell[1]);
      return { cell, x: w.x, z: w.z, eaten: false };
    });

    const corners: Cell[] = [[W - 2, 1], [1, 1], [W - 2, H - 2], [1, H - 2]];
    const count = Math.max(1, Math.min(4, this.level.ghosts + this.diff.extraGhosts));
    for (let i = 0; i < count; i++) {
      this.ghosts.push(new GhostSim(i as GhostKind, this.maze, this.layout.ghosts[i], this.maze.nearestWalkable(corners[i])));
    }

    this.ctx = {
      maze: this.maze,
      playerCell: [0, 0],
      playerHeading: [0, -1],
      playerNoisy: false,
      ghosts: this.ghosts,
      rng: this.rng,
      mistake: this.diff.mistake,
    };

    this.ctxNoMistake = { ...this.ctx, mistake: 0 };

    this.respawnPlayer(true);
  }

  // ---------------- ciclo de vida ----------------

  /** Coloca al jugador y deja a los fantasmas dormidos en su guarida. */
  respawnPlayer(first = false): void {
    const [px, py] = this.layout.player;
    const w = this.maze.cellToWorld(px, py);
    // mira hacia el pasillo abierto mas largo
    let bestDir: Cell = [0, -1], bestRun = -1;
    for (const d of DIRS) {
      let run = 0;
      while (run < 12 && this.maze.isWalkable(px + d[0] * (run + 1), py + d[1] * (run + 1))) run++;
      if (run > bestRun) { bestRun = run; bestDir = d; }
    }
    this.player.reset(w.x, w.z, Math.atan2(-bestDir[0], -bestDir[1]));
    depenetrate(this.maze, this.colliders, this.player, K.PLAYER_RADIUS);
    this.player.invuln = first ? 0 : K.INVULN_TIME;
    this.state = "playing";
    this.caughtBy = null;
    this.attemptTime = 0;
    this.frightTimer = 0;
    this.combo = 0;
    this.waveIndex = 0;
    this.waveMode = "scatter";
    this.waveTimer = this.waveDuration(0);
    for (const g of this.ghosts) {
      g.resetToSpawn(this.maze, "dormant");
      g.wakeTimer = 0;
    }
    this.fruit.active = false;
  }

  /** Se llama tras el susto de muerte: resta una vida y reaparece si quedan. Devuelve true si es game over. */
  loseLife(): boolean {
    this.lives--;
    this.stats.deaths++;
    if (this.lives <= 0) return true;
    this.respawnPlayer();
    return false;
  }

  // ---------------- utilidades ----------------

  private waveDuration(i: number): number {
    const base = this.level.waves[Math.min(i, this.level.waves.length - 1)];
    if (!Number.isFinite(base)) return Infinity;
    return i % 2 === 0 ? base / this.diff.chaseBias : base * this.diff.chaseBias;
  }

  get remainingDots(): number { return this.totalDots - this.dotsEaten; }
  get powered(): boolean { return this.frightTimer > 0; }
  get activeGhostCount(): number { return this.ghosts.filter((g) => g.active && g.mode !== "eaten").length; }

  /** Fraccion de puntos pendientes (para el Acechador "Elroy"). */
  private elroyLevel(): 0 | 1 | 2 {
    const frac = this.remainingDots / this.totalDots;
    return frac <= 0.12 ? 2 : frac <= 0.25 ? 1 : 0;
  }

  addScore(base: number): void {
    const pts = Math.round(base * this.diff.scoreMult);
    this.score += pts;
    this.rawPoints += base;
    if (!this.extraLifeGiven && this.rawPoints >= K.EXTRA_LIFE_SCORE) {
      this.extraLifeGiven = true;
      this.lives++;
      this.events.push({ type: "extraLife" });
    }
  }

  private emit(e: SimEvent): void { this.events.push(e); }

  /** Drena los eventos acumulados. */
  drainEvents(): SimEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  // ---------------- actualizacion ----------------

  update(dt: number, input: PlayerInput): void {
    if (this.state !== "playing") return;
    this.time += dt;
    this.attemptTime += dt;

    const anyFrozen = this.ghosts.some((g) => g.frozen);
    this.player.update(dt, input, this.maze, this.colliders, {
      staminaDrain: this.diff.staminaDrain,
      batteryDrain: this.diff.batteryDrain,
      stareDrain: anyFrozen,
    }, this.events);

    this.updateWaves(dt);
    this.updateGhosts(dt);
    this.checkCatch();
    if (this.state !== "playing") return;
    this.checkDots();
    this.checkPellets();
    this.updateFruit(dt);
    this.checkExit();
  }

  private updateWaves(dt: number): void {
    if (this.frightTimer > 0) {
      this.frightTimer -= dt;
      if (this.frightTimer <= 0) {
        this.frightTimer = 0;
        for (const g of this.ghosts) if (g.mode === "frightened") g.mode = this.waveMode;
        this.emit({ type: "powerEnd" });
      }
      return; // las fases se detienen mientras dura el poder
    }
    this.waveTimer -= dt;
    if (this.waveTimer <= 0) {
      this.waveIndex++;
      this.waveMode = this.waveIndex % 2 === 0 ? "scatter" : "chase";
      this.waveTimer = this.waveDuration(this.waveIndex);
      for (const g of this.ghosts) {
        if (g.mode === "scatter" || g.mode === "chase") {
          if (g.mode !== this.waveMode) g.reverseQueued = true;
          g.mode = this.waveMode;
        }
      }
      this.emit({ type: "waveChange", mode: this.waveMode });
    }
  }

  private wake(g: GhostSim, startled: boolean): void {
    g.mode = this.frightTimer > 0 ? "frightened" : this.waveMode;
    g.wakeTimer = 0;
    g.startled = false;
    g.awakeFor = 0;
    g.reverseQueued = false;
    this.emit({ type: "ghostWake", ghost: g.kind, startled });
  }

  private isGazed(g: GhostSim): boolean {
    const p = this.player;
    const dx = g.x - p.x, dz = g.z - p.z;
    const d = Math.hypot(dx, dz);
    const range = p.lightOn ? 24 : 6.5;
    if (d > range) return false;
    if (d < 0.3) return true;
    const [fx, fz] = p.forwardVec();
    if ((fx * dx + fz * dz) / d < GAZE_COS) return false;
    return this.maze.rayClear(p.x, p.z, g.x, g.z);
  }

  private updateGhosts(dt: number): void {
    const p = this.player;
    const ctx = this.ctx;
    ctx.playerCell = this.maze.worldToCell(p.x, p.z);
    ctx.playerHeading = p.heading;
    ctx.playerNoisy = p.noise > 0.6;
    const baseSpeed = K.GHOST_SPEED_BASE * this.level.ghostSpeed * this.diff.ghostSpeed;
    const elroy = this.elroyLevel();

    for (const g of this.ghosts) {
      g.awakeFor += dt;

      if (g.mode === "dormant") {
        this.updateDormant(g, dt);
        continue;
      }

      // El Estatico: se congela mientras se le mira
      if (g.kind === 3 && (g.mode === "scatter" || g.mode === "chase")) {
        const gazed = this.isGazed(g);
        if (gazed !== g.frozen) {
          g.frozen = gazed;
          g.watched = 0;
          if (!gazed) g.dash = 0.8; // se lanza al dejar de ser observado
          this.emit({ type: "frozen", ghost: g.kind, frozen: gazed });
        }
        if (g.frozen) g.watched += dt;
      } else if (g.frozen) {
        g.frozen = false;
        this.emit({ type: "frozen", ghost: g.kind, frozen: false });
      }
      if (g.dash > 0) g.dash -= dt;
      if (g.frozen) { g.refreshWorld(this.maze); continue; }

      const inTunnel = g.cy === this.maze.tunnelRow && (g.cx <= 2 || g.cx >= this.maze.W - 3);
      const tunnel = inTunnel ? K.GHOST_TUNNEL_FACTOR : 1;
      let wrapped = false;

      if (g.mode === "eaten") {
        g.speedCells = K.GHOST_EATEN_SPEED;
        wrapped = g.advance(this.maze, dt, (gg) => chooseToward(gg, this.ctxNoMistake, gg.spawn));
        if (g.cx === g.spawn[0] && g.cy === g.spawn[1]) {
          g.resetToSpawn(this.maze, "dormant");
          g.wakeTimer = 3.2;
        }
      } else if (g.mode === "frightened") {
        g.speedCells = baseSpeed * K.GHOST_FRIGHT_FACTOR * tunnel;
        wrapped = g.advance(this.maze, dt, (gg) => chooseFlee(gg, ctx));
      } else {
        // scatter / chase
        let speed = baseSpeed * tunnel;
        let mode = g.mode;
        if (g.kind === 0 && elroy > 0) { mode = "chase"; speed *= elroy === 2 ? 1.12 : 1.06; }
        if (g.dash > 0) speed *= 1.5;
        g.speedCells = speed;
        wrapped = g.advance(this.maze, dt, (gg) => {
          const target = mode === "scatter" ? gg.corner : this.maze.nearestWalkable(chaseTarget(gg, ctx));
          return chooseToward(gg, ctx, target);
        });
      }
      if (wrapped) this.emit({ type: "wrap", who: g.kind });
    }
  }

  private updateDormant(g: GhostSim, dt: number): void {
    g.refreshWorld(this.maze);
    if (this.attemptTime < K.RESPAWN_GRACE) return;
    if (g.wakeTimer > 0) {
      g.wakeTimer -= dt;
      if (g.wakeTimer <= 0) this.wake(g, g.startled);
      return;
    }
    const k = g.kind;
    const timeRel = this.level.releaseTimes[k] / this.diff.releaseSpeed;
    const dotsRel = this.level.releaseDots[k] / this.diff.releaseSpeed;
    if (this.attemptTime >= timeRel || this.dotsEaten >= dotsRel) { this.wake(g, false); return; }
    // se asustan si te acercas con linea de vision
    const p = this.player;
    const d = Math.hypot(g.x - p.x, g.z - p.z);
    if (d < STARTLE_DIST && this.maze.rayClear(p.x, p.z, g.x, g.z)) {
      g.startled = true;
      g.wakeTimer = STARTLE_DELAY;
      this.emit({ type: "ghostStartle", ghost: g.kind });
    }
  }

  private checkCatch(): void {
    const p = this.player;
    for (const g of this.ghosts) {
      if (g.mode === "dormant" || g.mode === "eaten") continue;
      const d = Math.hypot(g.x - p.x, g.z - p.z);
      if (d > K.GHOST_CATCH_DIST) continue;
      if (g.mode === "frightened") {
        g.mode = "eaten";
        const pts = K.SCORE.ghostCombo[Math.min(this.combo, K.SCORE.ghostCombo.length - 1)];
        this.combo++;
        this.stats.ghostsEaten++;
        this.addScore(pts);
        this.emit({ type: "ghostEaten", ghost: g.kind, points: Math.round(pts * this.diff.scoreMult), combo: this.combo, x: g.x, z: g.z });
      } else if (g.lethal && p.invuln <= 0) {
        this.state = "caught";
        this.caughtBy = g;
        this.emit({ type: "caught", ghost: g.kind });
        return;
      }
    }
  }

  private checkDots(): void {
    const p = this.player;
    const { W } = this.maze;
    const [cx, cy] = this.maze.worldToCell(p.x, p.z);
    for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 1; x++) {
      if (x < 0 || x >= W || y < 0 || y >= this.maze.H) continue;
      const i = y * W + x;
      if (!this.dotGrid[i]) continue;
      const w = this.maze.cellToWorld(x, y);
      if (Math.hypot(w.x - p.x, w.z - p.z) > K.DOT_EAT_RANGE) continue;
      this.dotGrid[i] = 0;
      this.dotsEaten++;
      this.addScore(K.SCORE.dot);
      this.emit({ type: "dot", x: w.x, z: w.z, points: K.SCORE.dot });
      this.maybeSpawnFruit();
      if (this.dotsEaten >= this.totalDots && !this.exitUnlocked) {
        this.exitUnlocked = true;
        this.maze.exitUnlocked = true;
        this.emit({ type: "exitUnlocked" });
      }
    }
  }

  private checkPellets(): void {
    const p = this.player;
    for (const pl of this.pellets) {
      if (pl.eaten) continue;
      if (Math.hypot(pl.x - p.x, pl.z - p.z) > K.PELLET_EAT_RANGE) continue;
      pl.eaten = true;
      this.stats.pellets++;
      this.activatePower();
      this.addScore(K.SCORE.pellet);
      this.emit({ type: "pellet", x: pl.x, z: pl.z });
    }
  }

  /** Activa el poder: los fantasmas activos huyen y pueden ser comidos. */
  activatePower(): void {
    this.frightTotal = this.level.frightTime * this.diff.frightTime;
    this.frightTimer = this.frightTotal;
    this.combo = 0;
    for (const g of this.ghosts) {
      if (g.mode === "scatter" || g.mode === "chase" || g.mode === "frightened") {
        if (g.mode !== "frightened") g.reverseQueued = true;
        g.mode = "frightened";
        if (g.frozen) { g.frozen = false; this.emit({ type: "frozen", ghost: g.kind, frozen: false }); }
      }
    }
  }

  private maybeSpawnFruit(): void {
    const thresholds = [Math.floor(this.totalDots * 0.33), Math.floor(this.totalDots * 0.66)];
    if (this.fruit.spawned < 2 && this.dotsEaten >= thresholds[this.fruit.spawned]) {
      this.fruit.spawned++;
      const w = this.maze.cellToWorld(this.layout.fruit[0], this.layout.fruit[1]);
      this.fruit.active = true;
      this.fruit.x = w.x; this.fruit.z = w.z;
      this.fruit.timer = FRUIT_LIFETIME;
      this.emit({ type: "fruitSpawn", x: w.x, z: w.z });
    }
  }

  private updateFruit(dt: number): void {
    if (!this.fruit.active) return;
    this.fruit.timer -= dt;
    const p = this.player;
    if (Math.hypot(this.fruit.x - p.x, this.fruit.z - p.z) <= K.FRUIT_EAT_RANGE) {
      this.fruit.active = false;
      this.stats.fruitEaten++;
      const base = K.SCORE.fruitBase * (this.level.id + 1);
      this.addScore(base);
      p.stamina = K.STAMINA_MAX;
      p.battery = K.BATTERY_MAX;
      p.batteryLocked = false;
      this.emit({ type: "fruitEaten", points: Math.round(base * this.diff.scoreMult), x: this.fruit.x, z: this.fruit.z });
    } else if (this.fruit.timer <= 0) {
      this.fruit.active = false;
      this.emit({ type: "fruitExpire" });
    }
  }

  private checkExit(): void {
    if (!this.exitUnlocked) return;
    const w = this.maze.cellToWorld(this.maze.exit[0], this.maze.exit[1]);
    if (Math.hypot(w.x - this.player.x, w.z - this.player.z) < 0.75) {
      this.state = "complete";
      this.addScore(K.SCORE.levelClear);
      this.emit({ type: "levelComplete" });
    }
  }
}

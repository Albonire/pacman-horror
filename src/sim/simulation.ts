// Nucleo de la simulacion de UMBRAL. Logica pura: sin DOM, sin three.js, determinista con rng.
// El motor de render consume su estado y drena `events` en cada frame.

import * as K from "../config/constants";
import type { DifficultyDef } from "../config/difficulty";
import type { LevelDef } from "../config/campaign";
import { type AABB, depenetrate, moveAndSlide } from "./collision";
import type { SimEvent } from "./events";
import {
  GhostSim, chooseFlee, chooseToward,
  type AIContext, type GhostKind,
} from "./ghost";
import { blockedBySteam, chaseTarget, isAlerted, noticePlayer } from "./hunt";
import { generateLayout, type HideSpotKind, type LevelLayout } from "./layout";
import { DIRS, Maze, UNREACHABLE, type Cell } from "./maze";
import { PlayerSim, type PlayerInput } from "./player";
import { mulberry32, type Rng } from "./rng";
import { Trail } from "./trail";

export type SimState = "playing" | "caught" | "complete";

export interface SimInit {
  level: LevelDef;
  difficulty: DifficultyDef;
  layout?: LevelLayout;
  rng?: Rng;
  score?: number;
  lives?: number;
}

export interface HideSpotState { cell: Cell; wall: Cell; kind: HideSpotKind; x: number; z: number }
export interface SwitchState { cell: Cell; wall: Cell; zone: number; x: number; z: number }
export interface BatteryState { x: number; z: number; taken: boolean }
export interface SteamVentState {
  cell: Cell;
  wall: Cell;
  x: number;
  z: number;
  state: "idle" | "warning" | "erupting";
  timer: number;
  cooldown: number;
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
/** Radio (u) dentro del cual un fantasma en persecucion abandona la rejilla y se abalanza en linea recta. */
const LUNGE_CHASE = 2.5;
const LUNGE_SCATTER = 1.5;
const GHOST_BODY_R = 0.42;
export const BITE_COOLDOWN = 4.5;
export const BITE_STAMINA = 18;
const BITE_RANGE = 2.1;
const BATTERY_GAIN = 45;
const SWITCH_LIT = 14;
const HIDE_SEARCH_RANGE = 2.4;
/** Distancia (u) a la que un fantasma puede ver la puerta del armario. */
const HIDE_SIGHT = 3.4;
/** Gasto de aliento por segundo al contener la respiracion, y cuanto reduce la sospecha. */
const HOLD_DRAIN = 14;
const HOLD_FACTOR = 0.35;
/** Sospecha que se pierde por segundo cuando el fantasma no ve el armario, y salto al quedarse sin aliento. */
const HIDE_DECAY = 0.25;
const HIDE_GASP = 0.25;
/** Sospecha inicial de los fantasmas que lo vieron o lo oyeron entrar. */
const ENTER_SEEN = 0.7;
const ENTER_HEARD = 0.4;
/** Revision de armarios: radio (celdas) alrededor del ultimo avistamiento, tiempo mirando dentro y espera antes de repetir. */
const CHECK_RADIUS = 4;
const CHECK_LINGER = 2.0;
const CHECK_COOLDOWN = 25;
const HIDE_DEPTH = 0.95;
const BITE_STUN = 1.7;

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
  batteries: BatteryState[] = [];
  switches: SwitchState[] = [];
  hideSpots: HideSpotState[] = [];
  /** Valvulas de vapor dinamicas repartidas por los pasillos. */
  steamVents: SteamVentState[] = [];
  /** Exposicion actual al vapor hirviendo (0..1): nubla la vista y drena aliento/bateria. */
  steamExposure = 0;
  private steamHurtCd = 0;
  /** Segundos que le quedan de luz a cada zona oscura tras usar su interruptor. */
  zoneLit: number[] = [];
  /** Segundos restantes de parpadeo previo a un apagon general de zona. */
  zoneFlicker: number[] = [];
  /** Zonas en apagon general de sector (oscuridad expandida hasta reactivar su interruptor). */
  sectorOutage: boolean[] = [];
  private sectorOutageTimer: number[] = [];
  private blackoutTimer = 26;
  private shiftTimer = 20;
  private turnAcc = 0;
  private lastYaw = 0;
  shiftCount = 0;
  private envRng: Rng;
  /** Escondite en el que esta el jugador (o null). */
  hidden: HideSpotState | null = null;
  /** Algun fantasma vio al jugador entrar: lo seguira hasta el escondite. */
  hiddenSeen = false;
  /** Algun fantasma oyo al jugador correr hacia el escondite: ira a inspeccionarlo. */
  hiddenSuspected = false;
  private hideCd = 0;
  private prevLight = true;
  private searchT = new Map<GhostSim, number>();
  /** Sospecha (0..1) de cada fantasma sobre el armario donde esta el jugador. A 1 abre la puerta. */
  private suspicion = new Map<GhostSim, number>();
  /** Mayor sospecha actual (para el latido y el sonido). */
  hideThreat = 0;
  /** True mientras el jugador contiene la respiracion o mantiene el pulso dentro del escondite. */
  holdingBreath = false;
  /** Fantasmas que vieron directamente al jugador entrar en el escondite actual. */
  private witnesses = new Set<GhostSim>();
  /** Fantasmas que oyeron un jadeo de fallo a corta distancia frente al escondite. */
  private gaspExposed = new Set<GhostSim>();
  /** Estado del minijuego ritmico de latido del corazon al esconderse con un fantasma cerca. */
  heartMinigame = false;
  /** Fase actual del pulso cardiaco (0..1); la zona central de acierto esta en torno a 0.5. */
  heartPhase = 0;
  /** Semiancho de la ventana central de acierto (0.14..0.21 segun tipo de escondite). */
  heartWindow = 0.18;
  /** Tension cardiaca acumulada por fallar latidos (0..1); al llegar a 1 provoca un jadeo audible. */
  heartStress = 0;
  /** Retroalimentacion del ultimo pulso (-1 fallo, +1 acierto, decae hacia 0). */
  heartFeedback = 0;
  /** Segundos de calma ganados tras acertar un latido al ritmo. */
  private rhythmCalm = 0;
  private beatHandled = false;
  private prevSonarInput = false;
  private holdLock = false;
  private holdInput = false;
  fruit = { active: false, x: 0, z: 0, timer: 0, spawned: 0 };
  score: number;
  rawPoints = 0;
  lives: number;
  extraLifeGiven = false;
  stats = { deaths: 0, ghostsEaten: 0, fruitEaten: 0, pellets: 0 };

  time = 0;
  attemptTime = 0;
  /** Segundos hasta poder volver a morder. */
  biteCd = 0;
  exitUnlocked = false;

  // fases
  waveIndex = 0;
  waveMode: "scatter" | "chase" = "scatter";
  waveTimer = 0;
  frightTimer = 0;
  frightTotal = 0;
  combo = 0;

  private ctx: AIContext;

  constructor(init: SimInit) {
    this.level = init.level;
    this.diff = init.difficulty;
    this.layout = init.layout ?? generateLayout({
      W: init.level.W, H: init.level.H, seed: init.level.seed,
      loopChance: init.level.loopChance, braid: init.level.braid,
    });
    this.maze = new Maze(this.layout);
    this.rng = init.rng ?? mulberry32((init.level.seed ^ 0x9e3779b9) >>> 0);
    this.envRng = mulberry32((init.level.seed ^ 0x5f3759df) >>> 0);
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

    this.batteries = this.layout.batteries.map((c) => { const w = this.maze.cellToWorld(c[0], c[1]); return { x: w.x, z: w.z, taken: false }; });
    this.switches = this.layout.switches.map((sw) => { const w = this.maze.cellToWorld(sw.cell[0], sw.cell[1]); return { ...sw, x: w.x, z: w.z }; });
    const fallbackKinds: HideSpotKind[] = ["locker", "vent", "table"];
    this.hideSpots = this.layout.hideSpots.map((h, i) => {
      const w = this.maze.cellToWorld(h.cell[0], h.cell[1]);
      return { ...h, kind: h.kind ?? fallbackKinds[i % 3], x: w.x, z: w.z };
    });
    this.zoneLit = this.layout.zones.map(() => 0);
    this.zoneFlicker = this.layout.zones.map(() => 0);
    this.sectorOutage = this.layout.zones.map(() => false);
    this.sectorOutageTimer = this.layout.zones.map(() => 0);
    this.initSteamVents();

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
      time: 0,
      playerX: 0,
      playerZ: 0,
      playerView: [0, -1],
      playerRunning: false,
      trail: new Trail(),
      trailDelay: this.diff.stalkerDelay,
      memory: this.diff.memory,
      searchTime: this.diff.searchTime,
      viewCells: this.diff.viewCells,
      fovCos: Math.cos((this.diff.fovDeg * Math.PI) / 360),
      hearCells: this.diff.hearCells,
      tactics: this.diff.tactics,
    };

    this.respawnPlayer(true);
  }

  // ---------------- ciclo de vida ----------------

  /**
   * Celda segura para reaparecer: la mas cercana (por pasillos) al lugar de la muerte que este a 8 celdas o mas de
   * cualquier guarida de fantasma, fuera de las zonas oscuras y de la salida. Null si no hay ninguna.
   */
  safeRespawnCell(death: Cell): Cell | null {
    const m = this.maze;
    const field = m.distanceField([m.nearestWalkable(death)]);
    let best: Cell | null = null, bd = Infinity;
    for (let y = 0; y < m.H; y++) for (let x = 0; x < m.W; x++) {
      if (!m.isWalkable(x, y)) continue;
      const d = field[y * m.W + x];
      if (d >= bd || d > 16) continue;
      if (this.ghosts.some((g) => Math.hypot(g.spawn[0] - x, g.spawn[1] - y) < 8)) continue;
      if (Math.hypot(m.exit[0] - x, m.exit[1] - y) < 3) continue;
      const w = m.cellToWorld(x, y);
      if (this.darknessAt(w.x, w.z) > 0.3) continue;
      bd = d; best = [x, y];
    }
    return best;
  }

  /** Coloca al jugador y deja a los fantasmas dormidos en su guarida. */
  respawnPlayer(first = false): void {
    // la primera vez, la salida del nivel; despues, la celda segura mas cercana a donde moriste
    let [px, py] = this.layout.player;
    if (!first) {
      const safe = this.safeRespawnCell(this.maze.worldToCell(this.player.x, this.player.z));
      if (safe) [px, py] = safe;
    }
    const w = this.maze.cellToWorld(px, py);
    // mira hacia el pasillo abierto mas largo
    let bestDir: Cell = [0, -1], bestRun = -1;
    for (const d of DIRS) {
      let run = 0;
      while (run < 12 && this.maze.isWalkable(px + d[0] * (run + 1), py + d[1] * (run + 1))) run++;
      if (run > bestRun) { bestRun = run; bestDir = d; }
    }
    const keepBattery = this.player.battery;
    this.player.reset(w.x, w.z, Math.atan2(-bestDir[0], -bestDir[1]));
    if (!first) this.player.battery = Math.max(keepBattery, K.BATTERY_MAX * 0.6);
    this.ctx.trail.clear();
    this.ctx.trail.push(this.time, w.x, w.z);
    depenetrate(this.maze, this.colliders, this.player, K.PLAYER_RADIUS);
    this.player.invuln = first ? 0 : K.INVULN_TIME;
    this.state = "playing";
    this.caughtBy = null;
    this.hidden = null;
    this.hiddenSeen = false;
    this.hiddenSuspected = false;
    this.witnesses.clear();
    this.gaspExposed.clear();
    this.suspicion.clear();
    this.hideThreat = 0; this.holdingBreath = false; this.holdLock = false;
    this.heartMinigame = false; this.heartPhase = 0; this.heartStress = 0; this.heartFeedback = 0;
    this.rhythmCalm = 0; this.beatHandled = false; this.prevSonarInput = false;
    for (const gh of this.ghosts) { gh.checkSpot = -1; gh.checkT = 0; }
    this.searchT.clear();
    this.attemptTime = 0;
    this.frightTimer = 0;
    this.combo = 0;
    this.steamExposure = 0;
    this.steamHurtCd = 0;
    this.lastYaw = this.player.viewYaw;
    this.turnAcc = 0;
    this.blackoutTimer = 22 / this.envScale;
    this.shiftTimer = 18 / this.envScale;
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
    return frac <= 0.1 ? 2 : frac <= 0.2 ? 1 : 0;
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

    this.hideCd = Math.max(0, this.hideCd - dt);
    for (let i = 0; i < this.zoneLit.length; i++) this.zoneLit[i] = Math.max(0, this.zoneLit[i] - dt);
    if (input.interact) this.tryInteract();
    const sonarDown = !!input.sonar;
    const sonarPressed = sonarDown && !this.prevSonarInput;
    this.prevSonarInput = sonarDown;
    this.holdInput = !!this.hidden && sonarDown;
    const stam0 = this.player.stamina;
    const pin: PlayerInput = this.hidden ? { forward: 0, strafe: 0, sprint: false, sonar: false, lookBack: false } : input;

    const anyFrozen = this.ghosts.some((g) => g.frozen);
    this.player.update(dt, pin, this.maze, this.colliders, {
      staminaDrain: this.diff.staminaDrain,
      batteryDrain: this.diff.batteryDrain,
      stareDrain: anyFrozen,
    }, this.events);
    if (!this.hidden) this.ctx.trail.push(this.time, this.player.x, this.player.z);

    this.guardNumbers();
    this.biteCd = Math.max(0, this.biteCd - dt);
    if (input.bite && !this.hidden) this.tryBite();

    if (this.hidden) {
      this.updateBreath(dt, stam0, sonarPressed);
      const h = this.hidden;
      const depth = this.hideDepth(h.kind);
      this.player.x = h.x + h.wall[0] * depth; this.player.z = h.z + h.wall[1] * depth;
      this.player.vx = 0; this.player.vz = 0; this.player.noise = 0;
    }
    this.checkBatteries();

    this.updateSteamVents(dt);
    this.updateBlackouts(dt);
    this.updateWaves(dt);
    this.updateGhosts(dt);
    this.updateSuspicion(dt);
    this.checkCatch();
    if (this.state !== "playing") return;
    this.checkDots();
    this.checkPellets();
    this.updateFruit(dt);
    this.updateMazeShift(dt);
    this.checkExit();
  }

  /** Red de seguridad: si algun valor se vuelve NaN/infinito se restaura en vez de dejar la camara en el vacio. */
  private guardNumbers(): void {
    const p = this.player;
    if (!Number.isFinite(p.x) || !Number.isFinite(p.z) || !Number.isFinite(p.yaw) || !Number.isFinite(p.vx) || !Number.isFinite(p.vz)) {
      const yaw = Number.isFinite(p.yaw) ? p.yaw : 0;
      const [px, py] = this.layout.player;
      const w = this.maze.cellToWorld(px, py);
      p.reset(w.x, w.z, yaw);
      p.invuln = K.INVULN_TIME;
    }
    for (const g of this.ghosts) {
      if (!Number.isFinite(g.x) || !Number.isFinite(g.z) || !Number.isFinite(g.p)) g.resetToSpawn(this.maze, "dormant");
    }
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
    const [fx, fz] = p.viewVec();
    if ((fx * dx + fz * dz) / d < GAZE_COS) return false;
    return this.maze.rayClear(p.x, p.z, g.x, g.z);
  }

  private updateGhosts(dt: number): void {
    const p = this.player;
    const ctx = this.ctx;
    ctx.time = this.time;
    ctx.playerX = p.x;
    ctx.playerZ = p.z;
    ctx.playerCell = this.maze.worldToCell(p.x, p.z);
    ctx.playerHeading = p.heading;
    ctx.playerView = p.viewHeading;
    ctx.playerRunning = p.running;
    ctx.playerNoisy = !this.hidden && p.noise > 0.6;
    ctx.activeSteam = this.steamVents.filter((v) => v.state === "erupting").map((v) => ({ x: v.x, z: v.z }));
    const baseSpeed = K.GHOST_SPEED_BASE * this.level.ghostSpeed * this.diff.ghostSpeed;
    const elroy = this.elroyLevel();

    for (const g of this.ghosts) {
      g.awakeFor += dt;

      if (g.mode === "dormant") {
        this.updateDormant(g, dt);
        continue;
      }

      if (g.stun > 0) {
        g.stun = Math.max(0, g.stun - dt);
        g.refreshWorld(this.maze);
        continue;
      }

      // El Estatico: se congela mientras se le mira
      if (g.kind === 3 && (g.mode === "scatter" || g.mode === "chase")) {
        const gazed = this.isGazed(g);
        if (gazed !== g.frozen) {
          g.frozen = gazed;
          g.watched = 0;
          if (!gazed) g.dash = 1.0; // se lanza con fuerza al dejar de ser observado
          this.emit({ type: "frozen", ghost: g.kind, frozen: gazed });
        }
        if (g.frozen) g.watched += dt;
      } else if (g.frozen) {
        g.frozen = false;
        this.emit({ type: "frozen", ghost: g.kind, frozen: false });
      }
      if (g.dash > 0) g.dash -= dt;
      if (g.frozen) { g.refreshWorld(this.maze); continue; }

      g.updateStealth(dt, this.diff.silentChance);
      // percepcion y memoria (ver u oir al jugador)
      if (g.mode === "scatter" || g.mode === "chase") noticePlayer(g, ctx, dt);

      const inTunnel = g.cy === this.maze.tunnelRow && (g.cx <= 2 || g.cx >= this.maze.W - 3);
      const tunnel = inTunnel ? K.GHOST_TUNNEL_FACTOR : 1;
      let wrapped = false;

      if (g.mode === "eaten") {
        g.speedCells = K.GHOST_EATEN_SPEED;
        wrapped = g.advance(this.maze, dt, (gg) => chooseToward(gg, this.ctx, gg.spawn, 0));
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
        if (this.hidden && !this.hiddenSeen && !this.hiddenSuspected && mode === "chase") mode = "scatter"; // perdio el rastro
        // con memoria activa la dispersion se anula: el fantasma sigue cazando
        if (isAlerted(g) && mode === "scatter") mode = "chase";
        if (g.kind === 0 && elroy > 0) { mode = "chase"; speed *= elroy === 2 ? 1.08 : 1.04; }
        // el rastro del Acechador le da ventaja: solo a el, nunca a la velocidad global
        if (g.kind === 0 && mode === "chase") speed *= this.diff.stalkerSpeed;
        if (g.dash > 0) speed *= 1.65;

        // Si el jugador lleva la linterna encendida en un pasillo largo, los fantasmas en scatter lo detectan a mayor distancia
        if (!this.hidden && mode === "scatter" && this.player.lightOn && g.stun <= 0 && !g.frozen) {
          const distToPlayer = Math.hypot(g.x - this.player.x, g.z - this.player.z);
          if (distToPlayer < 14 && this.maze.rayClear(g.x, g.z, this.player.x, this.player.z, 0.4)) {
            mode = "chase";
          }
        }

        // Aceleracion depredadora cuando tienen linea de vision directa en persecucion
        if (!this.hidden && mode === "chase" && !g.frozen && g.stun <= 0) {
          const distToPlayer = Math.hypot(g.x - this.player.x, g.z - this.player.z);
          if (distToPlayer < 9 && this.maze.rayClear(g.x, g.z, this.player.x, this.player.z, 0.35)) {
            // El fantasma tiene contacto visual: aceleracion depredadora que escala con la dificultad
            // el impulso depredador crece con las tacticas de la dificultad: ninguno en Aprendiz, la mitad en Normal
            const surge = 1 + 0.12 * (1 - this.diff.mistake) * ((this.diff.tactics ?? 2) / 2);
            speed *= surge;
          }
        }
        // hacia donde mira un fantasma detenido (el avance recalcula `yaw` a partir del movimiento, asi que se fija despues)
        let gaze: { x: number; z: number } | null = null;
        if (this.hidden) {
          const distToHide = Math.hypot(g.x - this.hidden.x, g.z - this.hidden.z);
          const st = this.searchT.get(g) ?? 0;
          const shouldInspect =
            g.mode === "chase" ||
            this.witnesses.has(g) ||
            this.gaspExposed.has(g) ||
            this.hiddenSeen ||
            this.hiddenSuspected ||
            (g.checkSpot >= 0 && this.hideSpots[g.checkSpot] === this.hidden);
          if (shouldInspect && distToHide < HIDE_SEARCH_RANGE && st >= 0 && this.maze.rayClear(g.x, g.z, this.player.x, this.player.z, 0.4)) {
            // el fantasma se detiene frente al escondite para registrarlo (en patrulla scatter sin pistas pasa de largo)
            speed = 0;
            gaze = this.doorOf(this.hidden); // mira la puerta
          }
        }
        // revision de un escondite: se detiene junto a el mirando hacia dentro y luego sigue
        const chk = this.hideSpots[g.checkSpot];
        if (chk && Math.hypot(g.x - chk.x, g.z - chk.z) < 0.6) {
          speed = 0;
          gaze = this.doorOf(chk);
          g.checkT += dt;
          if (g.checkT >= CHECK_LINGER) {
            g.checkedAt[g.checkSpot] = this.time;
            g.checkSpot = -1;
            g.checkT = 0;
            if (this.hidden && !this.witnesses.has(g) && !this.gaspExposed.has(g)) {
              g.lastSeen = null;
              g.reverseQueued = true;
            }
          }
        } else if (g.checkSpot >= 0 && !chk) { g.checkSpot = -1; g.checkT = 0; }
        g.speedCells = speed;
        wrapped = g.advance(this.maze, dt, (gg) => {
          let target: Cell;
          if (this.hidden && (this.witnesses.has(gg) || this.gaspExposed.has(gg) || this.hiddenSeen || this.hiddenSuspected)) {
            // inspeccion activa del escondite donde vieron u oyeron entrar al jugador
            target = this.hidden.cell;
          } else if (mode === "scatter") {
            target = gg.corner;
          } else if (this.checkTarget(gg)) {
            target = this.checkTarget(gg)!;
          } else {
            target = this.maze.nearestWalkable(chaseTarget(gg, ctx));
          }
          return chooseToward(gg, ctx, target, gg.sawPlayer ? 0 : ctx.mistake);
        });
        if (gaze) g.yaw = Math.atan2(gaze.x - g.x, gaze.z - g.z);
      }
      if (wrapped) this.emit({ type: "wrap", who: g.kind });
      if (!this.hidden) this.lunge(g, dt);
    }
  }

  /**
   * La rejilla obliga a los fantasmas a ir por el centro de las celdas, asi que un jugador pegado a una
   * esquina quedaba a >0.82 u para siempre. A corta distancia y con linea de vision se abalanzan
   * libremente (con colision contra los muros) para cerrar esos ultimos metros.
   */
  private lunge(g: GhostSim, dt: number): void {
    const p = this.player;
    const gridX = g.x - g.offX, gridZ = g.z - g.offZ;
    const dx = p.x - g.x, dz = p.z - g.z;
    const d = Math.hypot(dx, dz);
    const hunting = (g.mode === "chase" || g.mode === "scatter") && !g.frozen && g.stun <= 0;
    const range = g.mode === "chase" ? LUNGE_CHASE : LUNGE_SCATTER;
    if (hunting && d > 0.01 && d < range && this.maze.rayClear(g.x, g.z, p.x, p.z, 0.3)) {
      const step = Math.min(d, g.speedCells * K.CELL * 1.0 * dt);
      const pos = { x: g.x, z: g.z };
      moveAndSlide(this.maze, this.colliders, pos, (dx / d) * step, (dz / d) * step, GHOST_BODY_R);
      g.offX = Math.max(-1.6, Math.min(1.6, pos.x - gridX));
      g.offZ = Math.max(-1.6, Math.min(1.6, pos.z - gridZ));
      g.x = gridX + g.offX; g.z = gridZ + g.offZ;
      g.yaw = Math.atan2(dx, dz);
    } else if (g.offX !== 0 || g.offZ !== 0) {
      const k = Math.exp(-dt * 5);
      g.offX *= k; g.offZ *= k;
      if (Math.abs(g.offX) < 0.01 && Math.abs(g.offZ) < 0.01) { g.offX = 0; g.offZ = 0; }
      g.x = gridX + g.offX; g.z = gridZ + g.offZ;
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
    if (this.hidden) return; // en el escondite solo cuenta la busqueda (updateSearch)
    const p = this.player;
    for (const g of this.ghosts) {
      if (g.mode === "dormant" || g.mode === "eaten") continue;
      const d = Math.hypot(g.x - p.x, g.z - p.z);
      if (d > K.GHOST_CATCH_DIST) continue;
      if (g.mode === "frightened") {
        this.eatGhost(g);
      } else if (g.lethal && p.invuln <= 0) {
        this.state = "caught";
        this.caughtBy = g;
        this.emit({ type: "caught", ghost: g.kind });
        return;
      }
    }
  }

  /** Fuerza de oscuridad (0..1) en un punto del mundo: 1 en el centro de una zona apagada. */
  darknessAt(x: number, z: number): number {
    let best = 0;
    const zones = this.layout.zones;
    for (let i = 0; i < zones.length; i++) {
      const w = this.maze.cellToWorld(zones[i].cell[0], zones[i].cell[1]);
      const d = Math.hypot(w.x - x, w.z - z) / K.CELL;
      const outage = this.sectorOutage[i] ? 1.85 : 1.0;
      const r = zones[i].r * outage;
      const t = Math.max(0, Math.min(1, (d - (r - 1.0)) / 1.9));
      let f = (1 - t * t * (3 - 2 * t)) * (1 - Math.max(0, Math.min(1, this.zoneLit[i] / 1.5)));
      if (this.zoneFlicker[i] > 0) {
        const fl = Math.sin(this.time * 38 + i * 2) > 0 ? 0.25 : 0.88;
        f = Math.max(f, (1 - t * t * (3 - 2 * t)) * fl);
      }
      if (f > best) best = f;
    }
    return best;
  }

  private tryInteract(): void {
    const p = this.player;
    if (this.hidden) { this.leaveHide(); return; }
    if (this.hideCd > 0) return;
    let spot: HideSpotState | null = null, sd = 1.9;
    for (const h of this.hideSpots) { const d = Math.hypot(h.x - p.x, h.z - p.z); if (d < sd) { sd = d; spot = h; } }
    if (spot) { this.enterHide(spot); return; }
    let sw: SwitchState | null = null, wd = 1.9;
    for (const s of this.switches) { const d = Math.hypot(s.x - p.x, s.z - p.z); if (d < wd) { wd = d; sw = s; } }
    if (sw && (this.zoneLit[sw.zone] <= 0 || this.sectorOutage[sw.zone] || this.zoneFlicker[sw.zone] > 0)) this.useSwitch(sw);
  }

  /** Altura de la camara dentro de cada tipo de escondite. */
  hideEyeHeight(kind: HideSpotKind): number {
    switch (kind) {
      case "vent": return 0.34;
      case "table": return 0.48;
      case "locker":
      default: return K.EYE_H;
    }
  }

  /** Limite de giro horizontal (radianes a cada lado) dentro de cada tipo de escondite. */
  hideYawLimit(kind: HideSpotKind): number {
    switch (kind) {
      case "table": return 1.36; // vision panoramica bajo la mesa
      case "vent": return 0.82;  // rejilla horizontal baja
      case "locker":
      default: return 0.62;      // rendijas estrechas del armario
    }
  }

  /** Profundidad hacia el muro a la que se coloca el jugador dentro del escondite. */
  hideDepth(kind: HideSpotKind): number {
    switch (kind) {
      case "vent": return 0.98;
      case "table": return 0.82;
      case "locker":
      default: return HIDE_DEPTH;
    }
  }

  /** Semiancho de la ventana central del minijuego cardiaco segun el escondite. */
  hideHeartWindow(kind: HideSpotKind): number {
    switch (kind) {
      case "locker": return 0.20;
      case "table": return 0.17;
      case "vent": return 0.15;
    }
  }

  /** Multiplicador de visibilidad/sospecha segun la cobertura del escondite. */
  private hideCoverFactor(kind: HideSpotKind): number {
    switch (kind) {
      case "vent": return 0.78;  // el conducto bajo es el mas discreto
      case "locker": return 1.0;
      case "table": return 1.12; // bajo la mesa tienes mejor vista pero menos cobertura
    }
  }

  /** Lo que el jugador puede hacer ahora con E (para la pista de la interfaz). */
  get interactHint(): "hide" | "switch" | "leave" | null {
    if (this.hidden) return "leave";
    const p = this.player;
    if (this.hideCd <= 0) for (const h of this.hideSpots) if (Math.hypot(h.x - p.x, h.z - p.z) < 1.9) return "hide";
    for (const s of this.switches) {
      if ((this.zoneLit[s.zone] <= 0 || this.sectorOutage[s.zone] || this.zoneFlicker[s.zone] > 0) && Math.hypot(s.x - p.x, s.z - p.z) < 1.9) return "switch";
    }
    return null;
  }

  /** Tipo de escondite con el que se puede interactuar ahora mismo (o en el que se esta dentro). */
  get interactHideKind(): HideSpotKind | null {
    if (this.hidden) return this.hidden.kind;
    if (this.hideCd > 0) return null;
    const p = this.player;
    let spot: HideSpotState | null = null, sd = 1.9;
    for (const h of this.hideSpots) {
      const d = Math.hypot(h.x - p.x, h.z - p.z);
      if (d < sd) { sd = d; spot = h; }
    }
    return spot ? spot.kind : null;
  }

  private enterHide(h: HideSpotState): void {
    const p = this.player;
    this.hidden = h;
    this.hideCd = h.kind === "vent" ? 0.35 : 0.6;
    const activeSteam = this.steamVents.filter((v) => v.state === "erupting");
    const canGhostSeeEntry = (g: GhostSim): boolean => {
      if (!g.lethal) return false;
      const dd = Math.hypot(g.x - p.x, g.z - p.z);
      if (dd >= 10) return false;
      if (!this.maze.rayClear(p.x, p.z, g.x, g.z, 0.4)) return false;
      if (blockedBySteam(p.x, p.z, g.x, g.z, activeSteam)) return false;
      return true;
    };
    this.witnesses.clear();
    this.gaspExposed.clear();
    for (const g of this.ghosts) {
      if (canGhostSeeEntry(g)) this.witnesses.add(g);
    }
    const seen = this.witnesses.size > 0;
    const hearRange = h.kind === "vent" ? 9.5 : 12;
    const heard = !seen && (p.running || p.exhausted) && this.ghosts.some((g) => g.lethal && Math.hypot(g.x - p.x, g.z - p.z) < hearRange);
    this.hiddenSeen = seen;
    this.hiddenSuspected = heard;
    this.suspicion.clear();
    this.holdLock = false;
    this.heartMinigame = false;
    this.heartPhase = 0;
    this.heartWindow = this.hideHeartWindow(h.kind);
    this.heartStress = 0;
    this.heartFeedback = 0;
    this.rhythmCalm = 0;
    this.beatHandled = false;
    for (const g of this.ghosts) {
      if (!g.lethal) continue;
      const dd = Math.hypot(g.x - p.x, g.z - p.z);
      if (this.witnesses.has(g)) this.suspicion.set(g, ENTER_SEEN);
      else if ((p.running || p.exhausted) && dd < hearRange) this.suspicion.set(g, ENTER_HEARD);
    }
    // si nadie te vio ni te oyo entrar, pierden el rastro
    if (!seen && !heard) {
      for (const g of this.ghosts) { g.lastSeen = null; g.lostT = 0; g.sawPlayer = false; }
      this.ctx.trail.clear();
    }
    this.prevLight = p.flashlightOn;
    p.flashlightOn = false;
    p.sonarOpen = false; p.running = false;
    const depth = this.hideDepth(h.kind);
    p.x = h.x + h.wall[0] * depth; p.z = h.z + h.wall[1] * depth;
    p.yaw = Math.atan2(h.wall[0], h.wall[1]); // mira hacia fuera del hueco
    this.searchT.clear();
    this.emit({ type: "hide", inside: true, seen: this.hiddenSeen, kind: h.kind });
  }

  private leaveHide(): void {
    const p = this.player, h = this.hidden;
    if (!h) return;
    const kind = h.kind;
    this.hidden = null;
    this.hiddenSeen = false;
    this.hiddenSuspected = false;
    this.witnesses.clear();
    this.gaspExposed.clear();
    this.suspicion.clear();
    this.hideThreat = 0;
    this.holdingBreath = false;
    this.heartMinigame = false;
    this.heartPhase = 0;
    this.heartStress = 0;
    this.heartFeedback = 0;
    this.rhythmCalm = 0;
    this.beatHandled = false;
    this.hideCd = kind === "vent" ? 0.35 : 0.6;
    p.x = h.x; p.z = h.z;
    if (this.prevLight && p.battery > 0 && !p.batteryLocked) p.flashlightOn = true;
    this.emit({ type: "hide", inside: false, seen: false, kind });
  }

  private get switchAlertCells(): number {
    switch (this.diff.id) {
      case "easy": return 9;
      case "normal": return 11;
      case "nightmare":
      case "oneLife":
      default:
        return 14;
    }
  }

  private useSwitch(sw: SwitchState): void {
    this.zoneLit[sw.zone] = SWITCH_LIT;
    this.zoneFlicker[sw.zone] = 0;
    this.sectorOutage[sw.zone] = false;
    this.sectorOutageTimer[sw.zone] = 0;
    // el chasquido del interruptor se oye por el sector segun la dificultad
    const f = this.maze.distanceField([sw.cell]);
    let alerted = 0;
    const alertDist = this.switchAlertCells;
    for (const g of this.ghosts) {
      if (f[g.cy * this.maze.W + g.cx] > alertDist) continue;
      if (g.mode === "dormant") { if (g.wakeTimer <= 0) { g.startled = true; g.wakeTimer = 1.2; alerted++; } }
      else if (g.mode === "scatter") { g.mode = "chase"; g.reverseQueued = true; alerted++; }
    }
    this.emit({ type: "switch", zone: sw.zone, alerted });
  }

  private checkBatteries(): void {
    const p = this.player;
    for (const b of this.batteries) {
      if (b.taken || Math.hypot(b.x - p.x, b.z - p.z) > 0.95) continue;
      b.taken = true;
      p.battery = Math.min(K.BATTERY_MAX, p.battery + BATTERY_GAIN);
      p.batteryLocked = false;
      this.emit({ type: "battery", x: b.x, z: b.z });
    }
  }

  /** Puerta del armario en el mundo: es lo que ven los fantasmas. */
  private doorOf(h: HideSpotState): { x: number; z: number } {
    return { x: h.x + h.wall[0] * 0.56, z: h.z + h.wall[1] * 0.56 };
  }

  /** Sospecha por segundo con el fantasma a distancia ideal y viendo la puerta, segun la dificultad. */
  private get suspicionBase(): number {
    switch (this.diff.id) {
      case "easy": return 0.35;
      case "normal": return 0.5;
      default: return 0.65;
    }
  }

  /** Segundos que un fantasma se queda mirando el armario antes de rendirse. */
  private get lingerTime(): number {
    switch (this.diff.id) {
      case "easy": return 2.5;
      case "normal": return 3.5;
      default: return 4.5;
    }
  }

  /**
   * Dispara un jadeo audible dentro del escondite: alerta a los fantasmas en un radio de 8 celdas y,
   * si alguno esta a corta distancia (< 2.1 u) con linea de vision a la puerta, descubre al jugador.
   */
  private triggerHideGasp(rhythmFail: boolean): void {
    const h = this.hidden;
    if (!h) return;
    this.emit({ type: "gasp" });
    const p = this.player;
    const pc = this.maze.worldToCell(p.x, p.z);
    for (const g of this.ghosts) {
      if (g.lethal && Math.hypot(g.cx - pc[0], g.cy - pc[1]) < 8) {
        g.lastSeen = [pc[0], pc[1]];
        g.lostT = 0;
        this.hiddenSuspected = true;
      }
    }
    const d0 = this.doorOf(h);
    for (const g of this.ghosts) {
      if (!g.lethal) continue;
      const dist = Math.hypot(g.x - d0.x, g.z - d0.z);
      if (dist < HIDE_SIGHT * 1.3) {
        const nextS = Math.min(1.2, (this.suspicion.get(g) ?? 0) + (rhythmFail ? 0.55 : HIDE_GASP));
        this.suspicion.set(g, nextS);
        if (rhythmFail && dist < 2.1 && this.maze.rayClear(g.x, g.z, d0.x, d0.z, 0.4)) {
          this.gaspExposed.add(g);
          this.suspicion.set(g, 1.05);
        }
      }
    }
  }

  /**
   * Minijuego ritmico del corazon y contencion del aliento dentro del escondite:
   * - Cuando un fantasma peligroso ronda cerca (< 5.2 u), aparece el pulso cardiaco (`heartMinigame = true`).
   * - Pulsar `Espacio` al ritmo cuando el latido cruza el centro (`0.5 ± heartWindow`) calma el pulso (`rhythmCalm`),
   *   reduce `heartStress` sin agotar toda la resistencia y frena la sospecha.
   * - Mantener `Espacio` de forma continua tambien contiene el aliento (gasta resistencia a cambio de calma), pero si
   *   se agota provoca un jadeo.
   * - Si un fantasma mira la puerta de cerca y el jugador falla los latidos hasta que `heartStress >= 1`, suelta un
   *   jadeo (`gasp`) que delata su posicion.
   */
  private updateBreath(dt: number, stam0: number, sonarPressed: boolean): void {
    const p = this.player;
    const h = this.hidden!;
    this.heartWindow = this.hideHeartWindow(h.kind);
    this.rhythmCalm = Math.max(0, this.rhythmCalm - dt);
    if (this.heartFeedback > 0) this.heartFeedback = Math.max(0, this.heartFeedback - dt * 2.2);
    else if (this.heartFeedback < 0) this.heartFeedback = Math.min(0, this.heartFeedback + dt * 2.2);

    const door = this.doorOf(h);
    let minGhostDist = Infinity;
    let closeWatcher = false;
    for (const g of this.ghosts) {
      if (!g.lethal) continue;
      const d = Math.hypot(g.x - door.x, g.z - door.z);
      if (d < minGhostDist) minGhostDist = d;
      if (d < 2.15 && this.maze.rayClear(g.x, g.z, door.x, door.z, 0.4)) {
        const dirx = (door.x - g.x) / (d || 1), dirz = (door.z - g.z) / (d || 1);
        const facing = Math.sin(g.yaw) * dirx + Math.cos(g.yaw) * dirz;
        if (d < 1.4 || facing > 0.34) closeWatcher = true;
      }
    }

    this.heartMinigame = minGhostDist < 5.2;

    if (this.holdLock && p.stamina >= 30) this.holdLock = false;

    // Deteccion de pulsacion ritmica de Espacio en el minijuego cardiaco
    if (this.heartMinigame && sonarPressed && !this.holdLock) {
      const distFromCenter = Math.abs(this.heartPhase - 0.5);
      if (distFromCenter <= this.heartWindow) {
        this.beatHandled = true;
        this.rhythmCalm = 1.15;
        this.heartStress = Math.max(0, this.heartStress - 0.35);
        this.heartFeedback = 1;
        this.emit({ type: "heartBeat", result: "hit" });
      } else {
        this.beatHandled = true;
        this.heartStress = Math.min(1, this.heartStress + 0.28);
        this.heartFeedback = -1;
        this.emit({ type: "heartBeat", result: "miss" });
      }
    }

    // Si mantiene Espacio pulsado continuamente (fuera del toque corto ritmico), contiene el aliento clasico
    const wantHold = this.holdInput && !this.holdLock && stam0 > 0 && !sonarPressed;
    if (wantHold) {
      const drain = this.rhythmCalm > 0 ? HOLD_DRAIN * 0.25 : HOLD_DRAIN;
      p.stamina = Math.max(0, stam0 - drain * dt);
      if (p.stamina <= 0) {
        this.holdLock = true;
        this.triggerHideGasp(closeWatcher);
      }
    }

    this.holdingBreath = (wantHold && p.stamina > 0) || this.rhythmCalm > 0;

    if (this.heartMinigame) {
      const bpm = 1.1 + 0.55 * Math.max(this.hideThreat, Math.max(0, 1 - minGhostDist / 5.2));
      const prevPhase = this.heartPhase;
      this.heartPhase = (this.heartPhase + bpm * dt) % 1;
      if (this.heartPhase < prevPhase) {
        // Fin de ciclo del latido: si un fantasma mira de cerca y ni acertaste el pulso ni contenias el aliento, sube el estres
        if (!this.beatHandled && !this.holdingBreath && closeWatcher) {
          this.heartStress = Math.min(1, this.heartStress + 0.22);
        }
        this.beatHandled = false;
      }
      if (closeWatcher && !this.holdingBreath) {
        this.heartStress = Math.min(1, this.heartStress + 0.10 * dt);
      } else {
        this.heartStress = Math.max(0, this.heartStress - (this.holdingBreath ? 0.38 : 0.22) * dt);
      }
      if (this.heartStress >= 1) {
        this.heartStress = 0;
        this.rhythmCalm = 0;
        this.triggerHideGasp(true);
      }
    } else {
      this.heartPhase = 0;
      this.heartStress = Math.max(0, this.heartStress - 0.4 * dt);
      this.beatHandled = false;
    }
  }

  /**
   * Cada fantasma peligroso acumula sospecha sobre el escondite mientras ve su entrada de cerca.
   * Regla justa: un fantasma SOLO puede abrir el escondite y atraparte (`s >= 1`) si:
   *  1. Te vio entrar directamente (`this.witnesses.has(g)`), o
   *  2. Fallaste el ritmo / aliento y soltaste un jadeo audible cerca de el (`this.gaspExposed.has(g)`).
   * Si no te vio entrar y mantienes la calma sin jadear, la sospecha nunca llega a 1 (se detiene en <= 0.88)
   * y tras inspeccionar unos segundos el fantasma se marcha.
   */
  private updateSuspicion(dt: number): void {
    const h = this.hidden;
    if (!h) { this.hideThreat = 0; this.holdingBreath = false; return; }
    const door = this.doorOf(h);
    const dark = this.darknessAt(door.x, door.z);
    const vis = (1 - 0.45 * dark) * this.hideCoverFactor(h.kind);
    let threat = 0;
    for (const g of this.ghosts) {
      if (!g.lethal) { this.suspicion.delete(g); this.searchT.delete(g); continue; }
      let s = this.suspicion.get(g) ?? 0;
      const d = Math.hypot(g.x - door.x, g.z - door.z);
      const los = d < HIDE_SIGHT && this.maze.rayClear(g.x, g.z, door.x, door.z, 0.4);
      const dirx = (door.x - g.x) / (d || 1), dirz = (door.z - g.z) / (d || 1);
      const facing = Math.sin(g.yaw) * dirx + Math.cos(g.yaw) * dirz;
      const sees = los && (d < 1.4 || facing > 0.34);
      const canCatch = this.witnesses.has(g) || this.gaspExposed.has(g);
      let t = this.searchT.get(g) ?? 0;
      if (t < 0) t = Math.min(0, t + dt); // enfriamiento tras rendirse
      if (sees && t >= 0) {
        const prox = Math.max(0, Math.min(1, (HIDE_SIGHT - d) / (HIDE_SIGHT - 1.0)));
        const checking = g.checkSpot >= 0 && this.hideSpots[g.checkSpot] === h ? 3 : 1;
        s += this.suspicionBase * prox * vis * checking * (this.holdingBreath ? HOLD_FACTOR : 1) * dt;
        if (!canCatch) {
          s = Math.min(0.88, s);
        }
        t += dt;
        if (t >= (checking > 1 ? CHECK_LINGER + 0.5 : this.lingerTime)) {
          // no se convence: se marcha y no vuelve a mirar durante un rato
          t = -6;
          g.reverseQueued = true;
          if (!canCatch) g.lastSeen = null;
        }
      } else if (!sees) {
        s = Math.max(0, s - HIDE_DECAY * dt);
        if (t > 0) t = Math.max(0, t - dt);
      }
      this.searchT.set(g, t);
      s = Math.min(1.2, s);
      if (!canCatch) s = Math.min(0.88, s);
      this.suspicion.set(g, s);
      threat = Math.max(threat, Math.min(1, s));
      if (s >= 1 && canCatch) {
        this.state = "caught";
        this.caughtBy = g;
        this.emit({ type: "caught", ghost: g.kind });
        return;
      }
    }
    this.hideThreat = threat;
  }

  /**
   * Armario que debe revisar este fantasma: si perdio al jugador hace poco cerca de uno o dos armarios, va a mirarlos
   * (el mas cercano a donde lo vio por ultima vez primero). Cada armario se revisa como mucho cada 25 s por fantasma.
   */
  private checkTarget(g: GhostSim): Cell | null {
    if ((this.diff.tactics ?? 2) < 1 || !this.hideSpots.length) return null;
    if (g.checkSpot >= 0) return this.hideSpots[g.checkSpot]?.cell ?? null;
    const seen = g.lastSeen;
    if (!seen || g.sawPlayer || g.lostT <= 0.4) return null;
    if (g.checkedAt.length !== this.hideSpots.length) g.checkedAt = this.hideSpots.map(() => -1e9);
    let best = -1, bd = CHECK_RADIUS;
    this.hideSpots.forEach((h, i) => {
      if (this.time - g.checkedAt[i] < CHECK_COOLDOWN) return;
      const d = Math.hypot(h.cell[0] - seen[0], h.cell[1] - seen[1]);
      if (d < bd) { bd = d; best = i; }
    });
    if (best < 0) return null;
    g.checkSpot = best; g.checkT = 0;
    this.emit({ type: "hideCheck", ghost: g.kind });
    return this.hideSpots[best].cell;
  }

  private eatGhost(g: GhostSim): void {
    g.mode = "eaten";
    const pts = K.SCORE.ghostCombo[Math.min(this.combo, K.SCORE.ghostCombo.length - 1)];
    this.combo++;
    this.stats.ghostsEaten++;
    this.addScore(pts);
    this.emit({ type: "ghostEaten", ghost: g.kind, points: Math.round(pts * this.diff.scoreMult), combo: this.combo, x: g.x, z: g.z });
  }

  /**
   * Mordisco: con resistencia suficiente alcanza ~2 u por delante. Aturde unos segundos a los fantasmas
   * peligrosos (no matan ni se mueven) y se come a los asustados aunque no se toquen.
   */
  private tryBite(): void {
    const p = this.player;
    if (this.biteCd > 0 || p.exhausted || p.stamina < BITE_STAMINA) return;
    p.stamina -= BITE_STAMINA;
    this.biteCd = BITE_COOLDOWN;
    const [fx, fz] = p.forwardVec();
    let stunned = 0, eaten = 0;
    for (const g of this.ghosts) {
      if (g.mode === "dormant" || g.mode === "eaten") continue;
      const dx = g.x - p.x, dz = g.z - p.z, d = Math.hypot(dx, dz);
      if (d > BITE_RANGE || d < 0.01) continue;
      if ((fx * dx + fz * dz) / d < 0.35) continue;
      if (!this.maze.rayClear(p.x, p.z, g.x, g.z, 0.3)) continue;
      if (g.mode === "frightened") { this.eatGhost(g); eaten++; }
      else if (g.mode === "scatter" || g.mode === "chase") { g.stun = BITE_STUN; stunned++; }
    }
    this.emit({ type: "bite", stunned, eaten });
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

  // ---------------- eventos ambientales dinamicos ----------------

  /** Multiplicador de frecuencia e intensidad de eventos ambientales segun dificultad. */
  get envScale(): number {
    switch (this.diff.id) {
      case "easy": return 0.5;
      case "normal": return 1.0;
      case "nightmare": return 1.35;
      case "oneLife": return 1.55;
    }
  }

  private initSteamVents(): void {
    const { W, H } = this.maze;
    const candidates: { cell: Cell; wall: Cell }[] = [];
    for (let y = 1; y < H - 1; y++) {
      if (y === this.maze.tunnelRow) continue;
      for (let x = 1; x < W - 1; x++) {
        if (this.maze.ch(x, y) !== ".") continue;
        if (Math.hypot(x - this.layout.player[0], y - this.layout.player[1]) < 4) continue;
        if (Math.hypot(x - this.maze.exit[0], y - this.maze.exit[1]) < 4) continue;
        if (Math.hypot(x - this.layout.fruit[0], y - this.layout.fruit[1]) < 2) continue;
        if (this.layout.pellets.some((p) => Math.hypot(p[0] - x, p[1] - y) < 2)) continue;
        if (this.layout.batteries.some((b) => Math.hypot(b[0] - x, b[1] - y) < 2)) continue;
        if (this.switches.some((s) => Math.hypot(s.cell[0] - x, s.cell[1] - y) < 2.5)) continue;
        if (this.hideSpots.some((h) => Math.hypot(h.cell[0] - x, h.cell[1] - y) < 2.5)) continue;
        const walls: Cell[] = [];
        for (const [dx, dy] of DIRS) {
          if (this.maze.ch(x + dx, y + dy) === "#") walls.push([dx, dy]);
        }
        if (walls.length > 0 && this.maze.degree(x, y) >= 2) {
          candidates.push({ cell: [x, y], wall: walls[Math.floor(this.envRng() * walls.length)] });
        }
      }
    }
    const targetCount = Math.min(6, Math.max(4, Math.floor((W * H) / 70)));
    this.steamVents = [];
    while (this.steamVents.length < targetCount && candidates.length > 0) {
      const idx = Math.floor(this.envRng() * candidates.length);
      const c = candidates.splice(idx, 1)[0];
      if (this.steamVents.some((v) => Math.hypot(v.cell[0] - c.cell[0], v.cell[1] - c.cell[1]) < 4.5)) continue;
      const w = this.maze.cellToWorld(c.cell[0], c.cell[1]);
      const cd = (14 + this.envRng() * 9) / this.envScale;
      this.steamVents.push({
        cell: c.cell,
        wall: c.wall,
        x: w.x,
        z: w.z,
        state: "idle",
        timer: (6 + this.steamVents.length * 3.5 + this.envRng() * 4.0) / this.envScale,
        cooldown: cd,
      });
    }
  }

  private updateSteamVents(dt: number): void {
    const p = this.player;
    let inSteam = false;
    for (let i = 0; i < this.steamVents.length; i++) {
      const v = this.steamVents[i];
      v.timer -= dt;
      if (v.state === "idle" && v.timer <= 0) {
        v.state = "warning";
        v.timer = 1.35;
        this.emit({ type: "steamWarning", index: i, x: v.x, z: v.z });
      } else if (v.state === "warning" && v.timer <= 0) {
        v.state = "erupting";
        v.timer = 3.4 + 0.8 * this.envScale;
        this.emit({ type: "steamErupt", index: i, x: v.x, z: v.z });
      } else if (v.state === "erupting" && v.timer <= 0) {
        v.state = "idle";
        v.timer = (14 + this.envRng() * 9) / this.envScale;
      }
      if (v.state === "erupting" && !this.hidden) {
        const d = Math.hypot(v.x - p.x, v.z - p.z);
        if (d < 1.35) inSteam = true;
      }
    }

    if (inSteam && !this.hidden) {
      this.steamExposure = Math.min(1, this.steamExposure + dt * 1.65);
      p.steamSlow = this.steamExposure >= 0.22;
      const prevStam = p.stamina;
      p.stamina = Math.max(0, p.stamina - 18 * this.diff.staminaDrain * dt);
      if (p.battery > 0) p.battery = Math.max(0, p.battery - 5.5 * this.diff.batteryDrain * dt);
      if (this.steamExposure > 0.45) p.noise = Math.max(p.noise, 0.72);
      this.steamHurtCd -= dt;
      if (this.steamHurtCd <= 0) {
        this.steamHurtCd = 1.05;
        this.emit({ type: "steamHurt", x: p.x, z: p.z });
      }
      if (prevStam > 0 && p.stamina <= 0 && !p.exhausted) {
        p.exhausted = true;
        p.running = false;
        this.emit({ type: "exhausted" });
        this.emit({ type: "gasp" });
        const pc = this.maze.worldToCell(p.x, p.z);
        for (const g of this.ghosts) {
          if (g.lethal && Math.hypot(g.cx - pc[0], g.cy - pc[1]) < 8) {
            g.lastSeen = [pc[0], pc[1]];
            g.lostT = 0;
          }
        }
      }
    } else {
      p.steamSlow = false;
      this.steamExposure = Math.max(0, this.steamExposure - dt * 0.85);
      this.steamHurtCd = Math.max(0, this.steamHurtCd - dt);
    }
  }

  /** Fuerza una fuga de vapor (para pruebas o eventos dirigidos). */
  triggerSteamLeak(index?: number, immediate = false): SteamVentState | null {
    if (!this.steamVents.length) return null;
    let idx = index ?? -1;
    if (idx < 0 || idx >= this.steamVents.length) {
      let bd = Infinity;
      this.steamVents.forEach((v, i) => {
        const d = Math.hypot(v.x - this.player.x, v.z - this.player.z);
        if (d < bd) { bd = d; idx = i; }
      });
    }
    const v = this.steamVents[idx];
    if (immediate) {
      v.state = "erupting";
      v.timer = 4.2 + 0.8 * this.envScale;
      this.emit({ type: "steamErupt", index: idx, x: v.x, z: v.z });
    } else {
      v.state = "warning";
      v.timer = 1.35;
      this.emit({ type: "steamWarning", index: idx, x: v.x, z: v.z });
    }
    return v;
  }

  private updateBlackouts(dt: number): void {
    if (!this.layout.zones.length) return;
    for (let i = 0; i < this.zoneFlicker.length; i++) {
      if (this.sectorOutageTimer[i] > 0) {
        this.sectorOutageTimer[i] = Math.max(0, this.sectorOutageTimer[i] - dt);
        if (this.sectorOutageTimer[i] <= 0) this.sectorOutage[i] = false;
      }
      if (this.zoneFlicker[i] > 0) {
        this.zoneFlicker[i] = Math.max(0, this.zoneFlicker[i] - dt);
        if (this.zoneFlicker[i] <= 0) {
          this.zoneLit[i] = 0;
          this.sectorOutage[i] = true;
          this.sectorOutageTimer[i] = 18 + 6 * this.envScale;
          const sw = this.switches.find((s) => s.zone === i);
          const zw = sw ? { x: sw.x, z: sw.z } : this.maze.cellToWorld(this.layout.zones[i].cell[0], this.layout.zones[i].cell[1]);
          this.emit({ type: "zoneBlackout", zone: i, x: zw.x, z: zw.z });
        }
      }
    }

    this.blackoutTimer -= dt;
    if (this.blackoutTimer <= 0) {
      this.blackoutTimer = (30 + this.envRng() * 14) / this.envScale;
      this.triggerZoneBlackout();
    }
  }

  /** Inicia un apagon general en la zona indicada (o en la mas relevante para el jugador). */
  triggerZoneBlackout(zoneIndex?: number, immediate = false): number {
    if (!this.layout.zones.length) return -1;
    let z = zoneIndex ?? -1;
    if (z < 0 || z >= this.layout.zones.length) {
      // prioriza una zona encendida, o la zona mas cercana al jugador que no este ya en apagon de sector
      let bestScore = Infinity;
      for (let i = 0; i < this.layout.zones.length; i++) {
        const zw = this.maze.cellToWorld(this.layout.zones[i].cell[0], this.layout.zones[i].cell[1]);
        const d = Math.hypot(zw.x - this.player.x, zw.z - this.player.z);
        const score = d - (this.zoneLit[i] > 1 ? 40 : 0) + (this.sectorOutage[i] ? 30 : 0);
        if (score < bestScore) { bestScore = score; z = i; }
      }
    }
    if (z < 0) return -1;
    const sw = this.switches.find((s) => s.zone === z);
    const zw = sw ? { x: sw.x, z: sw.z } : this.maze.cellToWorld(this.layout.zones[z].cell[0], this.layout.zones[z].cell[1]);
    if (immediate) {
      this.zoneFlicker[z] = 0;
      this.zoneLit[z] = 0;
      this.sectorOutage[z] = true;
      this.sectorOutageTimer[z] = 18 + 6 * this.envScale;
      this.emit({ type: "zoneBlackout", zone: z, x: zw.x, z: zw.z });
    } else {
      this.zoneFlicker[z] = 1.8;
      this.emit({ type: "zoneFlicker", zone: z, x: zw.x, z: zw.z });
    }
    return z;
  }

  private updateMazeShift(dt: number): void {
    let dyaw = this.player.viewYaw - this.lastYaw;
    dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
    this.lastYaw = this.player.viewYaw;
    if (Math.abs(dyaw) < 0.9) {
      this.turnAcc = Math.min(Math.PI * 2, this.turnAcc * Math.exp(-dt * 0.45) + Math.abs(dyaw));
    }
    this.shiftTimer = Math.max(0, this.shiftTimer - dt);

    if (!this.hidden && this.ghosts.length > 0 && this.shiftTimer <= 0 && this.turnAcc >= 2.45) {
      if (this.tryMazeShift(false)) {
        this.turnAcc = 0;
        this.shiftTimer = (26 + this.envRng() * 14) / this.envScale;
      } else {
        this.shiftTimer = 3.5;
      }
    }
  }

  /**
   * Geometria no euclidiana: intercambia un pasillo y un muro detras del jugador cuando gira 180 grados,
   * garantizando que el laberinto siga 100 % conexo y todos los nodos sean alcanzables.
   */
  tryMazeShift(ignoreViewCone = false): { closed: Cell; opened: Cell } | null {
    const { W, H } = this.maze;
    const [px, py] = this.maze.worldToCell(this.player.x, this.player.z);
    const [vx, vz] = this.player.viewVec();

    const protectedWalk = new Set<number>();
    const protectedWall = new Set<number>();
    const markWalk = (x: number, y: number) => { if (this.maze.inBounds(x, y)) protectedWalk.add(y * W + x); };
    const markWall = (x: number, y: number) => { if (this.maze.inBounds(x, y)) protectedWall.add(y * W + x); };

    // Protege spawn del jugador, salida y su pasillo inmediato
    markWalk(px, py);
    markWalk(this.layout.player[0], this.layout.player[1]);
    markWalk(this.maze.exit[0], this.maze.exit[1]);
    for (const [dx, dy] of DIRS) {
      markWalk(this.maze.exit[0] + dx, this.maze.exit[1] + dy);
      markWall(this.maze.exit[0] + dx, this.maze.exit[1] + dy);
    }

    // Protege celdas con objetos interactivos, pellets, pilas, fruta y valvulas de vapor
    for (const pl of this.pellets) markWalk(pl.cell[0], pl.cell[1]);
    for (const b of this.layout.batteries) markWalk(b[0], b[1]);
    markWalk(this.layout.fruit[0], this.layout.fruit[1]);
    for (const s of this.switches) {
      markWalk(s.cell[0], s.cell[1]);
      markWall(s.cell[0] + s.wall[0], s.cell[1] + s.wall[1]);
    }
    for (const h of this.hideSpots) {
      markWalk(h.cell[0], h.cell[1]);
      markWall(h.cell[0] + h.wall[0], h.cell[1] + h.wall[1]);
    }
    for (const v of this.steamVents) {
      markWalk(v.cell[0], v.cell[1]);
      markWall(v.cell[0] + v.wall[0], v.cell[1] + v.wall[1]);
    }
    for (const g of this.ghosts) {
      markWalk(g.cx, g.cy);
      markWalk(g.tx, g.ty);
      markWalk(g.spawn[0], g.spawn[1]);
      markWalk(g.corner[0], g.corner[1]);
    }

    const hasNearbyCollider = (cx: number, cy: number): boolean => {
      const w = this.maze.cellToWorld(cx, cy);
      const r = K.CELL * 0.65;
      return this.colliders.some((c) => w.x + r > c.minX && w.x - r < c.maxX && w.z + r > c.minZ && w.z - r < c.maxZ);
    };

    const closeCandidates: { x: number; y: number; hasDot: boolean }[] = [];
    for (let y = 1; y < H - 1; y++) {
      if (y === this.maze.tunnelRow) continue;
      for (let x = 1; x < W - 1; x++) {
        if (this.maze.ch(x, y) !== ".") continue;
        if (protectedWalk.has(y * W + x)) continue;
        const distP = Math.hypot(x - px, y - py);
        if (distP < 2.1 || distP > 9.5) continue;
        if (this.ghosts.some((g) => Math.hypot(g.cx - x, g.cy - y) < 1.8)) continue;
        if (!ignoreViewCone) {
          const dot = ((x - px) * vx + (y - py) * vz) / distP;
          if (dot > -0.3) continue; // debe quedar a espaldas del jugador
        }
        if (this.maze.degree(x, y) < 2) continue;
        if (hasNearbyCollider(x, y)) continue;
        closeCandidates.push({ x, y, hasDot: this.dotGrid[y * W + x] === 1 });
      }
    }

    // Prioriza cerrar celdas cuyo punto ya fue comido
    closeCandidates.sort((a, b) => Number(a.hasDot) - Number(b.hasDot));

    for (const c of closeCandidates) {
      // Busca un muro interior cercano detras del jugador que pueda abrirse como pasillo alternativo
      for (let oy = Math.max(1, c.y - 3); oy <= Math.min(H - 2, c.y + 3); oy++) {
        if (oy === this.maze.tunnelRow) continue;
        for (let ox = Math.max(1, c.x - 3); ox <= Math.min(W - 2, c.x + 3); ox++) {
          if (ox === c.x && oy === c.y) continue;
          if (this.maze.ch(ox, oy) !== "#") continue;
          if (protectedWall.has(oy * W + ox)) continue;
          const distP = Math.hypot(ox - px, oy - py);
          if (distP < 1.8 || distP > 10.5) continue;
          if (!ignoreViewCone) {
            const dot = ((ox - px) * vx + (oy - py) * vz) / distP;
            if (dot > -0.2) continue;
          }
          if (hasNearbyCollider(ox, oy)) continue;

          // Al abrir (ox, oy) y cerrar (c.x, c.y), comprobamos que (ox, oy) conecte al menos 2 celdas transitables
          this.maze.setCell(c.x, c.y, "#");
          this.maze.setCell(ox, oy, ".");

          let valid = this.maze.degree(ox, oy) >= 2 && this.maze.degree(this.maze.exit[0], this.maze.exit[1]) === 1;
          if (valid) {
            const df = this.maze.distanceField([[px, py]]);
            for (let ty = 0; ty < H && valid; ty++) {
              for (let tx = 0; tx < W; tx++) {
                const ch = this.maze.ch(tx, ty);
                if (ch === "#" || ch === "S") continue;
                if (df[ty * W + tx] >= UNREACHABLE || this.maze.degree(tx, ty) < 1) {
                  valid = false;
                  break;
                }
              }
            }
          }

          if (valid) {
            if (c.hasDot) {
              this.dotGrid[c.y * W + c.x] = 0;
              this.dotGrid[oy * W + ox] = 1;
            }
            this.shiftCount++;
            const w = this.maze.cellToWorld(ox, oy);
            this.emit({ type: "mazeShift", closed: [c.x, c.y], opened: [ox, oy], x: w.x, z: w.z });
            return { closed: [c.x, c.y], opened: [ox, oy] };
          }

          // Reversion si no conserva la conectividad perfecta
          this.maze.setCell(c.x, c.y, ".");
          this.maze.setCell(ox, oy, "#");
        }
      }
    }
    return null;
  }
}

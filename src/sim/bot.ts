// Jugador automatico para pruebas y calibracion de dificultad. Planifica con un BFS desde el
// jugador que solo expande celdas que alcanza antes que cualquier fantasma peligroso (con un
// margen de tiempo): recoge el punto seguro mas cercano y, si no hay ninguno, huye a la celda
// segura con mas holgura. No usa linterna ni sonar y no intenta comer fantasmas, asi que sirve
// como referencia de "jugador competente que ve a todos los fantasmas", es decir, una cota
// optimista de lo que logra una persona real (que no ve a los que tiene a la espalda).

import { DIRS, UNREACHABLE, type Cell } from "./maze";
import type { PlayerInput } from "./player";
import type { Simulation } from "./simulation";

export interface BotOptions {
  /** Distancia BFS (celdas) a la que un fantasma activo se considera una amenaza (para correr). */
  dangerCells: number;
  /** Corre cuando hay amenaza y queda resistencia. */
  sprint: boolean;
  /** Va a por los pellets cuando hay peligro (para asustar a los fantasmas). */
  usePellets: boolean;
  /** Margen de seguridad en segundos frente a los fantasmas. */
  margin: number;
}

const DEFAULTS: BotOptions = { dangerCells: 8, sprint: true, usePellets: true, margin: 0.55 };
const WALK_CELLS = 3.7 / 2.4;
const RUN_CELLS = 5.8 / 2.4;

function start0(cx: number, cy: number, W: number): number { return cy * W + cx; }

export class EvasiveBot {
  private opts: BotOptions;
  private age = 99;
  private next: Cell | null = null;
  private goal = -1;
  private goalLock = 0;
  private fleeing = false;
  private catchIn = Infinity;
  private lastCell: Cell = [-1, -1];
  /** Distancia BFS al fantasma letal mas cercano (celdas). */
  threat = UNREACHABLE;

  constructor(private sim: Simulation, opts: Partial<BotOptions> = {}) {
    this.opts = { ...DEFAULTS, ...opts };
  }

  input(dt: number): PlayerInput {
    const sim = this.sim;
    const p = sim.player;
    const m = sim.maze;
    const [cx, cy] = m.worldToCell(p.x, p.z);
    this.age += dt;
    this.goalLock -= dt;
    const cellChanged = cx !== this.lastCell[0] || cy !== this.lastCell[1];
    if (cellChanged) this.lastCell = [cx, cy];
    if (cellChanged || this.age > 0.12 || this.next === null || !m.isWalkable(this.next[0], this.next[1])) {
      this.age = 0;
      if (this.next && !m.isWalkable(this.next[0], this.next[1])) this.goalLock = 0;
      this.next = this.plan(cx, cy);
    }

    const next = this.next ?? [cx, cy];
    const w = m.cellToWorld(next[0], next[1]);
    // a traves del tunel la celda siguiente esta al otro lado del mapa: apunta hacia el borde
    let tx = w.x;
    if (Math.abs(next[0] - cx) > 1) tx = next[0] < cx ? p.x + 5 : p.x - 5;
    const dx = tx - p.x, dz = w.z - p.z;
    if (dx * dx + dz * dz > 1e-6) p.yaw = Math.atan2(-dx, -dz);

    const sprint = this.opts.sprint && this.catchIn < 3.2 && !p.exhausted && p.stamina > 6;
    return { forward: dx * dx + dz * dz < 0.04 ? 0 : 1, strafe: 0, sprint, sonar: false };
  }

  private plan(cx: number, cy: number): Cell | null {
    const sim = this.sim;
    const m = sim.maze;
    const W = m.W;
    const N = W * m.H;
    const p = sim.player;

    // tiempo (s) que tarda el fantasma mas rapido en llegar a cada celda
    const gt = new Float32Array(N).fill(Infinity);
    this.threat = UNREACHABLE;
    for (const g of sim.ghosts) {
      let speed: number, delay: number;
      if (g.lethal) { speed = Math.max(1.2, g.speedCells); delay = 0; }
      else if (g.mode === "dormant") {
        // se anticipa a la hora a la que despertara segun el calendario del nivel
        const rel = sim.level.releaseTimes[g.kind] / sim.diff.releaseSpeed;
        speed = 1.4;
        delay = Math.max(0.8, rel - sim.attemptTime);
      }
      else continue;
      const f = m.distanceField([[g.cx, g.cy]]);
      if (g.lethal) this.threat = Math.min(this.threat, f[cy * W + cx]);
      const sleeping = g.mode === "dormant";
      for (let j = 0; j < N; j++) {
        if (f[j] >= UNREACHABLE) continue;
        // no se pasa a menos de 2 celdas de un fantasma dormido (se asustaria y despertaria)
        const t = sleeping && f[j] <= 2 ? -1 : f[j] / speed + delay;
        if (t < gt[j]) gt[j] = t;
      }
    }

    this.catchIn = gt[start0(cx, cy, W)];
    const canRun = !p.exhausted && p.stamina > 35;
    const ps = canRun ? (WALK_CELLS + RUN_CELLS) / 2 : WALK_CELLS;
    const start = cy * W + cx;
    const pd = new Int16Array(N);
    const first = new Int32Array(N);
    const queue = new Int32Array(N);
    let tail = 0;
    const search = (margin: number): void => {
      pd.fill(-1);
      first.fill(-1);
      let head = 0;
      tail = 0;
      pd[start] = 0;
      queue[tail++] = start;
      while (head < tail) {
        const i = queue[head++];
        const x = i % W, y = (i - x) / W;
        const d = pd[i] + 1;
        for (let k = 0; k < 4; k++) {
          const nx0 = x + DIRS[k][0], ny = y + DIRS[k][1];
          if (!m.isWalkable(nx0, ny)) continue;
          const j = ny * W + m.wrapX(nx0, ny);
          if (pd[j] >= 0) continue;
          if (d / ps + margin >= gt[j]) continue;
          pd[j] = d;
          first[j] = i === start ? j : first[i];
          queue[tail++] = j;
        }
      }
    };
    // si casi no queda sitio seguro se relaja el margen: es mejor arriesgar que quedarse quieto
    for (const f of [1, 0.5, 0, -0.6]) {
      search(this.opts.margin * f);
      if (tail >= 8) break;
    }

    // compromiso con el objetivo anterior mientras siga siendo alcanzable con seguridad
    if (this.goal >= 0 && this.goalLock > 0 && this.goal !== start && pd[this.goal] >= 0 && this.goalStillValid(this.goal)) {
      return this.cellOf(first[this.goal]);
    }

    // objetivos
    const danger = this.threat <= this.opts.dangerCells + 4;
    let bestJ = -1, bestScore = Infinity;
    for (let j = 0; j < tail; j++) {
      const c = queue[j];
      let value = 0;
      if (sim.exitUnlocked) { if (c === m.exit[1] * W + m.exit[0]) value = 1; }
      else if (sim.dotGrid[c]) value = 1;
      if (this.opts.usePellets && danger && !sim.powered) {
        for (const pl of sim.pellets) if (!pl.eaten && pl.cell[1] * W + pl.cell[0] === c) value = 2;
      }
      if (sim.powered) {
        for (const g of sim.ghosts) {
          if (g.mode === "frightened" && g.cy * W + g.cx === c && sim.frightTimer > (pd[c] / ps) * 1.3) value = 3;
        }
      }
      if (!value) continue;
      if (c === start) { bestJ = c; bestScore = -Infinity; break; } // el punto esta a pocos pasos: ir a su centro
      // un callejon sin salida solo si da tiempo a entrar y salir
      if (m.degree(c % W, Math.floor(c / W)) <= 1 && 2 * pd[c] / ps + 0.3 >= gt[c]) continue;
      let score = pd[c] - (value === 2 ? 7 : value === 3 ? 9 : 0);
      if (c === this.goal) score -= 2.5; // histeresis
      if (score < bestScore) { bestScore = score; bestJ = c; }
    }
    this.fleeing = false;
    if (bestJ >= 0) {
      if (bestJ !== this.goal) this.goalLock = 0.8;
      this.goal = bestJ;
      return bestJ === start ? [cx, cy] : this.cellOf(first[bestJ]);
    }

    // sin objetivos seguros: huye a la celda alcanzable con mas holgura
    let fleeJ = -1, fleeScore = -Infinity;
    for (let j = 0; j < tail; j++) {
      const c = queue[j];
      if (c === start) continue;
      const slack = Math.min(gt[c] - pd[c] / ps, 12);
      const score = slack + pd[c] * 0.02 + (c === this.goal ? 0.8 : 0);
      if (score > fleeScore) { fleeScore = score; fleeJ = c; }
    }
    if (fleeJ >= 0) {
      this.fleeing = true;
      if (fleeJ !== this.goal) this.goalLock = 0.5;
      this.goal = fleeJ;
      return this.cellOf(first[fleeJ]);
    }

    // acorralado: el vecino mas lejos de los fantasmas
    let bestN: Cell | null = null, bestG = -1;
    for (const [dx, dy] of DIRS) {
      if (!m.isWalkable(cx + dx, cy + dy)) continue;
      const nx = m.wrapX(cx + dx, cy + dy), ny = cy + dy;
      const g = Number.isFinite(gt[ny * W + nx]) ? gt[ny * W + nx] : 99;
      if (g > bestG) { bestG = g; bestN = [nx, ny]; }
    }
    this.goal = -1;
    return bestN;
  }

  /** El objetivo sigue teniendo sentido: un punto no comido, la salida, un pellet o una celda de huida. */
  private goalStillValid(i: number): boolean {
    const sim = this.sim;
    if (sim.exitUnlocked) return true;
    if (sim.dotGrid[i]) return true;
    const W = sim.maze.W;
    for (const pl of sim.pellets) if (!pl.eaten && pl.cell[1] * W + pl.cell[0] === i) return true;
    return this.fleeing;
  }

  private cellOf(i: number): Cell {
    const W = this.sim.maze.W;
    return [i % W, Math.floor(i / W)];
  }
}

/** Resultado de una partida simulada con el bot. */
export interface BotRun {
  outcome: "complete" | "gameover" | "timeout";
  time: number;
  deaths: number;
  dotsEaten: number;
  totalDots: number;
  score: number;
  ghostsEaten: number;
  pellets: number;
}

/** Ejecuta una partida completa (todas las vidas) con el bot y devuelve las estadisticas. */
export function runBot(sim: Simulation, opts: Partial<BotOptions> = {}, maxSeconds = 900, dt = 1 / 30): BotRun {
  const bot = new EvasiveBot(sim, opts);
  let t = 0;
  let outcome: BotRun["outcome"] = "timeout";
  while (t < maxSeconds) {
    if (sim.state === "caught") {
      if (sim.loseLife()) { outcome = "gameover"; break; }
      continue;
    }
    if (sim.state === "complete") { outcome = "complete"; break; }
    sim.update(dt, bot.input(dt));
    sim.drainEvents();
    t += dt;
  }
  return {
    outcome, time: t, deaths: sim.stats.deaths, dotsEaten: sim.dotsEaten, totalDots: sim.totalDots,
    score: sim.score, ghostsEaten: sim.stats.ghostsEaten, pellets: sim.stats.pellets,
  };
}

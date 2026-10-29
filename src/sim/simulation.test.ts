import { describe, expect, it } from "vitest";
import * as K from "../config/constants";
import { CAMPAIGN } from "../config/campaign";
import { DIFFICULTIES } from "../config/difficulty";
import { Simulation } from "./simulation";
import type { PlayerInput } from "./player";
import { mulberry32 } from "./rng";
import { DIRS, UNREACHABLE } from "./maze";

const DT = 1 / 60;

/** Bot: va hacia el punto mas cercano (o la salida) siguiendo el camino mas corto. */
function botInput(sim: Simulation, sprint = false): PlayerInput {
  const p = sim.player;
  const m = sim.maze;
  const [cx, cy] = m.worldToCell(p.x, p.z);
  let targets: [number, number][] = [];
  if (sim.exitUnlocked) targets = [m.exit];
  else {
    for (let y = 0; y < m.H; y++) for (let x = 0; x < m.W; x++) if (sim.dotGrid[y * m.W + x]) targets.push([x, y]);
  }
  if (!targets.length) return { forward: 0, strafe: 0, sprint: false, sonar: false };
  const field = m.distanceField(targets);
  let best: [number, number] = [cx, cy];
  let bd = field[cy * m.W + cx];
  for (const [dx, dy] of DIRS) {
    const nx = m.wrapX(cx + dx, cy + dy), ny = cy + dy;
    if (!m.isWalkable(cx + dx, ny)) continue;
    const d = field[ny * m.W + nx];
    if (d < bd) { bd = d; best = [nx, ny]; }
  }
  const w = m.cellToWorld(best[0], best[1]);
  // si el destino es el tunel envuelto, apunta hacia el borde correspondiente
  let tx = w.x;
  if (Math.abs(best[0] - cx) > 1) tx = best[0] < cx ? p.x + 5 : p.x - 5;
  const dx = tx - p.x, dz = w.z - p.z;
  p.yaw = Math.atan2(-dx, -dz);
  return { forward: 1, strafe: 0, sprint, sonar: false };
}

describe("Simulation: nivel completable sin fantasmas", () => {
  for (const level of CAMPAIGN) {
    it(`nivel ${level.id} (${level.theme}) se completa con el bot`, () => {
      const sim = new Simulation({ level, difficulty: DIFFICULTIES.normal });
      sim.ghosts.length = 0;
      let t = 0;
      while (sim.state === "playing" && t < 900) {
        sim.update(DT, botInput(sim));
        t += DT;
        // el jugador nunca debe quedar dentro de un muro
        const [cx, cy] = sim.maze.worldToCellRaw(sim.player.x, sim.player.z);
        expect(sim.maze.isSolid(cx, cy)).toBe(false);
      }
      expect(sim.state).toBe("complete");
      expect(sim.dotsEaten).toBe(sim.totalDots);
      expect(sim.exitUnlocked).toBe(true);
      expect(t).toBeLessThan(600);
    }, 60000);
  }
});

describe("Simulation: invariantes con fantasmas activos", () => {
  it("fantasmas y jugador se mantienen en celdas validas durante minutos de juego aleatorio", () => {
    for (const level of CAMPAIGN) {
      const sim = new Simulation({ level, difficulty: DIFFICULTIES.nightmare, rng: mulberry32(level.seed) });
      const rnd = mulberry32(level.seed + 1);
      let yawVel = 0;
      let fwd = 1;
      let deaths = 0;
      let ticks = 0;
      const seenModes = new Set<string>();
      for (let i = 0; i < 60 * 150; i++) {
        if (sim.state === "caught") { sim.lives = 3; sim.loseLife(); deaths++; }
        if (i % 40 === 0) { yawVel = (rnd() - 0.5) * 6; fwd = rnd() < 0.8 ? 1 : rnd() < 0.5 ? -1 : 0; }
        sim.player.yaw += yawVel * DT;
        sim.update(DT, { forward: fwd, strafe: rnd() < 0.1 ? 1 : 0, sprint: rnd() < 0.3, sonar: rnd() < 0.05 });
        ticks++;
        const [pcx, pcy] = sim.maze.worldToCellRaw(sim.player.x, sim.player.z);
        expect(sim.maze.isSolid(pcx, pcy), `jugador en muro nivel ${level.id}`).toBe(false);
        expect(Number.isFinite(sim.player.x) && Number.isFinite(sim.player.z)).toBe(true);
        for (const g of sim.ghosts) {
          seenModes.add(g.mode);
          expect(Number.isFinite(g.x) && Number.isFinite(g.z)).toBe(true);
          expect(sim.maze.isWalkable(g.cx, g.cy), `fantasma ${g.kind} en muro (${g.cx},${g.cy}) nivel ${level.id}`).toBe(true);
          expect(g.p).toBeGreaterThanOrEqual(0);
          expect(g.p).toBeLessThan(1.0001);
        }
        sim.drainEvents();
      }
      expect(ticks).toBe(60 * 150);
      expect(deaths).toBeGreaterThan(0); // los fantasmas realmente persiguen
      expect(seenModes.has("chase")).toBe(true);
    }
  }, 120000);

  it("los fantasmas despiertan segun los temporizadores y persiguen", () => {
    const level = CAMPAIGN[2];
    const sim = new Simulation({ level, difficulty: DIFFICULTIES.normal });
    sim.player.invuln = 1e9; // no morir
    expect(sim.ghosts.every((g) => g.mode === "dormant")).toBe(true);
    let t = 0;
    while (t < 60) { sim.update(DT, { forward: 0, strafe: 0, sprint: false, sonar: false }); t += DT; }
    expect(sim.ghosts.filter((g) => g.mode !== "dormant").length).toBe(4);
  });

  it("comer un pellet asusta a los fantasmas activos y se pueden comer con combo", () => {
    const sim = new Simulation({ level: CAMPAIGN[2], difficulty: DIFFICULTIES.normal });
    sim.player.invuln = 1e9;
    for (let i = 0; i < 60 * 40; i++) sim.update(DT, { forward: 0, strafe: 0, sprint: false, sonar: false });
    sim.activatePower();
    expect(sim.ghosts.every((g) => g.mode === "frightened")).toBe(true);
    const g0 = sim.ghosts[0];
    sim.player.x = g0.x; sim.player.z = g0.z;
    sim.update(DT, { forward: 0, strafe: 0, sprint: false, sonar: false });
    expect(g0.mode).toBe("eaten");
    const ev = sim.drainEvents().find((e) => e.type === "ghostEaten");
    expect(ev).toBeTruthy();
    // el segundo fantasma comido vale el doble
    const g1 = sim.ghosts[1];
    sim.player.x = g1.x; sim.player.z = g1.z;
    sim.update(DT, { forward: 0, strafe: 0, sprint: false, sonar: false });
    const ev2 = sim.drainEvents().find((e) => e.type === "ghostEaten");
    expect(ev2 && ev2.type === "ghostEaten" ? ev2.combo : 0).toBe(2);
  });

  it("ser atrapado detiene la simulacion y perder todas las vidas es game over", () => {
    const sim = new Simulation({ level: CAMPAIGN[0], difficulty: DIFFICULTIES.oneLife });
    for (let i = 0; i < 60 * 20; i++) sim.update(DT, { forward: 0, strafe: 0, sprint: false, sonar: false });
    sim.player.invuln = 0;
    const g = sim.ghosts[0];
    if (g.mode === "dormant") g.mode = "chase";
    sim.player.x = g.x; sim.player.z = g.z;
    sim.update(DT, { forward: 0, strafe: 0, sprint: false, sonar: false });
    expect(sim.state).toBe("caught");
    expect(sim.loseLife()).toBe(true);
  });

  it("al perder una vida el jugador reaparece protegido y los fantasmas vuelven a dormir", () => {
    const sim = new Simulation({ level: CAMPAIGN[0], difficulty: DIFFICULTIES.normal });
    for (let i = 0; i < 60 * 25; i++) sim.update(DT, { forward: 0, strafe: 0, sprint: false, sonar: false });
    sim.player.invuln = 0;
    const g = sim.ghosts[0];
    g.mode = "chase";
    sim.player.x = g.x; sim.player.z = g.z;
    sim.update(DT, { forward: 0, strafe: 0, sprint: false, sonar: false });
    expect(sim.state).toBe("caught");
    expect(sim.loseLife()).toBe(false);
    expect(sim.lives).toBe(DIFFICULTIES.normal.lives - 1);
    expect(sim.state).toBe("playing");
    expect(sim.player.invuln).toBeGreaterThan(1);
    expect(sim.ghosts.every((x) => x.mode === "dormant")).toBe(true);
  });
});

describe("Simulation: reglas", () => {
  it("vida extra a los 10000 puntos, una sola vez", () => {
    const sim = new Simulation({ level: CAMPAIGN[0], difficulty: DIFFICULTIES.normal });
    const lives = sim.lives;
    sim.addScore(9990);
    expect(sim.lives).toBe(lives);
    sim.addScore(20);
    expect(sim.lives).toBe(lives + 1);
    sim.addScore(20000);
    expect(sim.lives).toBe(lives + 1);
  });

  it("el escalado de puntuacion por dificultad se aplica", () => {
    const a = new Simulation({ level: CAMPAIGN[0], difficulty: DIFFICULTIES.easy });
    const b = new Simulation({ level: CAMPAIGN[0], difficulty: DIFFICULTIES.nightmare });
    a.addScore(100); b.addScore(100);
    expect(b.score).toBeGreaterThan(a.score);
  });

  it("la fruta aparece al 33% y al 66% de los puntos", () => {
    const sim = new Simulation({ level: CAMPAIGN[0], difficulty: DIFFICULTIES.normal });
    sim.ghosts.length = 0;
    let spawns = 0;
    let t = 0;
    while (sim.state === "playing" && t < 600) {
      sim.update(DT, botInput(sim, true));
      for (const e of sim.drainEvents()) if (e.type === "fruitSpawn") spawns++;
      t += DT;
    }
    expect(spawns).toBe(2);
  });

  it("las constantes de velocidad son coherentes (el sprint escapa de los fantasmas, caminar no)", () => {
    const ghost = K.GHOST_SPEED_BASE * K.CELL * 1.2 * 1.1;
    expect(K.PLAYER_RUN).toBeGreaterThan(ghost);
    expect(K.PLAYER_WALK).toBeLessThan(ghost + 0.8);
  });

  it("todas las celdas BFS del primer nivel son alcanzables", () => {
    const sim = new Simulation({ level: CAMPAIGN[0], difficulty: DIFFICULTIES.normal });
    const f = sim.maze.distanceField([sim.maze.worldToCell(sim.player.x, sim.player.z)]);
    for (let y = 0; y < sim.maze.H; y++) for (let x = 0; x < sim.maze.W; x++) {
      const c = sim.layout.grid[y][x];
      if (c !== "#" && c !== "S") expect(f[y * sim.maze.W + x]).toBeLessThan(UNREACHABLE);
    }
  });
});

// Esconderse: sospecha acumulada por fantasma, contener el aliento y revision activa de armarios.

import { describe, expect, it } from "vitest";
import { CAMPAIGN } from "../config/campaign";
import { DIFFICULTIES, type DifficultyId } from "../config/difficulty";
import { NO_INPUT } from "./player";
import { Simulation } from "./simulation";

const DT = 1 / 60;
const mk = (diff: DifficultyId = "normal") => new Simulation({ level: CAMPAIGN[2], difficulty: DIFFICULTIES[diff] });

/** Coloca al fantasma a `dist` u de la puerta (con desplazamientos sobre la celda del armario, que el avance respeta). */
function placeGhost(sim: Simulation, g: Simulation["ghosts"][number], h: { cell: [number, number] | readonly number[]; wall: readonly number[]; x: number; z: number }, dist: number): void {
  const door = { x: h.x + h.wall[0] * 0.56, z: h.z + h.wall[1] * 0.56 };
  const pos = alongCorridor(sim, h, dist);
  const c = sim.maze.cellToWorld(h.cell[0], h.cell[1]);
  g.cx = h.cell[0]; g.cy = h.cell[1]; g.p = 0; g.moving = false;
  g.offX = pos.x - c.x; g.offZ = pos.z - c.z;
  g.refreshWorld(sim.maze);
  g.yaw = Math.atan2(door.x - g.x, door.z - g.z);
}

/** Posicion a `dist` u de la puerta a lo largo del pasillo (perpendicular a la pared del armario), sin muros por medio. */
function alongCorridor(sim: Simulation, h: { wall: [number, number] | readonly number[]; x: number; z: number }, dist: number): { x: number; z: number } {
  const door = { x: h.x + h.wall[0] * 0.56, z: h.z + h.wall[1] * 0.56 };
  const perp = [-h.wall[1], h.wall[0]];
  for (const sg of [1, -1]) {
    const x = door.x + perp[0] * sg * dist, z = door.z + perp[1] * sg * dist;
    if (sim.maze.rayClear(door.x, door.z, x, z)) return { x, z };
  }
  return { x: door.x + perp[0] * dist, z: door.z + perp[1] * dist };
}

function quiet(sim: Simulation): void { for (const g of sim.ghosts) { g.mode = "dormant"; g.wakeTimer = 1e9; } sim.attemptTime = 100; }

/** Entra al primer armario sin que nadie lo vea y deja un fantasma a `dist` u de su puerta, mirandola. */
function hideWithGhostAt(sim: Simulation, dist: number) {
  quiet(sim);
  const h = sim.hideSpots[0];
  sim.player.x = h.x; sim.player.z = h.z; sim.player.invuln = 0;
  sim.update(DT, { ...NO_INPUT, interact: true });
  expect(sim.hidden).toBe(h);
  const g = sim.ghosts[0];
  g.mode = "chase"; g.wakeTimer = 0;
  // el fantasma se coloca a lo largo del pasillo, mirando la puerta
  placeGhost(sim, g, h, dist);
  sim.waveMode = "chase"; sim.waveTimer = 1e9;
  return { h, g };
}

function holdUntilCaught(sim: Simulation, hold: boolean, maxSeconds: number): number {
  const h = sim.hidden!, g = sim.ghosts[0];
  const door = { x: h.x + h.wall[0] * 0.56, z: h.z + h.wall[1] * 0.56 };
  const dist = Math.hypot(g.x - door.x, g.z - door.z);
  let t = 0;
  for (; t < maxSeconds && sim.state === "playing"; t += DT) {
    // el fantasma se mantiene donde esta (no es lo que se prueba)
    placeGhost(sim, g, h, dist); g.mode = "chase"; g.stun = 0;
    sim.update(DT, { ...NO_INPUT, sonar: hold });
  }
  return sim.state === "caught" ? t : Infinity;
}

describe("escondites: sospecha, aliento y revisiones", () => {
  it("sin fantasmas cerca la sospecha no sube nunca", () => {
    const sim = mk();
    quiet(sim);
    const h = sim.hideSpots[0];
    sim.player.x = h.x; sim.player.z = h.z;
    sim.update(DT, { ...NO_INPUT, interact: true });
    for (let i = 0; i < 60 * 30; i++) sim.update(DT, NO_INPUT);
    expect(sim.state).toBe("playing");
    expect(sim.hideThreat).toBe(0);
  });

  it("un fantasma mirando la puerta de cerca acaba descubriendo al jugador", () => {
    const sim = mk();
    hideWithGhostAt(sim, 1.2);
    const t = holdUntilCaught(sim, false, 20);
    expect(t).toBeLessThan(6);
  });

  it("contener el aliento frena mucho la sospecha en una misma visita y gasta aliento", () => {
    const peak = (hold: boolean) => {
      const sim = mk();
      const { h, g } = hideWithGhostAt(sim, 1.6);
      const dist = Math.hypot(g.x - (h.x + h.wall[0] * 0.56), g.z - (h.z + h.wall[1] * 0.56));
      let max = 0;
      for (let i = 0; i < 60 * 3 && sim.state === "playing"; i++) {
        placeGhost(sim, g, h, dist); g.mode = "chase"; g.stun = 0;
        sim.update(DT, { ...NO_INPUT, sonar: hold });
        max = Math.max(max, (sim.state as string) === "caught" ? 1 : sim.hideThreat);
      }
      return { max, stamina: sim.player.stamina };
    };
    const free = peak(false), held = peak(true);
    expect(free.max).toBeGreaterThan(0.6);
    expect(held.max).toBeLessThan(free.max * 0.55);
    expect(held.stamina).toBeLessThan(free.stamina);
  });

  it("al agotarse el aliento se jadea una vez y no se puede volver a contener enseguida", () => {
    const sim = mk();
    hideWithGhostAt(sim, 2.3);
    sim.drainEvents();
    let gasps = 0;
    for (let i = 0; i < 60 * 8.5 && sim.state === "playing"; i++) {
      sim.update(DT, { ...NO_INPUT, sonar: true });
      gasps += sim.drainEvents().filter((e) => e.type === "gasp").length;
    }
    expect(gasps).toBe(1);
    expect(sim.holdingBreath).toBe(false);
  });

  it("quien te vio entrar parte con sospecha alta y te encuentra antes que quien no", () => {
    const seen = mk(), unseen = mk();
    quiet(seen);
    const h = seen.hideSpots[0];
    seen.player.x = h.x; seen.player.z = h.z; seen.player.invuln = 0;
    const g = seen.ghosts[0]; g.mode = "chase"; g.wakeTimer = 0;
    placeGhost(seen, g, h, 1.6);
    seen.update(DT, { ...NO_INPUT, interact: true });
    expect(seen.hiddenSeen).toBe(true);
    const tSeen = holdUntilCaught(seen, false, 20);
    hideWithGhostAt(unseen, 2);
    const tUnseen = holdUntilCaught(unseen, false, 20);
    expect(tSeen).toBeLessThan(tUnseen);
  });

  it("un fantasma que pierde al jugador cerca de un armario va a revisarlo", () => {
    const sim = mk();
    quiet(sim);
    const h = sim.hideSpots[0];
    const g = sim.ghosts[0];
    g.mode = "chase"; g.wakeTimer = 0;
    // lo vio hace un instante a 2 celdas del armario y ya no lo ve
    g.lastSeen = [h.cell[0] + 2, h.cell[1]]; g.lostT = 1; g.sawPlayer = false;
    sim.player.x = h.x + 40; sim.player.z = h.z + 40; sim.player.invuln = 99;
    sim.waveMode = "chase"; sim.waveTimer = 1e9;
    g.cx = h.cell[0]; g.cy = h.cell[1] + 3; g.p = 0; g.refreshWorld(sim.maze);
    let checked = false;
    for (let i = 0; i < 60 * 12; i++) {
      g.lostT = Math.min(g.lostT + DT, 2); g.lastSeen = [h.cell[0] + 2, h.cell[1]];
      sim.update(DT, NO_INPUT);
      if (sim.drainEvents().some((e) => e.type === "hideCheck")) checked = true;
      if (g.checkedAt.length && g.checkedAt[0] > 0) break;
    }
    expect(checked).toBe(true);
  });

  it("genera variedad de escondites (locker, vent, table) con alturas de camara y angulos propios", () => {
    const sim = mk();
    const kinds = new Set(sim.hideSpots.map((h) => h.kind));
    expect(kinds.has("locker")).toBe(true);
    expect(kinds.has("vent")).toBe(true);
    expect(kinds.has("table")).toBe(true);
    expect(sim.hideEyeHeight("vent")).toBeLessThan(sim.hideEyeHeight("table"));
    expect(sim.hideEyeHeight("table")).toBeLessThan(sim.hideEyeHeight("locker"));
    expect(sim.hideYawLimit("table")).toBeGreaterThan(sim.hideYawLimit("vent"));
    expect(sim.hideYawLimit("vent")).toBeGreaterThan(sim.hideYawLimit("locker"));
  });

  it("un fantasma en patrulla que NO te vio ni oyo entrar pasa de largo sin detenerse ni atraparte", () => {
    const sim = mk();
    quiet(sim);
    const h = sim.hideSpots[0];
    sim.player.x = h.x; sim.player.z = h.z; sim.player.invuln = 0;
    sim.update(DT, { ...NO_INPUT, interact: true });
    expect(sim.hidden).toBe(h);
    expect(sim.hiddenSeen).toBe(false);
    expect(sim.hiddenSuspected).toBe(false);

    const g = sim.ghosts[0];
    g.mode = "scatter";
    g.wakeTimer = 0;
    g.cx = h.cell[0];
    g.cy = h.cell[1];
    g.p = 0;
    g.offX = 0;
    g.offZ = 0;
    g.refreshWorld(sim.maze);

    // Al avanzar un paso, como no vio ni oyo al jugador entrar, no se detiene (speedCells > 0) y sigue patrullando
    sim.update(DT, NO_INPUT);
    expect(g.speedCells).toBeGreaterThan(0);
    for (let i = 0; i < 60 * 5; i++) {
      sim.update(DT, NO_INPUT);
    }
    expect(sim.state).toBe("playing");
  });

  it("pulsar Espacio al ritmo en la ventana central del latido calma el pulso sin agotar el aliento ni jadear", () => {
    const sim = mk();
    const { h, g } = hideWithGhostAt(sim, 1.5);
    const dist = Math.hypot(g.x - (h.x + h.wall[0] * 0.56), g.z - (h.z + h.wall[1] * 0.56));
    sim.drainEvents();
    let hits = 0;
    let gasps = 0;
    for (let i = 0; i < 60 * 6 && sim.state === "playing"; i++) {
      placeGhost(sim, g, h, dist);
      g.mode = "chase";
      g.stun = 0;
      const inWindow = Math.abs(sim.heartPhase - 0.5) < sim.heartWindow * 0.5;
      // Toque corto de Espacio solo cuando el cursor entra en el centro y aun no tenemos calma activa
      const tap = sim.heartMinigame && inWindow && !sim.holdingBreath;
      sim.update(DT, { ...NO_INPUT, sonar: tap });
      for (const ev of sim.drainEvents()) {
        if (ev.type === "heartBeat" && ev.result === "hit") hits++;
        if (ev.type === "gasp") gasps++;
      }
    }
    expect(hits).toBeGreaterThanOrEqual(3);
    expect(gasps).toBe(0);
    expect(sim.state).toBe("playing");
    expect(sim.player.stamina).toBeGreaterThan(85);
  });

  it("una nube de vapor activa entre el fantasma y el escondite bloquea su vision al entrar", () => {
    const sim = mk();
    quiet(sim);
    const h = sim.hideSpots[0];
    sim.player.x = h.x; sim.player.z = h.z; sim.player.invuln = 0;
    const g = sim.ghosts[0];
    g.mode = "chase";
    g.wakeTimer = 0;
    placeGhost(sim, g, h, 2.2);

    // Colocamos una fuga de vapor en erupcion justo entre el jugador y el fantasma
    sim.steamVents[0].x = (sim.player.x + g.x) * 0.5;
    sim.steamVents[0].z = (sim.player.z + g.z) * 0.5;
    sim.steamVents[0].state = "erupting";
    sim.steamVents[0].timer = 5;

    sim.update(DT, { ...NO_INPUT, interact: true });
    expect(sim.hidden).toBe(h);
    expect(sim.hiddenSeen).toBe(false);
  });
});

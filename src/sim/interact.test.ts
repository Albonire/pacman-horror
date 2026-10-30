import { describe, expect, it } from "vitest";
import { CAMPAIGN } from "../config/campaign";
import { DIFFICULTIES } from "../config/difficulty";
import * as K from "../config/constants";
import { NO_INPUT } from "./player";
import { Simulation } from "./simulation";

const DT = 1 / 60;
const mk = (rng?: () => number) => new Simulation({ level: CAMPAIGN[2], difficulty: DIFFICULTIES.normal, rng });

function quietGhosts(sim: Simulation): void { for (const g of sim.ghosts) { g.mode = "dormant"; g.wakeTimer = 0; } sim.attemptTime = 100; }

describe("zonas oscuras, pilas, escondites e interruptores", () => {
  it("las pilas recargan la linterna una sola vez", () => {
    const sim = mk(); quietGhosts(sim);
    const b = sim.batteries[0];
    sim.player.x = b.x; sim.player.z = b.z; sim.player.battery = 20;
    sim.update(DT, NO_INPUT);
    expect(sim.player.battery).toBeCloseTo(65, 0);
    expect(b.taken).toBe(true);
    sim.update(DT, NO_INPUT);
    expect(sim.player.battery).toBeLessThan(70);
    expect(sim.drainEvents().some((e) => e.type === "battery")).toBe(true);
  });

  it("E entra y sale del escondite; dentro no hay linterna ni movimiento", () => {
    const sim = mk(); quietGhosts(sim);
    const h = sim.hideSpots[0];
    sim.player.x = h.x; sim.player.z = h.z;
    expect(sim.interactHint).toBe("hide");
    sim.update(DT, { ...NO_INPUT, interact: true });
    expect(sim.hidden).toBe(h);
    expect(sim.player.flashlightOn).toBe(false);
    const x = sim.player.x, z = sim.player.z;
    for (let i = 0; i < 30; i++) sim.update(DT, { ...NO_INPUT, forward: 1, sprint: true });
    expect(Math.hypot(sim.player.x - x, sim.player.z - z)).toBeLessThan(0.01);
    for (let i = 0; i < 60; i++) sim.update(DT, NO_INPUT); // pasa el enfriamiento
    sim.update(DT, { ...NO_INPUT, interact: true });
    expect(sim.hidden).toBeNull();
    expect(sim.player.flashlightOn).toBe(true);
  });

  it("un fantasma pegado al escondite lo descubre (rng bajo) o desiste (rng alto)", () => {
    for (const [rv, caught] of [[0.1, true], [0.9, false]] as const) {
      const sim = mk(() => rv); quietGhosts(sim);
      const h = sim.hideSpots[0];
      sim.player.x = h.x; sim.player.z = h.z; sim.player.invuln = 0;
      sim.update(DT, { ...NO_INPUT, interact: true });
      const g = sim.ghosts[0];
      g.cx = h.cell[0]; g.cy = h.cell[1]; g.mode = "chase"; g.p = 0; g.moving = false; g.refreshWorld(sim.maze);
      sim.waveMode = "chase"; sim.waveTimer = 1e9;
      for (let i = 0; i < 60 * 3 && sim.state === "playing"; i++) { g.mode = "chase"; g.cx = h.cell[0]; g.cy = h.cell[1]; g.p = 0; g.moving = false; g.refreshWorld(sim.maze); sim.update(DT, NO_INPUT); }
      expect(sim.state === "caught", `rng ${rv}`).toBe(caught);
    }
  });

  it("el interruptor enciende la zona un rato, hace ruido y la oscuridad vuelve", () => {
    const sim = mk(); quietGhosts(sim);
    const sw = sim.switches[0];
    const zc = sim.maze.cellToWorld(sim.layout.zones[sw.zone].cell[0], sim.layout.zones[sw.zone].cell[1]);
    expect(sim.darknessAt(zc.x, zc.z)).toBeGreaterThan(0.95);
    // un fantasma dormido cerca del interruptor se sobresalta
    const g = sim.ghosts[0]; g.cx = sw.cell[0]; g.cy = sw.cell[1]; g.refreshWorld(sim.maze);
    sim.player.x = sw.x; sim.player.z = sw.z; sim.player.invuln = 1e9;
    expect(sim.interactHint).toBe("switch");
    sim.update(DT, { ...NO_INPUT, interact: true });
    expect(sim.zoneLit[sw.zone]).toBeGreaterThan(10);
    expect(g.startled).toBe(true);
    for (let i = 0; i < 90; i++) sim.update(DT, NO_INPUT);
    expect(sim.darknessAt(zc.x, zc.z)).toBeLessThan(0.05);
    for (let i = 0; i < 60 * 14; i++) sim.update(DT, NO_INPUT);
    expect(sim.darknessAt(zc.x, zc.z)).toBeGreaterThan(0.95);
  });

  it("todos los niveles tienen zonas, pilas, escondites e interruptores alcanzables", () => {
    for (const level of CAMPAIGN) {
      const sim = new Simulation({ level, difficulty: DIFFICULTIES.normal });
      expect(sim.layout.zones.length).toBeGreaterThanOrEqual(2);
      expect(sim.batteries.length).toBeGreaterThanOrEqual(3);
      expect(sim.hideSpots.length).toBeGreaterThanOrEqual(3);
      expect(sim.switches.length).toBe(sim.layout.zones.length);
      expect(K.BATTERY_MAX).toBe(100);
    }
  });

  it("inspeccion activa de armarios: si un fantasma ve o escucha entrar al jugador, investiga activamente", () => {
    const sim = mk(); quietGhosts(sim);
    const h = sim.hideSpots[0];
    const g = sim.ghosts[0];
    g.mode = "chase";
    g.x = h.x + 3; g.z = h.z; g.cx = h.cell[0] + 3; g.cy = h.cell[1];
    sim.player.x = h.x; sim.player.z = h.z;
    sim.player.running = true;
    sim.update(DT, { ...NO_INPUT, interact: true });
    expect(sim.hidden).toBe(h);
    expect(sim.hiddenSeen || sim.hiddenSuspected).toBe(true);
  });

  it("un fantasma que llega al armario se detiene a inspeccionarlo sin avanzar de largo", () => {
    const sim = mk(() => 0.05); quietGhosts(sim);
    const h = sim.hideSpots[0];
    sim.player.x = h.x; sim.player.z = h.z; sim.player.invuln = 0;
    sim.update(DT, { ...NO_INPUT, interact: true });
    const g = sim.ghosts[0];
    g.cx = h.cell[0]; g.cy = h.cell[1]; g.mode = "chase"; g.p = 0; g.moving = true; g.refreshWorld(sim.maze);
    sim.waveMode = "chase"; sim.waveTimer = 1e9;
    // Avanzamos unos frames: el fantasma debe detectar que esta cerca y detener su velocidad a 0 para registrar
    sim.update(DT, NO_INPUT);
    expect(g.speedCells).toBe(0);
    // Tras la duracion de inspeccion con rng bajo, atrapa al jugador
    for (let i = 0; i < 60 * 2.5 && sim.state === "playing"; i++) {
      sim.update(DT, NO_INPUT);
    }
    expect(sim.state).toBe("caught");
  });
});

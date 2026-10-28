import { describe, expect, it } from "vitest";
import * as K from "../config/constants";
import { CAMPAIGN } from "../config/campaign";
import { DIFFICULTIES } from "../config/difficulty";
import { Simulation } from "./simulation";
import { GhostSim } from "./ghost";

describe("tunel", () => {
  it("el fantasma cruza el tunel sin saltos de posicion salvo el teletransporte previsto", () => {
    const sim = new Simulation({ level: CAMPAIGN[0], difficulty: DIFFICULTIES.normal });
    const m = sim.maze;
    const g = new GhostSim(0, m, [m.W - 3, m.tunnelRow], [1, 1]);
    g.mode = "chase";
    g.dx = 1; g.dy = 0; g.moving = true;
    g.speedCells = 3;
    const dt = 1 / 60;
    let prevX = g.x, jumps = 0, maxStep = 0;
    for (let i = 0; i < 900; i++) {
      g.advance(m, dt, () => [1, 0]);
      const step = Math.abs(g.x - prevX);
      if (step > 1.5 * K.CELL) {
        jumps++;
        // el salto neto = desplazamiento del tunel menos el avance normal de ese frame
        expect(Math.abs(m.tunnelShift - step)).toBeLessThanOrEqual(3 * K.CELL * dt + 1e-6);
      } else maxStep = Math.max(maxStep, step);
      prevX = g.x;
      expect(g.z).toBeCloseTo(m.cellToWorld(0, m.tunnelRow).z, 5);
    }
    expect(jumps).toBeGreaterThanOrEqual(2);
    expect(maxStep).toBeLessThanOrEqual(3 * K.CELL * dt + 1e-6);
  });

  it("el jugador se teletransporta en el centro del conector y conserva la continuidad", () => {
    const sim = new Simulation({ level: CAMPAIGN[0], difficulty: DIFFICULTIES.normal });
    sim.ghosts.length = 0;
    const m = sim.maze;
    const p = sim.player;
    const w = m.cellToWorld(m.W - 3, m.tunnelRow);
    p.x = w.x; p.z = w.z; p.yaw = -Math.PI / 2; // mira hacia +x
    let wraps = 0;
    let prev = p.x;
    for (let i = 0; i < 600; i++) {
      sim.update(1 / 60, { forward: 1, strafe: 0, sprint: false, sonar: false });
      if (sim.events.some((e) => e.type === "wrap")) wraps++;
      sim.drainEvents();
      if (Math.abs(p.x - prev) > K.CELL) {
        expect(Math.abs(m.tunnelShift - Math.abs(p.x - prev))).toBeLessThanOrEqual(K.PLAYER_RUN / 60 + 1e-6);
        expect(Math.abs(Math.abs(p.x) - m.tunnelLimit)).toBeLessThanOrEqual(K.PLAYER_RUN / 60 + 1e-6);
      }
      prev = p.x;
      expect(Math.abs(p.x)).toBeLessThanOrEqual(m.tunnelLimit + 0.01);
    }
    expect(wraps).toBeGreaterThanOrEqual(1);
  });
});

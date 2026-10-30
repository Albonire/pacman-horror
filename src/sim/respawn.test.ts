import { describe, expect, it } from "vitest";
import { CAMPAIGN } from "../config/campaign";
import { DIFFICULTIES } from "../config/difficulty";
import { Simulation } from "./simulation";

describe("reaparicion segura", () => {
  for (const lvl of [0, 2, 3, 5]) {
    it(`nivel ${lvl}: reaparece cerca de donde moriste, lejos de las guaridas y con la luz repuesta`, () => {
      const sim = new Simulation({ level: CAMPAIGN[lvl], difficulty: DIFFICULTIES.normal });
      const m = sim.maze;
      // muere en varios puntos del mapa
      const cells: [number, number][] = [];
      for (let y = 1; y < m.H; y += 4) for (let x = 1; x < m.W; x += 4) if (m.isWalkable(x, y)) cells.push([x, y]);
      expect(cells.length).toBeGreaterThan(4);
      let nearer = 0;
      for (const [cx, cy] of cells) {
        const w = m.cellToWorld(cx, cy);
        sim.player.x = w.x; sim.player.z = w.z; sim.player.battery = 5;
        sim.state = "caught";
        expect(sim.loseLife()).toBe(false);
        const [rx, ry] = m.worldToCell(sim.player.x, sim.player.z);
        expect(m.isWalkable(rx, ry)).toBe(true);
        for (const g of sim.ghosts) expect(Math.hypot(g.spawn[0] - rx, g.spawn[1] - ry)).toBeGreaterThanOrEqual(8);
        expect(sim.player.battery).toBeGreaterThanOrEqual(60);
        expect(sim.player.invuln).toBeGreaterThan(0);
        const start = m.cellToWorld(sim.layout.player[0], sim.layout.player[1]);
        if (Math.hypot(sim.player.x - w.x, sim.player.z - w.z) < Math.hypot(start.x - w.x, start.z - w.z) - 0.1) nearer++;
        sim.lives = 99; // no llegar al fin de partida
      }
      // la mayoria de las veces reaparece mas cerca del lugar de la muerte que el punto de inicio
      expect(nearer).toBeGreaterThanOrEqual(Math.floor(cells.length / 3));
    });
  }
});

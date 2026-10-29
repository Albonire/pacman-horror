import { describe, expect, it } from "vitest";
import { CAMPAIGN } from "../config/campaign";
import { DIFFICULTIES } from "../config/difficulty";
import * as K from "../config/constants";
import { moveAndSlide } from "./collision";
import { DIRS } from "./maze";
import { NO_INPUT } from "./player";
import { Simulation } from "./simulation";

/** Un jugador quieto en la esquina de una celda tambien debe ser atrapado por un fantasma que lo persigue. */
describe("esquinas: el fantasma siempre atrapa a un jugador quieto", () => {
  it("en todas las celdas muestreadas y las cuatro esquinas", () => {
    const failures: string[] = [];
    for (const level of [CAMPAIGN[0], CAMPAIGN[3]]) {
      const base = new Simulation({ level, difficulty: DIFFICULTIES.normal });
      const m = base.maze;
      let n = 0;
      for (let cy = 1; cy < m.H - 1; cy += 2) {
        for (let cx = 1; cx < m.W - 1; cx += 2) {
          if (!m.isWalkable(cx, cy)) continue;
          if (++n % 3 !== 0) continue;
          for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
            const sim = new Simulation({ level, difficulty: DIFFICULTIES.normal });
            const c = m.cellToWorld(cx, cy);
            const pos = { x: c.x, z: c.z };
            moveAndSlide(sim.maze, [], pos, sx * 3, sz * 3, K.PLAYER_RADIUS);
            // empuja tambien por ejes por separado para quedar lo mas lejos posible del centro
            moveAndSlide(sim.maze, [], pos, sx * 3, 0, K.PLAYER_RADIUS);
            moveAndSlide(sim.maze, [], pos, 0, sz * 3, K.PLAYER_RADIUS);
            sim.player.x = pos.x; sim.player.z = pos.z; sim.player.invuln = 0;
            // fantasma a ~6 celdas por el laberinto
            const f = m.distanceField([[cx, cy]]);
            let best: [number, number] | null = null;
            for (let y = 0; y < m.H; y++) for (let x = 0; x < m.W; x++) {
              if (f[y * m.W + x] === 6) { best = [x, y]; break; }
            }
            if (!best) continue;
            const g = sim.ghosts[0];
            g.cx = best[0]; g.cy = best[1]; g.p = 0; g.moving = false; g.mode = "chase"; g.reverseQueued = true; g.refreshWorld(m);
            for (const o of sim.ghosts) if (o !== g) { o.mode = "dormant"; o.wakeTimer = 0; }
            sim.attemptTime = 100; sim.waveMode = "chase"; sim.waveTimer = 1e9;
            for (let t = 0; t < 60 && sim.state === "playing"; t += 1 / 60) {
              for (const o of sim.ghosts) if (o !== g && o.mode !== "dormant") o.mode = "dormant";
              sim.update(1 / 60, NO_INPUT);
            }
            if (sim.state !== "caught") {
              failures.push(`L${level.id} celda ${cx},${cy} esquina ${sx},${sz}: fantasma en ${g.cx},${g.cy} dist ${Math.hypot(g.x - sim.player.x, g.z - sim.player.z).toFixed(2)}`);
            }
          }
        }
      }
    }
    expect(failures.slice(0, 6)).toEqual([]);
    expect(DIRS.length).toBe(4);
  }, 120000);
});

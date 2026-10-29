import { describe, expect, it } from "vitest";
import { CAMPAIGN } from "../config/campaign";
import { DIFFICULTIES } from "../config/difficulty";
import * as K from "../config/constants";
import { NO_INPUT } from "./player";
import { BITE_COOLDOWN, Simulation } from "./simulation";

function setup() {
  const sim = new Simulation({ level: CAMPAIGN[0], difficulty: DIFFICULTIES.normal });
  const g = sim.ghosts[0];
  // pasillo del tunel: libre de muros a ambos lados en x
  const w = sim.maze.cellToWorld(5, sim.maze.tunnelRow);
  sim.player.x = w.x; sim.player.z = w.z; sim.player.yaw = -Math.PI / 2; // mira hacia +x
  sim.player.invuln = 0;
  sim.attemptTime = 100;
  for (const o of sim.ghosts) if (o !== g) o.mode = "dormant";
  g.cx = 6; g.cy = sim.maze.tunnelRow; g.p = 0; g.moving = false; g.refreshWorld(sim.maze);
  return { sim, g };
}

describe("mordisco", () => {
  it("aturde al fantasma de enfrente y lo deja inofensivo un instante", () => {
    const { sim, g } = setup();
    g.mode = "chase";
    sim.waveMode = "chase"; sim.waveTimer = 1e9;
    g.x = sim.player.x + 1.6; g.z = sim.player.z;
    sim.update(1 / 60, { ...NO_INPUT, bite: true });
    expect(g.stun).toBeGreaterThan(1);
    expect(g.lethal).toBe(false);
    const ev = sim.drainEvents().find((e) => e.type === "bite");
    expect(ev && ev.type === "bite" ? ev.stunned : 0).toBe(1);
    // aunque se solape con el jugador no lo atrapa mientras esta aturdido
    g.x = sim.player.x; g.z = sim.player.z;
    sim.update(1 / 60, NO_INPUT);
    expect(sim.state).toBe("playing");
    expect(sim.player.stamina).toBeLessThan(K.STAMINA_MAX);
  });

  it("no muerde a la espalda, tiene enfriamiento y cuesta aliento", () => {
    const { sim, g } = setup();
    g.mode = "chase"; sim.waveMode = "chase"; sim.waveTimer = 1e9;
    g.x = sim.player.x - 1.6; g.z = sim.player.z;
    sim.update(1 / 60, { ...NO_INPUT, bite: true });
    expect(g.stun).toBe(0);
    expect(sim.biteCd).toBeGreaterThan(BITE_COOLDOWN - 0.1);
    const st = sim.player.stamina;
    sim.update(1 / 60, { ...NO_INPUT, bite: true }); // en enfriamiento: no hace nada
    expect(sim.player.stamina).toBeGreaterThanOrEqual(st);
  });

  it("se come a un fantasma asustado a distancia de mordisco", () => {
    const { sim, g } = setup();
    g.mode = "chase";
    sim.activatePower();
    g.x = sim.player.x + 1.9; g.z = sim.player.z;
    sim.update(1 / 60, { ...NO_INPUT, bite: true });
    expect(g.mode).toBe("eaten");
  });
});

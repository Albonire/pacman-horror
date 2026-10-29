// Calibracion de dificultad con un jugador automatico. Las partidas son deterministas
// (semillas fijas). Con BALANCE=1 se imprime la tabla completa de niveles x dificultades.

import { describe, expect, it } from "vitest";
import { CAMPAIGN } from "../config/campaign";
import { DIFFICULTIES, DIFFICULTY_ORDER, type DifficultyId } from "../config/difficulty";
import { runBot, type BotRun } from "./bot";
import { mulberry32 } from "./rng";
import { Simulation } from "./simulation";

function play(levelIdx: number, diff: DifficultyId, seed: number): BotRun {
  const level = CAMPAIGN[levelIdx];
  const sim = new Simulation({ level, difficulty: DIFFICULTIES[diff], rng: mulberry32(level.seed * 31 + seed) });
  return runBot(sim, {}, 900);
}

const FULL = process.env.BALANCE === "1";
const SEEDS = FULL ? [1, 2, 3, 4, 5, 6] : [1, 2];
const LEVELS = FULL ? CAMPAIGN.map((_, i) => i) : [0, 3];

describe("balance con jugador automatico", () => {
  const table: Record<string, BotRun[]> = {};
  for (const diff of DIFFICULTY_ORDER) {
    for (const li of LEVELS) {
      table[`${diff}/${li}`] = SEEDS.map((s) => play(li, diff, s));
    }
  }

  const rate = (diff: DifficultyId): number => {
    let ok = 0, n = 0;
    for (const li of LEVELS) for (const r of table[`${diff}/${li}`]) { n++; if (r.outcome === "complete") ok++; }
    return ok / n;
  };
  const progress = (diff: DifficultyId): number => {
    let p = 0, n = 0;
    for (const li of LEVELS) for (const r of table[`${diff}/${li}`]) { n++; p += r.dotsEaten / r.totalDots; }
    return p / n;
  };

  it("imprime el resumen", () => {
    const lines: string[] = [];
    for (const diff of DIFFICULTY_ORDER) {
      const cells = LEVELS.map((li) => {
        const rs = table[`${diff}/${li}`];
        const ok = rs.filter((r) => r.outcome === "complete").length;
        const avgDeaths = rs.reduce((a, r) => a + r.deaths, 0) / rs.length;
        const avgT = rs.reduce((a, r) => a + r.time, 0) / rs.length;
        const prog = rs.reduce((a, r) => a + r.dotsEaten / r.totalDots, 0) / rs.length;
        return `L${li}: ${ok}/${rs.length} muertes ${avgDeaths.toFixed(1)} t ${avgT.toFixed(0)}s prog ${(prog * 100).toFixed(0)}%`;
      });
      lines.push(`${diff.padEnd(10)} ${cells.join(" | ")}`);
    }
    console.log("\n" + lines.join("\n"));
    expect(lines.length).toBe(DIFFICULTY_ORDER.length);
  });

  it("la dificultad es monotona: mas dura = menos progreso y menos exito", () => {
    const order = DIFFICULTY_ORDER;
    for (let i = 0; i + 1 < order.length; i++) {
      expect(progress(order[i]) + 0.03, `${order[i]} vs ${order[i + 1]} progreso`).toBeGreaterThanOrEqual(progress(order[i + 1]));
      expect(rate(order[i]) + 0.1, `${order[i]} vs ${order[i + 1]} exito`).toBeGreaterThanOrEqual(rate(order[i + 1]));
    }
  });

  it("APRENDIZ es superable por un jugador competente y MUERTE SUBITA es durisima", () => {
    expect(rate("easy")).toBeGreaterThan(0.5);
    expect(rate("oneLife")).toBeLessThan(0.5);
  });

  it("no hay partidas atascadas (todas terminan por exito o por vidas agotadas)", () => {
    for (const k of Object.keys(table)) for (const r of table[k]) expect(r.outcome, k).not.toBe("timeout");
  });
});

import { describe, expect, it } from "vitest";
import { generateLayout, validateLayout, type LayoutSpec } from "./layout";
import { Maze, UNREACHABLE } from "./maze";

const SIZES: [number, number][] = [[19, 19], [19, 23], [23, 23], [23, 27], [27, 27]];

describe("generateLayout", () => {
  it("produce niveles validos para muchas semillas y tamanos", () => {
    for (const [W, H] of SIZES) {
      for (let seed = 1; seed <= 60; seed++) {
        const spec: LayoutSpec = { W, H, seed: seed * 104729, loopChance: 0.14, braid: 0.85 };
        const l = generateLayout(spec);
        expect(validateLayout(l), `${W}x${H} seed ${seed}`).toEqual([]);
      }
    }
  });

  it("es determinista", () => {
    const spec: LayoutSpec = { W: 19, H: 19, seed: 7919, loopChance: 0.15, braid: 0.85 };
    expect(generateLayout(spec).grid).toEqual(generateLayout(spec).grid);
  });

  it("la salida es hoja y sellarla no desconecta el laberinto", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const l = generateLayout({ W: 23, H: 23, seed: seed * 31337, loopChance: 0.16, braid: 0.8 });
      const m = new Maze(l);
      expect(m.degree(l.exit[0] + l.exitDir[0], l.exit[1] + l.exitDir[1])).toBeGreaterThanOrEqual(1);
      const f = m.distanceField([l.player]);
      for (let y = 0; y < l.H; y++) for (let x = 0; x < l.W; x++) {
        if (l.grid[y][x] !== "#" && l.grid[y][x] !== "S") expect(f[y * l.W + x]).toBeLessThan(UNREACHABLE);
      }
    }
  });

  it("el trenzado deja pocos callejones", () => {
    let total = 0, count = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const l = generateLayout({ W: 23, H: 23, seed: seed * 977, loopChance: 0.16, braid: 0.9 });
      total += l.deadEnds.length; count++;
    }
    expect(total / count).toBeLessThan(6);
  });

  it("el tunel envuelve y esta abierto de borde a borde", () => {
    const l = generateLayout({ W: 19, H: 19, seed: 1234, loopChance: 0.14, braid: 0.85 });
    const row = l.grid[l.tunnelRow];
    expect(row.includes("#")).toBe(false);
    const m = new Maze(l);
    expect(m.wrapX(-1, l.tunnelRow)).toBe(l.W - 1);
    expect(m.wrapX(l.W, l.tunnelRow)).toBe(0);
    expect(m.isWalkable(-1, l.tunnelRow)).toBe(true);
    expect(m.isWalkable(-1, l.tunnelRow - 1)).toBe(false);
  });
});

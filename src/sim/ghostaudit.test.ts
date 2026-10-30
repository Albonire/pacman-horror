// Auditoria de la IA de cada fantasma. Cada tipo se prueba solo (los demas dormidos) contra el bot evasivo y se
// mide cuanto tarda en atrapar al jugador, si se queda atascado y si se mueve por todo el mapa.
// `AUDIT=1 npx vitest run src/sim/ghostaudit.test.ts` imprime la tabla; sin la variable solo comprueba invariantes.

import { describe, expect, it } from "vitest";
import { CAMPAIGN } from "../config/campaign";
import { DIFFICULTIES, DIFFICULTY_ORDER, type DifficultyId } from "../config/difficulty";
import { EvasiveBot } from "./bot";
import { mulberry32 } from "./rng";
import { Simulation } from "./simulation";

const FULL = process.env.AUDIT === "1";
const KINDS = [0, 1, 2, 3] as const;
const KIND_NAMES = ["Acechador", "Emboscadora", "Resonador", "Estatico"];
const CAP = 120; // segundos por partida

interface Stat { survive: number[]; stuck: number; moved: number; cells: Set<number>; chaseFrac: number[]; flips: number[] }

function runOne(levelIdx: number, diff: DifficultyId, kind: 0 | 1 | 2 | 3, seed: number): { survive: number; stuck: number; moved: number; cells: number; chase: number; flips: number } {
  const level = CAMPAIGN[levelIdx];
  const sim = new Simulation({ level: { ...level, ghosts: 4 }, difficulty: { ...DIFFICULTIES[diff], extraGhosts: 0 }, rng: mulberry32(level.seed * 17 + seed) });
  for (const g of sim.ghosts) if (g.kind !== kind) { g.mode = "dormant"; g.wakeTimer = 1e9; }
  const me = sim.ghosts.find((g) => g.kind === kind)!;
  me.mode = "chase"; me.wakeTimer = 0;
  sim.player.invuln = 0;
  const bot = new EvasiveBot(sim, {});
  const dt = 1 / 30;
  let t = 0, stuck = 0, still = 0, moved = 0, chaseT = 0, lx = me.x, lz = me.z, flips = 0, pdx = me.dx, pdy = me.dy;
  const seen = new Set<number>();
  while (t < CAP && sim.state === "playing") {
    // el fantasma esta despierto siempre; si el motor lo duerme (liberacion) se vuelve a despertar
    if ((me.mode as string) === "dormant") { me.mode = "chase"; me.wakeTimer = 0; }
    sim.update(dt, bot.input(dt));
    sim.drainEvents();
    t += dt;
    if (me.mode === "chase") chaseT += dt;
    const d = Math.hypot(me.x - lx, me.z - lz);
    moved += d;
    const waiting = me.frozen || me.stun > 0 || (me.mode as string) === "dormant";
    if (d < 0.002 && !waiting) { still += dt; if (still > 4) stuck += dt; } else still = 0;
    lx = me.x; lz = me.z;
    seen.add(me.cy * sim.maze.W + me.cx);
    // media vuelta (dudar entre dos celdas): la IA legitima solo da la vuelta por inversion de oleada o susto
    if (me.mode === "chase" && (me.dx !== pdx || me.dy !== pdy) && me.dx === -pdx && me.dy === -pdy && (me.dx || me.dy)) flips++;
    pdx = me.dx; pdy = me.dy;
  }
  return { survive: sim.state === "caught" && sim.caughtBy === me ? t : CAP, stuck, moved, cells: seen.size, chase: chaseT / Math.max(1, t), flips: flips / Math.max(1, t / 60) };
}

/** Los cuatro juntos y despiertos desde el inicio: mide si se reparten el trabajo (pinza) en vez de ir en fila. */
function runTeam(levelIdx: number, diff: DifficultyId, seed: number): number {
  const level = CAMPAIGN[levelIdx];
  const sim = new Simulation({ level: { ...level, ghosts: 4 }, difficulty: { ...DIFFICULTIES[diff], extraGhosts: 0 }, rng: mulberry32(level.seed * 17 + seed) });
  for (const g of sim.ghosts) { g.mode = "chase"; g.wakeTimer = 0; }
  sim.player.invuln = 0;
  const bot = new EvasiveBot(sim, {});
  const dt = 1 / 30;
  let t = 0;
  while (t < CAP && sim.state === "playing") {
    for (const g of sim.ghosts) if ((g.mode as string) === "dormant") { g.mode = "chase"; g.wakeTimer = 0; }
    sim.update(dt, bot.input(dt));
    sim.drainEvents();
    t += dt;
  }
  return sim.state === "caught" ? t : CAP;
}

describe("auditoria de IA de fantasmas", () => {
  const table = new Map<string, Stat>();
  const levels = FULL ? [0, 2, 3, 5] : [0, 3];
  const diffs: DifficultyId[] = FULL ? [...DIFFICULTY_ORDER] : ["normal", "nightmare"];
  const seeds = FULL ? [1, 2, 3, 4] : [1, 2, 3];
  for (const diff of diffs) for (const kind of KINDS) {
    const key = `${diff}/${kind}`;
    const st: Stat = { survive: [], stuck: 0, moved: 0, cells: new Set(), chaseFrac: [], flips: [] };
    for (const li of levels) for (const s of seeds) {
      const r = runOne(li, diff, kind, s);
      st.survive.push(r.survive); st.stuck += r.stuck; st.moved += r.moved; st.chaseFrac.push(r.chase); st.flips.push(r.flips);
      st.cells.add(li * 1000 + r.cells);
    }
    table.set(key, st);
  }

  it("imprime la tabla por fantasma", () => {
    const lines: string[] = [];
    for (const diff of diffs) {
      const parts = KINDS.map((k) => {
        const st = table.get(`${diff}/${k}`)!;
        const mean = st.survive.reduce((a, b) => a + b, 0) / st.survive.length;
        const caught = st.survive.filter((x) => x < CAP).length;
        return `${KIND_NAMES[k]} ${mean.toFixed(0)}s (${caught}/${st.survive.length}) atasco ${st.stuck.toFixed(0)}s, vueltas/min ${(st.flips.reduce((a, b) => a + b, 0) / st.flips.length).toFixed(1)}`;
      });
      lines.push(`${diff.padEnd(10)} ${parts.join(" | ")}`);
    }
    console.log("\n" + lines.join("\n"));
    expect(lines.length).toBe(diffs.length);
  });

  it("el equipo completo atrapa mas rapido que cualquiera por separado", () => {
    const lines: string[] = [];
    for (const diff of diffs) {
      const times: number[] = [];
      for (const li of levels) for (const sd of seeds) times.push(runTeam(li, diff, sd));
      const mean = times.reduce((a, b) => a + b, 0) / times.length;
      const solo = KINDS.map((k) => { const st = table.get(`${diff}/${k}`)!; return st.survive.reduce((a, b) => a + b, 0) / st.survive.length; });
      lines.push(`${diff.padEnd(10)} equipo ${mean.toFixed(0)}s (${times.filter((x) => x < CAP).length}/${times.length}) vs mejor solo ${Math.min(...solo).toFixed(0)}s`);
      expect(mean, `${diff} equipo`).toBeLessThanOrEqual(Math.min(...solo) + 5);
    }
    if (FULL) console.log("\n" + lines.join("\n"));
  });

  it("ningun fantasma se queda atascado mas de unos segundos en toda la partida", () => {
    for (const [key, st] of table) expect(st.stuck, `${key} atascado`).toBeLessThan(CAP * 0.2 * st.survive.length / 4 + 1);
  });

  it("ningun fantasma duda entre dos celdas (media vuelta constante)", () => {
    for (const [key, st] of table) {
      const mean = st.flips.reduce((a, b) => a + b, 0) / st.flips.length;
      expect(mean, `${key} vueltas por minuto`).toBeLessThan(6);
    }
  });

  it("ningun tipo es inofensivo: todos recorren el mapa y el Acechador siempre acaba atrapando", () => {
    for (const diff of diffs) for (const k of KINDS) {
      const st = table.get(`${diff}/${k}`)!;
      expect(st.moved, `${diff}/${k} movimiento`).toBeGreaterThan(30);
      // el Acechador es el cazador directo; los demas cooperan y en solitario pueden no atrapar a un bot perfecto
      if (k === 0 && diff !== "easy") expect(st.survive.some((x) => x < CAP), `${diff}/${k} nunca atrapa`).toBe(true);
    }
  });
});

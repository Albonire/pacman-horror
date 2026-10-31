import { describe, expect, it } from "vitest";
import { CAMPAIGN } from "../config/campaign";
import { DIFFICULTIES } from "../config/difficulty";
import { UNREACHABLE } from "./maze";
import { NO_INPUT } from "./player";
import { Simulation } from "./simulation";

describe("Eventos Ambientales Dinámicos", () => {
  it("genera válvulas de vapor válidas y ejecuta el ciclo idle -> warning -> erupting con daño y ralentización", () => {
    const sim = new Simulation({ level: CAMPAIGN[0], difficulty: DIFFICULTIES.normal });
    expect(sim.steamVents.length).toBeGreaterThanOrEqual(4);

    for (const v of sim.steamVents) {
      expect(sim.maze.isWalkable(v.cell[0], v.cell[1])).toBe(true);
      expect(sim.maze.ch(v.cell[0] + v.wall[0], v.cell[1] + v.wall[1])).toBe("#");
    }

    // Forzar aviso de fuga en la primera válvula
    const vent = sim.triggerSteamLeak(0, false)!;
    expect(vent.state).toBe("warning");
    expect(sim.drainEvents().some((e) => e.type === "steamWarning")).toBe(true);

    // Avanzar hasta que estalle el chorro de vapor
    for (let i = 0; i < 35; i++) sim.update(0.05, NO_INPUT);
    expect(vent.state).toBe("erupting");
    expect(sim.drainEvents().some((e) => e.type === "steamErupt")).toBe(true);

    // Colocar al jugador dentro del chorro de vapor activo
    sim.player.x = vent.x;
    sim.player.z = vent.z;
    const stamBefore = sim.player.stamina;
    const batBefore = sim.player.battery;

    sim.update(0.2, { ...NO_INPUT, forward: 1 });
    expect(sim.player.steamSlow).toBe(true);
    expect(sim.steamExposure).toBeGreaterThan(0.2);
    expect(sim.player.stamina).toBeLessThan(stamBefore);
    expect(sim.player.battery).toBeLessThan(batBefore);
    expect(sim. drainEvents().some((e) => e.type === "steamHurt")).toBe(true);
  });

  it("provoca apagones generales de zona con parpadeo previo y obliga a reactivar el interruptor a ciegas", () => {
    const sim = new Simulation({ level: CAMPAIGN[0], difficulty: DIFFICULTIES.normal });
    expect(sim.layout.zones.length).toBeGreaterThan(0);

    const sw = sim.switches[0];
    const zIdx = sw.zone;
    const zCell = sim.layout.zones[zIdx].cell;
    const zWorld = sim.maze.cellToWorld(zCell[0], zCell[1]);

    // Primero encendemos la zona con el interruptor
    sim.player.x = sw.x;
    sim.player.z = sw.z;
    sim.update(0.05, { ...NO_INPUT, interact: true });
    expect(sim.zoneLit[zIdx]).toBeGreaterThan(10);
    expect(sim.darknessAt(zWorld.x, zWorld.z)).toBeLessThan(0.05);
    sim.drainEvents();

    // Disparar apagón general en esa zona: empieza parpadeando (zoneFlicker)
    sim.triggerZoneBlackout(zIdx, false);
    expect(sim.zoneFlicker[zIdx]).toBeGreaterThan(1.0);
    expect(sim.drainEvents().some((e) => e.type === "zoneFlicker" && e.zone === zIdx)).toBe(true);

    // Tras 1.9 s cae el disyuntor y el sector entero entra en apagón general (sectorOutage)
    for (let i = 0; i < 40; i++) sim.update(0.05, NO_INPUT);
    expect(sim.zoneFlicker[zIdx]).toBe(0);
    expect(sim.zoneLit[zIdx]).toBe(0);
    expect(sim.sectorOutage[zIdx]).toBe(true);
    expect(sim.drainEvents().some((e) => e.type === "zoneBlackout" && e.zone === zIdx)).toBe(true);

    // La oscuridad cubre incluso pasillos a mayor distancia del centro gracias a sectorOutage
    const farDist = (sim.layout.zones[zIdx].r + 1.2) * 3.0;
    expect(sim.darknessAt(zWorld.x + farDist, zWorld.z)).toBeGreaterThan(0.5);

    // El jugador busca y acciona el interruptor a ciegas: vuelve la luz y cesa el apagón de sector
    sim.player.x = sw.x;
    sim.player.z = sw.z;
    sim.update(0.05, { ...NO_INPUT, interact: true });
    expect(sim.sectorOutage[zIdx]).toBe(false);
    expect(sim.zoneLit[zIdx]).toBeGreaterThan(12);
    expect(sim.darknessAt(zWorld.x, zWorld.z)).toBeLessThan(0.05);
  });

  it("modifica pasillos a espaldas del jugador al girar 180 grados (geometría no euclidiana) preservando conectividad total", () => {
    for (const level of CAMPAIGN) {
      const sim = new Simulation({ level, difficulty: DIFFICULTIES.normal });
      // Mover al jugador hacia el centro del laberinto para tener múltiples pasillos detrás
      const center = sim.maze.nearestWalkable([Math.floor(sim.maze.W / 2), Math.floor(sim.maze.H / 2)]);
      const cw = sim.maze.cellToWorld(center[0], center[1]);
      sim.player.x = cw.x;
      sim.player.z = cw.z;

      const shift = sim.tryMazeShift(true);
      expect(shift).not.toBeNull();
      if (!shift) continue;

      expect(sim.maze.ch(shift.closed[0], shift.closed[1])).toBe("#");
      expect(sim.maze.ch(shift.opened[0], shift.opened[1])).toBe(".");
      expect(sim.drainEvents().some((e) => e.type === "mazeShift")).toBe(true);

      // Verificar que absolutamente todas las celdas transitables sigan conectadas con el jugador
      const pCell = sim.maze.worldToCell(sim.player.x, sim.player.z);
      const df = sim.maze.distanceField([pCell]);
      for (let y = 0; y < sim.maze.H; y++) {
        for (let x = 0; x < sim.maze.W; x++) {
          const ch = sim.maze.ch(x, y);
          if (ch === "#" || ch === "S") continue;
          expect(df[y * sim.maze.W + x]).toBeLessThan(UNREACHABLE);
        }
      }
      // Y que todos los interruptores y escondites conserven su muro de soporte
      for (const s of sim.switches) {
        expect(sim.maze.ch(s.cell[0], s.cell[1])).toBe(".");
        expect(sim.maze.ch(s.cell[0] + s.wall[0], s.cell[1] + s.wall[1])).toBe("#");
      }
      for (const h of sim.hideSpots) {
        expect(sim.maze.ch(h.cell[0], h.cell[1])).toBe(".");
        expect(sim.maze.ch(h.cell[0] + h.wall[0], h.cell[1] + h.wall[1])).toBe("#");
      }
    }
  });

  it("escala la frecuencia de los eventos ambientales con la dificultad elegida", () => {
    const easySim = new Simulation({ level: CAMPAIGN[0], difficulty: DIFFICULTIES.easy });
    const normalSim = new Simulation({ level: CAMPAIGN[0], difficulty: DIFFICULTIES.normal });
    const nightmareSim = new Simulation({ level: CAMPAIGN[0], difficulty: DIFFICULTIES.nightmare });
    const oneLifeSim = new Simulation({ level: CAMPAIGN[0], difficulty: DIFFICULTIES.oneLife });

    expect(easySim.envScale).toBeLessThan(normalSim.envScale);
    expect(normalSim.envScale).toBeLessThan(nightmareSim.envScale);
    expect(nightmareSim.envScale).toBeLessThanOrEqual(oneLifeSim.envScale);
  });
});

// Director de sustos ambientales. Reparte eventos de terror con una cadencia controlada
// (dificultad, tension actual, opcion de sustos del usuario) para que sorprendan sin saturar.
//
// Eventos:
//   apparition  figura inmovil al fondo de un pasillo que desaparece si la miras o te acercas
//   behind      pasos y susurros a la espalda; si hay aparicion, se esfuma al girarte
//   blackout    apagon corto con ojos brillantes en la oscuridad
//   bang        golpe seco en una pared cercana
//   whisper     susurro muy cerca del oido
//   face        cara relampago a pantalla completa (solo sustos completos)
//   rush        una figura aparece al fondo, aguarda y se lanza hacia la camara (no letal)
//   peripheral  silueta en el borde del campo de vision que desaparece si la miras
//   falseAlarm  pasos y arrastres que se acercan y no traen nada
//   shadow      silueta negra que cruza un pasillo al fondo y se esfuma
//   eyes        un par de ojos en la oscuridad que parpadea y se acerca a saltos mientras no se le mire
//   glimpse     la cara de un fantasma durante unos fotogramas, tenue, casi subliminal
//
// Ritmo: calma larga -> silencio previo (el audio se atenua) -> golpe. El silencio es parte del susto.

import type { GameAudio } from "../audio/types";
import type { FaceKind } from "../gfx/faces";
import type { Simulation } from "../sim/simulation";
import type { GhostLike, GhostView } from "./ghostView";
import type { ScareSystem } from "./scare";
import type { CameraRig } from "./rig";
import type { EyesView } from "./eyesView";
import type { Settings } from "./settings";
import { CELL } from "../config/constants";

export interface DirectorHost {
  sim: Simulation;
  rig: CameraRig;
  audio: GameAudio;
  scare: ScareSystem;
  settings: () => Settings;
  tension: () => number;
  ambientScale: () => number;
  apparition: (kind: FaceKind) => GhostView;
  setLightsMul: (v: number) => void;
  hudMessage: (t: string) => void;
  /** 0..1: cuan dentro de una zona oscura esta el jugador. */
  darkness: () => number;
  eyes: EyesView;
}

type EventKind = "apparition" | "behind" | "blackout" | "bang" | "whisper" | "face" | "rush" | "peripheral" | "falseAlarm" | "shadow" | "eyes" | "glimpse";

interface Active {
  kind: EventKind;
  t: number;
  data: Record<string, number>;
  ghost?: FaceKind;
  fake?: GhostLike;
}

export class ScareDirector {
  private nextAt = 28;
  private clock = 0;
  private active: Active | null = null;
  private lookT = 0;
  private recent: EventKind[] = [];
  /** Aparicion visible ahora mismo (para que el Game la actualice/dibuje). */
  fake: { view: GhostView; g: GhostLike } | null = null;
  lightsMul = 1;

  constructor(private h: DirectorHost) {}

  /** Reinicia el temporizador (tras reaparecer o cambiar de nivel). */
  reset(grace = 26): void {
    this.endActive();
    this.clock = 0;
    this.nextAt = grace;
    this.lightsMul = 1;
    this.h.setLightsMul(1);
  }

  private endActive(): void {
    if (this.fake) { this.fake.view.setShadow(false); this.fake.view.group.visible = false; this.fake = null; }
    this.h.eyes.setAlpha(0);
    this.active = null;
    this.lightsMul = 1;
    this.h.setLightsMul(1);
  }

  private pickKind(): EventKind {
    const s = this.h.settings().scares;
    const dark = this.h.darkness() > 0.4 ? 2 : 1;
    const w: [EventKind, number][] = [
      ["apparition", 22], ["behind", 14 * dark], ["bang", 11], ["whisper", 11], ["peripheral", 14 * dark], ["falseAlarm", 14],
    ];
    if (s !== "reduced") w.push(["blackout", 12]);
    if (s === "full") w.push(["face", 6]);
    if (s !== "off") w.push(["rush", 9 * dark]);
    w.push(["shadow", 13 * dark], ["eyes", 12 * dark * (this.h.darkness() > 0.4 ? 1.5 : 1)]);
    if (s === "full") w.push(["glimpse", 9]);
    // evita repetir el mismo evento tres veces seguidas
    const filtered = w.filter(([k]) => !(this.recent.length >= 2 && this.recent[0] === k && this.recent[1] === k));
    const total = filtered.reduce((a, [, v]) => a + v, 0);
    let r = Math.random() * total;
    for (const [k, v] of filtered) { r -= v; if (r <= 0) return k; }
    return "bang";
  }

  update(dt: number): void {
    const sim = this.h.sim;
    this.clock += dt;
    if (this.active) { this.updateActive(dt); return; }
    if (this.clock < this.nextAt) return;
    // no interrumpir momentos de accion
    if (this.h.tension() > 0.55 || sim.player.invuln > 0 || sim.state !== "playing") { this.nextAt = this.clock + 4; return; }
    this.start(this.pickKind());
  }

  private schedule(): void {
    const scale = Math.max(0.2, this.h.ambientScale());
    this.nextAt = this.clock + (24 + Math.random() * 30) / scale;
  }

  private start(kind: EventKind): void {
    const { sim, audio } = this.h;
    const p = sim.player;
    this.recent.unshift(kind);
    this.recent.length = Math.min(this.recent.length, 3);
    const ghostKind = (Math.floor(Math.random() * 4)) as FaceKind;
    // silencio previo: el ambiente y la musica bajan antes de los sustos que se ven
    if (kind === "apparition" || kind === "rush" || kind === "face" || kind === "peripheral" || kind === "behind" || kind === "shadow" || kind === "eyes") audio.duck?.(0.12, 1.8);
    else if (kind === "falseAlarm") audio.duck?.(0.18, 3.2);
    switch (kind) {
      case "apparition": {
        const cell = this.findCell(8, 16, 0, 38);
        if (!cell) { this.nextAt = this.clock + 5; return; }
        this.begin({ kind, t: 0, data: { x: cell.x, z: cell.z, phase: 0 }, ghost: ghostKind });
        break;
      }
      case "behind": {
        const cell = this.findCell(3.5, 6, 150, 180);
        const withApp = !!cell && Math.random() < 0.55;
        this.begin({ kind, t: 0, data: { x: cell?.x ?? p.x, z: cell?.z ?? p.z, app: withApp ? 1 : 0, shown: 0 }, ghost: ghostKind });
        const [bx, bz] = this.behindVec();
        audio.playFootsteps(p.x + bx * 4, 0.1, p.z + bz * 4);
        break;
      }
      case "blackout":
        this.begin({ kind, t: 0, data: { dur: 2.2 + Math.random() * 1.3 }, ghost: ghostKind });
        audio.playBlackout(false);
        break;
      case "bang": {
        const a = Math.random() * Math.PI * 2, d = 6 + Math.random() * 6;
        audio.playBang(p.x + Math.cos(a) * d, 1.2, p.z + Math.sin(a) * d);
        this.h.rig.addTrauma(0.3);
        this.begin({ kind, t: 0, data: { flick: 1 } });
        break;
      }
      case "whisper": {
        const side = Math.random() < 0.5 ? -1 : 1;
        const [fx, fz] = p.forwardVec();
        const [rx, rz] = p.rightVec();
        audio.playWhisper(p.x + rx * side * 0.9 - fx * 0.3, 0.9, p.z + rz * side * 0.9 - fz * 0.3);
        this.begin({ kind, t: 0, data: {} });
        break;
      }
      case "face":
        this.begin({ kind, t: 0, data: { fired: 0 }, ghost: ghostKind });
        break;
      case "rush": {
        const cell = this.findCell(9, 15, 0, 28);
        if (!cell) { this.nextAt = this.clock + 5; audio.duck?.(1, 0.1); return; }
        this.begin({ kind, t: 0, data: { x: cell.x, z: cell.z, phase: 0 }, ghost: ghostKind });
        break;
      }
      case "peripheral": {
        const cell = this.findCell(7, 13, 42, 78);
        if (!cell) { this.nextAt = this.clock + 5; audio.duck?.(1, 0.1); return; }
        this.begin({ kind, t: 0, data: { x: cell.x, z: cell.z, seen: 0 }, ghost: ghostKind });
        break;
      }
      case "falseAlarm": {
        const [bx, bz] = this.behindVec();
        audio.playFootsteps(p.x + bx * 7, 0.1, p.z + bz * 7);
        this.begin({ kind, t: 0, data: { scrape: 0 } });
        break;
      }
      case "shadow": {
        // una celda visible delante y un vecino abierto hacia el que cruza (de lado a lado del pasillo)
        const cell = this.findCell(8, 15, 0, 34);
        const dir = cell ? this.openNeighbour(cell.x, cell.z) : null;
        if (!cell || !dir) { this.nextAt = this.clock + 5; audio.duck?.(1, 0.1); return; }
        this.begin({ kind, t: 0, data: { x: cell.x, z: cell.z, dx: dir[0], dz: dir[1], phase: 0 }, ghost: ghostKind });
        break;
      }
      case "eyes": {
        const cell = this.findCell(9, 15, 0, 30);
        if (!cell) { this.nextAt = this.clock + 5; audio.duck?.(1, 0.1); return; }
        this.begin({ kind, t: 0, data: { x: cell.x, z: cell.z, hops: 0, phase: 0, seen: 0 }, ghost: ghostKind });
        break;
      }
      case "glimpse":
        this.begin({ kind, t: 0, data: { fired: 0, n: 0 }, ghost: ghostKind });
        break;
    }
  }

  private begin(a: Active): void {
    this.active = a;
    this.lookT = 0;
  }

  private behindVec(): [number, number] {
    const [fx, fz] = this.h.sim.player.forwardVec();
    return [-fx, -fz];
  }

  /** Busca una celda con linea de vision, a cierta distancia y con un angulo (en grados) entre minAng y maxAng respecto a la vista. */
  private findCell(minD: number, maxD: number, minAng: number, maxAng: number): { x: number; z: number } | null {
    const { sim } = this.h;
    const m = sim.maze, p = sim.player;
    const [fx, fz] = p.forwardVec();
    const cands: { x: number; z: number }[] = [];
    const [pcx, pcy] = m.worldToCell(p.x, p.z);
    const R = Math.ceil(maxD / CELL) + 1;
    for (let cy = pcy - R; cy <= pcy + R; cy++) {
      for (let cx = pcx - R; cx <= pcx + R; cx++) {
        if (!m.inBounds(cx, cy) || !m.isWalkable(cx, cy)) continue;
        const w = m.cellToWorld(cx, cy);
        const dx = w.x - p.x, dz = w.z - p.z, d = Math.hypot(dx, dz);
        if (d < minD || d > maxD) continue;
        const dot = (fx * dx + fz * dz) / d;
        const ang = (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI;
        if (ang < minAng || ang > maxAng) continue;
        if (!m.rayClear(p.x, p.z, w.x, w.z)) continue;
        // no sobre un fantasma real
        if (sim.ghosts.some((g) => g.mode !== "dormant" && Math.hypot(g.x - w.x, g.z - w.z) < 3)) continue;
        cands.push(w);
      }
    }
    return cands.length ? cands[Math.floor(Math.random() * cands.length)] : null;
  }

  private angleToward(x: number, z: number): { deg: number; dist: number } {
    const p = this.h.sim.player;
    const [fx, fz] = p.forwardVec();
    const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz) || 1;
    const dot = (fx * dx + fz * dz) / d;
    return { deg: (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI, dist: d };
  }

  /** Direccion cardinal (en mundo) hacia una celda vecina abierta y lateral a la linea de vision. */
  private openNeighbour(x: number, z: number): [number, number] | null {
    const m = this.h.sim.maze, p = this.h.sim.player;
    const [cx, cy] = m.worldToCell(x, z);
    const vx = x - p.x, vz = z - p.z, vl = Math.hypot(vx, vz) || 1;
    let best: [number, number] | null = null, bestScore = 0.35; // exige un cruce claramente lateral
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      if (!m.inBounds(cx + dx, cy + dy) || !m.isWalkable(cx + dx, cy + dy)) continue;
      const lateral = 1 - Math.abs((vx * dx + vz * dy) / vl);
      if (lateral > bestScore) { bestScore = lateral; best = [dx, dy]; }
    }
    return best;
  }

  private show(kind: FaceKind, x: number, z: number, shadow = false): void {
    const view = this.h.apparition(kind);
    view.setShadow(shadow);
    const g: GhostLike = { mode: "chase", x, z, yaw: 0, startled: false, frozen: true };
    view.group.visible = true;
    this.fake = { view, g };
  }

  private hide(): void {
    if (this.fake) { this.fake.view.setShadow(false); this.fake.view.group.visible = false; this.fake = null; }
  }

  private updateActive(dt: number): void {
    const a = this.active!;
    a.t += dt;
    const { audio } = this.h;
    const p = this.h.sim.player;
    switch (a.kind) {
      case "apparition": {
        const x = a.data.x, z = a.data.z;
        if (a.data.phase === 0) {
          // parpadeo de luces y aparicion en un instante de oscuridad
          const f = Math.sin(a.t * 70) > 0 ? 1 : 0.05;
          this.setMul(f);
          if (a.t > 0.28) {
            a.data.phase = 1; a.t = 0;
            this.setMul(1);
            this.show(a.ghost!, x, z);
            audio.playStinger(0.5);
          }
        } else if (this.fake) {
          const { deg, dist } = this.angleToward(x, z);
          this.fake.view.setGhostly(0.55 + 0.25 * Math.sin(a.t * 17) * Math.sin(a.t * 5));
          this.fake.g.yaw = Math.atan2(p.x - x, p.z - z);
          if (deg < 14) this.lookT += dt; else this.lookT = 0;
          if (a.t > 2.6 || dist < 6 || this.lookT > 0.55) {
            // desaparece con un apagon fugaz
            this.hide();
            this.setMul(0.05);
            audio.playWhisper(x, 1.4, z);
            a.data.phase = 2; a.t = 0;
          }
        } else if (a.t > 0.22) { this.setMul(1); this.finish(); }
        break;
      }
      case "behind": {
        const x = a.data.x, z = a.data.z;
        if (a.data.app && !a.data.shown && a.t > 1.4) {
          // los pasos cesan y aparece algo justo detras
          a.data.shown = 1;
          this.show(a.ghost!, x, z);
          audio.playStinger(0.35);
          this.h.rig.addTrauma(0.12);
        }
        if (this.fake) {
          const { deg } = this.angleToward(x, z);
          this.fake.view.setGhostly(0.6);
          this.fake.g.yaw = Math.atan2(p.x - x, p.z - z);
          if (deg < 80) { this.hide(); audio.playStinger(0.9); this.h.rig.addTrauma(0.4); this.setMul(0.1); a.data.hid = 1; a.t = 4.2; }
          else if (a.t > 6) this.finish();
        } else if (a.t > 3.2 + (a.data.app ? 3 : 0)) this.finish();
        if (a.data.hid && a.t > 4.4) { this.setMul(1); this.finish(); }
        break;
      }
      case "blackout": {
        const dur = a.data.dur;
        if (a.t < 0.2) this.setMul(Math.sin(a.t * 90) > 0 ? 0.8 : 0.1);
        else if (a.t < dur) this.setMul(0);
        else if (a.t < dur + 0.35) this.setMul(Math.sin(a.t * 60) > 0 ? 1 : 0.05);
        else { this.setMul(1); audio.playBlackout(true); this.finish(); }
        break;
      }
      case "face": {
        // 0,7 s de silencio y entonces el destello (con golpe y grito momentaneo sincronizados)
        if (!a.data.fired && a.t > 0.7) {
          a.data.fired = 1;
          this.h.scare.flashFace(a.ghost!, 0.3);
          audio.playScareHit(1.25);
        }
        if (a.t > 1.3) this.finish();
        break;
      }
      case "rush": {
        const x = a.data.x, z = a.data.z;
        if (a.data.phase === 0) {
          this.setMul(Math.sin(a.t * 80) > 0 ? 1 : 0.04);
          if (a.t > 0.45) {
            a.data.phase = 1; a.t = 0;
            this.setMul(0.35);
            this.show(a.ghost!, x, z);
            audio.playStinger(0.4);
          }
        } else if (a.data.phase === 1 && this.fake) {
          // espera inmovil, mirandote; se oye una respiracion lenta
          this.fake.view.setGhostly(0.8);
          this.fake.g.yaw = Math.atan2(p.x - this.fake.g.x, p.z - this.fake.g.z);
          if (a.t > 0.7 + (a.data.hold ?? 0.5)) { a.data.phase = 2; a.t = 0; audio.playScareHit(0.5); }
        } else if (a.data.phase === 2 && this.fake) {
          // embestida en linea recta hacia la camara
          const g = this.fake.g;
          const dx = p.x - g.x, dz = p.z - g.z, d = Math.hypot(dx, dz) || 1;
          const step = Math.min(d, 17 * dt);
          g.x += (dx / d) * step; g.z += (dz / d) * step;
          g.yaw = Math.atan2(dx, dz);
          this.fake.view.setGhostly(1);
          if (d < 1.4 || a.t > 1.4) {
            this.hide();
            this.h.scare.flashFace(a.ghost!, 0.22);
            audio.playScareHit(1.1);
            this.h.rig.addTrauma(0.85);
            this.setMul(0.05);
            a.data.phase = 3; a.t = 0;
          }
        } else if (a.data.phase === 3) {
          if (a.t > 0.5) { this.setMul(1); this.finish(); }
        } else if (a.t > 4) { this.setMul(1); this.finish(); }
        break;
      }
      case "peripheral": {
        const x = a.data.x, z = a.data.z;
        if (!this.fake && !a.data.shown) {
          if (a.t > 0.6) { a.data.shown = 1; this.show(a.ghost!, x, z); this.fake!.view.setGhostly(0.5); }
        } else if (this.fake) {
          const { deg, dist } = this.angleToward(x, z);
          this.fake.g.yaw = Math.atan2(p.x - x, p.z - z);
          this.fake.view.setGhostly(0.45 + 0.1 * Math.sin(a.t * 3));
          // al mirarla (o acercarte) se esfuma sin ruido... y luego un susurro justo a tu oido
          if (deg < 24) this.lookT += dt; else this.lookT = 0;
          if (this.lookT > 0.3 || dist < 3.5 || a.t > 9) {
            this.hide();
            if (this.lookT > 0.3) { this.setMul(0.2); audio.playWhisper(p.x + 0.2, 0.9, p.z); }
            a.data.gone = 1; a.t = 0;
          }
        } else if (a.data.gone) {
          if (a.t > 0.3) { this.setMul(1); this.finish(); }
        } else if (a.t > 3) this.finish();
        break;
      }
      case "falseAlarm": {
        if (!a.data.scrape && a.t > 2.2) { a.data.scrape = 1; audio.playDread?.("scrape"); }
        if (a.t > 3.2) this.finish();
        break;
      }
      case "shadow": {
        const sx = a.data.x, sz = a.data.z;
        if (a.data.phase === 0) {
          // una luz titila y la silueta ya esta ahi
          this.setMul(Math.sin(a.t * 60) > 0 ? 1 : 0.12);
          if (a.t > 0.3) {
            a.data.phase = 1; a.t = 0; this.setMul(0.6);
            this.show(a.ghost!, sx, sz, true);
            this.fake!.view.setGhostly(0.95);
            audio.playFootsteps(sx, 0.1, sz);
          }
        } else if (a.data.phase === 1 && this.fake) {
          // cruza una celda a paso lento, sin mirar, y se esfuma al llegar al otro lado
          const g = this.fake.g;
          const sp = 2.6 * dt;
          g.x += a.data.dx * sp; g.z += a.data.dz * sp;
          g.yaw = Math.atan2(a.data.dx, a.data.dz);
          this.h.eyes.place(g.x, this.fake.view.faceY, g.z, p.x, p.z, a.ghost!);
          this.h.eyes.setAlpha(1);
          const { deg, dist } = this.angleToward(g.x, g.z);
          if (deg < 12) this.lookT += dt; else this.lookT = 0;
          const crossed = Math.hypot(g.x - sx, g.z - sz) >= CELL * 0.98;
          const blocked = !this.h.sim.maze.rayClear(p.x, p.z, g.x, g.z);
          if (crossed || blocked || dist < 4 || this.lookT > 0.9 || a.t > 3.4) {
            this.hide();
            this.h.eyes.setAlpha(0);
            this.setMul(0.08);
            a.data.phase = 2; a.t = 0;
          }
        } else if (a.t > 0.25) { this.setMul(1); this.finish(); }
        break;
      }
      case "eyes": {
        const E = this.h.eyes;
        const x = a.data.x, z = a.data.z;
        if (a.data.phase === 0) {
          // los ojos se abren de golpe en la oscuridad
          E.place(x, 1.12, z, p.x, p.z, a.ghost!);
          E.setAlpha(Math.min(1, a.t / 0.35));
          if (a.t > 0.5) { a.data.phase = 1; a.t = 0; audio.playDread?.("inhale"); }
        } else if (a.data.phase === 1) {
          const { deg, dist } = this.angleToward(E.group.position.x, E.group.position.z);
          // parpadean de vez en cuando; si se les mira fijamente, se cierran y reaparecen mas cerca
          const blink = Math.sin(a.t * 2.3) > 0.97 || (a.t % 1.6) > 1.53 ? 0 : 1;
          E.setAlpha(blink);
          if (deg < 18) a.data.seen += dt; else a.data.seen = Math.max(0, a.data.seen - dt * 0.5);
          if (dist < 4.2 || a.t > 7) { E.setAlpha(0); audio.playWhisper(p.x + 0.3, 0.9, p.z); a.data.phase = 3; a.t = 0; }
          else if (a.data.seen > 0.9 && a.data.hops < 3) {
            // salto: se cierran un instante y vuelven 2,2 u mas cerca
            E.setAlpha(0);
            const dx = p.x - E.group.position.x, dz = p.z - E.group.position.z, d = Math.hypot(dx, dz) || 1;
            a.data.x = E.group.position.x + (dx / d) * 2.2; a.data.z = E.group.position.z + (dz / d) * 2.2;
            a.data.hops += 1; a.data.seen = 0; a.data.phase = 2; a.t = 0;
          }
        } else if (a.data.phase === 2) {
          if (a.t > 0.28) {
            E.place(a.data.x, 1.12, a.data.z, p.x, p.z, a.ghost!);
            E.setAlpha(1);
            audio.playScareHit(0.25 + a.data.hops * 0.15);
            a.data.phase = 1; a.t = 0;
          }
        } else if (a.t > 0.4) { this.finish(); }
        break;
      }
      case "glimpse": {
        // Destello fugaz de la cara de un fantasma de la nada con un golpe sonoro fuerte y momentaneo
        if (a.t > 0.45 + a.data.n * 0.72 && a.data.n < 2) {
          a.data.n += 1;
          this.h.scare.flashFace(a.ghost!, 0.16, 0.22);
          audio.playScareHit(0.95);
        }
        if (a.t > 2.1) this.finish();
        break;
      }
      case "bang":
        if (a.t < 0.7) this.setMul(Math.sin(a.t * 55) > 0.2 ? 1 : 0.15);
        else { this.setMul(1); this.finish(); }
        break;
      default:
        if (a.t > 0.5) this.finish();
        break;
    }
  }

  private setMul(v: number): void {
    this.lightsMul = v;
    this.h.setLightsMul(v);
  }

  private finish(): void {
    this.endActive();
    this.schedule();
  }

  /** Para eventos que deben cortarse (muerte, victoria, pausa larga). */
  cancel(): void { this.endActive(); this.schedule(); }

  dispose(): void { this.endActive(); }

  /** Vector auxiliar para depuracion. */
  debugTrigger(kind: EventKind): void { this.endActive(); this.start(kind); }
  get debugActive(): string | null { return this.active?.kind ?? null; }
}


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
//
// Ritmo: calma larga -> silencio previo (el audio se atenua) -> golpe. El silencio es parte del susto.

import type { GameAudio } from "../audio/types";
import type { FaceKind } from "../gfx/faces";
import type { Simulation } from "../sim/simulation";
import type { GhostLike, GhostView } from "./ghostView";
import type { ScareSystem } from "./scare";
import type { CameraRig } from "./rig";
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
}

type EventKind = "apparition" | "behind" | "blackout" | "bang" | "whisper" | "face" | "rush" | "peripheral" | "falseAlarm";

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
    if (this.fake) { this.fake.view.group.visible = false; this.fake = null; }
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
    if (kind === "apparition" || kind === "rush" || kind === "face" || kind === "peripheral" || kind === "behind") audio.duck?.(0.12, 1.8);
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

  private show(kind: FaceKind, x: number, z: number): void {
    const view = this.h.apparition(kind);
    const g: GhostLike = { mode: "chase", x, z, yaw: 0, startled: false, frozen: true };
    view.group.visible = true;
    this.fake = { view, g };
  }

  private hide(): void {
    if (this.fake) { this.fake.view.group.visible = false; this.fake = null; }
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
        // 0,7 s de silencio y entonces el destello (con golpe y grito sincronizados)
        if (!a.data.fired && a.t > 0.7) {
          a.data.fired = 1;
          this.h.scare.flashFace(a.ghost!, 0.3);
          audio.playScareHit(0.9);
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


// Sustos: secuencia de muerte (el fantasma salta a la camara + cara a pantalla completa) y
// screamers de destello (cara fugaz a pantalla completa).

import * as THREE from "three";
import type { GameAudio } from "../audio/types";
import { drawGhostFace, FACE_COLORS, type FaceKind } from "../gfx/faces";
import { makeCanvas } from "../gfx/texkit";
import type { FxState } from "./postfx";
import type { GhostView } from "./ghostView";
import type { CameraRig } from "./rig";
import type { ScareLevel } from "./settings";

export interface ScareDeps {
  rig: CameraRig;
  audio: GameAudio;
  canvas: HTMLCanvasElement; // lienzo 2D superpuesto
  fx: FxState;
  flashHud: (color: string, opacity: number, seconds: number) => void;
}

const DEATH_LEN = 2.5;

export class ScareSystem {
  private faces = new Map<number, HTMLCanvasElement>();
  private ctx: CanvasRenderingContext2D;
  private deathT = -1;
  private deathKind: FaceKind = 0;
  private ghostView: GhostView | null = null;
  private eye = new THREE.Vector3();
  private startTarget = new THREE.Vector3();
  private headTarget = new THREE.Vector3();
  private flashT = -1;
  private flashLen = 0;
  private flashKind: FaceKind = 0;
  private flashSeed = 0;
  level: ScareLevel = "full";

  constructor(private d: ScareDeps) {
    this.ctx = d.canvas.getContext("2d")!;
  }

  private face(kind: FaceKind): HTMLCanvasElement {
    let c = this.faces.get(kind);
    if (!c) {
      const m = makeCanvas(1024, 1024);
      drawGhostFace(m.ctx, kind, "scream", 1024, false);
      // vineteado oscuro en los bordes para fundir con el negro
      const g = m.ctx.createRadialGradient(512, 512, 300, 512, 512, 760);
      g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,0.95)");
      m.ctx.fillStyle = g; m.ctx.fillRect(0, 0, 1024, 1024);
      c = m.c;
      this.faces.set(kind, c);
    }
    return c;
  }

  get deathRunning(): boolean { return this.deathT >= 0; }

  private resize(): void {
    const c = this.d.canvas;
    const w = c.clientWidth || window.innerWidth, h = c.clientHeight || window.innerHeight;
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  }

  startDeath(kind: FaceKind, view: GhostView, eye: THREE.Vector3, forward: THREE.Vector3): void {
    this.deathT = 0;
    this.deathKind = kind;
    this.ghostView = view;
    this.eye.copy(eye);
    this.startTarget.copy(eye).addScaledVector(forward, 3);
    this.headTarget.set(view.group.position.x, view.faceY + 0.1, view.group.position.z);
    view.forceScream();
    this.d.audio.playDeathScream(kind);
    this.d.rig.override = { pos: this.eye.clone(), target: this.startTarget.clone(), fov: 78, roll: 0 };
    this.resize();
  }

  /** Avanza la secuencia de muerte. Devuelve true al terminar. */
  updateDeath(dt: number): boolean {
    if (this.deathT < 0) return false;
    this.deathT += dt;
    const t = this.deathT;
    const o = this.d.rig.override!;
    const fx = this.d.fx;
    const view = this.ghostView!;
    const toHead = new THREE.Vector3().subVectors(this.headTarget, this.eye);
    const dist = toHead.length();
    const dir = toHead.clone().normalize();

    // 1) giro hacia el fantasma; 2) la cara se abalanza hasta llenar la pantalla
    const turn = Math.min(1, t / 0.14);
    const lunge = Math.max(0, Math.min(1, (t - 0.08) / 0.34));
    const ease = lunge * lunge * (3 - 2 * lunge);
    const endDist = 0.58; // distancia final de la superficie de la cara a la lente
    const curDist = dist + (endDist - dist) * ease;
    const faceNow = this.eye.clone().addScaledVector(dir, curDist);
    o.target.lerpVectors(this.startTarget, faceNow, turn * turn * (3 - 2 * turn));
    const sc = 1 + ease * 0.2;
    const hx = dir.x, hz = dir.z, hl = Math.hypot(hx, hz) || 1;
    // el fantasma mira a la camara; su cara esta ~0.48 por delante de su eje
    view.group.rotation.y = Math.atan2(-hx / hl, -hz / hl);
    view.group.scale.setScalar(sc);
    view.group.position.set(faceNow.x + (hx / hl) * 0.48 * sc, faceNow.y - view.faceY * sc, faceNow.z + (hz / hl) * 0.48 * sc);
    o.fov = 78 - 14 * Math.min(1, t / 0.14);
    o.roll = Math.sin(t * 38) * 0.04 * ease;
    this.d.rig.trauma = Math.min(1, 0.6 + ease * 0.6);
    fx.glitch = 0.5 + ease * 1.0;
    fx.aberration = 0.4 + ease * 0.8;

    // 3) la cara 3D llena la pantalla; la cara 2D solo destella dos veces (estroboscopio)
    this.resize();
    const c = this.d.canvas, ctx = this.ctx;
    ctx.clearRect(0, 0, c.width, c.height);
    c.style.opacity = "0";
    if (t >= 0.44 && t < 0.5) fx.flash = Math.max(fx.flash, 0.85 - (t - 0.44) * 12);
    const strobeA = t >= 0.55 && t < 0.68, strobeB = t >= 0.86 && t < 0.97;
    if ((strobeA || strobeB) && this.level !== "off") {
      const f = this.face(this.deathKind);
      const s = Math.max(c.width, c.height) * (1.05 + (t - 0.55) * 0.4);
      const jx = (Math.random() - 0.5) * 40, jy = (Math.random() - 0.5) * 40;
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(f, (c.width - s) / 2 + jx, (c.height - s) / 2 + jy, s, s);
      ctx.globalCompositeOperation = "multiply";
      ctx.fillStyle = `rgba(255,${40 + Math.random() * 60},${40 + Math.random() * 60},1)`; ctx.fillRect(0, 0, c.width, c.height);
      ctx.globalCompositeOperation = "source-over";
      // ruido de grano
      for (let i = 0; i < 260; i++) { ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.25})`; ctx.fillRect(Math.random() * c.width, Math.random() * c.height, 2 + Math.random() * 10, 1 + Math.random() * 2); }
      c.style.opacity = "1";
    }
    if (t >= 1.15) {
      const k = Math.min(1, (t - 1.15) / 0.9);
      fx.staticNoise = 0.9 * (1 - k * 0.5);
      fx.blackout = k * k;
    }
    if (t >= DEATH_LEN) {
      this.endDeath();
      return true;
    }
    return false;
  }

  /** Cierra la secuencia y restaura el estado visual. */
  endDeath(): void {
    this.deathT = -1;
    this.d.rig.override = null;
    const c = this.d.canvas;
    c.style.opacity = "0";
    this.ctx.clearRect(0, 0, c.width, c.height);
    this.ghostView = null;
  }

  // ------------------- screamers de destello -------------------

  /** Cara fugaz a pantalla completa (susto ambiental). */
  flashFace(kind: FaceKind, seconds = 0.28): void {
    if (this.level === "off" || this.deathRunning) return;
    this.flashT = 0;
    this.flashLen = this.level === "reduced" ? Math.min(seconds, 0.16) : seconds;
    this.flashKind = kind;
    this.flashSeed = Math.random() * 1000;
    this.d.audio.playScreamerFlash();
    this.d.rig.addTrauma(0.5);
    this.resize();
  }

  updateFlash(dt: number): void {
    if (this.flashT < 0) return;
    this.flashT += dt;
    const c = this.d.canvas, ctx = this.ctx;
    const t = this.flashT;
    if (t >= this.flashLen) {
      this.flashT = -1;
      c.style.opacity = "0";
      ctx.clearRect(0, 0, c.width, c.height);
      return;
    }
    this.resize();
    const k = t / this.flashLen;
    const f = this.face(this.flashKind);
    const s = Math.max(c.width, c.height) * (0.85 + k * 0.4);
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, c.width, c.height);
    if (this.level === "full" || Math.floor(k * 4) % 2 === 0) {
      ctx.globalAlpha = 0.65 + 0.35 * Math.sin(this.flashSeed + t * 90);
      ctx.drawImage(f, (c.width - s) / 2 + (Math.random() - 0.5) * 24, (c.height - s) / 2 + (Math.random() - 0.5) * 24, s, s);
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = `${FACE_COLORS[this.flashKind].css}22`;
    ctx.fillRect(0, 0, c.width, c.height);
    c.style.opacity = "1";
    this.d.fx.glitch = Math.max(this.d.fx.glitch, 1.0);
    this.d.fx.aberration = Math.max(this.d.fx.aberration, 0.7);
  }

  dispose(): void { this.faces.clear(); }
}

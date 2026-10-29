// Sustos: secuencia de muerte (el fantasma salta a la camara + cara a pantalla completa) y
// screamers de destello (cara fugaz a pantalla completa).

import * as THREE from "three";
import type { GameAudio } from "../audio/types";
import { drawGhostFace, FACE_COLORS, type FaceKind } from "../gfx/faces";
import { fbmField, hash2 } from "../gfx/noise";
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

type ScareVariant = "full" | "mouth" | "eyes" | "neg";

/** Dibuja un fotograma de screamer: cara recortada/ampliada, giro, tinte, tiras desplazadas, regueros de sangre y grano. */
function drawScreamFrame(
  ctx: CanvasRenderingContext2D, w: number, h: number, face: HTMLCanvasElement,
  variant: ScareVariant, zoom: number, seed: number,
): void {
  const rn = (i: number) => hash2(i, seed, 17);
  ctx.save();
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);
  const base = Math.max(w, h) * zoom;
  ctx.translate(w / 2 + (rn(1) - 0.5) * 46, h / 2 + (rn(2) - 0.5) * 46);
  ctx.rotate((rn(3) - 0.5) * 0.14);
  // recorte segun la variante (la cara ocupa un lienzo cuadrado; boca abajo, ojos arriba)
  let sx = 0, sy = 0, sw = face.width, sh = face.height, k = 1;
  if (variant === "mouth") { sx = face.width * 0.12; sy = face.height * 0.42; sw = face.width * 0.76; sh = face.height * 0.58; k = 1.5; }
  else if (variant === "eyes") { sx = face.width * 0.1; sy = face.height * 0.05; sw = face.width * 0.8; sh = face.height * 0.5; k = 1.4; }
  const dw = base * k * (sw / face.width), dh = base * k * (sh / face.height);
  ctx.drawImage(face, sx, sy, sw, sh, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();

  // tinte: rojo sucio o negativo
  if (variant === "neg") {
    ctx.globalCompositeOperation = "difference";
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "source-over";
  } else {
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = `rgb(255,${60 + rn(4) * 70},${50 + rn(5) * 60})`;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "source-over";
  }

  // tiras desplazadas (corte de senal)
  const strips = 7 + Math.floor(rn(6) * 8);
  for (let i = 0; i < strips; i++) {
    const y = rn(10 + i) * h, hh = 6 + rn(30 + i) * h * 0.09, dx = (rn(50 + i) - 0.5) * w * 0.12;
    ctx.drawImage(ctx.canvas, 0, y, w, hh, dx, y, w, hh);
  }

  // regueros de sangre desde los bordes
  ctx.save();
  ctx.lineCap = "round";
  for (let i = 0; i < 9; i++) {
    const side = i % 4;
    let x = side === 0 ? rn(70 + i) * w : side === 1 ? 0 : side === 2 ? rn(70 + i) * w : w;
    let y = side === 0 ? 0 : side === 1 ? rn(80 + i) * h : side === 2 ? h : rn(80 + i) * h;
    ctx.strokeStyle = `rgba(${90 + rn(90 + i) * 70},0,0,${0.35 + rn(100 + i) * 0.4})`;
    ctx.lineWidth = 3 + rn(110 + i) * 14;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const tx = w / 2 - x, ty = h / 2 - y, len = Math.hypot(tx, ty) || 1;
    for (let j = 0; j < 5; j++) {
      x += (tx / len) * (w * 0.06) + (rn(120 + i * 7 + j) - 0.5) * 40;
      y += (ty / len) * (h * 0.06) + (rn(130 + i * 7 + j) - 0.5) * 40;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();

  // vineteado y grano
  const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
  vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.85)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 340; i++) {
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.3})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 12, 1 + Math.random() * 2);
  }
}

/** Secuencia de fotogramas del susto de muerte (segundos desde el inicio, variante, zoom). */
const DEATH_FRAMES: { a: number; b: number; v: ScareVariant; z: number }[] = [
  { a: 0.5, b: 0.54, v: "full", z: 1.05 },
  { a: 0.54, b: 0.575, v: "mouth", z: 1.0 },
  { a: 0.575, b: 0.61, v: "neg", z: 1.12 },
  { a: 0.61, b: 0.69, v: "full", z: 1.3 },
  { a: 0.86, b: 0.89, v: "eyes", z: 1.0 },
  { a: 0.89, b: 0.93, v: "mouth", z: 1.25 },
  { a: 0.93, b: 1.0, v: "full", z: 1.55 },
];


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
  private lastFrame = -1;
  private frameSeed = 0;
  level: ScareLevel = "full";

  constructor(private d: ScareDeps) {
    this.ctx = d.canvas.getContext("2d")!;
  }

  private face(kind: FaceKind): HTMLCanvasElement {
    let c = this.faces.get(kind);
    if (!c) {
      const m = makeCanvas(1024, 1024);
      drawGhostFace(m.ctx, kind, "scream", 1024, false);
      // textura de piel sucia: moteado en "overlay" + manchas oscuras en "multiply" para romper el aspecto vectorial
      const N = 512;
      const mott = fbmField(N, N, 7, 7, 5, 300 + kind);
      const fine = fbmField(N, N, 40, 40, 3, 340 + kind);
      const noise = makeCanvas(N, N);
      const img = noise.ctx.createImageData(N, N);
      for (let i = 0; i < N * N; i++) {
        const v = Math.max(0, Math.min(1, (mott[i] - 0.5) * 1.9 + 0.5 + (fine[i] - 0.5) * 0.5));
        const g = Math.round(v * 255);
        img.data[i * 4] = g; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = g; img.data[i * 4 + 3] = 255;
      }
      noise.ctx.putImageData(img, 0, 0);
      m.ctx.globalCompositeOperation = "overlay";
      m.ctx.globalAlpha = 0.75;
      m.ctx.drawImage(noise.c, 0, 0, 1024, 1024);
      m.ctx.globalAlpha = 1;
      m.ctx.globalCompositeOperation = "multiply";
      const dark = m.ctx.createRadialGradient(512, 560, 120, 512, 560, 620);
      dark.addColorStop(0, "rgba(255,255,255,1)"); dark.addColorStop(0.7, "rgba(200,170,160,1)"); dark.addColorStop(1, "rgba(60,30,30,1)");
      m.ctx.fillStyle = dark;
      m.ctx.fillRect(0, 0, 1024, 1024);
      m.ctx.globalCompositeOperation = "source-over";
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
    const fr = DEATH_FRAMES.findIndex((f) => t >= f.a && t < f.b);
    if (fr >= 0 && this.level !== "off") {
      const f = DEATH_FRAMES[fr];
      if (fr !== this.lastFrame) {
        this.lastFrame = fr;
        if (fr === 0 || fr === 4) this.d.audio.playScareHit(fr === 0 ? 1 : 1.2);
        this.frameSeed = Math.floor(Math.random() * 1e6);
      }
      drawScreamFrame(ctx, c.width, c.height, this.face(this.deathKind), f.v, f.z + (t - f.a) * 0.5, this.frameSeed + Math.floor(t * 60));
      c.style.opacity = "1";
      c.style.transform = `translate(${((Math.random() - 0.5) * 26).toFixed(1)}px, ${((Math.random() - 0.5) * 26).toFixed(1)}px) scale(1.04)`;
    } else {
      this.lastFrame = -1;
      c.style.transform = "";
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
    c.style.transform = "";
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
      c.style.transform = "";
      ctx.clearRect(0, 0, c.width, c.height);
      return;
    }
    this.resize();
    const k = t / this.flashLen;
    const f = this.face(this.flashKind);
    const variants: ScareVariant[] = ["full", "mouth", "eyes", "full"];
    const idx = Math.min(3, Math.floor(k * 4));
    if (this.level === "full" || idx % 2 === 0) {
      drawScreamFrame(ctx, c.width, c.height, f, variants[idx], 0.9 + k * 0.5, Math.floor(this.flashSeed * 1000) + Math.floor(t * 60));
    } else {
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, c.width, c.height);
    }
    ctx.fillStyle = `${FACE_COLORS[this.flashKind].css}22`;
    ctx.fillRect(0, 0, c.width, c.height);
    c.style.opacity = "1";
    c.style.transform = `translate(${((Math.random() - 0.5) * 18).toFixed(1)}px, ${((Math.random() - 0.5) * 18).toFixed(1)}px) scale(1.03)`;
    this.d.fx.glitch = Math.max(this.d.fx.glitch, 1.0);
    this.d.fx.aberration = Math.max(this.d.fx.aberration, 0.7);
  }

  dispose(): void { this.faces.clear(); }
}

// Sustos: secuencia de muerte (el fantasma salta a la camara + cara a pantalla completa) y
// screamers de destello (cara fugaz a pantalla completa).

import * as THREE from "three";
import type { GameAudio } from "../audio/types";
import type { FaceKind } from "../gfx/faces";
import { hash2 } from "../gfx/noise";
import type { FxState } from "./postfx";
import type { GhostView } from "./ghostView";
import type { CameraRig } from "./rig";
import { preloadScreamImages, screamImage } from "./screamImages";
import type { ScareLevel } from "./settings";

export interface ScareDeps {
  rig: CameraRig;
  audio: GameAudio;
  canvas: HTMLCanvasElement; // lienzo 2D superpuesto
  fx: FxState;
  flashHud: (color: string, opacity: number, seconds: number) => void;
}

/** Duracion de la secuencia de muerte con sustos completos: el grito dura unos 5 s y el final es negro. */
const DEATH_LEN_FULL = 6.0;
/** Con los sustos desactivados la muerte es solo el oscurecimiento. */
const DEATH_LEN_OFF = 2.6;

const smooth = (a: number, b: number, t: number): number => {
  const k = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

interface FrameOpts {
  zoom: number;
  seed: number;
  /** 0..1: intensidad de la sacudida y el corte de senal. */
  violence: number;
  /** 0..1: el negro que va cubriendo la imagen. */
  dark: number;
  /** 0..1: los parpados que se cierran (1 = cerrados). */
  lids: number;
  /** Rojo sucio sobre la imagen (0 = ninguno). */
  tint: number;
}

/**
 * Dibuja una cara a pantalla completa: recorte "cover" con zoom y temblor, tiras desplazadas (corte de senal),
 * regueros de sangre, vineteado y grano oscuro. Sin negativos ni destellos blancos. `dark` y `lids` oscurecen
 * hasta el negro total, como quien se va apagando.
 */
function drawScreamImage(ctx: CanvasRenderingContext2D, w: number, h: number, img: HTMLImageElement | null, o: FrameOpts): void {
  const rn = (i: number) => hash2(i, o.seed, 17);
  ctx.save();
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);
  if (img) {
    const cover = Math.max(w / img.naturalWidth, h / img.naturalHeight) * o.zoom;
    const dw = img.naturalWidth * cover, dh = img.naturalHeight * cover;
    const j = 40 * o.violence;
    ctx.translate(w / 2 + (rn(1) - 0.5) * j, h / 2 + (rn(2) - 0.5) * j);
    ctx.rotate((rn(3) - 0.5) * 0.1 * o.violence);
    ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
  }
  ctx.restore();

  if (o.tint > 0) {
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = `rgb(255,${Math.round(255 - o.tint * (120 + rn(4) * 50))},${Math.round(255 - o.tint * (130 + rn(5) * 50))})`;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "source-over";
  }

  // tiras desplazadas (corte de senal)
  const strips = Math.round((4 + rn(6) * 8) * o.violence);
  for (let i = 0; i < strips; i++) {
    const y = rn(10 + i) * h, hh = 6 + rn(30 + i) * h * 0.08, dx = (rn(50 + i) - 0.5) * w * 0.1 * o.violence;
    ctx.drawImage(ctx.canvas, 0, y, w, hh, dx, y, w, hh);
  }

  // regueros de sangre desde los bordes
  ctx.save();
  ctx.lineCap = "round";
  for (let i = 0; i < 9; i++) {
    const side = i % 4;
    let x = side === 0 ? rn(70 + i) * w : side === 1 ? 0 : side === 2 ? rn(70 + i) * w : w;
    let y = side === 0 ? 0 : side === 1 ? rn(80 + i) * h : side === 2 ? h : rn(80 + i) * h;
    ctx.strokeStyle = `rgba(${70 + rn(90 + i) * 60},0,0,${0.3 + rn(100 + i) * 0.35})`;
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

  // vineteado que se cierra con la oscuridad (vision de tunel) y grano oscuro
  const inner = Math.min(w, h) * (0.3 * (1 - o.dark * 0.9));
  const outer = Math.max(w, h) * (0.75 - o.dark * 0.45);
  const vg = ctx.createRadialGradient(w / 2, h / 2, inner, w / 2, h / 2, Math.max(inner + 1, outer));
  vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, `rgba(0,0,0,${0.85 + o.dark * 0.15})`);
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.35})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 12, 1 + Math.random() * 2);
  }

  // oscurecimiento general y parpados
  if (o.dark > 0) {
    ctx.fillStyle = `rgba(0,0,0,${Math.min(1, o.dark)})`;
    ctx.fillRect(0, 0, w, h);
  }
  if (o.lids > 0) {
    const half = (h / 2) * Math.min(1, o.lids);
    const soft = Math.max(8, h * 0.08);
    for (const top of [true, false]) {
      const edge = top ? half : h - half;
      const g = ctx.createLinearGradient(0, edge - (top ? soft : -soft), 0, edge);
      g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,1)");
      ctx.fillStyle = g;
      if (top) { ctx.fillRect(0, Math.max(0, edge - soft), w, soft); ctx.fillStyle = "#000"; ctx.fillRect(0, 0, w, edge); }
      else { ctx.fillRect(0, edge, w, soft); ctx.fillStyle = "#000"; ctx.fillRect(0, edge, w, h - edge); }
    }
  }
}

/**
 * Cortes de la secuencia de muerte (segundos desde el inicio). El primer fotograma golpea con el impacto del audio
 * (0,38 s); los cortes a negro hacen de estroboscopio sin luz blanca.
 */
const DEATH_CUTS: [number, number][] = [[0.52, 0.58], [0.86, 0.9], [1.5, 1.53]];

export class ScareSystem {
  private ctx: CanvasRenderingContext2D;
  private deathT = -1;
  private deathLen = DEATH_LEN_FULL;
  private deathKind: FaceKind = 0;
  private ghostView: GhostView | null = null;
  private eye = new THREE.Vector3();
  private startTarget = new THREE.Vector3();
  private headTarget = new THREE.Vector3();
  private flashT = -1;
  private flashLen = 0;
  private flashKind: FaceKind = 0;
  private flashSeed = 0;
  private flashDim = 0;
  private lastCut = false;
  private frameSeed = 0;
  level: ScareLevel = "full";

  constructor(private d: ScareDeps) {
    this.ctx = d.canvas.getContext("2d")!;
    preloadScreamImages();
  }

  get deathRunning(): boolean { return this.deathT >= 0; }

  private resize(): void {
    const c = this.d.canvas;
    const w = c.clientWidth || window.innerWidth, h = c.clientHeight || window.innerHeight;
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  }

  startDeath(kind: FaceKind, view: GhostView, eye: THREE.Vector3, forward: THREE.Vector3): void {
    this.deathT = 0;
    this.deathLen = this.level === "off" ? DEATH_LEN_OFF : DEATH_LEN_FULL;
    this.deathKind = kind;
    this.ghostView = view;
    this.eye.copy(eye);
    this.startTarget.copy(eye).addScaledVector(forward, 3);
    this.headTarget.set(view.group.position.x, view.faceY + 0.1, view.group.position.z);
    this.lastCut = false;
    view.forceScream();
    const gain =
      this.level === "off"
        ? 0
        : this.level === "nofullscreen"
          ? 0.35
          : this.level === "reduced"
            ? 0.55
            : 1.0;
    this.d.audio.duck?.(0.01, 4.5); // el ambiente y la musica callan durante todo el grito
    this.d.audio.playDeathScream(kind, gain);
    this.d.rig.override = { pos: this.eye.clone(), target: this.startTarget.clone(), fov: 78, roll: 0 };
    this.resize();
  }

  /** Avanza la secuencia de muerte. Devuelve true al terminar. */
  updateDeath(dt: number): boolean {
    if (this.deathT < 0) return false;
    this.deathT += dt;
    const t = this.deathT;
    const len = this.deathLen;
    const full = len === DEATH_LEN_FULL;
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

    // la violencia (temblor, glitch) se agota con los segundos: el cuerpo se rinde
    const calm = 1 - smooth(1.2, len * 0.8, t);
    o.fov = 78 - 18 * Math.min(1, t / 0.12);
    o.roll = (Math.sin(t * 46) * 0.08 * ease + (Math.random() - 0.5) * 0.04 * ease) * calm + Math.sin(t * 0.9) * 0.05 * (1 - calm);
    this.d.rig.trauma = Math.min(1, (0.8 + ease * 0.8) * (0.25 + calm * 0.75));
    fx.glitch = (0.7 + ease * 1.3) * (0.15 + calm * 0.85);
    fx.aberration = (0.6 + ease * 1.2) * (0.2 + calm * 0.8);

    // 3) oscurecimiento: de la voz que se apaga al negro total (la imagen 2D tambien lo lleva por dentro)
    const dStart = full ? 1.4 : 0.5, dEnd = full ? 5.2 : len - 0.3;
    let dark = smooth(dStart, dEnd, t);
    // un ultimo intento de abrir los ojos hacia la mitad del apagon
    let lids = smooth(full ? 2.6 : 0.5, full ? 5.0 : len - 0.3, t);
    if (full) lids = Math.max(0, lids - 0.35 * Math.sin(Math.max(0, Math.min(1, (t - 3.6) / 0.9)) * Math.PI) * 1.6);
    fx.blackout = Math.min(1, dark * dark + (t > len - 0.5 ? 1 : 0));
    fx.staticNoise = t >= 1.2 ? 0.45 * (1 - dark) : 0;
    dark = Math.min(1, dark);
    this.darkNow = dark;

    // 4) la imagen 2D llena la pantalla; cortes a negro en lugar de destellos
    this.resize();
    const c = this.d.canvas, ctx = this.ctx;
    const show = this.level === "full" || this.level === "reduced";
    const cut = this.level === "full" && DEATH_CUTS.some(([a, b]) => t >= a && t < b);
    if (show && t >= 0.38 && t < len) {
      if (cut !== this.lastCut || this.frameSeed === 0) { this.frameSeed = Math.floor(Math.random() * 1e6); }
      this.lastCut = cut;
      if (t >= 0.38 && !this.hitDone) { this.hitDone = true; this.d.audio.playScareHit(1.2); }
      // zoom: golpe seco al entrar (1.0) y acercamiento lento hacia la cara
      const zoom = 1.0 + smooth(0.38, 0.6, t) * 0.12 + smooth(0.6, len * 0.85, t) * 0.55;
      const violence = (this.level === "reduced" ? 0.35 : 1) * (0.25 + 0.75 * calm);
      ctx.clearRect(0, 0, c.width, c.height);
      if (cut) { ctx.fillStyle = "#000"; ctx.fillRect(0, 0, c.width, c.height); }
      else drawScreamImage(ctx, c.width, c.height, screamImage(this.deathKind), {
        zoom, seed: this.frameSeed + Math.floor(t * 30), violence, dark, lids, tint: 0.3,
      });
      c.style.opacity = "1";
      const jitter = 34 * violence * (1 + ease * 0.5);
      c.style.transform = `translate(${((Math.random() - 0.5) * jitter).toFixed(1)}px, ${((Math.random() - 0.5) * jitter).toFixed(1)}px) scale(${1.05 + (Math.random() - 0.5) * 0.06 * violence})`;
    } else {
      ctx.clearRect(0, 0, c.width, c.height);
      c.style.opacity = "0";
      c.style.transform = "";
    }
    if (t >= len) {
      this.endDeath();
      return true;
    }
    return false;
  }

  private hitDone = false;
  private darkNow = 0;
  /** 0..1: cuanto ha oscurecido la secuencia de muerte (lo usa el motor para desaturar y cerrar la vineta). */
  get deathDark(): number { return this.deathT >= 0 ? this.darkNow : 0; }

  /** Cierra la secuencia y restaura el estado visual. */
  endDeath(): void {
    this.deathT = -1;
    this.darkNow = 0;
    this.hitDone = false;
    this.frameSeed = 0;
    this.d.rig.override = null;
    const c = this.d.canvas;
    c.style.opacity = "0";
    c.style.transform = "";
    this.ctx.clearRect(0, 0, c.width, c.height);
    this.ghostView = null;
  }

  // ------------------- screamers de destello -------------------

  /** Cara fugaz a pantalla completa (susto ambiental). Sin luz blanca: la imagen entra y sale a negro. */
  flashFace(kind: FaceKind, seconds = 0.28, dim = 0): void {
    if (this.level === "off" || this.level === "nofullscreen" || this.deathRunning) return;
    this.flashT = 0;
    this.flashLen = this.level === "reduced" ? Math.min(seconds, 0.16) : seconds;
    this.flashKind = kind;
    this.flashSeed = Math.random() * 1000;
    this.flashDim = dim;
    if (dim <= 0) this.d.audio.playScreamerFlash();
    this.d.rig.addTrauma(dim > 0 ? 0.15 : 0.5);
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
    // entra de golpe, se acerca un poco y se hunde en el negro en el ultimo cuarto
    drawScreamImage(ctx, c.width, c.height, screamImage(this.flashKind), {
      zoom: 1.0 + k * 0.18, seed: Math.floor(this.flashSeed * 1000) + Math.floor(t * 40),
      violence: this.level === "reduced" ? 0.3 : 0.8, dark: Math.max(this.flashDim, smooth(0.7, 1, k)), lids: 0, tint: 0.35,
    });
    c.style.opacity = "1";
    c.style.transform = `translate(${((Math.random() - 0.5) * 18).toFixed(1)}px, ${((Math.random() - 0.5) * 18).toFixed(1)}px) scale(1.03)`;
    this.d.fx.glitch = Math.max(this.d.fx.glitch, 0.8);
    this.d.fx.aberration = Math.max(this.d.fx.aberration, 0.6);
  }

  dispose(): void { /* las imagenes son compartidas y se liberan con la pagina */ }
}

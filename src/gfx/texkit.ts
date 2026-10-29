// Utilidades para fabricar superficies (color + normal + rugosidad) con Canvas 2D y pasadas por pixel.

import * as THREE from "three";

export interface TexSet {
  map: THREE.CanvasTexture;
  normal: THREE.CanvasTexture;
  rough: THREE.CanvasTexture;
  /** Mapa emisivo opcional (neones, venas brillantes, estrellas). */
  emissive?: THREE.CanvasTexture;
}

export function makeCanvas(w: number, h: number): { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  return { c, ctx };
}

export function toTexture(c: HTMLCanvasElement, srgb: boolean, repeat = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (repeat) { t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping; }
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

export type Rgb = [number, number, number];

export function hexToRgb(hex: number): Rgb { return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255]; }

export function css(c: Rgb, a = 1): string {
  return `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
}

/**
 * Superficie con dos lienzos 2D (color y altura). Se dibujan formas con la API de Canvas,
 * se aplican pasadas por pixel con ruido y al final se genera el mapa normal desde la altura.
 */
export class Surface {
  readonly w: number;
  readonly h: number;
  readonly color: CanvasRenderingContext2D;
  readonly height: CanvasRenderingContext2D;
  private colorC: HTMLCanvasElement;
  private heightC: HTMLCanvasElement;
  rough: Float32Array;
  private emitC: HTMLCanvasElement | null = null;
  private emitCtx: CanvasRenderingContext2D | null = null;

  /** Lienzo emisivo (negro = no emite). Se crea al usarlo por primera vez. */
  get emit(): CanvasRenderingContext2D {
    if (!this.emitCtx) {
      const e = makeCanvas(this.w, this.h);
      e.ctx.fillStyle = "#000"; e.ctx.fillRect(0, 0, this.w, this.h);
      this.emitC = e.c; this.emitCtx = e.ctx;
    }
    return this.emitCtx;
  }

  constructor(w: number, h: number, base: Rgb, baseHeight = 0.5, baseRough = 0.85) {
    this.w = w; this.h = h;
    const a = makeCanvas(w, h), b = makeCanvas(w, h);
    this.colorC = a.c; this.color = a.ctx;
    this.heightC = b.c; this.height = b.ctx;
    this.color.fillStyle = css(base); this.color.fillRect(0, 0, w, h);
    const g = Math.round(baseHeight * 255);
    this.height.fillStyle = `rgb(${g},${g},${g})`; this.height.fillRect(0, 0, w, h);
    this.rough = new Float32Array(w * h).fill(baseRough);
  }

  /** Dibuja con la misma funcion en el lienzo de color y el de altura (gris). */
  both(draw: (ctx: CanvasRenderingContext2D, isHeight: boolean) => void): void {
    draw(this.color, false);
    draw(this.height, true);
  }

  /**
   * Pasada por pixel. `fn(i, x, y, rgba, hgt)` muta los arrays: rgba es el ImageData de color (0-255)
   * y hgt la altura en [0,1] (0.5 = plano).
   */
  pass(fn: (i: number, x: number, y: number, d: Uint8ClampedArray, hgt: Float32Array, rough: Float32Array) => void): void {
    const { w, h } = this;
    const cimg = this.color.getImageData(0, 0, w, h);
    const himg = this.height.getImageData(0, 0, w, h);
    const hgt = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) hgt[i] = himg.data[i * 4] / 255;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) fn(y * w + x, x, y, cimg.data, hgt, this.rough);
    this.color.putImageData(cimg, 0, 0);
    const out = this.height.createImageData(w, h);
    for (let i = 0; i < w * h; i++) {
      const v = Math.max(0, Math.min(255, Math.round(hgt[i] * 255)));
      out.data[i * 4] = v; out.data[i * 4 + 1] = v; out.data[i * 4 + 2] = v; out.data[i * 4 + 3] = 255;
    }
    this.height.putImageData(out, 0, 0);
  }

  /** Genera el mapa normal (tangente) desde la altura, con envoltura. */
  private normalCanvas(strength: number): HTMLCanvasElement {
    const { w, h } = this;
    const himg = this.height.getImageData(0, 0, w, h).data;
    const { c, ctx } = makeCanvas(w, h);
    const out = ctx.createImageData(w, h);
    const H = (x: number, y: number) => himg[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
      const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      // v de textura crece hacia arriba, y del canvas hacia abajo: se invierte dy
      let nx = -dx, ny = dy, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l; ny /= l; nz /= l;
      const o = (y * w + x) * 4;
      out.data[o] = (nx * 0.5 + 0.5) * 255;
      out.data[o + 1] = (ny * 0.5 + 0.5) * 255;
      out.data[o + 2] = (nz * 0.5 + 0.5) * 255;
      out.data[o + 3] = 255;
    }
    ctx.putImageData(out, 0, 0);
    return c;
  }

  private roughCanvas(): HTMLCanvasElement {
    const { w, h } = this;
    const { c, ctx } = makeCanvas(w, h);
    const out = ctx.createImageData(w, h);
    for (let i = 0; i < w * h; i++) {
      const v = Math.max(0, Math.min(255, Math.round(this.rough[i] * 255)));
      out.data[i * 4] = v; out.data[i * 4 + 1] = v; out.data[i * 4 + 2] = v; out.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(out, 0, 0);
    return c;
  }

  build(normalStrength = 3): TexSet {
    return {
      map: toTexture(this.colorC, true),
      normal: toTexture(this.normalCanvas(normalStrength), false),
      rough: toTexture(this.roughCanvas(), false),
      emissive: this.emitC ? toTexture(this.emitC, true) : undefined,
    };
  }

  /** Solo para depuracion: lienzo de color. */
  get colorCanvas(): HTMLCanvasElement { return this.colorC; }
  get heightCanvas(): HTMLCanvasElement { return this.heightC; }
}

export function disposeTexSet(t: TexSet | undefined): void {
  if (!t) return;
  t.map.dispose(); t.normal.dispose(); t.rough.dispose(); t.emissive?.dispose();
}

/** Mezcla un color hacia otro por t (0..1) en el buffer rgba en la posicion i*4. */
export function blendPx(d: Uint8ClampedArray, i: number, r: number, g: number, b: number, t: number): void {
  const o = i * 4;
  d[o] += (r - d[o]) * t;
  d[o + 1] += (g - d[o + 1]) * t;
  d[o + 2] += (b - d[o + 2]) * t;
}

export function shadePx(d: Uint8ClampedArray, i: number, k: number): void {
  const o = i * 4;
  d[o] *= k; d[o + 1] *= k; d[o + 2] *= k;
}

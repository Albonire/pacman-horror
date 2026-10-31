// Decals sobre las paredes: manos ensangrentadas anatomicas, arrastres viscerales, aranazos profundos,
// mensajes pintados con sangre coagulada/fresca, grafitis y carteles.
// Las texturas se dibujan con Canvas 2D de alta resolucion (con alfa) y se instancian sobre caras de pared expuestas.

import * as THREE from "three";
import { CELL, WALL_H } from "../config/constants";
import { hash2 } from "../gfx/noise";
import { makeCanvas, toTexture } from "../gfx/texkit";
import type { Simulation } from "../sim/simulation";
import { mulberry32 } from "../sim/rng";

export type DecalKind = "hand" | "smear" | "scratch" | "scribble" | "eyes" | "pacman" | "warning" | "sign" | "neon" | "drip";

export interface DecalSpec {
  kind: DecalKind;
  color: string;
  weight: number;
  /** Textos posibles (scribble / sign / neon). */
  texts?: string[];
  glow?: boolean;
}

type Ctx = CanvasRenderingContext2D;

interface PigmentPalette {
  /** Borde coagulado / oxidado mas oscuro. */
  crust: string;
  /** Cuerpo arterial principal. */
  base: string;
  /** Centro humedo y denso. */
  wet: string;
  /** Halo diluido semitransparente. */
  stain: string;
  rgb: [number, number, number];
}

/** Convierte un color CSS (#rgb, #rrggbb) en una paleta organica de 4 tonos (costra seca, base, sangre fresca y halo). */
export function buildPigmentPalette(hex: string): PigmentPalette {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  const r = Number.isFinite(n) ? (n >> 16) & 255 : 125;
  const g = Number.isFinite(n) ? (n >> 8) & 255 : 11;
  const b = Number.isFinite(n) ? n & 255 : 14;
  const clamp8 = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const crustR = clamp8(r * 0.42), crustG = clamp8(g * 0.32), crustB = clamp8(b * 0.32);
  const wetR = clamp8(Math.min(255, r * 1.32 + 12)), wetG = clamp8(g * 0.85 + 2), wetB = clamp8(b * 0.85 + 2);
  return {
    crust: `rgb(${crustR},${crustG},${crustB})`,
    base: `rgb(${r},${g},${b})`,
    wet: `rgb(${wetR},${wetG},${wetB})`,
    stain: `rgba(${crustR},${crustG},${crustB},0.26)`,
    rgb: [r, g, b],
  };
}

/**
 * Aplica un degradado perimetral y difuminado poroso a los 4 bordes del lienzo.
 * Elimina cualquier corte rectangular rigido, garantizando que el pigmento
 * se disuelva de forma imperceptible y organica en la penumbra y el hollin del muro.
 */
function applyDecalWallVignette(ctx: Ctx, w: number, h: number, marginX = 24, marginY = 20): void {
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  // Borde superior
  let g = ctx.createLinearGradient(0, 0, 0, marginY);
  g.addColorStop(0, "rgba(0,0,0,1)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, marginY);

  // Borde inferior
  g = ctx.createLinearGradient(0, h, 0, h - marginY);
  g.addColorStop(0, "rgba(0,0,0,1)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, h - marginY, w, marginY);

  // Borde izquierdo
  g = ctx.createLinearGradient(0, 0, marginX, 0);
  g.addColorStop(0, "rgba(0,0,0,1)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, marginX, h);

  // Borde derecho
  g = ctx.createLinearGradient(w, 0, w - marginX, 0);
  g.addColorStop(0, "rgba(0,0,0,1)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(w - marginX, 0, marginX, h);
  ctx.restore();
}

/**
 * Mancha difusa de mugre/hollin sobre la que se asienta la sangre,
 * integrando la marca con el yeso sucio y la penumbra del laberinto.
 */
function ambientWallGrime(ctx: Ctx, w: number, h: number, cx: number, cy: number, rx: number, ry: number, seed: number): void {
  ctx.save();
  ctx.globalCompositeOperation = "destination-over";
  const g = ctx.createRadialGradient(cx, cy, Math.min(rx, ry) * 0.12, cx, cy, Math.max(rx, ry));
  g.addColorStop(0, "rgba(14, 10, 8, 0.42)");
  g.addColorStop(0.55, "rgba(18, 12, 10, 0.20)");
  g.addColorStop(0.85, "rgba(12, 8, 6, 0.08)");
  g.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, (hash2(1, 1, seed) - 0.5) * 0.2, 0, Math.PI * 2);
  ctx.fill();

  // Manchas irregulares de suciedad circundante
  for (let i = 0; i < 6; i++) {
    const ox = cx + (hash2(i, 2, seed) - 0.5) * rx * 1.2;
    const oy = cy + (hash2(i, 3, seed) - 0.5) * ry * 1.1;
    const rSmall = 12 + hash2(i, 4, seed) * 28;
    const g2 = ctx.createRadialGradient(ox, oy, 2, ox, oy, rSmall);
    g2.addColorStop(0, `rgba(10, 8, 6, ${0.12 + hash2(i, 5, seed) * 0.16})`);
    g2.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = g2;
    ctx.beginPath();
    ctx.arc(ox, oy, rSmall, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Erosion porosa del soporte (papel tapiz, hormigon, azulejo) para integrar el pigmento en la pared. */
function speckleErase(ctx: Ctx, w: number, h: number, amount: number, seed: number): void {
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  for (let i = 0; i < amount; i++) {
    ctx.fillStyle = `rgba(0,0,0,${0.18 + hash2(i, 1, seed) * 0.58})`;
    const r = 0.5 + hash2(i, 2, seed) * 2.2;
    ctx.beginPath();
    ctx.arc(hash2(i, 3, seed) * w, hash2(i, 4, seed) * h, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Chorreones organicos por gravedad: avanzan con micro-meandros por los poros de la pared,
 * se estrechan en el tallo y terminan en una gota abultada por tension superficial.
 */
function organicDrips(
  ctx: Ctx,
  pal: PigmentPalette,
  x0: number,
  x1: number,
  yStart: number,
  count: number,
  maxLen: number,
  seed: number,
  yJitter = 14,
): void {
  ctx.save();
  for (let i = 0; i < count; i++) {
    const xBase = x0 + (x1 - x0) * hash2(i, 5, seed);
    const y0 = yStart + (hash2(i, 6, seed) - 0.5) * yJitter;
    const len = maxLen * (0.22 + Math.pow(hash2(i, 7, seed), 0.85) * 0.78);
    const w0 = 1.6 + hash2(i, 8, seed) * 3.2;
    const steps = Math.max(6, Math.floor(len / 5));

    let cx = xBase;
    let cy = y0;
    const pts: [number, number, number][] = [[cx, cy, w0]];
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const drift = (hash2(i * 31 + s, 9, seed) - 0.5) * 2.6;
      cx += drift;
      cy = y0 + len * t;
      // se estrecha hacia la mitad y vuelve a engrosar en la punta
      const taper = t < 0.82 ? 1 - t * 0.55 : 0.52 + (t - 0.82) * 3.2;
      pts.push([cx, cy, Math.max(0.8, w0 * taper)]);
    }

    // Sombra/costra exterior
    ctx.lineCap = "round";
    ctx.strokeStyle = pal.crust;
    ctx.globalAlpha = 0.82;
    for (let s = 0; s < pts.length - 1; s++) {
      const [ax, ay, aw] = pts[s];
      const [bx, by] = pts[s + 1];
      ctx.lineWidth = aw + 1.2;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }

    // Nucleo arterial humedo
    ctx.strokeStyle = pal.base;
    ctx.globalAlpha = 0.92;
    for (let s = 0; s < pts.length - 1; s++) {
      const [ax, ay, aw] = pts[s];
      const [bx, by] = pts[s + 1];
      ctx.lineWidth = Math.max(0.7, aw * 0.72);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }

    // Gota terminal coagulada en la punta + micro-gotas desprendidas debajo
    const [tx, ty, tw] = pts[pts.length - 1];
    ctx.fillStyle = pal.crust;
    ctx.globalAlpha = 0.92;
    ctx.beginPath();
    ctx.ellipse(tx, ty + 1.2, tw * 0.78, tw * 1.15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = pal.wet;
    ctx.globalAlpha = 0.75;
    ctx.beginPath();
    ctx.ellipse(tx - 0.3, ty + 0.8, tw * 0.45, tw * 0.72, 0, 0, Math.PI * 2);
    ctx.fill();

    if (hash2(i, 12, seed) > 0.42) {
      const dropY = ty + 6 + hash2(i, 13, seed) * 14;
      const dropR = 0.9 + hash2(i, 14, seed) * 1.6;
      ctx.fillStyle = pal.crust;
      ctx.beginPath();
      ctx.ellipse(tx + (hash2(i, 15, seed) - 0.5) * 2.5, dropY, dropR * 0.8, dropR * 1.3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** Salpicaduras direccionales por impacto o brochazo violento (gotas elipticas orientadas con cola capilar). */
function splatterBurst(
  ctx: Ctx,
  pal: PigmentPalette,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  count: number,
  seed: number,
): void {
  ctx.save();
  for (let i = 0; i < count; i++) {
    const ang = hash2(i, 20, seed) * Math.PI * 2;
    const dist = 0.25 + Math.pow(hash2(i, 21, seed), 0.7) * 0.85;
    const px = cx + Math.cos(ang) * rx * dist;
    const py = cy + Math.sin(ang) * ry * dist;
    const r = 0.7 + Math.pow(hash2(i, 22, seed), 1.6) * 3.8;
    const stretch = 1.2 + hash2(i, 23, seed) * 1.8;

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(ang);
    ctx.fillStyle = hash2(i, 24, seed) > 0.35 ? pal.crust : pal.base;
    ctx.globalAlpha = 0.55 + hash2(i, 25, seed) * 0.42;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * stretch, r * 0.75, 0, 0, Math.PI * 2);
    ctx.fill();
    // pequeña cola hacia el origen del impacto
    if (r > 1.5 && hash2(i, 26, seed) > 0.4) {
      ctx.beginPath();
      ctx.moveTo(-r * stretch * 1.7, 0);
      ctx.lineTo(0, -r * 0.45);
      ctx.lineTo(0, r * 0.45);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
  ctx.restore();
}

/**
 * Huella de mano ensangrentada realista (384x512):
 * - Anatomia palmar (eminencia tenar, hipotenar y almohadillas metacarpianas con arco central hueco y pliegues de flexion).
 * - Dedos con 3 falanges articuladas, separacion de panico y aranazos de unas en las yemas.
 * - Rastro de arrastre desesperado hacia abajo y salpicaduras de impacto.
 */
export function handprint(color: string, seed: number): THREE.CanvasTexture {
  const W = 384, H = 512;
  const { c, ctx } = makeCanvas(W, H);
  const pal = buildPigmentPalette(color);
  const mirror = (seed & 1) === 1 ? -1 : 1;
  const dragLen = 54 + hash2(1, 2, seed) * 82;

  // 1) Halo de mugre y tizne del entorno sucio del muro (fondo difuminado)
  const palmX = 196, palmY = 228;
  ambientWallGrime(ctx, W, H, palmX, palmY + 36, 170, 220, seed);

  ctx.save();
  ctx.translate(W / 2, 0);
  ctx.scale(mirror, 1);
  ctx.translate(-W / 2, 0);

  // Halo humedo de seroma y sangre diluida de fondo
  const halo = ctx.createRadialGradient(palmX, palmY, 16, palmX, palmY, 142);
  halo.addColorStop(0, pal.stain);
  halo.addColorStop(0.55, "rgba(22,12,10,0.18)");
  halo.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, W, H);

  // Configuracion anatomica de los 5 dedos: [baseX, baseY, anguloRad, largoTotal, grosorBase, esPulgar]
  const digits: [number, number, number, number, number, boolean][] = [
    [122, 232, -0.78 - (hash2(2, 1, seed) - 0.5) * 0.14, 78, 22, true],   // pulgar
    [152, 166, -0.26 - (hash2(3, 1, seed) - 0.5) * 0.08, 108, 19.5, false], // indice
    [186, 154, -0.05 + (hash2(4, 1, seed) - 0.5) * 0.06, 122, 20.5, false], // corazon
    [220, 164, 0.15 + (hash2(5, 1, seed) - 0.5) * 0.08, 110, 19.0, false],  // anular
    [250, 184, 0.38 + (hash2(6, 1, seed) - 0.5) * 0.1, 88, 16.5, false],   // menique
  ];

  // 2) Rastro de arrastre desesperado hacia abajo (dedos y palma resbalando por el yeso)
  ctx.save();
  ctx.lineCap = "round";
  for (let d = 0; d < digits.length; d++) {
    const [bx, by, ang, len, thick] = digits[d];
    const tipX = bx + Math.sin(ang) * len;
    const tipY = by - Math.cos(ang) * len;
    // Surcos de las yemas resbalando hacia abajo con micro-desgarros
    for (let f = -2; f <= 2; f++) {
      ctx.strokeStyle = f === 0 ? pal.base : pal.crust;
      ctx.globalAlpha = 0.28 + (2 - Math.abs(f)) * 0.12;
      ctx.lineWidth = Math.max(1.8, thick * 0.24);
      const sx = tipX + f * 3.2;
      ctx.beginPath();
      ctx.moveTo(sx, tipY);
      ctx.bezierCurveTo(
        sx + (hash2(d, 30 + f, seed) - 0.5) * 16,
        tipY + dragLen * 0.42,
        bx + f * 2.5,
        by + dragLen * 0.88,
        bx + f * 2 + (hash2(d, 40 + f, seed) - 0.5) * 12,
        by + dragLen * 1.38,
      );
      ctx.stroke();
    }
  }
  // Arrastre ancho del talon de la palma
  for (let k = 0; k < 10; k++) {
    const ox = palmX - 48 + k * 10.8 + (hash2(k, 50, seed) - 0.5) * 5;
    ctx.strokeStyle = k % 2 === 0 ? pal.crust : pal.base;
    ctx.globalAlpha = 0.24 + hash2(k, 51, seed) * 0.28;
    ctx.lineWidth = 6 + hash2(k, 52, seed) * 8;
    ctx.beginPath();
    ctx.moveTo(ox, palmY + 24);
    ctx.quadraticCurveTo(ox + (hash2(k, 53, seed) - 0.5) * 18, palmY + 24 + dragLen * 0.6, ox + (hash2(k, 54, seed) - 0.5) * 12, palmY + 34 + dragLen * 1.18);
    ctx.stroke();
  }
  ctx.restore();

  // 3) Almohadillas anatomicas de la palma con contorno organico irregular (pulpa aplastada contra muro poroso)
  const drawPad = (x: number, y: number, rx: number, ry: number, rot: number, alpha = 0.94, padSeed = 0) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);

    // Contorno irregular con variaciones perimetrales de presion
    const steps = 14;
    const makeContour = (radX: number, radY: number, pertScale: number) => {
      ctx.beginPath();
      for (let s = 0; s < steps; s++) {
        const theta = (s / steps) * Math.PI * 2;
        const pert = 1 + (hash2(s, 1, padSeed) - 0.5) * 0.16 * pertScale;
        const px = Math.cos(theta) * radX * pert;
        const py = Math.sin(theta) * radY * pert;
        if (s === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
    };

    // Halo perimetral de seroma / sangre diluida absorbida por el muro
    ctx.fillStyle = pal.stain;
    ctx.globalAlpha = alpha * 0.48;
    makeContour(rx + 4.5, ry + 4.5, 0.8);
    ctx.fill();

    // Borde exterior coagulado y oscuro (costra seca perimetral)
    ctx.fillStyle = pal.crust;
    ctx.globalAlpha = alpha;
    makeContour(rx + 2.2, ry + 2.2, 0.9);
    ctx.fill();

    // Cuerpo arterial denso
    ctx.fillStyle = pal.base;
    ctx.globalAlpha = alpha * 0.95;
    makeContour(rx, ry, 1.0);
    ctx.fill();

    // Nucleo humedo brillante (reflejo de liquido denso bajo la linterna)
    ctx.fillStyle = pal.wet;
    ctx.globalAlpha = alpha * 0.62;
    ctx.beginPath();
    ctx.ellipse(-rx * 0.1, -ry * 0.08, rx * 0.56, ry * 0.56, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  // Rodete metacarpiano superior (bajo los 4 dedos)
  drawPad(160, 186, 22, 18, -0.2, 0.92, seed + 1);
  drawPad(188, 178, 24, 19, -0.05, 0.95, seed + 2);
  drawPad(216, 184, 22, 18, 0.12, 0.92, seed + 3);
  drawPad(242, 198, 19, 16, 0.28, 0.88, seed + 4);
  // Eminencia tenar (base gorda del pulgar)
  drawPad(162, 244, 32, 44, -0.36, 0.95, seed + 5);
  // Eminencia hipotenar (borde exterior de la palma)
  drawPad(226, 248, 25, 48, 0.16, 0.93, seed + 6);
  // Talon inferior de la muneca
  drawPad(196, 282, 34, 20, -0.05, 0.82, seed + 7);

  // 4) Dedos articulados en 3 falanges (2 en el pulgar) + aranazos de unas en la punta
  digits.forEach(([bx, by, ang, len, thick, isThumb], idx) => {
    const segs = isThumb ? 2 : 3;
    let cx = bx, cy = by;
    let curAng = ang;
    for (let s = 0; s < segs; s++) {
      const segFrac = isThumb ? (s === 0 ? 0.52 : 0.48) : (s === 0 ? 0.4 : s === 1 ? 0.33 : 0.27);
      const segLen = len * segFrac;
      const nx = cx + Math.sin(curAng) * segLen;
      const ny = cy - Math.cos(curAng) * segLen;
      const mx = (cx + nx) * 0.5;
      const my = (cy + ny) * 0.5;
      const rx = Math.max(5.5, thick * (0.52 - s * 0.075));
      const ry = segLen * 0.52;

      drawPad(mx, my, rx, ry, curAng, s === segs - 1 ? 0.98 : 0.9, seed + idx * 10 + s);

      // Si es la falange distal (yema): presion extra + marca de una clavada
      if (s === segs - 1) {
        drawPad(nx, ny, rx * 1.06, rx * 1.25, curAng, 0.98, seed + idx * 10 + 9);
        // Surco fino de la una clavandose y arrastrando
        ctx.save();
        ctx.strokeStyle = pal.crust;
        ctx.lineWidth = 2.8;
        ctx.lineCap = "round";
        ctx.globalAlpha = 0.95;
        ctx.beginPath();
        ctx.moveTo(nx - Math.cos(curAng) * rx * 0.45, ny - Math.sin(curAng) * rx * 0.45);
        ctx.lineTo(nx + Math.sin(curAng) * 9, ny - Math.cos(curAng) * 9);
        ctx.lineTo(nx + Math.cos(curAng) * rx * 0.45, ny + Math.sin(curAng) * rx * 0.45);
        ctx.stroke();
        ctx.restore();
      }

      cx = nx;
      cy = ny;
      curAng += (hash2(idx, 60 + s, seed) - 0.5) * 0.09;
    }
  });

  // 5) Hueco palmar central y pliegues de flexion
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  // Hueco concavo en el centro de la palma
  const hollow = ctx.createRadialGradient(196, 224, 4, 196, 224, 32);
  hollow.addColorStop(0, "rgba(0,0,0,0.72)");
  hollow.addColorStop(0.6, "rgba(0,0,0,0.32)");
  hollow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = hollow;
  ctx.beginPath();
  ctx.arc(196, 224, 32, 0, Math.PI * 2);
  ctx.fill();

  // Pliegues de flexion de la palma
  ctx.strokeStyle = "rgba(0,0,0,0.78)";
  ctx.lineWidth = 2.4;
  ctx.lineCap = "round";
  // Linea tenar (de la vida)
  ctx.beginPath();
  ctx.moveTo(152, 198);
  ctx.quadraticCurveTo(188, 222, 182, 278);
  ctx.stroke();
  // Linea palmar transversal proximal (cabeza)
  ctx.beginPath();
  ctx.moveTo(154, 196);
  ctx.quadraticCurveTo(198, 212, 244, 226);
  ctx.stroke();
  // Linea palmar transversal distal (corazon)
  ctx.beginPath();
  ctx.moveTo(174, 186);
  ctx.quadraticCurveTo(212, 196, 252, 194);
  ctx.stroke();

  // Surcos de las articulaciones de los dedos
  digits.forEach(([bx, by, ang, len, thick, isThumb]) => {
    const joints = isThumb ? [0.5] : [0.38, 0.7];
    for (const jf of joints) {
      const jx = bx + Math.sin(ang) * len * jf;
      const jy = by - Math.cos(ang) * len * jf;
      const nx = Math.cos(ang) * thick * 0.55;
      const ny = Math.sin(ang) * thick * 0.55;
      ctx.lineWidth = 2.1;
      ctx.beginPath();
      ctx.moveTo(jx - nx, jy - ny);
      ctx.lineTo(jx + nx, jy + ny);
      ctx.stroke();
    }
  });

  // Crestas papilares finas en palma y dedos
  ctx.lineWidth = 1.1;
  ctx.strokeStyle = "rgba(0,0,0,0.34)";
  for (let r = 0; r < 28; r++) {
    const ry = 110 + r * 7.2;
    ctx.beginPath();
    ctx.moveTo(118, ry + (hash2(r, 70, seed) - 0.5) * 6);
    ctx.quadraticCurveTo(196, ry - 8 + (hash2(r, 71, seed) - 0.5) * 10, 268, ry + (hash2(r, 72, seed) - 0.5) * 6);
    ctx.stroke();
  }
  ctx.restore();

  ctx.restore(); // fin del mirror

  // 6) Salpicaduras violentas alrededor de la palma y chorreones densos
  splatterBurst(ctx, pal, 192, 210, 148, 165, 74, seed);
  organicDrips(ctx, pal, 118, 268, 265, 12, 190, seed, 24);
  speckleErase(ctx, W, H, 340, seed);
  applyDecalWallVignette(ctx, W, H, 24, 28);
  return toTexture(c, true, false);
}

/**
 * Arrastre ensangrentado de dedos y palma por la pared (512x256):
 * 4 surcos paralelos de dedos temblorosos con bordes coagulados, mancha de palma y chorreones verticales.
 */
export function smear(color: string, seed: number): THREE.CanvasTexture {
  const W = 512, H = 256;
  const { c, ctx } = makeCanvas(W, H);
  const pal = buildPigmentPalette(color);
  ctx.lineCap = "round";

  const yMid = 104 + (hash2(0, 1, seed) - 0.5) * 24;
  ambientWallGrime(ctx, W, H, W * 0.5, yMid, W * 0.46, H * 0.44, seed);

  // Mancha difusa de fondo (la palma rozando la pared)
  for (let p = 0; p < 3; p++) {
    ctx.strokeStyle = pal.stain;
    ctx.lineWidth = 42 + hash2(p, 2, seed) * 28;
    ctx.beginPath();
    ctx.moveTo(36 + p * 18, yMid + (p - 1) * 14);
    ctx.bezierCurveTo(170, yMid - 28 + p * 16, 330, yMid + 26 - p * 12, 474, yMid + 14 + p * 10);
    ctx.stroke();
  }

  // 4 surcos de dedos individuales con filamentos humedos y secos
  const c1y = yMid - 34 + hash2(1, 3, seed) * 52;
  const c2y = yMid + 18 + hash2(2, 3, seed) * 44;
  const endY = yMid + 12 + (hash2(3, 3, seed) - 0.5) * 42;

  for (let finger = 0; finger < 4; finger++) {
    const spread0 = (finger - 1.5) * (18 + hash2(finger, 4, seed) * 5);
    const spread1 = (finger - 1.5) * (14 + hash2(finger, 5, seed) * 7);
    const y0 = yMid + spread0;
    const yEnd = endY + spread1;
    const baseW = 11 + hash2(finger, 6, seed) * 8;

    // Costra exterior oscura
    ctx.strokeStyle = pal.crust;
    ctx.globalAlpha = 0.82;
    ctx.lineWidth = baseW + 3;
    ctx.beginPath();
    ctx.moveTo(28 + finger * 6, y0);
    ctx.bezierCurveTo(165, c1y + spread0 * 0.9, 325, c2y + spread1 * 0.95, 476 - finger * 4, yEnd);
    ctx.stroke();

    // Filamentos internos (efecto de piel/sangre que se corta al acabarse)
    for (let fil = 0; fil < 4; fil++) {
      const fy = (fil - 1.5) * (baseW * 0.22);
      ctx.strokeStyle = fil === 1 ? pal.wet : pal.base;
      ctx.globalAlpha = 0.45 + hash2(finger * 10 + fil, 7, seed) * 0.45;
      ctx.lineWidth = 2.0 + hash2(finger * 10 + fil, 8, seed) * 2.8;
      ctx.beginPath();
      ctx.moveTo(28 + finger * 6, y0 + fy);
      ctx.bezierCurveTo(
        165,
        c1y + spread0 * 0.9 + fy + (hash2(fil, 9, seed) - 0.5) * 6,
        325,
        c2y + spread1 * 0.95 + fy + (hash2(fil, 10, seed) - 0.5) * 6,
        440 + hash2(finger, 11 + fil, seed) * 44,
        yEnd + fy,
      );
      ctx.stroke();
    }
  }

  ctx.globalAlpha = 1;
  splatterBurst(ctx, pal, 95, yMid, 90, 65, 42, seed);
  splatterBurst(ctx, pal, 380, endY, 110, 60, 34, seed + 7);
  organicDrips(ctx, pal, 42, 464, yMid + 12, 13, 112, seed, 32);
  speckleErase(ctx, W, H, 380, seed);
  applyDecalWallVignette(ctx, W, H, 28, 20);
  return toTexture(c, true, false);
}

/**
 * Aranazos profundos o marcas de conteo desesperadas en la pared (384x384):
 * Surcos desgarrados en el yeso con cavidad oscura, bordes astillados y sangre de unas rotas.
 */
export function scratch(color: string, seed: number): THREE.CanvasTexture {
  const W = 384, H = 384;
  const { c, ctx } = makeCanvas(W, H);
  const pal = buildPigmentPalette(color);
  const bloodPal = buildPigmentPalette("#7d0b0e");
  ctx.lineCap = "round";

  ambientWallGrime(ctx, W, H, W * 0.5, H * 0.5, W * 0.44, H * 0.44, seed);

  const isTally = hash2(0, 1, seed) > 0.58;
  const drawGouge = (x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, wMax: number, kSeed: number) => {
    const steps = 28;
    for (let s = 0; s < steps; s++) {
      const t0 = s / steps, t1 = (s + 1) / steps;
      const env = Math.sin(t0 * Math.PI); // mas profundo en el centro, afilado en los extremos
      const qx = (t: number) => (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * cx + t * t * x1 + (hash2(s, 2, kSeed) - 0.5) * 2.2;
      const qy = (t: number) => (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * cy + t * t * y1 + (hash2(s, 3, kSeed) - 0.5) * 2.2;
      const ax = qx(t0), ay = qy(t0), bx = qx(t1), by = qy(t1);
      const w = Math.max(1.2, wMax * (0.2 + 0.8 * env));

      // Borde astillado claro del yeso/soporte
      ctx.strokeStyle = pal.base;
      ctx.globalAlpha = 0.65 * env;
      ctx.lineWidth = w + 3.2;
      ctx.beginPath(); ctx.moveTo(ax + 1.4, ay); ctx.lineTo(bx + 1.4, by); ctx.stroke();

      // Cavidad profunda oscura
      ctx.strokeStyle = "rgba(8,5,4,0.88)";
      ctx.globalAlpha = 0.92;
      ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();

      // Rastro de sangre de las unas dentro del surco
      ctx.strokeStyle = bloodPal.base;
      ctx.globalAlpha = 0.72 * (0.3 + 0.7 * t0);
      ctx.lineWidth = Math.max(1, w * 0.52);
      ctx.beginPath(); ctx.moveTo(ax - 0.6, ay); ctx.lineTo(bx - 0.6, by); ctx.stroke();
    }
  };

  if (isTally) {
    // Marcas de dias / victimas (|||| tachadas en diagonal) grabadas con las unas
    for (let i = 0; i < 4; i++) {
      const x = 88 + i * 58 + (hash2(i, 10, seed) - 0.5) * 10;
      const yTop = 58 + (hash2(i, 11, seed) - 0.5) * 18;
      const yBot = 318 + (hash2(i, 12, seed) - 0.5) * 18;
      drawGouge(x, yTop, x + (hash2(i, 13, seed) - 0.5) * 18, (yTop + yBot) * 0.5, x + (hash2(i, 14, seed) - 0.5) * 14, yBot, 7.5, seed + i * 19);
    }
    // Tachon diagonal violento
    drawGouge(52, 268, 192, 182, 336, 106, 9.0, seed + 99);
    organicDrips(ctx, bloodPal, 78, 316, 290, 7, 74, seed, 20);
  } else {
    // 4 aranazos profundos de garras/unas desesperadas
    for (let i = 0; i < 4; i++) {
      const x0 = 76 + i * 68 + (hash2(i, 20, seed) - 0.5) * 14;
      const y0 = 28 + hash2(i, 21, seed) * 26;
      const cx = x0 + 26 + (hash2(i, 22, seed) - 0.5) * 28;
      const cy = 192 + (hash2(i, 23, seed) - 0.5) * 24;
      const x1 = x0 + 8 + (hash2(i, 24, seed) - 0.5) * 26;
      const y1 = 344 - hash2(i, 25, seed) * 24;
      drawGouge(x0, y0, cx, cy, x1, y1, 8.5, seed + i * 23);
    }
    organicDrips(ctx, bloodPal, 74, 312, 310, 6, 62, seed, 22);
  }

  speckleErase(ctx, W, H, 180, seed);
  applyDecalWallVignette(ctx, W, H, 24, 24);
  return toTexture(c, true, false);
}

/**
 * Trazo visceral de sangre pintado con los dedos / brocha rota entre dos puntos:
 * Dibuja un halo capilar en los poros del yeso, multiples filamentos irregulares
 * con acumulacion coagulada oscura en los bordes y desgarro seco al final.
 */
function raggedBloodStroke(
  ctx: Ctx,
  pal: PigmentPalette,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  width: number,
  seed: number,
): void {
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  const steps = Math.max(8, Math.ceil(len / 4.8));

  ctx.save();
  ctx.lineCap = "round";

  // 1) Halo previo de seroma/humedad absorbida por el soporte (difumina el contacto con el yeso)
  ctx.strokeStyle = pal.stain;
  ctx.globalAlpha = 0.52;
  ctx.lineWidth = width * 1.55;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();

  // 2) 5 filamentos paralelos que simulan los surcos de las crestas papilares / dedos empapados en sangre
  const filaments = 5;
  for (let f = 0; f < filaments; f++) {
    const offsetFrac = (f / (filaments - 1) - 0.5) * 0.88;
    const isCenter = f === 2;
    const isEdge = f === 0 || f === filaments - 1;

    ctx.strokeStyle = isEdge ? pal.crust : isCenter ? pal.wet : pal.base;
    ctx.globalAlpha = isEdge ? 0.92 : isCenter ? 0.98 : 0.86;

    let px = x0 + nx * width * offsetFrac;
    let py = y0 + ny * width * offsetFrac;

    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      // Temblor del pulso y variacion de presion (mas grueso al apoyar el dedo, desgarrado al final)
      const jitter = (hash2(f * 37 + s, 1, seed) - 0.5) * width * 0.35;
      const splay = t > 0.75 ? (t - 0.75) * 4 * offsetFrac * width * 0.5 : 0;
      const cx = x0 + dx * t + nx * (width * offsetFrac + jitter + splay);
      const cy = y0 + dy * t + ny * (width * offsetFrac + jitter + splay);

      const pressure = t < 0.18 ? 0.8 + t * 2.4 : t > 0.82 ? Math.max(0.18, 1 - (t - 0.82) * 3.8) : 1.0;
      ctx.lineWidth = Math.max(1.2, width * (isEdge ? 0.38 : 0.48) * pressure);

      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(cx, cy);
      ctx.stroke();

      // Micro-salpicadura lateral ocasional arrojada por la velocidad del dedo
      if (s % 3 === 0 && hash2(f * 13 + s, 2, seed) > 0.62) {
        const side = hash2(f * 13 + s, 3, seed) > 0.5 ? 1 : -1;
        const spDist = 3 + hash2(f * 13 + s, 4, seed) * width * 0.8;
        const spR = 0.6 + hash2(f * 13 + s, 5, seed) * 1.5;
        ctx.fillStyle = pal.crust;
        ctx.globalAlpha = 0.75;
        ctx.beginPath();
        ctx.arc(cx + nx * side * spDist, cy + ny * side * spDist, spR, 0, Math.PI * 2);
        ctx.fill();
      }

      px = cx;
      py = cy;
    }
  }

  // 3) Coagulo oscuro en el punto de ataque del trazo (apoyo de la yema)
  ctx.fillStyle = pal.crust;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.arc(x0, y0, width * 0.46, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = pal.wet;
  ctx.globalAlpha = 0.55;
  ctx.beginPath();
  ctx.arc(x0 - 0.5, y0 - 0.5, width * 0.28, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * Definicion vectorial de glifos desgarrados (coordenadas normalizadas 0..1 en ancho y 0..1 en alto).
 * Cada letra se compone de trazos rectos/quebrados pintados con dedos temblorosos sobre la pared,
 * evitando por completo fuentes tipograficas limpias o infantiles.
 */
type StrokeSeg = [number, number, number, number];
const HORROR_GLYPHS: Record<string, StrokeSeg[]> = {
  A: [[0.08, 0.98, 0.48, 0.04], [0.48, 0.04, 0.92, 0.98], [0.18, 0.62, 0.84, 0.58]],
  Á: [[0.08, 0.98, 0.48, 0.08], [0.48, 0.08, 0.92, 0.98], [0.18, 0.62, 0.84, 0.58], [0.68, -0.14, 0.44, 0.02]],
  B: [[0.14, 0.04, 0.12, 0.96], [0.12, 0.06, 0.78, 0.16], [0.78, 0.16, 0.82, 0.44], [0.82, 0.44, 0.14, 0.5], [0.14, 0.5, 0.86, 0.62], [0.86, 0.62, 0.84, 0.88], [0.84, 0.88, 0.1, 0.96]],
  C: [[0.88, 0.14, 0.28, 0.06], [0.28, 0.06, 0.1, 0.48], [0.1, 0.48, 0.24, 0.9], [0.24, 0.9, 0.9, 0.86]],
  D: [[0.14, 0.04, 0.12, 0.96], [0.12, 0.06, 0.74, 0.18], [0.74, 0.18, 0.88, 0.52], [0.88, 0.52, 0.72, 0.86], [0.72, 0.86, 0.1, 0.96]],
  E: [[0.16, 0.04, 0.12, 0.96], [0.12, 0.08, 0.9, 0.04], [0.14, 0.5, 0.78, 0.46], [0.1, 0.94, 0.92, 0.9]],
  É: [[0.16, 0.08, 0.12, 0.96], [0.12, 0.1, 0.9, 0.06], [0.14, 0.52, 0.78, 0.48], [0.1, 0.94, 0.92, 0.9], [0.68, -0.14, 0.42, 0.02]],
  F: [[0.16, 0.04, 0.12, 0.98], [0.12, 0.08, 0.9, 0.04], [0.14, 0.5, 0.78, 0.46]],
  G: [[0.86, 0.14, 0.26, 0.06], [0.26, 0.06, 0.1, 0.5], [0.1, 0.5, 0.26, 0.92], [0.26, 0.92, 0.86, 0.86], [0.86, 0.86, 0.84, 0.52], [0.84, 0.52, 0.48, 0.54]],
  H: [[0.14, 0.04, 0.12, 0.98], [0.86, 0.02, 0.84, 0.98], [0.1, 0.52, 0.9, 0.46]],
  I: [[0.5, 0.04, 0.48, 0.96], [0.22, 0.06, 0.78, 0.04], [0.2, 0.96, 0.8, 0.94]],
  Í: [[0.5, 0.08, 0.48, 0.96], [0.22, 0.1, 0.78, 0.08], [0.2, 0.96, 0.8, 0.94], [0.68, -0.14, 0.44, 0.02]],
  J: [[0.78, 0.04, 0.76, 0.78], [0.76, 0.78, 0.48, 0.94], [0.48, 0.94, 0.14, 0.76]],
  K: [[0.14, 0.04, 0.12, 0.98], [0.88, 0.06, 0.16, 0.52], [0.24, 0.46, 0.9, 0.96]],
  L: [[0.16, 0.04, 0.12, 0.96], [0.1, 0.94, 0.9, 0.9]],
  M: [[0.08, 0.98, 0.14, 0.04], [0.14, 0.04, 0.5, 0.62], [0.5, 0.62, 0.86, 0.04], [0.86, 0.04, 0.92, 0.98]],
  N: [[0.12, 0.98, 0.14, 0.04], [0.14, 0.04, 0.86, 0.96], [0.86, 0.96, 0.88, 0.02]],
  O: [[0.48, 0.04, 0.12, 0.28], [0.12, 0.28, 0.14, 0.76], [0.14, 0.76, 0.52, 0.96], [0.52, 0.96, 0.88, 0.72], [0.88, 0.72, 0.84, 0.24], [0.84, 0.24, 0.48, 0.04]],
  Ó: [[0.48, 0.08, 0.12, 0.3], [0.12, 0.3, 0.14, 0.76], [0.14, 0.76, 0.52, 0.96], [0.52, 0.96, 0.88, 0.72], [0.88, 0.72, 0.84, 0.26], [0.84, 0.26, 0.48, 0.08], [0.68, -0.14, 0.44, 0.02]],
  P: [[0.14, 0.04, 0.12, 0.98], [0.12, 0.06, 0.82, 0.14], [0.82, 0.14, 0.86, 0.46], [0.86, 0.46, 0.12, 0.54]],
  Q: [[0.48, 0.04, 0.12, 0.28], [0.12, 0.28, 0.14, 0.76], [0.14, 0.76, 0.52, 0.94], [0.52, 0.94, 0.88, 0.7], [0.88, 0.7, 0.84, 0.24], [0.84, 0.24, 0.48, 0.04], [0.54, 0.64, 0.96, 1.02]],
  R: [[0.14, 0.04, 0.12, 0.98], [0.12, 0.06, 0.82, 0.14], [0.82, 0.14, 0.84, 0.44], [0.84, 0.44, 0.14, 0.52], [0.34, 0.48, 0.92, 0.98]],
  S: [[0.86, 0.14, 0.24, 0.06], [0.24, 0.06, 0.12, 0.38], [0.12, 0.38, 0.86, 0.58], [0.86, 0.58, 0.78, 0.9], [0.78, 0.9, 0.1, 0.88]],
  T: [[0.06, 0.08, 0.94, 0.04], [0.5, 0.04, 0.48, 0.98]],
  U: [[0.14, 0.04, 0.16, 0.78], [0.16, 0.78, 0.5, 0.96], [0.5, 0.96, 0.84, 0.76], [0.84, 0.76, 0.86, 0.04]],
  Ú: [[0.14, 0.08, 0.16, 0.78], [0.16, 0.78, 0.5, 0.96], [0.5, 0.96, 0.84, 0.76], [0.84, 0.76, 0.86, 0.08], [0.68, -0.14, 0.44, 0.02]],
  V: [[0.08, 0.04, 0.48, 0.96], [0.48, 0.96, 0.92, 0.04]],
  W: [[0.04, 0.04, 0.26, 0.96], [0.26, 0.96, 0.5, 0.38], [0.5, 0.38, 0.74, 0.96], [0.74, 0.96, 0.96, 0.04]],
  X: [[0.1, 0.04, 0.9, 0.96], [0.9, 0.04, 0.1, 0.96]],
  Y: [[0.1, 0.04, 0.5, 0.52], [0.9, 0.04, 0.5, 0.52], [0.5, 0.52, 0.48, 0.98]],
  Z: [[0.1, 0.08, 0.9, 0.04], [0.9, 0.04, 0.1, 0.94], [0.1, 0.94, 0.92, 0.9]],
  "0": [[0.48, 0.04, 0.14, 0.28], [0.14, 0.28, 0.16, 0.76], [0.16, 0.76, 0.52, 0.96], [0.52, 0.96, 0.86, 0.72], [0.86, 0.72, 0.82, 0.24], [0.82, 0.24, 0.48, 0.04], [0.22, 0.78, 0.78, 0.22]],
  "!": [[0.5, 0.04, 0.48, 0.68], [0.48, 0.86, 0.5, 0.96]],
  "?": [[0.18, 0.22, 0.5, 0.06], [0.5, 0.06, 0.84, 0.24], [0.84, 0.24, 0.48, 0.56], [0.48, 0.56, 0.48, 0.7], [0.48, 0.86, 0.5, 0.96]],
};

/**
 * Mensajes pintados/desgarrados con sangre sobre la pared ("CORRE", "NO MIRES ATRÁS", "ÉL TE VE", etc.):
 * Usa glifos vectoriales trazados con filamentos de dedos ensangrentados, doble repaso frenetico,
 * salpicaduras por latigazo y chorreones viscosos que caen de cada letra.
 */
export function scribble(text: string, color: string, seed: number): THREE.CanvasTexture {
  const W = 1024, H = 320;
  const { c, ctx } = makeCanvas(W, H);
  const pal = buildPigmentPalette(color);
  const upper = (text || "CORRE").toUpperCase();

  // 1) Halo de mugre, tizne y penumbra de fondo integrado con el muro sucio
  ambientWallGrime(ctx, W, H, W * 0.5, H * 0.5, W * 0.48, H * 0.45, seed);

  // Calculo de tamano y espaciado segun la longitud del mensaje
  const chars = Array.from(upper);
  const units = chars.reduce((acc, ch) => acc + (ch === " " ? 0.52 : 1.0), 0);
  const padX = 64;
  const availW = W - padX * 2;
  const cellW = Math.min(132, availW / Math.max(1, units));
  const glyphW = cellW * 0.76;
  const glyphH = Math.min(162, Math.max(82, cellW * 1.42));
  const strokeW = Math.max(9.5, Math.min(20, cellW * 0.165));
  const totalW = units * cellW;
  let curX = (W - totalW) * 0.5;
  const baseY = 54;

  // Mancha sucia de fondo (como si hubieran limpiado o arrastrado el antebrazo antes de escribir)
  ctx.save();
  ctx.strokeStyle = pal.stain;
  ctx.lineCap = "round";
  ctx.lineWidth = glyphH * 0.55;
  ctx.beginPath();
  ctx.moveTo(curX + 20, baseY + glyphH * 0.52);
  ctx.bezierCurveTo(W * 0.35, baseY + glyphH * 0.38, W * 0.65, baseY + glyphH * 0.64, curX + totalW - 20, baseY + glyphH * 0.48);
  ctx.stroke();
  ctx.restore();

  const dripAnchors: [number, number][] = [];

  // 2) Trazado de cada caracter con el motor de filamentos de sangre + repaso frenetico
  chars.forEach((ch, idx) => {
    if (ch === " ") {
      curX += cellW * 0.52;
      return;
    }
    const segs = HORROR_GLYPHS[ch] ?? HORROR_GLYPHS.X;
    const jitterY = (hash2(idx, 1, seed) - 0.5) * 26;
    const jitterX = (hash2(idx, 2, seed) - 0.5) * 8;
    const slant = (hash2(idx, 3, seed) - 0.5) * 0.24;
    const scaleY = 0.9 + hash2(idx, 4, seed) * 0.28;
    const gx = curX + jitterX;
    const gy = baseY + jitterY;

    ctx.save();
    ctx.translate(gx + glyphW * 0.5, gy + glyphH * 0.5);
    ctx.rotate(slant);
    ctx.scale(1, scaleY);
    ctx.translate(-glyphW * 0.5, -glyphH * 0.5);

    segs.forEach(([ax, ay, bx, by], sIdx) => {
      const x0 = ax * glyphW + (hash2(idx * 17 + sIdx, 5, seed) - 0.5) * 6;
      const y0 = ay * glyphH + (hash2(idx * 17 + sIdx, 6, seed) - 0.5) * 6;
      const x1 = bx * glyphW + (hash2(idx * 17 + sIdx, 7, seed) - 0.5) * 8;
      const y1 = by * glyphH + (hash2(idx * 17 + sIdx, 8, seed) - 0.5) * 8;

      raggedBloodStroke(ctx, pal, x0, y0, x1, y1, strokeW, seed + idx * 31 + sIdx * 7);

      // Segundo repaso desesperado (doble trazo desplazado en palabras cortas o trazos verticales)
      if (chars.length <= 7 || hash2(idx, 9 + sIdx, seed) > 0.45) {
        raggedBloodStroke(
          ctx,
          pal,
          x0 + (hash2(idx, 15 + sIdx, seed) - 0.5) * 9,
          y0 + (hash2(idx, 16 + sIdx, seed) - 0.5) * 7,
          x1 + (hash2(idx, 17 + sIdx, seed) - 0.5) * 11,
          y1 + (hash2(idx, 18 + sIdx, seed) - 0.5) * 9,
          strokeW * 0.68,
          seed + 401 + idx * 19 + sIdx,
        );
      }
    });

    ctx.restore();

    // Anclar chorreones exactamente en la base de cada letra
    dripAnchors.push([gx + glyphW * (0.2 + hash2(idx, 20, seed) * 0.6), gy + glyphH * 0.88]);
    if (chars.length <= 6) {
      dripAnchors.push([gx + glyphW * (0.15 + hash2(idx, 21, seed) * 0.7), gy + glyphH * 0.76]);
    }

    // Salpicaduras alrededor de cada letra por la violencia del trazo
    splatterBurst(ctx, pal, gx + glyphW * 0.5, gy + glyphH * 0.5, glyphW * 0.85, glyphH * 0.75, chars.length <= 6 ? 24 : 14, seed + idx * 53);

    curX += cellW * (0.94 + hash2(idx, 22, seed) * 0.12);
  });

  // 3) En palabras urgentes ("CORRE", "AYUDA", "HAMBRE"), anadir un subrayado/tachon desgarrado y rastro de arrastre
  if (chars.length <= 6 || hash2(99, 1, seed) > 0.55) {
    const ux0 = (W - totalW) * 0.5 - 12;
    const ux1 = (W + totalW) * 0.5 + 16;
    const uy0 = baseY + glyphH + 14 + (hash2(98, 2, seed) - 0.5) * 12;
    const uy1 = baseY + glyphH + 4 + (hash2(98, 3, seed) - 0.5) * 16;
    raggedBloodStroke(ctx, pal, ux0, uy0, ux1, uy1, strokeW * 0.82, seed + 888);

    // Huellas de dedos resbalando desesperadamente hacia abajo bajo la palabra
    ctx.save();
    ctx.lineCap = "round";
    for (let f = 0; f < 4; f++) {
      const fx = ux0 + (ux1 - ux0) * (0.2 + f * 0.2) + (hash2(f, 30, seed) - 0.5) * 12;
      ctx.strokeStyle = f % 2 === 0 ? pal.crust : pal.base;
      ctx.globalAlpha = 0.32 + hash2(f, 31, seed) * 0.35;
      ctx.lineWidth = 3.5 + hash2(f, 32, seed) * 4;
      ctx.beginPath();
      ctx.moveTo(fx, uy0 + 10);
      ctx.quadraticCurveTo(fx + (hash2(f, 33, seed) - 0.5) * 14, uy0 + 42, fx + (hash2(f, 34, seed) - 0.5) * 10, uy0 + 78);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 4) Chorreones largos y viscosos naciendo de los trazos de las letras
  dripAnchors.forEach(([dx, dy], i) => {
    organicDrips(ctx, pal, dx - 14, dx + 14, dy, 2, 124, seed + i * 29, 10);
  });

  speckleErase(ctx, W, H, 360, seed);
  applyDecalWallVignette(ctx, W, H, 36, 24);
  return toTexture(c, true, false);
}

function eyes(color: string, seed: number): THREE.CanvasTexture {
  const W = 384, H = 192;
  const { c, ctx } = makeCanvas(W, H);
  const pal = buildPigmentPalette(color);
  ctx.lineCap = "round";

  ambientWallGrime(ctx, W, H, W * 0.5, 96, W * 0.46, H * 0.45, seed);

  for (const [idx, cx] of [118, 266].entries()) {
    // Contorno almendrado desgarrado en multiples pasadas
    for (let k = 0; k < 3; k++) {
      ctx.strokeStyle = k === 0 ? pal.crust : pal.base;
      ctx.lineWidth = 8 - k * 2;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.ellipse(
        cx + (hash2(idx, k, seed) - 0.5) * 4,
        88 + (hash2(idx, k + 4, seed) - 0.5) * 4,
        52 + (hash2(idx, k + 8, seed) - 0.5) * 5,
        34 + (hash2(idx, k + 12, seed) - 0.5) * 4,
        (hash2(idx, 19, seed) - 0.5) * 0.12,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    }
    // Pupila dilatada y humeda
    const px = cx + (hash2(1, 1, seed) - 0.5) * 14;
    const py = 90 + (hash2(2, 1, seed) - 0.5) * 8;
    ctx.fillStyle = pal.crust;
    ctx.beginPath(); ctx.arc(px, py, 20, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = pal.wet;
    ctx.beginPath(); ctx.arc(px, py, 12, 0, Math.PI * 2); ctx.fill();
  }
  organicDrips(ctx, pal, 74, 310, 118, 8, 68, seed, 12);
  speckleErase(ctx, W, H, 180, seed);
  applyDecalWallVignette(ctx, W, H, 24, 20);
  return toTexture(c, true, false);
}

function pacman(color: string, seed: number): THREE.CanvasTexture {
  const { c, ctx } = makeCanvas(512, 128);
  const pal = buildPigmentPalette(color);
  ambientWallGrime(ctx, 512, 128, 256, 64, 240, 56, seed);
  ctx.fillStyle = pal.base; ctx.strokeStyle = pal.crust;
  // pacman con la boca abierta y colmillos garabateados persiguiendo puntos
  ctx.beginPath(); ctx.moveTo(70, 64); ctx.arc(70, 64, 46, 0.55, Math.PI * 2 - 0.55); ctx.closePath(); ctx.fill();
  ctx.lineWidth = 3; ctx.stroke();
  for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(150 + i * 46, 64, 6.5, 0, Math.PI * 2); ctx.fill(); }
  // fantasma pequeno
  ctx.beginPath(); ctx.arc(420, 70, 30, Math.PI, 0); ctx.lineTo(450, 104);
  for (let i = 0; i < 3; i++) { ctx.lineTo(450 - (i + 0.5) * 20, 94); ctx.lineTo(450 - (i + 1) * 20, 104); }
  ctx.closePath(); ctx.fill();
  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath(); ctx.arc(408, 66, 8, 0, Math.PI * 2); ctx.arc(432, 66, 8, 0, Math.PI * 2); ctx.fill();
  ctx.globalCompositeOperation = "source-over";
  organicDrips(ctx, pal, 35, 455, 92, 7, 34, seed, 8);
  speckleErase(ctx, 512, 128, 160, seed);
  applyDecalWallVignette(ctx, 512, 128, 28, 16);
  return toTexture(c, true, false);
}

function warning(seed: number): THREE.CanvasTexture {
  const { c, ctx } = makeCanvas(256, 256);
  ctx.fillStyle = "#e6b800"; ctx.strokeStyle = "#16130a"; ctx.lineWidth = 12; ctx.lineJoin = "round";
  ctx.beginPath(); ctx.moveTo(128, 22); ctx.lineTo(238, 222); ctx.lineTo(18, 222); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#16130a"; ctx.font = "bold 130px Arial, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("!", 128, 148);
  speckleErase(ctx, 256, 256, 220, seed);
  return toTexture(c, true, false);
}

function sign(text: string, seed: number): THREE.CanvasTexture {
  const { c, ctx } = makeCanvas(512, 160);
  ctx.fillStyle = "#c9c9b8"; ctx.fillRect(0, 0, 512, 160);
  ctx.strokeStyle = "#1c2c28"; ctx.lineWidth = 8; ctx.strokeRect(8, 8, 496, 144);
  ctx.fillStyle = "#16241f"; ctx.font = "bold 74px Arial, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(text, 256, 84);
  // oxidacion y suciedad
  ctx.globalAlpha = 0.5;
  for (let i = 0; i < 18; i++) { ctx.fillStyle = hash2(i, 1, seed) > 0.5 ? "#6a4a28" : "#3a352a"; ctx.beginPath(); ctx.arc(hash2(i, 2, seed) * 512, hash2(i, 3, seed) * 160, 6 + hash2(i, 4, seed) * 26, 0, Math.PI * 2); ctx.fill(); }
  ctx.globalAlpha = 1;
  return toTexture(c, true, false);
}

function neon(text: string, color: string): THREE.CanvasTexture {
  const { c, ctx } = makeCanvas(512, 160);
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = "bold 78px Arial Black, Arial, sans-serif";
  ctx.shadowColor = color; ctx.shadowBlur = 24; ctx.strokeStyle = color; ctx.lineWidth = 6;
  ctx.strokeText(text, 256, 82); ctx.strokeText(text, 256, 82);
  ctx.shadowBlur = 0; ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2; ctx.strokeText(text, 256, 82);
  return toTexture(c, true, false);
}

function drip(color: string, seed: number): THREE.CanvasTexture {
  const { c, ctx } = makeCanvas(256, 256);
  const pal = buildPigmentPalette(color);
  ambientWallGrime(ctx, 256, 256, 128, 30, 120, 35, seed);
  ctx.fillStyle = pal.crust;
  ctx.fillRect(0, 0, 256, 14);
  ctx.fillStyle = pal.base;
  ctx.fillRect(0, 0, 256, 9);
  organicDrips(ctx, pal, 6, 250, 8, 16, 232, seed, 6);
  speckleErase(ctx, 256, 256, 130, seed);
  applyDecalWallVignette(ctx, 256, 256, 20, 16);
  return toTexture(c, true, false);
}

interface Built { tex: THREE.CanvasTexture; aspect: number; spec: DecalSpec }

/**
 * Expande cada DecalSpec en variantes ricas (p. ej. todas las frases de `scribble` como "CORRE", "NO MIRES ATRÁS",
 * y multiples semillas de huellas de mano derecha/izquierda y aranazos) para que las paredes tengan variedad real.
 */
function expandSpecs(specs: DecalSpec[]): { spec: DecalSpec; text: string; seedOffset: number }[] {
  const out: { spec: DecalSpec; text: string; seedOffset: number }[] = [];
  specs.forEach((s, idx) => {
    if (s.texts && s.texts.length > 0) {
      // Repartir el peso entre los textos, dando un ligero refuerzo a mensajes cortos icónicos como "CORRE" o "AYUDA"
      const boosts = s.texts.map((t) => (t === "CORRE" || t === "AYUDA" || t === "ÉL TE VE" ? 1.45 : 1.0));
      const sumB = boosts.reduce((a, b) => a + b, 0);
      s.texts.forEach((t, ti) => {
        out.push({
          spec: { ...s, weight: s.weight * (boosts[ti] / sumB) },
          text: t,
          seedOffset: idx * 37 + ti * 19,
        });
      });
    } else if (s.kind === "hand" || s.kind === "smear" || s.kind === "scratch") {
      const variants = s.kind === "hand" ? 3 : 2;
      for (let v = 0; v < variants; v++) {
        out.push({
          spec: { ...s, weight: s.weight / variants },
          text: "",
          seedOffset: idx * 37 + v * 11,
        });
      }
    } else {
      out.push({ spec: s, text: "", seedOffset: idx * 37 });
    }
  });
  return out;
}

function build(entry: { spec: DecalSpec; text: string; seedOffset: number }, i: number): Built {
  const { spec, text, seedOffset } = entry;
  const seed = 17 + i * 13 + seedOffset;
  let tex: THREE.CanvasTexture;
  let aspect = 1;
  switch (spec.kind) {
    case "hand": tex = handprint(spec.color, seed); aspect = 0.75; break;
    case "smear": tex = smear(spec.color, seed); aspect = 2; break;
    case "scratch": tex = scratch(spec.color, seed); aspect = 1; break;
    case "scribble": tex = scribble(text, spec.color, seed); aspect = 3.2; break;
    case "eyes": tex = eyes(spec.color, seed); aspect = 2; break;
    case "pacman": tex = pacman(spec.color, seed); aspect = 4; break;
    case "warning": tex = warning(seed); break;
    case "sign": tex = sign(text, seed); aspect = 3.2; break;
    case "neon": tex = neon(text, spec.color); aspect = 3.2; break;
    default: tex = drip(spec.color, seed); break;
  }
  return { tex, aspect, spec };
}

/** Coloca decals en caras de pared expuestas (determinista por semilla del nivel). */
export function buildDecals(sim: Simulation, specs: DecalSpec[], density = 1): THREE.Group {
  const group = new THREE.Group();
  if (!specs.length) return group;
  const { maze } = sim;
  const rng = mulberry32(sim.level.seed ^ 0xdec41);
  const faces: { x: number; z: number; nx: number; nz: number }[] = [];
  const spawn = maze.cellToWorld(sim.layout.player[0], sim.layout.player[1]);
  for (let y = 1; y < maze.H - 1; y++) for (let x = 1; x < maze.W - 1; x++) {
    if (maze.rows[y][x] !== "#") continue;
    const w = maze.cellToWorld(x, y);
    for (const [nx, nz] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as const) {
      if (!maze.isWalkable(x + nx, y + nz)) continue;
      if (Math.hypot(w.x + nx * CELL / 2 - spawn.x, w.z + nz * CELL / 2 - spawn.z) < 5) continue;
      faces.push({ x: w.x + nx * (CELL / 2 + 0.012), z: w.z + nz * (CELL / 2 + 0.012), nx, nz });
    }
  }
  const expanded = expandSpecs(specs);
  const total = expanded.reduce((a, e) => a + e.spec.weight, 0);
  const count = Math.round((faces.length / 7) * density);
  const built = expanded.map((e, i) => build(e, i));
  const buckets = built.map(() => [] as { f: (typeof faces)[number]; w: number; h: number; y: number; rot: number; off: number }[]);
  for (let n = 0; n < count && faces.length; n++) {
    let r = rng() * total, si = 0;
    for (; si < expanded.length - 1; si++) { r -= expanded[si].spec.weight; if (r <= 0) break; }
    const fi = Math.floor(rng() * faces.length);
    const f = faces[fi];
    const b = built[si];
    const base = b.spec.kind === "sign" || b.spec.kind === "neon" ? 0.95 + rng() * 0.35 : b.spec.kind === "scribble" || b.spec.kind === "pacman" ? 1.55 + rng() * 0.5 : b.spec.kind === "hand" ? 0.82 + rng() * 0.42 : 0.72 + rng() * 0.58;
    const h = base * (b.aspect > 1.5 ? 0.48 : 1);
    const w = h * b.aspect;
    const yy = b.spec.kind === "drip" ? WALL_H - h / 2 - 0.05
      : b.spec.kind === "neon" || b.spec.kind === "sign" ? 2.0 + rng() * 0.5
      : 0.85 + rng() * (WALL_H - 1.9);
    buckets[si].push({ f, w, h, y: yy, rot: b.spec.kind === "hand" || b.spec.kind === "scratch" ? (rng() - 0.5) * 0.65 : (rng() - 0.5) * 0.09, off: (rng() - 0.5) * Math.max(0.1, (CELL - w) * 0.7) });
    faces.splice(fi, 1);
  }
  const plane = new THREE.PlaneGeometry(1, 1);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion(), qz = new THREE.Quaternion(), pos = new THREE.Vector3(), sc = new THREE.Vector3();
  built.forEach((b, i) => {
    const list = buckets[i];
    if (!list.length) return;
    const glow = b.spec.kind === "neon";
    const isBloodLike = b.spec.kind === "hand" || b.spec.kind === "smear" || b.spec.kind === "scribble" || b.spec.kind === "drip";
    const mat = glow
      ? new THREE.MeshBasicMaterial({ map: b.tex, transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2 })
      : new THREE.MeshStandardMaterial({
          map: b.tex,
          transparent: true,
          depthWrite: false,
          // Rugosidad mas baja en sangre para que brille con reflejo humedo bajo la linterna
          roughness: b.spec.kind === "sign" || b.spec.kind === "warning" ? 0.52 : isBloodLike ? 0.22 : 0.35,
          metalness: isBloodLike ? 0.08 : 0,
          polygonOffset: true,
          polygonOffsetFactor: -3,
          polygonOffsetUnits: -3,
          alphaTest: b.spec.kind === "sign" ? 0.5 : 0.008,
        });
    const mesh = new THREE.InstancedMesh(plane, mat, list.length);
    list.forEach((d, k) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(d.f.nx, d.f.nz));
      qz.setFromAxisAngle(new THREE.Vector3(0, 0, 1), d.rot);
      q.multiply(qz);
      // desplazamiento a lo largo de la pared (tangente)
      const tx = d.f.nz, tz = -d.f.nx;
      pos.set(d.f.x + tx * d.off, d.y, d.f.z + tz * d.off);
      sc.set(d.w, d.h, 1);
      m4.compose(pos, q, sc);
      mesh.setMatrixAt(k, m4);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    group.add(mesh);
  });
  return group;
}

// ----------------------------------------------------------------------------------------------
// Catalogos de decals por tema
// ----------------------------------------------------------------------------------------------

const BLOOD = "#7d0b0e";

export const DECALS: Record<string, DecalSpec[]> = {
  offices: [
    { kind: "hand", color: BLOOD, weight: 3 },
    { kind: "smear", color: BLOOD, weight: 2 },
    { kind: "scratch", color: "#d8d0a8", weight: 2 },
    { kind: "scribble", color: BLOOD, weight: 3.5, texts: ["CORRE", "NO MIRES ATRÁS", "ÉL TE VE", "WAKA WAKA", "HAMBRE", "NO HAY SALIDA", "SIGUE COMIENDO", "ESTÁN AQUÍ"] },
    { kind: "pacman", color: "#3a2a10", weight: 1.5 },
  ],
  pool: [
    { kind: "hand", color: "#1e4a2a", weight: 2 },
    { kind: "scribble", color: "#27552f", weight: 3, texts: ["NO RESPIRES", "BAJO EL AGUA", "ELLOS ESCUCHAN", "NADA", "SIGUE NADANDO"] },
    { kind: "drip", color: "#2a5a3a", weight: 3 },
    { kind: "eyes", color: "#103a30", weight: 1.5 },
    { kind: "sign", color: "#000", weight: 1, texts: ["PROFUNDIDAD 2M", "PROHIBIDO CORRER", "CERRADO"] },
  ],
  arcade: [
    { kind: "neon", color: "#ff2fa0", weight: 2, texts: ["INSERT COIN", "GAME OVER", "1UP", "HI-SCORE ???"] },
    { kind: "neon", color: "#2ee6ff", weight: 2, texts: ["NO PARES", "READY?", "WAKA WAKA"] },
    { kind: "eyes", color: "#ff2fa0", weight: 1.5 },
    { kind: "pacman", color: "#ffd21a", weight: 2 },
    { kind: "hand", color: BLOOD, weight: 2 },
    { kind: "scribble", color: BLOOD, weight: 2, texts: ["CORRE", "HAMBRE", "TE VEO", "JUEGA CONMIGO"] },
  ],
  boiler: [
    { kind: "warning", color: "#000", weight: 3 },
    { kind: "sign", color: "#000", weight: 2.5, texts: ["PELIGRO", "NO ENTRAR", "VÁLVULA 3", "ALTA PRESIÓN"] },
    { kind: "hand", color: "#4a0808", weight: 2 },
    { kind: "smear", color: "#5c0909", weight: 1.5 },
    { kind: "scribble", color: BLOOD, weight: 2, texts: ["CORRE", "CALOR", "ABAJO", "NO SUBAS", "AÚN LATE"] },
  ],
  ward: [
    { kind: "smear", color: BLOOD, weight: 3 },
    { kind: "hand", color: BLOOD, weight: 3 },
    { kind: "sign", color: "#000", weight: 2.5, texts: ["SALA 7", "SILENCIO", "CUARENTENA", "ALA NORTE"] },
    { kind: "scribble", color: BLOOD, weight: 3, texts: ["CORRE", "AYUDA", "NO LOS DESPIERTES", "PACIENTE 000", "TODOS JUGAMOS"] },
    { kind: "scratch", color: "#cfd8c8", weight: 1.5 },
  ],
  stomach: [
    { kind: "drip", color: "#9aa820", weight: 4 },
    { kind: "hand", color: "#5a040c", weight: 2.5 },
    { kind: "scribble", color: BLOOD, weight: 2, texts: ["CORRE", "HAMBRE", "DENTRO"] },
  ],
};

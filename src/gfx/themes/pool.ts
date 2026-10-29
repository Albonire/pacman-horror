// Tema "Las Piscinas" (Poolrooms): azulejos brillantes con moho, suelo con causticas y techo humedo.

import { fbmField, hash2, smoothstep, voronoiField } from "../noise";
import { Surface, blendPx, shadePx, type TexSet } from "../texkit";

export function poolWall(): TexSet {
  const W = 512, H = 704, T = 64;
  const S = new Surface(W, H, [176, 214, 214], 0.55, 0.2);
  const stain = fbmField(W, H, 3, 4, 5, 111);
  const algae = fbmField(W, H, 6, 9, 5, 113);
  const grime = fbmField(W, H, 16, 22, 3, 117);
  const streak = fbmField(W, H, 40, 2, 3, 119);
  const cracks = voronoiField(W, H, 8, 11, 121);

  S.pass((i, x, y, d, hg, rg) => {
    const v = y / H;
    const tx = Math.floor(x / T), ty = Math.floor(y / T);
    const lx = x % T, ly = y % T;
    const edge = Math.min(lx, T - 1 - lx, ly, T - 1 - ly);
    const grout = edge < 2.4;
    const shade = 0.93 + hash2(tx, ty, 7) * 0.12;
    const accent = ty === 5 || ty === 4 && hash2(tx, ty, 3) > 0.5;
    let r = 176 * shade, g = 214 * shade, b = 214 * shade;
    if (accent) { r = 70 * shade; g = 150 * shade; b = 178 * shade; }
    if (grout) { r = 138; g = 158; b = 156; }
    d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b;
    hg[i] = grout ? 0.22 : 0.55 - (edge < 7 ? (7 - edge) * 0.012 : 0);
    rg[i] = grout ? 0.85 : 0.14 + hash2(tx, ty, 5) * 0.1;

    // azulejos agrietados y faltantes
    const cr = 1 - smoothstep(0.0, 0.045, cracks.f2[i] - cracks.f1[i]);
    if (!grout && hash2(tx, ty, 11) > 0.72) { shadePx(d, i, 1 - cr * 0.55); hg[i] -= cr * 0.22; }
    if (!grout && hash2(tx, ty, 13) > 0.975) { blendPx(d, i, 30, 44, 42, 0.92); hg[i] = 0.08; rg[i] = 0.95; }

    // humedad y algas hacia abajo
    const al = smoothstep(0.5, 0.88, v) * smoothstep(0.52, 0.7, algae[i]);
    blendPx(d, i, 38, 92, 52, al * 0.7);
    rg[i] = rg[i] * (1 - al) + 0.35 * al;
    // linea de agua
    const wl = smoothstep(0.78, 0.8, v) * (1 - smoothstep(0.84, 0.9, v));
    blendPx(d, i, 120, 132, 96, wl * 0.45 * (0.5 + algae[i]));
    // moho en juntas
    if (grout) blendPx(d, i, 40, 70, 50, smoothstep(0.3, 0.9, v) * 0.6);
    // manchas y chorreones minerales
    shadePx(d, i, 1 - smoothstep(0.55, 0.75, stain[i]) * 0.22);
    shadePx(d, i, 1 - smoothstep(0.6, 0.72, streak[i]) * smoothstep(0.7, 0, v) * 0.25);
    shadePx(d, i, 1 - (grime[i] - 0.5) * 0.18);
    shadePx(d, i, 0.84 + 0.16 * smoothstep(0, 0.06, v));
  });
  return S.build(2.4);
}

export function poolFloor(): TexSet {
  const N = 512, T = 64;
  const S = new Surface(N, N, [164, 204, 210], 0.5, 0.2);
  const caus = voronoiField(N, N, 7, 7, 131);
  const caus2 = voronoiField(N, N, 11, 11, 137);
  const algae = fbmField(N, N, 4, 4, 5, 141);
  const dirt = fbmField(N, N, 12, 12, 4, 143);
  S.pass((i, x, y, d, hg, rg) => {
    const tx = Math.floor(x / T), ty = Math.floor(y / T);
    const lx = x % T, ly = y % T;
    const edge = Math.min(lx, T - 1 - lx, ly, T - 1 - ly);
    const grout = edge < 2.6;
    const shade = 0.9 + hash2(tx, ty, 17) * 0.16;
    d[i * 4] = (grout ? 120 : 164) * shade; d[i * 4 + 1] = (grout ? 148 : 204) * shade; d[i * 4 + 2] = (grout ? 150 : 210) * shade;
    hg[i] = grout ? 0.2 : 0.55;
    rg[i] = grout ? 0.8 : 0.18;
    // causticas estaticas (red de luz bajo el agua)
    const c1 = 1 - smoothstep(0.0, 0.07, caus.f2[i] - caus.f1[i]);
    const c2 = 1 - smoothstep(0.0, 0.06, caus2.f2[i] - caus2.f1[i]);
    const c = Math.min(1, c1 * 0.7 + c2 * 0.45);
    blendPx(d, i, 210, 255, 250, c * 0.4);
    // algas y suciedad
    blendPx(d, i, 40, 100, 62, smoothstep(0.55, 0.72, algae[i]) * 0.6);
    shadePx(d, i, 1 - (dirt[i] - 0.5) * 0.35);
    if (hash2(tx, ty, 19) > 0.96) { shadePx(d, i, 0.55); hg[i] -= 0.15; }
  });
  return S.build(1.8);
}

export function poolCeiling(): TexSet {
  const N = 512, T = 128;
  const S = new Surface(N, N, [204, 214, 212], 0.5, 0.5);
  const stain = fbmField(N, N, 4, 4, 5, 151);
  const mold = fbmField(N, N, 12, 12, 4, 153);
  S.pass((i, x, y, d, hg, rg) => {
    const lx = x % T, ly = y % T;
    const edge = Math.min(lx, T - 1 - lx, ly, T - 1 - ly);
    const frame = edge < 5;
    if (frame) { d[i * 4] = 150; d[i * 4 + 1] = 160; d[i * 4 + 2] = 160; hg[i] = 0.7; rg[i] = 0.4; }
    const n = (hash2(x, y, 23) - 0.5) * 12;
    d[i * 4] += n; d[i * 4 + 1] += n; d[i * 4 + 2] += n;
    const st = smoothstep(0.55, 0.7, stain[i]);
    blendPx(d, i, 150, 140, 90, st * 0.45);
    blendPx(d, i, 60, 98, 70, smoothstep(0.66, 0.78, mold[i]) * 0.6);
    hg[i] = frame ? 0.7 : 0.5 + (hash2(x, y, 29) - 0.5) * 0.05;
    // gotas de condensacion
    if (hash2(x >> 2, y >> 2, 31) > 0.992) { blendPx(d, i, 250, 255, 255, 0.7); rg[i] = 0.05; }
  });
  return S.build(1.6);
}

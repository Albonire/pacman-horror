// Tema "El Sanatorio": azulejo hospitalario verde, linoleo en damero y techo sucio con tubos.

import { fbmField, hash2, smoothstep, voronoiField } from "../noise";
import { Surface, blendPx, shadePx, type TexSet } from "../texkit";

export function wardWall(): TexSet {
  const W = 512, H = 704, T = 32;
  const S = new Surface(W, H, [206, 206, 180], 0.5, 0.75);
  const stain = fbmField(W, H, 3, 5, 5, 411);
  const peel = fbmField(W, H, 6, 9, 5, 413);
  const damp = fbmField(W, H, 5, 7, 4, 415);
  const grime = fbmField(W, H, 18, 26, 3, 417);
  const cracks = voronoiField(W, H, 10, 14, 419);
  const split = Math.floor(H * 0.58); // tope de azulejo

  S.pass((i, x, y, d, hg, rg) => {
    const v = y / H;
    if (y > split) {
      // azulejo verde palido
      const tx = Math.floor(x / T), ty = Math.floor((y - split) / T);
      const lx = x % T, ly = (y - split) % T;
      const edge = Math.min(lx, T - 1 - lx, ly, T - 1 - ly);
      const grout = edge < 1.6;
      const sh = 0.92 + hash2(tx, ty, 5) * 0.12;
      d[i * 4] = (grout ? 150 : 150) * sh; d[i * 4 + 1] = (grout ? 164 : 196) * sh; d[i * 4 + 2] = (grout ? 150 : 172) * sh;
      hg[i] = grout ? 0.22 : 0.55; rg[i] = grout ? 0.85 : 0.2;
      const cr = 1 - smoothstep(0.0, 0.04, cracks.f2[i] - cracks.f1[i]);
      if (!grout && hash2(tx, ty, 9) > 0.8) { shadePx(d, i, 1 - cr * 0.5); hg[i] -= cr * 0.2; }
      if (!grout && hash2(tx, ty, 11) > 0.98) { blendPx(d, i, 40, 30, 26, 0.9); hg[i] = 0.1; }
    } else {
      // pintura crema descascarada
      const n = (hash2(x, y, 3) - 0.5) * 8;
      d[i * 4] += n; d[i * 4 + 1] += n; d[i * 4 + 2] += n;
      const pe = smoothstep(0.63, 0.67, peel[i]);
      blendPx(d, i, 150, 142, 120, pe * 0.9);
      hg[i] -= pe * 0.1;
      blendPx(d, i, 110, 86, 40, smoothstep(0.52, 0.7, stain[i]) * 0.4);
    }
    // franja separadora de madera/esmalte
    if (Math.abs(y - split) < 6) { d[i * 4] = 92; d[i * 4 + 1] = 100; d[i * 4 + 2] = 82; hg[i] = 0.8; rg[i] = 0.35; }
    // humedad y mugre
    shadePx(d, i, 1 - smoothstep(0.55, 0.74, damp[i]) * smoothstep(0.3, 1, v) * 0.4);
    shadePx(d, i, 1 - (grime[i] - 0.5) * 0.2);
    // zocalo oscuro
    if (y > H - 24) { shadePx(d, i, 0.55); hg[i] = 0.62; }
    shadePx(d, i, 0.82 + 0.18 * smoothstep(0, 0.06, v));
  });
  return S.build(2.0);
}

export function wardFloor(): TexSet {
  const N = 512, T = 64;
  const S = new Surface(N, N, [180, 186, 168], 0.5, 0.4);
  const worn = fbmField(N, N, 4, 4, 5, 431);
  const dirt = fbmField(N, N, 12, 12, 4, 433);
  S.pass((i, x, y, d, hg, rg) => {
    const tx = Math.floor(x / T), ty = Math.floor(y / T);
    const dark = (tx + ty) % 2 === 0;
    const lx = x % T, ly = y % T;
    const edge = Math.min(lx, T - 1 - lx, ly, T - 1 - ly);
    const sh = 0.94 + hash2(tx, ty, 3) * 0.1;
    d[i * 4] = (dark ? 92 : 190) * sh; d[i * 4 + 1] = (dark ? 112 : 198) * sh; d[i * 4 + 2] = (dark ? 96 : 176) * sh;
    hg[i] = edge < 1.5 ? 0.35 : 0.52;
    rg[i] = 0.3 + (hash2(x, y, 5) - 0.5) * 0.1;
    const w = smoothstep(0.55, 0.72, worn[i]);
    blendPx(d, i, 140, 134, 112, w * 0.5);
    rg[i] = rg[i] * (1 - w) + 0.7 * w;
    shadePx(d, i, 1 - (dirt[i] - 0.5) * 0.3);
    // salpicaduras oscuras de sangre seca
    blendPx(d, i, 78, 12, 12, smoothstep(0.74, 0.8, dirt[i]) * 0.7);
  });
  return S.build(1.6);
}

export function wardCeiling(): TexSet {
  const N = 512, T = 128;
  const S = new Surface(N, N, [190, 192, 176], 0.5, 0.8);
  const stain = fbmField(N, N, 4, 4, 5, 441);
  const mold = fbmField(N, N, 11, 11, 4, 443);
  S.pass((i, x, y, d, hg, rg) => {
    const lx = x % T, ly = y % T;
    const edge = Math.min(lx, T - 1 - lx, ly, T - 1 - ly);
    const frame = edge < 4;
    if (frame) { d[i * 4] = 170; d[i * 4 + 1] = 170; d[i * 4 + 2] = 160; hg[i] = 0.68; rg[i] = 0.5; }
    const n = (hash2(x, y, 7) - 0.5) * 12;
    d[i * 4] += n; d[i * 4 + 1] += n; d[i * 4 + 2] += n;
    blendPx(d, i, 130, 100, 40, smoothstep(0.55, 0.7, stain[i]) * 0.5);
    blendPx(d, i, 50, 70, 50, smoothstep(0.66, 0.78, mold[i]) * 0.55);
    if (!frame) hg[i] = 0.5 + (hash2(x, y, 9) - 0.5) * 0.06;
  });
  return S.build(1.6);
}

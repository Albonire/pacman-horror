// Tema "El Subsuelo": bloques de hormigon pintados, herrumbre, rejillas metalicas y vigas.

import { fbmField, hash2, smoothstep, voronoiField } from "../noise";
import { Surface, blendPx, shadePx, type TexSet } from "../texkit";

export function boilerWall(): TexSet {
  const W = 512, H = 704, BW = 64, BH = 32;
  const S = new Surface(W, H, [108, 124, 108], 0.5, 0.88);
  const rust = fbmField(W, H, 5, 8, 5, 311);
  const streak = fbmField(W, H, 44, 2, 3, 313);
  const peel = fbmField(W, H, 7, 10, 5, 317);
  const wet = fbmField(W, H, 6, 6, 4, 319);
  const cracks = voronoiField(W, H, 9, 12, 321);

  S.pass((i, x, y, d, hg, rg) => {
    const v = y / H;
    const row = Math.floor(y / BH);
    const off = row % 2 ? BW / 2 : 0;
    const bx = Math.floor((x + off) / BW);
    const lx = (x + off) % BW, ly = y % BH;
    const edge = Math.min(lx, BW - 1 - lx, ly, BH - 1 - ly);
    const mortar = edge < 2.2;
    const shade = 0.92 + hash2(bx, row, 7) * 0.14;
    // pintura verde grisacea; el mortero queda mas claro
    d[i * 4] = (mortar ? 128 : 108) * shade; d[i * 4 + 1] = (mortar ? 134 : 124) * shade; d[i * 4 + 2] = (mortar ? 124 : 108) * shade;
    hg[i] = mortar ? 0.22 : 0.52 + (hash2(x, y, 3) - 0.5) * 0.06;
    rg[i] = mortar ? 0.95 : 0.72;

    // pintura descascarada: deja ver hormigon
    const pe = smoothstep(0.62, 0.66, peel[i]) * smoothstep(0.1, 0.6, 1 - v + 0.3);
    blendPx(d, i, 120, 116, 108, pe * 0.9);
    hg[i] -= pe * 0.1;
    rg[i] = rg[i] * (1 - pe) + 0.97 * pe;
    // oxido
    const ru = smoothstep(0.55, 0.78, rust[i]) * (0.4 + 0.6 * smoothstep(0.2, 0.9, v));
    blendPx(d, i, 150, 74, 30, ru * 0.65);
    // chorreones de herrumbre
    const sk = smoothstep(0.58, 0.72, streak[i]) * smoothstep(0.8, 0, v);
    blendPx(d, i, 120, 56, 24, sk * 0.55);
    // humedad
    const we = smoothstep(0.6, 0.76, wet[i]) * smoothstep(0.3, 1, v);
    shadePx(d, i, 1 - we * 0.45);
    rg[i] = Math.min(rg[i], 0.78 - we * 0.5);
    // grietas
    const cr = 1 - smoothstep(0.0, 0.03, cracks.f2[i] - cracks.f1[i]);
    if (hash2(Math.floor(x / 64), Math.floor(y / 64), 13) > 0.8) { shadePx(d, i, 1 - cr * 0.6); hg[i] -= cr * 0.2; }

    // banda de peligro amarilla y negra en la base
    if (y > H - 64) {
      const stripe = ((x + y) % 48) < 24;
      d[i * 4] = stripe ? 214 : 22; d[i * 4 + 1] = stripe ? 178 : 20; d[i * 4 + 2] = stripe ? 20 : 18;
      hg[i] = 0.58; rg[i] = 0.6;
      shadePx(d, i, 1 - smoothstep(0.55, 0.78, rust[i]) * 0.4);
    }
    shadePx(d, i, 0.8 + 0.2 * smoothstep(0, 0.07, v));
  });
  return S.build(2.4);
}

export function boilerFloor(): TexSet {
  const N = 512;
  const S = new Surface(N, N, [96, 94, 88], 0.5, 0.85);
  const oil = fbmField(N, N, 4, 4, 5, 331);
  const dirt = fbmField(N, N, 10, 10, 4, 333);
  const cracks = voronoiField(N, N, 6, 6, 335);
  S.pass((i, x, y, d, hg, rg) => {
    const n = (hash2(x, y, 3) - 0.5) * 22;
    d[i * 4] += n; d[i * 4 + 1] += n; d[i * 4 + 2] += n;
    hg[i] = 0.5 + (hash2(x, y, 4) - 0.5) * 0.14;
    const block = Math.floor(x / 128) + Math.floor(y / 128);
    if (block % 2 === 0) {
      // placa de acero con rombos
      const px = x % 24, py = y % 24;
      const dm = Math.abs(px - 12) + Math.abs(py - 12) < 7;
      d[i * 4] = 78; d[i * 4 + 1] = 82; d[i * 4 + 2] = 84;
      hg[i] = dm ? 0.8 : 0.45; rg[i] = dm ? 0.35 : 0.5;
      shadePx(d, i, 0.88 + hash2(x >> 4, y >> 4, 7) * 0.2);
    }
    const cr = 1 - smoothstep(0.0, 0.03, cracks.f2[i] - cracks.f1[i]);
    if (block % 2 !== 0) { shadePx(d, i, 1 - cr * 0.5); hg[i] -= cr * 0.2; }
    // manchas de aceite oscuras y brillantes
    const o = smoothstep(0.58, 0.7, oil[i]);
    shadePx(d, i, 1 - o * 0.55);
    rg[i] = rg[i] * (1 - o) + 0.1 * o;
    blendPx(d, i, 140, 70, 28, smoothstep(0.7, 0.85, dirt[i]) * 0.4);
    // junta de bloques
    const sx = Math.min(x % 128, 127 - (x % 128)), sy = Math.min(y % 128, 127 - (y % 128));
    if (Math.min(sx, sy) < 2) { shadePx(d, i, 0.55); hg[i] -= 0.15; }
  });
  return S.build(2.2);
}

export function boilerCeiling(): TexSet {
  const N = 512;
  const S = new Surface(N, N, [52, 50, 48], 0.5, 0.9);
  const soot = fbmField(N, N, 5, 5, 5, 341);
  const rust = fbmField(N, N, 9, 9, 4, 343);
  S.pass((i, x, y, d, hg, rg) => {
    const n = (hash2(x, y, 3) - 0.5) * 12;
    d[i * 4] += n; d[i * 4 + 1] += n; d[i * 4 + 2] += n;
    // vigas en I cada 128px
    const bx = x % 128;
    const beam = bx < 18;
    if (beam) { d[i * 4] = 70; d[i * 4 + 1] = 66; d[i * 4 + 2] = 62; hg[i] = 0.75 + (bx < 4 || bx > 14 ? 0.1 : 0); rg[i] = 0.55; }
    else hg[i] = 0.4 + (hash2(x, y, 5) - 0.5) * 0.12;
    shadePx(d, i, 1 - smoothstep(0.5, 0.75, soot[i]) * 0.5);
    blendPx(d, i, 140, 66, 26, smoothstep(0.62, 0.8, rust[i]) * 0.5);
  });
  return S.build(2.2);
}

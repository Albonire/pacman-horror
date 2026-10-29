// Tema "El Hambre": el laberinto es el interior de una criatura. Carne humeda, venas y bilis.

import { fbmField, hash2, smoothstep, valueNoise, voronoiField } from "../noise";
import { Surface, blendPx, shadePx, type TexSet } from "../texkit";

function fleshPass(S: Surface, seed: number, opts: { bile: boolean; wet: number; ridges: boolean }): void {
  const { w: W, h: H } = S;
  const mott = fbmField(W, H, 4, 4, 6, seed);
  const mott2 = fbmField(W, H, 10, 10, 4, seed + 7);
  const rid = fbmField(W, H, 5, 5, 5, seed + 11);
  const rid2 = fbmField(W, H, 9, 9, 4, seed + 13);
  const veins2 = voronoiField(W, H, 13, 13, seed + 17);
  const bile = fbmField(W, H, 3, 3, 5, seed + 23);
  S.pass((i, x, y, d, hg, rg) => {
    const u = x / W, v = y / H;
    // base carnosa con manchas
    const m = mott[i];
    d[i * 4] = 150 + (m - 0.5) * 60; d[i * 4 + 1] = 46 + (m - 0.5) * 24; d[i * 4 + 2] = 54 + (m - 0.5) * 20;
    blendPx(d, i, 214, 108, 112, smoothstep(0.6, 0.8, mott2[i]) * 0.4);
    // venas
    const ridge1 = 1 - Math.abs(2 * rid[i] - 1), ridge2 = 1 - Math.abs(2 * rid2[i] - 1);
    const e1 = Math.max(smoothstep(0.9, 0.975, ridge1), smoothstep(0.93, 0.985, ridge2) * 0.7);
    const e2 = (1 - smoothstep(0.0, 0.04, veins2.f2[i] - veins2.f1[i])) * 0.5;
    blendPx(d, i, 96, 6, 26, e1 * 0.9);
    blendPx(d, i, 70, 20, 96, e2 * 0.4);
    // pliegues (rugas) tipo estomago
    let ridge = 0;
    if (opts.ridges) {
      const w1 = Math.sin((u * 7 + mott[i] * 1.4) * Math.PI * 2) * 0.5 + 0.5;
      ridge = Math.pow(w1, 1.6);
      shadePx(d, i, 0.78 + ridge * 0.34);
    }
    hg[i] = 0.5 + ridge * 0.32 + e1 * 0.12 - e2 * 0.05 + (valueNoise(u, v, 40, 40, 3) - 0.5) * 0.06;
    rg[i] = 0.2 + (1 - opts.wet) * 0.5 + (mott2[i] - 0.5) * 0.2;
    // bilis amarillo-verdosa
    if (opts.bile) {
      const b = smoothstep(0.58, 0.68, bile[i]);
      blendPx(d, i, 150, 160, 40, b * 0.8);
      rg[i] = rg[i] * (1 - b) + 0.05 * b;
      hg[i] -= b * 0.08;
    }
    // la humedad aclara por zonas
    shadePx(d, i, 0.92 + (hash2(x, y, 3) - 0.5) * 0.08);
  });
}

export function stomachWall(): TexSet {
  const S = new Surface(512, 704, [150, 46, 54], 0.5, 0.25);
  fleshPass(S, 511, { bile: false, wet: 0.9, ridges: true });
  // las venas brillan un poco (se pulsa en el motor)
  const em = S.emit;
  em.fillStyle = "#000"; em.fillRect(0, 0, S.w, S.h);
  const rid = fbmField(S.w, S.h, 5, 5, 5, 522);
  const img = em.getImageData(0, 0, S.w, S.h);
  for (let i = 0; i < S.w * S.h; i++) {
    const e = smoothstep(0.9, 0.975, 1 - Math.abs(2 * rid[i] - 1));
    img.data[i * 4] = e * 120; img.data[i * 4 + 1] = e * 10; img.data[i * 4 + 2] = e * 28; img.data[i * 4 + 3] = 255;
  }
  em.putImageData(img, 0, 0);
  return S.build(3.4);
}

export function stomachFloor(): TexSet {
  const S = new Surface(512, 512, [140, 44, 52], 0.5, 0.2);
  fleshPass(S, 611, { bile: true, wet: 1, ridges: false });
  return S.build(2.8);
}

export function stomachCeiling(): TexSet {
  const S = new Surface(512, 512, [120, 38, 48], 0.5, 0.22);
  fleshPass(S, 711, { bile: false, wet: 0.95, ridges: true });
  return S.build(3.0);
}

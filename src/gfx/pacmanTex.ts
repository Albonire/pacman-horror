// Piel de Pac-Man: amarillo sucio y cuarteado, mugre, quemaduras y salpicaduras junto a la boca.

import { fbmField, hash2, smoothstep, voronoiField } from "./noise";
import { Surface, blendPx, shadePx, type TexSet } from "./texkit";

export function pacmanSkin(): TexSet {
  const W = 512, H = 256;
  const S = new Surface(W, H, [255, 214, 10], 0.5, 0.35);
  const cracks = voronoiField(W, H, 14, 7, 5);
  const dirt = fbmField(W, H, 5, 3, 5, 9);
  const fine = fbmField(W, H, 60, 30, 2, 13);
  const blood = fbmField(W, H, 9, 5, 4, 17);

  // salpicaduras de sangre: grandes manchas alrededor del frente (u ~ 0.25) y chorros
  S.color.save();
  S.color.fillStyle = "rgba(120,6,10,0.8)";
  for (let k = 0; k < 26; k++) {
    const cx = W * (0.14 + hash2(k, 1, 3) * 0.2), cy = H * (0.34 + hash2(k, 2, 3) * 0.4);
    const r = 2 + hash2(k, 3, 3) * 9;
    S.color.beginPath(); S.color.ellipse(cx, cy, r, r * (0.6 + hash2(k, 4, 3) * 0.9), hash2(k, 5, 3) * 3, 0, Math.PI * 2); S.color.fill();
    if (hash2(k, 6, 3) > 0.55) {
      S.color.fillRect(cx - 1.2, cy, 2.4, 14 + hash2(k, 7, 3) * 48);
    }
  }
  S.color.restore();

  S.pass((i, _x, y, d, hg, rg) => {
    const v = y / H;
    // sombreado base: ligeramente mas oscuro hacia los polos
    shadePx(d, i, 0.92 + 0.08 * Math.sin(v * Math.PI));
    // cuarteado
    const edge = cracks.f2[i] - cracks.f1[i];
    const crack = 1 - smoothstep(0.0, 0.05, edge);
    shadePx(d, i, 1 - crack * 0.3);
    hg[i] -= crack * 0.22;
    // mugre
    const dr = smoothstep(0.45, 0.72, dirt[i]);
    blendPx(d, i, 120, 84, 10, dr * 0.35);
    rg[i] = 0.25 + dr * 0.5;
    // poro fino
    const f = (fine[i] - 0.5) * 0.9;
    hg[i] += f * 0.07;
    shadePx(d, i, 1 + f * 0.06);
    // quemaduras
    const bu = smoothstep(0.76, 0.82, blood[i]) * smoothstep(0.1, 0.35, v) * smoothstep(0.9, 0.6, v);
    blendPx(d, i, 32, 20, 8, bu * 0.7);
    // la sangre existente mejora la rugosidad (humeda)
    const o = i * 4;
    if (d[o] > 90 && d[o + 1] < 40) { rg[i] = 0.3; hg[i] += 0.08; }
  });
  return S.build(1.6);
}

/** Encarnadura del interior de la boca (carne oscura con venas). */
export function mouthFlesh(): TexSet {
  const N = 256;
  const S = new Surface(N, N, [110, 14, 20], 0.5, 0.35);
  const veins = voronoiField(N, N, 6, 6, 21);
  const mott = fbmField(N, N, 6, 6, 4, 25);
  S.pass((i, x, y, d, hg, rg) => {
    const edge = veins.f2[i] - veins.f1[i];
    const vein = 1 - smoothstep(0.0, 0.07, edge);
    blendPx(d, i, 60, 4, 16, vein * 0.8);
    hg[i] += vein * 0.18;
    const m = (mott[i] - 0.5);
    shadePx(d, i, 1 + m * 0.6);
    blendPx(d, i, 200, 70, 80, smoothstep(0.62, 0.8, mott[i]) * 0.25);
    hg[i] += m * 0.1 + (hash2(x, y, 4) - 0.5) * 0.04;
    rg[i] = 0.25 + (1 - vein) * 0.1;
  });
  return S.build(2.0);
}

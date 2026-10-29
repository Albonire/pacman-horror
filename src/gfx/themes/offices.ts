// Tema "Oficinas amarillas" (Backrooms Nivel 0): papel tapiz mostaza, moqueta humeda y techo acustico.

import { fbmField, voronoiField, smoothstep, hash2 } from "../noise";
import { Surface, blendPx, shadePx, type Rgb, type TexSet } from "../texkit";

export const WALL_W = 512;
export const WALL_H_PX = 720;

export function officesWall(): TexSet {
  const W = WALL_W, H = WALL_H_PX;
  const S = new Surface(W, H, [203, 180, 94], 0.5, 0.9);

  // franjas verticales del papel
  S.color.save();
  for (let x = 0; x < W; x += 32) {
    S.color.fillStyle = (x / 32) % 2 === 0 ? "rgba(232,212,128,0.22)" : "rgba(150,124,52,0.16)";
    S.color.fillRect(x, 0, 16, H);
  }
  S.color.restore();

  // celosia de rombos + flor (estampado de los 70)
  const pw = 128, ph = 120;
  S.both((ctx, isH) => {
    ctx.save();
    for (let b = -1; b <= H / ph + 1; b++) for (let a = -1; a <= W / pw + 1; a++) {
      const cx = pw / 2 + a * pw + ((b & 1) ? pw / 2 : 0), cy = ph / 2 + b * ph;
      ctx.lineWidth = 2.6;
      ctx.strokeStyle = isH ? "rgba(255,255,255,0.35)" : "rgba(128,100,36,0.42)";
      ctx.beginPath();
      ctx.moveTo(cx, cy - 56); ctx.lineTo(cx + 58, cy); ctx.lineTo(cx, cy + 56); ctx.lineTo(cx - 58, cy); ctx.closePath();
      ctx.stroke();
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(cx, cy - 36); ctx.lineTo(cx + 38, cy); ctx.lineTo(cx, cy + 36); ctx.lineTo(cx - 38, cy); ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = isH ? "rgba(255,255,255,0.45)" : "rgba(122,94,30,0.48)";
      for (let k = 0; k < 4; k++) {
        ctx.save();
        ctx.translate(cx, cy); ctx.rotate((k * Math.PI) / 2);
        ctx.beginPath(); ctx.ellipse(0, -11, 5, 11, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      ctx.beginPath(); ctx.arc(cx, cy, 3.2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  });

  // zocalo
  const bb = 58;
  S.color.fillStyle = "rgb(72,50,30)"; S.color.fillRect(0, H - bb, W, bb);
  S.color.fillStyle = "rgb(116,84,52)"; S.color.fillRect(0, H - bb, W, 4);
  S.color.fillStyle = "rgb(36,24,14)"; S.color.fillRect(0, H - 9, W, 9);
  S.height.fillStyle = "rgb(190,190,190)"; S.height.fillRect(0, H - bb, W, bb);
  S.height.fillStyle = "rgb(250,250,250)"; S.height.fillRect(0, H - bb, W, 5);
  S.height.fillStyle = "rgb(120,120,120)"; S.height.fillRect(0, H - 9, W, 9);

  const stain = fbmField(W, H, 3, 4, 5, 11);
  const streakF = fbmField(W, H, 46, 2, 3, 23);
  const peelF = fbmField(W, H, 5, 7, 5, 37);
  const moldF = fbmField(W, H, 14, 18, 4, 41);
  const wetF = fbmField(W, H, 6, 8, 4, 53);

  S.pass((i, x, y, d, hg, rg) => {
    const v = y / H;
    const inBoard = y > H - bb;
    // grano de papel
    const grain = (hash2(x, y, 5) - 0.5) * 9;
    d[i * 4] += grain; d[i * 4 + 1] += grain; d[i * 4 + 2] += grain * 0.8;

    // mancha de humedad grande + oscurecimiento inferior
    const st = smoothstep(0.46, 0.7, stain[i]);
    const lowFactor = smoothstep(0.55, 1, v) * 0.5;
    shadePx(d, i, 1 - st * 0.28 - lowFactor * 0.16);
    blendPx(d, i, 96, 70, 30, st * 0.22);

    // chorreones desde el techo
    const sk = smoothstep(0.58, 0.72, streakF[i]) * smoothstep(0.75, 0.0, v) * 0.9;
    blendPx(d, i, 92, 64, 28, sk * 0.5);
    rg[i] -= sk * 0.2;

    if (!inBoard) {
      // papel desprendido que deja ver el yeso
      const pe = smoothstep(0.64, 0.665, peelF[i]);
      const rim = smoothstep(0.64, 0.655, peelF[i]) - smoothstep(0.665, 0.7, peelF[i]);
      if (pe > 0) {
        const tone = 150 + (hash2(x >> 1, y >> 1, 9) - 0.5) * 30;
        blendPx(d, i, tone, tone - 8, tone - 28, pe * 0.96);
        hg[i] -= 0.1 * pe;
        rg[i] = 0.95;
      }
      if (rim > 0) { shadePx(d, i, 1 - rim * 0.22); hg[i] += rim * 0.06; }
    }

    // moho en la parte baja
    const mo = smoothstep(0.62, 0.74, moldF[i]) * smoothstep(0.45, 0.95, v);
    blendPx(d, i, 58, 74, 46, mo * 0.55);

    // zonas humedas y brillantes
    const wet = smoothstep(0.7, 0.8, wetF[i]) * smoothstep(0.5, 1, v);
    rg[i] = Math.max(0.3, rg[i] - wet * 0.35);
    shadePx(d, i, 1 - wet * 0.1);

    // sombra de oclusion en el borde superior (encuentro con el techo)
    shadePx(d, i, 0.82 + 0.18 * smoothstep(0, 0.07, v));
    hg[i] += (hash2(x, y, 3) - 0.5) * 0.03;
  });
  return S.build(1.5);
}

const CARPET_N = 512;

export function officesFloor(): TexSet {
  const N = CARPET_N;
  const S = new Surface(N, N, [138, 114, 52], 0.5, 0.96);
  const stain = fbmField(N, N, 3, 3, 5, 61);
  const tuft = fbmField(N, N, 64, 64, 2, 67);
  const burn = fbmField(N, N, 9, 9, 3, 71);

  S.pass((i, x, y, d, hg, rg) => {
    const tx = Math.floor(x / 64), ty = Math.floor(y / 64);
    const tile = 0.94 + hash2(tx, ty, 17) * 0.1;
    const fiber = (hash2(x, y, 1) - 0.5) * 22 + (tuft[i] - 0.5) * 26;
    d[i * 4] = d[i * 4] * tile + fiber;
    d[i * 4 + 1] = d[i * 4 + 1] * tile + fiber * 0.92;
    d[i * 4 + 2] = d[i * 4 + 2] * tile + fiber * 0.7;
    hg[i] = 0.5 + (hash2(x, y, 2) - 0.5) * 0.28 + (tuft[i] - 0.5) * 0.22;
    // juntas de losetas de moqueta
    const mx = Math.min(x % 64, 63 - (x % 64)), my = Math.min(y % 64, 63 - (y % 64));
    const seam = 1 - smoothstep(0, 2.2, Math.min(mx, my));
    shadePx(d, i, 1 - seam * 0.14);
    hg[i] -= seam * 0.1;
    // manchas de humedad (mas oscuras y brillantes)
    const st = smoothstep(0.5, 0.68, stain[i]);
    shadePx(d, i, 1 - st * 0.42);
    blendPx(d, i, 70, 56, 28, st * 0.3);
    rg[i] = 0.96 - st * 0.4;
    // quemaduras / mugre localizada
    const bu = smoothstep(0.72, 0.8, burn[i]);
    shadePx(d, i, 1 - bu * 0.5);
  });
  return S.build(2.2);
}

export function officesCeiling(): TexSet {
  const N = CARPET_N;
  const S = new Surface(N, N, [184, 176, 150], 0.5, 0.95);
  const stain = fbmField(N, N, 3, 3, 5, 83);
  const cracks = voronoiField(N, N, 7, 7, 91);
  const t = 64; // 8 losetas por lado

  S.pass((i, x, y, d, hg, rg) => {
    const tx = Math.floor(x / t), ty = Math.floor(y / t);
    const missing = hash2(tx, ty, 29) < 0.045;
    const mx = Math.min(x % t, t - 1 - (x % t)), my = Math.min(y % t, t - 1 - (y % t));
    const edge = Math.min(mx, my);
    const isBar = edge < 2.6;
    const n = (hash2(x, y, 4) - 0.5) * 14;
    d[i * 4] += n; d[i * 4 + 1] += n; d[i * 4 + 2] += n * 0.9;
    hg[i] = 0.5 + (hash2(x, y, 6) - 0.5) * 0.12;
    // agujeros del panel acustico
    if (!isBar && hash2(x >> 1, y >> 1, 13) > 0.972) { shadePx(d, i, 0.6); hg[i] -= 0.25; }
    // fisuras
    const cr = 1 - smoothstep(0.0, 0.035, cracks.f2[i] - cracks.f1[i]);
    if (!isBar) { shadePx(d, i, 1 - cr * 0.3); hg[i] -= cr * 0.1; }
    // manchas de agua con borde marcado
    const sv = stain[i];
    const ring = smoothstep(0.55, 0.6, sv) - smoothstep(0.6, 0.64, sv);
    const fill = smoothstep(0.6, 0.7, sv);
    blendPx(d, i, 120, 92, 44, fill * 0.35 + ring * 0.45);
    // perfil metalico en T
    if (isBar) {
      d[i * 4] = 204; d[i * 4 + 1] = 200; d[i * 4 + 2] = 188;
      hg[i] = 0.72; rg[i] = 0.5;
    }
    if (missing && !isBar) {
      d[i * 4] = 18; d[i * 4 + 1] = 15; d[i * 4 + 2] = 10;
      hg[i] = 0.1;
      shadePx(d, i, 1);
    }
  });
  return S.build(2.4);
}

export const OFFICES_COLORS: { fog: Rgb } = { fog: [18, 15, 6] };

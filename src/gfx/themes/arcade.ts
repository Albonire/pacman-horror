// Tema "Salon Recreativo": paredes oscuras con neones, moqueta de confeti de los 80 y techo estrellado.

import { fbmField, hash2, smoothstep } from "../noise";
import { Surface, blendPx, shadePx, type TexSet } from "../texkit";

const NEON = ["#ff2fa0", "#2ee6ff", "#ffe14a", "#8a4cff", "#3dff9a", "#ff7a2f"];

export function arcadeWall(): TexSet {
  const W = 512, H = 704;
  const S = new Surface(W, H, [20, 13, 42], 0.5, 0.7);
  const grime = fbmField(W, H, 4, 6, 5, 211);
  const dirt = fbmField(W, H, 18, 26, 3, 213);

  // estrellas sueltas
  for (let k = 0; k < 150; k++) {
    const x = hash2(k, 1, 5) * W, y = hash2(k, 2, 5) * H * 0.7, r = 0.6 + hash2(k, 3, 5) * 1.4;
    for (const c of [S.color, S.emit]) {
      c.fillStyle = `rgba(190,200,255,${0.25 + hash2(k, 4, 5) * 0.55})`;
      c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    }
  }
  // franjas de neon horizontales con resplandor + zigzag
  const neon = (y: number, color: string, w: number, zig = false) => {
    for (const [ctx, glow] of [[S.color, 14], [S.emit, 22]] as const) {
      ctx.save();
      ctx.strokeStyle = color; ctx.lineWidth = w; ctx.shadowColor = color; ctx.shadowBlur = glow; ctx.lineCap = "round";
      ctx.beginPath();
      if (!zig) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
      else { for (let x = 0; x <= W; x += 32) { const yy = y + ((x / 32) % 2 ? 14 : -14); if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy); } }
      ctx.stroke();
      ctx.restore();
    }
    S.height.fillStyle = "rgba(255,255,255,0.55)";
    S.height.fillRect(0, y - w / 2, W, w);
  };
  neon(292, "#ff2fa0", 7);
  neon(322, "#2ee6ff", 5);
  neon(380, "#8a4cff", 3, true);
  // zocalo negro con linea violeta
  S.color.fillStyle = "#08060f"; S.color.fillRect(0, H - 60, W, 60);
  S.height.fillStyle = "rgb(190,190,190)"; S.height.fillRect(0, H - 60, W, 60);
  S.color.save(); S.color.strokeStyle = "#8a4cff"; S.color.shadowColor = "#8a4cff"; S.color.shadowBlur = 10; S.color.lineWidth = 3;
  S.color.beginPath(); S.color.moveTo(0, H - 61); S.color.lineTo(W, H - 61); S.color.stroke(); S.color.restore();
  S.emit.save(); S.emit.strokeStyle = "#8a4cff"; S.emit.shadowColor = "#8a4cff"; S.emit.shadowBlur = 14; S.emit.lineWidth = 3;
  S.emit.beginPath(); S.emit.moveTo(0, H - 61); S.emit.lineTo(W, H - 61); S.emit.stroke(); S.emit.restore();

  S.pass((i, x, y, d, hg) => {
    const v = y / H;
    const n = (hash2(x, y, 3) - 0.5) * 8;
    d[i * 4] += n; d[i * 4 + 1] += n; d[i * 4 + 2] += n;
    shadePx(d, i, 1 - smoothstep(0.5, 0.75, grime[i]) * 0.4);
    shadePx(d, i, 1 - (dirt[i] - 0.5) * 0.25 * smoothstep(0.4, 1, v));
    hg[i] += (hash2(x, y, 9) - 0.5) * 0.04;
    shadePx(d, i, 0.8 + 0.2 * smoothstep(0, 0.06, v));
    // pintura descascarada
    if (grime[i] > 0.7 && hash2(x >> 2, y >> 2, 2) > 0.5) { blendPx(d, i, 50, 44, 60, 0.5); hg[i] -= 0.08; }
  });
  return S.build(1.8);
}

export function arcadeFloor(): TexSet {
  const N = 512;
  const S = new Surface(N, N, [14, 11, 24], 0.5, 0.95);
  const wear = fbmField(N, N, 4, 4, 5, 221);
  const stain = fbmField(N, N, 7, 7, 4, 223);

  // confeti geometrico de moqueta de salon recreativo (con envoltura para que teselee)
  const shape = (ctx: CanvasRenderingContext2D, k: number, ox: number, oy: number) => {
    const x = hash2(k, 1, 7) * N + ox, y = hash2(k, 2, 7) * N + oy;
    const col = NEON[Math.floor(hash2(k, 3, 7) * NEON.length)];
    const s = 18 + hash2(k, 4, 7) * 30, rot = hash2(k, 5, 7) * Math.PI * 2, t = Math.floor(hash2(k, 6, 7) * 5);
    ctx.save();
    ctx.translate(x, y); ctx.rotate(rot);
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 4 + hash2(k, 7, 7) * 3; ctx.lineJoin = "round"; ctx.lineCap = "round";
    ctx.beginPath();
    if (t === 0) { ctx.moveTo(-s, s * 0.8); ctx.lineTo(0, -s); ctx.lineTo(s, s * 0.8); ctx.closePath(); ctx.stroke(); }
    else if (t === 1) { for (let q = -3; q <= 3; q++) { const px = q * s * 0.35, py = q % 2 ? s * 0.4 : -s * 0.4; if (q === -3) ctx.moveTo(px, py); else ctx.lineTo(px, py); } ctx.stroke(); }
    else if (t === 2) { ctx.arc(0, 0, s * 0.7, 0, Math.PI * 2); ctx.stroke(); }
    else if (t === 3) { ctx.rect(-s * 0.5, -s * 0.5, s, s); ctx.fill(); }
    else { ctx.moveTo(-s, -s * 0.5); ctx.lineTo(s * 0.2, -s * 0.5); ctx.lineTo(s * 0.2, s * 0.5); ctx.stroke(); }
    ctx.restore();
  };
  for (const ctx of [S.color, S.emit]) {
    ctx.globalAlpha = ctx === S.color ? 0.92 : 0.5;
    for (let k = 0; k < 64; k++) for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) shape(ctx, k, ox, oy);
    ctx.globalAlpha = 1;
  }

  S.pass((i, x, y, d, hg, rg) => {
    const f = (hash2(x, y, 5) - 0.5) * 26;
    d[i * 4] += f; d[i * 4 + 1] += f; d[i * 4 + 2] += f * 1.1;
    hg[i] = 0.5 + (hash2(x, y, 6) - 0.5) * 0.3;
    // desgaste: pierde color y brillo
    const w = smoothstep(0.55, 0.72, wear[i]);
    const gray = (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 3;
    blendPx(d, i, gray * 0.7, gray * 0.7, gray * 0.7, w * 0.6);
    shadePx(d, i, 1 - smoothstep(0.62, 0.78, stain[i]) * 0.5);
    rg[i] = 0.95;
  });
  return S.build(2.0);
}

export function arcadeCeiling(): TexSet {
  const N = 512;
  const S = new Surface(N, N, [9, 7, 16], 0.5, 0.9);
  const dirt = fbmField(N, N, 5, 5, 5, 231);
  // retícula de vigas
  S.color.strokeStyle = "rgba(60,50,92,0.9)"; S.color.lineWidth = 6;
  S.height.strokeStyle = "#ddd"; S.height.lineWidth = 8;
  for (let k = 0; k <= N; k += 128) for (const c of [S.color, S.height]) { c.beginPath(); c.moveTo(k, 0); c.lineTo(k, N); c.stroke(); c.beginPath(); c.moveTo(0, k); c.lineTo(N, k); c.stroke(); }
  for (let k = 0; k < 130; k++) {
    const x = hash2(k, 1, 9) * N, y = hash2(k, 2, 9) * N, r = 0.7 + hash2(k, 3, 9) * 1.5;
    const col = k % 9 === 0 ? "#ff6adf" : k % 7 === 0 ? "#6af4ff" : "#dfe6ff";
    for (const c of [S.color, S.emit]) { c.fillStyle = col; c.globalAlpha = 0.6 + hash2(k, 4, 9) * 0.4; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1; }
  }
  S.pass((i, x, y, d, hg) => {
    const n = (hash2(x, y, 4) - 0.5) * 6;
    d[i * 4] += n; d[i * 4 + 1] += n; d[i * 4 + 2] += n;
    shadePx(d, i, 1 - (dirt[i] - 0.5) * 0.4);
    hg[i] += (hash2(x, y, 6) - 0.5) * 0.05;
  });
  return S.build(1.6);
}

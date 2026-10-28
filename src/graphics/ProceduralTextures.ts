import * as THREE from "three";

// Ruido por valor 2D determinista (para manchas de humedad)
function makeNoise(seed: number): (x: number, y: number) => number {
  const h = (x: number, y: number) => {
    const n = Math.sin(x * 127.1 + y * 311.7 + seed * 13.7) * 43758.5453;
    return n - Math.floor(n);
  };
  return (x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}
function fbm(noise: (x: number, y: number) => number, x: number, y: number, oct = 4): number {
  let v = 0, amp = 0.5, freq = 1;
  for (let i = 0; i < oct; i++) {
    v += amp * noise(x * freq, y * freq);
    amp *= 0.5;
    freq *= 2.0;
  }
  return v;
}

function canvas(size: number): { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const c = document.createElement("canvas");
  c.width = size; c.height = size;
  const ctx = c.getContext("2d")!;
  return { c, ctx };
}

function tex(c: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 4;
  return t;
}

export interface TexSet { map: THREE.CanvasTexture; bump: THREE.CanvasTexture; rough: THREE.CanvasTexture; }

function buildSet(c: HTMLCanvasElement, bumpC: HTMLCanvasElement, roughC: HTMLCanvasElement): TexSet {
  return { map: tex(c, true), bump: tex(bumpC, false), rough: tex(roughC, false) };
}

// ---------- PAREDES ----------
function wallTexture(): TexSet {
  const S = 512;
  const { c, ctx } = canvas(S);
  const noise = makeNoise(7);

  // base ocre
  ctx.fillStyle = "#c8b568";
  ctx.fillRect(0, 0, S, S);

  // patrón geométrico chevron / rombos sutil (años 70)
  ctx.save();
  ctx.globalAlpha = 0.10;
  ctx.strokeStyle = "#8a7a45";
  ctx.lineWidth = 3;
  const step = 64;
  for (let y = -S; y < S * 2; y += step) {
    ctx.beginPath();
    for (let x = -S; x < S * 2; x += step) {
      ctx.moveTo(x, y);
      ctx.lineTo(x + step / 2, y + step / 2);
      ctx.lineTo(x + step, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 0.06;
  ctx.strokeStyle = "#e6d98f";
  for (let y = -S; y < S * 2; y += step) {
    ctx.beginPath();
    for (let x = -S; x < S * 2; x += step) {
      ctx.moveTo(x, y + step);
      ctx.lineTo(x + step / 2, y + step / 2);
      ctx.lineTo(x + step, y + step);
    }
    ctx.stroke();
  }
  ctx.restore();

  // manchas de humedad en el tercio inferior + chorrones verticales
  const img = ctx.getImageData(0, 0, S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const n = fbm(noise, x / 28, y / 28, 5);
      const lower = y > S * 0.55 ? (y - S * 0.55) / (S * 0.45) : 0;
      let stain = (n - 0.52) * 2.2 + lower * 0.9;
      if (stain > 0.15) {
        const i = (y * S + x) * 4;
        const dark = Math.min(90, stain * 130);
        img.data[i] -= dark;
        img.data[i + 1] -= dark * 0.85;
        img.data[i + 2] -= dark * 0.6;
      }
      // chorrones verticales desde arriba
      const streak = fbm(noise, x / 6, y / 90 + 100, 3);
      if (streak > 0.72 && y < S * 0.5) {
        const i = (y * S + x) * 4;
        img.data[i] -= 35; img.data[i + 1] -= 30; img.data[i + 2] -= 20;
      }
    }
  }
  ctx.putImageData(img, 0, 0);

  // zócalo marrón oscuro en la base
  ctx.fillStyle = "#3a2f1c";
  ctx.fillRect(0, S - 54, S, 54);
  ctx.fillStyle = "#2a2113";
  ctx.fillRect(0, S - 8, S, 8);

  // bump
  const { c: bc, ctx: bctx } = canvas(S);
  bctx.fillStyle = "#808080";
  bctx.fillRect(0, 0, S, S);
  bctx.strokeStyle = "#606060";
  bctx.lineWidth = 3;
  for (let y = -S; y < S * 2; y += step) {
    bctx.beginPath();
    for (let x = -S; x < S * 2; x += step) { bctx.moveTo(x, y); bctx.lineTo(x + step / 2, y + step / 2); bctx.lineTo(x + step, y); }
    bctx.stroke();
  }
  bctx.fillStyle = "#404040";
  bctx.fillRect(0, S - 54, S, 54);
  const bimg = bctx.getImageData(0, 0, S, S);
  for (let i = 0; i < bimg.data.length; i += 4) {
    const n = fbm(noise, (i / 4) % S / 30, Math.floor(i / 4 / S) / 30, 4);
    const d = (n - 0.5) * 40;
    bimg.data[i] += d; bimg.data[i + 1] += d; bimg.data[i + 2] += d;
  }
  bctx.putImageData(bimg, 0, 0);

  // roughness
  const { c: rc, ctx: rctx } = canvas(S);
  rctx.fillStyle = "#b0a060";
  rctx.fillRect(0, 0, S, S);
  rctx.fillStyle = "#d8c890";
  rctx.fillRect(0, S - 54, S, 54);

  return buildSet(c, bc, rc);
}

// ---------- SUELO ----------
function floorTexture(): TexSet {
  const S = 512;
  const { c, ctx } = canvas(S);
  const noise = makeNoise(21);
  ctx.fillStyle = "#8f7e4f";
  ctx.fillRect(0, 0, S, S);
  const img = ctx.getImageData(0, 0, S, S);
  for (let i = 0; i < img.data.length; i += 4) {
    const x = (i / 4) % S, y = Math.floor(i / 4 / S);
    const speck = (Math.random() - 0.5) * 46;
    const patch = fbm(noise, x / 60, y / 60, 3);
    const damp = patch > 0.66 ? -34 : 0;
    img.data[i] += speck + damp;
    img.data[i + 1] += speck * 0.9 + damp;
    img.data[i + 2] += speck * 0.7 + damp * 0.6;
  }
  ctx.putImageData(img, 0, 0);

  const { c: bc, ctx: bctx } = canvas(S);
  bctx.fillStyle = "#808080";
  bctx.fillRect(0, 0, S, S);
  const bimg = bctx.getImageData(0, 0, S, S);
  for (let i = 0; i < bimg.data.length; i += 4) {
    const d = (Math.random() - 0.5) * 70;
    bimg.data[i] += d; bimg.data[i + 1] += d; bimg.data[i + 2] += d;
  }
  bctx.putImageData(bimg, 0, 0);

  const { c: rc, ctx: rctx } = canvas(S);
  rctx.fillStyle = "#c0b090";
  rctx.fillRect(0, 0, S, S);
  return buildSet(c, bc, rc);
}

// ---------- TECHO ----------
function ceilingTexture(): TexSet {
  const S = 512;
  const { c, ctx } = canvas(S);
  const noise = makeNoise(33);
  ctx.fillStyle = "#9a927a";
  ctx.fillRect(0, 0, S, S);
  // rejilla de paneles acústicos
  ctx.strokeStyle = "#6f6857";
  ctx.lineWidth = 4;
  for (let i = 0; i <= S; i += 128) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, S); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(S, i); ctx.stroke();
  }
  // manchas de agua
  const img = ctx.getImageData(0, 0, S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n = fbm(noise, x / 40, y / 40, 4);
    if (n > 0.6) {
      const i = (y * S + x) * 4;
      const d = (n - 0.6) * 160;
      img.data[i] -= d * 0.5; img.data[i + 1] -= d * 0.45; img.data[i + 2] -= d * 0.3;
    }
  }
  ctx.putImageData(img, 0, 0);

  const { c: bc, ctx: bctx } = canvas(S);
  bctx.fillStyle = "#808080";
  bctx.fillRect(0, 0, S, S);
  bctx.strokeStyle = "#555555";
  bctx.lineWidth = 6;
  for (let i = 0; i <= S; i += 128) {
    bctx.beginPath(); bctx.moveTo(i, 0); bctx.lineTo(i, S); bctx.stroke();
    bctx.beginPath(); bctx.moveTo(0, i); bctx.lineTo(S, i); bctx.stroke();
  }
  const { c: rc, ctx: rctx } = canvas(S);
  rctx.fillStyle = "#9a9a9a";
  rctx.fillRect(0, 0, S, S);
  return buildSet(c, bc, rc);
}

// ---------- ESTÁTICO (ruido blanco) ----------
export function staticTexture(): THREE.CanvasTexture {
  const S = 256;
  const { c, ctx } = canvas(S);
  const img = ctx.createImageData(S, S);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 90 + Math.random() * 140;
    img.data[i] = v; img.data[i + 1] = v * 0.96; img.data[i + 2] = v * 0.9;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return tex(c, true);
}

export function makeTextures(): { wall: TexSet; floor: TexSet; ceiling: TexSet; staticTex: THREE.CanvasTexture } {
  return { wall: wallTexture(), floor: floorTexture(), ceiling: ceilingTexture(), staticTex: staticTexture() };
}

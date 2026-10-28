// Caras procedurales de los fantasmas (Canvas 2D). Se usan en el cuerpo 3D y, a mayor resolucion,
// en los sustos a pantalla completa.

import { hash2 } from "./noise";

export type FaceKind = 0 | 1 | 2 | 3; // Blinky, Pinky, Inky, Clyde
export type FaceMood = "calm" | "angry" | "scared" | "scream";

type Ctx = CanvasRenderingContext2D;

const TAU = Math.PI * 2;

function rnd(seed: number, i: number): number { return hash2(i, seed, 91); }

function radial(ctx: Ctx, x: number, y: number, r0: number, r1: number, stops: [number, string][]): CanvasGradient {
  const g = ctx.createRadialGradient(x, y, r0, x, y, r1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

/** Fila de dientes triangulares siguiendo un arco elipsoidal, apuntando hacia el centro. */
function teethArc(
  ctx: Ctx, cx: number, cy: number, rx: number, ry: number, a0: number, a1: number,
  n: number, len: number, wid: number, color: string, seed: number, inward = true,
): void {
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const a = a0 + (a1 - a0) * t;
    const jag = 0.65 + rnd(seed, i) * 0.75;
    const bx = cx + Math.cos(a) * rx, by = cy + Math.sin(a) * ry;
    const dirx = inward ? -Math.cos(a) : Math.cos(a), diry = inward ? -Math.sin(a) : Math.sin(a);
    const tx = -Math.sin(a), ty = Math.cos(a);
    const L = len * jag, W = wid * (0.8 + rnd(seed, i + 40) * 0.5);
    ctx.beginPath();
    ctx.moveTo(bx - tx * W, by - ty * W);
    ctx.lineTo(bx + dirx * L + (rnd(seed, i + 9) - 0.5) * W, by + diry * L);
    ctx.lineTo(bx + tx * W, by + ty * W);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = "rgba(40,10,10,0.7)";
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
}

function veins(ctx: Ctx, cx: number, cy: number, r: number, count: number, color: string, seed: number, width = 1.6): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  for (let i = 0; i < count; i++) {
    let a = rnd(seed, i) * TAU;
    let x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    ctx.lineWidth = width * (0.5 + rnd(seed, i + 50));
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 6; k++) {
      a += (rnd(seed, i * 10 + k) - 0.5) * 1.1 + Math.PI;
      x += Math.cos(a + Math.PI) * r * 0.18 * (1 - k * 0.1);
      y += Math.sin(a + Math.PI) * r * 0.18 * (1 - k * 0.1);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drips(ctx: Ctx, x0: number, x1: number, y: number, count: number, maxLen: number, color: string, seed: number): void {
  ctx.save();
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const x = x0 + (x1 - x0) * rnd(seed, i);
    const len = maxLen * (0.2 + rnd(seed, i + 30) * 0.8);
    const w = 2 + rnd(seed, i + 60) * 4;
    ctx.beginPath();
    ctx.moveTo(x - w / 2, y);
    ctx.lineTo(x + w / 2, y);
    ctx.lineTo(x + w / 2, y + len);
    ctx.arc(x, y + len, w / 2, 0, Math.PI);
    ctx.lineTo(x - w / 2, y);
    ctx.fill();
  }
  ctx.restore();
}

function socket(ctx: Ctx, x: number, y: number, rx: number, ry: number, rim: string, tilt = 0): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  ctx.shadowColor = rim;
  ctx.shadowBlur = rx * 0.45;
  ctx.fillStyle = radial(ctx, 0, 0, 0, rx * 1.1, [[0, "#000"], [0.7, "#050000"], [1, "rgba(10,0,0,0.0)"]]);
  ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, TAU); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = rim;
  ctx.lineWidth = Math.max(2, rx * 0.07);
  ctx.beginPath(); ctx.ellipse(0, 0, rx * 1.02, ry * 1.02, 0, 0, TAU); ctx.stroke();
  ctx.restore();
}

/** Borde difuminado del parche de la cara (para fundirlo con la tela). */
function featherMask(ctx: Ctx, w: number, h: number): void {
  ctx.save();
  ctx.globalCompositeOperation = "destination-in";
  ctx.fillStyle = radial(ctx, w / 2, h / 2, w * 0.28, w * 0.5, [[0, "rgba(0,0,0,1)"], [0.72, "rgba(0,0,0,1)"], [1, "rgba(0,0,0,0)"]]);
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

// ------------------------------------------------------------------------------------------------

function blinky(ctx: Ctx, S: number, mood: FaceMood): void {
  const u = S / 512;
  ctx.save();
  ctx.scale(u, u);
  // piel oscura enrojecida
  ctx.fillStyle = radial(ctx, 256, 250, 20, 300, [[0, "#6b0e0e"], [0.6, "#4a0808"], [1, "#2a0303"]]);
  ctx.fillRect(0, 0, 512, 512);
  veins(ctx, 256, 250, 230, 22, "rgba(20,0,0,0.55)", 3);
  // cicatriz vertical
  ctx.strokeStyle = "rgba(10,0,0,0.8)"; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(256, 60); ctx.lineTo(262, 170); ctx.stroke();
  // ojos hundidos
  const angry = mood === "angry" || mood === "scream";
  socket(ctx, 170, 205, 54, angry ? 36 : 54, "rgba(255,50,30,0.8)", angry ? 0.35 : 0);
  socket(ctx, 342, 205, 54, angry ? 36 : 54, "rgba(255,50,30,0.8)", angry ? -0.35 : 0);
  if (mood === "scared") {
    // ojos en X
    ctx.strokeStyle = "#e8e8ff"; ctx.lineWidth = 9;
    for (const x of [170, 342]) { ctx.beginPath(); ctx.moveTo(x - 24, 181); ctx.lineTo(x + 24, 229); ctx.moveTo(x + 24, 181); ctx.lineTo(x - 24, 229); ctx.stroke(); }
  }
  if (mood === "scream") {
    // boca enorme con tres filas de agujas
    ctx.fillStyle = radial(ctx, 256, 360, 10, 170, [[0, "#1a0000"], [0.6, "#000"], [1, "#100000"]]);
    ctx.beginPath(); ctx.ellipse(256, 358, 160, 126, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "#6a0f16";
    ctx.beginPath(); ctx.ellipse(256, 410, 82, 30, 0, 0, TAU); ctx.fill(); // lengua
    teethArc(ctx, 256, 358, 156, 122, Math.PI * 1.05, Math.PI * 1.95, 18, 52, 9, "#d9d2b8", 5);
    teethArc(ctx, 256, 358, 156, 122, Math.PI * 0.05, Math.PI * 0.95, 18, 50, 9, "#cfc8ad", 8);
    teethArc(ctx, 256, 358, 128, 96, Math.PI * 1.1, Math.PI * 1.9, 13, 34, 7, "#bdb59a", 12);
    teethArc(ctx, 256, 358, 128, 96, Math.PI * 0.1, Math.PI * 0.9, 13, 34, 7, "#b6ae93", 15);
    drips(ctx, 120, 392, 410, 12, 90, "rgba(150,0,8,0.9)", 21);
  } else if (mood === "angry") {
    // boca entreabierta, dientes apretados
    ctx.fillStyle = "#050000";
    ctx.beginPath(); ctx.ellipse(256, 358, 120, 36, 0, 0, TAU); ctx.fill();
    teethArc(ctx, 256, 358, 118, 34, Math.PI * 1.02, Math.PI * 1.98, 16, 26, 8, "#d8d0b6", 6);
    teethArc(ctx, 256, 358, 118, 34, Math.PI * 0.02, Math.PI * 0.98, 16, 24, 8, "#cdc5aa", 7);
  } else if (mood === "scared") {
    ctx.fillStyle = "#050000";
    ctx.beginPath(); ctx.ellipse(256, 372, 70, 44, 0, 0, TAU); ctx.fill();
  } else {
    // boca cosida
    ctx.strokeStyle = "#0a0000"; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(116, 360); ctx.quadraticCurveTo(256, 380, 396, 358); ctx.stroke();
    ctx.strokeStyle = "#b32a22"; ctx.lineWidth = 3.5;
    for (let i = 0; i < 17; i++) {
      const x = 126 + i * 16.5;
      ctx.beginPath(); ctx.moveTo(x, 343 + Math.sin(i * 0.4) * 3); ctx.lineTo(x + 5, 380 - Math.sin(i * 0.4) * 3); ctx.stroke();
    }
  }
  ctx.restore();
}

function pinky(ctx: Ctx, S: number, mood: FaceMood): void {
  const u = S / 512;
  ctx.save();
  ctx.scale(u, u);
  // mascara de porcelana
  ctx.fillStyle = radial(ctx, 256, 240, 30, 300, [[0, "#f6e3e4"], [0.7, "#e2bcc2"], [1, "#a8747c"]]);
  ctx.fillRect(0, 0, 512, 512);
  // mejillas rosadas + grietas
  for (const x of [130, 382]) {
    ctx.fillStyle = radial(ctx, x, 300, 5, 62, [[0, "rgba(222,92,128,0.75)"], [1, "rgba(222,92,128,0)"]]);
    ctx.fillRect(x - 70, 230, 140, 140);
  }
  ctx.strokeStyle = "rgba(60,20,28,0.55)"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(300, 40); ctx.lineTo(284, 110); ctx.lineTo(310, 160); ctx.lineTo(296, 210); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(90, 190); ctx.lineTo(130, 214); ctx.lineTo(120, 250); ctx.stroke();
  // ojos grandes, negros
  const wide = mood === "scream" || mood === "angry";
  const ey = 200;
  for (const [x, sgn] of [[160, 1], [352, -1]] as const) {
    ctx.save();
    ctx.translate(x, ey);
    ctx.rotate(sgn * (wide ? 0.0 : 0.22));
    ctx.fillStyle = "#050204";
    ctx.beginPath(); ctx.ellipse(0, 0, wide ? 56 : 50, wide ? 66 : 38, 0, 0, TAU); ctx.fill();
    ctx.restore();
    if (mood !== "scared") {
      // lagrimas de sangre
      drips(ctx, x - 10, x + 10, ey + 40, 2, 120, "rgba(170,10,22,0.95)", x);
    }
  }
  if (mood === "scared") {
    ctx.strokeStyle = "#241018"; ctx.lineWidth = 9;
    for (const x of [160, 352]) { ctx.beginPath(); ctx.moveTo(x - 26, ey - 24); ctx.lineTo(x + 26, ey + 24); ctx.moveTo(x + 26, ey - 24); ctx.lineTo(x - 26, ey + 24); ctx.stroke(); }
  }
  // boca
  if (mood === "scream") {
    ctx.fillStyle = "#12020a";
    ctx.beginPath(); ctx.moveTo(60, 330); ctx.quadraticCurveTo(256, 520, 452, 330); ctx.quadraticCurveTo(256, 350, 60, 330); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.moveTo(60, 330); ctx.quadraticCurveTo(256, 520, 452, 330); ctx.quadraticCurveTo(256, 350, 60, 330); ctx.clip();
    for (let i = 0; i < 24; i++) {
      const x = 80 + i * 15.8, top = 335 + Math.sin((i / 23) * Math.PI) * 14;
      ctx.fillStyle = "#e8dcc6"; ctx.fillRect(x, top, 11, 34 + rnd(2, i) * 12);
      ctx.fillStyle = "#e8dcc6"; ctx.fillRect(x, top + 70 + rnd(3, i) * 16, 11, 30 + Math.sin((i / 23) * Math.PI) * 30);
    }
    ctx.restore();
    ctx.strokeStyle = "#8a1a24"; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(60, 330); ctx.quadraticCurveTo(256, 350, 452, 330); ctx.stroke();
  } else if (mood === "angry") {
    ctx.strokeStyle = "#4a0a14"; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(100, 340); ctx.quadraticCurveTo(256, 430, 412, 340); ctx.stroke();
    for (let i = 0; i < 20; i++) { const x = 118 + i * 14.6; ctx.fillStyle = "#e7dcc7"; ctx.fillRect(x, 352 + Math.sin(i / 19 * Math.PI) * 24, 9, 16); }
  } else if (mood === "scared") {
    ctx.fillStyle = "#12020a"; ctx.beginPath(); ctx.ellipse(256, 372, 48, 56, 0, 0, TAU); ctx.fill();
  } else {
    // sonrisa fija demasiado ancha
    ctx.strokeStyle = "#5a0c16"; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(70, 318); ctx.quadraticCurveTo(256, 430, 442, 318); ctx.stroke();
    for (let i = 0; i < 28; i++) {
      const t = i / 27, x = 82 + t * 348, y = 332 + Math.sin(t * Math.PI) * 74 - 6;
      ctx.fillStyle = "#e9dcc5"; ctx.fillRect(x - 3.5, y - 12 + (1 - Math.sin(t * Math.PI)) * 14, 7, 13);
    }
  }
  ctx.restore();
}

function inky(ctx: Ctx, S: number, mood: FaceMood): void {
  const u = S / 512;
  ctx.save();
  ctx.scale(u, u);
  ctx.fillStyle = radial(ctx, 256, 250, 20, 300, [[0, "#1d7f8a"], [0.6, "#0e4852"], [1, "#07262c"]]);
  ctx.fillRect(0, 0, 512, 512);
  veins(ctx, 256, 250, 240, 26, "rgba(120,255,255,0.28)", 31);
  // multiples ojos de tamanos distintos
  const eyes: [number, number, number][] = [[150, 160, 38], [256, 130, 30], [362, 160, 38], [100, 255, 26], [412, 255, 26], [200, 235, 24], [312, 235, 24]];
  for (const [x, y, r] of eyes) {
    ctx.save();
    ctx.shadowColor = "#7ffcff"; ctx.shadowBlur = 18;
    ctx.fillStyle = mood === "scared" ? "#1b2e30" : "#bff7f7";
    ctx.beginPath(); ctx.ellipse(x, y, r, r * (mood === "angry" || mood === "scream" ? 0.6 : 1), 0, 0, TAU); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#031214";
    ctx.beginPath(); ctx.ellipse(x, y, r * 0.38, r * 0.62, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }
  // boca circular de lamprea
  const open = mood === "scream" ? 1 : mood === "angry" ? 0.62 : mood === "scared" ? 0.35 : 0.3;
  const r = 118 * open, cy = 352;
  ctx.fillStyle = radial(ctx, 256, cy, 4, r + 8, [[0, "#000"], [0.7, "#021a1d"], [1, "#0b4b55"]]);
  ctx.beginPath(); ctx.ellipse(256, cy, r + 10, (r + 10) * 0.82, 0, 0, TAU); ctx.fill();
  for (let ring = 0; ring < 3; ring++) {
    const rr = (r - ring * r * 0.26);
    if (rr < 6) break;
    teethArc(ctx, 256, cy, rr, rr * 0.82, 0, TAU, 14 + ring * 4, 24 * open + 6, 6 + (2 - ring), ring === 0 ? "#dff7f2" : "#b6e3dd", 40 + ring);
  }
  ctx.restore();
}

function clyde(ctx: Ctx, S: number, mood: FaceMood): void {
  const u = S / 512;
  ctx.save();
  ctx.scale(u, u);
  // maniqui: cara lisa y arcillosa
  ctx.fillStyle = radial(ctx, 256, 240, 30, 300, [[0, "#f2c89a"], [0.7, "#d99455"], [1, "#8a4a1a"]]);
  ctx.fillRect(0, 0, 512, 512);
  // lineas de estatica horizontales
  for (let y = 0; y < 512; y += 5) {
    ctx.fillStyle = `rgba(${hash2(y, 1, 5) > 0.5 ? "255,255,255" : "0,0,0"},${0.04 + hash2(y, 2, 5) * (mood === "scream" ? 0.22 : 0.1)})`;
    ctx.fillRect(0, y, 512, 2 + hash2(y, 3, 5) * 2);
  }
  // grietas
  ctx.strokeStyle = "rgba(30,10,0,0.65)"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(256, 30); ctx.lineTo(240, 100); ctx.lineTo(268, 150); ctx.lineTo(250, 220); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(420, 200); ctx.lineTo(380, 232); ctx.lineTo(392, 280); ctx.stroke();
  // ojos
  if (mood === "scream" || mood === "angry") {
    for (const x of [170, 342]) {
      socket(ctx, x, 205, 50, 60, "rgba(255,140,40,0.7)");
      drips(ctx, x - 14, x + 14, 255, 4, 150, "rgba(10,6,4,0.95)", x); // exudado negro
    }
  } else if (mood === "scared") {
    ctx.strokeStyle = "#2a1408"; ctx.lineWidth = 9;
    for (const x of [170, 342]) { ctx.beginPath(); ctx.moveTo(x - 24, 181); ctx.lineTo(x + 24, 229); ctx.moveTo(x + 24, 181); ctx.lineTo(x - 24, 229); ctx.stroke(); }
  } else {
    // ojos pintados vacios
    for (const x of [170, 342]) {
      ctx.fillStyle = "#fff6ea"; ctx.beginPath(); ctx.ellipse(x, 205, 44, 30, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = "#1a0a00"; ctx.lineWidth = 5; ctx.stroke();
    }
  }
  // boca
  if (mood === "scream") {
    ctx.fillStyle = "#0a0300"; ctx.beginPath(); ctx.ellipse(256, 372, 118, 96, 0, 0, TAU); ctx.fill();
    // estatica dentro de la boca
    ctx.save(); ctx.beginPath(); ctx.ellipse(256, 372, 118, 96, 0, 0, TAU); ctx.clip();
    for (let i = 0; i < 700; i++) { ctx.fillStyle = `rgba(255,255,255,${hash2(i, 9, 9) * 0.5})`; ctx.fillRect(140 + hash2(i, 1, 9) * 240, 276 + hash2(i, 2, 9) * 192, 2 + hash2(i, 3, 9) * 6, 2); }
    ctx.restore();
    teethArc(ctx, 256, 372, 112, 90, Math.PI * 1.08, Math.PI * 1.92, 9, 28, 10, "#f0e6d0", 61);
    teethArc(ctx, 256, 372, 112, 90, Math.PI * 0.08, Math.PI * 0.92, 9, 28, 10, "#eadfc8", 62);
  } else if (mood === "angry") {
    ctx.fillStyle = "#0a0300"; ctx.beginPath(); ctx.ellipse(256, 366, 90, 52, 0, 0, TAU); ctx.fill();
    teethArc(ctx, 256, 366, 86, 48, Math.PI * 1.1, Math.PI * 1.9, 8, 18, 8, "#efe5cf", 64);
  } else if (mood === "scared") {
    ctx.fillStyle = "#0a0300"; ctx.beginPath(); ctx.ellipse(256, 378, 44, 56, 0, 0, TAU); ctx.fill();
  } else {
    ctx.strokeStyle = "#7a2a10"; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(150, 350); ctx.quadraticCurveTo(256, 410, 362, 350); ctx.stroke();
  }
  ctx.restore();
}

/** Dibuja la cara de un fantasma en el contexto dado (cuadrado de lado `size`). */
export function drawGhostFace(ctx: Ctx, kind: FaceKind, mood: FaceMood, size: number, feather = true): void {
  ctx.clearRect(0, 0, size, size);
  switch (kind) {
    case 0: blinky(ctx, size, mood); break;
    case 1: pinky(ctx, size, mood); break;
    case 2: inky(ctx, size, mood); break;
    default: clyde(ctx, size, mood); break;
  }
  if (feather) featherMask(ctx, size, size);
}

export const FACE_COLORS: Record<FaceKind, { base: number; glow: number; css: string }> = {
  0: { base: 0x8f0f10, glow: 0xff2a1a, css: "#ff2a1a" },
  1: { base: 0xd890a8, glow: 0xff7ab0, css: "#ff7ab0" },
  2: { base: 0x2aa3b0, glow: 0x66f5ff, css: "#66f5ff" },
  3: { base: 0xd9822a, glow: 0xffa040, css: "#ffa040" },
};

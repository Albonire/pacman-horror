// Caras procedurales de los fantasmas (Canvas 2D). Se usan en el cuerpo 3D y, a mayor resolucion,
// en los sustos a pantalla completa.

import { hash2 } from "./noise";

export type FaceKind = 0 | 1 | 2 | 3; // Blinky, Pinky, Inky, Clyde
export type FaceMood = "calm" | "angry" | "scared" | "scream";

export interface FaceRenderOptions {
  quality?: number;
  time?: number;
  jumpscare?: number;
}

type Ctx = CanvasRenderingContext2D;

const TAU = Math.PI * 2;

function rnd(seed: number, i: number): number { return hash2(i, seed, 91); }

function radial(ctx: Ctx, x: number, y: number, r0: number, r1: number, stops: [number, string][]): CanvasGradient {
  const g = ctx.createRadialGradient(x, y, r0, x, y, r1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

function panicEye(
  ctx: Ctx,
  x: number,
  y: number,
  rx: number,
  ry: number,
  seed: number,
  lookX = 0,
  lookY = 0,
): void {
  ctx.save();

  // Contorno inflamado
  ctx.fillStyle = "rgba(75, 12, 16, 0.72)";
  organicEllipsePath(ctx, x, y, rx * 1.15, ry * 1.18, seed, 0.12);
  ctx.fill();

  // Esclerotica enfermiza
  ctx.fillStyle = radial(ctx, x - rx * 0.2, y - ry * 0.25, 0, rx * 1.3, [
    [0, "#eee7d6"],
    [0.65, "#c7c0af"],
    [1, "#735d59"],
  ]);
  organicEllipsePath(ctx, x, y, rx, ry, seed + 10, 0.08);
  ctx.fill();

  ctx.save();
  organicEllipsePath(ctx, x, y, rx * 0.96, ry * 0.96, seed + 10, 0.08);
  ctx.clip();

  // Vasos sanguineos convergiendo hacia la pupila
  ctx.strokeStyle = "rgba(125, 18, 24, 0.55)";
  ctx.lineCap = "round";

  for (let i = 0; i < 13; i++) {
    const a = rnd(seed, i + 30) * TAU;
    const sx = x + Math.cos(a) * rx * 0.95;
    const sy = y + Math.sin(a) * ry * 0.95;

    ctx.lineWidth = 0.6 + rnd(seed, i + 60) * 1.2;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(
      x + Math.cos(a + 0.3) * rx * 0.55,
      y + Math.sin(a + 0.3) * ry * 0.55,
      x + lookX,
      y + lookY,
    );
    ctx.stroke();
  }

  ctx.restore();

  // Iris diminuta: mirada de terror extremo
  const px = x + lookX;
  const py = y + lookY;

  ctx.fillStyle = "#5f7066";
  ctx.beginPath();
  ctx.ellipse(px, py, rx * 0.17, ry * 0.23, 0, 0, TAU);
  ctx.fill();

  ctx.fillStyle = "#030303";
  ctx.beginPath();
  ctx.ellipse(px, py, rx * 0.07, ry * 0.12, 0, 0, TAU);
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,240,0.9)";
  ctx.beginPath();
  ctx.arc(px - rx * 0.035, py - ry * 0.06, Math.max(1.2, rx * 0.025), 0, TAU);
  ctx.fill();

  ctx.restore();
}
    
function teethArc(
  ctx: Ctx,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  a0: number,
  a1: number,
  n: number,
  len: number,
  wid: number,
  color: string,
  seed: number,
  inward = true,
): void {
  const span = Math.abs(a1 - a0);
  const closedRing = Math.abs(span - TAU) < 0.02;

  ctx.save();
  ctx.lineJoin = "round";

  for (let i = 0; i < n; i++) {
    const t = closedRing
      ? i / n
      : n === 1
        ? 0.5
        : i / (n - 1);

    const jitterA = (rnd(seed, i + 300) - 0.5) * 0.035;
    const a = a0 + (a1 - a0) * t + jitterA;

    const bx = cx + Math.cos(a) * rx;
    const by = cy + Math.sin(a) * ry;

    const normalX = inward ? -Math.cos(a) : Math.cos(a);
    const normalY = inward ? -Math.sin(a) : Math.sin(a);
    const tangentX = -Math.sin(a);
    const tangentY = Math.cos(a);

    const lengthVariation = 0.55 + rnd(seed, i) * 0.8;
    const widthVariation = 0.65 + rnd(seed, i + 40) * 0.7;

    const L = len * lengthVariation;
    const W = wid * widthVariation;
    const crooked = (rnd(seed, i + 90) - 0.5) * W * 1.4;

    const tipX = bx + normalX * L + tangentX * crooked;
    const tipY = by + normalY * L + tangentY * crooked;

    const shoulder = L * (0.24 + rnd(seed, i + 120) * 0.14);

    ctx.beginPath();
    ctx.moveTo(bx - tangentX * W, by - tangentY * W);
    ctx.quadraticCurveTo(
      bx + normalX * shoulder - tangentX * W * 0.7,
      by + normalY * shoulder - tangentY * W * 0.7,
      tipX,
      tipY,
    );
    ctx.quadraticCurveTo(
      bx + normalX * shoulder + tangentX * W * 0.7,
      by + normalY * shoulder + tangentY * W * 0.7,
      bx + tangentX * W,
      by + tangentY * W,
    );
    ctx.closePath();

    ctx.fillStyle = color;
    ctx.fill();

    // Separacion oscura entre dientes
    ctx.strokeStyle = "rgba(18, 4, 2, 0.85)";
    ctx.lineWidth = Math.max(0.8, W * 0.15);
    ctx.stroke();

    // Suciedad acumulada cerca de la encia
    ctx.strokeStyle = `rgba(75, 26, 10, ${0.15 + rnd(seed, i + 190) * 0.28})`;
    ctx.lineWidth = Math.max(1, W * 0.38);
    ctx.beginPath();
    ctx.moveTo(bx - tangentX * W * 0.72, by - tangentY * W * 0.72);
    ctx.lineTo(bx + tangentX * W * 0.72, by + tangentY * W * 0.72);
    ctx.stroke();

    // Grieta ocasional
    if (rnd(seed, i + 220) > 0.72) {
      ctx.strokeStyle = "rgba(55, 24, 12, 0.55)";
      ctx.lineWidth = Math.max(0.6, W * 0.12);
      ctx.beginPath();
      ctx.moveTo(
        bx + normalX * L * 0.18,
        by + normalY * L * 0.18,
      );
      ctx.lineTo(
        bx + normalX * L * 0.55 + tangentX * crooked * 0.3,
        by + normalY * L * 0.55 + tangentY * crooked * 0.3,
      );
      ctx.stroke();
    }
  }

  ctx.restore();
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

function organicEllipsePath(
  ctx: Ctx,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  seed: number,
  roughness = 0.09,
  points = 28,
): void {
  const vertices: Array<[number, number]> = [];

  for (let i = 0; i < points; i++) {
    const a = (i / points) * TAU;
    const distortion =
      1 +
      (rnd(seed, i) - 0.5) * roughness * 2 +
      Math.sin(a * 3 + seed) * roughness * 0.2;

    vertices.push([
      cx + Math.cos(a) * rx * distortion,
      cy + Math.sin(a) * ry * distortion,
    ]);
  }

  const first = vertices[0];
  const last = vertices[vertices.length - 1];

  ctx.beginPath();
  ctx.moveTo((last[0] + first[0]) * 0.5, (last[1] + first[1]) * 0.5);

  for (let i = 0; i < vertices.length; i++) {
    const current = vertices[i];
    const next = vertices[(i + 1) % vertices.length];

    ctx.quadraticCurveTo(
      current[0],
      current[1],
      (current[0] + next[0]) * 0.5,
      (current[1] + next[1]) * 0.5,
    );
  }

  ctx.closePath();
}

function socket(
  ctx: Ctx,
  x: number,
  y: number,
  rx: number,
  ry: number,
  rim: string,
  tilt = 0,
): void {
  const seed = Math.floor(x * 17 + y * 31 + rx * 7);

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);

  // Inflamacion exterior
  ctx.shadowColor = rim;
  ctx.shadowBlur = rx * 0.32;
  ctx.fillStyle = "rgba(50, 2, 4, 0.62)";
  organicEllipsePath(ctx, 0, 0, rx * 1.13, ry * 1.12, seed, 0.12);
  ctx.fill();

  ctx.shadowBlur = 0;

  // Cavidad profunda
  ctx.fillStyle = radial(ctx, -rx * 0.12, -ry * 0.18, 0, rx * 1.15, [
    [0, "#000000"],
    [0.52, "#010000"],
    [0.78, "#100102"],
    [1, "#340507"],
  ]);
  organicEllipsePath(ctx, 0, 0, rx, ry, seed + 10, 0.1);
  ctx.fill();

  // Borde de tejido lesionado
  ctx.strokeStyle = rim;
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = Math.max(2, rx * 0.075);
  organicEllipsePath(ctx, 0, 0, rx * 1.015, ry * 1.015, seed + 20, 0.1);
  ctx.stroke();

  // Brillo humedo muy discreto
  ctx.globalAlpha = 0.38;
  ctx.strokeStyle = "rgba(255, 175, 160, 0.72)";
  ctx.lineWidth = Math.max(1, rx * 0.028);
  ctx.beginPath();
  ctx.arc(-rx * 0.1, -ry * 0.08, rx * 0.7, Math.PI * 1.08, Math.PI * 1.72);
  ctx.stroke();

  // Reflejo minimo al fondo: sensacion de que algo observa
  ctx.globalAlpha = 0.32;
  ctx.fillStyle = "#fff4de";
  ctx.beginPath();
  ctx.ellipse(-rx * 0.12, -ry * 0.16, rx * 0.055, ry * 0.045, 0, 0, TAU);
  ctx.fill();

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

// ------------------- textura superficial organica y post-procesado -------------------

function surfaceTexture(
  ctx: Ctx,
  size: number,
  kind: FaceKind,
  mood: FaceMood,
  seed: number,
  quality = 1,
): void {
  ctx.save();
  const u = size / 512;
  const countPores = Math.floor(110 * quality);
  const countHematomas = Math.floor(6 * quality);
  const countScratches = Math.floor(5 * quality);
  let countSweat = Math.floor(24 * quality);
  if (mood === "scream") countSweat = Math.floor(countSweat * 1.6);

  // 1) Hematomas y moretones
  for (let i = 0; i < countHematomas; i++) {
    const hx = (90 + rnd(seed, i + 500) * 332) * u;
    const hy = (110 + rnd(seed, i + 550) * 300) * u;
    const hr = (20 + rnd(seed, i + 600) * 44) * u;
    const bruiseColor = kind === 0
      ? "rgba(45, 6, 12, 0.32)"
      : kind === 1
        ? "rgba(68, 20, 40, 0.28)"
        : kind === 2
          ? "rgba(5, 38, 48, 0.32)"
          : "rgba(58, 30, 10, 0.32)";

    const g = ctx.createRadialGradient(hx, hy, hr * 0.15, hx, hy, hr);
    g.addColorStop(0, bruiseColor);
    g.addColorStop(0.65, bruiseColor.replace(/[\d.]+\)$/, "0.12)"));
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(hx, hy, hr, 0, TAU);
    ctx.fill();
  }

  // 2) Poros y grano cutaneo
  ctx.fillStyle = "rgba(12, 3, 5, 0.24)";
  for (let i = 0; i < countPores; i++) {
    const px = (45 + rnd(seed, i + 700) * 422) * u;
    const py = (65 + rnd(seed, i + 850) * 390) * u;
    const pr = Math.max(0.6, (0.7 + rnd(seed, i + 950) * 1.3) * u);
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, TAU);
    ctx.fill();
  }

  // 3) Micro-rasgunos y fisuras
  ctx.lineCap = "round";
  for (let i = 0; i < countScratches; i++) {
    let sx = (95 + rnd(seed, i + 1000) * 322) * u;
    let sy = (115 + rnd(seed, i + 1100) * 290) * u;
    const len = (12 + rnd(seed, i + 1200) * 24) * u;
    const angle = rnd(seed, i + 1300) * Math.PI;

    ctx.strokeStyle = `rgba(30, 6, 8, ${0.3 + rnd(seed, i + 1400) * 0.3})`;
    ctx.lineWidth = Math.max(0.7, (0.75 + rnd(seed, i + 1500) * 0.75) * u);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    for (let s = 0; s < 3; s++) {
      sx += Math.cos(angle + (rnd(seed, i * 10 + s) - 0.5) * 0.5) * (len / 3);
      sy += Math.sin(angle + (rnd(seed, i * 10 + s) - 0.5) * 0.5) * (len / 3);
      ctx.lineTo(sx, sy);
    }
    ctx.stroke();
  }

  // 4) Sudor humedo y brillo especular
  for (let i = 0; i < countSweat; i++) {
    const wx = (75 + rnd(seed, i + 1600) * 362) * u;
    const wy = (85 + rnd(seed, i + 1700) * 340) * u;
    const wr = Math.max(0.8, (0.9 + rnd(seed, i + 1800) * 1.6) * u);

    ctx.fillStyle = `rgba(255, 245, 235, ${0.28 + rnd(seed, i + 1900) * 0.4})`;
    ctx.beginPath();
    ctx.arc(wx, wy, wr, 0, TAU);
    ctx.fill();
  }

  ctx.restore();
}

function finalGrade(
  ctx: Ctx,
  size: number,
  kind: FaceKind,
  mood: FaceMood,
  seed: number,
): void {
  ctx.save();
  const half = size / 2;

  // 1) Vineteado opresivo hacia los bordes
  const jitter = 1 + (rnd(seed, 20) - 0.5) * 0.05;
  const vg = ctx.createRadialGradient(half, half, size * 0.24 * jitter, half, half, size * 0.52);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(0.72, "rgba(0,0,0,0.42)");
  vg.addColorStop(1, "rgba(0,0,0,0.92)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, size, size);

  // 2) Tinte tonal visceral propio de cada criatura
  const tint = kind === 0
    ? "rgba(105, 14, 16, 0.14)"
    : kind === 1
      ? "rgba(125, 60, 80, 0.12)"
      : kind === 2
        ? "rgba(16, 70, 80, 0.15)"
        : "rgba(120, 70, 22, 0.14)";
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, size, size);

  // 3) Iluminacion teatral desde abajo en modo scream
  if (mood === "scream") {
    const upLight = ctx.createLinearGradient(0, size, 0, size * 0.2);
    upLight.addColorStop(0, "rgba(255, 195, 165, 0.28)");
    upLight.addColorStop(0.5, "rgba(175, 45, 35, 0.15)");
    upLight.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = upLight;
    ctx.fillRect(0, 0, size, size);

    // Sombras superiores reforzadas
    const topShadow = ctx.createLinearGradient(0, 0, 0, size * 0.4);
    topShadow.addColorStop(0, "rgba(0, 0, 0, 0.65)");
    topShadow.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = topShadow;
    ctx.fillRect(0, 0, size, size);
  }

  ctx.restore();
}

function jumpscareGlitch(
  ctx: Ctx,
  size: number,
  intensity: number,
  seed: number,
): void {
  if (intensity <= 0) return;
  ctx.save();

  const k = Math.min(1.5, intensity);
  const strips = Math.floor(6 + k * 8);

  // Desplazamiento horizontal de bandas
  for (let i = 0; i < strips; i++) {
    const sy = rnd(seed, i + 80) * size;
    const sh = Math.max(3, (4 + rnd(seed, i + 90) * 16) * (size / 512));
    const dx = (rnd(seed, i + 100) - 0.5) * 40 * k * (size / 512);

    ctx.drawImage(ctx.canvas, 0, sy, size, sh, dx, sy, size, sh);
  }

  // Destello / dropout cromatico
  if (rnd(seed, 120) < 0.35 * k) {
    ctx.globalCompositeOperation = "color-dodge";
    ctx.fillStyle = `rgba(255, ${Math.floor(60 + rnd(seed, 130) * 80)}, 50, ${0.16 * k})`;
    ctx.fillRect(0, 0, size, size);
  }

  ctx.restore();
}

// ------------------------------------------------------------------------------------------------

function blinky(ctx: Ctx, S: number, mood: FaceMood): void {
  const u = S / 512;
  ctx.save();
  ctx.scale(u, u);
  // piel oscura enrojecida
  ctx.fillStyle = radial(ctx, 256, 250, 20, 300, [[0, "#571012"], [0.6, "#3c0808"], [1, "#1c0202"]]);
  ctx.fillRect(0, 0, 512, 512);
  veins(ctx, 256, 250, 230, 24, "rgba(18,0,0,0.6)", 3);
  // cicatriz vertical asimetrica
  ctx.strokeStyle = "rgba(10,0,0,0.85)"; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(254, 55); ctx.lineTo(263, 172); ctx.stroke();
  // ojos hundidos asimetricos
  const angry = mood === "angry" || mood === "scream";
  socket(ctx, 168, 205, 54, angry ? 36 : 54, "rgba(235,45,28,0.8)", angry ? 0.35 : 0);
  socket(ctx, 344, 205, 52, angry ? 38 : 52, "rgba(235,45,28,0.8)", angry ? -0.32 : 0);
  if (mood === "scared") {
    panicEye(ctx, 168, 205, 49, 55, 110, 8, 3);
    panicEye(ctx, 344, 205, 53, 48, 120, -7, 4);
  }
  if (mood === "scream") {
    // boca enorme con mandíbula irregular y tres filas de fangs
    ctx.fillStyle = radial(ctx, 256, 360, 10, 170, [[0, "#160000"], [0.6, "#020000"], [1, "#0a0000"]]);
    ctx.beginPath(); ctx.ellipse(256, 358, 160, 126, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "#5a0d14";
    ctx.beginPath(); ctx.ellipse(256, 410, 82, 30, 0, 0, TAU); ctx.fill(); // lengua
    teethArc(ctx, 256, 358, 156, 122, Math.PI * 1.05, Math.PI * 1.95, 18, 52, 9, "#d9d2b8", 5);
    teethArc(ctx, 256, 358, 156, 122, Math.PI * 0.05, Math.PI * 0.95, 18, 50, 9, "#cfc8ad", 8);
    teethArc(ctx, 256, 358, 128, 96, Math.PI * 1.1, Math.PI * 1.9, 13, 34, 7, "#bdb59a", 12);
    teethArc(ctx, 256, 358, 128, 96, Math.PI * 0.1, Math.PI * 0.9, 13, 34, 7, "#b6ae93", 15);
    drips(ctx, 120, 392, 410, 12, 90, "rgba(145,0,8,0.9)", 21);
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
    ctx.strokeStyle = "#080000"; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(116, 360); ctx.quadraticCurveTo(256, 380, 396, 358); ctx.stroke();
    ctx.strokeStyle = "#9e241c"; ctx.lineWidth = 3.5;
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
  // mascara de porcelana desaturada
  ctx.fillStyle = radial(ctx, 256, 240, 30, 300, [[0, "#eed5d8"], [0.7, "#cca4ac"], [1, "#8f6672"]]);
  ctx.fillRect(0, 0, 512, 512);
  // mejillas enfermizas y grietas profundas
  for (const x of [130, 382]) {
    ctx.fillStyle = radial(ctx, x, 300, 5, 62, [[0, "rgba(188,114,137,0.7)"], [1, "rgba(188,114,137,0)"]]);
    ctx.fillRect(x - 70, 230, 140, 140);
  }
  ctx.strokeStyle = "rgba(55,18,24,0.6)"; ctx.lineWidth = 2.2;
  ctx.beginPath(); ctx.moveTo(300, 40); ctx.lineTo(284, 110); ctx.lineTo(310, 160); ctx.lineTo(296, 210); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(90, 190); ctx.lineTo(130, 214); ctx.lineTo(120, 250); ctx.stroke();
  // ojos grandes de muñeca, negros y ligeramente desalineados
  const wide = mood === "scream" || mood === "angry";
  const ey = 200;
  for (const [x, sgn] of [[162, 1], [350, -1]] as const) {
    ctx.save();
    ctx.translate(x, ey);
    ctx.rotate(sgn * (wide ? 0.0 : 0.2));
    ctx.fillStyle = "#040103";
    ctx.beginPath(); ctx.ellipse(0, 0, wide ? 55 : 49, wide ? 65 : 37, 0, 0, TAU); ctx.fill();
    ctx.restore();
    if (mood !== "scared") {
      // lagrimas de sangre coagulada
      drips(ctx, x - 10, x + 10, ey + 40, 2, 120, "rgba(150,10,22,0.95)", x);
    }
  }
  if (mood === "scared") {
    panicEye(ctx, 162, ey, 55, 66, 210, 7, 2);
    panicEye(ctx, 350, ey, 49, 61, 220, -6, 3);
  }
  // boca
  if (mood === "scream") {
    ctx.fillStyle = "#100109";
    ctx.beginPath(); ctx.moveTo(60, 330); ctx.quadraticCurveTo(256, 520, 452, 330); ctx.quadraticCurveTo(256, 350, 60, 330); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.moveTo(60, 330); ctx.quadraticCurveTo(256, 520, 452, 330); ctx.quadraticCurveTo(256, 350, 60, 330); ctx.clip();
    for (let i = 0; i < 24; i++) {
      const x = 80 + i * 15.8, top = 335 + Math.sin((i / 23) * Math.PI) * 14;
      ctx.fillStyle = "#e8dcc6"; ctx.fillRect(x, top, 11, 34 + rnd(2, i) * 12);
      ctx.fillStyle = "#e8dcc6"; ctx.fillRect(x, top + 70 + rnd(3, i) * 16, 11, 30 + Math.sin((i / 23) * Math.PI) * 30);
    }
    ctx.restore();
    ctx.strokeStyle = "#801620"; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(60, 330); ctx.quadraticCurveTo(256, 350, 452, 330); ctx.stroke();
  } else if (mood === "angry") {
    ctx.strokeStyle = "#420912"; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(100, 340); ctx.quadraticCurveTo(256, 430, 412, 340); ctx.stroke();
    for (let i = 0; i < 20; i++) { const x = 118 + i * 14.6; ctx.fillStyle = "#e7dcc7"; ctx.fillRect(x, 352 + Math.sin(i / 19 * Math.PI) * 24, 9, 16); }
  } else if (mood === "scared") {
    ctx.fillStyle = "#100109"; ctx.beginPath(); ctx.ellipse(256, 372, 48, 56, 0, 0, TAU); ctx.fill();
  } else {
    // sonrisa fija demasiado ancha
    ctx.strokeStyle = "#500a14"; ctx.lineWidth = 7;
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
  // carne cianotica y ahogada
  ctx.fillStyle = radial(ctx, 256, 250, 20, 300, [[0, "#19565e"], [0.6, "#103c42"], [1, "#071c20"]]);
  ctx.fillRect(0, 0, 512, 512);
  veins(ctx, 256, 250, 240, 26, "rgba(85,210,215,0.24)", 31);
  // multiples ojos de tamanos distintos y miradas divergentes
  const eyes: [number, number, number][] = [
    [150, 160, 38], [256, 130, 30], [362, 160, 38],
    [100, 255, 26], [412, 255, 26], [200, 235, 24], [312, 235, 24],
  ];
  for (let idx = 0; idx < eyes.length; idx++) {
    const [x, y, r] = eyes[idx];
    ctx.save();
    ctx.shadowColor = "#4a9ca0"; ctx.shadowBlur = 14;
    ctx.fillStyle = mood === "scared" ? "#142528" : "#9edde0";
    ctx.beginPath(); ctx.ellipse(x, y, r, r * (mood === "angry" || mood === "scream" ? 0.6 : 1), 0, 0, TAU); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#020f11";
    // mirada divergente
    const offX = (idx % 2 === 0 ? 1 : -1) * r * 0.2;
    const offY = (idx % 3 === 0 ? 1 : -1) * r * 0.15;
    ctx.beginPath(); ctx.ellipse(x + offX, y + offY, r * 0.36, r * 0.58, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }
  if (mood === "scared") {
    panicEye(ctx, 150, 160, 36, 36, 410, 6, 2);
    panicEye(ctx, 362, 160, 36, 36, 420, -5, 2);
  }
  // boca circular de lamprea
  const open = mood === "scream" ? 1 : mood === "angry" ? 0.62 : mood === "scared" ? 0.35 : 0.3;
  const r = 118 * open, cy = 352;
  ctx.fillStyle = radial(ctx, 256, cy, 4, r + 8, [[0, "#000"], [0.7, "#011618"], [1, "#0a3e47"]]);
  ctx.beginPath(); ctx.ellipse(256, cy, r + 10, (r + 10) * 0.82, 0, 0, TAU); ctx.fill();
  for (let ring = 0; ring < 3; ring++) {
    const rr = (r - ring * r * 0.26);
    if (rr < 6) break;
    teethArc(ctx, 256, cy, rr, rr * 0.82, 0, TAU, 14 + ring * 4, 24 * open + 6, 6 + (2 - ring), ring === 0 ? "#d2ede7" : "#a8d6cf", 40 + ring);
  }
  ctx.restore();
}

function clyde(ctx: Ctx, S: number, mood: FaceMood): void {
  const u = S / 512;
  ctx.save();
  ctx.scale(u, u);
  // maniqui: arcilla agrietada y marchita
  ctx.fillStyle = radial(ctx, 256, 240, 30, 300, [[0, "#d49b65"], [0.7, "#b57638"], [1, "#663510"]]);
  ctx.fillRect(0, 0, 512, 512);
  // lineas de estatica horizontales
  for (let y = 0; y < 512; y += 5) {
    ctx.fillStyle = `rgba(${hash2(y, 1, 5) > 0.5 ? "255,255,255" : "0,0,0"},${0.04 + hash2(y, 2, 5) * (mood === "scream" ? 0.22 : 0.1)})`;
    ctx.fillRect(0, y, 512, 2 + hash2(y, 3, 5) * 2);
  }
  // grietas en el maniqui
  ctx.strokeStyle = "rgba(28,9,0,0.65)"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(256, 30); ctx.lineTo(240, 100); ctx.lineTo(268, 150); ctx.lineTo(250, 220); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(420, 200); ctx.lineTo(380, 232); ctx.lineTo(392, 280); ctx.stroke();
  // ojos
  if (mood === "scream" || mood === "angry") {
    for (const x of [170, 342]) {
      socket(ctx, x, 205, 50, 60, "rgba(225,120,32,0.7)");
      drips(ctx, x - 14, x + 14, 255, 4, 150, "rgba(10,6,4,0.95)", x); // exudado negro
    }
  } else if (mood === "scared") {
    panicEye(ctx, 170, 205, 49, 59, 310, 8, 4);
    panicEye(ctx, 342, 205, 54, 51, 320, -7, 4);
  } else {
    // ojos pintados vacios
    for (const x of [170, 342]) {
      ctx.fillStyle = "#fff4e6"; ctx.beginPath(); ctx.ellipse(x, 205, 44, 30, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = "#160800"; ctx.lineWidth = 5; ctx.stroke();
    }
  }
  // boca
  if (mood === "scream") {
    ctx.fillStyle = "#080200"; ctx.beginPath(); ctx.ellipse(256, 372, 118, 96, 0, 0, TAU); ctx.fill();
    // estatica dentro de la boca
    ctx.save(); ctx.beginPath(); ctx.ellipse(256, 372, 118, 96, 0, 0, TAU); ctx.clip();
    for (let i = 0; i < 700; i++) {
      ctx.fillStyle = `rgba(255,255,255,${hash2(i, 9, 9) * 0.5})`;
      ctx.fillRect(140 + hash2(i, 1, 9) * 240, 276 + hash2(i, 2, 9) * 192, 2 + hash2(i, 3, 9) * 6, 2);
    }
    ctx.restore();
    teethArc(ctx, 256, 372, 112, 90, Math.PI * 1.08, Math.PI * 1.92, 9, 28, 10, "#eee2cb", 61);
    teethArc(ctx, 256, 372, 112, 90, Math.PI * 0.08, Math.PI * 0.92, 9, 28, 10, "#e4d8c0", 62);
  } else if (mood === "angry") {
    ctx.fillStyle = "#080200"; ctx.beginPath(); ctx.ellipse(256, 366, 90, 52, 0, 0, TAU); ctx.fill();
    teethArc(ctx, 256, 366, 86, 48, Math.PI * 1.1, Math.PI * 1.9, 8, 18, 8, "#ebe0c8", 64);
  } else if (mood === "scared") {
    ctx.fillStyle = "#080200"; ctx.beginPath(); ctx.ellipse(256, 378, 44, 56, 0, 0, TAU); ctx.fill();
  } else {
    ctx.strokeStyle = "#70250e"; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(150, 350); ctx.quadraticCurveTo(256, 410, 362, 350); ctx.stroke();
  }
  ctx.restore();
}

/** Dibuja la cara de un fantasma en el contexto dado (cuadrado de lado `size`). */
export function drawGhostFace(
  ctx: Ctx,
  kind: FaceKind,
  mood: FaceMood,
  size: number,
  feather = true,
  options: FaceRenderOptions = {},
): void {
  const quality = options.quality ?? 1;
  const jumpscare = options.jumpscare ?? 0;
  const time = options.time ?? 0;
  const seed = Math.floor(kind * 1000 + time * 60);

  // el contexto puede reutilizarse entre llamadas: no heredar el dibujo anterior
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  switch (kind) {
    case 0: blinky(ctx, size, mood); break;
    case 1: pinky(ctx, size, mood); break;
    case 2: inky(ctx, size, mood); break;
    default: clyde(ctx, size, mood); break;
  }

  surfaceTexture(ctx, size, kind, mood, seed, quality);
  finalGrade(ctx, size, kind, mood, seed);

  if (jumpscare > 0) {
    jumpscareGlitch(ctx, size, jumpscare, seed);
  }

  if (feather) {
    featherMask(ctx, size, size);
  }
  ctx.restore();
}

export const FACE_COLORS: Record<FaceKind, { base: number; glow: number; css: string }> = {
  0: { base: 0x571012, glow: 0xa92620, css: "#a92620" },
  1: { base: 0x8f6672, glow: 0xbc7289, css: "#bc7289" },
  2: { base: 0x164b52, glow: 0x4a9ca0, css: "#4a9ca0" },
  3: { base: 0x87501f, glow: 0xb57638, css: "#b57638" },
};

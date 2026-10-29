// Decals sobre las paredes: manos ensangrentadas, arrastres, aranazos, mensajes, grafitis y carteles.
// Las texturas se dibujan con Canvas (con alfa) y se instancian sobre caras de pared expuestas.

import * as THREE from "three";
import { CELL, WALL_H } from "../config/constants";
import { hash2 } from "../gfx/noise";
import { makeCanvas, toTexture } from "../gfx/texkit";
import type { Simulation } from "../sim/simulation";
import { mulberry32 } from "../sim/rng";

export type DecalKind = "hand" | "smear" | "scratch" | "scribble" | "eyes" | "pacman" | "warning" | "sign" | "neon" | "drip";

export interface DecalSpec {
  kind: DecalKind;
  color: string;
  weight: number;
  /** Textos posibles (scribble / sign / neon). */
  texts?: string[];
  glow?: boolean;
}

type Ctx = CanvasRenderingContext2D;

function speckleErase(ctx: Ctx, w: number, h: number, amount: number, seed: number): void {
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  for (let i = 0; i < amount; i++) {
    ctx.fillStyle = `rgba(0,0,0,${0.3 + hash2(i, 1, seed) * 0.7})`;
    const r = 0.6 + hash2(i, 2, seed) * 2.6;
    ctx.beginPath(); ctx.arc(hash2(i, 3, seed) * w, hash2(i, 4, seed) * h, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function dripsDown(ctx: Ctx, color: string, x0: number, x1: number, y: number, n: number, maxLen: number, seed: number): void {
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const x = x0 + (x1 - x0) * hash2(i, 5, seed);
    const len = maxLen * (0.15 + hash2(i, 6, seed) * 0.85);
    const w = 2 + hash2(i, 7, seed) * 4;
    ctx.beginPath(); ctx.moveTo(x - w / 2, y); ctx.lineTo(x + w / 2, y); ctx.lineTo(x + w / 2, y + len);
    ctx.arc(x, y + len, w / 2, 0, Math.PI); ctx.lineTo(x - w / 2, y); ctx.fill();
  }
}

function handprint(color: string, seed: number): THREE.CanvasTexture {
  const { c, ctx } = makeCanvas(256, 256);
  ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineCap = "round";
  ctx.globalAlpha = 0.9;
  // palma
  ctx.beginPath(); ctx.ellipse(128, 168, 46, 54, 0, 0, Math.PI * 2); ctx.fill();
  // dedos
  const fingers: [number, number, number, number][] = [[78, 130, -0.3, 62], [102, 112, -0.1, 78], [130, 106, 0, 84], [158, 112, 0.12, 76], [188, 150, 0.9, 54]];
  for (const [x, y, a, l] of fingers) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.lineWidth = 17; ctx.beginPath(); ctx.moveTo(0, 10); ctx.lineTo(0, -l); ctx.stroke(); ctx.restore();
  }
  ctx.globalAlpha = 1;
  dripsDown(ctx, color, 86, 170, 200, 7, 56, seed);
  speckleErase(ctx, 256, 256, 260, seed);
  return toTexture(c, true, false);
}

function smear(color: string, seed: number): THREE.CanvasTexture {
  const { c, ctx } = makeCanvas(512, 256);
  ctx.strokeStyle = color; ctx.lineCap = "round";
  for (let i = 0; i < 6; i++) {
    ctx.globalAlpha = 0.35 + hash2(i, 1, seed) * 0.5;
    ctx.lineWidth = 10 + hash2(i, 2, seed) * 26;
    const y0 = 60 + i * 26 + hash2(i, 3, seed) * 14;
    ctx.beginPath(); ctx.moveTo(30, y0); ctx.bezierCurveTo(150, y0 - 40 + hash2(i, 4, seed) * 60, 300, y0 + 30, 480, y0 + 20 + hash2(i, 5, seed) * 40); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  dripsDown(ctx, color, 60, 430, 130, 9, 90, seed);
  speckleErase(ctx, 512, 256, 420, seed);
  return toTexture(c, true, false);
}

function scratch(color: string, seed: number): THREE.CanvasTexture {
  const { c, ctx } = makeCanvas(256, 256);
  ctx.lineCap = "round";
  for (let i = 0; i < 4; i++) {
    const x = 60 + i * 36 + hash2(i, 1, seed) * 8;
    ctx.strokeStyle = "rgba(0,0,0,0.75)"; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(x, 20); ctx.quadraticCurveTo(x + 20, 130, x + 6, 236); ctx.stroke();
    ctx.strokeStyle = color; ctx.lineWidth = 2.4; ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.moveTo(x - 1, 20); ctx.quadraticCurveTo(x + 19, 130, x + 5, 236); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  speckleErase(ctx, 256, 256, 80, seed);
  return toTexture(c, true, false);
}

function scribble(text: string, color: string, seed: number): THREE.CanvasTexture {
  const { c, ctx } = makeCanvas(768, 192);
  ctx.fillStyle = color; ctx.strokeStyle = color; ctx.textBaseline = "middle"; ctx.textAlign = "left";
  let size = 96;
  ctx.font = `bold ${size}px "Comic Sans MS", "Segoe Print", cursive, sans-serif`;
  while (ctx.measureText(text).width > 700 && size > 36) { size -= 6; ctx.font = `bold ${size}px "Comic Sans MS", "Segoe Print", cursive, sans-serif`; }
  let x = 30;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const w = ctx.measureText(ch).width;
    ctx.save();
    ctx.translate(x + w / 2, 96 + (hash2(i, 1, seed) - 0.5) * 22);
    ctx.rotate((hash2(i, 2, seed) - 0.5) * 0.35);
    ctx.fillText(ch, -w / 2, 0);
    ctx.lineWidth = 2; ctx.strokeText(ch, -w / 2, 0);
    ctx.restore();
    x += w * (0.95 + hash2(i, 3, seed) * 0.12);
  }
  dripsDown(ctx, color, 30, x, 120, Math.max(4, text.length), 62, seed);
  speckleErase(ctx, 768, 192, 220, seed);
  return toTexture(c, true, false);
}

function eyes(color: string, seed: number): THREE.CanvasTexture {
  const { c, ctx } = makeCanvas(256, 128);
  ctx.lineWidth = 7; ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineCap = "round";
  for (const cx of [78, 178]) {
    ctx.beginPath(); ctx.ellipse(cx, 60, 34, 42, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx + 8 + (hash2(1, 1, seed) - 0.5) * 6, 66, 13, 0, Math.PI * 2); ctx.fill();
  }
  ctx.beginPath(); ctx.moveTo(60, 8); ctx.lineTo(96, 20); ctx.moveTo(196, 8); ctx.lineTo(160, 20); ctx.stroke();
  speckleErase(ctx, 256, 128, 120, seed);
  return toTexture(c, true, false);
}

function pacman(color: string, seed: number): THREE.CanvasTexture {
  const { c, ctx } = makeCanvas(512, 128);
  ctx.fillStyle = color; ctx.strokeStyle = color;
  // pacman con la boca abierta persiguiendo puntos
  ctx.beginPath(); ctx.moveTo(70, 64); ctx.arc(70, 64, 46, 0.55, Math.PI * 2 - 0.55); ctx.closePath(); ctx.fill();
  for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(150 + i * 46, 64, 6.5, 0, Math.PI * 2); ctx.fill(); }
  // fantasma pequeno
  ctx.beginPath(); ctx.arc(420, 70, 30, Math.PI, 0); ctx.lineTo(450, 104);
  for (let i = 0; i < 3; i++) { ctx.lineTo(450 - (i + 0.5) * 20, 94); ctx.lineTo(450 - (i + 1) * 20, 104); }
  ctx.closePath(); ctx.fill();
  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath(); ctx.arc(408, 66, 8, 0, Math.PI * 2); ctx.arc(432, 66, 8, 0, Math.PI * 2); ctx.fill();
  ctx.globalCompositeOperation = "source-over";
  speckleErase(ctx, 512, 128, 160, seed);
  return toTexture(c, true, false);
}

function warning(seed: number): THREE.CanvasTexture {
  const { c, ctx } = makeCanvas(256, 256);
  ctx.fillStyle = "#e6b800"; ctx.strokeStyle = "#16130a"; ctx.lineWidth = 12; ctx.lineJoin = "round";
  ctx.beginPath(); ctx.moveTo(128, 22); ctx.lineTo(238, 222); ctx.lineTo(18, 222); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#16130a"; ctx.font = "bold 130px Arial, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("!", 128, 148);
  speckleErase(ctx, 256, 256, 220, seed);
  return toTexture(c, true, false);
}

function sign(text: string, seed: number): THREE.CanvasTexture {
  const { c, ctx } = makeCanvas(512, 160);
  ctx.fillStyle = "#c9c9b8"; ctx.fillRect(0, 0, 512, 160);
  ctx.strokeStyle = "#1c2c28"; ctx.lineWidth = 8; ctx.strokeRect(8, 8, 496, 144);
  ctx.fillStyle = "#16241f"; ctx.font = "bold 74px Arial, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(text, 256, 84);
  // oxidacion y suciedad
  ctx.globalAlpha = 0.5;
  for (let i = 0; i < 18; i++) { ctx.fillStyle = hash2(i, 1, seed) > 0.5 ? "#6a4a28" : "#3a352a"; ctx.beginPath(); ctx.arc(hash2(i, 2, seed) * 512, hash2(i, 3, seed) * 160, 6 + hash2(i, 4, seed) * 26, 0, Math.PI * 2); ctx.fill(); }
  ctx.globalAlpha = 1;
  return toTexture(c, true, false);
}

function neon(text: string, color: string): THREE.CanvasTexture {
  const { c, ctx } = makeCanvas(512, 160);
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = "bold 78px Arial Black, Arial, sans-serif";
  ctx.shadowColor = color; ctx.shadowBlur = 24; ctx.strokeStyle = color; ctx.lineWidth = 6;
  ctx.strokeText(text, 256, 82); ctx.strokeText(text, 256, 82);
  ctx.shadowBlur = 0; ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2; ctx.strokeText(text, 256, 82);
  return toTexture(c, true, false);
}

function drip(color: string, seed: number): THREE.CanvasTexture {
  const { c, ctx } = makeCanvas(256, 256);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 256, 16);
  dripsDown(ctx, color, 0, 256, 10, 14, 210, seed);
  ctx.globalAlpha = 0.7;
  speckleErase(ctx, 256, 256, 120, seed);
  return toTexture(c, true, false);
}

interface Built { tex: THREE.CanvasTexture; aspect: number; spec: DecalSpec }

function build(spec: DecalSpec, i: number): Built {
  const seed = 17 + i * 13;
  const text = spec.texts ? spec.texts[Math.floor(hash2(i, 9, seed) * spec.texts.length)] : "";
  let tex: THREE.CanvasTexture;
  let aspect = 1;
  switch (spec.kind) {
    case "hand": tex = handprint(spec.color, seed); break;
    case "smear": tex = smear(spec.color, seed); aspect = 2; break;
    case "scratch": tex = scratch(spec.color, seed); break;
    case "scribble": tex = scribble(text, spec.color, seed); aspect = 4; break;
    case "eyes": tex = eyes(spec.color, seed); aspect = 2; break;
    case "pacman": tex = pacman(spec.color, seed); aspect = 4; break;
    case "warning": tex = warning(seed); break;
    case "sign": tex = sign(text, seed); aspect = 3.2; break;
    case "neon": tex = neon(text, spec.color); aspect = 3.2; break;
    default: tex = drip(spec.color, seed); break;
  }
  return { tex, aspect, spec };
}

/** Coloca decals en caras de pared expuestas (determinista por semilla del nivel). */
export function buildDecals(sim: Simulation, specs: DecalSpec[], density = 1): THREE.Group {
  const group = new THREE.Group();
  if (!specs.length) return group;
  const { maze } = sim;
  const rng = mulberry32(sim.level.seed ^ 0xdec41);
  const faces: { x: number; z: number; nx: number; nz: number }[] = [];
  const spawn = maze.cellToWorld(sim.layout.player[0], sim.layout.player[1]);
  for (let y = 1; y < maze.H - 1; y++) for (let x = 1; x < maze.W - 1; x++) {
    if (maze.rows[y][x] !== "#") continue;
    const w = maze.cellToWorld(x, y);
    for (const [nx, nz] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as const) {
      if (!maze.isWalkable(x + nx, y + nz)) continue;
      if (Math.hypot(w.x + nx * CELL / 2 - spawn.x, w.z + nz * CELL / 2 - spawn.z) < 5) continue;
      faces.push({ x: w.x + nx * (CELL / 2 + 0.012), z: w.z + nz * (CELL / 2 + 0.012), nx, nz });
    }
  }
  const total = specs.reduce((a, s) => a + s.weight, 0);
  const count = Math.round((faces.length / 7) * density);
  const built = specs.map((s, i) => build(s, i));
  const buckets = built.map(() => [] as { f: (typeof faces)[number]; w: number; h: number; y: number; rot: number; off: number }[]);
  for (let n = 0; n < count && faces.length; n++) {
    let r = rng() * total, si = 0;
    for (; si < specs.length - 1; si++) { r -= specs[si].weight; if (r <= 0) break; }
    const fi = Math.floor(rng() * faces.length);
    const f = faces[fi];
    const b = built[si];
    const base = b.spec.kind === "sign" || b.spec.kind === "neon" ? 0.95 + rng() * 0.35 : b.spec.kind === "scribble" || b.spec.kind === "pacman" ? 1.5 + rng() * 0.5 : 0.7 + rng() * 0.6;
    const h = base * (b.aspect > 1.5 ? 0.45 : 1);
    const w = h * b.aspect;
    const yy = b.spec.kind === "drip" ? WALL_H - h / 2 - 0.05
      : b.spec.kind === "neon" || b.spec.kind === "sign" ? 2.0 + rng() * 0.5
      : 0.8 + rng() * (WALL_H - 1.9);
    buckets[si].push({ f, w, h, y: yy, rot: b.spec.kind === "hand" || b.spec.kind === "scratch" ? (rng() - 0.5) * 0.7 : (rng() - 0.5) * 0.06, off: (rng() - 0.5) * (CELL - w) * 0.7 });
    faces.splice(fi, 1);
  }
  const plane = new THREE.PlaneGeometry(1, 1);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion(), qz = new THREE.Quaternion(), pos = new THREE.Vector3(), sc = new THREE.Vector3();
  built.forEach((b, i) => {
    const list = buckets[i];
    if (!list.length) return;
    const glow = b.spec.kind === "neon";
    const mat = glow
      ? new THREE.MeshBasicMaterial({ map: b.tex, transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2 })
      : new THREE.MeshStandardMaterial({ map: b.tex, transparent: true, depthWrite: false, roughness: b.spec.kind === "sign" || b.spec.kind === "warning" ? 0.5 : 0.35, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, alphaTest: b.spec.kind === "sign" ? 0.5 : 0.02 });
    const mesh = new THREE.InstancedMesh(plane, mat, list.length);
    list.forEach((d, k) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(d.f.nx, d.f.nz));
      qz.setFromAxisAngle(new THREE.Vector3(0, 0, 1), d.rot);
      q.multiply(qz);
      // desplazamiento a lo largo de la pared (tangente)
      const tx = d.f.nz, tz = -d.f.nx;
      pos.set(d.f.x + tx * d.off, d.y, d.f.z + tz * d.off);
      sc.set(d.w, d.h, 1);
      m4.compose(pos, q, sc);
      mesh.setMatrixAt(k, m4);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    group.add(mesh);
  });
  return group;
}

// ----------------------------------------------------------------------------------------------
// Catalogos de decals por tema
// ----------------------------------------------------------------------------------------------

const BLOOD = "#7d0b0e";

export const DECALS: Record<string, DecalSpec[]> = {
  offices: [
    { kind: "hand", color: BLOOD, weight: 3 },
    { kind: "smear", color: BLOOD, weight: 2 },
    { kind: "scratch", color: "#d8d0a8", weight: 2 },
    { kind: "scribble", color: BLOOD, weight: 3, texts: ["NO MIRES ATRÁS", "CORRE", "ÉL TE VE", "WAKA WAKA", "HAMBRE", "NO HAY SALIDA", "SIGUE COMIENDO", "ESTÁN AQUÍ"] },
    { kind: "pacman", color: "#3a2a10", weight: 1.5 },
  ],
  pool: [
    { kind: "hand", color: "#1e4a2a", weight: 2 },
    { kind: "scribble", color: "#27552f", weight: 3, texts: ["NO RESPIRES", "BAJO EL AGUA", "ELLOS ESCUCHAN", "NADA", "SIGUE NADANDO"] },
    { kind: "drip", color: "#2a5a3a", weight: 3 },
    { kind: "eyes", color: "#103a30", weight: 1.5 },
    { kind: "sign", color: "#000", weight: 1, texts: ["PROFUNDIDAD 2M", "PROHIBIDO CORRER", "CERRADO"] },
  ],
  arcade: [
    { kind: "neon", color: "#ff2fa0", weight: 2, texts: ["INSERT COIN", "GAME OVER", "1UP", "HI-SCORE ???"] },
    { kind: "neon", color: "#2ee6ff", weight: 2, texts: ["NO PARES", "READY?", "WAKA WAKA"] },
    { kind: "eyes", color: "#ff2fa0", weight: 1.5 },
    { kind: "pacman", color: "#ffd21a", weight: 2 },
    { kind: "hand", color: "#7d0b0e", weight: 2 },
    { kind: "scribble", color: "#ffe14a", weight: 1.5, texts: ["HAMBRE", "TE VEO", "JUEGA CONMIGO"] },
  ],
  boiler: [
    { kind: "warning", color: "#000", weight: 3 },
    { kind: "sign", color: "#000", weight: 2.5, texts: ["PELIGRO", "NO ENTRAR", "VÁLVULA 3", "ALTA PRESIÓN"] },
    { kind: "hand", color: "#18120c", weight: 2 },
    { kind: "smear", color: "#3a0a06", weight: 1.5 },
    { kind: "scribble", color: "#d8c8a0", weight: 1.5, texts: ["CALOR", "ABAJO", "NO SUBAS", "AÚN LATE"] },
  ],
  ward: [
    { kind: "smear", color: BLOOD, weight: 3 },
    { kind: "hand", color: BLOOD, weight: 3 },
    { kind: "sign", color: "#000", weight: 2.5, texts: ["SALA 7", "SILENCIO", "CUARENTENA", "ALA NORTE"] },
    { kind: "scribble", color: BLOOD, weight: 2.5, texts: ["NO LOS DESPIERTES", "PACIENTE 000", "AYUDA", "TODOS JUGAMOS"] },
    { kind: "scratch", color: "#cfd8c8", weight: 1.5 },
  ],
  stomach: [
    { kind: "drip", color: "#9aa820", weight: 4 },
    { kind: "hand", color: "#3a0008", weight: 2 },
  ],
};

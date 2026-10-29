// Utileria por tema: se coloca contra las paredes de tramos rectos de pasillo (sin bloquear intersecciones)
// y registra cajas de colision en la simulacion.

import * as THREE from "three";
import type { ThemeId } from "../config/campaign";
import { CELL } from "../config/constants";
import { makeCanvas, toTexture } from "../gfx/texkit";
import type { AABB } from "../sim/collision";
import { mulberry32 } from "../sim/rng";
import type { Simulation } from "../sim/simulation";

interface Prop {
  obj: THREE.Object3D;
  w: number; // ancho a lo largo de la pared
  d: number; // profundidad hacia el pasillo
  collide: boolean;
  /** Distancia de la pared (colgados en la pared: se ignora la profundidad). */
  wall?: boolean;
}

export interface PropsResult {
  group: THREE.Group;
  /** Materiales de pantalla que parpadean (maquinas recreativas). */
  screens: THREE.MeshBasicMaterial[];
  vents: { x: number; z: number }[];
  glands: THREE.Mesh[];
}

const std = (color: number, o: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.1, ...o });

function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function cyl(rt: number, rb: number, h: number, mat: THREE.Material, seg = 14): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.castShadow = true;
  return m;
}

// --------------------------------------------------------------------------------------------
// Pantallas de maquina recreativa
// --------------------------------------------------------------------------------------------

function screenTex(variant: number): THREE.CanvasTexture {
  const { c, ctx } = makeCanvas(128, 128);
  ctx.fillStyle = "#02020a"; ctx.fillRect(0, 0, 128, 128);
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  if (variant === 0) {
    ctx.fillStyle = "#ffd21a"; ctx.font = "bold 18px monospace"; ctx.fillText("INSERT", 64, 46); ctx.fillText("COIN", 64, 70);
  } else if (variant === 1) {
    for (let i = 0; i < 2600; i++) { const v = Math.random() * 255; ctx.fillStyle = `rgb(${v},${v},${v})`; ctx.fillRect(Math.random() * 128, Math.random() * 128, 2, 2); }
  } else if (variant === 2) {
    ctx.fillStyle = "#1a2aff"; ctx.fillRect(10, 20, 108, 6); ctx.fillRect(10, 100, 108, 6); ctx.fillRect(10, 20, 6, 86); ctx.fillRect(112, 20, 6, 86); ctx.fillRect(40, 44, 48, 6);
    ctx.fillStyle = "#ffd21a"; for (let i = 0; i < 6; i++) ctx.fillRect(24 + i * 14, 66, 4, 4);
    ctx.beginPath(); ctx.moveTo(34, 86); ctx.arc(34, 86, 10, 0.5, Math.PI * 2 - 0.5); ctx.fill();
    ctx.fillStyle = "#ff2a2a"; ctx.beginPath(); ctx.arc(90, 84, 9, Math.PI, 0); ctx.lineTo(99, 96); ctx.lineTo(81, 96); ctx.fill();
  } else {
    ctx.fillStyle = "#ff2a2a"; ctx.font = "bold 20px monospace"; ctx.fillText("GAME", 64, 50); ctx.fillText("OVER", 64, 78);
  }
  for (let y = 0; y < 128; y += 3) { ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.fillRect(0, y, 128, 1); }
  return toTexture(c, true, false);
}

// --------------------------------------------------------------------------------------------
// Fabricas de props
// --------------------------------------------------------------------------------------------

type Factory = (rng: () => number, screens: THREE.MeshBasicMaterial[]) => Prop;

const metalGrey = () => std(0x6a6e70, { roughness: 0.55, metalness: 0.5 });

const FACTORIES: Record<string, Factory> = {
  cabinet: () => {
    const g = new THREE.Group();
    const body = metalGrey();
    g.add(box(0.5, 1.35, 0.55, body, 0, 0.68, 0));
    const dark = std(0x2c2e30, { metalness: 0.6 });
    for (let i = 0; i < 4; i++) {
      g.add(box(0.44, 0.28, 0.02, dark, 0, 0.2 + i * 0.32, 0.28));
      g.add(box(0.14, 0.03, 0.03, std(0xb8b8b0, { metalness: 0.8 }), 0, 0.26 + i * 0.32, 0.3));
    }
    return { obj: g, w: 0.55, d: 0.6, collide: true };
  },
  boxes: (rng) => {
    const g = new THREE.Group();
    const m = std(0x8a6a44, { roughness: 0.95 });
    const sizes: [number, number, number][] = [[0.6, 0.45, 0.5], [0.48, 0.4, 0.42], [0.4, 0.32, 0.36]];
    let y = 0;
    sizes.forEach((s, i) => {
      if (i > 0 && rng() < 0.3) return;
      const b = box(s[0], s[1], s[2], m, (rng() - 0.5) * 0.08, y + s[1] / 2, (rng() - 0.5) * 0.06);
      b.rotation.y = (rng() - 0.5) * 0.35;
      g.add(b);
      g.add(box(s[0] * 0.98, 0.02, 0.06, std(0xd8c8a0), b.position.x, y + s[1] + 0.005, b.position.z));
      y += s[1];
    });
    return { obj: g, w: 0.75, d: 0.62, collide: true };
  },
  lifebuoy: () => {
    const g = new THREE.Group();
    const white = std(0xe8ece8, { roughness: 0.5 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.09, 12, 28), white);
    g.add(ring);
    const red = std(0xc01818, { roughness: 0.5 });
    for (let i = 0; i < 4; i++) {
      const arc = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.093, 12, 8, Math.PI / 4), red);
      arc.rotation.z = i * (Math.PI / 2) + Math.PI / 8;
      g.add(arc);
    }
    g.position.y = 1.6;
    g.rotation.x = 0;
    return { obj: g, w: 0.8, d: 0.1, collide: false, wall: true };
  },
  cone: () => {
    const g = new THREE.Group();
    const cone = cyl(0.02, 0.17, 0.6, std(0xf06000, { roughness: 0.55 }), 16);
    cone.position.y = 0.32;
    g.add(cone, box(0.4, 0.03, 0.4, std(0xf06000), 0, 0.015, 0));
    const stripe = cyl(0.075, 0.1, 0.07, std(0xf0f0f0), 16); stripe.position.y = 0.33;
    g.add(stripe);
    return { obj: g, w: 0.42, d: 0.42, collide: true };
  },
  arcade: (rng, screens) => {
    const g = new THREE.Group();
    const palette = [0x1a1a3a, 0x3a0a2a, 0x0a2a3a, 0x2a2a0a];
    const bodyMat = std(palette[Math.floor(rng() * palette.length)], { roughness: 0.6, metalness: 0.2 });
    // cuerpo (perfil simplificado en tres piezas)
    g.add(box(0.74, 1.05, 0.78, bodyMat, 0, 0.53, 0));
    g.add(box(0.74, 0.8, 0.5, bodyMat, 0, 1.45, -0.14));
    // panel de control inclinado
    const panel = box(0.7, 0.07, 0.34, std(0x15151a, { metalness: 0.4 }), 0, 1.08, 0.33);
    panel.rotation.x = 0.28;
    g.add(panel);
    // joystick y botones
    const stick = cyl(0.012, 0.012, 0.12, std(0xaaaaaa, { metalness: 0.9 }), 8); stick.position.set(-0.18, 1.17, 0.33);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), std(0xd02030, { roughness: 0.3 })); knob.position.set(-0.18, 1.24, 0.33);
    g.add(stick, knob);
    const btnColors = [0xff2fa0, 0x2ee6ff, 0xffd21a];
    btnColors.forEach((c, i) => { const b = cyl(0.03, 0.03, 0.025, new THREE.MeshBasicMaterial({ color: c }), 10); b.position.set(0.06 + i * 0.1, 1.12, 0.34); g.add(b); });
    // pantalla inclinada
    const smat = new THREE.MeshBasicMaterial({ map: screenTex(Math.floor(rng() * 4)), toneMapped: false });
    screens.push(smat);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.5), smat);
    screen.position.set(0, 1.42, 0.115); screen.rotation.x = -0.18;
    g.add(screen);
    // marquesina luminosa
    const hue = [0xff2fa0, 0x2ee6ff, 0xffd21a, 0x8a4cff][Math.floor(rng() * 4)];
    const marquee = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.16, 0.08), new THREE.MeshBasicMaterial({ color: new THREE.Color(hue).multiplyScalar(1.8), toneMapped: false }));
    marquee.position.set(0, 1.92, 0.05);
    g.add(marquee);
    // tiras de neon laterales
    for (const sx of [-1, 1]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.02, 1.4, 0.03), new THREE.MeshBasicMaterial({ color: new THREE.Color(hue).multiplyScalar(1.5), toneMapped: false }));
      strip.position.set(sx * 0.375, 0.9, 0.3);
      g.add(strip);
    }
    return { obj: g, w: 0.8, d: 0.85, collide: true };
  },
  barrel: (rng) => {
    const g = new THREE.Group();
    const cols = [0x6a3a1c, 0x2a4a60, 0x5a5a28, 0x3a3a3a];
    const n = rng() < 0.5 ? 2 : 1;
    for (let k = 0; k < n; k++) {
      const m = std(cols[Math.floor(rng() * cols.length)], { roughness: 0.6, metalness: 0.6 });
      const b = cyl(0.29, 0.29, 0.92, m, 18);
      b.position.set(k * 0.6 - (n - 1) * 0.3, 0.46, (rng() - 0.5) * 0.1);
      g.add(b);
      for (const y of [0.18, 0.46, 0.74]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.295, 0.016, 6, 22), std(0x303030, { metalness: 0.7 })); r.rotation.x = Math.PI / 2; r.position.set(b.position.x, y, b.position.z); g.add(r); }
      if (rng() < 0.4) {
        const leak = new THREE.Mesh(new THREE.CircleGeometry(0.2, 14), new THREE.MeshBasicMaterial({ color: 0x66ff33, toneMapped: false }));
        leak.rotation.x = -Math.PI / 2; leak.position.set(b.position.x + 0.1, 0.012, b.position.z + 0.5); g.add(leak);
      }
    }
    return { obj: g, w: n * 0.62, d: 0.7, collide: true };
  },
  pipe: () => {
    const g = new THREE.Group();
    const m = std(0x4a4a46, { metalness: 0.7, roughness: 0.45 });
    const p = cyl(0.1, 0.1, CELL, m, 12); p.rotation.z = Math.PI / 2; p.position.set(0, 2.85, 0.16);
    const p2 = cyl(0.06, 0.06, CELL, m, 10); p2.rotation.z = Math.PI / 2; p2.position.set(0, 2.55, 0.12);
    g.add(p, p2);
    for (const x of [-0.9, 0.9]) { const f = cyl(0.14, 0.14, 0.05, std(0x303030, { metalness: 0.8 }), 12); f.rotation.z = Math.PI / 2; f.position.set(x, 2.85, 0.16); g.add(f); }
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.014, 6, 18), std(0xb02020, { metalness: 0.5 }));
    wheel.position.set(0.2, 1.3, 0.08); g.add(wheel);
    return { obj: g, w: CELL * 0.9, d: 0.3, collide: false, wall: true };
  },
  gurney: () => {
    const g = new THREE.Group();
    const frame = std(0xb0b4b0, { metalness: 0.8, roughness: 0.3 });
    g.add(box(1.9, 0.05, 0.62, frame, 0, 0.6, 0));
    const sheet = (() => {
      const { c, ctx } = makeCanvas(128, 64);
      ctx.fillStyle = "#c9ccc0"; ctx.fillRect(0, 0, 128, 64);
      ctx.fillStyle = "rgba(110,10,12,0.75)"; ctx.beginPath(); ctx.ellipse(52, 30, 26, 15, 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(82, 40, 12, 8, 0, 0, Math.PI * 2); ctx.fill();
      return toTexture(c, true, false);
    })();
    const mat = box(1.85, 0.12, 0.6, new THREE.MeshStandardMaterial({ map: sheet, roughness: 0.9 }), 0, 0.7, 0);
    g.add(mat);
    // bulto bajo la sabana
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 1.1, 4, 10), new THREE.MeshStandardMaterial({ color: 0xbfc2b6, roughness: 0.95 }));
    body.rotation.z = Math.PI / 2; body.position.set(0.1, 0.9, 0); body.scale.set(1, 1, 1.2); g.add(body);
    for (const sx of [-0.8, 0.8]) for (const sz of [-0.25, 0.25]) {
      const leg = cyl(0.015, 0.015, 0.58, frame, 6); leg.position.set(sx, 0.3, sz); g.add(leg);
      const wh = cyl(0.045, 0.045, 0.04, std(0x222222), 10); wh.rotation.x = Math.PI / 2; wh.position.set(sx, 0.045, sz); g.add(wh);
    }
    return { obj: g, w: 1.95, d: 0.7, collide: true };
  },
  iv: () => {
    const g = new THREE.Group();
    const m = std(0xb8bcb8, { metalness: 0.8, roughness: 0.3 });
    const pole = cyl(0.014, 0.014, 1.7, m, 8); pole.position.y = 0.85; g.add(pole);
    const base = cyl(0.2, 0.2, 0.03, m, 14); base.position.y = 0.02; g.add(base);
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, 0.04), new THREE.MeshStandardMaterial({ color: 0x8a1018, transparent: true, opacity: 0.85, roughness: 0.2 }));
    bag.position.set(0.1, 1.55, 0); g.add(bag);
    const arm = box(0.2, 0.014, 0.014, m, 0.1, 1.68, 0); g.add(arm);
    return { obj: g, w: 0.45, d: 0.45, collide: true };
  },
  villi: (rng) => {
    const g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: 0xb24050, roughness: 0.3, emissive: 0x3a0610, emissiveIntensity: 0.6 });
    const n = 6 + Math.floor(rng() * 5);
    for (let i = 0; i < n; i++) {
      const h = 0.35 + rng() * 0.75;
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.05 + rng() * 0.07, h, 8), m);
      c.position.set((rng() - 0.5) * 0.7, h / 2, (rng() - 0.5) * 0.4);
      c.rotation.set((rng() - 0.5) * 0.35, 0, (rng() - 0.5) * 0.35);
      c.userData.phase = rng() * 6;
      g.add(c);
    }
    return { obj: g, w: 0.8, d: 0.55, collide: true };
  },
  nodule: (rng) => {
    const g = new THREE.Group();
    const col = [0xffd060, 0xa0ff70, 0xff6050][Math.floor(rng() * 3)];
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.13 + rng() * 0.08, 14, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(1.6), toneMapped: false }));
    s.position.set(0, 0.8 + rng() * 1.6, 0.0);
    g.add(s);
    s.userData.gland = true;
    return { obj: g, w: 0.3, d: 0.1, collide: false, wall: true };
  },
};

const THEME_PROPS: Record<ThemeId, { kind: string; weight: number }[]> = {
  offices: [{ kind: "cabinet", weight: 3 }, { kind: "boxes", weight: 3 }],
  pool: [{ kind: "lifebuoy", weight: 3 }, { kind: "cone", weight: 2 }],
  arcade: [{ kind: "arcade", weight: 7 }],
  boiler: [{ kind: "barrel", weight: 3 }, { kind: "pipe", weight: 4 }],
  ward: [{ kind: "gurney", weight: 3 }, { kind: "iv", weight: 2 }],
  stomach: [{ kind: "villi", weight: 4 }, { kind: "nodule", weight: 4 }],
};

/** Coloca utileria en tramos rectos de pasillo y registra colisiones en `sim.colliders`. */
export function buildProps(sim: Simulation, theme: ThemeId): PropsResult {
  const group = new THREE.Group();
  const screens: THREE.MeshBasicMaterial[] = [];
  const vents: { x: number; z: number }[] = [];
  const glands: THREE.Mesh[] = [];
  const { maze, layout } = sim;
  const rng = mulberry32(sim.level.seed ^ 0x9209);
  const list = THEME_PROPS[theme];
  const total = list.reduce((a, p) => a + p.weight, 0);

  const avoid: [number, number][] = [layout.player, layout.exit, layout.fruit, ...layout.ghosts, ...layout.pellets,
    ...layout.hideSpots.map((h) => h.cell), ...layout.switches.map((w) => w.cell), ...layout.batteries];
  const cands: { cx: number; cy: number; nx: number; nz: number }[] = [];
  for (let cy = 1; cy < maze.H - 1; cy++) for (let cx = 3; cx < maze.W - 3; cx++) {
    if (!maze.isWalkable(cx, cy) || maze.rows[cy][cx] === "S") continue;
    if (avoid.some(([ax, ay]) => Math.hypot(ax - cx, ay - cy) < 2.6)) continue;
    const wN = !maze.isWalkable(cx, cy - 1), wS = !maze.isWalkable(cx, cy + 1), wW = !maze.isWalkable(cx - 1, cy), wE = !maze.isWalkable(cx + 1, cy);
    // pasillo recto: solo dos paredes opuestas
    if (wN && wS && !wW && !wE) { cands.push({ cx, cy, nx: 0, nz: 1 }); cands.push({ cx, cy, nx: 0, nz: -1 }); }
    else if (wW && wE && !wN && !wS) { cands.push({ cx, cy, nx: 1, nz: 0 }); cands.push({ cx, cy, nx: -1, nz: 0 }); }
  }
  const corridorCells = Math.max(1, cands.length / 2);
  const target = Math.min(cands.length, Math.round(corridorCells * 0.14));
  const used = new Set<string>();

  for (let n = 0, guard = 0; n < target && guard < target * 12; guard++) {
    const c = cands[Math.floor(rng() * cands.length)];
    const key = `${c.cx},${c.cy}`;
    if (used.has(key)) continue;
    // separacion con vecinos ya usados
    let near = false;
    for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) if (used.has(`${c.cx + dx},${c.cy + dy}`)) { near = true; break; }
    if (near) continue;
    let r = rng() * total, kind = list[0].kind;
    for (const p of list) { r -= p.weight; if (r <= 0) { kind = p.kind; break; } }
    const prop = FACTORIES[kind](rng, screens);
    used.add(key);
    n++;
    const w = maze.cellToWorld(c.cx, c.cy);
    // la cara de la pared esta en el lado opuesto a la normal que apunta al pasillo
    const wallX = w.x - c.nx * (CELL / 2), wallZ = w.z - c.nz * (CELL / 2);
    const slide = (rng() - 0.5) * Math.max(0, CELL - prop.w - 0.25);
    const tx = c.nz, tz = -c.nx; // tangente a la pared
    const dist = prop.wall ? 0.02 : prop.d / 2 + 0.03;
    const px = wallX + c.nx * dist + tx * slide, pz = wallZ + c.nz * dist + tz * slide;
    prop.obj.position.set(px, 0, pz);
    prop.obj.rotation.y = Math.atan2(c.nx, c.nz);
    if (kind === "pipe") prop.obj.position.set(wallX + c.nx * 0.02, 0, wallZ + c.nz * 0.02);
    if (prop.wall && kind !== "pipe") { prop.obj.position.y = 0; }
    group.add(prop.obj);
    if (prop.collide) {
      const alongX = c.nz !== 0; // pared norte/sur: el ancho va a lo largo de X
      const hx = (alongX ? prop.w : prop.d) / 2, hz = (alongX ? prop.d : prop.w) / 2;
      const box2: AABB = { minX: px - hx, maxX: px + hx, minZ: pz - hz, maxZ: pz + hz };
      sim.colliders.push(box2);
    }
    if (kind === "pipe" && rng() < 0.5) vents.push({ x: wallX + c.nx * 0.5, z: wallZ + c.nz * 0.5 });
    prop.obj.traverse((o) => { if ((o as THREE.Mesh).userData.gland) glands.push(o as THREE.Mesh); });
  }
  return { group, screens, vents, glands };
}

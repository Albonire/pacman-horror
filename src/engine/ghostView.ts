// Modelo 3D de los fantasmas: silueta clasica de sabana con dobladillo ondulante, cara en parche
// esferico, pupilas que siguen al jugador, brazos y estados (dormido, persiguiendo, asustado, comido).

import * as THREE from "three";
import { drawGhostFace, FACE_COLORS, type FaceKind, type FaceMood } from "../gfx/faces";
import { fbmField, hash2, smoothstep } from "../gfx/noise";
import { Surface, blendPx, makeCanvas, shadePx, toTexture, type TexSet } from "../gfx/texkit";
import type { GhostMode, GhostSim } from "../sim/ghost";
import { sharedUniforms } from "./materials";

interface Spec {
  r: number; // radio del domo
  ry: number; // radio vertical del domo
  H: number; // altura total
  hemBase: number;
  flare: number;
  waves: number;
  amp: number;
  body: [number, number, number];
  armLen: number;
  armed: boolean;
  translucent: boolean;
}

const SPECS: Record<FaceKind, Spec> = {
  0: { r: 0.5, ry: 0.62, H: 2.5, hemBase: 0.18, flare: 0.1, waves: 7, amp: 0.32, body: [132, 14, 14], armLen: 1.05, armed: true, translucent: false },
  1: { r: 0.54, ry: 0.6, H: 1.95, hemBase: 0.12, flare: 0.34, waves: 9, amp: 0.2, body: [208, 148, 166], armLen: 0, armed: false, translucent: false },
  2: { r: 0.5, ry: 0.58, H: 2.15, hemBase: 0.3, flare: 0.14, waves: 11, amp: 0.46, body: [52, 150, 160], armLen: 0, armed: false, translucent: true },
  3: { r: 0.48, ry: 0.56, H: 1.95, hemBase: 0.14, flare: 0.12, waves: 5, amp: 0.1, body: [208, 124, 48], armLen: 0.72, armed: true, translucent: false },
};

function clothTexture(kind: FaceKind): TexSet {
  const sp = SPECS[kind];
  const W = 256, H = 512;
  const S = new Surface(W, H, sp.body, 0.5, 0.8);
  const folds = fbmField(W, H, 6, 3, 3, 40 + kind);
  const stain = fbmField(W, H, 4, 6, 5, 50 + kind);
  const grime = fbmField(W, H, 18, 24, 3, 60 + kind);
  S.pass((i, x, y, d, hg, rg) => {
    const u = x / W, v = y / H;
    const fold = Math.sin(u * Math.PI * 2 * 7 + folds[i] * 3.2 + v * 2.0);
    shadePx(d, i, 0.78 + 0.22 * (fold * 0.5 + 0.5));
    hg[i] = 0.5 + fold * 0.18 + (grime[i] - 0.5) * 0.12;
    const st = smoothstep(0.52, 0.72, stain[i]);
    blendPx(d, i, 26, 14, 10, st * 0.55);
    // suciedad en el bajo y gradiente de la tela
    shadePx(d, i, 1 - smoothstep(0.55, 1, v) * 0.35);
    // manchas de sangre
    if (kind === 0 || kind === 3) {
      const b = smoothstep(0.7, 0.8, grime[i]) * smoothstep(0.35, 0.8, v);
      blendPx(d, i, 70, 0, 4, b * 0.6);
    }
    // costuras cosidas
    if (Math.abs(((u * 6) % 1) - 0.5) < 0.01 && hash2(x, y >> 3, kind) > 0.35) { shadePx(d, i, 0.6); hg[i] -= 0.08; }
    rg[i] = 0.75 + (grime[i] - 0.5) * 0.3;
  });
  return S.build(2.4);
}

function sheetGeometry(sp: Spec, segs = 44): THREE.BufferGeometry {
  const rings: { y: (phi: number) => number; r: (phi: number) => number; hem: number; v: number }[] = [];
  const domeBase = sp.H - sp.ry; // y del ecuador del domo
  const D = 12;
  for (let i = 0; i <= D; i++) {
    const th = (i / D) * (Math.PI / 2);
    rings.push({ y: () => domeBase + sp.ry * Math.cos(th), r: () => Math.max(0.0001, sp.r * Math.sin(th)), hem: 0, v: i / D * 0.4 });
  }
  const B = 14;
  for (let j = 1; j <= B; j++) {
    const t = j / B;
    const hemY = (phi: number) => {
      const s = Math.abs(Math.cos((sp.waves * phi) / 2));
      return sp.hemBase + sp.amp * (1 - Math.pow(s, 0.65));
    };
    rings.push({
      y: (phi) => domeBase + (hemY(phi) - domeBase) * t,
      r: () => sp.r * (1 + sp.flare * Math.pow(t, 1.4)),
      hem: Math.pow(t, 2),
      v: 0.4 + t * 0.6,
    });
  }
  const pos: number[] = [], uv: number[] = [], hem: number[] = [], idx: number[] = [];
  for (let k = 0; k < rings.length; k++) {
    for (let s = 0; s <= segs; s++) {
      const phi = (s / segs) * Math.PI * 2;
      const ring = rings[k];
      const r = ring.r(phi);
      pos.push(-Math.cos(phi) * r, ring.y(phi), Math.sin(phi) * r);
      uv.push(s / segs, 1 - ring.v);
      hem.push(ring.hem);
    }
  }
  const stride = segs + 1;
  for (let k = 0; k < rings.length - 1; k++) {
    for (let s = 0; s < segs; s++) {
      const a = k * stride + s, b = a + 1, c = a + stride, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("aHem", new THREE.Float32BufferAttribute(hem, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  // unir normales de la costura
  const n = g.getAttribute("normal") as THREE.BufferAttribute;
  for (let k = 0; k < rings.length; k++) {
    const a = k * stride, b = k * stride + segs;
    const nx = (n.getX(a) + n.getX(b)) / 2, ny = (n.getY(a) + n.getY(b)) / 2, nz = (n.getZ(a) + n.getZ(b)) / 2;
    const l = Math.hypot(nx, ny, nz) || 1;
    n.setXYZ(a, nx / l, ny / l, nz / l);
    n.setXYZ(b, nx / l, ny / l, nz / l);
  }
  g.computeBoundingSphere();
  return g;
}

const FACE_CACHE = new Map<string, THREE.CanvasTexture>();
function faceTexture(kind: FaceKind, mood: FaceMood): THREE.CanvasTexture {
  const key = kind + mood;
  let t = FACE_CACHE.get(key);
  if (!t) {
    const { c, ctx } = makeCanvas(512, 512);
    drawGhostFace(ctx, kind, mood, 512, true);
    t = toTexture(c, true, false);
    t.anisotropy = 8;
    FACE_CACHE.set(key, t);
  }
  return t;
}

export function disposeFaceCache(): void {
  for (const t of FACE_CACHE.values()) t.dispose();
  FACE_CACHE.clear();
}

type Phase = "dormant" | "startled" | "hunt" | "frightened" | "eaten" | "frozen";

export class GhostView {
  readonly group = new THREE.Group();
  readonly kind: FaceKind;
  private sp: Spec;
  private body: THREE.Mesh;
  private bodyMat: THREE.MeshStandardMaterial;
  private cloth: TexSet;
  private patch: THREE.Mesh;
  private patchMat: THREE.MeshStandardMaterial;
  private pupils: THREE.Mesh[] = [];
  private pupilMat: THREE.MeshStandardMaterial;
  private eyeBalls: THREE.Group;
  private arms: { root: THREE.Group; fore: THREE.Group }[] = [];
  private extras = new THREE.Group();
  private orbs: THREE.Mesh[] = [];
  private uniforms = { uTime: sharedUniforms.uTime, uWaves: { value: 7 }, uSway: { value: 1 }, uTremble: { value: 0 } };
  private phase: Phase = "dormant";
  private yawSmooth = 0;
  private yawInit = false;
  private mood: FaceMood = "calm";
  private bob = Math.random() * 6.28;
  private lookT = { x: 0, y: 0 };
  readonly glowColor: THREE.Color;
  /** Intensidad de luz que desea este fantasma (la asigna el Game a una luz de la reserva). */
  lightIntensity = 0;
  alertness = 0; // 0..1 cuanto lo "ve" el jugador, para audio/efectos

  constructor(kind: FaceKind) {
    this.kind = kind;
    const sp = SPECS[kind];
    this.sp = sp;
    this.glowColor = new THREE.Color(FACE_COLORS[kind].glow);
    this.cloth = clothTexture(kind);
    this.uniforms.uWaves.value = sp.waves;

    this.bodyMat = new THREE.MeshStandardMaterial({
      map: this.cloth.map, normalMap: this.cloth.normal, roughnessMap: this.cloth.rough, roughness: 1,
      side: THREE.DoubleSide,
      emissive: new THREE.Color(FACE_COLORS[kind].glow).multiplyScalar(0.18), emissiveIntensity: 1,
      transparent: sp.translucent, opacity: sp.translucent ? 0.8 : 1,
    });
    this.bodyMat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.uniforms.uTime;
      shader.uniforms.uWaves = this.uniforms.uWaves;
      shader.uniforms.uSway = this.uniforms.uSway;
      shader.uniforms.uTremble = this.uniforms.uTremble;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nattribute float aHem;\nuniform float uTime, uWaves, uSway, uTremble;")
        .replace("#include <begin_vertex>", `#include <begin_vertex>
          float ang = atan(position.z, -position.x);
          float w = sin(uTime * 3.4 + ang * uWaves * 0.5 + aHem * 2.0);
          transformed.y += w * 0.07 * aHem * uSway;
          transformed.x += sin(uTime * 1.7 + position.y * 2.0) * 0.045 * aHem * uSway + sin(uTime * 41.0 + position.y * 9.0) * 0.012 * uTremble;
          transformed.z += cos(uTime * 1.3 + position.y * 2.4) * 0.045 * aHem * uSway + cos(uTime * 37.0 + position.y * 8.0) * 0.012 * uTremble;`);
    };
    this.bodyMat.customProgramCacheKey = () => "ghostbody";
    this.body = new THREE.Mesh(sheetGeometry(sp), this.bodyMat);
    this.body.castShadow = true;
    this.group.add(this.body);

    // parche de la cara sobre el domo
    const A = 1.95, th0 = 0.42, dth = 1.18;
    const patchGeo = new THREE.SphereGeometry(sp.r * 1.012, 28, 20, Math.PI / 2 - A / 2, A, th0, dth);
    this.patchMat = new THREE.MeshStandardMaterial({
      map: faceTexture(kind, "calm"), transparent: true, roughness: 0.55,
      emissive: kind === 2 ? 0xffffff : 0x000000, emissiveMap: kind === 2 ? faceTexture(kind, "calm") : null, emissiveIntensity: kind === 2 ? 0.9 : 0,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    this.patch = new THREE.Mesh(patchGeo, this.patchMat);
    this.patch.scale.y = sp.ry / sp.r;
    this.patch.position.y = sp.H - sp.ry;
    this.group.add(this.patch);

    // pupilas brillantes en las cuencas (Inky las lleva pintadas en la textura)
    this.pupilMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: this.glowColor, emissiveIntensity: 3.2, roughness: 0.2 });
    if (kind !== 2) {
      const sockets: [number, number][] = [[170, 205], [342, 205]];
      for (const [cx, cy] of sockets) {
        const phi = Math.PI / 2 - A / 2 + (cx / 512) * A;
        const th = th0 + (cy / 512) * dth;
        const px = -Math.cos(phi) * Math.sin(th) * sp.r * 1.03;
        const py = Math.cos(th) * sp.ry * 1.03 + (sp.H - sp.ry);
        const pz = Math.sin(phi) * Math.sin(th) * sp.r * 1.03;
        const pu = new THREE.Mesh(new THREE.SphereGeometry(kind === 1 ? 0.035 : 0.05, 10, 8), this.pupilMat);
        pu.position.set(px, py, pz);
        this.pupils.push(pu);
        this.group.add(pu);
      }
    }

    // modo "comido": solo dos globos oculares
    this.eyeBalls = new THREE.Group();
    for (const sx of [-1, 1]) {
      const eb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 10), new THREE.MeshStandardMaterial({ color: 0xf4eee4, emissive: 0x887766, emissiveIntensity: 0.9, roughness: 0.2 }));
      eb.position.set(sx * 0.16, 0, 0);
      const pu = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: 0x0a0505 }));
      pu.position.set(0, 0, 0.1);
      eb.add(pu);
      this.eyeBalls.add(eb);
    }
    this.eyeBalls.position.y = 1.2;
    this.eyeBalls.visible = false;
    this.group.add(this.eyeBalls);

    this.buildExtras(kind);
    this.group.add(this.extras);
    this.setPhase("dormant", true);
  }

  private buildExtras(kind: FaceKind): void {
    const sp = this.sp;
    const clothDark = new THREE.MeshStandardMaterial({ color: new THREE.Color(`rgb(${sp.body.map((c) => Math.round(c * 0.55)).join(",")})`), roughness: 0.9 });
    if (sp.armed) {
      for (const sx of [-1, 1]) {
        const root = new THREE.Group();
        root.position.set(sx * (sp.r * 0.95), sp.H - sp.ry - 0.15, 0.02);
        const upLen = sp.armLen * 0.5, loLen = sp.armLen * 0.55;
        const up = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.036, upLen, 8), clothDark);
        up.position.y = -upLen / 2;
        up.castShadow = true;
        const fore = new THREE.Group();
        fore.position.y = -upLen;
        const lo = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.024, loLen, 8), clothDark);
        lo.position.y = -loLen / 2;
        fore.add(lo);
        // garras
        const clawMat = new THREE.MeshStandardMaterial({ color: kind === 0 ? 0x1a1010 : 0xe8dcc4, roughness: 0.4 });
        for (let c = 0; c < 4; c++) {
          const claw = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.2, 5), clawMat);
          claw.position.set((c - 1.5) * 0.026, -loLen - 0.07, 0);
          claw.rotation.z = (c - 1.5) * 0.07;
          claw.rotation.x = Math.PI;
          fore.add(claw);
        }
        root.add(up, fore);
        this.extras.add(root);
        this.arms.push({ root, fore });
      }
    }
    if (kind === 1) {
      // velo: tira translucida que cae desde la nuca
      const veil = new THREE.Mesh(
        new THREE.PlaneGeometry(0.9, 1.7, 8, 12),
        new THREE.MeshStandardMaterial({ color: 0xf2dce4, transparent: true, opacity: 0.55, side: THREE.DoubleSide, roughness: 0.9 }),
      );
      veil.position.set(0, sp.H - 1.0, -sp.r * 0.95);
      veil.rotation.x = 0.08;
      this.extras.add(veil);
    }
    if (kind === 2) {
      for (let i = 0; i < 3; i++) {
        const o = new THREE.Mesh(
          new THREE.SphereGeometry(0.07, 10, 8),
          new THREE.MeshBasicMaterial({ color: 0x8ffcff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
        );
        this.extras.add(o);
        this.orbs.push(o);
      }
    }
  }

  private setMood(m: FaceMood): void {
    if (m === this.mood) return;
    this.mood = m;
    const t = faceTexture(this.kind, m);
    this.patchMat.map = t;
    if (this.kind === 2) this.patchMat.emissiveMap = t;
    this.patchMat.needsUpdate = true;
  }

  private setPhase(p: Phase, force = false): void {
    if (p === this.phase && !force) return;
    this.phase = p;
    const showBody = p !== "eaten";
    this.body.visible = showBody;
    this.patch.visible = showBody;
    this.extras.visible = showBody;
    for (const pu of this.pupils) pu.visible = showBody && p !== "dormant";
    this.eyeBalls.visible = p === "eaten";
    const frightened = p === "frightened";
    this.bodyMat.color.set(frightened ? 0x3a4cc8 : 0xffffff);
    this.bodyMat.emissive.copy(frightened ? new THREE.Color(0x2030a0) : new THREE.Color(FACE_COLORS[this.kind].glow).multiplyScalar(0.18));
    this.bodyMat.emissiveIntensity = frightened ? 1.4 : 1;
    this.uniforms.uTremble.value = frightened ? 1 : 0;
    this.uniforms.uSway.value = p === "frozen" ? 0.15 : p === "dormant" ? 0.35 : 1;
    this.setMood(p === "dormant" ? "calm" : p === "frightened" ? "scared" : p === "hunt" || p === "startled" ? "angry" : "calm");
  }

  private nearestWrap(a: number, b: number): number {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  /**
   * Sincroniza el modelo con la simulacion. `px, pz` posicion del jugador; `frightLow` true en los
   * ultimos segundos del poder (parpadeo).
   */
  update(dt: number, time: number, g: GhostSim, px: number, pz: number, frightLow: boolean): void {
    const dx = px - g.x, dz = pz - g.z;
    const dist = Math.hypot(dx, dz);

    // fase visual
    let phase: Phase;
    const mode: GhostMode = g.mode;
    if (mode === "eaten") phase = "eaten";
    else if (mode === "frightened") phase = "frightened";
    else if (mode === "dormant") phase = g.startled ? "startled" : "dormant";
    else phase = g.frozen ? "frozen" : "hunt";
    this.setPhase(phase);
    // gritar cuando esta cerca y es peligroso
    if (phase === "hunt" && dist < 6.5) this.setMood("scream");
    else if (phase === "hunt") this.setMood("angry");
    else if (phase === "frozen") this.setMood(dist < 8 ? "scream" : "calm");
    else if (phase === "startled") this.setMood("angry");

    // posicion y orientacion
    this.bob += dt * (phase === "dormant" ? 0.9 : 2.2);
    const hover = (this.kind === 2 ? 0.28 : 0.12) + Math.sin(this.bob) * (phase === "dormant" ? 0.02 : 0.07);
    this.group.position.set(g.x, hover, g.z);
    let targetYaw = g.yaw;
    if (phase === "dormant" || phase === "startled" || phase === "frozen") targetYaw = Math.atan2(dx, dz);
    else if (dist < 6) targetYaw = Math.atan2(dx, dz);
    if (!this.yawInit) { this.yawSmooth = targetYaw; this.yawInit = true; }
    const turn = this.nearestWrap(this.yawSmooth, targetYaw);
    this.yawSmooth += turn * Math.min(1, dt * (phase === "frozen" ? 20 : 7));
    this.group.rotation.y = this.yawSmooth;

    // escala
    const baseScale = phase === "frightened" ? 0.88 : 1;
    let sc = baseScale;
    if (phase === "startled") sc = 1 + Math.sin(time * 40) * 0.015;
    this.group.scale.setScalar(sc);
    // en 'comido' solo flotan los ojos
    if (phase === "eaten") {
      this.eyeBalls.position.y = 1.0 + Math.sin(time * 6) * 0.1;
    }

    // pupilas siguen al jugador (en el espacio local del fantasma)
    const localYaw = Math.atan2(dx, dz) - this.yawSmooth;
    const lx = Math.sin(this.nearestWrap(0, localYaw)) * 0.012;
    this.lookT.x += (lx - this.lookT.x) * Math.min(1, dt * 10);
    for (let i = 0; i < this.pupils.length; i++) {
      const pu = this.pupils[i];
      pu.position.x += (this.pupilBase(i).x + this.lookT.x - pu.position.x) * 0.5;
      const pulse = phase === "hunt" ? 1 + 0.25 * Math.sin(time * 9 + i) : phase === "frightened" ? 0.55 : 1;
      pu.scale.setScalar(pulse * (phase === "startled" ? 1.4 : 1));
    }
    this.pupilMat.emissiveIntensity = phase === "frightened" ? 0.8 : phase === "dormant" ? 0 : 3.2 + (phase === "hunt" ? Math.sin(time * 7) * 0.6 : 0);

    // brazos
    for (let i = 0; i < this.arms.length; i++) {
      const a = this.arms[i];
      const s = i === 0 ? -1 : 1;
      if (phase === "frozen") {
        // pose de "no me mires": brazos al frente, rigidos
        a.root.rotation.set(-1.45, 0, s * 0.18);
        a.fore.rotation.set(-0.2, 0, 0);
      } else if (phase === "hunt") {
        const sw = Math.sin(time * 5 + i * 3.1);
        a.root.rotation.set(-0.25 + sw * 0.35, 0, s * (0.2 + 0.1 * Math.sin(time * 3.3)));
        a.fore.rotation.set(-0.2 - Math.abs(sw) * 0.25, 0, 0);
      } else if (phase === "frightened") {
        a.root.rotation.set(-2.5, 0, s * 0.6 + Math.sin(time * 44) * 0.1);
        a.fore.rotation.set(-0.5, 0, 0);
      } else {
        a.root.rotation.set(0.05 + Math.sin(time * 0.9 + i) * 0.04, 0, s * 0.12);
        a.fore.rotation.set(0.1, 0, 0);
      }
    }
    for (let i = 0; i < this.orbs.length; i++) {
      const ang = time * (1.4 + i * 0.4) + i * 2.1;
      this.orbs[i].position.set(Math.cos(ang) * 0.7, 0.9 + Math.sin(time * 2 + i) * 0.5 + i * 0.4, Math.sin(ang) * 0.7);
    }

    // transparencias: parpadeo del poder
    const blink = phase === "frightened" && frightLow ? (Math.sin(time * 16) > 0 ? 1 : 0) : 0;
    this.bodyMat.emissiveIntensity = phase === "frightened" ? 1.2 + blink * 2.2 : 1;
    if (phase === "frightened" && frightLow) this.bodyMat.color.set(blink ? 0xffffff : 0x3a4cc8);

    // luz deseada
    let li = 0;
    if (phase === "hunt") li = 5.5;
    else if (phase === "startled") li = 8 + Math.sin(time * 50) * 4;
    else if (phase === "frightened") li = 2.5;
    else if (phase === "frozen") li = 3;
    else if (phase === "dormant") li = 0.6;
    this.lightIntensity = li;
  }

  /** Altura del centro de la cara respecto al suelo del fantasma. */
  get faceY(): number { return this.sp.H - this.sp.ry * 0.62; }

  /** Fuerza el modo grito (para el susto de muerte). */
  forceScream(): void { this.setPhase("hunt"); this.setMood("scream"); this.lightIntensity = 2.2; }

  private pupilBase(i: number): { x: number } {
    const pu = this.pupils[i];
    if (!pu.userData.baseX) pu.userData.baseX = pu.position.x;
    return { x: pu.userData.baseX as number };
  }

  dispose(): void {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else if (mat) mat.dispose();
    });
    this.cloth.map.dispose(); this.cloth.normal.dispose(); this.cloth.rough.dispose();
  }
}

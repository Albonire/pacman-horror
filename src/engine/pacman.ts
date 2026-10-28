// Pac-Man: cuerpo para la 3a persona y mandibulas en primera persona.
//
// El cuerpo es una esfera completa cuya cuña frontal se recorta en el shader (descarta
// fragmentos con |angulo| < apertura/2 alrededor del eje Z en el plano YZ). Las caras internas
// de la cuña son dos semidiscos que giran con cada mandibula, junto con sus dientes.

import * as THREE from "three";
import { mouthFlesh, pacmanSkin } from "../gfx/pacmanTex";
import { COLORS } from "../config/constants";
import type { TexSet } from "../gfx/texkit";

const R = 0.46;

function cutWedge(mat: THREE.MeshStandardMaterial, uHalf: { value: number }, key: string): void {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uHalf = uHalf;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vObj;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvObj = position;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vObj;\nuniform float uHalf;")
      .replace("#include <clipping_planes_fragment>", `#include <clipping_planes_fragment>
        if (vObj.z > 0.0 && abs(atan(vObj.y, vObj.z)) < uHalf) discard;`);
  };
  mat.customProgramCacheKey = () => key;
}

function toothMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: 0xd9ceaa, roughness: 0.55, metalness: 0.05, emissive: 0x1a1608, emissiveIntensity: 0.3 });
}

function makeTeeth(upper: boolean, mat: THREE.Material, scale: number, seed: number): THREE.Group {
  const g = new THREE.Group();
  const n = 11;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const gamma = 0.1 * Math.PI + t * 0.8 * Math.PI;
    // caninos mas grandes cerca del frente (z mayor)
    const mid = Math.sin(gamma);
    const jag = 0.7 + ((Math.sin(seed * 12.9 + i * 7.3) + 1) * 0.5) * 0.9;
    const h = (0.055 + 0.07 * mid) * jag * scale;
    const w = (0.028 + 0.016 * mid) * scale;
    if (Math.sin(seed * 5.1 + i * 3.7) > 0.88) continue; // diente roto/ausente
    const tooth = new THREE.Mesh(new THREE.ConeGeometry(w, h, 5), mat);
    tooth.position.set(Math.cos(gamma) * R * 0.97 * scale, (upper ? -h / 2 : h / 2), Math.sin(gamma) * R * 0.97 * scale);
    if (upper) tooth.rotation.x = Math.PI;
    tooth.rotation.z = (Math.sin(seed + i * 2.1)) * 0.12;
    g.add(tooth);
  }
  return g;
}

export class PacManBody {
  readonly group = new THREE.Group();
  readonly uHalf = { value: 0.3 };
  private upper = new THREE.Group();
  private lower = new THREE.Group();
  private tongue: THREE.Mesh;
  private eyes: THREE.Group;
  private pupils: THREE.Mesh[] = [];
  private skin: TexSet;
  private flesh: TexSet;
  private skinMat: THREE.MeshStandardMaterial;
  private body: THREE.Group = new THREE.Group();
  mouth = 0.5; // apertura total en radianes
  private chompT = 0;
  private chompDepth = 0.9;
  private phase = 0;
  glow = 0;

  constructor() {
    this.skin = pacmanSkin();
    this.flesh = mouthFlesh();
    this.skinMat = new THREE.MeshStandardMaterial({
      map: this.skin.map, normalMap: this.skin.normal, roughnessMap: this.skin.rough, roughness: 1,
      color: 0xffffff, emissive: COLORS.pacman, emissiveIntensity: 0.2,
    });
    cutWedge(this.skinMat, this.uHalf, "pm_skin");
    const fleshMat = new THREE.MeshStandardMaterial({
      map: this.flesh.map, normalMap: this.flesh.normal, roughnessMap: this.flesh.rough, roughness: 1,
      side: THREE.BackSide, emissive: 0x240305, emissiveIntensity: 0.6,
    });
    cutWedge(fleshMat, this.uHalf, "pm_flesh");

    const sphereGeo = new THREE.SphereGeometry(R, 40, 28);
    const outer = new THREE.Mesh(sphereGeo, this.skinMat);
    outer.castShadow = true;
    const inner = new THREE.Mesh(sphereGeo, fleshMat);
    this.body.add(outer, inner);

    // caras internas de la cuña
    const faceMat = new THREE.MeshStandardMaterial({
      map: this.flesh.map, normalMap: this.flesh.normal, roughness: 0.5, side: THREE.DoubleSide, emissive: 0x2a0508, emissiveIntensity: 0.7,
    });
    const upFace = new THREE.Mesh(new THREE.CircleGeometry(R, 40, 0, Math.PI).rotateX(Math.PI / 2), faceMat);
    const loFace = new THREE.Mesh(new THREE.CircleGeometry(R, 40, Math.PI, Math.PI).rotateX(-Math.PI / 2), faceMat);
    const teethMat = toothMaterial();
    this.upper.add(upFace, makeTeeth(true, teethMat, 1, 1.3));
    this.lower.add(loFace, makeTeeth(false, teethMat, 1, 4.7));

    // lengua en la mandibula inferior
    this.tongue = new THREE.Mesh(
      new THREE.SphereGeometry(R * 0.55, 18, 12),
      new THREE.MeshStandardMaterial({ color: 0x8a2230, roughness: 0.35, emissive: 0x200408, emissiveIntensity: 0.6 }),
    );
    this.tongue.scale.set(0.8, 0.22, 1.1);
    this.tongue.position.set(0, 0.02, R * 0.4);
    this.lower.add(this.tongue);

    this.body.add(this.upper, this.lower);

    // ojos
    this.eyes = new THREE.Group();
    for (const sx of [-1, 1]) {
      const eye = new THREE.Group();
      const dir = new THREE.Vector3(sx * 0.42, 0.55, 0.72).normalize().multiplyScalar(R * 0.99);
      eye.position.copy(dir);
      eye.lookAt(dir.clone().multiplyScalar(2));
      const sclera = new THREE.Mesh(
        new THREE.SphereGeometry(0.105, 18, 14),
        new THREE.MeshStandardMaterial({ color: 0xf2e6dc, roughness: 0.3, emissive: 0x330c0c, emissiveIntensity: 0.5 }),
      );
      sclera.scale.set(1, 1.15, 0.6);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.052, 12, 10), new THREE.MeshStandardMaterial({ color: 0x050303, roughness: 0.1 }));
      pupil.position.z = 0.045;
      eye.add(sclera, pupil);
      this.pupils.push(pupil);
      this.eyes.add(eye);
    }
    this.body.add(this.eyes);

    this.body.position.y = R + 0.02;
    this.group.add(this.body);
    this.setMouth(0.5);
  }

  /** Apertura total de la boca en radianes (0 cerrada). */
  setMouth(total: number): void {
    this.mouth = total;
    const half = Math.max(0.001, total / 2);
    this.uHalf.value = half;
    this.upper.rotation.x = -half;
    this.lower.rotation.x = half;
  }

  /** Dispara un mordisco rapido (cierra y reabre). */
  chomp(depth = 0.9): void { this.chompT = 1; this.chompDepth = depth; }

  update(dt: number, s: { moving: boolean; speed: number; running: boolean; powered: boolean; fear: number; time: number; exhausted: boolean }): void {
    this.phase += dt * (s.moving ? 3 + s.speed * 1.4 : 1.2);
    // mascada continua al moverse (clasica) + respiracion
    let open = s.moving ? 0.15 + 0.7 * Math.abs(Math.sin(this.phase)) : 0.32 + 0.1 * Math.sin(this.phase * 1.3);
    if (s.exhausted) open = 0.55 + 0.25 * Math.sin(s.time * 14);
    if (s.powered) open = 0.9 + 0.1 * Math.sin(s.time * 9);
    if (this.chompT > 0) { this.chompT = Math.max(0, this.chompT - dt * 6); open *= 1 - Math.sin(this.chompT * Math.PI) * this.chompDepth; }
    this.setMouth(open);
    this.tongue.position.y = 0.02 + Math.sin(s.time * 6) * 0.01 * (s.powered || s.exhausted ? 3 : 1);
    this.tongue.rotation.x = -0.1 + Math.sin(s.time * 4 + 1) * 0.06;
    // balanceo del cuerpo
    const bob = s.moving ? Math.abs(Math.sin(this.phase)) * 0.045 : Math.sin(s.time * 1.3) * 0.01;
    this.body.position.y = R + 0.02 + bob;
    this.body.scale.set(1 + (s.moving ? 0.03 * Math.sin(this.phase * 2) : 0), 1 - (s.moving ? 0.03 * Math.sin(this.phase * 2) : 0), 1);
    // pupilas dilatadas por el miedo
    for (const p of this.pupils) p.scale.setScalar(0.85 + s.fear * 0.7);
    this.skinMat.emissiveIntensity = 0.2 + (s.powered ? 0.55 + 0.25 * Math.sin(s.time * 10) : 0) + this.glow;
  }

  dispose(): void {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else if (mat) mat.dispose();
    });
    for (const t of [this.skin, this.flesh]) { t.map.dispose(); t.normal.dispose(); t.rough.dispose(); }
  }
}

// ---------------------------------------------------------------------------------------------
// Mandibulas en primera persona: se dibujan en una escena aparte, encima del mundo.
// ---------------------------------------------------------------------------------------------

export class PovJaws {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private lowerGroup = new THREE.Group();
  private upperGroup = new THREE.Group();
  private lowerLip: THREE.Mesh;
  private upperLip: THREE.Mesh;
  private skinMat: THREE.MeshStandardMaterial;
  private skin: TexSet;
  private teethMat = toothMaterial();
  private light = new THREE.PointLight(0xffe6b0, 2.5, 6, 2);
  private chompT = 0;
  private chompDepth = 0.6;
  private open = 0.67;
  private aspect = 16 / 9;
  private offX = 0;
  private offY = 0;
  private lagX = 0;
  private lagY = 0;
  private panic = 0;
  private teethRows: THREE.Group[] = [];

  constructor(aspect: number) {
    this.aspect = aspect;
    this.camera = new THREE.PerspectiveCamera(60, aspect, 0.05, 20);
    this.skin = pacmanSkin();
    this.skin.map.repeat.set(3, 1); this.skin.normal.repeat.set(3, 1); this.skin.rough.repeat.set(3, 1);
    this.skinMat = new THREE.MeshStandardMaterial({
      map: this.skin.map, normalMap: this.skin.normal, roughnessMap: this.skin.rough, roughness: 1,
      emissive: COLORS.pacman, emissiveIntensity: 0.08,
    });
    const gumMat = new THREE.MeshStandardMaterial({ color: 0x7a1218, roughness: 0.35, emissive: 0x2a0509, emissiveIntensity: 0.6 });

    const lipGeo = new THREE.SphereGeometry(1, 48, 24);
    this.lowerLip = new THREE.Mesh(lipGeo, this.skinMat);
    this.upperLip = new THREE.Mesh(lipGeo, this.skinMat);
    const gumLo = new THREE.Mesh(lipGeo, gumMat);
    const gumUp = new THREE.Mesh(lipGeo, gumMat);
    this.lowerGroup.add(this.lowerLip, gumLo);
    this.upperGroup.add(this.upperLip, gumUp);
    this.lowerLip.userData.gum = gumLo;
    this.upperLip.userData.gum = gumUp;

    // dientes: filas de conos que siguen el arco del labio
    const buildTeeth = (upper: boolean, seed: number): THREE.Group => {
      const g = new THREE.Group();
      const n = 17;
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n; // 0..1 de izquierda a derecha
        const x = (t - 0.5) * 2;
        if (Math.sin(seed * 9.1 + i * 4.3) > 0.9) continue; // diente caido
        const jag = 0.6 + ((Math.sin(seed * 7.7 + i * 5.9) + 1) * 0.5) * 1.0;
        const h = (0.02 + 0.016 * (1 - Math.abs(x))) * jag;
        const w = 0.0105 + 0.005 * (1 - Math.abs(x));
        const tooth = new THREE.Mesh(new THREE.ConeGeometry(w, h, 5), this.teethMat);
        tooth.userData = { x, h };
        if (upper) tooth.rotation.x = Math.PI;
        tooth.rotation.z = Math.sin(seed + i * 1.9) * 0.14;
        g.add(tooth);
      }
      return g;
    };
    const teethLo = buildTeeth(false, 2.1), teethUp = buildTeeth(true, 5.7);
    this.lowerGroup.add(teethLo);
    this.upperGroup.add(teethUp);
    this.teethRows = [teethLo, teethUp];

    this.scene.add(this.lowerGroup, this.upperGroup);
    this.scene.add(new THREE.HemisphereLight(0xfff0cc, 0x402008, 0.8));
    this.light.position.set(0, 0.05, -0.1);
    this.scene.add(this.light);
    this.layout();
  }

  setAspect(a: number): void {
    this.aspect = a;
    this.camera.aspect = a;
    this.camera.updateProjectionMatrix();
    this.layout();
  }

  /** Coloca las mandibulas segun la apertura actual (0 cerrada, 1 abierta de par en par). */
  private layout(): void {
    const dist = 0.75;
    const halfH = dist * Math.tan((this.camera.fov * Math.PI) / 360);
    const halfW = halfH * this.aspect;
    const w = halfW * 1.4;
    const ry = 0.16, rz = 0.2;
    // borde superior del labio inferior (fraccion de la mitad de la pantalla); abierta=0.67 -> ~ -0.80
    const topY = halfH * (-0.02 - 1.16 * this.open);
    this.lowerLip.scale.set(w, ry, rz);
    const gl = this.lowerLip.userData.gum as THREE.Mesh;
    gl.scale.set(w * 0.992, ry * 0.9, rz * 0.9);
    gl.position.y = 0.006;
    this.lowerGroup.position.set(this.offX, topY - ry + this.offY, -dist);
    // labio superior: solo asoma al morder
    const upBottom = halfH * (0.12 + 1.5 * this.open);
    this.upperLip.scale.set(w, ry, rz);
    const gu = this.upperLip.userData.gum as THREE.Mesh;
    gu.scale.set(w * 0.992, ry * 0.9, rz * 0.9);
    gu.position.y = -0.006;
    this.upperGroup.position.set(this.offX, upBottom + ry + this.offY, -dist);
    // dientes sobre el borde del labio (elipse)
    for (let k = 0; k < 2; k++) {
      const g = this.teethRows[k];
      const sign = k === 0 ? 1 : -1;
      g.children.forEach((c) => {
        const { x, h } = c.userData as { x: number; h: number };
        const px = x * w * 0.8;
        const ex = px / w;
        const edge = Math.sqrt(Math.max(0, 1 - ex * ex));
        c.position.set(px, sign * (ry * edge - 0.004 + h / 2), rz * 0.5 * edge);
      });
    }
  }

  chomp(depth = 0.6): void { this.chompT = 1; this.chompDepth = depth; }

  update(dt: number, s: {
    time: number; speed: number; running: boolean; exhausted: boolean; powered: boolean;
    yawVel: number; pitchVel: number; bobY: number; fear: number; glow: number;
  }): void {
    // apertura base y respiracion
    let open = 0.67 + Math.sin(s.time * 1.4) * 0.025;
    if (s.running) open = 0.74 + Math.sin(s.time * 11) * 0.12;
    if (s.exhausted) open = 0.85 + Math.sin(s.time * 14) * 0.1;
    if (s.powered) open = 0.95;
    this.panic += (s.fear - this.panic) * Math.min(1, dt * 4);
    open += Math.sin(s.time * 33) * 0.012 * this.panic;
    if (this.chompT > 0) {
      this.chompT = Math.max(0, this.chompT - dt * 5.5);
      open -= Math.sin(this.chompT * Math.PI) * this.chompDepth;
    }
    this.open = Math.max(0, Math.min(1, open));
    // inercia al girar la cabeza
    this.lagX += (-s.yawVel * 0.012 - this.lagX) * Math.min(1, dt * 10);
    this.lagY += (s.pitchVel * 0.012 - this.lagY) * Math.min(1, dt * 10);
    this.offX = this.lagX * 0.4;
    this.offY = this.lagY * 0.4 - s.bobY * 0.6;
    this.skinMat.emissiveIntensity = 0.08 + (s.powered ? 0.45 + 0.2 * Math.sin(s.time * 10) : 0) + s.glow;
    this.teethMat.emissiveIntensity = 0.05 + (s.powered ? 0.5 : 0);
    this.light.intensity = 2.2 + s.glow * 12 + (s.powered ? 5 : 0);
    this.layout();
  }

  dispose(): void {
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
    this.skinMat.dispose();
    this.teethMat.dispose();
    this.skin.map.dispose(); this.skin.normal.dispose(); this.skin.rough.dispose();
  }
}

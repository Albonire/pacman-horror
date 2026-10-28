// Pequenos objetos de escena: la "fruta" (un ojo que flota) y otros accesorios.

import * as THREE from "three";
import { makeCanvas, toTexture } from "../gfx/texkit";

let eyeTex: THREE.CanvasTexture | null = null;
function eyeTexture(): THREE.CanvasTexture {
  if (eyeTex) return eyeTex;
  const { c, ctx } = makeCanvas(256, 128);
  ctx.fillStyle = "#e9dcd2"; ctx.fillRect(0, 0, 256, 128);
  ctx.strokeStyle = "rgba(160,20,24,0.7)"; ctx.lineWidth = 1.4;
  for (let i = 0; i < 60; i++) {
    let x = Math.random() * 256, y = Math.random() * 128;
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let k = 0; k < 6; k++) { x += (Math.random() - 0.5) * 22; y += (Math.random() - 0.5) * 14; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  eyeTex = toTexture(c, true, false);
  return eyeTex;
}

export class FruitView {
  readonly group = new THREE.Group();
  private ball: THREE.Mesh;
  private iris: THREE.Mesh;
  private light: THREE.PointLight;
  private t = 0;

  constructor(color = 0x2a8f4a) {
    this.ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.26, 24, 18),
      new THREE.MeshStandardMaterial({ map: eyeTexture(), roughness: 0.18, emissive: 0x5a2a20, emissiveIntensity: 0.7 }),
    );
    this.iris = new THREE.Mesh(
      new THREE.CircleGeometry(0.115, 24),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.1, roughness: 0.2 }),
    );
    this.iris.position.z = 0.2605;
    const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.055, 18), new THREE.MeshBasicMaterial({ color: 0x050202 }));
    pupil.position.z = 0.001;
    this.iris.add(pupil);
    this.ball.add(this.iris);
    this.group.add(this.ball);
    this.light = new THREE.PointLight(0xffd0a0, 3, 5, 2);
    this.light.position.y = 0.2;
    this.group.add(this.light);
    this.group.visible = false;
  }

  show(x: number, z: number): void { this.group.position.set(x, 0.85, z); this.group.visible = true; this.t = 0; }
  hide(): void { this.group.visible = false; }
  get visible(): boolean { return this.group.visible; }

  update(dt: number, px: number, pz: number, timeLeft: number): void {
    if (!this.group.visible) return;
    this.t += dt;
    this.group.position.y = 0.85 + Math.sin(this.t * 2.2) * 0.08;
    // el ojo te mira
    this.ball.rotation.y = Math.atan2(px - this.group.position.x, pz - this.group.position.z);
    const blink = timeLeft < 3 && Math.sin(this.t * 14) > 0.3 ? 0.2 : 1;
    this.ball.scale.setScalar(blink);
  }

  dispose(): void {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | undefined;
      if (mat && !Array.isArray(mat)) mat.dispose();
    });
  }
}

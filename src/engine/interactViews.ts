// Vistas de los elementos interactivos: pilas recogibles, cajas de fusibles y armarios para esconderse.

import * as THREE from "three";
import { CELL } from "../config/constants";
import { makeCanvas, toTexture } from "../gfx/texkit";
import type { AABB } from "../sim/collision";
import type { Simulation } from "../sim/simulation";

let lockerTex: THREE.CanvasTexture | null = null;

/** Puerta de armario metalico: persiana de ranuras, oxido y una manija. */
function lockerTexture(): THREE.CanvasTexture {
  if (lockerTex) return lockerTex;
  const W = 128, H = 256;
  const { c, ctx } = makeCanvas(W, H);
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, "#3b3f3a"); g.addColorStop(0.5, "#4a4f48"); g.addColorStop(1, "#33372f");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // oxido
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = `rgba(${90 + Math.random() * 50},${40 + Math.random() * 20},10,${Math.random() * 0.18})`;
    ctx.beginPath(); ctx.ellipse(Math.random() * W, Math.random() * H, 3 + Math.random() * 14, 2 + Math.random() * 20, 0, 0, Math.PI * 2); ctx.fill();
  }
  // ranuras de ventilacion
  for (let i = 0; i < 9; i++) {
    const y = 30 + i * 9;
    ctx.fillStyle = "#050504"; ctx.fillRect(26, y, W - 52, 4);
    ctx.fillStyle = "rgba(255,255,255,0.08)"; ctx.fillRect(26, y + 4, W - 52, 1);
  }
  // marco, manija y abolladuras
  ctx.strokeStyle = "rgba(0,0,0,0.7)"; ctx.lineWidth = 4; ctx.strokeRect(2, 2, W - 4, H - 4);
  ctx.fillStyle = "#1a1a17"; ctx.fillRect(W - 30, H * 0.52, 8, 34);
  ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(14, H * 0.8, W - 28, 3);
  lockerTex = toTexture(c, true, false);
  return lockerTex;
}

export class InteractViews {
  readonly group = new THREE.Group();
  private batteryMeshes: THREE.Group[] = [];
  private lamps: { mat: THREE.MeshBasicMaterial; zone: number }[] = [];
  private lockerDoors: THREE.Mesh[] = [];

  constructor(private sim: Simulation) {
    const batMat = new THREE.MeshStandardMaterial({ color: 0x2c3a1e, emissive: 0x6dff5a, emissiveIntensity: 1.1, roughness: 0.4, metalness: 0.4 });
    const capMat = new THREE.MeshStandardMaterial({ color: 0xcfc9b0, roughness: 0.3, metalness: 0.8 });
    const haloMat = new THREE.MeshBasicMaterial({ color: 0x7dff6a, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false });
    for (const b of sim.batteries) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.3, 14), batMat);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.06, 10), capMat);
      cap.position.y = 0.18;
      const halo = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 10), haloMat);
      g.add(body, cap, halo);
      g.position.set(b.x, 0.7, b.z);
      this.group.add(g);
      this.batteryMeshes.push(g);
    }

    // cajas de fusibles
    const boxMat = new THREE.MeshStandardMaterial({ color: 0x2a2c27, roughness: 0.6, metalness: 0.5 });
    for (const sw of sim.switches) {
      const g = new THREE.Group();
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.16), boxMat);
      const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2a1a).multiplyScalar(2.2), toneMapped: false });
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), lampMat);
      lamp.position.set(0, 0.2, 0.09);
      const lever = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.26, 0.06), new THREE.MeshStandardMaterial({ color: 0x9c8f6a, roughness: 0.4, metalness: 0.7 }));
      lever.position.set(0, -0.08, 0.12);
      lever.rotation.x = -0.5;
      g.add(box, lamp, lever);
      const nx = -sw.wall[0], nz = -sw.wall[1];
      g.position.set(sw.x + sw.wall[0] * (CELL / 2 - 0.1), 1.35, sw.z + sw.wall[1] * (CELL / 2 - 0.1));
      g.rotation.y = Math.atan2(nx, nz);
      this.group.add(g);
      this.lamps.push({ mat: lampMat, zone: sw.zone });
    }

    // armarios
    const tex = lockerTexture();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x23251f, roughness: 0.7, metalness: 0.4 });
    const doorMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0.5 });
    for (const h of sim.hideSpots) {
      const w = 0.95, d = 0.6, ht = 2.1;
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, ht, d), bodyMat);
      body.position.y = ht / 2;
      const door = new THREE.Mesh(new THREE.BoxGeometry(w - 0.06, ht - 0.1, 0.04), doorMat);
      door.position.set(0, ht / 2, d / 2 + 0.02);
      g.add(body, door);
      const nx = -h.wall[0], nz = -h.wall[1];
      const px = h.x + h.wall[0] * (CELL / 2 - d / 2 - 0.02), pz = h.z + h.wall[1] * (CELL / 2 - d / 2 - 0.02);
      g.position.set(px, 0, pz);
      g.rotation.y = Math.atan2(nx, nz);
      this.group.add(g);
      this.lockerDoors.push(door);
      // colision solo del cuerpo, pegado a la pared
      const alongX = h.wall[1] !== 0;
      const hx = (alongX ? w : d) / 2, hz = (alongX ? d : w) / 2;
      const box2: AABB = { minX: px - hx, maxX: px + hx, minZ: pz - hz, maxZ: pz + hz };
      sim.colliders.push(box2);
    }
  }

  update(time: number, zoneLit: readonly number[], hiddenIndex: number): void {
    this.sim.batteries.forEach((b, i) => {
      const g = this.batteryMeshes[i];
      g.visible = !b.taken;
      g.position.y = 0.7 + Math.sin(time * 1.8 + i) * 0.06;
      g.rotation.y = time * 0.9 + i;
      g.rotation.z = Math.sin(time * 1.1 + i * 2) * 0.12;
    });
    for (const l of this.lamps) {
      const on = (zoneLit[l.zone] ?? 0) > 0;
      const blink = on ? 1 : 0.35 + 0.65 * (Math.sin(time * 3.2 + l.zone) > 0.2 ? 1 : 0);
      l.mat.color.set(on ? 0x6aff7a : 0xff2a1a).multiplyScalar(2.2 * blink);
    }
    this.lockerDoors.forEach((d, i) => { d.visible = i !== hiddenIndex; });
  }
}

// Un par de ojos brillantes en la oscuridad (susto ambiental): no hay cuerpo, solo dos puntos que parpadean.

import * as THREE from "three";
import { FACE_COLORS, type FaceKind } from "../gfx/faces";

export class EyesView {
  readonly group = new THREE.Group();
  private mats: THREE.MeshBasicMaterial[] = [];
  private halos: THREE.MeshBasicMaterial[] = [];
  private alpha = 0;

  constructor() {
    const core = new THREE.SphereGeometry(0.045, 12, 8);
    const halo = new THREE.SphereGeometry(0.15, 12, 8);
    for (const sx of [-0.17, 0.17]) {
      const m = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, transparent: true, depthWrite: false });
      const h = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.25 });
      const e = new THREE.Mesh(core, m);
      const o = new THREE.Mesh(halo, h);
      e.position.x = o.position.x = sx;
      this.group.add(e, o);
      this.mats.push(m);
      this.halos.push(h);
    }
    this.group.visible = false;
  }

  /** Coloca el par de ojos mirando hacia (tx, tz). `kind` elige el color (el del fantasma). */
  place(x: number, y: number, z: number, tx: number, tz: number, kind: FaceKind): void {
    this.group.position.set(x, y, z);
    this.group.rotation.y = Math.atan2(tx - x, tz - z);
    const c = new THREE.Color(FACE_COLORS[kind].glow).multiplyScalar(2.6);
    for (const m of this.mats) m.color.copy(c);
    for (const h of this.halos) h.color.copy(c);
  }

  /** 0..1: opacidad (los parpadeos la bajan a 0 un instante). */
  setAlpha(a: number): void {
    this.alpha = Math.max(0, Math.min(1, a));
    this.group.visible = this.alpha > 0.01;
    for (const m of this.mats) m.opacity = this.alpha;
    for (const h of this.halos) h.opacity = 0.25 * this.alpha;
  }

  get visible(): boolean { return this.group.visible; }

  dispose(): void {
    const geos = new Set<THREE.BufferGeometry>();
    this.group.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) geos.add(m.geometry); });
    geos.forEach((g) => g.dispose());
    for (const m of [...this.mats, ...this.halos]) m.dispose();
  }
}

// Plataforma de camara: primera persona (ojos de Pac-Man) y tercera persona, con balanceo,
// respiracion, sacudidas y variaciones de FOV.

import * as THREE from "three";
import * as K from "../config/constants";
import { rayDistance } from "../sim/collision";
import type { Maze } from "../sim/maze";
import type { PlayerSim } from "../sim/player";

export type CamMode = "fp" | "tp";

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  mode: CamMode = "fp";
  /** Fuerza primera persona sin tocar `mode` (se usa dentro del escondite). */
  forceFp = false;
  pitch = 0;
  /** Campo de vision HORIZONTAL en grados (ajuste del usuario); se convierte a vertical segun la relacion de aspecto. */
  baseFov = 90;
  /** 0..1 */
  trauma = 0;
  roll = 0;
  fovPunch = 0;
  /** 0..1: cuanto de metido esta en un escondite (suaviza el estrechamiento del campo de vision). */
  private hideK = 0;
  /** Altura objetivo de la camara (varia al meterse en un conducto bajo o bajo una mesa). */
  targetEyeH = K.EYE_H;
  private eyeH = K.EYE_H;
  private bobPhase = 0;
  private bobAmp = 0;
  private breath = 0;
  private time = 0;
  /** Direccion de mirada final (para linterna y audio). */
  readonly forward = new THREE.Vector3(0, 0, -1);
  readonly position = new THREE.Vector3();
  /** Pose forzada (jumpscare). Si no es null se ignora al jugador. */
  override: { pos: THREE.Vector3; target: THREE.Vector3; fov: number; roll: number } | null = null;
  headBob = true;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(60, aspect, 0.06, 140);
    this.camera.fov = this.vfov(this.baseFov);
    this.camera.updateProjectionMatrix();
    this.camera.rotation.order = "YXZ";
  }

  addTrauma(t: number): void { this.trauma = Math.min(1, this.trauma + t); }

  setAspect(a: number): void { this.camera.aspect = a; this.camera.updateProjectionMatrix(); }

  /** FOV vertical equivalente a uno horizontal. Una pantalla 16:9 con 78 grados verticales daba ~110 horizontales (efecto ojo de pez). */
  vfov(hDeg: number): number {
    const a = Math.max(0.5, this.camera.aspect);
    const v = (2 * Math.atan(Math.tan((hDeg * Math.PI) / 360) / a) * 180) / Math.PI;
    return Math.max(35, Math.min(95, v));
  }

  update(dt: number, p: PlayerSim, maze: Maze, opts: { exertion: number; tension: number; frozen: boolean }): void {
    this.time += dt;
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    this.fovPunch *= Math.exp(-dt * 6);
    const cam = this.camera;
    this.hideK += ((this.forceFp ? 1 : 0) - this.hideK) * Math.min(1, dt * 4);
    this.eyeH += (this.targetEyeH - this.eyeH) * Math.min(1, dt * 8);

    // balanceo: sigue la distancia recorrida
    const target = this.headBob ? Math.min(1, p.speed / K.PLAYER_RUN) : 0;
    this.bobAmp += (target - this.bobAmp) * Math.min(1, dt * 8);
    this.bobPhase += p.speed * dt * (p.running ? 1.9 : 2.1);
    this.breath += dt * (1.1 + opts.exertion * 3.2);
    const breathAmp = (this.headBob ? 0.012 : 0.004) * (1 + opts.exertion * 2.2);
    const bobY = Math.sin(this.bobPhase * 2) * 0.026 * this.bobAmp + Math.sin(this.breath) * breathAmp;
    const bobX = Math.cos(this.bobPhase) * 0.018 * this.bobAmp;
    const rollWalk = Math.cos(this.bobPhase) * 0.0085 * this.bobAmp;

    const shake = this.trauma * this.trauma;
    const sx = (Math.sin(this.time * 47.1) + Math.sin(this.time * 31.7 + 1.3)) * 0.5 * shake * 0.05;
    const sy = (Math.sin(this.time * 39.3 + 2.1) + Math.sin(this.time * 53.9)) * 0.5 * shake * 0.05;
    const sr = Math.sin(this.time * 29.3) * shake * 0.05;

    if (this.override) {
      cam.position.copy(this.override.pos);
      cam.lookAt(this.override.target);
      cam.rotateZ(this.override.roll + sr);
      cam.fov = this.override.fov;
      cam.updateProjectionMatrix();
      cam.getWorldDirection(this.forward);
      this.position.copy(cam.position);
      return;
    }

    const yaw = p.viewYaw + sx;
    // dentro del escondite se respira despacio y la vista se mece un poco
    const pitch = this.pitch + sy + Math.sin(this.time * 0.9) * 0.006 * this.hideK;
    const rx = Math.cos(p.viewYaw), rz = -Math.sin(p.viewYaw);

    if (this.mode === "fp" || this.forceFp) {
      cam.position.set(p.x + rx * bobX, this.eyeH + bobY, p.z + rz * bobX);
      cam.rotation.set(pitch, yaw, rollWalk + this.roll + sr);
    } else {
      // tercera persona: detras y arriba, acortada si hay un muro
      const fx = -Math.sin(p.viewYaw), fz = -Math.cos(p.viewYaw);
      const dist = Math.max(0.5, rayDistance(maze, p.x, p.z, -fx, -fz, 2.9) - 0.3);
      cam.position.set(p.x - fx * dist, K.EYE_H + 0.95 + bobY * 0.5 + Math.max(0, -this.pitch) * 1.2, p.z - fz * dist);
      cam.rotation.set(Math.min(0.3, pitch * 0.6 - 0.18), yaw, this.roll + sr);
    }

    // FOV: base + correr - tension + golpe
    const fov = this.vfov(this.baseFov + (p.running ? 6 : 0) - opts.tension * 3 + this.fovPunch - 16 * this.hideK);
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov += (fov - cam.fov) * Math.min(1, dt * 7);
      cam.updateProjectionMatrix();
    }
    cam.getWorldDirection(this.forward);
    this.position.copy(cam.position);
  }
}

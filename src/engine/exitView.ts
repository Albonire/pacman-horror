// Puerta de salida: marco, losa que sube al abrirse, cartel SALIDA y luz verde del recinto.

import * as THREE from "three";
import { CELL, COLORS } from "../config/constants";
import { makeCanvas } from "../gfx/texkit";
import type { ThemeVisual } from "../gfx/themes";
import type { Maze } from "../sim/maze";

export interface ExitView {
  group: THREE.Group;
  light: THREE.PointLight;
  open: number; // 0 cerrada .. 1 abierta
  update(dt: number, unlocked: boolean, time: number): void;
}

function signTexture(): THREE.CanvasTexture {
  const { c, ctx } = makeCanvas(256, 64);
  ctx.fillStyle = "#04140a";
  ctx.fillRect(0, 0, 256, 64);
  ctx.strokeStyle = "#39ff6a";
  ctx.lineWidth = 3;
  ctx.strokeRect(4, 4, 248, 56);
  ctx.fillStyle = "#7dffa0";
  ctx.font = "bold 40px 'Courier New', monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("SALIDA", 128, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function makeExitDoor(maze: Maze, _theme: ThemeVisual): ExitView {
  const group = new THREE.Group();
  const [ex, ey] = maze.exit;
  const [dx, dy] = maze.exitDir;
  const c = maze.cellToWorld(ex, ey);
  // la puerta esta en el borde de la celda de salida que da al pasillo
  group.position.set(c.x + dx * (CELL / 2 - 0.1), 0, c.z + dy * (CELL / 2 - 0.1));
  group.rotation.y = Math.atan2(dx, dy);

  const frameMat = new THREE.MeshStandardMaterial({ color: 0x26211a, roughness: 0.75, metalness: 0.4 });
  const w = CELL * 0.86, h = 2.9, t = 0.28;
  const post = new THREE.BoxGeometry(0.22, h, t);
  const left = new THREE.Mesh(post, frameMat); left.position.set(-w / 2, h / 2, 0);
  const right = new THREE.Mesh(post, frameMat); right.position.set(w / 2, h / 2, 0);
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(w + 0.22, 0.24, t), frameMat); lintel.position.set(0, h, 0);
  group.add(left, right, lintel);

  const slabMat = new THREE.MeshStandardMaterial({
    color: COLORS.exitLocked, emissive: 0x5a0a0a, emissiveIntensity: 0.9, roughness: 0.5, metalness: 0.5,
  });
  const slab = new THREE.Mesh(new THREE.BoxGeometry(w - 0.1, h - 0.1, 0.1), slabMat);
  slab.position.set(0, (h - 0.1) / 2, 0);
  group.add(slab);
  // franjas de peligro en la losa
  const stripeMat = new THREE.MeshBasicMaterial({ color: 0xff3a2a });
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(w - 0.2, 0.06, 0.02), stripeMat);
    s.position.set(0, 0.7 + i * 0.55, 0.06);
    slab.add(s);
    s.position.y -= (h - 0.1) / 2;
  }

  const signMat = new THREE.MeshBasicMaterial({ map: signTexture(), toneMapped: false });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.28), signMat);
  sign.position.set(0, h + 0.28, t / 2 + 0.01);
  group.add(sign);

  const light = new THREE.PointLight(0xff3322, 5, 9, 2);
  light.position.set(0, 1.5, 0.6);
  group.add(light);
  // luz interior del recinto (se enciende verde al abrirse)
  const inner = new THREE.PointLight(COLORS.exitOpen, 0, 8, 2);
  inner.position.set(0, 1.4, -1.0);
  group.add(inner);

  const view: ExitView = {
    group, light, open: 0,
    update(dt, unlocked, time) {
      const target = unlocked ? 1 : 0;
      this.open += (target - this.open) * Math.min(1, dt * 2.2);
      slab.position.y = (h - 0.1) / 2 + this.open * (h - 0.2);
      if (unlocked) {
        slabMat.color.setHex(COLORS.exitOpen);
        slabMat.emissive.setHex(COLORS.exitOpen);
        slabMat.emissiveIntensity = 1.2;
        light.color.setHex(COLORS.exitOpen);
        light.intensity = 7 + Math.sin(time * 3) * 1.5;
        inner.intensity = 10 * this.open;
        signMat.color.setHex(0xffffff);
      } else {
        slabMat.emissiveIntensity = 0.6 + 0.35 * Math.sin(time * 1.3);
        light.intensity = 4 + Math.sin(time * 1.3) * 1.2;
        signMat.color.setHex(0x335540);
      }
    },
  };
  return view;
}

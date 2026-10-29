// Vista 3D de un nivel: entorno (suelo, techo, paredes, luminarias), puntos, pellets, puerta y polvo.

import * as THREE from "three";
import { CELL, COLORS, WALL_H } from "../config/constants";
import { fbmField, hash2 } from "../gfx/noise";
import { Surface } from "../gfx/texkit";
import type { ThemeTextures, ThemeVisual } from "../gfx/themes";
import { mulberry32 } from "../sim/rng";
import type { Simulation } from "../sim/simulation";
import { surfaceMaterial, sharedUniforms, withTime } from "./materials";
import { buildDecals, DECALS } from "./decals";
import { buildProps } from "./propsBuilder";
import { buildWallGeometry } from "./wallGeometry";
import { makeExitDoor, type ExitView } from "./exitView";
import type { Quality } from "./settings";

interface FixtureState {
  x: number;
  z: number;
  dead: boolean;
  broken: boolean;
  phase: number;
  speed: number;
  level: number;
  color: THREE.Color;
}

export interface PelletView {
  group: THREE.Group;
  core: THREE.Mesh;
  halo: THREE.Mesh;
  rings: THREE.Mesh[];
  x: number;
  z: number;
  eaten: boolean;
  fade: number;
}

export interface LevelViewUpdate {
  time: number;
  dt: number;
  playerX: number;
  playerZ: number;
  lightsMul: number; // 0 = apagon
  powered: boolean;
  exitUnlocked: boolean;
}

function disposeObject(o: THREE.Object3D): void {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
    else if (mat) mat.dispose();
  });
}

export class LevelView {
  readonly group = new THREE.Group();
  readonly theme: ThemeVisual;
  readonly exit: ExitView;
  readonly pellets: PelletView[] = [];
  readonly fixtureLights: THREE.PointLight[] = [];
  readonly fixtures: FixtureState[] = [];
  readonly dust: THREE.Points;

  private dots: THREE.InstancedMesh;
  private dotIndex = new Map<number, number>();
  private fixtureMesh: THREE.InstancedMesh | null = null;
  private fixtureCol = new THREE.Color();
  private curtains: THREE.Mesh[] = [];
  private tmpM = new THREE.Matrix4();
  private zeroM = new THREE.Matrix4().makeScale(0, 0, 0);
  private lightOrder: number[] = [];
  private poolSize: number;
  private dustBase: Float32Array;
  private lastOrderT = -1;
  private wallMat: THREE.MeshStandardMaterial;
  private waterMat: THREE.MeshStandardMaterial | null = null;
  private waterNormal: THREE.Texture | null = null;
  private screens: THREE.MeshBasicMaterial[] = [];
  private glands: THREE.Mesh[] = [];
  /** Salidas de vapor (Subsuelo): el Game emite humo desde aqui. */
  vents: { x: number; z: number }[] = [];

  constructor(sim: Simulation, theme: ThemeVisual, tex: ThemeTextures, quality: Quality) {
    this.theme = theme;
    const { maze } = sim;
    const mazeW = maze.worldWidth, mazeD = maze.worldDepth;
    this.poolSize = quality === "high" ? 8 : quality === "medium" ? 6 : 4;

    // ---- suelo y techo ----
    const margin = CELL * 2;
    const planeGeo = new THREE.PlaneGeometry(mazeW + margin, mazeD + margin);
    const fr = theme.floorCells;
    const rep: [number, number] = [(mazeW + margin) / CELL / fr, (mazeD + margin) / CELL / fr];
    const floor = new THREE.Mesh(planeGeo, surfaceMaterial(tex.floor, rep, {}, { scale: 0.12, strength: 0.4 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.group.add(floor);
    const ceil = new THREE.Mesh(planeGeo.clone(), surfaceMaterial(tex.ceiling, rep, {}, { scale: 0.1, strength: 0.3 }));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = WALL_H;
    this.group.add(ceil);

    // ---- paredes ----
    const wallGeo = buildWallGeometry(maze, { withConnectors: true });
    const wallMat = surfaceMaterial(tex.wall, [1, 1], { vertexColors: true }, { scale: 0.2, strength: 0.38, vertical: true }, theme.wallBump);
    const walls = new THREE.Mesh(wallGeo, wallMat);
    walls.castShadow = true;
    walls.receiveShadow = true;
    this.group.add(walls);
    this.wallMat = wallMat;

    // ---- agua baja sobre el suelo (Piscinas) ----
    if (theme.water) {
      const ws = new Surface(256, 256, [128, 128, 128], 0.5, 0.1);
      const f1 = fbmField(256, 256, 6, 6, 4, 901), f2 = fbmField(256, 256, 11, 11, 3, 903);
      ws.pass((i, _x, _y, _d, hg) => { hg[i] = 0.5 + (f1[i] - 0.5) * 0.7 + (f2[i] - 0.5) * 0.35; });
      const wt = ws.build(3.2);
      wt.normal.repeat.set(mazeW / 7, mazeD / 7);
      this.waterNormal = wt.normal;
      wt.map.dispose(); wt.rough.dispose();
      this.waterMat = new THREE.MeshStandardMaterial({
        color: 0x2a7f8c, transparent: true, opacity: 0.5, roughness: 0.05, metalness: 0.15,
        normalMap: wt.normal, normalScale: new THREE.Vector2(0.55, 0.55), depthWrite: false,
      });
      const water = new THREE.Mesh(new THREE.PlaneGeometry(mazeW + margin, mazeD + margin), this.waterMat);
      water.rotation.x = -Math.PI / 2;
      water.position.y = 0.06;
      water.renderOrder = 1;
      this.group.add(water);
    }

    // ---- decals y utileria ----
    this.group.add(buildDecals(sim, DECALS[theme.id] ?? [], quality === "low" ? 0.6 : 1));
    const props = buildProps(sim, theme.id);
    this.group.add(props.group);
    this.screens = props.screens;
    this.vents = props.vents;
    this.glands = props.glands;

    // ---- cortinas del tunel (vacio oscuro al final de cada conector) ----
    const curtainMat = new THREE.ShaderMaterial({
      uniforms: { uTime: sharedUniforms.uTime, uColor: { value: new THREE.Color(theme.voidColor) } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform float uTime; uniform vec3 uColor; varying vec2 vUv;
        float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
        float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y); }
        void main(){
          float m = n(vUv * vec2(4.0, 6.0) + vec2(uTime * 0.25, -uTime * 0.18)) * 0.6 + n(vUv * 9.0 - uTime * 0.4) * 0.4;
          vec3 c = uColor + vec3(0.02, 0.0, 0.03) * m;
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    for (const side of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(CELL, WALL_H), curtainMat);
      m.position.set(side * maze.tunnelLimit, WALL_H / 2, maze.cellToWorld(0, maze.tunnelRow).z);
      m.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
      this.group.add(m);
      this.curtains.push(m);
    }

    // ---- luminarias ----
    this.buildFixtures(sim, theme);

    // ---- puntos ----
    const dotGeo = new THREE.SphereGeometry(0.1, 12, 10);
    const dotMat = new THREE.MeshStandardMaterial({ color: COLORS.dot, emissive: COLORS.dot, emissiveIntensity: 2.4, roughness: 0.35 });
    withTime(dotMat, `
      #ifdef USE_INSTANCING
        float ph = instanceMatrix[3].x * 1.7 + instanceMatrix[3].z * 1.3;
        transformed.y += sin(uTime * 2.2 + ph) * 0.045;
        transformed *= 0.92 + 0.08 * sin(uTime * 3.0 + ph);
      #endif`, "dots");
    const cells: number[] = [];
    for (let y = 0; y < maze.H; y++) for (let x = 0; x < maze.W; x++) if (sim.dotGrid[y * maze.W + x]) cells.push(y * maze.W + x);
    this.dots = new THREE.InstancedMesh(dotGeo, dotMat, cells.length);
    cells.forEach((ci, i) => {
      const x = ci % maze.W, y = (ci - x) / maze.W;
      const w = maze.cellToWorld(x, y);
      this.tmpM.makeTranslation(w.x, 0.46, w.z);
      this.dots.setMatrixAt(i, this.tmpM);
      this.dotIndex.set(ci, i);
    });
    this.dots.instanceMatrix.needsUpdate = true;
    this.dots.frustumCulled = false;
    this.group.add(this.dots);

    // ---- pellets de poder ----
    for (const p of sim.pellets) this.pellets.push(this.makePellet(p.x, p.z));

    // ---- salida ----
    this.exit = makeExitDoor(maze, theme);
    this.group.add(this.exit.group);

    // ---- polvo ----
    const count = quality === "low" ? 120 : 280;
    const dg = new THREE.BufferGeometry();
    const dp = new Float32Array(count * 3);
    const rng = mulberry32(sim.level.seed);
    for (let i = 0; i < count; i++) {
      dp[i * 3] = (rng() - 0.5) * mazeW;
      dp[i * 3 + 1] = rng() * WALL_H;
      dp[i * 3 + 2] = (rng() - 0.5) * mazeD;
    }
    this.dustBase = dp.slice();
    dg.setAttribute("position", new THREE.BufferAttribute(dp, 3));
    this.dust = new THREE.Points(dg, new THREE.PointsMaterial({
      size: 0.035, color: 0xffeccc, transparent: true, opacity: 0.38, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    }));
    this.dust.frustumCulled = false;
    this.group.add(this.dust);
  }

  private buildFixtures(sim: Simulation, theme: ThemeVisual): void {
    const { maze } = sim;
    const rng = mulberry32(sim.level.seed ^ 0xabc123);
    const spots: { x: number; z: number; alongX: boolean }[] = [];
    for (let y = 1; y < maze.H - 1; y += 2) {
      for (let x = 1; x < maze.W - 1; x += 2) {
        if (maze.rows[y][x] === "#") continue;
        const rx = (x - 1) / 2, ry = (y - 1) / 2;
        if ((rx + ry) % theme.fixtureEvery !== 0) continue;
        const w = maze.cellToWorld(x, y);
        const horiz = maze.isWalkable(x - 1, y) || maze.isWalkable(x + 1, y);
        const vert = maze.isWalkable(x, y - 1) || maze.isWalkable(x, y + 1);
        spots.push({ x: w.x, z: w.z, alongX: horiz || !vert });
      }
    }
    // tambien la fila del tunel (cada 4 celdas) para evitar un pasillo central a oscuras
    const ty = maze.tunnelRow;
    for (let x = 2; x < maze.W - 2; x += 4) {
      const w = maze.cellToWorld(x, ty);
      spots.push({ x: w.x, z: w.z, alongX: true });
    }
    const orb = theme.fixtureStyle === "orb";
    const w = theme.fixtureStyle === "tube" ? 1.5 : 0.9;
    const d = theme.fixtureStyle === "tube" ? 0.34 : 0.9;
    const glowGeo = orb ? new THREE.SphereGeometry(0.24, 14, 10) : new THREE.BoxGeometry(w, 0.03, d);
    const frameGeo = orb ? new THREE.CylinderGeometry(0.05, 0.12, 0.3, 8) : new THREE.BoxGeometry(w + 0.16, 0.07, d + 0.16);
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x5a554a, roughness: 0.7, metalness: 0.3 });
    const glow = new THREE.InstancedMesh(glowGeo, glowMat, spots.length);
    const frame = new THREE.InstancedMesh(frameGeo, frameMat, spots.length);
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3(1, 1, 1);
    spots.forEach((sp, i) => {
      const dead = rng() < theme.deadChance;
      const broken = !dead && rng() < theme.brokenChance;
      const col = new THREE.Color(theme.fixtureColors ? theme.fixtureColors[Math.floor(rng() * theme.fixtureColors.length)] : theme.fixtureColor);
      this.fixtures.push({ x: sp.x, z: sp.z, dead, broken, phase: rng() * 6.28, speed: 5 + rng() * 9, level: 1, color: col });
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), sp.alongX ? 0 : Math.PI / 2);
      this.tmpM.compose(new THREE.Vector3(sp.x, orb ? WALL_H - 0.5 : WALL_H - 0.045, sp.z), q, s);
      glow.setMatrixAt(i, this.tmpM);
      this.tmpM.compose(new THREE.Vector3(sp.x, orb ? WALL_H - 0.18 : WALL_H - 0.03, sp.z), q, s);
      frame.setMatrixAt(i, this.tmpM);
      glow.setColorAt(i, this.fixtureCol.copy(col).multiplyScalar(dead ? 0.06 : 2.2));
    });
    glow.instanceMatrix.needsUpdate = true;
    frame.instanceMatrix.needsUpdate = true;
    glow.frustumCulled = false;
    frame.frustumCulled = false;
    this.group.add(frame, glow);
    this.fixtureMesh = glow;

    for (let i = 0; i < this.poolSize; i++) {
      const l = new THREE.PointLight(theme.fixtureColor, 0, theme.fixtureDistance, 2);
      l.position.set(0, WALL_H - 0.4, 0);
      this.group.add(l);
      this.fixtureLights.push(l);
    }
    this.lightOrder = spots.map((_, i) => i);
  }

  private makePellet(x: number, z: number): PelletView {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    const coreMat = new THREE.MeshStandardMaterial({ color: 0xffe6a0, emissive: 0xffb02e, emissiveIntensity: 3.2, roughness: 0.3 });
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.28, 20, 16), coreMat);
    core.position.y = 0.75;
    group.add(core);
    const haloMat = new THREE.MeshBasicMaterial({ color: 0xff9a1e, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending });
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), haloMat);
    halo.position.y = 0.75;
    group.add(halo);
    const rings: THREE.Mesh[] = [];
    for (let i = 0; i < 2; i++) {
      const r = new THREE.Mesh(
        new THREE.TorusGeometry(0.46 + i * 0.1, 0.012, 6, 40),
        new THREE.MeshBasicMaterial({ color: 0xffd070, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      r.position.y = 0.75;
      r.rotation.x = Math.PI / 2 + i * 0.7;
      r.rotation.y = i * 1.2;
      group.add(r);
      rings.push(r);
    }
    this.group.add(group);
    return { group, core, halo, rings, x, z, eaten: false, fade: 1 };
  }

  eatDot(cellIndex: number): void {
    const i = this.dotIndex.get(cellIndex);
    if (i === undefined) return;
    this.dots.setMatrixAt(i, this.zeroM);
    this.dots.instanceMatrix.needsUpdate = true;
  }

  eatPellet(index: number): void {
    const p = this.pellets[index];
    if (p) p.eaten = true;
  }

  update(u: LevelViewUpdate): void {
    sharedUniforms.uTime.value = u.time;
    const t = u.time;

    // fluctuacion de luminarias
    const mesh = this.fixtureMesh;
    for (let i = 0; i < this.fixtures.length; i++) {
      const f = this.fixtures[i];
      let lv = 1;
      if (f.dead) lv = 0;
      else if (f.broken) {
        const fl = Math.sin(t * f.speed + f.phase) + Math.sin(t * f.speed * 2.7 + f.phase * 1.7);
        lv = fl > 1.3 ? 0.04 : fl > 0.9 ? 0.45 : 0.85 + 0.15 * Math.sin(t * 40 + f.phase);
        if (hash2(Math.floor(t * 20), i, 5) < 0.04) lv *= 0.2;
      } else {
        lv = 0.94 + 0.06 * Math.sin(t * 100 + f.phase);
      }
      lv *= u.lightsMul;
      if (u.powered) lv = lv * 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t * 9 + f.phase));
      f.level = lv;
      if (mesh) {
        // la luminaria se atenua al acercarse a la camara: evita el disco blanco que satura el bloom
        const dx = f.x - u.playerX, dz = f.z - u.playerZ;
        const near = Math.min(1, Math.max(0, (Math.sqrt(dx * dx + dz * dz) - 1.0) / 3.6));
        const nearGain = 0.28 + 0.72 * near * near * (3 - 2 * near);
        mesh.setColorAt(i, this.fixtureCol.copy(f.color).multiplyScalar(f.dead ? 0.05 : 0.05 + lv * 2.2 * nearGain));
      }
    }
    if (mesh && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    // pool de luces: las N luminarias mas cercanas al jugador
    if (t - this.lastOrderT > 0.1) {
      this.lastOrderT = t;
      const px = u.playerX, pz = u.playerZ;
      const fx = this.fixtures;
      this.lightOrder.sort((a, b) =>
        ((fx[a].x - px) ** 2 + (fx[a].z - pz) ** 2) - ((fx[b].x - px) ** 2 + (fx[b].z - pz) ** 2));
    }
    for (let k = 0; k < this.fixtureLights.length; k++) {
      const f = this.fixtures[this.lightOrder[k]];
      const l = this.fixtureLights[k];
      if (!f) { l.intensity = 0; continue; }
      l.position.set(f.x, WALL_H - 0.4, f.z);
      l.color.copy(f.color);
      l.intensity = this.theme.fixtureIntensity * f.level;
    }

    // pellets
    for (const p of this.pellets) {
      if (p.eaten) {
        p.fade = Math.max(0, p.fade - u.dt * 3);
        p.group.visible = p.fade > 0.01;
        p.group.scale.setScalar(Math.max(0.01, p.fade));
        continue;
      }
      const pulse = 1 + 0.12 * Math.sin(t * 4.2);
      p.core.scale.setScalar(pulse);
      p.core.position.y = 0.75 + Math.sin(t * 1.7) * 0.06;
      p.halo.scale.setScalar(1 + 0.2 * Math.sin(t * 3.1 + 1));
      p.rings[0].rotation.z = t * 1.2;
      p.rings[1].rotation.z = -t * 0.9;
    }

    // efectos por tema
    const th = this.theme;
    if (th.pulse) {
      const k = 0.5 + 0.5 * Math.sin(t * th.pulse.speed);
      const beat = Math.pow(Math.max(0, Math.sin(t * th.pulse.speed * 2)), 6);
      this.wallMat.emissive.setHex(th.pulse.color);
      this.wallMat.emissiveIntensity = 0.25 + th.pulse.amount * (0.35 * k + 0.9 * beat);
    } else if (th.id === "arcade") {
      this.wallMat.emissiveIntensity = 1.25 + 0.2 * Math.sin(t * 7) + (hash2(Math.floor(t * 12), 3, 9) > 0.96 ? -0.6 : 0);
    }
    for (let i = 0; i < this.screens.length; i++) {
      this.screens[i].color.setScalar(0.6 + 0.4 * (0.5 + 0.5 * Math.sin(t * 17 + i * 2.3)) * (hash2(Math.floor(t * 15), i, 7) > 0.1 ? 1 : 0.3));
    }
    for (let i = 0; i < this.glands.length; i++) this.glands[i].scale.setScalar(1 + 0.18 * Math.sin(t * 2.1 + i));
    if (this.waterNormal) this.waterNormal.offset.set(t * 0.012, t * 0.007);

    // polvo
    const pos = this.dust.geometry.getAttribute("position") as THREE.BufferAttribute;
    const base = this.dustBase;
    for (let i = 0; i < pos.count; i++) {
      pos.array[i * 3] = base[i * 3] + Math.sin(t * 0.15 + i) * 0.4;
      pos.array[i * 3 + 1] = ((base[i * 3 + 1] + t * 0.05 * (1 + (i % 3) * 0.4)) % WALL_H);
      pos.array[i * 3 + 2] = base[i * 3 + 2] + Math.cos(t * 0.12 + i * 1.3) * 0.4;
    }
    pos.needsUpdate = true;

    this.exit.update(u.dt, u.exitUnlocked, t);
  }

  dispose(): void {
    disposeObject(this.group);
    this.group.clear();
    this.waterNormal?.dispose();
  }
}

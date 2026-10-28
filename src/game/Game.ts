import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";

import { buildLevel, LevelData } from "../config/levels";
import { Maze, astar, bfsField, bfsDist, nearestWalkable, Cell } from "../entities/Pathfinding";
import { makeTextures, TexSet } from "../graphics/ProceduralTextures";
import {
  makeAcechador, makeInterceptor, makeResonador, makeEstatico,
  makePlayerBody, makeExitDoor, makePowerBox, GhostBuild,
} from "../graphics/ProceduralMeshes";
import { HorrorAudioEngine } from "../audio/HorrorAudioEngine";
import { Radar, RadarData } from "./Radar";
import * as K from "../config/constants";

export type GameState = "MENU" | "PLAYING" | "PAUSED" | "GAMEOVER" | "VICTORY";

export interface HudRefs {
  root: HTMLElement;
  dots: HTMLElement;
  lives: HTMLElement;
  level: HTMLElement;
  staminaFill: HTMLElement;
  batteryFill: HTMLElement;
  msg: HTMLElement;
  fright: HTMLElement;
  frightFill: HTMLElement;
  crosshair: HTMLElement;
  radarWrap: HTMLElement;
  flash: HTMLElement;
  vignette: HTMLElement;
  hint: HTMLElement;
}

export interface GameCallbacks {
  onStateChange: (s: GameState) => void;
}

type Dir = { dx: number; dy: number };
const DIR_UP: Dir = { dx: 0, dy: -1 };

// ---------------- Mover en cuadrícula (estilo Pac-Man) ----------------
function pickWalkableDir(maze: Maze, cell: Cell): Dir {
  const dirs: Dir[] = [{ dx: 0, dy: -1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }];
  for (const d of dirs) if (maze.isWalkable(cell[0] + d.dx, cell[1] + d.dy)) return d;
  return { dx: 0, dy: -1 };
}

class Mover {
  cx: number; cy: number; dx: number; dy: number; p = 0;
  speed: number;
  maze: Maze;
  moving = false;
  constructor(maze: Maze, cx: number, cy: number, dx: number, dy: number, speed: number) {
    this.maze = maze; this.cx = cx; this.cy = cy; this.dx = dx; this.dy = dy; this.speed = speed;
    this.moving = maze.isWalkable(cx + dx, cy + dy);
  }
  get cell(): Cell { return [this.cx, this.cy]; }
  worldPos(out: { x: number; z: number }): { x: number; z: number } {
    const a = this.maze.cellToWorld(this.cx, this.cy);
    const b = this.maze.cellToWorld(this.cx + this.dx, this.cy + this.dy);
    out.x = a.x + (b.x - a.x) * this.p;
    out.z = a.z + (b.z - a.z) * this.p;
    return out;
  }
  advance(dt: number, choose: (m: Mover) => Dir | null): boolean {
    let wrapped = false;
    if (!this.moving) {
      const nd = choose(this);
      if (nd && this.maze.isWalkable(this.cx + nd.dx, this.cy + nd.dy)) {
        this.dx = nd.dx; this.dy = nd.dy; this.moving = true;
      } else return false;
    }
    this.p += this.speed * dt;
    let guard = 0;
    while (this.p >= 1 && guard++ < 8) {
      const oldCx = this.cx;
      this.cx = this.maze.wrapX(this.cx + this.dx, this.cy + this.dy);
      this.cy = this.cy + this.dy;
      if (Math.abs(this.cx - oldCx) > 1) wrapped = true;
      this.p -= 1;
      const nd = choose(this);
      if (nd && this.maze.isWalkable(this.cx + nd.dx, this.cy + nd.dy)) {
        this.dx = nd.dx; this.dy = nd.dy;
      } else {
        this.moving = false; this.p = 0; break; // parado ante la pared
      }
    }
    return wrapped;
  }
}

// ---------------- Fantasma ----------------
type GhostState = "scatter" | "chase" | "frightened" | "eaten";
class Ghost {
  kind: 0 | 1 | 2 | 3;
  mover: Mover;
  build: GhostBuild;
  state: GhostState = "scatter";
  spawnCell: Cell;
  corner: Cell;
  frozen = false;
  stareTime = 0;
  dashTimer = 0;
  bobPhase = Math.random() * Math.PI * 2;
  lastVisual = "";
  constructor(kind: 0 | 1 | 2 | 3, maze: Maze, spawn: Cell, corner: Cell, build: GhostBuild, speed: number) {
    this.kind = kind; this.mover = new Mover(maze, spawn[0], spawn[1], 0, -1, speed);
    this.spawnCell = spawn; this.corner = corner; this.build = build;
  }
}

// ---------------- Motor principal ----------------
export class Game {
  container: HTMLElement;
  hud: HudRefs;
  cb: GameCallbacks;
  radar: Radar;
  audio = new HorrorAudioEngine();

  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: PointerLockControls;
  composer: EffectComposer;
  vhsPass: ShaderPass;

  state: GameState = "MENU";
  levelIndex = 0;
  level!: LevelData;
  maze!: Maze;

  worldGroup = new THREE.Group();
  actorsGroup = new THREE.Group();

  // jugador
  playerMover!: Mover;
  playerSpawn: Cell = [0, 0];
  playerBody!: THREE.Group;
  flashlight!: THREE.SpotLight;
  flashTarget!: THREE.Object3D;
  inputDir: Dir | null = null;
  heldDirs = new Set<string>();
  stamina = K.STAMINA_MAX;
  panting = 0;
  battery = K.BATTERY_MAX;
  flashlightOn = true;
  running = false;
  lives = K.PLAYER_LIVES;
  invuln = 0;
  faceDir: Dir = DIR_UP;
  walkPhase = 0;
  stepAcc = 0;
  shiftHeld = false;
  keysSpace = false;
  keysTab = false;
  keysE = false;

  // entidades
  ghosts: Ghost[] = [];
  modeTimer = 4;
  mode: "scatter" | "chase" = "scatter";
  frightTimer = 0;
  tensionSmooth = 0;

  // coleccionables
  dotsInst!: THREE.InstancedMesh;
  dotIndex = new Map<string, number>();
  remainingDots = new Set<string>();
  dotsCollected = 0;
  totalDots = 0;
  pellets: { cell: Cell; group: THREE.Group; used: boolean }[] = [];
  pelletHold = 0;
  exitGroup!: THREE.Group;
  exitDoor!: THREE.Mesh;
  exitUnlocked = false;

  // radar
  radarActive = false;
  radarPingTimer = 0;
  radarPingAnim = 0;

  // cámara
  camMode: "fp" | "iso" = "fp";
  headBob = 0;

  // luces techo
  ceilingLights: { light: THREE.PointLight; base: number; phase: number; speed: number; broken: boolean }[] = [];
  fixtureMesh!: THREE.InstancedMesh;
  ceilingMesh!: THREE.Mesh;

  // partículas
  dust!: THREE.Points;

  // texturas
  tex!: { wall: TexSet; floor: TexSet; ceiling: TexSet; staticTex: THREE.Texture };

  // misc
  clock = new THREE.Clock();
  elapsed = 0;
  tmpV = new THREE.Vector3();
  tmpV2 = new THREE.Vector3();
  distField: number[][] = [];
  distTimer = 0;
  flashTimer = 0;
  staticTimer = 0;
  msgTimer = 0;
  muted = false;
  rafStarted = false;
  disposed = false;

  constructor(container: HTMLElement, radarCanvas: HTMLCanvasElement, hud: HudRefs, cb: GameCallbacks) {
    this.container = container;
    this.hud = hud;
    this.cb = cb;
    this.radar = new Radar(radarCanvas);

    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(K.COLORS.fog);
    this.scene.fog = new THREE.FogExp2(K.COLORS.fog, 0.055);

    this.camera = new THREE.PerspectiveCamera(72, container.clientWidth / container.clientHeight, 0.05, 120);
    this.controls = new PointerLockControls(this.camera, this.renderer.domElement);

    const hemi = new THREE.HemisphereLight(0x2a2a38, 0x0a0805, 0.55);
    this.scene.add(hemi);
    const amb = new THREE.AmbientLight(0x1a1408, 0.6);
    this.scene.add(amb);

    this.flashlight = new THREE.SpotLight(K.COLORS.flashlight, 2.6, 22, 0.55, 0.65, 2);
    this.flashlight.castShadow = true;
    this.flashlight.shadow.mapSize.set(512, 512);
    this.flashlight.shadow.bias = -0.0006;
    this.flashlight.shadow.radius = 4;
    this.scene.add(this.flashlight);
    this.flashTarget = new THREE.Object3D();
    this.scene.add(this.flashTarget);
    this.flashlight.target = this.flashTarget;

    this.scene.add(this.worldGroup);
    this.scene.add(this.actorsGroup);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(container.clientWidth, container.clientHeight), 0.55, 0.7, 0.72);
    this.composer.addPass(bloom);
    this.composer.addPass(new OutputPass());
    this.vhsPass = new ShaderPass(VHSShader);
    this.composer.addPass(this.vhsPass);

    this.tex = makeTextures();

    this.bindInput();
    window.addEventListener("resize", () => this.onResize());
    document.addEventListener("pointerlockchange", () => this.onLockChange());

    this.setHudVisible(false);
    this.loop = this.loop.bind(this);
  }

  // ---------------- entrada ----------------
  private bindInput(): void {
    const keyDir: Record<string, Dir> = {
      KeyW: DIR_UP, ArrowUp: DIR_UP,
      KeyS: { dx: 0, dy: 1 }, ArrowDown: { dx: 0, dy: 1 },
      KeyA: { dx: -1, dy: 0 }, ArrowLeft: { dx: -1, dy: 0 },
      KeyD: { dx: 1, dy: 0 }, ArrowRight: { dx: 1, dy: 0 },
    };
    const prevent = new Set(["Space", "Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);
    window.addEventListener("keydown", (e) => {
      if (prevent.has(e.code)) e.preventDefault();
      if (e.code === "Escape") { this.togglePause(); return; }
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") this.shiftHeld = true;
      if (e.code === "Space") this.keysSpace = true;
      if (e.code === "Tab") this.keysTab = true;
      if (e.code === "KeyE") this.keysE = true;
      if (this.state !== "PLAYING") return;
      if (e.code === "KeyC") { this.toggleCamera(); return; }
      if (e.code === "KeyF") { this.flashlightOn = !this.flashlightOn; return; }
      if (e.code === "KeyM") { this.muted = !this.muted; this.audio.setMuted(this.muted); return; }
      const d = keyDir[e.code];
      if (d) {
        this.heldDirs.add(e.code);
        this.inputDir = d;
        this.faceDir = d;
      }
    });
    window.addEventListener("keyup", (e) => {
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") this.shiftHeld = false;
      if (e.code === "Space") this.keysSpace = false;
      if (e.code === "Tab") this.keysTab = false;
      if (e.code === "KeyE") this.keysE = false;
      const d = keyDir[e.code];
      if (d) {
        this.heldDirs.delete(e.code);
        if (this.inputDir && this.inputDir.dx === d.dx && this.inputDir.dy === d.dy) {
          let next: Dir | null = null;
          for (const code of this.heldDirs) { const nd = keyDir[code]; if (nd) { next = nd; break; } }
          this.inputDir = next;
        }
      }
    });
    this.renderer.domElement.addEventListener("click", () => {
      if (this.state === "PAUSED") { this.togglePause(); return; }
      if (this.state === "PLAYING" && this.camMode === "fp" && !this.controls.isLocked) this.controls.lock();
    });
  }

  private onLockChange(): void {
    const locked = this.controls.isLocked;
    this.hud.hint.style.opacity = locked || this.camMode === "iso" || this.state !== "PLAYING" ? "0" : "1";
  }

  private onResize(): void {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
  }

  private togglePause(): void {
    if (this.state === "PLAYING") {
      this.state = "PAUSED";
      this.controls.unlock();
      this.cb.onStateChange("PAUSED");
    } else if (this.state === "PAUSED") {
      this.state = "PLAYING";
      this.cb.onStateChange("PLAYING");
      if (this.camMode === "fp") this.controls.lock();
    }
  }

  private toggleCamera(): void {
    this.camMode = this.camMode === "fp" ? "iso" : "fp";
    if (this.camMode === "fp") this.controls.lock();
    else this.controls.unlock();
    this.hud.crosshair.style.opacity = this.camMode === "fp" ? "1" : "0";
    // En iso se ocultan el techo y los plafones (vista "dollhouse" cerrada)
    if (this.ceilingMesh) {
      this.ceilingMesh.visible = this.camMode === "fp";
      this.fixtureMesh.visible = this.camMode === "fp";
    }
    this.onLockChange();
  }

  // ---------------- API pública ----------------
  start(): void {
    this.audio.resume();
    this.levelIndex = 0;
    this.lives = K.PLAYER_LIVES;
    this.buildLevel(0);
    this.state = "PLAYING";
    this.setHudVisible(true);
    this.cb.onStateChange("PLAYING");
    if (this.camMode === "fp") this.controls.lock();
    this.hud.crosshair.style.opacity = this.camMode === "fp" ? "1" : "0";
    this.hud.hint.style.opacity = this.camMode === "fp" ? "1" : "0";
    this.clock.getDelta();
    if (!this.rafStarted) { this.rafStarted = true; this.loop(); }
  }

  restart(): void { this.start(); }

  resume(): void { if (this.state === "PAUSED") this.togglePause(); }

  quit(): void {
    this.controls.unlock();
    this.state = "MENU";
    this.setHudVisible(false);
    this.cb.onStateChange("MENU");
  }

  isFinalLevel(): boolean { return this.levelIndex >= K.LEVELS.length - 1; }

  nextLevel(): void {
    this.levelIndex++;
    if (this.levelIndex >= K.LEVELS.length) { this.state = "VICTORY"; this.cb.onStateChange("VICTORY"); return; }
    this.buildLevel(this.levelIndex);
    this.state = "PLAYING";
    this.cb.onStateChange("PLAYING");
    if (this.camMode === "fp") this.controls.lock();
  }

  private loop(): void {
    if (this.disposed) return;
    requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.elapsed += dt;

    if (this.state === "PLAYING") this.updateGame(dt);

    this.updateCamera(dt);
    this.updateFlashlight();
    this.updateLights();
    this.updateDust(dt);
    this.updatePostFx();
    this.updateHud(dt);
    if (this.state === "PLAYING" && this.radarActive) this.drawRadar();

    this.composer.render();
  }

  // ---------------- construcción del nivel ----------------
  private buildLevel(idx: number): void {
    this.levelIndex = idx;
    const cfg = K.LEVELS[idx];
    this.level = buildLevel(19, 21, cfg.seed, cfg.loopChance);
    this.maze = new Maze(this.level.grid, this.level.W, this.level.H, this.level.tunnelRow, this.level.exit);
    this.maze.exitUnlocked = false;
    this.exitUnlocked = false;

    this.disposeGroup(this.worldGroup);
    this.disposeGroup(this.actorsGroup);
    this.ceilingLights = [];

    this.buildEnvironment();
    this.buildDots();
    this.buildPellets();
    this.buildExit();
    this.buildPlayer();
    this.buildGhosts();
    this.buildDust();

    this.dotsCollected = 0;
    this.totalDots = this.level.totalDots;
    this.remainingDots = new Set();
    for (let y = 0; y < this.level.H; y++) for (let x = 0; x < this.level.W; x++) {
      if (this.level.grid[y][x] === ".") this.remainingDots.add(x + "," + y);
    }
    this.frightTimer = 0;
    this.mode = "scatter";
    this.modeTimer = 4;
    this.invuln = 0;
    this.stamina = K.STAMINA_MAX;
    this.battery = K.BATTERY_MAX;
    this.flashlightOn = true;
    this.panting = 0;
    this.pelletHold = 0;
    this.hud.msg.style.opacity = "0";
  }

  private disposeGroup(g: THREE.Group): void {
    const kids = [...g.children];
    for (const k of kids) {
      g.remove(k);
      k.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mat = m.material;
        if (Array.isArray(mat)) mat.forEach((mm) => mm.dispose());
        else if (mat) (mat as THREE.Material).dispose();
      });
    }
  }

  private mat(t: TexSet, repeat: number, extra: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
    t.map.repeat.set(repeat, repeat);
    t.bump.repeat.set(repeat, repeat);
    t.rough.repeat.set(repeat, repeat);
    return new THREE.MeshStandardMaterial({
      map: t.map, bumpMap: t.bump, bumpScale: 0.6, roughnessMap: t.rough,
      roughness: 1, metalness: 0,
      ...extra,
    });
  }

  private buildEnvironment(): void {
    const { W, H, grid } = this.level;
    const mazeW = W * K.CELL, mazeD = H * K.CELL;

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(mazeW + K.CELL * 2, mazeD + K.CELL * 2),
      this.mat(this.tex.floor, 14)
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.worldGroup.add(floor);

    const ceil = new THREE.Mesh(
      new THREE.PlaneGeometry(mazeW + K.CELL * 2, mazeD + K.CELL * 2),
      this.mat(this.tex.ceiling, 14)
    );
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = K.WALL_H;
    this.worldGroup.add(ceil);
    this.ceilingMesh = ceil;
    ceil.visible = this.camMode === "fp";

    // paredes
    const wallGeo = new THREE.BoxGeometry(K.CELL, K.WALL_H, K.CELL);
    const wallMat = this.mat(this.tex.wall, 1, { roughness: 0.9 });
    let wallCount = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (grid[y][x] === "#") wallCount++;
    const walls = new THREE.InstancedMesh(wallGeo, wallMat, wallCount);
    walls.castShadow = true; walls.receiveShadow = true;
    const m4 = new THREE.Matrix4();
    let wi = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (grid[y][x] !== "#") continue;
      const w = this.maze.cellToWorld(x, y);
      m4.makeTranslation(w.x, K.WALL_H / 2, w.z);
      walls.setMatrixAt(wi++, m4);
    }
    walls.instanceMatrix.needsUpdate = true;
    this.worldGroup.add(walls);

    // pilares en esquinas
    const pillarGeo = new THREE.BoxGeometry(K.CELL * 0.72, K.WALL_H, K.CELL * 0.72);
    const pillarMat = new THREE.MeshStandardMaterial({ color: K.COLORS.wallDark, roughness: 0.95 });
    const pillarCells: Cell[] = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (grid[y][x] !== "#") continue;
      const e = grid[y][x + 1] === "#", w = grid[y][x - 1] === "#", n = grid[y - 1]?.[x] === "#", s = grid[y + 1]?.[x] === "#";
      if ((e && s) || (e && n) || (w && s) || (w && n)) pillarCells.push([x, y]);
    }
    const pillars = new THREE.InstancedMesh(pillarGeo, pillarMat, pillarCells.length);
    pillars.castShadow = true; pillars.receiveShadow = true;
    pillarCells.forEach((c, i) => {
      const w = this.maze.cellToWorld(c[0], c[1]);
      m4.makeTranslation(w.x, K.WALL_H / 2, w.z);
      pillars.setMatrixAt(i, m4);
    });
    pillars.instanceMatrix.needsUpdate = true;
    this.worldGroup.add(pillars);

    // luces de techo + accesorios fluorescentes
    const fixGeo = new THREE.BoxGeometry(K.CELL * 0.7, 0.08, K.CELL * 0.36);
    const fixMatOn = new THREE.MeshStandardMaterial({ color: 0xfff2c8, emissive: 0xfff2c8, emissiveIntensity: 1.6 });
    const lightCells: Cell[] = [];
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      if (grid[y][x] === "#") continue;
      if ((x + y) % 3 === 0 && lightCells.length < 24) lightCells.push([x, y]);
    }
    const fixtures = new THREE.InstancedMesh(fixGeo, fixMatOn, lightCells.length);
    lightCells.forEach((c, i) => {
      const w = this.maze.cellToWorld(c[0], c[1]);
      m4.makeTranslation(w.x, K.WALL_H - 0.06, w.z);
      fixtures.setMatrixAt(i, m4);
    });
    fixtures.instanceMatrix.needsUpdate = true;
    this.worldGroup.add(fixtures);
    this.fixtureMesh = fixtures;
    fixtures.visible = this.camMode === "fp";

    lightCells.forEach((c, i) => {
      if (i % 2 !== 0) return; // la mitad de plafones emiten luz puntual (rendimiento)
      const w = this.maze.cellToWorld(c[0], c[1]);
      const light = new THREE.PointLight(0xffe6b0, 1.1, K.CELL * 3.2, 2);
      light.position.set(w.x, K.WALL_H - 0.25, w.z);
      const broken = Math.random() < 0.22;
      this.worldGroup.add(light);
      this.ceilingLights.push({ light, base: 1.1, phase: Math.random() * Math.PI * 2, speed: 6 + Math.random() * 8, broken });
    });
  }

  private buildDots(): void {
    const cells: Cell[] = [];
    for (let y = 0; y < this.level.H; y++) for (let x = 0; x < this.level.W; x++) {
      if (this.level.grid[y][x] === ".") cells.push([x, y]);
    }
    const geo = new THREE.OctahedronGeometry(0.1, 0);
    const mat = new THREE.MeshStandardMaterial({ color: K.COLORS.dot, emissive: K.COLORS.dot, emissiveIntensity: 2.2, roughness: 0.4 });
    this.dotsInst = new THREE.InstancedMesh(geo, mat, cells.length);
    const m4 = new THREE.Matrix4();
    cells.forEach((c, i) => {
      const w = this.maze.cellToWorld(c[0], c[1]);
      m4.makeTranslation(w.x, 0.18, w.z);
      this.dotsInst.setMatrixAt(i, m4);
      this.dotIndex.set(c[0] + "," + c[1], i);
    });
    this.dotsInst.instanceMatrix.needsUpdate = true;
    this.worldGroup.add(this.dotsInst);
  }

  private buildPellets(): void {
    this.pellets = [];
    for (const cell of this.level.pellets) {
      const g = makePowerBox();
      const w = this.maze.cellToWorld(cell[0], cell[1]);
      g.position.set(w.x, 0, w.z);
      this.worldGroup.add(g);
      this.pellets.push({ cell, group: g, used: false });
    }
  }

  private buildExit(): void {
    this.exitGroup = makeExitDoor(false);
    const w = this.maze.cellToWorld(this.level.exit[0], this.level.exit[1]);
    this.exitGroup.position.set(w.x, 0, w.z);
    this.worldGroup.add(this.exitGroup);
    this.exitDoor = this.exitGroup.getObjectByName("doorPanel") as THREE.Mesh;
  }

  private buildPlayer(): void {
    this.playerSpawn = this.level.player;
    const d = pickWalkableDir(this.maze, this.playerSpawn);
    this.playerMover = new Mover(this.maze, this.playerSpawn[0], this.playerSpawn[1], d.dx, d.dy, K.PLAYER_SPEED);
    this.faceDir = d;
    this.playerBody = makePlayerBody();
    this.playerBody.visible = false;
    this.actorsGroup.add(this.playerBody);
  }

  private buildGhosts(): void {
    this.ghosts = [];
    const corners: Cell[] = [
      [this.level.W - 2, 1], [1, 1],
      [this.level.W - 2, this.level.H - 2], [1, this.level.H - 2],
    ];
    const builders = [makeAcechador, makeInterceptor, makeResonador, () => makeEstatico(this.tex.staticTex)];
    for (let i = 0; i < 4; i++) {
      const build = builders[i]() as GhostBuild;
      const w = this.maze.cellToWorld(this.level.ghosts[i][0], this.level.ghosts[i][1]);
      build.group.position.set(w.x, 0, w.z);
      this.actorsGroup.add(build.group);
      const g = new Ghost(i as 0 | 1 | 2 | 3, this.maze, this.level.ghosts[i], corners[i], build, K.GHOST_SPEED);
      const gd = pickWalkableDir(this.maze, this.level.ghosts[i]);
      g.mover.dx = gd.dx; g.mover.dy = gd.dy; g.mover.moving = true;
      this.ghosts.push(g);
    }
  }

  private buildDust(): void {
    const count = 320;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const { W, H } = this.level;
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * W * K.CELL;
      pos[i * 3 + 1] = Math.random() * K.WALL_H;
      pos[i * 3 + 2] = (Math.random() - 0.5) * H * K.CELL;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const sprite = this.makeDotSprite();
    const mat = new THREE.PointsMaterial({ size: 0.05, map: sprite, transparent: true, opacity: 0.5, color: 0xffe9b0, blending: THREE.AdditiveBlending, depthWrite: false });
    this.dust = new THREE.Points(geo, mat);
    this.worldGroup.add(this.dust);
  }

  private makeDotSprite(): THREE.Texture {
    const c = document.createElement("canvas");
    c.width = c.height = 32;
    const ctx = c.getContext("2d")!;
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.4, "rgba(255,255,255,0.6)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
    return new THREE.CanvasTexture(c);
  }

  // ---------------- actualización ----------------
  private updateGame(dt: number): void {
    this.radarActive = this.keysSpace || this.keysTab;
    this.updatePlayer(dt);
    this.updateGhosts(dt);
    this.updateMode(dt);
    this.updateFright(dt);
    this.checkCollisions();
    this.checkDots();
    this.checkExit();
    this.updateBattery(dt);
    this.updateRadar(dt);
    this.updateAudio(dt);
    if (this.invuln > 0) this.invuln -= dt;
    if (this.panting > 0) this.panting -= dt;
    if (this.flashTimer > 0) this.flashTimer -= dt;
    if (this.staticTimer > 0) this.staticTimer -= dt;
    // animar la puerta de salida deslizándose hacia el techo al desbloquearse
    if (this.exitUnlocked && this.exitDoor.position.y < 1.2 + K.WALL_H) {
      this.exitDoor.position.y = Math.min(1.2 + K.WALL_H, this.exitDoor.position.y + dt * 3.5);
    }
  }

  private updatePlayer(dt: number): void {
    const m = this.playerMover;
    this.running = this.shiftHeld && this.inputDir !== null && this.panting <= 0;

    let speed = K.PLAYER_SPEED;
    if (this.running && this.stamina > 0) {
      speed = K.PLAYER_RUN_SPEED;
      this.stamina -= K.STAMINA_DRAIN * dt;
      if (this.stamina <= 0) { this.stamina = 0; this.panting = K.STAMINA_PANT_TIME; this.running = false; }
    } else {
      this.stamina = Math.min(K.STAMINA_MAX, this.stamina + K.STAMINA_RECOVER * dt);
    }
    if (this.panting > 0) speed = K.PLAYER_SPEED * 0.7;
    m.speed = this.radarActive ? speed * K.RADAR_SLOW : speed;

    this.playerPreTurn();
    const wrapped = m.advance(dt, (mv) => this.playerChoose(mv));
    if (wrapped) this.flashTimer = Math.max(this.flashTimer, 0.22);

    this.stepAcc += dt * speed * 1.7;
    if (this.stepAcc >= 1) { this.stepAcc -= 1; this.audio.playStep(); this.walkPhase += 1.6; }

    const wp = m.worldPos(this.tmpV);
    this.playerBody.position.set(wp.x, 0, wp.z);
    this.playerBody.rotation.y = Math.atan2(m.dx, m.dy);
    this.playerBody.visible = this.camMode === "iso";
    if (m.dx !== 0 || m.dy !== 0) this.faceDir = { dx: m.dx, dy: m.dy };
  }

  private playerChoose(m: Mover): Dir | null {
    const id = this.inputDir;
    const cur = { dx: m.dx, dy: m.dy };
    if (id) {
      const isRev = id.dx === -cur.dx && id.dy === -cur.dy;
      const curBlocked = !this.maze.isWalkable(m.cx + cur.dx, m.cy + cur.dy);
      if (this.maze.isWalkable(m.cx + id.dx, m.cy + id.dy) && (!isRev || curBlocked)) return id;
    }
    if (this.maze.isWalkable(m.cx + cur.dx, m.cy + cur.dy)) return cur;
    return null;
  }

  private playerPreTurn(): void {
    const m = this.playerMover;
    if (!m.moving) return;
    const id = this.inputDir;
    if (!id) return;
    if (id.dx === m.dx && id.dy === m.dy) return;
    if (id.dx === -m.dx && id.dy === -m.dy) return;
    if (m.p < 0.22 && this.maze.isWalkable(m.cx + id.dx, m.cy + id.dy)) {
      m.p = 0; m.dx = id.dx; m.dy = id.dy;
    } else if (m.p > 0.78 && this.maze.isWalkable(m.cx + m.dx + id.dx, m.cy + m.dy + id.dy)) {
      m.cx = this.maze.wrapX(m.cx + m.dx, m.cy + m.dy); m.cy += m.dy; m.p = 0; m.dx = id.dx; m.dy = id.dy;
    }
  }

  private updateGhosts(dt: number): void {
    const playerCell = this.playerMover.cell;
    const acechador = this.ghosts[0];
    for (const g of this.ghosts) {
      if (g.state === "eaten") {
        g.mover.speed = K.GHOST_EATEN_SPEED;
        g.mover.advance(dt, (mv) => this.ghostChaseDir(mv, g.spawnCell));
        this.setGhostVisual(g, "eaten");
        if (g.mover.cell[0] === g.spawnCell[0] && g.mover.cell[1] === g.spawnCell[1]) {
          g.state = this.mode;
          this.setGhostVisual(g, g.state);
        }
        this.positionGhost(g);
        continue;
      }
      if (g.state === "frightened") {
        g.mover.speed = K.GHOST_FRIGHT_SPEED;
        g.mover.advance(dt, (mv) => this.ghostFleeDir(mv, playerCell));
        this.setGhostVisual(g, "frightened");
        this.positionGhost(g);
        continue;
      }

      // Estático: congelamiento por linterna
      if (g.kind === 3) {
        const inCone = this.estaticoInFlashlight(g);
        if (inCone) {
          if (!g.frozen) this.audio.playFreeze();
          g.frozen = true;
          g.stareTime += dt;
          g.dashTimer = 0.7;
          this.staticTimer = Math.max(this.staticTimer, 0.2);
        } else {
          g.frozen = false;
          g.stareTime = 0;
        }
      }
      if (g.frozen) {
        this.setGhostVisual(g, "frozen");
        this.positionGhost(g);
        continue;
      }

      let speed = K.GHOST_SPEED;
      if (g.dashTimer > 0) { speed = K.GHOST_SPEED * 1.6; g.dashTimer -= dt; }
      if (g.kind === 0) {
        const frac = this.dotsCollected / Math.max(1, this.totalDots);
        speed = K.GHOST_SPEED * (1 + 0.03 * Math.min(10, Math.floor(frac / 0.15)));
      }
      g.mover.speed = speed;

      let target: Cell;
      const scatter = g.state === "scatter";
      if (g.kind === 0) target = scatter ? g.corner : playerCell;
      else if (g.kind === 1) target = scatter ? g.corner : this.interceptorTarget(playerCell);
      else if (g.kind === 2) target = this.resonadorTarget(playerCell, acechador.mover.cell, g.corner);
      else {
        const d = bfsDist(this.maze, g.mover.cell, playerCell);
        target = d > 8 ? playerCell : g.corner;
      }
      target = nearestWalkable(this.maze, target); // nunca apuntar a un muro
      g.mover.advance(dt, (mv) => this.ghostChaseDir(mv, target));
      this.setGhostVisual(g, g.state);
      this.positionGhost(g);
    }
  }

  private interceptorTarget(playerCell: Cell): Cell {
    const pd = this.playerMover;
    return [playerCell[0] + pd.dx * 4, playerCell[1] + pd.dy * 4];
  }

  private resonadorTarget(playerCell: Cell, acechadorCell: Cell, corner: Cell): Cell {
    if (this.running || this.radarActive) {
      const d = bfsDist(this.maze, playerCell, this.ghosts[2].mover.cell);
      if (d <= K.GHOST_HEAR_RADIUS) {
        return [2 * playerCell[0] - acechadorCell[0], 2 * playerCell[1] - acechadorCell[1]];
      }
    }
    return corner;
  }

  private ghostChaseDir(m: Mover, target: Cell): Dir | null {
    const path = astar(this.maze, m.cell, target);
    const cur = { dx: m.dx, dy: m.dy };
    const rev = { dx: -cur.dx, dy: -cur.dy };
    const opts: { d: Dir; c: Cell }[] = [];
    for (const d of [cur, { dx: -cur.dy, dy: cur.dx }, { dx: cur.dy, dy: -cur.dx }]) {
      if (d.dx === rev.dx && d.dy === rev.dy) continue;
      if (this.maze.isWalkable(m.cx + d.dx, m.cy + d.dy)) opts.push({ d, c: [m.cx + d.dx, m.cy + d.dy] });
    }
    if (opts.length === 0) {
      if (this.maze.isWalkable(m.cx + rev.dx, m.cy + rev.dy)) return rev;
      return null;
    }
    if (path && path.length >= 2) {
      const next = path[1];
      const step = { dx: next[0] - m.cx, dy: next[1] - m.cy };
      const found = opts.find((o) => o.d.dx === step.dx && o.d.dy === step.dy);
      if (found) return found.d;
    }
    opts.sort((a, b) => bfsDist(this.maze, a.c, target) - bfsDist(this.maze, b.c, target));
    return opts[0].d;
  }

  private ghostFleeDir(m: Mover, playerCell: Cell): Dir | null {
    const cur = { dx: m.dx, dy: m.dy };
    const rev = { dx: -cur.dx, dy: -cur.dy };
    const all: Dir[] = [cur, { dx: -cur.dy, dy: cur.dx }, { dx: cur.dy, dy: -cur.dx }, rev];
    const opts: { d: Dir; c: Cell }[] = [];
    for (const d of all) {
      if (this.maze.isWalkable(m.cx + d.dx, m.cy + d.dy)) opts.push({ d, c: [m.cx + d.dx, m.cy + d.dy] });
    }
    if (opts.length === 0) return null;
    opts.sort((a, b) => bfsDist(this.maze, b.c, playerCell) - bfsDist(this.maze, a.c, playerCell));
    if (Math.random() < 0.25) return opts[Math.floor(Math.random() * opts.length)].d;
    return opts[0].d;
  }

  private setGhostVisual(g: Ghost, mode: GhostState | "frozen"): void {
    if (g.lastVisual === mode) return;
    g.lastVisual = mode;
    const frightened = mode === "frightened";
    const eaten = mode === "eaten";
    const frozen = mode === "frozen";
    const baseColor = g.kind === 0 ? K.COLORS.ghostRed : g.kind === 1 ? K.COLORS.ghostPale : g.kind === 2 ? K.COLORS.ghostRing : K.COLORS.ghostStatic;
    for (const mat of g.build.materials) {
      if (mat.type === "MeshStandardMaterial") {
        const sm = mat as THREE.MeshStandardMaterial;
        if (frightened) {
          sm.emissive.set(K.COLORS.frightened); sm.emissiveIntensity = 0.9;
          sm.transparent = true; sm.opacity = 0.75; sm.color.set(0x1a1a2e);
        } else if (frozen) {
          sm.emissive.set(0xffffff); sm.emissiveIntensity = 0.7;
          sm.transparent = true; sm.opacity = 0.9; sm.color.set(K.COLORS.ghostStatic);
        } else {
          sm.emissive.set(0x000000); sm.emissiveIntensity = 0;
          sm.transparent = false; sm.opacity = 1; sm.color.set(baseColor);
        }
      } else {
        mat.transparent = true;
        mat.opacity = frightened ? 0.25 : frozen ? 0.9 : 0.5;
      }
    }
    for (const p of g.build.bodyParts) p.visible = !eaten;
    const light = g.build.group.children.find((c) => (c as THREE.PointLight).isPointLight) as THREE.PointLight | undefined;
    if (light) light.visible = !eaten;
  }

  private positionGhost(g: Ghost): void {
    const wp = g.mover.worldPos(this.tmpV);
    const y = g.kind === 2 ? Math.sin(this.elapsed * 3 + g.bobPhase) * 0.12 : 0;
    g.build.group.position.set(wp.x, y, wp.z);
    g.build.group.rotation.y = Math.atan2(g.mover.dx, g.mover.dy);
  }

  private estaticoInFlashlight(g: Ghost): boolean {
    if (!this.flashlightOn || this.battery <= 0) return false;
    const pp = this.playerMover.worldPos(this.tmpV);
    const eye = this.tmpV2.set(pp.x, K.EYE_H, pp.z);
    const gp = g.build.group.position;
    const dx = gp.x - eye.x, dy = gp.y - eye.y, dz = gp.z - eye.z;
    const d = Math.hypot(dx, dy, dz) || 1;
    if (d > K.ESTATICO_FREEZE_RANGE * K.CELL) return false;
    this.flashDir(this.tmpV);
    const dot = (this.tmpV.x * dx + this.tmpV.y * dy + this.tmpV.z * dz) / d;
    if (dot < 0.82) return false;
    return this.maze.hasLineOfSight(this.playerMover.cell[0], this.playerMover.cell[1], g.mover.cell[0], g.mover.cell[1]);
  }

  private flashDir(out: THREE.Vector3): THREE.Vector3 {
    if (this.camMode === "fp") return this.camera.getWorldDirection(out);
    return out.set(this.faceDir.dx, -0.15, this.faceDir.dy).normalize();
  }

  private updateMode(dt: number): void {
    this.modeTimer -= dt;
    if (this.modeTimer <= 0) {
      this.mode = this.mode === "scatter" ? "chase" : "scatter";
      this.modeTimer = this.mode === "scatter" ? 4 : 13;
      for (const g of this.ghosts) if (g.state !== "frightened" && g.state !== "eaten") g.state = this.mode;
    }
  }

  private updateFright(dt: number): void {
    if (this.frightTimer > 0) {
      this.frightTimer -= dt;
      if (this.frightTimer <= 0) for (const g of this.ghosts) if (g.state === "frightened") g.state = this.mode;
    }
  }

  private checkCollisions(): void {
    const pp = this.playerMover.worldPos(this.tmpV);
    for (const g of this.ghosts) {
      if (g.state === "eaten") continue;
      const gp = g.build.group.position;
      const d = Math.hypot(gp.x - pp.x, gp.z - pp.z);
      if (d > K.GHOST_TOUCH_RANGE * K.CELL) continue;
      if (g.state === "frightened") {
        g.state = "eaten";
        this.audio.playEatGhost();
        this.dotsCollected = Math.min(this.totalDots, this.dotsCollected + 5);
        this.flashTimer = 0.12;
      } else if (this.invuln <= 0) {
        this.damagePlayer();
      }
    }
  }

  private damagePlayer(): void {
    this.lives--;
    this.invuln = K.INVULN_TIME;
    this.staticTimer = 0.5;
    this.flashTimer = 0.18;
    this.audio.playDamage();
    this.showMsg("¡TE HAN ALCANZADO! Pierdes una carga", 2.2);
    if (this.lives <= 0) {
      this.state = "GAMEOVER";
      this.controls.unlock();
      this.audio.playLose();
      this.cb.onStateChange("GAMEOVER");
      return;
    }
    const pd = pickWalkableDir(this.maze, this.playerSpawn);
    this.playerMover = new Mover(this.maze, this.playerSpawn[0], this.playerSpawn[1], pd.dx, pd.dy, K.PLAYER_SPEED);
    this.faceDir = pd;
    for (const g of this.ghosts) {
      const gd = pickWalkableDir(this.maze, g.spawnCell);
      g.mover = new Mover(this.maze, g.spawnCell[0], g.spawnCell[1], gd.dx, gd.dy, K.GHOST_SPEED);
      g.state = "scatter"; g.frozen = false; g.stareTime = 0; g.dashTimer = 0; g.lastVisual = "";
      this.setGhostVisual(g, "scatter");
    }
  }

  private checkDots(): void {
    const c = this.playerMover.cell;
    const key = c[0] + "," + c[1];
    if (this.remainingDots.has(key)) {
      this.remainingDots.delete(key);
      this.dotsCollected++;
      const idx = this.dotIndex.get(key);
      if (idx !== undefined) {
        this.dotsInst.setMatrixAt(idx, new THREE.Matrix4().makeScale(0, 0, 0));
        this.dotsInst.instanceMatrix.needsUpdate = true;
      }
      this.audio.playDot();
      if (this.remainingDots.size === 0) this.unlockExit();
    }
  }

  private unlockExit(): void {
    if (this.exitUnlocked) return;
    this.exitUnlocked = true;
    this.maze.exitUnlocked = true;
    this.audio.playUnlock();
    const doorMat = this.exitDoor.material as THREE.MeshStandardMaterial;
    doorMat.color.setHex(K.COLORS.exitOpen);
    doorMat.emissive.setHex(K.COLORS.exitOpen);
    doorMat.emissiveIntensity = 1.4;
    this.showMsg("BRECHA ABIERTA — LA SALIDA VERDE YA PUEDE CRUZARSE", 4);
  }

  private checkExit(): void {
    if (!this.exitUnlocked) return;
    const c = this.playerMover.cell;
    if (c[0] === this.level.exit[0] && c[1] === this.level.exit[1]) {
      this.audio.playWin();
      this.state = "VICTORY";
      this.controls.unlock();
      this.cb.onStateChange("VICTORY");
    }
  }

  private updateBattery(dt: number): void {
    let stareDrain = 0;
    for (const g of this.ghosts) if (g.kind === 3 && g.frozen) stareDrain = K.BATTERY_STARE_DRAIN;
    if (this.flashlightOn && this.battery > 0) {
      this.battery -= (K.BATTERY_DRAIN + stareDrain) * dt;
      if (this.battery <= 0) { this.battery = 0; this.flashlightOn = false; }
    } else if (!this.flashlightOn) {
      this.battery = Math.min(K.BATTERY_MAX, this.battery + K.BATTERY_RECOVER * dt);
    }
  }

  private updateRadar(dt: number): void {
    if (this.radarActive) {
      this.radarPingTimer -= dt;
      if (this.radarPingTimer <= 0) {
        this.radarPingTimer = K.RADAR_PING_INTERVAL;
        this.radarPingAnim = 1;
        this.audio.playPing();
      }
    } else {
      this.radarPingTimer = 0;
    }
    if (this.radarPingAnim > 0) this.radarPingAnim = Math.max(0, this.radarPingAnim - dt * 1.2);
    this.hud.radarWrap.style.opacity = this.radarActive ? "1" : "0";
  }

  private updateAudio(dt: number): void {
    this.distTimer -= dt;
    if (this.distTimer <= 0) {
      this.distTimer = 0.35;
      const sources = this.ghosts.filter((g) => g.state !== "eaten").map((g) => g.mover.cell);
      this.distField = bfsField(this.maze, sources.length ? sources : [this.playerMover.cell]);
    }
    const pc = this.playerMover.cell;
    const d = this.distField[pc[1]]?.[pc[0]] ?? Infinity;
    let tension = Math.max(0, Math.min(1, 1 - d / 16));
    let los = false;
    for (const g of this.ghosts) {
      if (g.state === "eaten") continue;
      if (this.maze.hasLineOfSight(pc[0], pc[1], g.mover.cell[0], g.mover.cell[1])) { los = true; break; }
    }
    if (los) tension = Math.min(1, tension + 0.35);
    if (this.frightTimer > 0) tension = Math.max(0, tension - 0.3);
    this.tensionSmooth += (tension - this.tensionSmooth) * Math.min(1, dt * 4);
    this.audio.setTension(this.tensionSmooth);

    const pp = this.playerMover.worldPos(this.tmpV);
    const listener = this.tmpV2.set(pp.x, K.EYE_H, pp.z);
    this.audio.update(dt, this.ghosts.map((g) => ({
      pos: g.build.group.position,
      frightened: g.state === "frightened",
      eaten: g.state === "eaten",
      frozen: g.frozen,
    })), listener);
  }

  // ---------------- cámara / linterna / luces ----------------
  private updateCamera(dt: number): void {
    if (!this.playerMover) return;
    const pp = this.playerMover.worldPos(this.tmpV);
    if (this.camMode === "fp") {
      this.headBob += dt * (this.running ? 11 : 7) * (this.playerMover.moving ? 1 : 0);
      const bob = Math.sin(this.headBob) * 0.05;
      // No tocamos la rotación: PointerLockControls gestiona el quaternion
      this.camera.position.set(pp.x, K.EYE_H + bob, pp.z);
    } else {
      // Isométrica cerrada: detrás y algo arriba del jugador, mirando hacia delante
      const f = this.tmpV2.set(this.faceDir.dx, 0, this.faceDir.dy).normalize();
      this.camera.position.set(pp.x - f.x * 3.0, K.EYE_H + 0.9, pp.z - f.z * 3.0);
      this.camera.lookAt(pp.x + f.x * 2.5, K.EYE_H - 0.4, pp.z + f.z * 2.5);
    }
  }

  private updateFlashlight(): void {
    if (!this.playerMover) return;
    const pp = this.playerMover.worldPos(this.tmpV);
    const eye = this.tmpV2.set(pp.x, K.EYE_H, pp.z);
    this.flashlight.position.copy(eye);
    this.flashDir(this.tmpV);
    this.flashTarget.position.set(eye.x + this.tmpV.x * 20, eye.y + this.tmpV.y * 20, eye.z + this.tmpV.z * 20);
    let inten = 2.6 * (this.battery / K.BATTERY_MAX);
    if (this.radarActive) inten *= 0.55;
    if (!this.flashlightOn || this.battery <= 0) inten = 0;
    this.flashlight.intensity = inten;
    this.hud.batteryFill.style.width = this.battery + "%";
    this.hud.batteryFill.style.background = this.battery < 25 ? "#ff3b30" : this.battery < 55 ? "#ffbf40" : "#7dffb0";
    if (this.battery <= 0) this.flashlightOn = false;
  }

  private updateLights(): void {
    if (!this.fixtureMesh) return;
    const mat = this.fixtureMesh.material as THREE.MeshStandardMaterial;
    let maxRatio = 0;
    for (const cl of this.ceilingLights) {
      let inten = cl.base;
      if (cl.broken) {
        const flick = Math.sin(this.elapsed * cl.speed + cl.phase);
        if (flick > 0.85 || Math.random() < 0.02) inten = cl.base * (Math.random() < 0.5 ? 0.05 : 0.4);
        else inten = cl.base * (0.75 + 0.25 * flick);
      } else {
        inten = cl.base * (0.9 + 0.1 * Math.sin(this.elapsed * cl.speed + cl.phase));
      }
      if (this.frightTimer > 0) inten = cl.base * 2.2;
      cl.light.intensity = inten;
      maxRatio = Math.max(maxRatio, inten / cl.base);
    }
    mat.emissiveIntensity = this.frightTimer > 0 ? 3.0 : 0.9 + maxRatio * 0.7;
  }

  private updateDust(dt: number): void {
    if (!this.dust) return;
    const pos = this.dust.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      pos.array[i * 3 + 1] += dt * 0.12;
      if (pos.array[i * 3 + 1] > K.WALL_H) pos.array[i * 3 + 1] = 0;
    }
    pos.needsUpdate = true;
    this.dust.rotation.y += dt * 0.01;
  }

  private updatePostFx(): void {
    let amount = 0.25 + this.tensionSmooth * 0.5;
    if (this.staticTimer > 0) amount += 0.9;
    if (this.invuln > 0) amount += 0.5 * (this.invuln / K.INVULN_TIME);
    if (this.flashTimer > 0) amount += 1.5;
    const u = this.vhsPass.uniforms as unknown as { amount: { value: number }; time: { value: number } };
    u.amount.value = amount;
    u.time.value = this.elapsed;
    const v = Math.max(0, 1 - this.battery / 25) * 0.5 + (this.invuln > 0 ? 0.35 : 0);
    this.hud.vignette.style.opacity = String(Math.min(0.85, v));
    this.hud.flash.style.opacity = this.flashTimer > 0 ? String(Math.min(1, this.flashTimer * 6)) : "0";
  }

  // ---------------- HUD ----------------
  private setHudVisible(v: boolean): void {
    this.hud.root.style.opacity = v ? "1" : "0";
    this.hud.root.style.pointerEvents = "none";
  }

  private showMsg(text: string, dur = 3): void {
    this.hud.msg.textContent = text;
    this.hud.msg.style.opacity = "1";
    this.msgTimer = dur;
  }

  private updateHud(dt: number): void {
    if (this.state !== "PLAYING" && this.state !== "PAUSED") return;
    this.hud.dots.textContent = `NODOS ${String(Math.max(0, this.totalDots - this.dotsCollected)).padStart(3, "0")} / ${this.totalDots}`;
    this.hud.lives.textContent = "VIDAS " + "●".repeat(Math.max(0, this.lives)) + "○".repeat(Math.max(0, K.PLAYER_LIVES - this.lives));
    this.hud.level.textContent = `NIVEL ${this.levelIndex + 1} // ${this.camMode === "fp" ? "1ª PERSONA" : "ISOMÉTRICO"}`;
    this.hud.staminaFill.style.width = this.stamina + "%";
    this.hud.staminaFill.style.opacity = this.running ? "1" : "0.55";

    const near = this.nearPellet();
    if (near && this.state === "PLAYING") {
      this.updatePelletHold(dt, near);
    } else {
      this.pelletHold = 0;
      if (this.msgTimer > 0) {
        this.msgTimer -= dt;
        if (this.msgTimer <= 0) this.hud.msg.style.opacity = "0";
      }
    }

    if (this.frightTimer > 0) {
      this.hud.fright.style.opacity = "1";
      this.hud.frightFill.style.width = (this.frightTimer / K.FRIGHT_TIME * 100) + "%";
    } else {
      this.hud.fright.style.opacity = "0";
    }
  }

  private updatePelletHold(dt: number, near: { cell: Cell; group: THREE.Group; used: boolean }): void {
    if (this.keysE) {
      this.pelletHold += dt;
      this.hud.msg.textContent = `SOBRECARGA ELÉCTRICA... ${Math.round(this.pelletHold / K.POWER_HOLD_TIME * 100)}%`;
      this.hud.msg.style.opacity = "1";
      this.msgTimer = 1;
      if (this.pelletHold >= K.POWER_HOLD_TIME) {
        this.activatePellet(near);
        this.pelletHold = 0;
      }
    } else {
      this.hud.msg.textContent = "MANTÉN [E] PARA SOBRECARGAR EL DISYUNTOR";
      this.hud.msg.style.opacity = "0.85";
    }
  }

  private nearPellet(): { cell: Cell; group: THREE.Group; used: boolean } | null {
    const pc = this.playerMover.cell;
    for (const p of this.pellets) {
      if (p.used) continue;
      if (Math.abs(p.cell[0] - pc[0]) + Math.abs(p.cell[1] - pc[1]) <= K.INTERACT_RANGE) return p;
    }
    return null;
  }

  private activatePellet(p: { cell: Cell; group: THREE.Group; used: boolean }): void {
    p.used = true;
    this.frightTimer = K.FRIGHT_TIME;
    for (const g of this.ghosts) {
      if (g.state !== "eaten") {
        g.mover.dx = -g.mover.dx; g.mover.dy = -g.mover.dy;
        g.state = "frightened";
        g.lastVisual = "";
      }
    }
    p.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.material) {
        const mat = m.material as THREE.MeshStandardMaterial;
        if (mat.emissive) { mat.emissive.setHex(0x442200); mat.emissiveIntensity = 0.2; }
      }
    });
    this.audio.playPower();
    this.showMsg("¡SOBRECARGA! LAS ENTIDADES SON VULNERABLES 10s", 3);
    this.flashTimer = 0.15;
  }

  private drawRadar(): void {
    const data: RadarData = {
      W: this.level.W, H: this.level.H, grid: this.level.grid,
      playerCell: this.playerMover.cell,
      playerDir: [this.playerMover.dx, this.playerMover.dy],
      ghosts: this.ghosts.map((g) => ({ x: g.mover.cell[0], y: g.mover.cell[1], frightened: g.state === "frightened", eaten: g.state === "eaten" })),
      remaining: this.remainingDots,
      ping: this.radarPingAnim,
      time: this.elapsed,
    };
    this.radar.draw(data);
  }

  dispose(): void {
    this.audio.dispose();
    this.renderer.dispose();
    this.composer.dispose();
  }
}

// ---------------- Shader VHS / CRT ----------------
const VHSShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    amount: { value: 0.5 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform float amount;
    varying vec2 vUv;
    float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 uv = vUv;
      float shift = (rand(vec2(floor(uv.y * 240.0), floor(time * 8.0))) - 0.5) * 0.006 * amount;
      uv.x += shift;
      float a = 0.0035 * amount;
      vec4 col;
      col.r = texture2D(tDiffuse, uv + vec2(a, 0.0)).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - vec2(a, 0.0)).b;
      col.a = 1.0;
      float n = rand(uv * vec2(1024.0, 768.0) + time * 60.0);
      col.rgb += (n - 0.5) * (0.10 * amount);
      float scan = sin(uv.y * 900.0) * 0.05;
      col.rgb -= scan * amount;
      float vig = smoothstep(0.95, 0.25, distance(uv, vec2(0.5)));
      col.rgb *= 0.45 + 0.55 * vig;
      col.rgb *= 0.94 + 0.06 * sin(time * 28.0);
      float band = smoothstep(0.98, 1.0, sin(uv.y * 3.0 + time * 1.5));
      col.rgb += band * 0.12 * amount;
      gl_FragColor = col;
    }
  `,
};

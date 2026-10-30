// UMBRAL: orquestador del juego. Une la simulacion (src/sim) con el render (three.js),
// la entrada, el audio, los sustos y la interfaz.

import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import type { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";

import { HorrorAudio } from "../audio/engine";
import type { AudioFrame, GameAudio } from "../audio/types";
import { CAMPAIGN, type LevelDef } from "../config/campaign";
import * as K from "../config/constants";
import { DIFFICULTIES, type DifficultyId } from "../config/difficulty";
import { THEMES, type ThemeTextures, type ThemeVisual } from "../gfx/themes";
import { disposeTexSet } from "../gfx/texkit";
import type { FaceKind } from "../gfx/faces";
import type { SimEvent } from "../sim/events";
import { rayDistance } from "../sim/collision";
import { BITE_COOLDOWN, Simulation } from "../sim/simulation";
import "./lightFix";
import { ScareDirector } from "./director";
import { EyesView } from "./eyesView";
import { disposeFaceCache, GhostView } from "./ghostView";
import { Input } from "./input";
import { LevelView } from "./levelView";
import { sharedUniforms } from "./materials";
import { PacManBody, PovJaws } from "./pacman";
import { ParticlePool } from "./particles";
import { applyFx, defaultFx, makeFinalPass, makeSanitizePass, type FxState } from "./postfx";
import { FruitView } from "./props";
import { Radar } from "./radar";
import { CameraRig } from "./rig";
import { ScareSystem } from "./scare";
import { preloadScreamImages } from "./screamImages";
import {
  clamp, DEFAULT_PROGRESS, DEFAULT_SETTINGS, saveProgress, saveSettings,
  type Progress, type Quality, type Settings,
} from "./settings";
import type { GameCallbacks, HudApi, HudState, Phase, RunSummary } from "./types";

export interface GameInit {
  container: HTMLElement;
  radarCanvas: HTMLCanvasElement;
  scareCanvas: HTMLCanvasElement;
  hud: HudApi;
  callbacks: GameCallbacks;
  settings?: Settings;
  progress?: Progress;
  audio?: GameAudio;
  /** No arranca el bucle de requestAnimationFrame (pruebas y capturas). */
  manual?: boolean;
}

interface RunState {
  diff: DifficultyId;
  levelIndex: number;
  score: number;
  lives: number;
  levelStartScore: number;
  levelStartLives: number;
  totalTime: number;
  ghostsEaten: number;
  deaths: number;
}

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

export class Game {
  readonly container: HTMLElement;
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly rig: CameraRig;
  readonly input: Input;
  readonly particles = new ParticlePool(480);
  private smoke = new ParticlePool(220, false);
  readonly fx: FxState = defaultFx();

  audio: GameAudio;
  settings: Settings;
  progress: Progress;
  phase: Phase = "menu";
  sim: Simulation | null = null;
  view: LevelView | null = null;
  run: RunState | null = null;
  theme: ThemeVisual = THEMES.offices;

  private hud: HudApi;
  private cb: GameCallbacks;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private finalPass: ShaderPass;
  private jaws: PovJaws;
  private pacman: PacManBody;
  private radar: Radar;
  private scare: ScareSystem;
  private fruit = new FruitView();
  private ghostViews: GhostView[] = [];
  private apparitions = new Map<number, GhostView>();
  private director: ScareDirector | null = null;
  private texCache = new Map<string, ThemeTextures>();

  private hemi = new THREE.HemisphereLight(0x887755, 0x221810, 0.9);
  private ambient = new THREE.AmbientLight(0x332a18, 0.5);
  private headlamp = new THREE.SpotLight(0xfff0c0, 60, 34, 0.5, 0.75, 2);
  private headTarget = new THREE.Object3D();
  private headDist = 6;
  private perf = { t: 0, sum: 0, n: 0, checks: 0 };
  private sizeW = 0;
  private sizeH = 0;
  private sizeDpr = 1;
  private glow = new THREE.PointLight(0xffd23a, 2.2, 5, 2);
  private ghostLights: THREE.PointLight[] = [];
  private eyes = new EyesView();
  private pelletLight = new THREE.PointLight(0xffa22e, 0, 9, 2);

  private raf = 0;
  private last = 0;
  private time = 0;
  private disposed = false;
  private manual: boolean;
  private resizeObs: ResizeObserver;
  private onWindowResize = () => this.onResize();
  private onContextLost = (e: Event) => { e.preventDefault(); this.contextLost = true; if (this.phase === "playing") this.pause(); };
  private onContextRestored = () => { this.contextLost = false; this.onResize(); this.hud.message("Se recupero la tarjeta grafica.", 3, "warn"); };
  private contextLost = false;
  private onVisibility = () => { if (document.hidden && this.phase === "playing") this.pause(); };

  // estado de juego
  private tension = 0;
  private tensionTarget = 0;
  private tensionTimer = 0;
  private distField: Int16Array | null = null;
  private heartAcc = 0;
  private heartPulse = 0;
  private hitStop = 0;
  private outroT = -1;
  private dyingGhost = -1;
  private yawVel = 0;
  private pitchVel = 0;
  private lightsMul = 1;
  private dotStreak = 0;
  private dotStreakT = 0;
  private lowBatteryT = 0;
  private lockHintT = 0;
  private lockErrorShownAt = -10;
  private lastWrapT = -10;
  private levelTime = 0;
  private attractX = 0;
  private dustTimer = 0;

  constructor(init: GameInit) {
    this.container = init.container;
    this.hud = init.hud;
    this.cb = init.callbacks;
    this.settings = init.settings ?? { ...DEFAULT_SETTINGS };
    this.progress = init.progress ?? { ...DEFAULT_PROGRESS };
    this.audio = init.audio ?? new HorrorAudio();
    this.manual = !!init.manual;
    this.audio.onStatus = (m) => this.hud.message(m, 2.4, "warn");

    const w = Math.max(2, this.container.clientWidth), h = Math.max(2, this.container.clientHeight);
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance", alpha: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.tabIndex = 0;
    this.renderer.domElement.style.outline = "none";
    this.container.appendChild(this.renderer.domElement);

    this.rig = new CameraRig(w / h);
    this.scene.add(this.rig.camera);
    this.scene.add(this.hemi, this.ambient);
    this.headlamp.castShadow = true;
    this.headlamp.shadow.bias = -0.0005;
    this.headlamp.shadow.normalBias = 0.02;
    this.headlamp.target = this.headTarget;
    this.scene.add(this.headlamp, this.headTarget, this.glow, this.pelletLight);
    for (let i = 0; i < 2; i++) {
      const l = new THREE.PointLight(0xff3020, 0, 8, 2);
      this.ghostLights.push(l);
      this.scene.add(l);
    }
    this.scene.add(this.particles.points);
    this.scene.add(this.smoke.points);
    this.scene.add(this.fruit.group);
    this.scene.add(this.eyes.group);

    this.pacman = new PacManBody();
    this.pacman.group.visible = false;
    this.scene.add(this.pacman.group);
    this.jaws = new PovJaws(w / h);

    // post-proceso
    const target = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, target);
    this.composer.addPass(new RenderPass(this.scene, this.rig.camera));
    this.composer.addPass(makeSanitizePass());
    const jawPass = new RenderPass(this.jaws.scene, this.jaws.camera);
    jawPass.clear = false;
    jawPass.clearDepth = true;
    this.composer.addPass(jawPass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.5, 0.6, 0.8);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.finalPass = makeFinalPass();
    this.composer.addPass(this.finalPass);

    this.radar = new Radar(init.radarCanvas);
    this.scare = new ScareSystem({
      rig: this.rig, audio: this.audio, canvas: init.scareCanvas, fx: this.fx,
      flashHud: (c, o, s) => this.hud.flash(c, o, s),
    });

    this.input = new Input(this.renderer.domElement, {
      onPause: () => this.togglePause(),
      onToggleLight: () => this.toggleLight(),
      onToggleCamera: () => this.toggleCamera(),
      onToggleMute: () => this.toggleMute(),
      onBite: () => this.bite(),
      onInteract: () => { if (this.phase === "playing") this.interactReq = true; },
      onLockLost: () => { if (this.phase === "playing" && this.input.needsLock) this.pause(); },
      onLockError: () => this.onLockError(),
    });
    this.input.attach();

    this.resizeObs = new ResizeObserver(() => this.onResize());
    this.resizeObs.observe(this.container);
    window.addEventListener("resize", this.onWindowResize);
    this.renderer.domElement.addEventListener("webglcontextlost", this.onContextLost);
    this.renderer.domElement.addEventListener("webglcontextrestored", this.onContextRestored);
    document.addEventListener("visibilitychange", this.onVisibility);

    this.applySettings(this.settings, false);
    this.hud.setVisible(false);

    if (!this.manual) {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.frame);
    }
    if (typeof window !== "undefined" && (new URLSearchParams(window.location.search).has("debug"))) {
      (window as unknown as { __umbral: Game }).__umbral = this;
    }
  }

  // =====================================================================================
  // API publica
  // =====================================================================================

  /** Prepara el fondo del menu (nivel 0 sin partida). */
  async boot(): Promise<void> {
    await this.loadLevel(0, "normal", null);
    this.setPhase("menu");
  }

  /** Comienza una partida nueva en el nivel indicado. */
  async startRun(diff: DifficultyId, levelIndex = 0): Promise<void> {
    this.audio.resume();
    const d = DIFFICULTIES[diff];
    this.run = {
      diff, levelIndex, score: 0, lives: d.lives, levelStartScore: 0, levelStartLives: d.lives,
      totalTime: 0, ghostsEaten: 0, deaths: 0,
    };
    await this.loadLevel(levelIndex, diff, this.run);
    this.setPhase("briefing");
  }

  /** Desde la ficha del nivel: entra al laberinto (gesto del usuario). */
  enterLevel(): void {
    if (this.phase !== "briefing" || !this.sim) return;
    this.audio.resume();
    this.input.clear();
    this.input.capture = true;
    this.input.mode = this.settings.controlMode;
    this.rig.override = null;
    this.rig.pitch = 0;
    this.hud.setVisible(true);
    this.setPhase("playing");
    this.input.requestLock();
    this.lockHintT = 0;
    this.hud.message(`${this.level.subtitle}: devora todos los nodos`, 4);
  }

  pause(): void {
    if (this.phase !== "playing") return;
    this.setPhase("paused");
    this.input.capture = false;
    this.input.releaseLock();
    this.audio.suspend();
  }

  resume(): void {
    if (this.phase !== "paused") return;
    this.audio.resume();
    this.input.clear();
    this.input.capture = true;
    this.input.mode = this.settings.controlMode;
    this.setPhase("playing");
    this.input.requestLock();
  }

  togglePause(): void {
    if (this.phase === "playing") this.pause();
    else if (this.phase === "paused") this.resume();
  }

  /** Reinicia el nivel actual conservando la dificultad (puntuacion del inicio del nivel). */
  async restartLevel(): Promise<void> {
    if (!this.run) return;
    const d = DIFFICULTIES[this.run.diff];
    this.run.score = this.run.levelStartScore;
    this.run.lives = Math.max(this.run.levelStartLives, d.lives);
    await this.loadLevel(this.run.levelIndex, this.run.diff, this.run);
    this.setPhase("briefing");
  }

  async nextLevel(): Promise<void> {
    if (!this.run || !this.sim) return;
    this.run.score = this.sim.score;
    this.run.lives = this.sim.lives;
    const next = this.run.levelIndex + 1;
    if (next >= CAMPAIGN.length) { this.setPhase("victory"); return; }
    this.run.levelIndex = next;
    this.run.levelStartScore = this.run.score;
    this.run.levelStartLives = this.run.lives;
    await this.loadLevel(next, this.run.diff, this.run);
    this.setPhase("briefing");
  }

  async quitToMenu(): Promise<void> {
    this.input.capture = false;
    this.input.releaseLock();
    this.scare.endDeath();
    this.hud.setVisible(false);
    this.run = null;
    this.audio.resume();
    await this.loadLevel(0, "normal", null);
    this.setPhase("menu");
  }

  /** Salta directamente a un nivel (selector de niveles). */
  async startAt(diff: DifficultyId, levelIndex: number): Promise<void> { await this.startRun(diff, levelIndex); }

  get level(): LevelDef { return CAMPAIGN[this.sim?.level.id ?? 0]; }
  get isFinalLevel(): boolean { return (this.run?.levelIndex ?? 0) >= CAMPAIGN.length - 1; }

  summary(): RunSummary {
    const sim = this.sim;
    const run = this.run;
    const score = sim ? sim.score : 0;
    return {
      difficulty: run?.diff ?? "normal",
      levelIndex: run?.levelIndex ?? 0,
      levelName: this.level.name,
      score,
      highScore: this.progress.highScore,
      newHighScore: score > 0 && score >= this.progress.highScore,
      lives: sim?.lives ?? 0,
      timeSeconds: sim?.time ?? 0,
      ghostsEaten: sim?.stats.ghostsEaten ?? 0,
      deaths: sim?.stats.deaths ?? 0,
      dotsEaten: sim?.dotsEaten ?? 0,
      totalDots: sim?.totalDots ?? 0,
      isFinalLevel: this.isFinalLevel,
      caughtBy: sim?.caughtBy?.kind ?? null,
    };
  }

  applySettings(s: Settings, persist = true): void {
    this.settings = s;
    this.rig.baseFov = s.fov;
    this.rig.headBob = s.headBob;
    this.input.mode = s.controlMode;
    if (s.controlMode === "keyboard") this.input.releaseLock();
    this.audio.setVolume(s.volume);
    this.audio.setMuted(s.muted);
    this.scare.level = s.scares;
    const q = s.quality;
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    this.sizeDpr = dpr;
    const pr = Math.min(dpr, q === "high" ? 1.75 : q === "medium" ? 1.25 : 1);
    this.renderer.setPixelRatio(pr);
    this.composer.setPixelRatio(pr);
    this.renderer.shadowMap.enabled = q !== "low";
    this.headlamp.castShadow = q !== "low";
    this.headlamp.shadow.mapSize.set(q === "high" ? 1024 : 512, q === "high" ? 1024 : 512);
    this.headlamp.shadow.map?.dispose();
    this.headlamp.shadow.map = null;
    this.bloom.enabled = q !== "low";
    this.onResize();
    if (persist) { saveSettings(s); this.cb.onSettings(s); }
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObs.disconnect();
    document.removeEventListener("visibilitychange", this.onVisibility);
    window.removeEventListener("resize", this.onWindowResize);
    this.renderer.domElement.removeEventListener("webglcontextlost", this.onContextLost);
    this.renderer.domElement.removeEventListener("webglcontextrestored", this.onContextRestored);
    this.input.detach();
    this.audio.dispose();
    this.scare.dispose();
    this.clearLevel();
    this.pacman.dispose();
    this.jaws.dispose();
    this.fruit.dispose();
    this.eyes.dispose();
    this.particles.dispose();
    this.smoke.dispose();
    for (const t of this.texCache.values()) { disposeTexSet(t.wall); disposeTexSet(t.floor); disposeTexSet(t.ceiling); }
    this.texCache.clear();
    disposeFaceCache();
    this.composer.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) this.container.removeChild(this.renderer.domElement);
  }

  // =====================================================================================
  // Nivel
  // =====================================================================================

  private getTextures(theme: ThemeVisual): ThemeTextures {
    let t = this.texCache.get(theme.id);
    if (!t) {
      t = theme.textures();
      this.texCache.set(theme.id, t);
      // conserva como maximo 2 temas en memoria
      if (this.texCache.size > 2) {
        const oldest = this.texCache.keys().next().value as string;
        const o = this.texCache.get(oldest)!;
        disposeTexSet(o.wall); disposeTexSet(o.floor); disposeTexSet(o.ceiling);
        this.texCache.delete(oldest);
      }
    }
    return t;
  }

  private clearLevel(): void {
    if (this.view) { this.scene.remove(this.view.group); this.view.dispose(); this.view = null; }
    for (const g of this.ghostViews) { this.scene.remove(g.group); g.dispose(); }
    this.ghostViews = [];
    for (const g of this.apparitions.values()) { this.scene.remove(g.group); g.dispose(); }
    this.apparitions.clear();
    this.director?.dispose();
    this.director = null;
    this.fruit.hide();
  }

  private async loadLevel(index: number, diff: DifficultyId, run: RunState | null): Promise<void> {
    this.setPhase("loading");
    await nextFrame();
    if (this.disposed) return;
    this.clearLevel();
    const level = CAMPAIGN[index];
    const difficulty = DIFFICULTIES[diff];
    this.sim = new Simulation({ level, difficulty, score: run?.score ?? 0, lives: run?.lives ?? difficulty.lives });
    const theme = THEMES[level.theme];
    this.theme = theme;
    await nextFrame();
    if (this.disposed) return;
    const tex = this.getTextures(theme);
    await nextFrame();
    if (this.disposed) return;
    preloadScreamImages();
    this.view = new LevelView(this.sim, theme, tex, this.settings.quality);
    this.scene.add(this.view.group);
    for (const g of this.sim.ghosts) {
      const gv = new GhostView(g.kind as FaceKind);
      this.scene.add(gv.group);
      this.ghostViews.push(gv);
    }
    for (let k = 0; k < 4; k++) {
      const av = new GhostView(k as FaceKind);
      av.group.visible = false;
      this.scene.add(av.group);
      this.apparitions.set(k, av);
    }
    const game = this;
    this.director = new ScareDirector({
      get sim() { return game.sim!; },
      rig: this.rig,
      audio: this.audio,
      scare: this.scare,
      settings: () => this.settings,
      tension: () => this.tension,
      ambientScale: () => (this.run ? DIFFICULTIES[this.run.diff].ambientScares : 1) * (this.settings.scares === "off" ? 0.7 : 1),
      apparition: (kind) => this.apparitions.get(kind)!,
      setLightsMul: (v) => { this.lightsMul = v; },
      hudMessage: (t) => this.hud.message(t, 2, "warn"),
      darkness: () => this.darkness,
      eyes: this.eyes,
    });
    this.applyTheme(theme);
    this.audio.setTheme(level.theme);
    this.resetRuntime();
    await nextFrame();
  }

  private applyTheme(t: ThemeVisual): void {
    this.scene.fog = new THREE.FogExp2(t.fogColor, t.fogDensity);
    this.scene.background = new THREE.Color(t.fogColor);
    this.hemi.color.setHex(t.hemiSky); this.hemi.groundColor.setHex(t.hemiGround); this.hemi.intensity = t.hemiIntensity;
    this.ambient.color.setHex(t.ambient); this.ambient.intensity = t.ambientIntensity;
    this.headlamp.color.setHex(t.headlamp);
    this.renderer.toneMappingExposure = t.exposure;
    this.bloom.strength = t.bloom.strength;
    this.bloom.radius = t.bloom.radius;
    this.bloom.threshold = t.bloom.threshold;
    this.fx.tint = [...t.grade.tint];
    this.fx.saturation = t.grade.saturation;
    this.fx.contrast = t.grade.contrast;
  }

  private resetRuntime(): void {
    const sim = this.sim!;
    this.tension = 0; this.tensionTarget = 0; this.distField = null;
    this.hitStop = 0; this.outroT = -1; this.dyingGhost = -1;
    this.lightsMul = 1; this.dotStreak = 0; this.levelTime = 0;
    this.rig.pitch = 0;
    this.rig.override = null;
    this.rig.trauma = 0;
    this.fx.blackout = 0; this.fx.staticNoise = 0; this.fx.flash = 0; this.fx.glitch = 0;
    this.rig.mode = "fp";
    this.pacman.group.visible = false;
    this.director?.reset(28);
    this.attractX = sim.maze.cellToWorld(2, sim.maze.tunnelRow).x;
  }

  // =====================================================================================
  // Entrada: acciones
  // =====================================================================================

  private toggleLight(): void {
    if (this.phase !== "playing" || !this.sim || this.sim.hidden) return;
    const p = this.sim.player;
    const before = p.flashlightOn;
    p.toggleFlashlight();
    if (p.flashlightOn !== before) this.audio.playFlashlight(p.flashlightOn);
    else if (p.batteryLocked) this.hud.message("Batería agotada: recargando", 1.5, "warn");
  }

  private toggleCamera(): void {
    if (this.phase !== "playing") return;
    if (this.sim?.hidden) {
      this.hud.message("Dentro del escondite no puedes cambiar de cámara", 1.8, "info");
      return;
    }
    this.rig.mode = this.rig.mode === "fp" ? "tp" : "fp";
    this.audio.playUiClick();
  }

  private toggleMute(): void {
    this.settings = { ...this.settings, muted: !this.settings.muted };
    this.audio.setMuted(this.settings.muted);
    saveSettings(this.settings);
    this.cb.onSettings(this.settings);
  }

  private biteReq = false;
  private interactReq = false;
  private freezeHintShown = false;
  /** Cuan dentro de una zona oscura esta el jugador (0..1, suavizado). */
  private darkness = 0;
  private bite(): void {
    if (this.phase !== "playing" || this.sim?.hidden) return;
    this.jaws.chomp(0.62);
    this.pacman.chomp(0.95);
    this.audio.playBite();
    this.biteReq = true; // la simulacion decide si alcanza a alguien
  }

  private onLockError(): void {
    // Si el entorno (p. ej. iframe sin permisos) rechaza el pointer lock, no se bloquea al jugador:
    // el raton sigue funcionando en modo relativo. Solo se avisa de forma no intrusiva tras fallos repetidos.
    if (this.input.failedLocks < 2 || this.time - this.lockErrorShownAt < 6) return;
    this.lockErrorShownAt = this.time;
    this.hud.message("Control con ratón activo en ventana. También puedes usar Q o flechas para girar.", 4, "info");
  }

  // =====================================================================================
  // Bucle
  // =====================================================================================

  private frame = (now: number): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const raw = Math.max(0, (now - this.last) / 1000);
    const real = Math.min(0.1, raw);
    this.last = now;
    this.watchPerformance(raw);
    this.checkSize();
    this.advance(real);
  };

  /**
   * Si el equipo no sostiene ~26 fps durante unos segundos de partida, baja la calidad un escalon
   * (alta, media, baja) y lo avisa. Se evalua poco despues de entrar al nivel y un maximo de tres veces.
   */
  private watchPerformance(rawDt: number): void {
    if (this.phase !== "playing") { this.perf.t = 0; this.perf.sum = 0; this.perf.n = 0; return; }
    if (this.perf.checks >= 3 || rawDt > 0.6) return; // los parones (cambio de pestana, carga) no cuentan
    this.perf.t += rawDt;
    if (this.perf.t < 2) return; // calentamiento: compilacion de shaders y subida de texturas
    this.perf.sum += rawDt; this.perf.n++;
    if (this.perf.sum < 4) return;
    const avg = this.perf.sum / this.perf.n;
    this.perf.sum = 0; this.perf.n = 0; this.perf.t = 0;
    if (avg <= 1 / 26) { this.perf.checks = 3; return; } // fluido: no se vuelve a evaluar
    this.perf.checks++;
    const order: Quality[] = ["high", "medium", "low"];
    const next = order[order.indexOf(this.settings.quality) + 1];
    if (!next) { this.perf.checks = 3; return; }
    this.applySettings({ ...this.settings, quality: next });
    this.hud.message(`Rendimiento bajo (${Math.round(1 / avg)} fps): calidad reducida a ${next === "medium" ? "MEDIA" : "BAJA"}.`, 4, "warn");
  }

  /** Avanza la simulacion y renderiza un frame. Tambien lo usan las pruebas. */
  advance(realDt: number, renderFrame = true): void {
    let dt = Math.min(realDt, 0.05);
    if (this.hitStop > 0) { this.hitStop -= dt; dt *= 0.05; }
    this.time += dt;
    sharedUniforms.uTime.value = this.time;
    const sim = this.sim;
    if (!sim || !this.view) { if (renderFrame) this.render(dt); return; }

    this.fx.glitch *= Math.exp(-dt * 6);
    this.fx.aberration *= Math.exp(-dt * 4);
    this.fx.staticNoise *= Math.exp(-dt * 5);
    this.fx.flash = Math.max(0, this.fx.flash - dt * 3.2);
    if (this.phase !== "dying" && this.phase !== "levelclear") this.fx.blackout = Math.max(0, this.fx.blackout - dt * 2);

    switch (this.phase) {
      case "playing": this.updatePlaying(dt); break;
      case "dying": this.updateDying(dt); break;
      case "levelclear": case "victory": this.updateOutro(dt); break;
      case "paused": break;
      default: this.updateIdle(dt); break;
    }
    const wdt = this.phase === "paused" ? 0 : dt;
    this.updateViews(wdt);
    this.updateCameraAndLights(wdt);
    this.updateFx();
    this.updateHud();
    if (renderFrame) this.render(wdt);
  }

  private updateIdle(dt: number): void {
    // fondo del menu / ficha de nivel: camara que avanza lentamente por el tunel central
    const sim = this.sim!;
    this.attractX += dt * 0.55;
    const lim = sim.maze.tunnelLimit - 2;
    if (this.attractX > lim) this.attractX = -lim;
    const z = sim.maze.cellToWorld(0, sim.maze.tunnelRow).z;
    const pos = new THREE.Vector3(this.attractX, K.EYE_H + Math.sin(this.time * 0.9) * 0.015, z + Math.sin(this.time * 0.31) * 0.25);
    const tgt = new THREE.Vector3(this.attractX + 6, K.EYE_H + 0.05 + Math.sin(this.time * 0.4) * 0.05, z + Math.sin(this.time * 0.2) * 0.5);
    this.rig.override = { pos, target: tgt, fov: this.rig.vfov(this.settings.fov), roll: Math.sin(this.time * 0.5) * 0.01 };
    this.view!.update({ time: this.time, dt, playerX: pos.x, playerZ: pos.z, lightsMul: 1, powered: false, exitUnlocked: false, zoneLit: sim.zoneLit.map(() => 5), ghosts: [], hiddenIndex: -1 });
    if (this.phase === "menu" || this.phase === "briefing" || this.phase === "loading") this.audio.update(this.audioFrame(0));
  }

  // -------------------------------------------------------------------------------------
  // Jugando
  // -------------------------------------------------------------------------------------

  private updatePlaying(dt: number): void {
    const sim = this.sim!;
    const p = sim.player;
    const axes = this.input.axes();
    const look = this.input.consumeLook();
    const sens = 0.0021 * this.settings.sensitivity;
    const yaw0 = p.yaw, pitch0 = this.rig.pitch;
    if (!Number.isFinite(p.yaw)) p.yaw = 0;
    if (!Number.isFinite(this.rig.pitch)) this.rig.pitch = 0;
    p.yaw -= (Number.isFinite(look.dx) ? look.dx : 0) * sens;
    p.yaw += axes.turn * 2.3 * dt;
    this.rig.pitch -= (Number.isFinite(look.dy) ? look.dy : 0) * sens * (this.settings.invertY ? -1 : 1);
    this.rig.pitch += axes.lookV * 1.5 * dt;
    this.rig.pitch = clamp(this.rig.pitch, -1.25, 1.25);
    this.yawVel += ((p.yaw - yaw0) / Math.max(dt, 1e-3) - this.yawVel) * Math.min(1, dt * 12);
    this.pitchVel += ((this.rig.pitch - pitch0) / Math.max(dt, 1e-3) - this.pitchVel) * Math.min(1, dt * 12);

    const ih = sim.interactHint;
    const interactHint = ih === "hide" ? "E: esconderte" : ih === "switch" ? "E: encender la luz (hace ruido)" : ih === "leave" ? "E: salir del escondite" : null;
    if (this.input.needsLock && !this.input.locked) {
      this.lockHintT += dt;
      if (interactHint) this.hud.showHint(interactHint);
      else if (this.input.failedLocks === 0 && this.lockHintT > 0.4 && this.lockHintT < 5.0) this.hud.showHint("Clic para capturar el ratón · Q o flechas para girar");
    } else {
      this.hud.showHint(interactHint);
    }

    if (sim.hidden) {
      // asomado por las ranuras: la mirada queda limitada al hueco
      const base = Math.atan2(sim.hidden.wall[0], sim.hidden.wall[1]);
      let rel = p.yaw - base;
      rel = Math.atan2(Math.sin(rel), Math.cos(rel));
      p.yaw = base + clamp(rel, -0.95, 0.95);
      this.rig.pitch = clamp(this.rig.pitch, -0.45, 0.45);
    }
    sim.update(dt, { forward: axes.forward, strafe: axes.strafe, sprint: this.input.sprint, sonar: this.input.sonar, bite: this.biteReq, interact: this.interactReq, lookBack: this.input.lookBack });
    this.biteReq = false; this.interactReq = false;
    this.levelTime += dt;
    if (this.run) this.run.totalTime += dt;

    // motas de polvo flotando en el haz de la linterna
    if (p.lightOn && this.rig.mode === "fp" && !sim.hidden) {
      this.dustTimer += dt;
      if (this.dustTimer > 0.055) {
        this.dustTimer = 0;
        const fwd = this.rig.forward;
        const len = Math.hypot(fwd.z, fwd.x) || 1;
        const rx = fwd.z / len, rz = -fwd.x / len;
        const dist = 1.2 + Math.random() * 3.5;
        const spreadX = (Math.random() - 0.5) * 0.8 * (dist / 3);
        const spreadY = (Math.random() - 0.5) * 0.6 * (dist / 3);
        const px = this.rig.position.x + fwd.x * dist + rx * spreadX;
        const py = clamp(this.rig.position.y + fwd.y * dist + spreadY, 0.15, 2.65);
        const pz = this.rig.position.z + fwd.z * dist + rz * spreadX;
        const vx = (Math.random() - 0.5) * 0.05 + fwd.x * 0.03;
        const vy = (Math.random() - 0.5) * 0.04 + 0.015;
        const vz = (Math.random() - 0.5) * 0.05 + fwd.z * 0.03;
        this.particles.emit(px, py, pz, vx, vy, vz, 2.8 + Math.random() * 2.0, 0.035 + Math.random() * 0.035, 0xffebcc, 0, 0.96);
      }
    }

    this.handleEvents(sim.drainEvents());
    this.director?.update(dt);
    this.updateSonar(dt);
    this.updateTension(dt);
    this.updateHeartbeat(dt);

    if (this.dotStreakT > 0) { this.dotStreakT -= dt; if (this.dotStreakT <= 0) this.dotStreak = 0; }

    // bateria baja: parpadeo de la linterna y aviso
    if (p.lightOn && p.battery < 22) {
      this.lowBatteryT += dt;
      if (this.lowBatteryT > 8) { this.lowBatteryT = 0; this.hud.message("Batería baja", 1.6, "warn"); }
    }

    if (sim.state === "caught") this.beginDeath();
    else if (sim.state === "complete") this.beginOutro();
  }

  private updateSonar(dt: number): void {
    const sim = this.sim!;
    this.hud.setSonarVisible(sim.player.sonarOpen);
    if (sim.player.sonarOpen) {
      this.sonarT -= dt;
      if (this.sonarT <= 0) { this.sonarT = K.SONAR_PING_INTERVAL; this.radar.ping(); this.audio.playPing(); }
      this.radar.draw(sim, this.time, dt);
    } else this.sonarT = 0;
  }
  private sonarT = 0;

  private updateTension(dt: number): void {
    const sim = this.sim!;
    this.tensionTimer -= dt;
    if (this.tensionTimer <= 0) {
      this.tensionTimer = 0.25;
      // un fantasma que se mueve en silencio no sube la tension hasta que esta casi encima (~4 celdas)
      const sources = sim.ghosts
        .filter((g) => (g.lethal || g.startled) && (!g.silent || Math.hypot(g.x - sim.player.x, g.z - sim.player.z) < 4 * K.CELL))
        .map((g) => g.cell);
      const pc = sim.maze.worldToCell(sim.player.x, sim.player.z);
      let t = 0;
      if (sources.length) {
        this.distField = sim.maze.distanceField(sources, this.distField ?? undefined);
        const d = this.distField[pc[1] * sim.maze.W + pc[0]];
        t = clamp(1 - d / 15, 0, 1);
        // linea de vision directa aumenta la tension
        for (const g of sim.ghosts) {
          if (!g.lethal || (g.silent && Math.hypot(g.x - sim.player.x, g.z - sim.player.z) > 4 * K.CELL)) continue;
          if (Math.hypot(g.x - sim.player.x, g.z - sim.player.z) < 18 && sim.maze.rayClear(sim.player.x, sim.player.z, g.x, g.z)) { t = Math.min(1, t + 0.3); break; }
        }
      }
      if (sim.powered) t *= 0.35;
      this.tensionTarget = t;
    }
    this.tension += (this.tensionTarget - this.tension) * Math.min(1, dt * (this.tensionTarget > this.tension ? 3 : 1.2));
  }

  private updateHeartbeat(dt: number): void {
    const t = this.tension;
    const ex = 1 - this.sim!.player.stamina / K.STAMINA_MAX;
    const level = Math.max(t, ex * 0.55);
    if (level > 0.22) {
      this.heartAcc += dt * (1.0 + level * 2.1);
      if (this.heartAcc >= 1) {
        this.heartAcc -= 1;
        this.audio.playHeartbeat(level);
        this.heartPulse = 1;
      }
    }
    this.heartPulse = Math.max(0, this.heartPulse - dt * 4);
  }

  // -------------------------------------------------------------------------------------
  // Eventos de la simulacion
  // -------------------------------------------------------------------------------------

  private handleEvents(events: SimEvent[]): void {
    const sim = this.sim!;
    const view = this.view!;
    for (const e of events) {
      switch (e.type) {
        case "dot": {
          const [cx, cy] = sim.maze.worldToCell(e.x, e.z);
          view.eatDot(cy * sim.maze.W + cx);
          this.dotStreak++; this.dotStreakT = 0.9;
          this.audio.playDot(this.dotStreak);
          this.jaws.chomp(0.2); this.pacman.chomp(0.5);
          this.particles.burst(e.x, 0.45, e.z, 4, 1.1, 0.5, 0.05, 0xffd24a, 0.2);
          break;
        }
        case "pellet": {
          sim.pellets.forEach((p, i) => { if (p.eaten) view.eatPellet(i); });
          this.audio.playPellet();
          this.particles.burst(e.x, 0.8, e.z, 36, 3.2, 0.9, 0.09, 0xffb02e, 1.2);
          this.rig.addTrauma(0.35);
          this.rig.fovPunch = 10;
          this.fx.flash = 0.35; this.fx.flashColor = [1, 0.85, 0.4];
          this.hud.flash("#ffb02e", 0.25, 0.4);
          this.hud.message("¡PODER! Devóralos", 2.5, "good");
          break;
        }
        case "powerEnd":
          this.hud.message("El poder se agota", 1.6, "warn");
          this.audio.playPowerEnd();
          break;
        case "ghostEaten": {
          this.audio.playGhostEaten(e.combo);
          this.hitStop = 0.1;
          this.rig.addTrauma(0.45);
          this.fx.glitch = Math.max(this.fx.glitch, 0.7);
          this.particles.burst(e.x, 1.1, e.z, 40, 3.5, 0.8, 0.1, 0x7a8cff, 0.6);
          const sp = this.project(e.x, 1.4, e.z);
          this.hud.popup(`+${e.points}`, e.combo > 1 ? "combo" : "points", sp?.x, sp?.y);
          if (this.run) this.run.ghostsEaten++;
          break;
        }
        case "fruitSpawn":
          this.fruit.show(e.x, e.z);
          this.audio.playFruitSpawn();
          this.hud.message(`Ha aparecido: ${this.level.fruitName}`, 2.2, "info");
          break;
        case "fruitExpire": this.fruit.hide(); break;
        case "fruitEaten": {
          this.fruit.hide();
          this.audio.playFruit();
          this.particles.burst(e.x, 0.9, e.z, 30, 2.6, 0.9, 0.08, 0xff4a4a, 1);
          const sp = this.project(e.x, 1.2, e.z);
          this.hud.popup(`+${e.points}`, "bonus", sp?.x, sp?.y);
          this.hud.message("Energía recuperada", 1.8, "good");
          break;
        }
        case "ghostWake":
          this.audio.playWake(e.ghost, e.startled);
          if (e.startled) { this.rig.addTrauma(0.3); this.fx.glitch = Math.max(this.fx.glitch, 0.5); }
          break;
        case "ghostStartle":
          this.audio.playStartle(e.ghost);
          this.rig.addTrauma(0.12);
          break;
        case "waveChange": this.audio.playWaveChange(e.mode === "chase"); break;
        case "caught": break; // se gestiona al terminar el update
        case "exitUnlocked":
          this.audio.playExitUnlocked();
          this.hud.message("SALIDA ABIERTA. Corre.", 4, "good");
          this.fx.flash = 0.3; this.fx.flashColor = [0.4, 1, 0.55];
          this.rig.addTrauma(0.3);
          break;
        case "levelComplete": break;
        case "extraLife":
          this.audio.playExtraLife();
          this.hud.message("¡Vida extra!", 2.4, "good");
          break;
        case "wrap": if (e.who === "player") { this.lastWrapT = this.time; this.audio.playWrap(); } break;
        case "step": this.audio.playStep(e.running); break;
        case "exhausted": this.audio.playExhausted(); this.hud.message("Sin aliento", 1.8, "warn"); break;
        case "recovered": this.audio.playRecovered(); break;
        case "batteryDead": this.audio.playBatteryDead(); this.hud.message("Sin batería: la luz se apaga", 2.4, "warn"); break;
        case "frozen":
          this.audio.playFreeze(e.frozen);
          if (e.frozen && !this.freezeHintShown) {
            this.freezeHintShown = true;
            this.hud.message("El Estático no se mueve mientras lo miras con luz. Si apartas la vista, se lanza.", 5, "info");
          }
          break;
        case "battery":
          this.audio.playPickup();
          this.particles.burst(e.x, 0.7, e.z, 18, 1.6, 0.7, 0.06, 0x7dff6a, 0.5);
          this.hud.message("Pila: la linterna se recarga", 1.8, "good");
          break;
        case "switch":
          this.audio.playSwitch();
          this.rig.addTrauma(0.2);
          this.hud.message(e.alerted > 0 ? "La luz vuelve... y algo te oyó" : "La luz vuelve unos segundos", 2.4, e.alerted > 0 ? "warn" : "info");
          break;
        case "hide":
          this.audio.playHide(e.inside);
          if (e.inside) this.hud.message(e.seen ? "Te vieron entrar. No respires" : "Contén la respiración", 2.6, e.seen ? "warn" : "info");
          break;
        case "bite":
          if (e.stunned > 0) {
            this.audio.playFreeze(true);
            this.rig.addTrauma(0.3); this.hitStop = 0.08;
            this.fx.glitch = Math.max(this.fx.glitch, 0.6);
            this.hud.message("Los dientes lo aturden", 1.6, "good");
          } else if (e.eaten === 0) this.hud.message("Muerdes el aire", 1.2, "warn");
          break;
      }
    }
  }

  private project(x: number, y: number, z: number): { x: number; y: number } | null {
    const v = new THREE.Vector3(x, y, z).project(this.rig.camera);
    if (v.z > 1 || v.z < -1) return null;
    return { x: (v.x + 1) / 2, y: (1 - v.y) / 2 };
  }

  // -------------------------------------------------------------------------------------
  // Muerte y fin de nivel
  // -------------------------------------------------------------------------------------

  private beginDeath(): void {
    const sim = this.sim!;
    const g = sim.caughtBy!;
    this.director?.cancel();
    this.lightsMul = 1;
    this.setPhase("dying");
    this.input.capture = false;
    this.hud.showHint(null);
    this.hud.setSonarVisible(false);
    this.audio.playHeartbeat(1);
    const idx = sim.ghosts.indexOf(g);
    this.dyingGhost = idx;
    const eye = new THREE.Vector3(sim.player.x, K.EYE_H, sim.player.z);
    const gv = this.ghostViews[idx];
    this.rig.mode = "fp";
    this.scare.startDeath(g.kind as FaceKind, gv, eye, this.rig.forward.clone());
  }

  private updateDying(dt: number): void {
    const done = this.scare.updateDeath(dt);
    if (!done) return;
    const sim = this.sim!;
    const gameOver = sim.loseLife();
    this.fx.blackout = 0; this.fx.staticNoise = 0;
    if (gameOver) {
      this.saveHigh();
      this.audio.playGameOver();
      this.hud.setVisible(false);
      this.setPhase("gameover");
    } else {
      this.respawnView();
      this.director?.reset(22);
      this.input.clear();
      this.input.capture = true;
      this.setPhase("playing");
      this.input.requestLock();
      this.hud.message(`Te quedan ${sim.lives} ${sim.lives === 1 ? "vida" : "vidas"}`, 2.4, "warn");
      this.rig.pitch = 0;
    }
  }

  private respawnView(): void {
    for (const gv of this.ghostViews) { gv.group.scale.setScalar(1); }
    this.fruit.hide();
    this.dyingGhost = -1;
  }

  private beginOutro(): void {
    this.director?.cancel();
    this.lightsMul = 1;
    this.outroT = 0;
    this.input.capture = false;
    this.hud.setSonarVisible(false);
    this.audio.playLevelComplete();
    this.hud.message("¡LO LOGRASTE!", 3, "good");
    this.saveLevelProgress();
    this.setPhase(this.isFinalLevel ? "victory" : "levelclear");
  }

  private updateOutro(dt: number): void {
    if (this.outroT < 0) return;
    this.outroT += dt;
    // la camara sigue avanzando un instante hacia la luz; luego fundido a blanco verdoso
    const k = Math.min(1, this.outroT / 2.2);
    this.fx.flashColor = [0.75, 1, 0.8];
    this.fx.flash = Math.max(this.fx.flash, k * k * 0.9);
    this.sim!.player.vx *= 0.9;
  }

  private saveHigh(): void {
    const sim = this.sim;
    if (!sim) return;
    if (sim.score > this.progress.highScore) {
      this.progress = { ...this.progress, highScore: sim.score };
      saveProgress(this.progress);
    }
  }

  private saveLevelProgress(): void {
    const sim = this.sim, run = this.run;
    if (!sim || !run) return;
    const p = { ...this.progress };
    p.highScore = Math.max(p.highScore, sim.score);
    p.unlocked = Math.max(p.unlocked, Math.min(CAMPAIGN.length - 1, run.levelIndex + 1));
    const key = String(run.levelIndex);
    p.bestScoreByLevel = { ...p.bestScoreByLevel, [key]: Math.max(p.bestScoreByLevel[key] ?? 0, sim.score) };
    if (run.levelIndex >= CAMPAIGN.length - 1) p.completedRuns += 1;
    this.progress = p;
    saveProgress(p);
  }

  // =====================================================================================
  // Vistas, camara y luces
  // =====================================================================================

  private updateViews(dt: number): void {
    const sim = this.sim!, view = this.view!;
    const p = sim.player;
    const frightLow = sim.frightTimer > 0 && sim.frightTimer < 2.2;

    view.update({
      time: this.time, dt, playerX: p.x, playerZ: p.z,
      lightsMul: this.lightsMul, powered: sim.powered, exitUnlocked: sim.exitUnlocked,
      zoneLit: sim.zoneLit,
      ghosts: sim.ghosts.filter((g) => g.lethal).map((g) => ({ x: g.x, z: g.z })),
      hiddenIndex: sim.hidden ? sim.hideSpots.indexOf(sim.hidden) : -1,
    });

    // fantasmas
    const order: { v: GhostView; d: number; silent: boolean }[] = [];
    sim.ghosts.forEach((g, i) => {
      const gv = this.ghostViews[i];
      if (i === this.dyingGhost && this.phase === "dying") return;
      gv.update(dt, this.time, g, p.x, p.z, frightLow);
      const d = Math.hypot(g.x - p.x, g.z - p.z);
      order.push({ v: gv, d, silent: g.silent && d > 4 });
    });
    order.sort((a, b) => a.d - b.d);
    for (let i = 0; i < this.ghostLights.length; i++) {
      const l = this.ghostLights[i];
      const o = order[i];
      if (!o || o.silent || o.v.lightIntensity <= 0) { l.intensity = 0; continue; }
      l.color.copy(o.v.glowColor);
      l.position.set(o.v.group.position.x, 1.5, o.v.group.position.z);
      l.intensity = o.v.lightIntensity;
    }

    // luz de pellet: la mas cercana sin comer
    let best = -1, bd = Infinity;
    view.pellets.forEach((pl, i) => { if (!pl.eaten) { const d = Math.hypot(pl.x - p.x, pl.z - p.z); if (d < bd) { bd = d; best = i; } } });
    if (best >= 0) {
      const pl = view.pellets[best];
      this.pelletLight.position.set(pl.x, 0.9, pl.z);
      this.pelletLight.intensity = 7 + Math.sin(this.time * 4.2) * 2;
    } else this.pelletLight.intensity = 0;

    // aparicion del director
    const fk = this.director?.fake;
    if (fk) fk.view.update(dt, this.time, fk.g, p.x, p.z, false);

    // zonas apagadas: menos luz ambiente, mas niebla
    const dTarget = this.phase === "playing" || this.phase === "dying" ? sim.darknessAt(p.x, p.z) : 0;
    this.darkness += (dTarget - this.darkness) * Math.min(1, dt * 1.8);
    const th = this.theme;
    if (th) {
      this.hemi.intensity = th.hemiIntensity * (1 - 0.82 * this.darkness);
      this.ambient.intensity = th.ambientIntensity * (1 - 0.8 * this.darkness);
      const fog = this.scene.fog as THREE.FogExp2 | null;
      if (fog) fog.density = th.fogDensity * (1 + 0.8 * this.darkness);
    }

    // fruta
    this.fruit.update(dt, p.x, p.z, sim.fruit.timer);

    this.particles.update(dt);
    this.updateSteam(dt);

    // pellets comidos (sincroniza)
    sim.pellets.forEach((pl, i) => { if (pl.eaten && !view.pellets[i].eaten) view.eatPellet(i); });
  }

  private updateSteam(dt: number): void {
    const view = this.view, sim = this.sim;
    this.smoke.update(dt);
    if (!view || !sim || dt <= 0) return;
    const p = sim.player;
    for (const v of view.vents) {
      if (Math.hypot(v.x - p.x, v.z - p.z) > 16) continue;
      if (Math.random() < dt * 7) {
        this.smoke.emit(v.x + (Math.random() - 0.5) * 0.2, 0.4, v.z + (Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.5, 0.7 + Math.random() * 0.6, (Math.random() - 0.5) * 0.5, 2.6, 0.9, 0xb4aca4, -0.05, 0.7);
      }
    }
  }

  private updateCameraAndLights(dt: number): void {
    const sim = this.sim!;
    const p = sim.player;
    const exertion = clamp(1 - p.stamina / K.STAMINA_MAX, 0, 1) * (p.running || p.exhausted ? 1 : 0.5);
    this.rig.forceFp = !!sim.hidden;
    if (this.phase === "playing" || this.phase === "paused" || this.phase === "levelclear") {
      this.rig.update(dt, p, sim.maze, { exertion, tension: this.tension, frozen: false });
    } else {
      this.rig.update(dt, p, sim.maze, { exertion: 0, tension: this.tension, frozen: false });
    }
    const cam = this.rig.camera;

    // Pac-Man 3a persona / mandibulas 1a persona
    // dentro del escondite siempre se ve en primera persona: la camara en tercera quedaria dentro del mueble
    const tp = this.rig.mode === "tp" && this.phase !== "menu" && this.phase !== "briefing" && !this.rig.override && !sim.hidden;
    this.pacman.group.visible = tp;
    if (tp) {
      this.pacman.group.position.set(p.x, 0, p.z);
      this.pacman.group.rotation.y = p.yaw + Math.PI;
      this.pacman.update(dt, {
        moving: p.moving, speed: p.speed, running: p.running, powered: sim.powered,
        fear: this.tension, time: this.time, exhausted: p.exhausted,
      });
    }
    const showJaws = !tp && !sim.hidden && (this.phase === "playing" || this.phase === "paused" || this.phase === "levelclear");
    this.jaws.scene.visible = showJaws;
    if (showJaws) {
      this.jaws.update(dt, {
        time: this.time, speed: p.speed, running: p.running, exhausted: p.exhausted, powered: sim.powered,
        yawVel: this.yawVel, pitchVel: this.pitchVel, bobY: (cam.position.y - K.EYE_H), fear: this.tension, glow: this.fx.flash * 0.5,
      });
    }

    // linterna (headlamp) y brillo propio de Pac-Man
    const head = this.headlamp;
    const forward = this.rig.forward;
    const origin = tp ? new THREE.Vector3(p.x, K.EYE_H, p.z) : cam.position;
    head.position.copy(origin);
    this.headTarget.position.copy(origin).addScaledVector(tp ? new THREE.Vector3(-Math.sin(p.viewYaw) * Math.cos(this.rig.pitch), Math.sin(this.rig.pitch), -Math.cos(p.viewYaw) * Math.cos(this.rig.pitch)) : forward, 10);
    let inten = 34 * clamp(p.battery / 30, 0.0, 1) * (0.6 + 0.4 * clamp(p.battery / 100, 0, 1));
    if (p.lightOn && p.battery < 22) {
      if (Math.sin(this.time * 31) + Math.sin(this.time * 17) > 1.2 - (22 - p.battery) * 0.04) inten *= 0.15;
    }
    if (p.sonarOpen) inten *= 0.5;
    // un fantasma cerca interfiere con la linterna: titila mas cuanto mas cerca
    let nearest = 99;
    for (const g of sim.ghosts) {
      if (!g.lethal) continue;
      const d = Math.hypot(g.x - p.x, g.z - p.z);
      // en silencio la linterna solo delata al fantasma cuando ya esta casi encima
      nearest = Math.min(nearest, g.silent && d > 3.5 ? 99 : d);
    }
    if (nearest < 8) {
      const k = (8 - nearest) / 8;
      if (Math.sin(this.time * 47) + Math.sin(this.time * 23 + 1.3) > 1.7 - k * 1.7) inten *= 0.08;
    }
    // autoexposicion: la ley del inverso del cuadrado quema las paredes cercanas, asi que
    // se atenua el haz segun la distancia al muro que tiene delante
    // varios rayos a lo ancho del haz y segun la mirada (no el cuerpo): una pared lateral
    // pegada a la camara tambien entra en el cono y es la que se quema
    let wallD = 6;
    for (const off of [-0.5, -0.25, 0, 0.25, 0.5]) {
      const a = p.viewYaw + off;
      wallD = Math.min(wallD, rayDistance(sim.maze, p.x, p.z, -Math.sin(a), -Math.cos(a), 6));
    }
    this.headDist += (wallD - this.headDist) * Math.min(1, dt * 8);
    inten *= clamp(Math.pow(this.headDist / 4.5, 1.5), 0.18, 1);
    head.intensity = p.lightOn && this.phase !== "dying" ? inten : 0;
    this.glow.position.set(origin.x, K.EYE_H + 0.1, origin.z);
    this.glow.intensity = sim.powered ? 10 + Math.sin(this.time * 12) * 3 : 1.8;
    this.glow.color.setHex(sim.powered ? 0xffe05a : 0xffd23a);
    this.glow.distance = sim.powered ? 9 : 4.5;
  }

  private updateFx(): void {
    const sim = this.sim!;
    const p = sim.player;
    const fx = this.fx;
    fx.time = this.time;
    const t = this.tension;
    fx.pulse = t > 0.2 ? this.heartPulse * t : 0;
    const dd = this.scare.deathDark;
    fx.vignette = clamp((22 - p.battery) / 22, 0, 1) * 0.5 + (p.invuln > 0 ? 0.25 : 0) + this.darkness * 0.22 + (sim.hidden ? 0.4 : 0) + dd;
    fx.desaturate = Math.max(t * 0.28 + (p.exhausted ? 0.18 : 0), dd);
    fx.brightness = this.settings.brightness;
    fx.grain = 0.05 + t * 0.07;
    if (this.phase !== "dying" && this.phase !== "levelclear") fx.glitch = Math.max(fx.glitch, t * 0.06);
    fx.aberration = Math.max(fx.aberration, t * 0.25 + (this.time - this.lastWrapT < 0.25 ? 0.6 : 0));
  }

  private updateHud(): void {
    const sim = this.sim!;
    const p = sim.player;
    const s: HudState = {
      score: sim.score,
      highScore: Math.max(this.progress.highScore, sim.score),
      lives: sim.lives,
      maxLives: Math.max(sim.lives, this.run ? DIFFICULTIES[this.run.diff].lives : sim.lives),
      dotsLeft: sim.remainingDots,
      totalDots: sim.totalDots,
      levelLabel: `${this.level.subtitle} · ${this.level.name}`,
      stamina: p.stamina / K.STAMINA_MAX,
      battery: p.battery / K.BATTERY_MAX,
      bite: 1 - sim.biteCd / BITE_COOLDOWN,
      exhausted: p.exhausted,
      lightOn: p.lightOn,
      powerFrac: sim.powered ? sim.frightTimer / Math.max(0.01, sim.frightTotal) : 0,
      powerLow: sim.powered && sim.frightTimer < 2.2,
      camera: this.rig.mode,
      hidden: !!sim.hidden,
      crosshair: this.rig.mode === "fp" && !sim.hidden,
      sonar: p.sonarOpen,
      exitOpen: sim.exitUnlocked,
      fruitName: sim.fruit.active ? this.level.fruitName : null,
      muted: this.settings.muted,
    };
    this.hud.update(s);
  }

  private audioFrame(dt: number): AudioFrame {
    const sim = this.sim!;
    const p = sim.player;
    const cam = this.rig;
    const nearGhost = !!sim.hidden && sim.ghosts.some((g) => g.lethal && Math.hypot(g.x - p.x, g.z - p.z) < 5.5);
    return {
      dt,
      listener: { x: cam.position.x, y: cam.position.y, z: cam.position.z, fx: cam.forward.x, fy: cam.forward.y, fz: cam.forward.z },
      tension: this.tension,
      exertion: clamp(1 - p.stamina / K.STAMINA_MAX, 0, 1),
      exhausted: p.exhausted,
      moving: p.moving,
      running: p.running,
      powered: sim.powered,
      powerLow: sim.powered && sim.frightTimer < 2.2,
      progress: sim.dotsEaten / Math.max(1, sim.totalDots),
      chasing: sim.ghosts.some((g) => g.mode === "chase"),
      sonar: p.sonarOpen,
      theme: sim.level.theme,
      darkness: this.darkness,
      hidden: !!sim.hidden,
      hiddenNearGhost: nearGhost,
      dead: this.phase === "dying",
      dread: (this.settings.scares === "full" ? 1 : this.settings.scares === "reduced" ? 0.6 : 0.35) * (this.run ? DIFFICULTIES[this.run.diff].ambientScares : 1),
      ghosts: sim.ghosts.map((g) => ({
        kind: g.kind, x: g.x, y: 1.4, z: g.z, mode: g.mode, frozen: g.frozen, startled: g.startled, silent: g.silent,
        dist: Math.hypot(g.x - p.x, g.z - p.z),
      })),
    };
  }

  private render(dt: number): void {
    if (this.contextLost) return;
    const sim = this.sim;
    if (sim && (this.phase === "playing" || this.phase === "dying" || this.phase === "levelclear" || this.phase === "victory")) {
      this.audio.update(this.audioFrame(dt));
    }
    this.scare.updateFlash(dt);
    const size = this.renderer.getSize(new THREE.Vector2());
    this.particles.setScale(size.y * this.renderer.getPixelRatio(), this.rig.camera.fov);
    this.smoke.setScale(size.y * this.renderer.getPixelRatio(), this.rig.camera.fov);
    applyFx(this.finalPass, this.fx, size.x * this.renderer.getPixelRatio(), size.y * this.renderer.getPixelRatio());
    this.composer.render(dt);
  }

  private onResize(): void {
    const w = Math.max(2, this.container.clientWidth), h = Math.max(2, this.container.clientHeight);
    this.sizeW = w; this.sizeH = h;
    // el lienzo se estira por CSS al 100 % del contenedor: aunque se pierda un evento de tamano nunca queda recortado
    this.renderer.setSize(w, h, false);
    const cs = this.renderer.domElement.style;
    cs.width = "100%"; cs.height = "100%";
    this.composer.setSize(w, h);
    this.rig.setAspect(w / h);
    this.jaws.setAspect(w / h);
  }

  /** Red de seguridad: ResizeObserver puede no avisar en iframes o al cambiar de monitor. */
  private checkSize(): void {
    const w = Math.max(2, this.container.clientWidth), h = Math.max(2, this.container.clientHeight);
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    if (w !== this.sizeW || h !== this.sizeH || dpr !== this.sizeDpr) {
      if (dpr !== this.sizeDpr) { this.sizeDpr = dpr; this.applySettings(this.settings, false); }
      else this.onResize();
    }
  }

  private setPhase(p: Phase): void {
    if (this.phase === p) return;
    this.phase = p;
    this.audio.setMenuBed?.(p === "menu" || p === "briefing" || p === "loading");
    this.renderer.domElement.style.cursor = p === "playing" ? "crosshair" : "default";
    this.cb.onPhase(p);
  }

  // =====================================================================================
  // Depuracion (solo con ?debug)
  // =====================================================================================

  debugTeleport(cx: number, cy: number, yawDeg = 0): void {
    const sim = this.sim!;
    const w = sim.maze.cellToWorld(cx, cy);
    sim.player.x = w.x; sim.player.z = w.z; sim.player.yaw = (yawDeg * Math.PI) / 180;
    sim.player.vx = 0; sim.player.vz = 0;
  }

  debugForcePhase(p: Phase): void { this.phase = p; this.cb.onPhase(p); }
}

// Jugador (Pac-Man): movimiento continuo en el plano XZ con aceleracion, friccion y
// colision con deslizamiento. La orientacion (yaw) la fija el motor desde el raton/teclado.

import * as K from "../config/constants";
import { moveAndSlide, type AABB } from "./collision";
import type { SimEvent } from "./events";
import type { Cell, Maze } from "./maze";

export interface PlayerInput {
  forward: number; // -1 (atras) .. 1 (adelante)
  strafe: number; // -1 (izquierda) .. 1 (derecha)
  sprint: boolean;
  sonar: boolean;
}

export const NO_INPUT: PlayerInput = { forward: 0, strafe: 0, sprint: false, sonar: false };

export interface PlayerTuning {
  staminaDrain: number;
  batteryDrain: number;
  stareDrain: boolean;
}

const STEP_LEN = 1.55;

export class PlayerSim {
  x = 0;
  z = 0;
  yaw = 0; // 0 mira hacia -Z; positivo gira a la izquierda
  vx = 0;
  vz = 0;
  speed = 0;
  moving = false;
  running = false;
  exhausted = false;
  sonarOpen = false;
  stamina = K.STAMINA_MAX;
  battery = K.BATTERY_MAX;
  flashlightOn = true;
  batteryLocked = false; // tras vaciarse hay que recargar un poco antes de volver a encender
  noise = 0; // 0..1, lo oyen algunos fantasmas
  heading: Cell = [0, -1];
  invuln = 0;

  private stepAcc = 0;
  private moveHeading: Cell = [0, -1];

  reset(x: number, z: number, yaw: number): void {
    this.x = x; this.z = z; this.yaw = yaw;
    this.vx = 0; this.vz = 0; this.speed = 0;
    this.moving = false; this.running = false; this.exhausted = false; this.sonarOpen = false;
    this.stamina = K.STAMINA_MAX;
    this.noise = 0;
    this.stepAcc = 0;
    this.invuln = 0;
  }

  /** Vector unitario hacia delante en el plano XZ. */
  forwardVec(): [number, number] { return [-Math.sin(this.yaw), -Math.cos(this.yaw)]; }
  rightVec(): [number, number] { return [Math.cos(this.yaw), -Math.sin(this.yaw)]; }

  toggleFlashlight(): void {
    if (this.flashlightOn) this.flashlightOn = false;
    else if (!this.batteryLocked && this.battery > 0) this.flashlightOn = true;
  }

  get lightOn(): boolean { return this.flashlightOn && this.battery > 0; }

  update(
    dt: number,
    input: PlayerInput,
    maze: Maze,
    colliders: readonly AABB[],
    tune: PlayerTuning,
    events: SimEvent[],
  ): void {
    this.sonarOpen = input.sonar;
    const [fx, fz] = this.forwardVec();
    const [rx, rz] = this.rightVec();
    let wx = fx * input.forward + rx * input.strafe;
    let wz = fz * input.forward + rz * input.strafe;
    const wl = Math.hypot(wx, wz);
    const intent = Math.min(1, wl);
    if (wl > 1e-4) { wx /= wl; wz /= wl; }

    // sprint: solo hacia delante, con aire y sin el sonar abierto
    const wantsRun = input.sprint && input.forward > 0.2 && !this.sonarOpen && intent > 0.1;
    const wasExhausted = this.exhausted;
    if (this.exhausted && this.stamina >= K.STAMINA_RESUME_AT) this.exhausted = false;
    this.running = wantsRun && !this.exhausted && this.stamina > 0;

    let max = this.running ? K.PLAYER_RUN : K.PLAYER_WALK;
    if (this.exhausted) max = K.PLAYER_WALK * 0.78;
    if (this.sonarOpen) max *= K.SONAR_SLOW;
    // atras y de lado son algo mas lentos
    if (input.forward < 0) max *= 0.72;
    else if (Math.abs(input.strafe) > 0.5 && input.forward <= 0.2) max *= 0.88;

    const tx = wx * max * intent, tz = wz * max * intent;
    const dvx = tx - this.vx, dvz = tz - this.vz;
    const dl = Math.hypot(dvx, dvz);
    const stopping = Math.hypot(tx, tz) < Math.hypot(this.vx, this.vz);
    const maxDv = (stopping ? K.PLAYER_DECEL : K.PLAYER_ACCEL) * dt;
    if (dl > maxDv && dl > 1e-6) { this.vx += (dvx / dl) * maxDv; this.vz += (dvz / dl) * maxDv; }
    else { this.vx = tx; this.vz = tz; }

    const res = moveAndSlide(maze, colliders, this, this.vx * dt, this.vz * dt, K.PLAYER_RADIUS);
    if (res.hitX) this.vx = 0;
    if (res.hitZ) this.vz = 0;

    // envoltura del tunel
    const [, cy] = maze.worldToCellRaw(this.x, this.z);
    if (cy === maze.tunnelRow) {
      const lim = maze.tunnelLimit;
      if (this.x > lim) { this.x -= maze.tunnelShift; events.push({ type: "wrap", who: "player" }); }
      else if (this.x < -lim) { this.x += maze.tunnelShift; events.push({ type: "wrap", who: "player" }); }
    }

    this.speed = Math.hypot(this.vx, this.vz);
    this.moving = this.speed > 0.35;
    if (this.moving && this.speed > 0.8) {
      const hx = this.vx, hz = this.vz;
      this.moveHeading = Math.abs(hx) > Math.abs(hz) ? [Math.sign(hx), 0] : [0, Math.sign(hz)];
    }
    this.heading = this.moving && this.speed > 0.8 ? this.moveHeading
      : Math.abs(fx) > Math.abs(fz) ? [Math.sign(fx), 0] : [0, Math.sign(fz)];

    // estamina
    if (this.running) {
      this.stamina -= K.STAMINA_DRAIN * tune.staminaDrain * dt;
      if (this.stamina <= 0) {
        this.stamina = 0;
        this.exhausted = true;
        this.running = false;
        events.push({ type: "exhausted" });
      }
    } else {
      this.stamina = Math.min(K.STAMINA_MAX, this.stamina + K.STAMINA_RECOVER * (this.moving ? 0.7 : 1) * dt);
    }
    if (wasExhausted && !this.exhausted) events.push({ type: "recovered" });

    // bateria / linterna
    if (this.lightOn) {
      this.battery -= (K.BATTERY_DRAIN * tune.batteryDrain + (tune.stareDrain ? K.BATTERY_STARE_DRAIN : 0)) * dt;
      if (this.battery <= 0) {
        this.battery = 0; this.flashlightOn = false; this.batteryLocked = true;
        events.push({ type: "batteryDead" });
      }
    } else {
      this.battery = Math.min(K.BATTERY_MAX, this.battery + K.BATTERY_RECOVER * dt);
      if (this.batteryLocked && this.battery >= 18) this.batteryLocked = false;
    }

    // ruido que oyen los fantasmas
    const target = this.running ? 1 : this.sonarOpen ? 0.85 : this.moving ? 0.35 : 0.05;
    this.noise += (target - this.noise) * Math.min(1, dt * 6);

    // pasos
    if (this.moving) {
      this.stepAcc += this.speed * dt;
      if (this.stepAcc >= STEP_LEN) { this.stepAcc -= STEP_LEN; events.push({ type: "step", running: this.running }); }
    } else {
      this.stepAcc = Math.min(this.stepAcc, STEP_LEN * 0.5);
    }

    if (this.invuln > 0) this.invuln = Math.max(0, this.invuln - dt);
  }
}

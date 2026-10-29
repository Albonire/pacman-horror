// Entrada: teclado + raton con pointer lock (movimiento crudo cuando el navegador lo permite).
// Esquema:
//   W/S o flechas arriba/abajo: avanzar / retroceder
//   A/D: lateral.   Flechas izq/der: lateral (modo raton) o girar (modo teclado)
//   Q/E: girar siempre.   Raton: mirar.   Shift: correr.   Espacio o clic derecho: sonar.

import type { ControlMode } from "./settings";

export interface InputCallbacks {
  onPause: () => void;
  onToggleLight: () => void;
  onToggleCamera: () => void;
  onToggleMute: () => void;
  onBite: () => void;
  /** El navegador libero el raton (p. ej. Esc). */
  onLockLost: () => void;
  onLockError: () => void;
}

const BLOCK_DEFAULT = new Set([
  "Space", "Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
]);

export class Input {
  private keys = new Set<string>();
  private lookDX = 0;
  private lookDY = 0;
  private rmb = false;
  private el: HTMLElement;
  private cb: InputCallbacks;
  private attached = false;

  locked = false;
  mode: ControlMode = "mouse";
  /** Cuando es true se evita el comportamiento por defecto de Espacio/Tab/flechas. */
  capture = false;
  private lockFailures = 0;
  private ignoreLookUntil = 0;

  constructor(el: HTMLElement, cb: InputCallbacks) {
    this.el = el;
    this.cb = cb;
  }

  attach(): void {
    if (this.attached) return;
    this.attached = true;
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    document.addEventListener("mousemove", this.onMouseMove);
    document.addEventListener("pointerlockchange", this.onLockChange);
    document.addEventListener("pointerlockerror", this.onLockErr);
    this.el.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mouseup", this.onMouseUp);
    this.el.addEventListener("contextmenu", this.onContext);
  }

  detach(): void {
    if (!this.attached) return;
    this.attached = false;
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    document.removeEventListener("mousemove", this.onMouseMove);
    document.removeEventListener("pointerlockchange", this.onLockChange);
    document.removeEventListener("pointerlockerror", this.onLockErr);
    this.el.removeEventListener("mousedown", this.onMouseDown);
    window.removeEventListener("mouseup", this.onMouseUp);
    this.el.removeEventListener("contextmenu", this.onContext);
    if (document.pointerLockElement === this.el) document.exitPointerLock();
  }

  /** Pide el bloqueo del raton (debe llamarse desde un gesto del usuario). */
  requestLock(): void {
    if (this.mode === "keyboard" || this.locked) return;
    const el = this.el as HTMLElement & { requestPointerLock: (o?: { unadjustedMovement?: boolean }) => Promise<void> | void };
    try {
      const r = el.requestPointerLock({ unadjustedMovement: true });
      if (r && typeof (r as Promise<void>).catch === "function") {
        (r as Promise<void>).catch(() => {
          // sin movimiento crudo: reintento normal
          try { void el.requestPointerLock(); } catch { /* noop */ }
        });
      }
    } catch {
      try { void el.requestPointerLock(); } catch { /* noop */ }
    }
  }

  releaseLock(): void {
    if (document.pointerLockElement === this.el) document.exitPointerLock();
  }

  get needsLock(): boolean { return this.mode === "mouse"; }
  get ready(): boolean { return this.mode === "keyboard" || this.locked; }

  // ---- lectura por frame ----

  /** Devuelve y reinicia el movimiento acumulado del raton. */
  consumeLook(): { dx: number; dy: number } {
    const r = { dx: this.lookDX, dy: this.lookDY };
    this.lookDX = 0; this.lookDY = 0;
    return r;
  }

  private down(...codes: string[]): boolean { return codes.some((c) => this.keys.has(c)); }

  axes(): { forward: number; strafe: number; turn: number; lookV: number } {
    const kbTurn = this.mode === "keyboard";
    let forward = 0, strafe = 0, turn = 0, lookV = 0;
    if (this.down("KeyW", "ArrowUp")) forward += 1;
    if (this.down("KeyS", "ArrowDown")) forward -= 1;
    if (this.down("KeyD")) strafe += 1;
    if (this.down("KeyA")) strafe -= 1;
    if (kbTurn) {
      if (this.down("ArrowRight")) turn -= 1;
      if (this.down("ArrowLeft")) turn += 1;
    } else {
      if (this.down("ArrowRight")) strafe += 1;
      if (this.down("ArrowLeft")) strafe -= 1;
    }
    if (this.down("KeyE")) turn -= 1;
    if (this.down("KeyQ")) turn += 1;
    if (kbTurn) {
      // en modo teclado: R/F inclinan la vista
      if (this.down("KeyR")) lookV += 1;
      if (this.down("KeyV")) lookV -= 1;
    }
    return { forward, strafe: Math.max(-1, Math.min(1, strafe)), turn: Math.max(-1, Math.min(1, turn)), lookV };
  }

  get sprint(): boolean { return this.down("ShiftLeft", "ShiftRight"); }
  get sonar(): boolean { return this.down("Space") || this.rmb; }

  clear(): void {
    this.keys.clear();
    this.rmb = false;
    this.lookDX = 0; this.lookDY = 0;
  }

  // ---- manejadores ----

  private onKeyDown = (e: KeyboardEvent): void => {
    if (this.capture && BLOCK_DEFAULT.has(e.code)) e.preventDefault();
    if (e.repeat) return;
    if (e.code === "Escape" || e.code === "KeyP") { this.cb.onPause(); return; }
    this.keys.add(e.code);
    if (!this.capture) return;
    switch (e.code) {
      case "KeyF": this.cb.onToggleLight(); break;
      case "KeyC": this.cb.onToggleCamera(); break;
      case "KeyM": this.cb.onToggleMute(); break;
      case "KeyX": this.cb.onBite(); break;
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => { this.keys.delete(e.code); };

  private onBlur = (): void => { this.clear(); };

  private onMouseMove = (e: MouseEvent): void => {
    if (!this.locked) return;
    // Chrome entrega un salto enorme en el primer evento tras capturar el raton: se ignora un instante
    if (performance.now() < this.ignoreLookUntil) return;
    const mx = Math.max(-160, Math.min(160, e.movementX || 0));
    const my = Math.max(-160, Math.min(160, e.movementY || 0));
    this.lookDX += mx;
    this.lookDY += my;
  };

  private onMouseDown = (e: MouseEvent): void => {
    if (!this.capture) return;
    if (e.button === 2) { this.rmb = true; e.preventDefault(); }
    if (e.button === 0) {
      if (!this.ready) this.requestLock();
      else this.cb.onBite();
    }
  };

  private onMouseUp = (e: MouseEvent): void => { if (e.button === 2) this.rmb = false; };

  private onContext = (e: Event): void => { if (this.capture) e.preventDefault(); };

  private onLockChange = (): void => {
    const was = this.locked;
    this.locked = document.pointerLockElement === this.el;
    if (this.locked) { this.lockFailures = 0; this.ignoreLookUntil = performance.now() + 180; this.lookDX = 0; this.lookDY = 0; }
    if (was && !this.locked) {
      this.lookDX = 0; this.lookDY = 0;
      this.cb.onLockLost();
    }
  };

  private onLockErr = (): void => {
    this.lockFailures++;
    this.cb.onLockError();
  };

  get failedLocks(): number { return this.lockFailures; }
}

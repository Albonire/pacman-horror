// Entrada: teclado + raton con pointer lock (movimiento crudo cuando el navegador lo permite).
// Esquema:
//   W/S o flechas arriba/abajo: avanzar / retroceder
//   A/D: lateral.   Flechas izq/der: lateral (modo raton) o girar (modo teclado)
//   Q: girar siempre.   Raton: mirar.   E: interactuar.   Shift: correr.   Espacio o clic derecho: sonar.
//   Z: mirar por encima del hombro (solo la vista).

import type { ControlMode } from "./settings";

export interface InputCallbacks {
  onPause: () => void;
  onToggleLight: () => void;
  onToggleCamera: () => void;
  onToggleMute: () => void;
  onBite: () => void;
  onInteract: () => void;
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
  private lastLockErrAt = -Infinity;
  private ignoreLookUntil = 0;
  private lastClientX: number | null = null;
  private lastClientY: number | null = null;

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
    this.el.addEventListener("mouseenter", this.onMouseEnter);
    this.el.addEventListener("mouseleave", this.onMouseLeave);
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
    this.el.removeEventListener("mouseenter", this.onMouseEnter);
    this.el.removeEventListener("mouseleave", this.onMouseLeave);
    if (document.pointerLockElement === this.el) document.exitPointerLock();
  }

  /** Pide el bloqueo del raton (debe llamarse desde un gesto del usuario). */
  requestLock(): void {
    if (this.mode === "keyboard" || this.locked) return;
    const el = this.el;
    try {
      if (typeof el.focus === "function") el.focus();
    } catch {
      // focus error ignored
    }
    try {
      const r = el.requestPointerLock();
      if (r && typeof (r as Promise<void>).catch === "function") {
        // Un fallo real dispara a la vez el rechazo de la promesa y el evento
        // pointerlockerror: noteLockError los fusiona para no contar doble.
        (r as Promise<void>).catch(() => this.noteLockError());
      }
    } catch {
      this.noteLockError();
    }
  }

  private noteLockError(): void {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (now - this.lastLockErrAt < 120) return;
    this.lastLockErrAt = now;
    this.lockFailures++;
    this.cb.onLockError();
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
    // sin pointer lock se puede girar con el teclado aunque el ajuste sea "raton"
    const kbTurn = this.mode === "keyboard" || (this.mode === "mouse" && !this.locked);
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
    if (this.down("KeyQ")) turn += 1;
    if (kbTurn) {
      // sin raton: R/F inclinan la vista
      if (this.down("KeyR")) lookV += 1;
      if (this.down("KeyV")) lookV -= 1;
    }
    return { forward, strafe: Math.max(-1, Math.min(1, strafe)), turn: Math.max(-1, Math.min(1, turn)), lookV };
  }

  get sprint(): boolean { return this.down("ShiftLeft", "ShiftRight"); }
  get sonar(): boolean { return this.down("Space") || this.rmb; }
  /** Mantener Z para mirar por encima del hombro. */
  get lookBack(): boolean { return this.down("KeyZ"); }

  clear(): void {
    this.keys.clear();
    this.rmb = false;
    this.lookDX = 0; this.lookDY = 0;
    this.lastClientX = null; this.lastClientY = null;
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
      case "KeyE": this.cb.onInteract(); break;
      case "Enter": this.cb.onInteract(); break;
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => { this.keys.delete(e.code); };

  private onBlur = (): void => { this.clear(); };

  private onMouseEnter = (e: MouseEvent): void => {
    this.lastClientX = e.clientX;
    this.lastClientY = e.clientY;
  };

  private onMouseLeave = (): void => {
    this.lastClientX = null;
    this.lastClientY = null;
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (!this.capture || this.mode === "keyboard") return;
    if (this.locked) {
      // Chrome entrega un salto enorme en el primer evento tras capturar el raton: se ignora un instante
      if (performance.now() < this.ignoreLookUntil) return;
      const mx = Math.max(-160, Math.min(160, e.movementX || 0));
      const my = Math.max(-160, Math.min(160, e.movementY || 0));
      this.lookDX += mx;
      this.lookDY += my;
    } else {
      // Sin pointer lock activo (p. ej. en iframes restringidos): mirar con desplazamiento relativo
      const hasMovement = typeof e.movementX === "number" && (e.movementX !== 0 || e.movementY !== 0);
      let mx = 0;
      let my = 0;
      if (hasMovement) {
        mx = e.movementX;
        my = e.movementY;
      } else if (this.lastClientX !== null && this.lastClientY !== null) {
        mx = e.clientX - this.lastClientX;
        my = e.clientY - this.lastClientY;
      }
      this.lastClientX = e.clientX;
      this.lastClientY = e.clientY;
      const clampedX = Math.max(-160, Math.min(160, mx || 0));
      const clampedY = Math.max(-160, Math.min(160, my || 0));
      this.lookDX += clampedX;
      this.lookDY += clampedY;
    }
  };

  private onMouseDown = (e: MouseEvent): void => {
    if (!this.capture) return;
    if (e.button === 2) { this.rmb = true; e.preventDefault(); }
    if (e.button === 0) {
      if (this.mode === "mouse" && !this.locked) {
        this.requestLock();
        if (this.failedLocks > 0) {
          this.cb.onBite();
        }
      } else {
        this.cb.onBite();
      }
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
    this.noteLockError();
  };

  get failedLocks(): number { return this.lockFailures; }
}

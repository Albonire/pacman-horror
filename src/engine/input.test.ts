import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Input } from "./input";

describe("Input", () => {
  let listeners: Record<string, ((e: unknown) => void)[]> = {};

  beforeEach(() => {
    listeners = {};
    const add = (type: string, fn: (e: unknown) => void) => {
      listeners[type] = listeners[type] || [];
      listeners[type].push(fn);
    };
    const remove = (type: string, fn: (e: unknown) => void) => {
      if (listeners[type]) listeners[type] = listeners[type].filter((f) => f !== fn);
    };

    (globalThis as unknown as { window: unknown }).window = {
      addEventListener: add,
      removeEventListener: remove,
    };
    (globalThis as unknown as { document: unknown }).document = {
      addEventListener: add,
      removeEventListener: remove,
      pointerLockElement: null,
      exitPointerLock: vi.fn(),
    };
  });

  afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window;
    delete (globalThis as unknown as { document?: unknown }).document;
  });

  function makeInput() {
    const elListeners: Record<string, ((e: unknown) => void)[]> = {};
    const el = {
      addEventListener: (type: string, fn: (e: unknown) => void) => {
        elListeners[type] = elListeners[type] || [];
        elListeners[type].push(fn);
      },
      removeEventListener: (type: string, fn: (e: unknown) => void) => {
        if (elListeners[type]) elListeners[type] = elListeners[type].filter((f) => f !== fn);
      },
      requestPointerLock: vi.fn(),
      dispatchEvent: (e: { type: string }) => {
        for (const fn of elListeners[e.type] || []) fn(e);
      },
    } as unknown as HTMLElement;

    const dispatch = (type: string, event: unknown) => {
      for (const fn of listeners[type] || []) fn(event);
    };

    const callbacks = {
      onPause: vi.fn(),
      onToggleLight: vi.fn(),
      onToggleCamera: vi.fn(),
      onToggleMute: vi.fn(),
      onBite: vi.fn(),
      onInteract: vi.fn(),
      onLockLost: vi.fn(),
      onLockError: vi.fn(),
    };
    const input = new Input(el, callbacks);
    input.attach();
    return { el, callbacks, input, dispatch };
  }

  it("mira con el raton incluso sin pointer lock activo (modo relativo)", () => {
    const { input, dispatch } = makeInput();
    input.capture = true;
    input.mode = "mouse";
    input.locked = false;

    // Primer movimiento
    dispatch("mousemove", { clientX: 100, clientY: 100, movementX: 15, movementY: -10 });
    const look1 = input.consumeLook();
    expect(look1.dx).toBe(15);
    expect(look1.dy).toBe(-10);

    // Segundo movimiento usando fallback de clientX/clientY si movementX es 0
    dispatch("mousemove", { clientX: 125, clientY: 120, movementX: 0, movementY: 0 });
    const look2 = input.consumeLook();
    expect(look2.dx).toBe(25);
    expect(look2.dy).toBe(20);

    input.detach();
  });

  it("el clic inicial captura el raton sin morder, y muerde cuando ya esta bloqueado o en fallback", () => {
    const { el, callbacks, input } = makeInput();
    input.capture = true;
    input.mode = "mouse";
    input.locked = false;
    const reqSpy = vi.spyOn(input, "requestLock");

    // Primer clic: solo captura raton
    el.dispatchEvent({ type: "mousedown", button: 0 } as unknown as Event);
    expect(reqSpy).toHaveBeenCalledTimes(1);
    expect(callbacks.onBite).not.toHaveBeenCalled();

    // Cuando ya esta bloqueado: muerde
    input.locked = true;
    el.dispatchEvent({ type: "mousedown", button: 0 } as unknown as Event);
    expect(callbacks.onBite).toHaveBeenCalledTimes(1);

    // En modo fallback sin bloqueo (failedLocks > 0): reintenta lock y muerde
    input.locked = false;
    (input as unknown as { lockFailures: number }).lockFailures = 1;
    el.dispatchEvent({ type: "mousedown", button: 0 } as unknown as Event);
    expect(callbacks.onBite).toHaveBeenCalledTimes(2);

    input.detach();
  });

  it("un fallo de pointer lock no se cuenta dos veces (promesa rechazada + evento)", async () => {
    const { el, callbacks, input, dispatch } = makeInput();
    input.capture = true;
    input.mode = "mouse";
    (el as unknown as { requestPointerLock: () => Promise<void> }).requestPointerLock = () => Promise.reject(new Error("denied"));

    input.requestLock();
    dispatch("pointerlockerror", new Event("pointerlockerror"));
    await new Promise((r) => setTimeout(r, 0));

    expect(input.failedLocks).toBe(1);
    expect(callbacks.onLockError).toHaveBeenCalledTimes(1);
  });

  it("el clic derecho activa el sonar", () => {
    const { el, input, dispatch } = makeInput();
    input.capture = true;
    el.dispatchEvent({ type: "mousedown", button: 2, preventDefault: vi.fn() } as unknown as Event);
    expect(input.sonar).toBe(true);
    dispatch("mouseup", { button: 2 });
    expect(input.sonar).toBe(false);

    input.detach();
  });
});

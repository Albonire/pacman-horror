import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  stopHaptics,
  triggerBiteHaptics,
  triggerCaughtHaptics,
  triggerScreamerHaptics,
  triggerScreenJolt,
  triggerTapHaptics,
  unlockHaptics,
} from "./haptics";

describe("haptics", () => {
  const vibrateMock = vi.fn(() => true);

  beforeEach(() => {
    vibrateMock.mockClear();
    vi.stubGlobal("navigator", { vibrate: vibrateMock });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("desbloquea la API de vibracion en el primer gesto tactil y emite micro-pulso al tocar botones", () => {
    expect(unlockHaptics()).toBe(true);
    expect(vibrateMock).toHaveBeenCalledWith(8);

    vibrateMock.mockClear();
    expect(triggerTapHaptics()).toBe(true);
    expect(vibrateMock).toHaveBeenCalledWith(12);
  });

  it("dispara una rafaga intensa sincronizada con el screamer en modo completo", () => {
    const ok = triggerScreamerHaptics(1.0, "full");
    expect(ok).toBe(true);
    expect(vibrateMock).toHaveBeenCalledTimes(1);
    expect(vibrateMock).toHaveBeenCalledWith([95, 25, 160, 25, 80]);
  });

  it("reduce la vibracion en sustos reducidos y la omite si estan desactivados", () => {
    expect(triggerScreamerHaptics(1.0, "reduced")).toBe(true);
    expect(vibrateMock).toHaveBeenLastCalledWith([65]);

    vibrateMock.mockClear();
    expect(triggerScreamerHaptics(1.0, "off")).toBe(false);
    expect(vibrateMock).not.toHaveBeenCalled();
  });

  it("vibra al ser atrapado y al morder, y ejecuta sacudida visual de respaldo sin errores", () => {
    expect(triggerCaughtHaptics("full")).toBe(true);
    expect(vibrateMock).toHaveBeenLastCalledWith([180, 40, 240, 50, 120]);

    expect(triggerBiteHaptics(true)).toBe(true);
    expect(vibrateMock).toHaveBeenLastCalledWith([45, 20, 70]);

    expect(triggerBiteHaptics(false)).toBe(true);
    expect(vibrateMock).toHaveBeenLastCalledWith([25]);

    expect(() => triggerScreenJolt(1, 120)).not.toThrow();

    stopHaptics();
    expect(vibrateMock).toHaveBeenLastCalledWith(0);
  });
});

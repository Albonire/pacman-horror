import { describe, expect, it } from "vitest";
import { DEFAULT_PROGRESS, DEFAULT_SETTINGS, loadProgress, loadSettings, sanitizeProgress, sanitizeSettings, type Progress } from "./settings";

describe("ajustes y progreso", () => {
  it("sin almacenamiento disponible se usan los valores por defecto", () => {
    expect(loadSettings()).toEqual(sanitizeSettings(DEFAULT_SETTINGS));
    expect(loadProgress()).toEqual(DEFAULT_PROGRESS);
  });

  it("los ajustes corruptos se corrigen a rangos validos", () => {
    const s = sanitizeSettings({ ...DEFAULT_SETTINGS, sensitivity: 99, fov: -4, volume: 7, brightness: 0, scares: "x" as never, quality: "ultra" as never, controlMode: "gamepad" as never });
    expect(s.sensitivity).toBeLessThanOrEqual(3);
    expect(s.fov).toBeGreaterThanOrEqual(55);
    expect(s.volume).toBe(1);
    expect(s.brightness).toBeGreaterThanOrEqual(0.6);
    expect(s.scares).toBe("full");
    expect(s.quality).toBe("high");
    expect(s.controlMode).toBe("mouse");

    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, scares: "nofullscreen" }).scares).toBe("nofullscreen");
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, scares: "reduced" }).scares).toBe("reduced");
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, scares: "off" }).scares).toBe("off");
  });

  it("el progreso corrupto no desbloquea niveles inexistentes ni propaga basura", () => {
    const bad = { highScore: "mucho", unlocked: 99, bestScoreByLevel: { "0": 100, "9": 5, x: 1, "1": -3 }, warningAccepted: "si", completedRuns: -2 } as unknown as Progress;
    const p = sanitizeProgress(bad, 6);
    expect(p.highScore).toBe(0);
    expect(p.unlocked).toBe(5);
    expect(p.bestScoreByLevel).toEqual({ "0": 100, "1": 0 });
    expect(p.warningAccepted).toBe(false);
    expect(p.completedRuns).toBe(0);
  });

  it("un progreso valido se conserva", () => {
    const ok: Progress = { highScore: 4200, unlocked: 3, bestScoreByLevel: { "0": 900, "2": 1500 }, warningAccepted: true, completedRuns: 1 };
    expect(sanitizeProgress(ok, 6)).toEqual(ok);
  });

  it("migra controlMode keyboard guardado por error antiguo a mouse", () => {
    const store = new Map<string, string>();
    const fakeLocalStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, String(v)),
      removeItem: (k: string) => store.delete(k),
      clear: () => store.clear(),
    };
    const prevWindow = (globalThis as { window?: unknown }).window;
    (globalThis as { window?: unknown }).window = { localStorage: fakeLocalStorage };
    try {
      fakeLocalStorage.setItem("umbral.settings.v1", JSON.stringify({ controlMode: "keyboard" }));
      const loaded = loadSettings();
      expect(loaded.controlMode).toBe("mouse");
      const raw = JSON.parse(fakeLocalStorage.getItem("umbral.settings.v1") || "{}");
      expect(raw.controlMode).toBe("mouse");
    } finally {
      if (prevWindow === undefined) {
        delete (globalThis as { window?: unknown }).window;
      } else {
        (globalThis as { window?: unknown }).window = prevWindow;
      }
    }
  });
});

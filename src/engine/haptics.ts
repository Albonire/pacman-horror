// Vibracion haptica e impacto fisico para dispositivos moviles.
// Combina Web Vibration API (desbloqueada en gestos tactiles directos) con sacudida fisica de pantalla
// de alta frecuencia para navegadores moviles que bloquean navigator.vibrate (como Brave o iOS).

import type { ScareLevel } from "./settings";

type NavWithVibrate = Navigator & {
  vibrate?: (pattern: number | number[]) => boolean;
};

let hapticsPrimed = false;
let joltRaf: number | null = null;

function canVibrate(): NavWithVibrate | null {
  if (typeof navigator === "undefined") return null;
  const nav = navigator as NavWithVibrate;
  return typeof nav.vibrate === "function" ? nav : null;
}

/**
 * Desbloquea la API de vibracion dentro de un gesto directo del usuario (touchstart / pointerdown / click).
 */
export function unlockHaptics(): boolean {
  if (hapticsPrimed) return true;
  const nav = canVibrate();
  if (!nav) return false;
  try {
    const ok = !!nav.vibrate!(8);
    if (ok) hapticsPrimed = true;
    return ok;
  } catch {
    return false;
  }
}

/**
 * Dispara una vibracion haptica en el dispositivo movil si el navegador lo soporta.
 * Devuelve true si se envio el patron al motor haptico.
 */
export function vibratePattern(pattern: number | number[]): boolean {
  const nav = canVibrate();
  if (!nav) return false;
  try {
    const ok = !!nav.vibrate!(pattern);
    if (ok) hapticsPrimed = true;
    return ok;
  } catch {
    return false;
  }
}

/**
 * Sacudida fisica de alta frecuencia sobre el contenedor visual (.app-root) sincronizada con el impacto,
 * garantizando sensacion de choque fisico incluso en navegadores como Brave/iOS que bloquean navigator.vibrate.
 */
export function triggerScreenJolt(intensity = 1, durationMs = 260): void {
  if (typeof document === "undefined" || typeof requestAnimationFrame === "undefined") return;
  const el = document.querySelector<HTMLElement>(".app-root");
  if (!el) return;
  if (joltRaf !== null) {
    cancelAnimationFrame(joltRaf);
    joltRaf = null;
  }
  const amp = Math.max(2, Math.min(16, intensity * 9.5));
  const start = typeof performance !== "undefined" ? performance.now() : Date.now();
  const step = (now: number) => {
    const t = now - start;
    if (t >= durationMs) {
      el.style.transform = "";
      joltRaf = null;
      return;
    }
    const decay = Math.pow(1 - t / durationMs, 1.55);
    const phase = t * 0.19;
    const dx = Math.sin(phase * 2.3) * amp * decay;
    const dy = Math.cos(phase * 3.1) * amp * 0.85 * decay;
    el.style.transform = `translate3d(${dx.toFixed(1)}px, ${dy.toFixed(1)}px, 0)`;
    joltRaf = requestAnimationFrame(step);
  };
  joltRaf = requestAnimationFrame(step);
}

/** Pulso tactil ligero (12 ms) al pulsar botones en pantalla. */
export function triggerTapHaptics(): boolean {
  return vibratePattern(12);
}

/** Detiene cualquier vibracion activa. */
export function stopHaptics(): void {
  if (typeof document !== "undefined") {
    const el = document.querySelector<HTMLElement>(".app-root");
    if (el) el.style.transform = "";
  }
  if (joltRaf !== null && typeof cancelAnimationFrame !== "undefined") {
    cancelAnimationFrame(joltRaf);
    joltRaf = null;
  }
  vibratePattern(0);
}

/**
 * Dispara una rafaga haptica intensa sincronizada con un screamer repentino.
 * - En modo "full": triple impacto seco de alta energia ([110, 25, 180, 25, 95] ms) escalado por `intensity` + sacudida fisica.
 * - En modo "reduced": un pulso corto moderado ([65] ms).
 * - En modo "off" o "nofullscreen": desactivado.
 */
export function triggerScreamerHaptics(intensity = 1, level: ScareLevel = "full"): boolean {
  if (intensity <= 0 || level === "off" || level === "nofullscreen") return false;
  if (level === "reduced") {
    triggerScreenJolt(intensity * 0.45, 160);
    return vibratePattern([Math.max(35, Math.round(65 * Math.min(1.2, intensity)))]);
  }
  const k = Math.max(0.6, Math.min(1.3, intensity));
  triggerScreenJolt(k * 1.15, 310);
  return vibratePattern([
    Math.round(95 * k),
    25,
    Math.round(160 * k),
    25,
    Math.round(80 * k),
  ]);
}

/**
 * Dispara una sacudida haptica grave cuando un fantasma atrapa a Pac-Man.
 */
export function triggerCaughtHaptics(level: ScareLevel = "full"): boolean {
  if (level === "off") return false;
  if (level === "reduced" || level === "nofullscreen") {
    triggerScreenJolt(0.6, 220);
    return vibratePattern([90, 30, 110]);
  }
  triggerScreenJolt(1.35, 380);
  return vibratePattern([180, 40, 240, 50, 120]);
}

/**
 * Dispara un pulso haptico corto al morder (mas contundente si aturde a un fantasma).
 */
export function triggerBiteHaptics(stunned: boolean): boolean {
  triggerScreenJolt(stunned ? 0.75 : 0.35, stunned ? 190 : 110);
  return vibratePattern(stunned ? [45, 20, 70] : [25]);
}

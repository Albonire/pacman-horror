// Muestras de audio reales incrustadas en el archivo unico (data URI de Vite `?inline`).
// El grito y el bucle del menu se generan con `scripts/prepare_assets.py` a partir de `assets/audio/`.

import screamUrl from "../assets/scream.mp3?inline";
import menuLoopUrl from "../assets/menu_loop.mp3?inline";

export type SampleId = "scream" | "menuLoop";

const URLS: Record<SampleId, string> = { scream: screamUrl, menuLoop: menuLoopUrl };
const bytes = new Map<SampleId, Promise<ArrayBuffer | null>>();

/** Los bytes se leen una sola vez; cada AudioContext (incluido uno reconstruido) los decodifica por su cuenta. */
function raw(id: SampleId): Promise<ArrayBuffer | null> {
  let p = bytes.get(id);
  if (!p) {
    p = fetch(URLS[id]).then((r) => r.arrayBuffer()).catch(() => null);
    bytes.set(id, p);
  }
  return p;
}

/** Decodifica una muestra para `ctx`. Devuelve null si el navegador no puede (el motor usa sintesis de respaldo). */
export async function decodeSample(ctx: BaseAudioContext, id: SampleId): Promise<AudioBuffer | null> {
  const data = await raw(id);
  if (!data) return null;
  try {
    // decodeAudioData consume el buffer: se le pasa una copia
    return await ctx.decodeAudioData(data.slice(0));
  } catch {
    return null;
  }
}

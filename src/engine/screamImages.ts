// Caras de los fantasmas para los sustos a pantalla completa: imagenes 16:9 incrustadas (`?inline`).
// Se generan con `scripts/prepare_assets.py` a partir de `assets/screams/`. Indice = FaceKind (0 Blinky, 1 Pinky, 2 Inky, 3 Clyde).

import type { FaceKind } from "../gfx/faces";
import blinky from "../assets/screams/0.jpg?inline";
import pinky from "../assets/screams/1.jpg?inline";
import inky from "../assets/screams/2.jpg?inline";
import clyde from "../assets/screams/3.jpg?inline";

const URLS: Record<FaceKind, string> = { 0: blinky, 1: pinky, 2: inky, 3: clyde };
const images = new Map<FaceKind, HTMLImageElement>();

/** Pide la decodificacion de las cuatro caras para que el primer susto no tenga que esperarlas. */
export function preloadScreamImages(): void {
  if (typeof Image === "undefined") return;
  for (const k of [0, 1, 2, 3] as const) {
    if (images.has(k)) continue;
    const im = new Image();
    im.decoding = "async";
    im.src = URLS[k];
    void im.decode?.().catch(() => { /* se reintenta al dibujar */ });
    images.set(k, im);
  }
}

/** Imagen lista para dibujar, o null si aun no se decodifico. */
export function screamImage(kind: FaceKind): HTMLImageElement | null {
  preloadScreamImages();
  const im = images.get(kind);
  return im && im.complete && im.naturalWidth > 0 ? im : null;
}

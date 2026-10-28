// Ruido procedural teselable (periodico) para texturas sin costuras.

export function hash2(ix: number, iy: number, seed: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function pmod(a: number, n: number): number {
  return ((a % n) + n) % n;
}

/** Ruido de valor periodico con `fx` x `fy` celdas por tesela. u, v en [0,1). */
export function valueNoise(u: number, v: number, fx: number, fy: number, seed: number): number {
  const x = u * fx, y = v * fy;
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const tx = x - x0, ty = y - y0;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const ix0 = pmod(x0, fx), ix1 = pmod(x0 + 1, fx), iy0 = pmod(y0, fy), iy1 = pmod(y0 + 1, fy);
  const a = hash2(ix0, iy0, seed), b = hash2(ix1, iy0, seed);
  const c = hash2(ix0, iy1, seed), d = hash2(ix1, iy1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** fBm teselable normalizado a [0,1] aprox. Devuelve un campo w*h. */
export function fbmField(
  w: number, h: number, fx: number, fy: number, octaves: number, seed: number, gain = 0.5,
): Float32Array {
  const out = new Float32Array(w * h);
  let amp = 1, total = 0;
  for (let o = 0; o < octaves; o++) { total += amp; amp *= gain; }
  amp = 1;
  let cfx = fx, cfy = fy;
  for (let o = 0; o < octaves; o++) {
    const s = seed + o * 101;
    for (let y = 0; y < h; y++) {
      const v = y / h;
      const row = y * w;
      for (let x = 0; x < w; x++) {
        out[row + x] += amp * valueNoise(x / w, v, cfx, cfy, s);
      }
    }
    amp *= gain;
    cfx *= 2; cfy *= 2;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

export interface VoronoiField {
  f1: Float32Array; // distancia al punto mas cercano (normalizada por el tamano de celda)
  f2: Float32Array; // distancia al segundo mas cercano
  id: Float32Array; // id aleatorio [0,1) de la celda mas cercana
}

/** Ruido celular periodico con `cx` x `cy` celdas por tesela. */
export function voronoiField(w: number, h: number, cx: number, cy: number, seed: number, jitter = 0.9): VoronoiField {
  const f1 = new Float32Array(w * h), f2 = new Float32Array(w * h), id = new Float32Array(w * h);
  const px = new Float32Array(cx * cy), py = new Float32Array(cx * cy);
  for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) {
    px[j * cx + i] = i + 0.5 + (hash2(i, j, seed) - 0.5) * jitter;
    py[j * cx + i] = j + 0.5 + (hash2(i, j, seed + 77) - 0.5) * jitter;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const fx = (x / w) * cx, fy = (y / h) * cy;
    const gi = Math.floor(fx), gj = Math.floor(fy);
    let d1 = 9, d2 = 9, best = 0;
    for (let oj = -1; oj <= 1; oj++) for (let oi = -1; oi <= 1; oi++) {
      const ci = pmod(gi + oi, cx), cj = pmod(gj + oj, cy);
      const k = cj * cx + ci;
      // posicion del punto desplazada a la copia vecina correcta
      const ppx = px[k] + Math.floor((gi + oi) / cx) * cx;
      const ppy = py[k] + Math.floor((gj + oj) / cy) * cy;
      const dx = ppx - fx, dy = ppy - fy;
      const d = dx * dx + dy * dy;
      if (d < d1) { d2 = d1; d1 = d; best = k; } else if (d < d2) d2 = d;
    }
    const i = y * w + x;
    f1[i] = Math.sqrt(d1); f2[i] = Math.sqrt(d2);
    id[i] = hash2(best, 7, seed + 5);
  }
  return { f1, f2, id };
}

export function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function clamp01(x: number): number { return x < 0 ? 0 : x > 1 ? 1 : x; }
export function mix(a: number, b: number, t: number): number { return a + (b - a) * t; }

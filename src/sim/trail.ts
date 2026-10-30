// Rastro del jugador: posiciones pasadas para que El Acechador llegue por detras.
// Buffer ordenado por tiempo con interpolacion; sin dependencias del motor.

export interface TrailSample {
  t: number;
  x: number;
  z: number;
}

const DEFAULT_MAX_AGE = 8;

export class Trail {
  private buf: TrailSample[] = [];

  constructor(private maxAge = DEFAULT_MAX_AGE) {}

  clear(): void { this.buf.length = 0; }

  get empty(): boolean { return this.buf.length === 0; }
  /** Tiempo cubierto por el rastro (segundos). */
  get span(): number { return this.buf.length ? this.buf[this.buf.length - 1].t - this.buf[0].t : 0; }

  push(t: number, x: number, z: number): void {
    if (!Number.isFinite(t) || !Number.isFinite(x) || !Number.isFinite(z)) return;
    const last = this.buf[this.buf.length - 1];
    if (last && t <= last.t) {
      if (t === last.t) {
        last.x = x;
        last.z = z;
      } else {
        while (this.buf.length && this.buf[this.buf.length - 1].t >= t) this.buf.pop();
        this.buf.push({ t, x, z });
      }
    } else {
      this.buf.push({ t, x, z });
    }
    this.trim(t);
  }

  private trim(now: number): void {
    let drop = 0;
    while (drop < this.buf.length - 1 && now - this.buf[drop].t > this.maxAge) drop++;
    if (drop > 0) this.buf.splice(0, drop);
  }

  /** Posicion interpolada en `t`; null si el rastro no cubre ese instante. */
  at(t: number): TrailSample | null {
    const n = this.buf.length;
    if (!n || !Number.isFinite(t)) return null;
    if (t < this.buf[0].t || t > this.buf[n - 1].t) return null;
    if (t === this.buf[0].t) return { ...this.buf[0] };
    if (t === this.buf[n - 1].t) return { ...this.buf[n - 1] };
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.buf[mid].t <= t) lo = mid;
      else hi = mid;
    }
    const a = this.buf[lo], b = this.buf[hi];
    const span = b.t - a.t;
    const k = span > 1e-6 ? (t - a.t) / span : 0;
    return { t, x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k };
  }
}

export { Trail as PlayerTrail };

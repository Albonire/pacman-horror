// Nucleo de sintesis Web Audio: buses, reverberacion, ruido y ayudantes para tonos/rafagas.
// Todo el audio de UMBRAL es procedural: no hay archivos externos.

import { decodeSample, type SampleId } from "./samples";

/** Tope de tonos y rafagas simultaneos antes de descartar los de poco volumen. */
export const MAX_LIVE_VOICES = 42;
/** Cola maxima de la reverberacion (s). */
export const MAX_REVERB_SECONDS = 2.4;

export type NoiseKind = "white" | "pink" | "brown";

export interface ToneOpts {
  type?: OscillatorType;
  f0: number;
  f1?: number; // frecuencia final (barrido exponencial)
  t?: number;
  dur: number;
  a?: number;
  vol: number;
  detune?: number;
  lp?: number;
  hp?: number;
  bp?: number;
  q?: number;
  vibRate?: number;
  vibDepth?: number; // en cents
  dest?: AudioNode;
  send?: number; // envio a reverb 0..1
}

export interface NoiseOpts {
  kind?: NoiseKind;
  t?: number;
  dur: number;
  a?: number;
  vol: number;
  bp?: number;
  bp1?: number; // frecuencia final del paso banda
  q?: number;
  lp?: number;
  hp?: number;
  dest?: AudioNode;
  send?: number;
  offset?: number;
}

const noiseCache = new Map<number, { white: AudioBuffer; pink: AudioBuffer; brown: AudioBuffer }>();

/** Los buffers de ruido no dependen del contexto: se generan una vez por frecuencia de muestreo. */
function sharedNoise(rate: number, make: (sec: number, kind: NoiseKind) => AudioBuffer) {
  let n = noiseCache.get(rate);
  if (!n) {
    n = { white: make(2.5, "white"), pink: make(4, "pink"), brown: make(4, "brown") };
    noiseCache.set(rate, n);
  }
  return n;
}

/** Sonidos pre-renderizados (clave -> variantes), compartidos entre contextos de la misma frecuencia. */
const bakedCache = new Map<string, AudioBuffer[]>();
const bakeQueued = new Set<string>();
let bakeChain: Promise<void> = Promise.resolve();

export type BakeBuild = (S: Synth, variant: number) => void;

export function makeDistCurve(k: number, n = 512): Float32Array<ArrayBuffer> {
  const c = new Float32Array(n) as Float32Array<ArrayBuffer>;
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    c[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  return c;
}

export class Synth {
  readonly ctx: AudioContext;
  readonly master: GainNode;
  readonly comp: DynamicsCompressorNode;
  readonly sfx: GainNode;
  readonly amb: GainNode;
  readonly music: GainNode;
  readonly voice: GainNode;
  readonly reverbSend: GainNode;
  readonly reverb: ConvolverNode;
  readonly reverbReturn: GainNode;
  readonly white: AudioBuffer;
  readonly pink: AudioBuffer;
  readonly brown: AudioBuffer;
  readonly dist: WaveShaperNode;
  /** Medidor tras el limitador (detecta silencio muerto o NaN). */
  readonly analyser: AnalyserNode;
  /** Paso bajo maestro (ver `muffle`). */
  readonly lp: BiquadFilterNode;
  private volume = 0.8;
  private muted = false;
  /** Multiplicador de mezcla temporal para el efecto en curso (ver tabla MIX del motor). */
  trim = 1;
  /** Fuentes efimeras (tonos y rafagas) vivas ahora mismo. */
  live = 0;
  /** Contadores para el registro: nodos creados y llamadas a parametros desde el inicio. */
  made = 0;
  paramCalls = 0;
  private duckUntil = 0;
  private muffleUntil = 0;
  private muffled = false;
  private muffleTimer: number | null = null;
  private lastRamp = new WeakMap<AudioParam, number>();
  private gainSetAt = -10;
  private lastVariant = new Map<string, number>();

  /**
   * `ctx` permite inyectar un OfflineAudioContext (pruebas de render y sonidos pre-renderizados).
   * `raw`: sin limitador ni reverberacion, ganancias a 1 (renderizado de sonidos pre-calculados, ver `bake`).
   * `latency`: "playback" por defecto (mas margen frente a tirones del sistema; los sustos compensan la latencia).
   */
  constructor(ctx?: AudioContext, opts: { samples?: boolean; latency?: AudioContextLatencyCategory; raw?: boolean } = {}) {
    if (!ctx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new Ctx({ latencyHint: opts.latency ?? "playback" });
    }
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.comp = ctx.createDynamicsCompressor();
    // limitador de seguridad master: controlado para dar pegada maxima sin bombeo ni recorte
    this.comp.threshold.value = -2;
    this.comp.knee.value = 8;
    this.comp.ratio.value = 4.5;
    this.comp.attack.value = 0.002;
    this.comp.release.value = 0.08;
    // limitador suave (tanh) tras el compresor: evita el recorte digital en los gritos
    const clip = ctx.createWaveShaper();
    const curve = new Float32Array(1024) as Float32Array<ArrayBuffer>;
    for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh(((i * 2) / (curve.length - 1) - 1) * 1.15) / Math.tanh(1.15);
    clip.curve = curve;
    // filtro paso bajo para la muerte (cierra el oido como si se fuera la conciencia): solo esta en la cadena durante `muffle`
    this.lp = ctx.createBiquadFilter();
    this.lp.type = "lowpass";
    this.lp.frequency.value = 20000;
    this.lp.Q.value = 0.4;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    if (opts.raw) {
      this.master.gain.value = 1;
      this.master.connect(ctx.destination);
    } else {
      this.master.connect(this.comp);
      this.comp.connect(clip);
      clip.connect(ctx.destination);
      clip.connect(this.analyser);
    }

    this.sfx = ctx.createGain(); this.sfx.gain.value = 1.25;
    this.amb = ctx.createGain(); this.amb.gain.value = 0.25;
    this.music = ctx.createGain(); this.music.gain.value = 0.8;
    this.voice = ctx.createGain(); this.voice.gain.value = 1.5;
    for (const b of [this.sfx, this.amb, this.music, this.voice]) b.connect(this.master);

    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 1;
    this.reverb = ctx.createConvolver();
    this.reverbReturn = ctx.createGain();
    this.reverbReturn.gain.value = opts.raw ? 0 : 0.5;
    this.reverbSend.connect(this.reverb);
    this.reverb.connect(this.reverbReturn);
    this.reverbReturn.connect(this.master);
    if (opts.raw) for (const b of [this.sfx, this.amb, this.music, this.voice]) b.gain.value = 1;
    else this.setReverb(2.2, 0.6);

    this.dist = ctx.createWaveShaper();
    this.dist.curve = makeDistCurve(40);
    this.dist.oversample = "2x";

    const noise = sharedNoise(ctx.sampleRate, (sec, kind) => this.makeNoise(sec, kind));
    this.white = noise.white;
    this.pink = noise.pink;
    this.brown = noise.brown;
    if (opts.samples !== false) this.loadSamples();
  }

  private samples = new Map<SampleId, AudioBuffer>();
  private sampleWaiters = new Map<SampleId, ((b: AudioBuffer) => void)[]>();

  /** Muestra ya decodificada, o null si aun no esta lista (o no se pudo decodificar). */
  getSample(id: SampleId): AudioBuffer | null { return this.samples.get(id) ?? null; }

  /** Avisa cuando una muestra queda decodificada (inmediato si ya lo esta). */
  whenSample(id: SampleId, fn: (b: AudioBuffer) => void): void {
    const b = this.samples.get(id);
    if (b) { fn(b); return; }
    const list = this.sampleWaiters.get(id) ?? [];
    list.push(fn);
    this.sampleWaiters.set(id, list);
  }

  private loadSamples(): void {
    for (const id of ["scream", "menuLoop"] as const) {
      void decodeSample(this.ctx, id).then((buf) => {
        if (!buf) return;
        this.samples.set(id, buf);
        for (const fn of this.sampleWaiters.get(id) ?? []) fn(buf);
        this.sampleWaiters.delete(id);
      });
    }
  }

  get now(): number { return this.ctx.currentTime; }

  /** Latencia de salida estimada (s): los golpes sincronizados con la imagen se adelantan esto. */
  get lead(): number {
    const c = this.ctx as AudioContext;
    return Math.max(0, Math.min(0.15, (c.outputLatency || 0) || (c.baseLatency || 0)));
  }

  /** Baja ambiente y musica durante `secs` (silencio previo a un susto) y los devuelve con una subida lenta. */
  duck(level: number, secs: number, release = 1.4): void {
    const t = this.now;
    this.duckUntil = Math.max(this.duckUntil, t + secs + release * 1.5);
    for (const [bus, base] of [[this.amb, 0.25], [this.music, 0.8]] as const) {
      bus.gain.cancelScheduledValues(t);
      bus.gain.setTargetAtTime(base * level, t, 0.08);
      bus.gain.setTargetAtTime(base, t + secs, release / 3);
    }
  }

  /**
   * Cierra el oido: baja el paso bajo maestro hasta `freq` en `ramp` segundos, lo mantiene `hold` y lo abre en `release`.
   * Empieza en `at` (segundos del reloj del contexto).
   */
  muffle(freq: number, ramp: number, hold: number, release: number, at = this.now): void {
    this.insertMuffle();
    const f = this.lp.frequency;
    f.cancelScheduledValues(at);
    f.setValueAtTime(20000, at);
    f.exponentialRampToValueAtTime(Math.max(60, freq), at + ramp);
    f.setValueAtTime(Math.max(60, freq), at + ramp + hold);
    f.exponentialRampToValueAtTime(20000, at + ramp + hold + release);
    this.muffleUntil = at + ramp + hold + release;
    if (this.muffleTimer !== null) clearTimeout(this.muffleTimer);
    const ms = Math.max(0, (this.muffleUntil - this.now) * 1000) + 600;
    this.muffleTimer = setTimeout(() => this.removeMuffle(), ms) as unknown as number;
  }

  private insertMuffle(): void {
    if (this.muffled) return;
    this.muffled = true;
    this.master.disconnect(this.comp);
    this.master.connect(this.lp);
    this.lp.connect(this.comp);
  }

  /** Saca el filtro de la cadena: fuera de la muerte no hay nada entre el mezclador y el limitador. */
  removeMuffle(): void {
    if (!this.muffled) return;
    this.muffled = false;
    this.muffleTimer = null;
    try { this.master.disconnect(this.lp); this.lp.disconnect(this.comp); } catch { /* ya desconectado */ }
    this.master.connect(this.comp);
  }

  /** True mientras dura el silencio previo a un susto (ver `duck`). */
  get ducked(): boolean { return this.now < this.duckUntil; }

  /** True mientras `lp` esta en la cadena. */
  get isMuffled(): boolean { return this.muffled; }

  setVolume(v: number): void { this.volume = v; this.applyGain(); }
  setMuted(m: boolean): void { this.muted = m; this.applyGain(); }
  private applyGain(): void {
    const t = this.ctx.currentTime;
    this.gainSetAt = t;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, t, 0.03);
  }

  /** Reverberacion convolucional con respuesta al impulso generada (ruido con decaimiento). */
  setReverb(seconds: number, damp: number): void {
    const ctx = this.ctx;
    // respuesta mono (la mitad de coste de convolucion) y cola maxima de 2,4 s
    const len = Math.floor(ctx.sampleRate * Math.min(seconds, MAX_REVERB_SECONDS));
    const ir = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = ir.getChannelData(0);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const n = Math.random() * 2 - 1;
      lp += (n - lp) * (1 - damp * (0.35 + 0.65 * t)); // oscurece la cola
      d[i] = lp * Math.pow(1 - t, 2.4) * (i < 80 ? i / 80 : 1);
    }
    this.reverb.buffer = ir;
  }

  private makeNoise(seconds: number, kind: NoiseKind): AudioBuffer {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === "white") d[i] = w;
      else if (kind === "pink") {
        b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913;
        d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.22;
      } else { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    }
    return buf;
  }

  noiseBuf(k: NoiseKind): AudioBuffer { return k === "white" ? this.white : k === "pink" ? this.pink : this.brown; }

  noiseSource(k: NoiseKind = "white", loop = true): AudioBufferSourceNode {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf(k);
    s.loop = loop;
    return s;
  }

  /** Conecta `node` a un destino y, opcionalmente, al envio de reverb. */
  out(node: AudioNode, dest: AudioNode, send = 0): void {
    node.connect(dest);
    if (send > 0) {
      const g = this.ctx.createGain();
      g.gain.value = send;
      node.connect(g);
      g.connect(this.reverbSend);
    }
  }

  /** Con muchas voces vivas se descartan las suaves: en equipos justos cada nodo cuenta para el hilo de audio. */
  private overloaded(vol: number): boolean { return this.live >= MAX_LIVE_VOICES && vol * this.trim < 0.22; }

  tone(o: ToneOpts): OscillatorNode | null {
    if (this.overloaded(o.vol)) return null;
    this.made += 5;
    const ctx = this.ctx;
    const t = o.t ?? ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = o.type ?? "sine";
    osc.frequency.setValueAtTime(o.f0, t);
    if (o.f1 && o.f1 !== o.f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), t + o.dur);
    if (o.detune) osc.detune.value = o.detune;
    let node: AudioNode = osc;
    const chain = (f: BiquadFilterNode) => { node.connect(f); node = f; };
    if (o.hp) { const f = ctx.createBiquadFilter(); f.type = "highpass"; f.frequency.value = o.hp; chain(f); }
    if (o.lp) { const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = o.lp; chain(f); }
    if (o.bp) { const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = o.bp; f.Q.value = o.q ?? 1; chain(f); }
    const g = ctx.createGain();
    const a = o.a ?? 0.005;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(o.vol * this.trim, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    node.connect(g);
    if (o.vibRate) {
      const lfo = ctx.createOscillator(); lfo.frequency.value = o.vibRate;
      const lg = ctx.createGain(); lg.gain.value = o.vibDepth ?? 30;
      lfo.connect(lg); lg.connect(osc.detune);
      lfo.start(t); lfo.stop(t + o.dur + 0.05);
    }
    this.out(g, o.dest ?? this.sfx, o.send ?? 0);
    osc.start(t);
    osc.stop(t + o.dur + 0.05);
    this.live++;
    osc.onended = () => { this.live--; };
    return osc;
  }

  noise(o: NoiseOpts): AudioBufferSourceNode | null {
    if (this.overloaded(o.vol)) return null;
    this.made += 5;
    const ctx = this.ctx;
    const t = o.t ?? ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf(o.kind ?? "white");
    let node: AudioNode = src;
    const chain = (f: BiquadFilterNode) => { node.connect(f); node = f; };
    if (o.hp) { const f = ctx.createBiquadFilter(); f.type = "highpass"; f.frequency.value = o.hp; chain(f); }
    if (o.lp) { const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = o.lp; chain(f); }
    if (o.bp) {
      const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.Q.value = o.q ?? 1;
      f.frequency.setValueAtTime(o.bp, t);
      if (o.bp1) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.bp1), t + o.dur);
      chain(f);
    }
    const g = ctx.createGain();
    const a = o.a ?? 0.004;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(o.vol * this.trim, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    node.connect(g);
    this.out(g, o.dest ?? this.sfx, o.send ?? 0);
    src.start(t, o.offset ?? Math.random() * 1.2);
    src.stop(t + o.dur + 0.05);
    this.live++;
    src.onended = () => { this.live--; };
    return src;
  }

  /** Voz sintetica: fuente rica en armonicos filtrada por formantes. */
  formantVoice(opts: {
    t?: number; dur: number; f0: number; f1?: number; vol: number; a?: number;
    formants: [number, number, number][]; // [frecuencia, Q, ganancia]
    type?: OscillatorType; vibRate?: number; vibDepth?: number; noiseMix?: number; dist?: boolean; dest?: AudioNode; send?: number;
  }): void {
    this.made += 8 + opts.formants.length * 3;
    const ctx = this.ctx;
    const t = opts.t ?? ctx.currentTime;
    const src = ctx.createOscillator();
    src.type = opts.type ?? "sawtooth";
    src.frequency.setValueAtTime(opts.f0, t);
    if (opts.f1) src.frequency.exponentialRampToValueAtTime(opts.f1, t + opts.dur);
    const mix = ctx.createGain();
    src.connect(mix);
    if (opts.noiseMix) {
      const n = this.noiseSource("white", true);
      const ng = ctx.createGain(); ng.gain.value = opts.noiseMix;
      n.connect(ng); ng.connect(mix);
      n.start(t, Math.random()); n.stop(t + opts.dur + 0.05);
    }
    let pre: AudioNode = mix;
    if (opts.dist) { mix.connect(this.dist); pre = this.dist; }
    const sum = ctx.createGain();
    for (const [f, q, gain] of opts.formants) {
      const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = f; bp.Q.value = q;
      const g = ctx.createGain(); g.gain.value = gain;
      pre.connect(bp); bp.connect(g); g.connect(sum);
    }
    const env = ctx.createGain();
    const a = opts.a ?? 0.02;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(opts.vol * this.trim, t + a);
    env.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur);
    sum.connect(env);
    if (opts.vibRate) {
      const lfo = ctx.createOscillator(); lfo.frequency.value = opts.vibRate;
      const lg = ctx.createGain(); lg.gain.value = opts.vibDepth ?? 40;
      lfo.connect(lg); lg.connect(src.detune);
      lfo.start(t); lfo.stop(t + opts.dur + 0.05);
    }
    this.out(env, opts.dest ?? this.sfx, opts.send ?? 0.2);
    src.start(t); src.stop(t + opts.dur + 0.05);
  }

  /** Contadores para el registro de vuelo. */
  get stats(): { made: number; params: number; live: number } {
    return { made: this.made, params: this.paramCalls, live: this.live };
  }

  /**
   * Autocuracion: si una ganancia se sale de su valor nominal fuera de una ventana legitima (duck, muerte, cambio de
   * volumen) o contiene NaN, se restaura. Devuelve la lista de arreglos hechos (vacia si todo esta bien).
   */
  heal(): string[] {
    const t = this.now;
    const fixes: string[] = [];
    const check = (name: string, p: AudioParam, nominal: number) => {
      const v = p.value;
      if (Number.isFinite(v) && Math.abs(v - nominal) <= 0.2 * Math.abs(nominal) + 0.02) return;
      p.cancelScheduledValues(t);
      p.setValueAtTime(nominal, t);
      fixes.push(`${name} ${Number.isFinite(v) ? v.toFixed(3) : "NaN"} -> ${nominal}`);
    };
    if (t - this.gainSetAt > 1.5) check("master", this.master.gain, this.muted ? 0 : this.volume);
    check("sfx", this.sfx.gain, 1.25);
    check("voice", this.voice.gain, 1.5);
    check("reverbReturn", this.reverbReturn.gain, 0.5);
    if (t > this.duckUntil + 0.5) {
      check("amb", this.amb.gain, 0.25);
      check("music", this.music.gain, 0.8);
    }
    if (this.muffled && t > this.muffleUntil + 1) {
      this.removeMuffle();
      fixes.push("paso bajo retirado");
    } else if (this.muffled && !Number.isFinite(this.lp.frequency.value)) {
      this.lp.frequency.cancelScheduledValues(t);
      this.lp.frequency.setValueAtTime(20000, t);
      fixes.push("paso bajo NaN");
    }
    return fixes;
  }

  /**
   * Pre-renderiza un sonido breve en un OfflineAudioContext (`variants` variantes, mono, sin limitador). Despues,
   * `playBaked` lo reproduce con 2 nodos en vez de 8 a 16. Se hace en segundo plano y de uno en uno; mientras no
   * este listo el llamador sintetiza en vivo. Las variantes se comparten entre contextos de la misma frecuencia.
   */
  bake(key: string, dur: number, variants: number, build: BakeBuild): void {
    const rate = this.ctx.sampleRate;
    const id = `${rate}:${key}`;
    if (bakedCache.has(id) || bakeQueued.has(id) || typeof OfflineAudioContext === "undefined") return;
    bakeQueued.add(id);
    bakeChain = bakeChain.then(async () => {
      try {
        const out: AudioBuffer[] = [];
        for (let i = 0; i < variants; i++) {
          const off = new OfflineAudioContext(1, Math.ceil(dur * rate), rate);
          const s = new Synth(off as unknown as AudioContext, { samples: false, raw: true });
          build(s, i);
          out.push(await off.startRendering());
          await new Promise((r) => setTimeout(r, 30)); // cede el hilo principal entre variantes
        }
        bakedCache.set(id, out);
      } catch { /* sin OfflineAudioContext o fallo de render: se queda en sintesis en vivo */ }
      finally { bakeQueued.delete(id); }
    });
  }

  /** True si el sonido pre-renderizado esta listo. */
  hasBaked(key: string): boolean { return bakedCache.has(`${this.ctx.sampleRate}:${key}`); }

  /**
   * Reproduce una variante del sonido pre-renderizado (distinta de la anterior) con volumen `vol` y variacion de tono
   * `rate` (1 = original). Devuelve null si aun no esta listo o hay sobrecarga: el llamador sintetiza en vivo o lo omite.
   */
  playBaked(key: string, o: { vol: number; rate?: number; t?: number; dest?: AudioNode; send?: number }): AudioBufferSourceNode | null {
    const list = bakedCache.get(`${this.ctx.sampleRate}:${key}`);
    if (!list || !list.length) return null;
    if (this.overloaded(o.vol)) return null;
    const ctx = this.ctx;
    let i = Math.floor(Math.random() * list.length);
    if (list.length > 1 && i === this.lastVariant.get(key)) i = (i + 1) % list.length;
    this.lastVariant.set(key, i);
    const src = ctx.createBufferSource();
    src.buffer = list[i];
    if (o.rate && o.rate !== 1) src.playbackRate.value = o.rate;
    const g = ctx.createGain();
    g.gain.value = o.vol * this.trim;
    src.connect(g);
    this.out(g, o.dest ?? this.sfx, o.send ?? 0);
    this.made += o.send ? 3 : 2;
    src.start(o.t ?? ctx.currentTime);
    this.live++;
    src.onended = () => { this.live--; src.disconnect(); g.disconnect(); };
    return src;
  }

  /**
   * Panner para fuentes puntuales. `equalpower` es mucho mas barato que HRTF (una convolucion por fuente y
   * bloque de audio) y basta para ubicar de lado; HRTF solo cuando se pide (`hq`).
   */
  panner(x: number, y: number, z: number, ref = 2.2, rolloff = 1.25, hq = false): PannerNode {
    const p = this.ctx.createPanner();
    p.panningModel = hq ? "HRTF" : "equalpower";
    p.distanceModel = "inverse";
    p.refDistance = ref;
    p.maxDistance = 45;
    p.rolloffFactor = rolloff;
    this.setPannerPos(p, x, y, z, true);
    return p;
  }

  private lastPan = new WeakMap<AudioNode, number>();
  private lastPos = new WeakMap<AudioNode, [number, number, number]>();

  /** Mueve una fuente. Maximo ~10 Hz y solo si se ha desplazado (una sola llamada por parametro). */
  setPannerPos(p: PannerNode, x: number, y: number, z: number, force = false): void {
    const t = this.ctx.currentTime;
    if (!force && t - (this.lastPan.get(p) ?? -1) < 0.1) return;
    const prev = this.lastPos.get(p);
    if (!force && prev && Math.abs(prev[0] - x) < 0.05 && Math.abs(prev[1] - y) < 0.05 && Math.abs(prev[2] - z) < 0.05) return;
    this.lastPan.set(p, t);
    this.lastPos.set(p, [x, y, z]);
    if (p.positionX) {
      this.glide(p.positionX, x, t); this.glide(p.positionY, y, t); this.glide(p.positionZ, z, t);
    } else (p as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(x, y, z);
  }

  /** Lleva un parametro a `v` en ~120 ms con una sola llamada (la rampa parte del valor anterior). */
  private glide(param: AudioParam, v: number, t: number): void {
    this.paramCalls++;
    param.linearRampToValueAtTime(v, t + 0.12);
  }

  /**
   * Acerca un parametro a `target` (constante de tiempo `tc`). Se ignora si el objetivo casi no cambia (2 %):
   * las capas continuas lo llaman cada frame y asi casi no generan trafico hacia el hilo de audio.
   */
  ramp(param: AudioParam, target: number, tc: number): void {
    const last = this.lastRamp.get(param);
    if (last !== undefined && Math.abs(target - last) <= 0.02 * Math.max(0.05, Math.abs(last))) return;
    this.lastRamp.set(param, target);
    this.paramCalls++;
    param.setTargetAtTime(target, this.ctx.currentTime, tc);
  }

  private lastListener = -1;

  private lastListenerPose: number[] | null = null;

  setListener(x: number, y: number, z: number, fx: number, fy: number, fz: number): void {
    const l = this.ctx.listener;
    const t = this.ctx.currentTime;
    if (t - this.lastListener < 0.1) return;
    const prev = this.lastListenerPose;
    if (prev && Math.abs(prev[0] - x) < 0.05 && Math.abs(prev[1] - y) < 0.05 && Math.abs(prev[2] - z) < 0.05
      && Math.abs(prev[3] - fx) < 0.01 && Math.abs(prev[4] - fy) < 0.01 && Math.abs(prev[5] - fz) < 0.01) return;
    this.lastListenerPose = [x, y, z, fx, fy, fz];
    this.lastListener = t;
    if (l.positionX) {
      this.glide(l.positionX, x, t); this.glide(l.positionY, y, t); this.glide(l.positionZ, z, t);
      this.glide(l.forwardX, fx, t); this.glide(l.forwardY, fy, t); this.glide(l.forwardZ, fz, t);
      l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
    } else {
      const lx = l as unknown as { setPosition(x: number, y: number, z: number): void; setOrientation(a: number, b: number, c: number, d: number, e: number, f: number): void };
      lx.setPosition(x, y, z);
      lx.setOrientation(fx, fy, fz, 0, 1, 0);
    }
  }
}

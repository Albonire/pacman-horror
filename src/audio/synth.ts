// Nucleo de sintesis Web Audio: buses, reverberacion, ruido y ayudantes para tonos/rafagas.
// Todo el audio de UMBRAL es procedural: no hay archivos externos.

import { SCREAM_AUDIO_BASE64 } from "./screamData";

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
  private volume = 0.8;
  private muted = false;
  /** Multiplicador de mezcla temporal para el efecto en curso (ver tabla MIX del motor). */
  trim = 1;

  /** `ctx` permite inyectar un OfflineAudioContext (pruebas de render sin dispositivo de audio). */
  constructor(ctx?: AudioContext) {
    if (!ctx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new Ctx({ latencyHint: "interactive" });
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
    this.master.connect(this.comp);
    this.comp.connect(clip);
    clip.connect(ctx.destination);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    clip.connect(this.analyser);

    this.sfx = ctx.createGain(); this.sfx.gain.value = 1.25;
    this.amb = ctx.createGain(); this.amb.gain.value = 0.25;
    this.music = ctx.createGain(); this.music.gain.value = 0.8;
    this.voice = ctx.createGain(); this.voice.gain.value = 1.5;
    for (const b of [this.sfx, this.amb, this.music, this.voice]) b.connect(this.master);

    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 1;
    this.reverb = ctx.createConvolver();
    this.reverbReturn = ctx.createGain();
    this.reverbReturn.gain.value = 0.5;
    this.reverbSend.connect(this.reverb);
    this.reverb.connect(this.reverbReturn);
    this.reverbReturn.connect(this.master);
    this.setReverb(2.2, 0.6);

    this.dist = ctx.createWaveShaper();
    this.dist.curve = makeDistCurve(40);
    this.dist.oversample = "2x";

    this.white = this.makeNoise(2.5, "white");
    this.pink = this.makeNoise(4, "pink");
    this.brown = this.makeNoise(4, "brown");
    this.initScreamBuffer();
  }

  private screamBuffer: AudioBuffer | null = null;
  getScreamBuffer(): AudioBuffer | null { return this.screamBuffer; }

  private initScreamBuffer(): void {
    if (typeof atob !== "function" || !this.ctx.decodeAudioData) return;
    try {
      const bin = atob(SCREAM_AUDIO_BASE64);
      const len = bin.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
      const raw = bytes.buffer;
      const p = this.ctx.decodeAudioData(
        raw,
        (buf) => { this.screamBuffer = buf; },
        () => { /* fallback a procedural */ },
      );
      if (p && typeof p.then === "function") {
        p.then((buf) => { this.screamBuffer = buf; }).catch(() => {});
      }
    } catch {
      // Ignorado en contextos offline o sin soporte de decodificacion
    }
  }

  get now(): number { return this.ctx.currentTime; }

  /** Baja ambiente y musica durante `secs` (silencio previo a un susto) y los devuelve con una subida lenta. */
  duck(level: number, secs: number, release = 1.4): void {
    const t = this.now;
    for (const [bus, base] of [[this.amb, 0.25], [this.music, 0.8]] as const) {
      bus.gain.cancelScheduledValues(t);
      bus.gain.setTargetAtTime(base * level, t, 0.08);
      bus.gain.setTargetAtTime(base, t + secs, release / 3);
    }
  }

  setVolume(v: number): void { this.volume = v; this.applyGain(); }
  setMuted(m: boolean): void { this.muted = m; this.applyGain(); }
  private applyGain(): void {
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, t, 0.03);
  }

  /** Reverberacion convolucional con respuesta al impulso generada (ruido con decaimiento). */
  setReverb(seconds: number, damp: number): void {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        const n = Math.random() * 2 - 1;
        lp += (n - lp) * (1 - damp * (0.35 + 0.65 * t)); // oscurece la cola
        d[i] = lp * Math.pow(1 - t, 2.4) * (i < 80 ? i / 80 : 1);
      }
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

  tone(o: ToneOpts): OscillatorNode {
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
    return osc;
  }

  noise(o: NoiseOpts): AudioBufferSourceNode {
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
    return src;
  }

  /** Voz sintetica: fuente rica en armonicos filtrada por formantes. */
  formantVoice(opts: {
    t?: number; dur: number; f0: number; f1?: number; vol: number; a?: number;
    formants: [number, number, number][]; // [frecuencia, Q, ganancia]
    type?: OscillatorType; vibRate?: number; vibDepth?: number; noiseMix?: number; dist?: boolean; dest?: AudioNode; send?: number;
  }): void {
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

  /** Panner HRTF para fuentes puntuales. */
  panner(x: number, y: number, z: number, ref = 2.2, rolloff = 1.25): PannerNode {
    const p = this.ctx.createPanner();
    p.panningModel = "HRTF";
    p.distanceModel = "inverse";
    p.refDistance = ref;
    p.maxDistance = 45;
    p.rolloffFactor = rolloff;
    this.setPannerPos(p, x, y, z);
    return p;
  }

  setPannerPos(p: PannerNode, x: number, y: number, z: number): void {
    if (p.positionX) {
      const t = this.ctx.currentTime;
      p.positionX.setTargetAtTime(x, t, 0.03); p.positionY.setTargetAtTime(y, t, 0.03); p.positionZ.setTargetAtTime(z, t, 0.03);
    } else (p as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(x, y, z);
  }

  setListener(x: number, y: number, z: number, fx: number, fy: number, fz: number): void {
    const l = this.ctx.listener;
    const t = this.ctx.currentTime;
    if (l.positionX) {
      l.positionX.setTargetAtTime(x, t, 0.02); l.positionY.setTargetAtTime(y, t, 0.02); l.positionZ.setTargetAtTime(z, t, 0.02);
      l.forwardX.setTargetAtTime(fx, t, 0.02); l.forwardY.setTargetAtTime(fy, t, 0.02); l.forwardZ.setTargetAtTime(fz, t, 0.02);
      l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
    } else {
      const lx = l as unknown as { setPosition(x: number, y: number, z: number): void; setOrientation(a: number, b: number, c: number, d: number, e: number, f: number): void };
      lx.setPosition(x, y, z);
      lx.setOrientation(fx, fy, fz, 0, 1, 0);
    }
  }
}

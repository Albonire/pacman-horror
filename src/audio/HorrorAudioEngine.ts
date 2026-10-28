import * as THREE from "three";

// Motor de audio procedural 100% (Web Audio API). Sin archivos externos.
export class HorrorAudioEngine {
  ctx: AudioContext | null = null;
  master!: GainNode;
  humGain!: GainNode;
  musicGain!: GainNode;
  sfxGain!: GainNode;
  musicFilter!: BiquadFilterNode;
  musicOscs: { osc: OscillatorNode; gain: GainNode }[] = [];
  tritone!: OscillatorNode;
  tritoneGain!: GainNode;
  lfo!: OscillatorNode;
  lfoGain!: GainNode;
  tension = 0;
  heartbeatAcc = 0;
  stepAcc = 0;
  muted = false;
  entityNodes: { panner: PannerNode; gain: GainNode; osc: OscillatorNode; noise: AudioBufferSourceNode }[] = [];
  ready = false;

  private noiseBuffer: AudioBuffer | null = null;

  init(): void {
    if (this.ready || this.ctx) return;
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();
    const ctx = this.ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0.85;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp);
    comp.connect(ctx.destination);

    // ---- HUM de ambiente (60Hz + 120Hz + ruido marrón) ----
    this.humGain = ctx.createGain();
    this.humGain.gain.value = 0.16;
    this.humGain.connect(this.master);
    const humFilter = ctx.createBiquadFilter();
    humFilter.type = "lowpass";
    humFilter.frequency.value = 220;
    humFilter.connect(this.humGain);
    const o1 = ctx.createOscillator(); o1.type = "sawtooth"; o1.frequency.value = 60;
    const o2 = ctx.createOscillator(); o2.type = "square"; o2.frequency.value = 120;
    const g1 = ctx.createGain(); g1.gain.value = 0.5;
    const g2 = ctx.createGain(); g2.gain.value = 0.18;
    o1.connect(g1); g1.connect(humFilter);
    o2.connect(g2); g2.connect(humFilter);
    o1.start(); o2.start();

    // ruido marrón
    this.noiseBuffer = this.makeNoiseBuffer(2, "brown");
    const nb = ctx.createBufferSource();
    nb.buffer = this.noiseBuffer; nb.loop = true;
    const nf = ctx.createBiquadFilter(); nf.type = "lowpass"; nf.frequency.value = 400;
    const ng = ctx.createGain(); ng.gain.value = 0.5;
    nb.connect(nf); nf.connect(ng); ng.connect(humFilter);
    nb.start();

    // ---- MÚSICA TERRORÍFICA ADAPTATIVA (drones desafinables) ----
    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = 0.0;
    this.musicGain.connect(this.master);
    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = "lowpass";
    this.musicFilter.frequency.value = 900;
    this.musicFilter.connect(this.musicGain);

    const freqs = [55, 82.41, 110, 164.81]; // La menor etéreo
    for (const f of freqs) {
      const osc = ctx.createOscillator(); osc.type = "triangle"; osc.frequency.value = f;
      const g = ctx.createGain(); g.gain.value = 0.12;
      osc.connect(g); g.connect(this.musicFilter);
      osc.start();
      this.musicOscs.push({ osc, gain: g });
    }
    // tritono (aparece con la tensión)
    this.tritone = ctx.createOscillator(); this.tritone.type = "sine"; this.tritone.frequency.value = 155.56;
    this.tritoneGain = ctx.createGain(); this.tritoneGain.gain.value = 0;
    this.tritone.connect(this.tritoneGain); this.tritoneGain.connect(this.musicFilter);
    this.tritone.start();

    // LFO que desafina
    this.lfo = ctx.createOscillator(); this.lfo.type = "sine"; this.lfo.frequency.value = 0.3;
    this.lfoGain = ctx.createGain(); this.lfoGain.gain.value = 0;
    this.lfo.connect(this.lfoGain);
    for (const m of this.musicOscs) this.lfoGain.connect(m.osc.detune);
    this.lfoGain.connect(this.tritone.detune);
    this.lfo.start();

    this.sfxGain = ctx.createGain();
    this.sfxGain.gain.value = 1.0;
    this.sfxGain.connect(this.master);

    this.ready = true;
  }

  resume(): void {
    this.init();
    if (this.ctx && this.ctx.state === "suspended") void this.ctx.resume();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.85;
  }

  private makeNoiseBuffer(seconds: number, type: "white" | "brown"): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (type === "brown") {
        last = (last + 0.02 * w) / 1.02;
        data[i] = last * 3.5;
      } else {
        data[i] = w;
      }
    }
    return buf;
  }

  // ---- tensión adaptativa ----
  setTension(t: number): void {
    this.tension = Math.max(0, Math.min(1, t));
    if (!this.ready) return;
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    // volumen de la música sube con la tensión
    this.musicGain.gain.cancelScheduledValues(now);
    this.musicGain.gain.linearRampToValueAtTime(0.05 + this.tension * 0.22, now + 0.4);
    // desafinación progresiva (cinta dañada)
    this.lfoGain.gain.cancelScheduledValues(now);
    this.lfoGain.gain.linearRampToValueAtTime(this.tension * 90, now + 0.3);
    this.lfo.frequency.linearRampToValueAtTime(0.2 + this.tension * 2.2, now + 0.3);
    this.musicFilter.frequency.linearRampToValueAtTime(700 + this.tension * 1400, now + 0.4);
    // tritono
    this.tritoneGain.gain.cancelScheduledValues(now);
    this.tritoneGain.gain.linearRampToValueAtTime(this.tension > 0.55 ? 0.16 : 0, now + 0.5);
  }

  update(dt: number, ghosts: { pos: THREE.Vector3; frightened: boolean; eaten: boolean; frozen: boolean }[], listenerPos: THREE.Vector3): void {
    if (!this.ready || !this.ctx) return;
    const ctx = this.ctx;
    // audio posicional 3D de entidades
    for (let i = 0; i < ghosts.length; i++) {
      const g = ghosts[i];
      let node = this.entityNodes[i];
      if (!node) {
        const panner = ctx.createPanner();
        panner.panningModel = "HRTF";
        panner.distanceModel = "inverse";
        panner.refDistance = 1.5;
        panner.maxDistance = 30;
        panner.rolloffFactor = 1.1;
        panner.connect(this.sfxGain);
        const gain = ctx.createGain(); // ganancia maestra por entidad (distancia)
        gain.gain.value = 0;
        gain.connect(panner);
        const osc = ctx.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.value = 38 + i * 7;
        const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 300;
        osc.connect(lp); lp.connect(gain);
        osc.start();
        const noiseSrc = ctx.createBufferSource();
        noiseSrc.buffer = this.noiseBuffer;
        noiseSrc.loop = true;
        const nf = ctx.createBiquadFilter(); nf.type = "bandpass"; nf.frequency.value = 900; nf.Q.value = 0.7;
        const ng = ctx.createGain(); ng.gain.value = 0.4;
        noiseSrc.connect(nf); nf.connect(ng); ng.connect(gain);
        noiseSrc.start();
        node = { panner, gain, osc, noise: noiseSrc };
        this.entityNodes[i] = node;
      }
      node.panner.positionX.value = g.pos.x - listenerPos.x;
      node.panner.positionY.value = g.pos.y - listenerPos.y;
      node.panner.positionZ.value = g.pos.z - listenerPos.z;
      const d = g.pos.distanceTo(listenerPos);
      const base = g.frightened ? 0.05 : g.eaten ? 0.0 : g.frozen ? 0.22 : 0.32;
      const target = Math.max(0, base * (1 - d / 22));
      node.gain.gain.linearRampToValueAtTime(target, ctx.currentTime + 0.1);
    }

    // latido cardíaco cuando hay tensión
    if (this.tension > 0.25) {
      const rate = 0.7 + this.tension * 1.8; // latidos / seg
      this.heartbeatAcc += dt * rate;
      while (this.heartbeatAcc >= 1) {
        this.heartbeatAcc -= 1;
        this.playHeartbeat();
      }
    } else {
      this.heartbeatAcc = 0;
    }
  }

  private playHeartbeat(): void {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator(); osc.type = "sine"; osc.frequency.value = 52;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5 * (0.3 + this.tension * 0.5), t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    osc.connect(g); g.connect(this.sfxGain);
    osc.start(t); osc.stop(t + 0.35);
  }

  // ---- SFX ----
  private blip(freq: number, dur: number, type: OscillatorType = "square", vol = 0.18): void {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.sfxGain);
    o.start(t); o.stop(t + dur + 0.02);
  }

  playDot(): void { this.blip(880 + Math.random() * 220, 0.06, "square", 0.1); }
  playStep(): void {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 220;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.16, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    src.connect(lp); lp.connect(g); g.connect(this.sfxGain);
    src.start(t, Math.random() * 1.0); src.stop(t + 0.14);
  }
  playPing(): void {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = 1400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.22, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(g); g.connect(this.sfxGain);
    o.start(t); o.stop(t + 0.55);
    // eco
    const o2 = ctx.createOscillator(); o2.type = "sine"; o2.frequency.value = 1050;
    const g2 = ctx.createGain(); g2.gain.setValueAtTime(0.12, t + 0.12);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    o2.connect(g2); g2.connect(this.sfxGain);
    o2.start(t + 0.12); o2.stop(t + 0.7);
  }
  playPower(): void {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.setValueAtTime(80, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 1.2);
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 600;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    o.connect(lp); lp.connect(g); g.connect(this.sfxGain);
    o.start(t); o.stop(t + 1.7);
  }
  playEatGhost(): void {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = "square";
    o.frequency.setValueAtTime(900, t);
    o.frequency.exponentialRampToValueAtTime(120, t + 0.4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.3, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(g); g.connect(this.sfxGain);
    o.start(t); o.stop(t + 0.55);
  }
  playDamage(): void {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = 70;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.6, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 400;
    o.connect(lp); lp.connect(g); g.connect(this.sfxGain);
    o.start(t); o.stop(t + 0.65);
  }
  playFreeze(): void { this.blip(2200, 0.08, "sine", 0.12); }
  playUnlock(): void {
    this.blip(440, 0.2, "triangle", 0.2);
    setTimeout(() => this.blip(660, 0.3, "triangle", 0.2), 120);
  }
  playWin(): void {
    if (!this.ctx || this.muted) return;
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.blip(f, 0.4, "sine", 0.18), i * 110));
  }
  playLose(): void {
    if (!this.ctx || this.muted) return;
    [220, 174, 130, 98].forEach((f, i) => setTimeout(() => this.blip(f, 0.5, "sawtooth", 0.22), i * 140));
  }

  dispose(): void {
    if (this.ctx) {
      this.entityNodes.forEach((n) => { try { n.osc.stop(); n.noise.stop(); } catch { /* noop */ } });
      this.entityNodes = [];
      this.ctx.close();
      this.ctx = null;
      this.ready = false;
    }
  }
}

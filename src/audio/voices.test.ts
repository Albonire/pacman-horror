import { describe, expect, it } from "vitest";
import { Synth } from "./synth";
import { BreathEngine, GhostVoice } from "./voices";
import { HorrorAudio } from "./engine";
import { applyFx, defaultFx, makeFinalPass } from "../engine/postfx";
import { buildPigmentPalette } from "../engine/decals";

/** Crea un AudioContext simulado en memoria para verificar nodos Web Audio, HRTF, filtros de oclusion y formantes. */
function makeMockAudioContext() {
  const createdPanners: { panningModel: string; refDistance: number; rolloffFactor: number; maxDistance: number }[] = [];
  const createdFilters: { type: string; frequency: { value: number; target?: number }; Q: { value: number } }[] = [];
  const createdOscs: { type: string; frequency: { value: number } }[] = [];

  const makeParam = (init = 0) => {
    const p = {
      value: init,
      target: undefined as number | undefined,
      setValueAtTime(v: number) { p.value = v; },
      linearRampToValueAtTime(v: number) { p.value = v; },
      exponentialRampToValueAtTime(v: number) { p.value = v; },
      setTargetAtTime(v: number) { p.value = v; p.target = v; },
      cancelScheduledValues() {},
    };
    return p;
  };

  const makeNode = () => ({
    connect() { return this; },
    disconnect() {},
  });

  const ctx = {
    state: "running",
    currentTime: 10,
    sampleRate: 44100,
    destination: makeNode(),
    listener: {
      positionX: makeParam(0),
      positionY: makeParam(0),
      positionZ: makeParam(0),
      forwardX: makeParam(0),
      forwardY: makeParam(0),
      forwardZ: makeParam(-1),
      upX: makeParam(0),
      upY: makeParam(1),
      upZ: makeParam(0),
    },
    createGain() {
      return { ...makeNode(), gain: makeParam(1) };
    },
    createDynamicsCompressor() {
      return {
        ...makeNode(),
        threshold: makeParam(-8),
        knee: makeParam(10),
        ratio: makeParam(6),
        attack: makeParam(0.003),
        release: makeParam(0.15),
      };
    },
    createBiquadFilter() {
      const f = {
        ...makeNode(),
        type: "lowpass",
        frequency: makeParam(18000),
        Q: makeParam(0.7),
        gain: makeParam(0),
      };
      createdFilters.push(f);
      return f;
    },
    createWaveShaper() {
      return { ...makeNode(), curve: null, oversample: "2x" };
    },
    createConvolver() {
      return { ...makeNode(), buffer: null };
    },
    createAnalyser() {
      return {
        ...makeNode(),
        fftSize: 256,
        getFloatTimeDomainData(arr: Float32Array) { arr.fill(0.05); },
      };
    },
    createBuffer(_ch: number, len: number, sr: number) {
      const data = new Float32Array(len);
      return {
        sampleRate: sr,
        length: len,
        getChannelData() { return data; },
      };
    },
    createBufferSource() {
      return {
        ...makeNode(),
        buffer: null,
        loop: false,
        playbackRate: makeParam(1),
        start() {},
        stop() {},
      };
    },
    createOscillator() {
      const o = {
        ...makeNode(),
        type: "sine",
        frequency: makeParam(440),
        detune: makeParam(0),
        start() {},
        stop() {},
      };
      createdOscs.push(o);
      return o;
    },
    createStereoPanner() {
      return { ...makeNode(), pan: makeParam(0) };
    },
    createPanner() {
      const pan = {
        ...makeNode(),
        panningModel: "equalpower",
        distanceModel: "inverse",
        refDistance: 1,
        maxDistance: 24,
        rolloffFactor: 1,
        positionX: makeParam(0),
        positionY: makeParam(0),
        positionZ: makeParam(0),
      };
      createdPanners.push(pan);
      return pan;
    },
    resume() { return Promise.resolve(); },
    suspend() { return Promise.resolve(); },
    close() { return Promise.resolve(); },
  };

  return { ctx: ctx as unknown as AudioContext, createdPanners, createdFilters, createdOscs };
}

describe("Audio Posicional 3D HRTF, Susurros Sinteticos y Esfuerzo Fisico", () => {
  it("crea GhostVoice con espacializacion HRTF, aplica oclusion tras muros y escucha agudizada al esconderse", () => {
    const { ctx, createdPanners, createdFilters } = makeMockAudioContext();
    const S = new Synth(ctx);
    const filtersBefore = createdFilters.length;
    const voice = new GhostVoice(S, 0);

    // Debe haber creado un PannerNode en modo HRTF
    expect(createdPanners.length).toBeGreaterThanOrEqual(1);
    const ghostPan = createdPanners[createdPanners.length - 1];
    expect(ghostPan.panningModel).toBe("HRTF");

    // El filtro de oclusion dedicado es el primero creado por GhostVoice
    const occFilter = createdFilters[filtersBefore];
    expect(occFilter.type).toBe("lowpass");

    // Cuando el fantasma esta detras de un muro (occluded = true), la frecuencia de corte baja (~620 Hz)
    voice.update(0.1, {
      kind: 0, x: 6, y: 1.4, z: 4, mode: "chase",
      frozen: false, startled: false, silent: false, dist: 7,
      occluded: true, speed: 3.5, searching: false,
    }, 0.7, false);
    expect(occFilter.frequency.value).toBeLessThanOrEqual(700);

    // Cuando hay linea de vision directa (occluded = false), el filtro se abre (~14500 Hz)
    voice.update(0.1, {
      kind: 0, x: 4, y: 1.4, z: 2, mode: "chase",
      frozen: false, startled: false, silent: false, dist: 4.5,
      occluded: false, speed: 3.5, searching: false,
    }, 0.7, false);
    expect(occFilter.frequency.value).toBeGreaterThanOrEqual(12000);

    // Al estar escondido (hidden = true), el radio de escucha se amplifica hasta 22 u (a dist = 19 u sigue activo)
    voice.update(0.25, {
      kind: 0, x: 15, y: 1.4, z: 12, mode: "chase",
      frozen: false, startled: false, silent: false, dist: 19,
      occluded: true, speed: 3.2, searching: true,
    }, 0.65, true);
    // Fuera del escondite (hidden = false), a dist = 19 u (> 16 u) la voz se silencia
    voice.update(0.25, {
      kind: 0, x: 15, y: 1.4, z: 12, mode: "chase",
      frozen: false, startled: false, silent: false, dist: 19,
      occluded: true, speed: 3.2, searching: true,
    }, 0.65, false);
  });

  it("sintetiza ecos de voz (susurros formanticos) y pasos pesados sincronizados con la velocidad", () => {
    const { ctx, createdFilters, createdOscs } = makeMockAudioContext();
    const S = new Synth(ctx);
    const voice = new GhostVoice(S, 2);

    const filtersBefore = createdFilters.length;
    const oscsBefore = createdOscs.length;

    // Avanzar varios ciclos cortos con el jugador escondido y el fantasma buscando cerca para disparar pasos, jadeos y susurros
    for (let i = 0; i < 40; i++) {
      voice.update(0.25, {
        kind: 2, x: 2.5, y: 1.4, z: 2.0, mode: "chase",
        frozen: false, startled: false, silent: false, dist: 3.2,
        occluded: false, speed: 3.4, searching: true,
      }, 0.85, true);
    }

    expect(createdFilters.length).toBeGreaterThan(filtersBefore + 10);
    expect(createdOscs.length).toBeGreaterThan(oscsBefore + 4);
  });

  it("BreathEngine genera resonancia de cavidad mandibular y latido intracraneal al agotarse", () => {
    const { ctx, createdFilters, createdOscs } = makeMockAudioContext();
    const S = new Synth(ctx);
    const breath = new BreathEngine();

    const filtersBefore = createdFilters.length;
    const oscsBefore = createdOscs.length;

    // Simular varios frames en estado agotado (exhausted: true)
    for (let i = 0; i < 12; i++) {
      breath.update(S, 0.15, {
        exertion: 1.0,
        tension: 0.8,
        running: false,
        exhausted: true,
        hidden: false,
        hiddenNearGhost: false,
        holding: false,
      });
    }

    // Debe haber creado filtros bandpass para los formantes de la mandibula y oscilador sub-grave para el pulso en sien
    const jawBandpasses = createdFilters.slice(filtersBefore).filter((f) => f.type === "bandpass");
    expect(jawBandpasses.length).toBeGreaterThanOrEqual(3);
    expect(createdOscs.length).toBeGreaterThan(oscsBefore);
  });

  it("HorrorAudio.playExhausted amortigua el audio externo y dispara el latido ensordecedor", () => {
    const { ctx } = makeMockAudioContext();
    const audio = new HorrorAudio(() => ctx, true);
    audio.resume();
    const beforeNodes = audio.diag().nodes as number;
    audio.playExhausted();
    const afterNodes = audio.diag().nodes as number;
    expect(afterNodes).toBeGreaterThan(beforeNodes);
    const S = (audio as unknown as { S: Synth }).S;
    expect(S.ducked).toBe(true);
    expect(S.isMuffled).toBe(true);
  });

  it("aplica el uniforme uBlur de desenfoque radial y vision de tunel en postfx", () => {
    const fx = defaultFx();
    expect(fx.blur).toBe(0);
    const pass = makeFinalPass();
    fx.blur = 0.82;
    fx.vignette = 0.65;
    applyFx(pass, fx, 1280, 720);
    expect((pass.uniforms as Record<string, { value: unknown }>).uBlur.value).toBeCloseTo(0.82, 5);
  });

  it("HorrorAudio.playScreamerFlash dispara un impacto sonoro fuerte, momentaneo y con ducking inmediato", () => {
    const { ctx, createdOscs, createdFilters } = makeMockAudioContext();
    const audio = new HorrorAudio(() => ctx, true);
    audio.resume();
    const oscsBefore = createdOscs.length;
    const filtersBefore = createdFilters.length;

    audio.playScreamerFlash(1.1);

    const S = (audio as unknown as { S: Synth }).S;
    expect(S.ducked).toBe(true);
    // Verifica que se hayan lanzado los osciladores de sub-grave, formantes distorsionados y el cluster de tritono
    expect(createdOscs.length - oscsBefore).toBeGreaterThanOrEqual(8);
    expect(createdFilters.length - filtersBefore).toBeGreaterThanOrEqual(6);
  });

  it("buildPigmentPalette genera tonos de sangre coagulada, arterial y humeda para los decals de pared", () => {
    const pal = buildPigmentPalette("#7d0b0e");
    expect(pal.rgb).toEqual([125, 11, 14]);
    expect(pal.crust).toBe("rgb(53,4,4)");
    expect(pal.base).toBe("rgb(125,11,14)");
    expect(pal.wet).toBe("rgb(177,11,14)");
  });
});


// Pase final: gradacion de color, aberracion cromatica, grano, escaneo VHS, vinieta con pulso
// cardiaco, glitch y destellos. Todo controlado por uniformes que el motor actualiza por frame.

import * as THREE from "three";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";

export interface FxState {
  time: number;
  glitch: number; // 0..1.5
  aberration: number; // 0..1
  staticNoise: number; // 0..1
  flash: number; // 0..1 blanco
  flashColor: [number, number, number];
  pulse: number; // 0..1 vinieta que late
  vignette: number; // 0..1 oscurecimiento de bordes extra
  desaturate: number; // 0..1
  brightness: number;
  tint: [number, number, number];
  saturation: number;
  contrast: number;
  grain: number;
  blackout: number; // 0..1 fundido a negro
}

export const defaultFx = (): FxState => ({
  time: 0, glitch: 0, aberration: 0, staticNoise: 0, flash: 0, flashColor: [1, 1, 1], pulse: 0, vignette: 0,
  desaturate: 0, brightness: 1, tint: [1, 1, 1], saturation: 1, contrast: 1, grain: 0.06, blackout: 0,
});

const FinalShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uGlitch: { value: 0 },
    uAberration: { value: 0 },
    uStatic: { value: 0 },
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Vector3(1, 1, 1) },
    uPulse: { value: 0 },
    uVignette: { value: 0 },
    uDesat: { value: 0 },
    uBrightness: { value: 1 },
    uTint: { value: new THREE.Vector3(1, 1, 1) },
    uSat: { value: 1 },
    uContrast: { value: 1 },
    uGrain: { value: 0.06 },
    uBlackout: { value: 0 },
    uRes: { value: new THREE.Vector2(1280, 720) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uGlitch, uAberration, uStatic, uFlash, uPulse, uVignette, uDesat, uBrightness, uSat, uContrast, uGrain, uBlackout;
    uniform vec3 uFlashColor, uTint;
    uniform vec2 uRes;
    varying vec2 vUv;
    float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 cc = vUv - 0.5;
      float r2 = dot(cc, cc);
      vec2 uv = 0.5 + cc * (1.0 + 0.04 * r2 + uGlitch * 0.03 * r2);
      // desgarro horizontal por filas y bandas grandes
      float row = floor(uv.y * 200.0);
      float tear = (rand(vec2(row, floor(uTime * 14.0))) - 0.5) * 0.018 * uGlitch;
      float band = step(0.965, rand(vec2(floor(uv.y * 12.0), floor(uTime * 7.0)))) * uGlitch;
      uv.x += tear + band * 0.05 * (rand(vec2(floor(uTime * 9.0), 3.0)) - 0.5);
      vec2 dir = normalize(cc + vec2(1e-5));
      float ab = (0.0009 + uAberration * 0.007 + uGlitch * 0.004) * (0.3 + r2 * 5.0);
      vec3 col;
      col.r = texture2D(tDiffuse, uv + dir * ab).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - dir * ab).b;
      // gradacion
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(lum), col, uSat * (1.0 - uDesat));
      col = (col - 0.5) * uContrast + 0.5;
      col *= uTint * uBrightness;
      // grano y escaneo
      float n = rand(uv * uRes + uTime * 61.0);
      col += (n - 0.5) * (uGrain + uStatic * 0.55);
      float scan = sin(uv.y * uRes.y * 1.5707963) * 0.5 + 0.5;
      col *= 1.0 - 0.07 * scan * (0.35 + uGlitch * 0.5);
      // barra de interferencia que sube lentamente
      float bar = smoothstep(0.985, 1.0, sin(uv.y * 2.4 - uTime * 0.7));
      col += bar * 0.05 * (0.4 + uGlitch);
      // ruido de nieve (estatica)
      if (uStatic > 0.0) {
        float snow = rand(floor(uv * uRes * 0.5) + floor(uTime * 30.0));
        col = mix(col, vec3(snow), uStatic * 0.55);
      }
      // vineta con pulso cardiaco
      float vig = smoothstep(0.95, 0.2, length(cc) * (1.0 + uPulse * 0.25 + uVignette * 0.5));
      col *= 0.38 + 0.62 * vig;
      col = mix(col, col * vec3(1.0, 0.35, 0.3), uPulse * 0.35 * (1.0 - vig));
      col = mix(col, uFlashColor, uFlash);
      col *= 1.0 - uBlackout;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export function makeFinalPass(): ShaderPass {
  const p = new ShaderPass(FinalShader);
  return p;
}

export function applyFx(pass: ShaderPass, fx: FxState, width: number, height: number): void {
  const u = pass.uniforms as Record<string, { value: unknown }>;
  u.uTime.value = fx.time;
  u.uGlitch.value = fx.glitch;
  u.uAberration.value = fx.aberration;
  u.uStatic.value = fx.staticNoise;
  u.uFlash.value = fx.flash;
  (u.uFlashColor.value as THREE.Vector3).set(fx.flashColor[0], fx.flashColor[1], fx.flashColor[2]);
  u.uPulse.value = fx.pulse;
  u.uVignette.value = fx.vignette;
  u.uDesat.value = fx.desaturate;
  u.uBrightness.value = fx.brightness;
  (u.uTint.value as THREE.Vector3).set(fx.tint[0], fx.tint[1], fx.tint[2]);
  u.uSat.value = fx.saturation;
  u.uContrast.value = fx.contrast;
  u.uGrain.value = fx.grain;
  u.uBlackout.value = fx.blackout;
  (u.uRes.value as THREE.Vector2).set(width, height);
}

import * as THREE from "three";
import type { TexSet } from "../gfx/texkit";

export const sharedUniforms = {
  uTime: { value: 0 },
};

interface MacroOpts {
  scale?: number; // frecuencia espacial del ruido macro
  strength?: number; // 0..1
  vertical?: boolean; // incluye la altura (paredes)
  /** Detalle de alta frecuencia (0..1) que se desvanece con la distancia a la camara. */
  detail?: number;
}

/** Anade variacion de color de baja frecuencia en espacio mundo para disimular el tileado. */
export function addMacroVariation(mat: THREE.MeshStandardMaterial, opts: MacroOpts = {}): void {
  const scale = opts.scale ?? 0.16;
  const strength = opts.strength ?? 0.35;
  const vertical = opts.vertical ? "1" : "0";
  const detail = opts.detail ?? 0;
  // el detalle fino solo se ve de cerca: a distancia produce aliasing con el mipmap
  const detailBlock = detail > 0
    ? `{
        float mdist = distance(vMacroPos, cameraPosition);
        float nearK = 1.0 - smoothstep(3.0, 12.0, mdist);
        float dv = mNoise(mp * 6.3 + 3.0) * 0.6 + mNoise(mp * 14.7 + 17.0) * 0.4;
        diffuseColor.rgb *= 1.0 + (dv - 0.5) * ${(detail * 2).toFixed(3)} * nearK;
      }`
    : "";
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\nvarying vec3 vMacroPos;`)
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vec4 macroP = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          macroP = instanceMatrix * macroP;
        #endif
        vMacroPos = (modelMatrix * macroP).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vMacroPos;
        float mHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float mNoise(vec2 p){
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mHash(i), mHash(i + vec2(1.0, 0.0)), f.x), mix(mHash(i + vec2(0.0, 1.0)), mHash(i + vec2(1.0, 1.0)), f.x), f.y);
        }`,
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        {
          vec2 mp = ${vertical} == 1 ? vec2(vMacroPos.x + vMacroPos.z, vMacroPos.y * 0.6) : vMacroPos.xz;
          float mv = mNoise(mp * ${scale.toFixed(3)}) * 0.6 + mNoise(mp * ${(scale * 4.1).toFixed(3)} + 11.0) * 0.4;
          diffuseColor.rgb *= 1.0 - ${strength.toFixed(3)} + ${strength.toFixed(3)} * 2.0 * mv;
          ${detailBlock}
        }`,
      );
  };
  mat.customProgramCacheKey = () => `macro_${scale}_${strength}_${vertical}_${detail}`;
}

export function surfaceMaterial(
  t: TexSet,
  repeat: [number, number],
  extra: THREE.MeshStandardMaterialParameters = {},
  macro?: MacroOpts,
  normalScale = 1,
): THREE.MeshStandardMaterial {
  for (const tex of [t.map, t.normal, t.rough]) tex.repeat.set(repeat[0], repeat[1]);
  const m = new THREE.MeshStandardMaterial({
    map: t.map,
    normalMap: t.normal,
    normalScale: new THREE.Vector2(normalScale, normalScale),
    roughnessMap: t.rough,
    roughness: 1,
    metalness: 0,
    ...extra,
  });
  if (t.emissive) {
    m.emissiveMap = t.emissive;
    t.emissive.repeat.set(repeat[0], repeat[1]);
    if (!extra.emissive) m.emissive = new THREE.Color(0xffffff);
    if (extra.emissiveIntensity === undefined) m.emissiveIntensity = 1.2;
  }
  if (macro) addMacroVariation(m, macro);
  return m;
}

/** Material con tiempo compartido para animar vertices (puntos, pellets). */
export function withTime(mat: THREE.Material, vertexBody: string, key: string): void {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = sharedUniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\nuniform float uTime;`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${vertexBody}`);
  };
  mat.customProgramCacheKey = () => key;
}

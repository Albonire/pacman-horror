// Atenuacion de luces con radio de nucleo.
//
// La atenuacion fisica 1 / d^2 de three diverge al acercarse a una superficie: con la linterna a menos de
// un metro de un muro, la pared se quema (luz mil veces mas fuerte que a tres metros), el bloom la
// extiende por toda la pantalla y se ve un lavado amarillo plano. Sumar un radio de nucleo a la distancia
// mantiene la curva practicamente igual a media y larga distancia y la acota de cerca.
//
// Debe importarse antes de compilar el primer material (game.ts lo hace al cargarse).

import * as THREE from "three";

/** Distancia (u) que se suma a la distancia real a la luz antes de elevar al exponente de caida. */
export const LIGHT_CORE = 0.7;

let applied = false;

export function applyLightFalloffFix(): void {
  if (applied) return;
  const chunk = THREE.ShaderChunk.lights_pars_begin;
  const needle = "1.0 / max( pow( lightDistance, decayExponent ), 0.01 )";
  if (!chunk.includes(needle)) return; // otra version de three: se deja la atenuacion estandar
  THREE.ShaderChunk.lights_pars_begin = chunk.replace(
    needle,
    `1.0 / max( pow( lightDistance + ${LIGHT_CORE.toFixed(2)}, decayExponent ), 0.01 )`,
  );
  applied = true;
}

applyLightFalloffFix();

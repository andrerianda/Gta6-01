// Standing water along the kerbs. Rain runs off the road's crown into the gutters, so after rain
// a band of water lies along every kerb (and along a raised median's sides): narrow and broken in
// a shower, up to about 1.4 m wide and nearly continuous in a downpour. The band reads the
// asphalt's per-vertex kerb nearness (surfaceGeometryBuffer.js, KERB_NEARNESS_ATTRIBUTE: made by
// the street builder from the road's cross-section), its width wanders along the street with the
// weather's slow noise, and inside it the surface is the same rippled, glossy, dark water as the
// atmosphere's puddles (render/weather/wetSurface.js), so it mirrors the city sharply.
//
//   applyKerbPuddles(materials.asphalt);   // once, after the surface library made it wet
//
// It follows atmosphere.state.puddles (the uniforms of wetSurface.js), so it dries with them.

import { KERB_NEARNESS_ATTRIBUTE, KERB_REACH } from './surfaceGeometryBuffer.js';

/** Widest the gutter water gets (metres from the kerb) when the puddles are full. */
export const KERB_PUDDLE_WIDTH = 1.4;
/** Narrowest stretch of it at full puddles, metres (the noise picks between the two). */
const KERB_PUDDLE_MIN_WIDTH = 0.15;

const VERTEX_DECLARATION = `attribute float ${KERB_NEARNESS_ATTRIBUTE};\nvarying float vKerbNearness;`;
const VERTEX_BODY = `vKerbNearness = ${KERB_NEARNESS_ATTRIBUTE};`;
const FRAGMENT_DECLARATION = 'varying float vKerbNearness;';
// Runs after the wet surface's own film and puddles (its uniforms and varyings are in the shader).
const FRAGMENT_BODY = /* glsl */ `
#ifdef WET_PUDDLES
if (uPuddles > 0.001 && vKerbNearness > 0.001) {
  float kerbGap = (1.0 - vKerbNearness) * ${KERB_REACH.toFixed(2)};
  vec2 kerbPlace = vWetWorldPosition.xz;
  float kerbVary = texture2D(uWetNoise, kerbPlace * 0.047 + 0.53).r;
  kerbVary = smoothstep(0.25, 0.75, kerbVary);
  float kerbWidth = uPuddles * mix(${KERB_PUDDLE_MIN_WIDTH.toFixed(2)}, ${KERB_PUDDLE_WIDTH.toFixed(2)}, kerbVary);
  vec3 kerbUp = inverseTransformDirection(nonPerturbedNormal, viewMatrix);
  float kerbPuddle = (1.0 - smoothstep(kerbWidth * 0.55, kerbWidth, kerbGap)) * smoothstep(0.9, 0.985, kerbUp.y)
    * smoothstep(0.15, 0.5, uWetness);
  if (kerbPuddle > 0.001) {
    vec2 kerbSlope = (texture2D(uWetRipples, kerbPlace * 0.9 + uWetTime * vec2(0.05, 0.03)).rg - 0.5) * 0.03;
    kerbSlope += (texture2D(uWetRipples, kerbPlace * 2.6 + uWetTime * vec2(-0.31, 0.27)).ba - 0.5) * 0.3 * uWetRain;
    vec3 kerbWater = normalize((viewMatrix * vec4(-kerbSlope.x, 1.0, -kerbSlope.y, 0.0)).xyz);
    normal = normalize(mix(normal, kerbWater, kerbPuddle));
    roughnessFactor = mix(roughnessFactor, 0.02, kerbPuddle);
    diffuseColor.rgb *= mix(1.0, 0.45, kerbPuddle);
  }
}
#endif
`;

/**
 * Teaches the asphalt to hold water along its kerbs (once per material; it chains onto the
 * hooks the material already has, and needs applyWetSurface's puddles to be on it).
 * @param {import('three').MeshStandardMaterial} material
 * @returns {import('three').MeshStandardMaterial} The same material.
 */
export function applyKerbPuddles(material) {
  if (material.userData.marazulKerbPuddles) return material;
  material.userData.marazulKerbPuddles = true;
  const previousHook = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey;
  material.onBeforeCompile = function onBeforeCompile(shader, renderer) {
    if (previousHook) previousHook.call(this, shader, renderer);
    if (!shader.fragmentShader.includes('#include <lights_physical_fragment>') || !shader.fragmentShader.includes('uniform float uPuddles;')) return;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_DECLARATION}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${VERTEX_BODY}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAGMENT_DECLARATION}`)
      .replace('#include <lights_physical_fragment>', `${FRAGMENT_BODY}\n#include <lights_physical_fragment>`);
  };
  material.customProgramCacheKey = function customProgramCacheKey() {
    const base = previousKey ? previousKey.call(this) : '';
    return `${base}|kerbPuddles`;
  };
  material.needsUpdate = true;
  return material;
}

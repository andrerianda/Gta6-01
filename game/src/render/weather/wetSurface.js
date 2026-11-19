// Wet surfaces. Rain changes how the city's materials look: porous ones (asphalt, concrete, sand)
// go darker and more saturated, everything gets glossier, and on flat ground puddles form in the
// hollows and mirror the sky and the neon. This module gives other systems one call that teaches
// a three.js physically based material (MeshStandardMaterial or MeshPhysicalMaterial) to do that:
//
//   import { applyWetSurface } from '../render/weather/wetSurface.js';
//   applyWetSurface(asphaltMaterial, { porosity: 1, puddles: true });
//   applyWetSurface(carPaintMaterial, { porosity: 0 });          // only beads and gloss
//
// The amount of water comes from shared uniforms that the atmosphere facade updates every frame,
// so a patched material needs no further attention. A system that prefers its own shader can read
// the same numbers from `atmosphere.state.wetness` and `atmosphere.state.puddles`.

/**
 * The shared uniforms of every wet material. The atmosphere facade sets their values.
 * `uWetness` 0 dry to 1 soaked; `uPuddles` 0 none to 1 full; `uWetRain` the rain intensity (for
 * ripples in the puddles); `uWetTime` a clock in seconds; `uWetNoise` the shared tiling noise;
 * `uWetRipples` the tiling ripple slope map.
 */
export const WET_SURFACE_UNIFORMS = {
  uWetness: { value: 0 },
  uPuddles: { value: 0 },
  uWetRain: { value: 0 },
  uWetTime: { value: 0 },
  uWetNoise: { value: null },
  uWetRipples: { value: null },
};

const WET_VERTEX_DECLARATION = /* glsl */ `
varying vec3 vWetWorldPosition;
`;

const WET_VERTEX_BODY = /* glsl */ `
{
  vec4 wetLocal = vec4(transformed, 1.0);
  #ifdef USE_BATCHING
    wetLocal = batchingMatrix * wetLocal;
  #endif
  #ifdef USE_INSTANCING
    wetLocal = instanceMatrix * wetLocal;
  #endif
  vWetWorldPosition = (modelMatrix * wetLocal).xyz;
}
`;

const WET_FRAGMENT_DECLARATION = /* glsl */ `
varying vec3 vWetWorldPosition;
uniform float uWetness;
uniform float uPuddles;
uniform float uWetRain;
uniform float uWetTime;
uniform sampler2D uWetNoise;
uniform sampler2D uWetRipples;
`;

/** Runs after the material's own colour, roughness and normal are known, before lighting. */
const WET_FRAGMENT_BODY = /* glsl */ `
if (uWetness > 0.001) {
  vec3 wetWorldNormal = inverseTransformDirection(normal, viewMatrix);
  // Rain soaks what faces the sky; walls only get streaks of it.
  float wetFacing = smoothstep(-0.2, 0.7, wetWorldNormal.y);
  vec2 wetPlace = vWetWorldPosition.xz;
  float wetPatches = texture2D(uWetNoise, wetPlace * 0.021).r;
  float wetFilm = uWetness * mix(0.35, 1.0, wetFacing) * mix(0.75, 1.0, wetPatches);

  diffuseColor.rgb *= mix(1.0, WET_DARKENING, wetFilm * WET_POROSITY);
  roughnessFactor = mix(roughnessFactor, roughnessFactor * 0.3 + 0.045, wetFilm);

  #ifdef WET_PUDDLES
    // Standing water gathers in the low places, which a slow noise field stands in for.
    float wetHollow = wetPatches * 0.6 + texture2D(uWetNoise, wetPlace * 0.083 + 0.37).b * 0.4;
    float wetLevel = 1.0 - uPuddles * 0.7;
    float wetPuddle = smoothstep(wetLevel, wetLevel + 0.07, wetHollow) * smoothstep(0.9, 0.985, wetWorldNormal.y);
    if (wetPuddle > 0.001) {
      vec2 wetSlope = (texture2D(uWetRipples, wetPlace * 0.9 + uWetTime * vec2(0.05, 0.03)).rg - 0.5) * 0.03;
      wetSlope += (texture2D(uWetRipples, wetPlace * 2.6 + uWetTime * vec2(-0.31, 0.27)).ba - 0.5) * 0.3 * uWetRain;
      vec3 wetWaterNormal = normalize((viewMatrix * vec4(-wetSlope.x, 1.0, -wetSlope.y, 0.0)).xyz);
      normal = normalize(mix(normal, wetWaterNormal, wetPuddle));
      roughnessFactor = mix(roughnessFactor, 0.02, wetPuddle);
      diffuseColor.rgb *= mix(1.0, 0.45, wetPuddle);
    }
  #endif
}
`;

/**
 * Teaches a physically based three.js material to get wet. Safe to call once per material; an
 * existing onBeforeCompile hook keeps working.
 * @param {import('three').MeshStandardMaterial} material A MeshStandardMaterial or MeshPhysicalMaterial.
 * @param {Object} [options]
 * @param {number} [options.porosity] How much the material darkens when wet: 1 asphalt and
 *   concrete, 0.5 painted walls, 0 glass and car paint. Default 1.
 * @param {boolean} [options.puddles] Whether puddles may form on its upward faces. Default false.
 * @param {number} [options.darkening] Albedo multiplier of the fully soaked material. Default 0.5.
 * @returns {import('three').MeshStandardMaterial} The same material.
 */
export function applyWetSurface(material, options = {}) {
  if (material.userData.marazulWetSurface) return material;
  const porosity = options.porosity ?? 1;
  const puddles = options.puddles === true;
  const darkening = options.darkening ?? 0.5;
  material.userData.marazulWetSurface = { porosity, puddles, darkening };

  const previousHook = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey;
  material.onBeforeCompile = function onBeforeCompile(shader, renderer) {
    if (previousHook) previousHook.call(this, shader, renderer);
    if (!shader.fragmentShader.includes('#include <lights_physical_fragment>')) return;
    Object.assign(shader.uniforms, WET_SURFACE_UNIFORMS);
    const defines = [
      `#define WET_POROSITY ${porosity.toFixed(3)}`,
      `#define WET_DARKENING ${darkening.toFixed(3)}`,
      puddles ? '#define WET_PUDDLES' : '',
    ].join('\n');
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${WET_VERTEX_DECLARATION}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${WET_VERTEX_BODY}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${defines}\n${WET_FRAGMENT_DECLARATION}`)
      .replace('#include <lights_physical_fragment>', `${WET_FRAGMENT_BODY}\n#include <lights_physical_fragment>`);
  };
  material.customProgramCacheKey = function customProgramCacheKey() {
    const base = previousKey ? previousKey.call(this) : '';
    return `${base}|wet:${porosity.toFixed(3)}:${darkening.toFixed(3)}:${puddles ? 1 : 0}`;
  };
  material.needsUpdate = true;
  return material;
}

/**
 * The scalar wet look for systems with their own shaders: how much to darken an albedo and what
 * roughness to use, given the same inputs as the shader patch.
 * @param {number} wetness 0 dry to 1 soaked.
 * @param {number} roughness The dry roughness.
 * @param {number} [porosity] 0 to 1.
 * @returns {{albedoScale: number, roughness: number}}
 */
export function wetLookOf(wetness, roughness, porosity = 1) {
  return {
    albedoScale: 1 + (0.5 - 1) * wetness * porosity,
    roughness: roughness + (roughness * 0.3 + 0.045 - roughness) * wetness,
  };
}

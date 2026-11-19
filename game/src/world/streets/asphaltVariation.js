// Breaks up the tiling of the street asphalt: the painted tile is read twice (as painted, and a
// quarter turn round at a scale that never lines up with it), the two are mixed in patches a few
// metres across chosen by a noise of the world position, and a slower noise shifts the tone, so
// a long straight road no longer shows the same cracks and stains every eight metres. It chains
// onto any shader hook the material already has (the wet-surface look).
//
//   applyAsphaltVariation(materials.asphalt);

import * as THREE from 'three';

/** Mip bias of the asphalt's colour, relief and roughness reads: softens the aggregate's speckle. */
const ASPHALT_SOFTEN_BIAS = 1.2;
/** The asphalt's relief is scaled by this (the painted aggregate is deep for a road at speed). */
const ASPHALT_RELIEF = 0.6;
const VERTEX_DECLARATION = 'varying vec2 vAsphaltWorld;';
const VERTEX_BODY = 'vAsphaltWorld = (modelMatrix * vec4(transformed, 1.0)).xz;';
const FRAGMENT_DECLARATION = /* glsl */ `
varying vec2 vAsphaltWorld;
float asphaltHash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
float asphaltNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(asphaltHash(i), asphaltHash(i + vec2(1.0, 0.0)), f.x),
             mix(asphaltHash(i + vec2(0.0, 1.0)), asphaltHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
vec4 asphaltColour(vec2 uv) {
  float patchMix = smoothstep(0.32, 0.68, asphaltNoise(vAsphaltWorld * 0.13) * 0.7 + asphaltNoise(vAsphaltWorld * 0.41 + 5.7) * 0.3);
  vec4 painted = texture2D(map, uv, ASPHALT_SOFTEN);
  vec4 turned = texture2D(map, vec2(-uv.y, uv.x) * 0.83 + vec2(0.31, 0.57), ASPHALT_SOFTEN);
  vec4 colour = mix(painted, turned, patchMix);
  float tone = asphaltNoise(vAsphaltWorld * 0.018 + 7.3) * 0.65 + asphaltNoise(vAsphaltWorld * 0.07 + 3.1) * 0.35;
  colour.rgb *= mix(0.86, 1.1, tone);
  return colour;
}
`;

/**
 * Adds the anti-repeat to a surface-library material (once).
 * @param {THREE.MeshStandardMaterial} material A material with a colour map and UVs in metres.
 * @returns {THREE.MeshStandardMaterial} The same material.
 */
export function applyAsphaltVariation(material) {
  if (material.userData.marazulAsphaltVariation) return material;
  material.userData.marazulAsphaltVariation = true;
  const previousHook = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey;
  material.onBeforeCompile = function onBeforeCompile(shader, renderer) {
    if (previousHook) previousHook.call(this, shader, renderer);
    if (!shader.fragmentShader.includes('#include <map_fragment>')) return;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_DECLARATION}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERTEX_BODY}`);
    // The painted grain is finer than a pixel a few metres away and sparkled under coloured
    // lamps (police bars): colour, relief and roughness are read a mip level softer.
    shader.fragmentShader = `#define ASPHALT_SOFTEN ${ASPHALT_SOFTEN_BIAS.toFixed(2)}\n${shader.fragmentShader}`
      .replace('#include <map_pars_fragment>', `#include <map_pars_fragment>\n#ifdef USE_MAP\n${FRAGMENT_DECLARATION}\n#endif`)
      .replace('#include <map_fragment>', THREE.ShaderChunk.map_fragment.replace('texture2D( map, vMapUv )', 'asphaltColour( vMapUv )'))
      .replace('#include <normal_fragment_maps>', THREE.ShaderChunk.normal_fragment_maps.replace('texture2D( normalMap, vNormalMapUv )', 'texture2D( normalMap, vNormalMapUv, ASPHALT_SOFTEN )'))
      .replace('#include <roughnessmap_fragment>', THREE.ShaderChunk.roughnessmap_fragment.replace('texture2D( roughnessMap, vRoughnessMapUv )', 'texture2D( roughnessMap, vRoughnessMapUv, ASPHALT_SOFTEN )'));
  };
  material.normalScale.multiplyScalar(ASPHALT_RELIEF);
  material.customProgramCacheKey = function customProgramCacheKey() {
    const base = previousKey ? previousKey.call(this) : '';
    return `${base}|asphaltVariation2`;
  };
  material.needsUpdate = true;
  return material;
}

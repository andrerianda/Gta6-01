// The sky of MARAZUL: one dome drawn at the far plane behind everything, shading the scattered
// daylight, the horizon haze, the sun disc, the moon, the stars, the city's glow on the night
// horizon and the cloud deck. A second material with the same uniforms (minus the sun disc and the
// stars, which would only make speckles) is used when the sky is captured into the environment map.
//
//   const sky = createSkyDome(renderer);
//   scene.add(sky.mesh);
//   sky.uniforms.uSunDirection.value.copy(sunDirection);   // the facade fills the uniforms

import * as THREE from 'three';
import { CLOUD_DECK_GLSL } from './cloudDeck.js';
import { createTilingNoiseTexture } from './noiseTextures.js';
import {
  HAZE_COLOR_GLSL,
  SKY_SCATTERING_GLSL,
  SKY_UNIFORMS_GLSL,
  STAR_FIELD_GLSL,
} from './skyShaderChunks.js';

const SKY_VERTEX_SHADER = /* glsl */ `
varying vec3 vDirection;
void main() {
  vDirection = position;
  // Rotate with the camera but never translate: the dome is infinitely far away.
  vec4 clip = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
  #ifdef SKY_REVERSED_DEPTH
    gl_Position = vec4(clip.xy, 0.0, clip.w);
  #else
    gl_Position = clip.xyww;
  #endif
}
`;

const SKY_FRAGMENT_SHADER = /* glsl */ `
varying vec3 vDirection;
${SKY_UNIFORMS_GLSL}
uniform vec3 uSunDiscColor;       // radiance of the sun's disc
uniform vec3 uMoonDirection;
uniform float uMoonBrightness;
uniform float uStars;
uniform float uCityGlow;
uniform float uTime;
uniform vec3 uEnvGroundColor;     // radiance of the lit ground, for the environment capture
${HAZE_COLOR_GLSL}
${SKY_SCATTERING_GLSL}
${STAR_FIELD_GLSL}
${CLOUD_DECK_GLSL}

const float SUN_RADIUS = 0.0105;
const float MOON_RADIUS = 0.017;

void main() {
  vec3 v = normalize(vDirection);
  vec3 clearRadiance = skyRadiance(v);
  vec3 color = clearRadiance;
  float above = smoothstep(-0.002, 0.012, v.y);

  // Under a closed ceiling the blue is gone: what shows between cloud textures is more cloud.
  vec3 ceiling = uCloudAmbient * mix(0.85, 1.25, smoothstep(0.0, 0.6, v.y)) * mix(1.0, 0.45, uCloudDarkness);
  color = mix(color, mix(hazeColor(v), ceiling, smoothstep(0.0, 0.12, v.y)), uOvercast * above);

  // Warm light pollution standing over the city at night.
  color += uCityGlow * vec3(1.0, 0.6, 0.32) * 0.02 * exp(-max(v.y, 0.0) * 4.5) * above;

  #ifndef SKY_FOR_ENVIRONMENT
    float clearSky = 1.0 - uOvercast;
    if (uStars > 0.01 && v.y > 0.0) {
      float extinction = smoothstep(0.02, 0.35, v.y);
      color += vec3(0.85, 0.92, 1.0) * starField(v, uTime) * uStars * extinction * clearSky * 0.5;
    }

    // The moon shows only once the sky has darkened (blue hour to first light): under the sun its
    // disc would read as a flat grey ball in a bright sky.
    float moonShow = smoothstep(0.2, 0.55, uMoonBrightness);
    float moonCos = dot(v, uMoonDirection);
    if (moonShow > 0.0 && moonCos > 0.99 && uMoonDirection.y > -0.05) {
      vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), uMoonDirection));
      vec3 up = cross(uMoonDirection, right);
      vec2 p = vec2(dot(v, right), dot(v, up)) / MOON_RADIUS;
      float r2 = dot(p, p);
      float disc = 1.0 - smoothstep(0.88, 1.0, r2);
      vec3 normal = vec3(p, sqrt(max(1.0 - r2, 0.0)));
      float lit = clamp(dot(normal, normalize(vec3(0.42, 0.3, 0.86))), 0.0, 1.0);
      float maria = texture2D(uNoise, p * 0.17 + vec2(0.31, 0.62)).r;
      vec3 moon = vec3(0.92, 0.95, 1.0) * mix(0.5, 1.0, smoothstep(0.35, 0.62, maria)) * (0.08 + 0.92 * lit);
      color = mix(color, color * 0.3 + moon * 1.6 * uMoonBrightness, disc * above * moonShow);
      color += vec3(0.7, 0.8, 1.0) * uMoonBrightness * (0.05 * pow(moonCos, 900.0) + 0.012 * pow(moonCos, 120.0)) * above * moonShow;
    }

    float sunCos = dot(v, uSunDirection);
    float sunDisc = smoothstep(cos(SUN_RADIUS), cos(SUN_RADIUS * 0.82), sunCos);
    float limb = 0.72 + 0.28 * smoothstep(cos(SUN_RADIUS), 1.0, sunCos);
    float sunHorizon = smoothstep(-0.006, 0.02, v.y);
    color += uSunDiscColor * (sunDisc * limb + 0.012 * pow(max(sunCos, 0.0), 1400.0)) * sunHorizon;
  #endif

  vec4 clouds = cloudDeck(v, clearRadiance);
  color = mix(color, clouds.rgb, clouds.a);

  #ifdef SKY_FOR_ENVIRONMENT
    // The lower half of the environment is the lit ground, so that image-based lighting carries
    // the warm bounce from streets and sand into shadowed walls and car bodies.
    color = mix(uEnvGroundColor, color, smoothstep(-0.12, 0.015, v.y));
  #endif

  gl_FragColor = vec4(max(color, vec3(0.0)), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/**
 * Creates the uniforms of the sky. The haze uniforms (uSunDirection, uHorizonColor,
 * uHorizonSunColor) are shared by reference with the fog pass and the water.
 * @param {THREE.Texture} noiseTexture The shared tiling noise texture.
 * @returns {Record<string, {value: any}>}
 */
export function createSkyUniforms(noiseTexture) {
  return {
    uSunDirection: { value: new THREE.Vector3(0, 1, 0) },
    uKeyDirection: { value: new THREE.Vector3(0, 1, 0) },
    uHorizonColor: { value: new THREE.Color(0.56, 0.69, 0.84) },
    uHorizonSunColor: { value: new THREE.Color(0.66, 0.75, 0.86) },
    uHorizonHeight: { value: 0.16 },
    uSkyIntensity: { value: 1 },
    uZenithTint: { value: new THREE.Color(1, 1, 1) },
    uMie: { value: 0.6 },
    uSunDiscColor: { value: new THREE.Color(60, 56, 50) },
    uMoonDirection: { value: new THREE.Vector3(0, 1, 0) },
    uMoonBrightness: { value: 0 },
    uStars: { value: 0 },
    uCityGlow: { value: 0 },
    uTime: { value: 0 },
    uEnvGroundColor: { value: new THREE.Color(0.28, 0.25, 0.21) },
    uNoise: { value: noiseTexture },
    uCloudOffset: { value: new THREE.Vector4(0.13, 0.57, 0.31, 0.83) },
    uCloudCover: { value: 0.3 },
    uCloudDarkness: { value: 0 },
    uOvercast: { value: 0 },
    uCloudLight: { value: new THREE.Color(1.2, 1.15, 1.05) },
    uCloudAmbient: { value: new THREE.Color(0.3, 0.36, 0.48) },
    uFlash: { value: 0 },
    uFlashDirection: { value: new THREE.Vector3(1, 0.3, 0).normalize() },
  };
}

/** Radiance of the sun's disc for a white sun at full strength. */
const SUN_DISC_RADIANCE = 62;
const scratchColor = new THREE.Color();
const overcastColor = new THREE.Color();

/**
 * Writes the sky's uniforms for a frame: the look of the hour bent by the weather.
 * @param {Record<string, {value: any}>} uniforms The uniforms from createSkyUniforms().
 * @param {import('./atmosphereLooks.js').AtmosphereLook} look The look of the hour.
 * @param {import('../weather/weatherModel.js').WeatherValues} weatherValues The blended weather.
 * @param {{sunDirection: THREE.Vector3, moonDirection: THREE.Vector3, sunColor: THREE.Color,
 *   keyDirection: THREE.Vector3, keyColor: THREE.Color, keyIntensity: number,
 *   ambientGroundColor: THREE.Color}} state The lighting state of the frame.
 * @param {number} clearSun Fraction of direct sunlight the clouds let through.
 * @param {number} time Seconds, for the twinkling of stars.
 * @param {ArrayLike<number>} cloudOffset The four drift numbers of the cloud deck.
 * @param {number} flash Lightning brightness in scene radiance (0 without a stroke).
 * @param {{strikeAzimuth: number, strikeElevation: number}} lightning Where the stroke glows.
 */
export function writeSkyUniforms(uniforms, look, weatherValues, state, clearSun, time, cloudOffset, flash, lightning) {
  const w = weatherValues;
  // A closed ceiling takes its brightness from the hour and turns the horizon grey.
  const horizonLevel = 0.2126 * look.horizonColor[0] + 0.7152 * look.horizonColor[1] + 0.0722 * look.horizonColor[2];
  const ceilingLevel = horizonLevel * (0.95 - 0.5 * w.cloudDarkness);
  overcastColor.setRGB(ceilingLevel * 0.94, ceilingLevel * 0.98, ceilingLevel * 1.05);

  uniforms.uSunDirection.value.copy(state.sunDirection);
  uniforms.uMoonDirection.value.copy(state.moonDirection);
  // The air is lit by the sun until deep twilight, then by the moon.
  const moonSky = smoothstep(0.5, 0.95, look.stars);
  uniforms.uKeyDirection.value
    .copy(state.sunDirection)
    .setY(Math.max(state.sunDirection.y, -0.04))
    .lerp(state.moonDirection, moonSky)
    .normalize();
  uniforms.uHorizonColor.value.setRGB(look.horizonColor[0], look.horizonColor[1], look.horizonColor[2]).lerp(overcastColor, w.overcast);
  uniforms.uHorizonSunColor.value
    .setRGB(look.horizonSunColor[0], look.horizonSunColor[1], look.horizonSunColor[2])
    .lerp(scratchColor.copy(overcastColor).multiplyScalar(1.12), w.overcast);
  uniforms.uHorizonHeight.value = look.horizonHeight * (1 + 0.18 * (w.hazeScale - 1));
  uniforms.uSkyIntensity.value = look.skyIntensity;
  uniforms.uZenithTint.value.setRGB(look.zenithTint[0], look.zenithTint[1], look.zenithTint[2]);
  uniforms.uMie.value = look.mie * w.mieScale;
  uniforms.uSunDiscColor.value.copy(state.sunColor).multiplyScalar(SUN_DISC_RADIANCE * look.sunDisc * clearSun * clearSun);
  uniforms.uMoonBrightness.value = (0.1 + 0.9 * look.stars) * (1 - w.overcast);
  uniforms.uStars.value = look.stars;
  uniforms.uCityGlow.value = look.cityGlow;
  uniforms.uTime.value = time;
  uniforms.uCloudOffset.value.fromArray(cloudOffset);
  uniforms.uCloudCover.value = w.cloudCover;
  uniforms.uCloudDarkness.value = w.cloudDarkness;
  uniforms.uOvercast.value = w.overcast;
  uniforms.uFlash.value = flash;
  uniforms.uFlashDirection.value.set(
    Math.sin(lightning.strikeAzimuth) * Math.cos(lightning.strikeElevation),
    Math.sin(lightning.strikeElevation),
    -Math.cos(lightning.strikeAzimuth) * Math.cos(lightning.strikeElevation),
  );

  // A cloud face in the key light, and a cloud lit by the sky alone (or by the city at night).
  uniforms.uCloudLight.value.copy(state.keyColor).multiplyScalar(state.keyIntensity * 0.38);
  const ceilingLight = look.sunIntensity * 0.105 + look.moonIntensity * 0.03;
  const cloudAmbient = uniforms.uCloudAmbient.value;
  cloudAmbient.setRGB(look.ambientSky[0], look.ambientSky[1], look.ambientSky[2]).multiplyScalar(look.skyIntensity * 0.42);
  cloudAmbient.r += uniforms.uHorizonColor.value.r * 0.22;
  cloudAmbient.g += uniforms.uHorizonColor.value.g * 0.22;
  cloudAmbient.b += uniforms.uHorizonColor.value.b * 0.22;
  cloudAmbient.lerp(scratchColor.setRGB(0.88, 0.92, 1.0).multiplyScalar(ceilingLight), w.overcast);
  cloudAmbient.r += look.cityGlow * 0.012;
  cloudAmbient.g += look.cityGlow * 0.008;
  cloudAmbient.b += look.cityGlow * 0.006;

  // The lit ground, for the lower half of the environment map.
  const groundLight = 0.07 * state.keyIntensity * Math.max(state.keyDirection.y, 0.05) + 0.3 * horizonLevel;
  uniforms.uEnvGroundColor.value.copy(state.ambientGroundColor).multiplyScalar(groundLight);
}

function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Creates the sky dome.
 * @param {THREE.WebGLRenderer} renderer Used to learn the depth-buffer convention.
 * @param {THREE.Texture} [noiseTexture] The shared tiling noise; made here when omitted.
 * @returns {{
 *   mesh: THREE.Mesh,
 *   environmentMesh: THREE.Mesh,
 *   uniforms: Record<string, {value: any}>,
 *   noiseTexture: THREE.Texture,
 *   dispose: () => void,
 * }} `mesh` goes into the game scene; `environmentMesh` (same geometry, simplified shading) into
 *   the small scene the environment map is captured from.
 */
export function createSkyDome(renderer, noiseTexture = createTilingNoiseTexture()) {
  const uniforms = createSkyUniforms(noiseTexture);
  const reversedDepth = renderer.capabilities.reversedDepthBuffer === true;
  const geometry = new THREE.IcosahedronGeometry(1, 4);

  const makeMaterial = (forEnvironment) => {
    const defines = {};
    if (reversedDepth) defines.SKY_REVERSED_DEPTH = 1;
    if (forEnvironment) defines.SKY_FOR_ENVIRONMENT = 1;
    return new THREE.ShaderMaterial({
      name: forEnvironment ? 'marazul-sky-environment' : 'marazul-sky',
      uniforms,
      defines,
      vertexShader: SKY_VERTEX_SHADER,
      fragmentShader: SKY_FRAGMENT_SHADER,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: true,
      depthFunc: THREE.LessEqualDepth,
      fog: false,
    });
  };

  const mesh = new THREE.Mesh(geometry, makeMaterial(false));
  mesh.name = 'marazul-sky-dome';
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.matrixAutoUpdate = false;
  // Drawn after every other opaque object, so that pixels hidden by the city are never shaded.
  mesh.renderOrder = 100000;

  const environmentMesh = new THREE.Mesh(geometry, makeMaterial(true));
  environmentMesh.name = 'marazul-sky-dome-environment';
  environmentMesh.frustumCulled = false;
  environmentMesh.matrixAutoUpdate = false;

  function dispose() {
    geometry.dispose();
    mesh.material.dispose();
    environmentMesh.material.dispose();
  }

  return { mesh, environmentMesh, uniforms, noiseTexture, dispose };
}

// The environment state the atmosphere publishes for other systems, and the step that derives its
// lighting part from the clock: where the sun and moon stand, which of them is the key light,
// how strong and what colour it is after the weather, how much of a night it is.

import * as THREE from 'three';
import {
  computeMoonDirection,
  computeMoonLightDirection,
  computeSunDirection,
} from '../sky/celestialPositions.js';

/**
 * @typedef {Object} AtmosphereState The environment as other systems may read it. Updated in
 *   place by the atmosphere's update(); never replace or modify its objects.
 * @property {number} timeOfDay Clock hours, 0 to 24.
 * @property {string} lookName The nearest named look ('golden hour', 'night', ...).
 * @property {THREE.Vector3} sunDirection Unit vector toward the sun (below the horizon at night).
 * @property {number} sunElevation Radians above the horizon.
 * @property {THREE.Vector3} moonDirection Unit vector toward the moon.
 * @property {THREE.Vector3} keyDirection Unit vector toward the light that casts the shadows now.
 * @property {THREE.Color} keyColor Its colour.
 * @property {number} keyIntensity Its intensity (three.js directional light units).
 * @property {boolean} keyIsSun False when the moon is the key.
 * @property {THREE.Color} sunColor The sun's light colour (meaningful while sunIntensity > 0).
 * @property {number} sunIntensity The sun's light on surfaces after cloud occlusion; 0 at night.
 * @property {THREE.Color} ambientSkyColor Fill light from above.
 * @property {THREE.Color} ambientGroundColor Fill light from below.
 * @property {number} ambientIntensity Strength of the fill.
 * @property {number} nightFactor 0 by day to 1 at night; lamps, windows and neon follow it.
 * @property {number} exposure The exposure the picture is developed with.
 * @property {THREE.Color} fogColor Haze colour away from the sun.
 * @property {THREE.Color} fogSunColor Haze colour toward the sun.
 * @property {number} fogDensity Haze extinction per metre at sea level.
 * @property {number} fogHeight Scale height of the haze in metres.
 * @property {number} wetness 0 dry to 1 soaked.
 * @property {number} puddles 0 none to 1 full.
 * @property {number} rain Rain intensity now, 0 to 1.
 * @property {THREE.Vector3} wind Wind velocity in metres per second (y is 0).
 * @property {number} windSpeed
 * @property {number} windGust 0 lull to 1 gust.
 * @property {number} windTime The wind's clock, seconds, for sway shaders.
 * @property {number} cloudCover 0 to 1.
 * @property {number} overcast 0 to 1.
 * @property {number} lightningFlash 0, or up to about 1 during a stroke.
 * @property {string} weather The weather state being approached.
 * @property {number} waveScale Multiplier on the sea's wave heights.
 */

/** The key light never shines from lower than this: shadows would be endless. */
const KEY_MIN_ELEVATION = Math.sin((4.5 * Math.PI) / 180);

const moonLight = new THREE.Vector3();
const overcastTint = new THREE.Color(0.92, 0.95, 1.0);

/**
 * Creates the state object.
 * @param {Record<string, {value: any}>} skyUniforms The sky's uniforms; the fog colours are the
 *   very colours the sky and the haze are drawn with.
 * @param {number} timeOfDay The starting clock time.
 * @param {string} weatherName The starting weather.
 * @returns {AtmosphereState}
 */
export function createAtmosphereState(skyUniforms, timeOfDay, weatherName) {
  return {
    timeOfDay,
    lookName: 'golden hour',
    sunDirection: new THREE.Vector3(0, 1, 0),
    sunElevation: 0,
    moonDirection: new THREE.Vector3(0, 1, 0),
    keyDirection: new THREE.Vector3(0, 1, 0),
    keyColor: new THREE.Color(1, 1, 1),
    keyIntensity: 0,
    keyIsSun: true,
    sunColor: new THREE.Color(1, 1, 1),
    sunIntensity: 0,
    ambientSkyColor: new THREE.Color(1, 1, 1),
    ambientGroundColor: new THREE.Color(1, 1, 1),
    ambientIntensity: 0.4,
    nightFactor: 0,
    exposure: 1,
    fogColor: skyUniforms.uHorizonColor.value,
    fogSunColor: skyUniforms.uHorizonSunColor.value,
    fogDensity: 0.0004,
    fogHeight: 260,
    wetness: 0,
    puddles: 0,
    rain: 0,
    wind: new THREE.Vector3(),
    windSpeed: 0,
    windGust: 0,
    windTime: 0,
    cloudCover: 0.3,
    overcast: 0,
    lightningFlash: 0,
    weather: weatherName,
    waveScale: 1,
  };
}

/**
 * Writes the celestial and key-light part of the state for the current clock time.
 * @param {AtmosphereState} state The state; `state.timeOfDay` is read.
 * @param {import('../sky/atmosphereLooks.js').AtmosphereLook} look The look of the hour.
 * @param {import('../weather/weatherModel.js').WeatherValues} weatherValues The blended weather.
 * @returns {number} How much direct sunlight the clouds let through, 0 to 1.
 */
export function resolveKeyLight(state, look, weatherValues) {
  const hours = state.timeOfDay;
  computeSunDirection(hours, state.sunDirection);
  computeMoonDirection(hours, state.moonDirection);
  state.sunElevation = Math.asin(state.sunDirection.y);

  const clearSun = 1 - 0.97 * weatherValues.sunOcclusion;
  const sunLight = look.sunIntensity * clearSun;
  const moonUp = smoothstep(-0.05, 0.12, state.moonDirection.y);
  const moonLightLevel = look.moonIntensity * moonUp * (1 - 0.85 * weatherValues.sunOcclusion);
  // One key at a time. Near dawn both are faint; the weaker one is subtracted so that the
  // hand-over passes through zero and the shadows never jump.
  state.keyIsSun = sunLight >= moonLightLevel;
  state.keyIntensity = Math.abs(sunLight - moonLightLevel);
  state.sunColor.setRGB(look.sunColor[0], look.sunColor[1], look.sunColor[2]);
  state.sunIntensity = state.keyIsSun ? state.keyIntensity : 0;
  if (state.keyIsSun) {
    state.keyDirection.copy(state.sunDirection);
    state.keyColor.copy(state.sunColor);
  } else {
    computeMoonLightDirection(hours, moonLight);
    state.keyDirection.copy(moonLight);
    state.keyColor.setRGB(0.62, 0.74, 1.0);
  }
  if (state.keyDirection.y < KEY_MIN_ELEVATION) {
    state.keyDirection.y = KEY_MIN_ELEVATION;
    state.keyDirection.normalize();
  }
  // Under thin cloud the sun loses its colour as well as its strength.
  state.keyColor.lerp(overcastTint, weatherValues.overcast * 0.6);

  // Night falls with the sun (from 3 degrees above to 6 below the horizon), and storm clouds
  // bring the lamps on by day.
  const solarNight = smoothstep(0.052, -0.105, state.sunDirection.y);
  state.nightFactor = solarNight + weatherValues.cloudDarkness * 0.8 * (1 - solarNight);
  // Grey weather opens the exposure by day only: at night it would flood the street with lamp
  // light (the night is already exposed up for its lamps and neon).
  state.exposure = look.exposure * (1 + (weatherValues.exposureScale - 1) * (1 - solarNight));
  return clearSun;
}

function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

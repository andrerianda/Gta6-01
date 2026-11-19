// How the Norvast island shows from far away. Pure maths with no three.js and no DOM, so it runs
// in Node (tools/tests/island/).
//
// The frame's haze pass (render/postfx/atmosphereResolvePass.js) fades everything by the optical
// depth of the city's ground haze. At dawn that haze is dense (0.0008 per metre): seen from 400 m
// up, an island 8 km out keeps 4 % of its contrast and one 10 km out under 2 %, so the island
// only came out of the haze inside two kilometres. The air over the open sea is clearer than the
// haze that lies on the coast, and that is what this file models, for the island only: beyond
// FAR_VIEW.nearDistance the optical depth toward the island grows FAR_VIEW.slowdown times as fast
// as the city's haze does.
//
// The haze pass itself is left alone. The island's far shape is drawn as a stand-in pulled toward
// the camera along the line of sight and shrunk by the same factor (the "nearness"): it covers
// exactly the pixels of the island, and the depth it writes makes the haze pass give it the
// optical depth wanted here. At nearDistance the nearness is 1, the stand-in coincides with the
// island and has faded out over the real terrain, so nothing changes hands at a visible step.

import { hazeOpticalDepth, smoothstep } from '../../render/sea/seaHorizonMaths.js';

export const FAR_VIEW = Object.freeze({
  /** Up to this distance (metres) the island gets the frame's own haze and nothing else. */
  nearDistance: 2600,
  /** From this distance on the stand-in is fully opaque (between the two it fades over the terrain). */
  fullDistance: 4600,
  /** Beyond nearDistance the optical depth grows this share as fast as the city haze's. */
  slowdown: 0.3,
  /**
   * The stand-in's own colour, as a share of the horizon haze colour of the hour: a blue-grey
   * darker than the haze. Measured at dawn, the real terrain 2.7 km away is about this dark
   * against the haze, so the shape hands over to it without a step.
   */
  shade: 0.2,
  /** The height on the island (metres) the nearness is solved for. */
  referenceHeight: 50,
});

/**
 * The optical depth the island is shown through, at sea level.
 * @param {number} distance Horizontal metres from the camera to the island.
 * @param {number} cameraHeight Camera height, metres.
 * @param {number} density Haze extinction per metre at sea level (AtmosphereState.fogDensity).
 * @param {number} hazeHeight Scale height of the haze, metres (AtmosphereState.fogHeight).
 * @returns {number} The frame's own optical depth up to FAR_VIEW.nearDistance; slower growth beyond.
 */
export function farViewOpticalDepth(distance, cameraHeight, density, hazeHeight) {
  const d = Math.max(0, distance);
  const real = hazeOpticalDepth(d, cameraHeight, 0, density, hazeHeight);
  if (d <= FAR_VIEW.nearDistance) return real;
  const atNear = hazeOpticalDepth(FAR_VIEW.nearDistance, cameraHeight, 0, density, hazeHeight);
  return atNear + (real - atNear) * FAR_VIEW.slowdown;
}

/**
 * How opaque the stand-in is over the real terrain: 0 up to nearDistance, 1 from fullDistance.
 * @param {number} distance Horizontal metres from the camera to the island.
 */
export function farViewBlend(distance) {
  return smoothstep(FAR_VIEW.nearDistance, FAR_VIEW.fullDistance, distance);
}

/**
 * The factor (0..1] by which the stand-in is pulled toward the camera and shrunk, so that the
 * haze pass fades it by farViewOpticalDepth(). Exactly 1 up to nearDistance.
 * @param {number} distance Horizontal metres from the camera to the island.
 * @param {number} cameraHeight Camera height, metres.
 * @param {number} density Haze extinction per metre at sea level.
 * @param {number} hazeHeight Scale height of the haze, metres.
 */
export function farViewNearness(distance, cameraHeight, density, hazeHeight) {
  if (!(distance > FAR_VIEW.nearDistance) || !(density > 0)) return 1;
  const wanted = farViewOpticalDepth(distance, cameraHeight, density, hazeHeight);
  const depthAt = (k) => hazeOpticalDepth(
    k * distance, cameraHeight, cameraHeight + (FAR_VIEW.referenceHeight - cameraHeight) * k, density, hazeHeight,
  );
  // The reference point is a little above the sea: the wanted depth is scaled to it.
  const whole = depthAt(1);
  const target = wanted * (whole / hazeOpticalDepth(distance, cameraHeight, 0, density, hazeHeight));
  if (!(target < whole)) return 1;
  let low = 0, high = 1;
  for (let i = 0; i < 26; i += 1) {
    const middle = (low + high) / 2;
    if (depthAt(middle) < target) low = middle; else high = middle;
  }
  return (low + high) / 2;
}

/**
 * The contrast of the stand-in against the horizon haze behind it, 0..1: how much darker than the
 * haze it is drawn (before the fade at the far end of its range).
 * @param {number} distance Horizontal metres from the camera to the island.
 * @param {number} cameraHeight Camera height, metres.
 * @param {number} density Haze extinction per metre at sea level.
 * @param {number} hazeHeight Scale height of the haze, metres.
 */
export function farViewContrast(distance, cameraHeight, density, hazeHeight) {
  return (1 - FAR_VIEW.shade) * Math.exp(-farViewOpticalDepth(distance, cameraHeight, density, hazeHeight));
}

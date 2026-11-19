// How the Norvast island shows from far away. Pure maths with no three.js and no DOM, so it runs
// in Node (tools/tests/island/).
//
// The frame's haze pass (render/postfx/atmosphereResolvePass.js) fades everything by the optical
// depth of the city's ground haze. At dawn that haze is dense (0.0008 per metre): seen from 400 m
// up, an island 8 km out keeps 6 % of its contrast, and even two kilometres out the real terrain
// was a pale mound (measured on the screen: 6 % darker than the sea at 8 km, 13 % at 2 km, and a
// third of that from 150 m up). The air over the open sea is clearer than the haze that lies on
// the coast, and that is what this file models, for the island only: beyond FAR_VIEW.nearDistance
// the optical depth toward the island grows FAR_VIEW.slowdown times as fast as the city's haze
// does, all the way in to the landing.
//
// The haze pass itself is left alone. A stand-in of the island's shape is pulled toward the camera
// along the line of sight and shrunk by the same factor (the "nearness"): it covers exactly the
// pixels of the island, and the depth it writes makes the haze pass give those pixels the optical
// depth wanted here. Far out the stand-in also carries the island's colour (a dark blue-grey
// shape); from FAR_VIEW.colourFull in to FAR_VIEW.colourNear that colour fades away over the real
// terrain, and nearer still the stand-in draws no colour at all and only writes its depth: a lens
// of clearer air over the real island. At nearDistance the nearness is 1 and the lens coincides
// with the island, so nothing changes hands at a visible step anywhere.

import { hazeOpticalDepth, smoothstep } from '../../render/sea/seaHorizonMaths.js';

export const FAR_VIEW = Object.freeze({
  /** Up to this distance (metres) the island gets the frame's own haze and nothing else. */
  nearDistance: 600,
  /** Up to this distance the stand-in draws no colour (the real terrain shows, through the lens). */
  colourNear: 2600,
  /** From this distance on the stand-in's colour is fully opaque (it must be before the zone unloads). */
  colourFull: 4600,
  /** The same distance under its first name (the zone and older callers read it). */
  fullDistance: 4600,
  /** Beyond nearDistance the optical depth grows this share as fast as the city haze's. */
  slowdown: 0.17,
  /**
   * The stand-in's own colour, as a share of the horizon haze colour of the hour: a blue-grey
   * darker than the haze, about what the island's unlit rock comes to at dawn.
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
 * How opaque the stand-in's colour is over the real terrain: 0 up to colourNear, 1 from colourFull.
 * @param {number} distance Horizontal metres from the camera to the island.
 */
export function farViewBlend(distance) {
  return smoothstep(FAR_VIEW.colourNear, FAR_VIEW.colourFull, distance);
}

/**
 * Whether the stand-in is drawn as the lens of clearer air (it writes depth whatever its colour's
 * opacity): everywhere beyond nearDistance.
 * @param {number} distance Horizontal metres from the camera to the island.
 */
export function farViewLens(distance) {
  return distance > FAR_VIEW.nearDistance;
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
 * haze it is drawn, in scene radiance (the tone curve leaves about 0.4 of it on the screen in the
 * bright dawn haze).
 * @param {number} distance Horizontal metres from the camera to the island.
 * @param {number} cameraHeight Camera height, metres.
 * @param {number} density Haze extinction per metre at sea level.
 * @param {number} hazeHeight Scale height of the haze, metres.
 */
export function farViewContrast(distance, cameraHeight, density, hazeHeight) {
  return (1 - FAR_VIEW.shade) * Math.exp(-farViewOpticalDepth(distance, cameraHeight, density, hazeHeight));
}

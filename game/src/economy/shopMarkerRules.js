// When and where the shop and property markers are drawn. Pure, so Node can test it.
// - Shown only in free play (state 'playing'): never over a cutscene, a menu, the map, a result
//   banner or the busted/wasted slow motion (QA bug 4: shells over the m01 intro's parked cars),
//   and never in a ?shot= still scene unless that scene asks for them (the economy's own scenes).
// - Drawn off parked cars and people: the marker slides along the frontage or toward the door
//   with the missions' startMarkerSpot; the walk-in trigger answers at both the place and the
//   drawn spot, so the lead walks into what he sees.
import { startMarkerSpot } from '../missions/startMarkerSpot.js';

/** The drawn marker: a modest ground ring with a low glow, well inside the walk-in distance. */
export const SHOP_MARKER_SHAPE = Object.freeze({ radius: 0.85, ringInner: 0.68, height: 1.1, glow: 0.2, pulse: 0.05, ring: 0.6 });

/**
 * Whether the markers are drawn now.
 * @param {{state: string, shot?: string | null, shotAsks?: boolean}} now
 *   state: the game state; shot: the ?shot= scene name, if any; shotAsks: the scene asked for them.
 */
export function shopMarkersShown({ state, shot = null, shotAsks = false }) {
  if (state !== 'playing') return false;
  return !shot || Boolean(shotAsks);
}

/**
 * Where a place's marker is drawn: the place itself when clear, else the clearest spot near it.
 * @param {{x: number, z: number, frontX?: number, frontZ?: number, doorX?: number, doorZ?: number}} place
 * @param {{x: number, z: number, heading?: number, halfLength?: number, halfWidth?: number}[]} cars
 * @param {{x: number, z: number, radius?: number}[]} people Not the lead.
 * @param {number} [radius]
 * @returns {{x: number, z: number}}
 */
export function shopMarkerSpot(place, cars, people, radius = SHOP_MARKER_SHAPE.radius) {
  return startMarkerSpot(place, cars, people, radius);
}

/**
 * Whether the lead stands in a place: near the place itself or near its drawn marker.
 * @param {{x: number, z: number, spotX?: number, spotZ?: number}} place
 * @param {{x: number, z: number}} lead
 * @param {number} reach Metres.
 */
export function standsIn(place, lead, reach) {
  if (Math.hypot(place.x - lead.x, place.z - lead.z) < reach) return true;
  return Number.isFinite(place.spotX) && Math.hypot(place.spotX - lead.x, place.spotZ - lead.z) < reach;
}

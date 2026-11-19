// Tells the game when the camera's subject arrives at a landmark (plan.landmarks: shops, bars,
// garages, lookouts ...) or a hilltop vantage point (plan.vantagePoints): LANDMARK_REACHED
// { landmarkId, districtId, kind } once on arrival, again only after leaving and coming back.
// It checks a few times a second, against a grid of places, with no allocation.
//
//   const arrivals = createLandmarkArrivals(plan, events);
//   arrivals.update(focusX, focusZ, simulationSeconds);

import { GAME_EVENTS } from '../core/events/gameEvents.js';

/** Arrival radius at a landmark's front door or a vantage point, metres. */
const ARRIVAL_RADIUS = 12;
/** Leaving: the subject must be this far away before the place can be reached again, metres. */
const LEAVE_RADIUS = 30;
/** Seconds between checks. */
const CHECK_INTERVAL = 0.25;
/** Size of the lookup grid's cells, metres. */
const CELL = 64;

/**
 * @param {{landmarks?: Object[], vantagePoints?: Object[], districtAt?: (x: number, z: number) => string}} plan
 * @param {{emit: (name: string, payload: Object) => void}} events
 */
export function createLandmarkArrivals(plan, events) {
  /** @type {{id: string, kind: string, district: string, x: number, z: number, inside: boolean}[]} */
  const places = [];
  for (const landmark of plan.landmarks ?? []) {
    const x = landmark.frontX ?? landmark.entrance?.x ?? landmark.x;
    const z = landmark.frontZ ?? landmark.entrance?.z ?? landmark.z;
    if (Number.isFinite(x) && Number.isFinite(z)) places.push({ id: landmark.id, kind: landmark.kind, district: landmark.district, x, z, inside: false });
  }
  for (const vantage of plan.vantagePoints ?? []) {
    if (places.some((place) => place.id === vantage.id)) continue;
    places.push({ id: vantage.id, kind: 'lookout', district: plan.districtAt?.(vantage.x, vantage.z) ?? null, x: vantage.x, z: vantage.z, inside: false });
  }
  /** Places by grid cell key; a place is listed in every cell its leave radius touches. */
  const cells = new Map();
  for (const place of places) {
    for (let cx = Math.floor((place.x - LEAVE_RADIUS) / CELL); cx <= Math.floor((place.x + LEAVE_RADIUS) / CELL); cx += 1) {
      for (let cz = Math.floor((place.z - LEAVE_RADIUS) / CELL); cz <= Math.floor((place.z + LEAVE_RADIUS) / CELL); cz += 1) {
        const key = cx * 100003 + cz;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(place);
      }
    }
  }
  /** Places the subject is inside of, to release when it has moved on. */
  const inside = new Set();
  let nextCheck = 0;

  return {
    places,
    /**
     * Checks the subject's position (a few times a second).
     * @param {number} x
     * @param {number} z
     * @param {number} seconds A clock in seconds (simulation time).
     */
    update(x, z, seconds) {
      if (seconds < nextCheck && seconds >= nextCheck - CHECK_INTERVAL * 4) return;
      nextCheck = seconds + CHECK_INTERVAL;
      for (const place of inside) {
        if (Math.hypot(place.x - x, place.z - z) > LEAVE_RADIUS) {
          place.inside = false;
          inside.delete(place);
        }
      }
      const near = cells.get(Math.floor(x / CELL) * 100003 + Math.floor(z / CELL));
      if (!near) return;
      for (let i = 0; i < near.length; i += 1) {
        const place = near[i];
        if (place.inside || Math.hypot(place.x - x, place.z - z) > ARRIVAL_RADIUS) continue;
        place.inside = true;
        inside.add(place);
        events.emit(GAME_EVENTS.LANDMARK_REACHED, { landmarkId: place.id, districtId: place.district, kind: place.kind });
      }
    },
  };
}

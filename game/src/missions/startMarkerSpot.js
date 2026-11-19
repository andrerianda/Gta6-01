// Where a mission's start marker is drawn: the shell of light goes on the clear pavement by the
// start point, not over a parked car or the giver and the locals (QA bug 4: shells 4-5 m wide
// stood over parked cars and people, tinting them). The trigger stays at the start point; only
// the drawn marker slides along the frontage or toward the door, at most a few metres. Pure.

/** Offsets tried along the frontage (metres), nearest first. */
const ALONG = [0, 1.2, -1.2, 2.4, -2.4, 3.4, -3.4];
/** Offsets tried toward the door (metres). */
const INWARD = [0, 0.7, 1.4];
/** Space kept between the shell's rim and a car's body or a person. */
const MARGIN = 0.35;
/** Nearest the marker's centre comes to the door. */
const DOOR_GAP = 1.2;

/**
 * The spot for a start marker.
 * @param {{x: number, z: number, frontX?: number, frontZ?: number, doorX?: number, doorZ?: number}} point
 *   The mission's start (a missionWorld place: frontX/frontZ point out of the door).
 * @param {{x: number, z: number, heading?: number, halfLength?: number, halfWidth?: number}[]} cars
 *   Vehicles near it (entity heading: forward is (sin h, cos h)).
 * @param {{x: number, z: number, radius?: number}[]} people People to keep the shell off.
 * @param {number} radius The marker's radius.
 * @returns {{x: number, z: number}} The clearest spot (the start point itself when it is clear).
 */
export function startMarkerSpot(point, cars, people, radius) {
  const fx = point.frontX ?? 0, fz = point.frontZ ?? 1;
  const sx = fz, sz = -fx;                                  // along the frontage
  const out = Number.isFinite(point.doorX) ? (point.x - point.doorX) * fx + (point.z - point.doorZ) * fz : Infinity;
  let best = { x: point.x, z: point.z }, bestCost = Infinity;
  for (const inward of INWARD) {
    if (inward > 0 && out - inward < DOOR_GAP) break;
    for (const along of ALONG) {
      const x = point.x + sx * along - fx * inward, z = point.z + sz * along - fz * inward;
      const cost = overlap(x, z, cars, people, radius);
      if (cost === 0) return { x, z };
      // A little dearer the further it moves, so a tie keeps the marker near its start.
      const total = cost + (Math.abs(along) + inward) * 0.01;
      if (total < bestCost) { bestCost = total; best = { x, z }; }
    }
  }
  return best;
}

/** How deep a shell of this radius at x, z cuts into the cars and people (0 when clear). */
export function overlap(x, z, cars, people, radius) {
  let cost = 0;
  for (const car of cars) {
    const h = car.heading ?? 0, half = car.halfLength ?? 2.4, width = car.halfWidth ?? 1;
    const ax = Math.sin(h), az = Math.cos(h);
    const reach = Math.max(0, half - width);
    const t = Math.max(-reach, Math.min(reach, (x - car.x) * ax + (z - car.z) * az));
    const gap = Math.hypot(x - car.x - ax * t, z - car.z - az * t) - width;
    cost += Math.max(0, radius + MARGIN - gap);
  }
  for (const person of people) {
    const gap = Math.hypot(x - person.x, z - person.z) - (person.radius ?? 0.35);
    cost += Math.max(0, radius + MARGIN - gap);
  }
  return cost;
}

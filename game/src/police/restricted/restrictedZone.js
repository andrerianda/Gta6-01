// The ground of a restricted area as numbers: the ring of the plan turned into world metres, the
// height band above it that counts as inside (a low pass in an aircraft trespasses, an airliner's
// height does not), the gate with its challenge radius and the way out of it, and the distance
// from a point to the ring. Pure (Node-tested): no three.js, no game context.

/** Metres above the ground below which flying over the ring is trespassing. */
export const OVERFLIGHT_CEILING = 150;

/**
 * Builds the zone of a base plan (catalog/puntaGarzaAirBase.js).
 * @param {{restrictedRing: ReadonlyArray<ReadonlyArray<number>>, gate: {at: number[], facing: number, challengeRadius: number}}} plan
 * @param {(e: number, n: number) => {x: number, z: number}} toWorld City coordinates to world metres.
 * @param {{ceiling?: number}} [options]
 */
export function createRestrictedZone(plan, toWorld, options = {}) {
  const ring = plan.restrictedRing.map(([e, n]) => toWorld(e, n));
  const ceiling = options.ceiling ?? OVERFLIGHT_CEILING;
  let cx = 0, cz = 0;
  for (const point of ring) { cx += point.x / ring.length; cz += point.z / ring.length; }
  let reach = 0;
  for (const point of ring) reach = Math.max(reach, Math.hypot(point.x - cx, point.z - cz));
  const gateAt = toWorld(plan.gate.at[0], plan.gate.at[1]);
  const out = compassVector(plan.gate.facing);
  const gate = Object.freeze({ x: gateAt.x, z: gateAt.z, radius: plan.gate.challengeRadius, outX: out.x, outZ: out.z });
  return Object.freeze({
    ring: Object.freeze(ring.map((p) => Object.freeze(p))),
    ceiling,
    /** The middle of the ring and the distance from it to the farthest corner. */
    centre: Object.freeze({ x: cx, z: cz }),
    reach,
    gate,
    /** Whether a ground point lies inside the ring. */
    contains: (x, z) => pointInRing(ring, x, z),
    /** Whether a point at a height above the ground is inside the area (the ring and the band). */
    containsAt: (x, z, heightAboveGround) => insideHeightBand(heightAboveGround, ceiling) && pointInRing(ring, x, z),
    /** Metres from a point to the ring's edge: 0 inside. */
    distanceOutside: (x, z) => (pointInRing(ring, x, z) ? 0 : distanceToRing(ring, x, z)),
    /** Metres from a point to the gate. */
    distanceToGate: (x, z) => Math.hypot(x - gate.x, z - gate.z),
    /** Metres from the middle of the ring. */
    distanceToCentre: (x, z) => Math.hypot(x - cx, z - cz),
  });
}

/** The unit vector of a compass heading in world metres (0 = north = -Z, clockwise). */
export function compassVector(degrees) {
  const r = (degrees * Math.PI) / 180;
  return { x: Math.sin(r), z: -Math.cos(r) };
}

/** The yaw (three.js rotation.y, forward -Z) of a character facing a compass heading. */
export function yawOfCompass(degrees) {
  return (-degrees * Math.PI) / 180;
}

/**
 * Whether a point is inside a closed ring of {x, z} corners (even-odd rule).
 * @param {ReadonlyArray<{x: number, z: number}>} ring
 */
export function pointInRing(ring, x, z) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i], b = ring[j];
    if ((a.z > z) !== (b.z > z) && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

/** Whether a height above the ground is in the band that counts (the ground itself, water, a low pass). */
export function insideHeightBand(heightAboveGround, ceiling = OVERFLIGHT_CEILING) {
  return !(heightAboveGround > ceiling);
}

/** Metres from a point to the nearest edge of a ring. */
export function distanceToRing(ring, x, z) {
  let best = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[j], b = ring[i];
    const ex = b.x - a.x, ez = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * ex + (z - a.z) * ez) / (ex * ex + ez * ez || 1)));
    best = Math.min(best, Math.hypot(x - (a.x + ex * t), z - (a.z + ez * t)));
  }
  return best;
}

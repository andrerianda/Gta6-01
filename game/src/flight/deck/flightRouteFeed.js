// Turns the radar's GPS route (a dense x, z polyline along the roads, recomputed as the player
// moves) into the few long legs an autopilot can fly, and decides when the airplane's NAV route
// must be replaced: when the destination changes, or, while NAV is not flying it, when the route was
// recomputed from the aircraft's new position. A waypoint with no road route is one direct leg.
// Pure: no DOM, no three.js.

/** Shortest leg worth flying, metres, and the most legs fed. */
export const FLIGHT_ROUTE = Object.freeze({ minLeg: 450, maxLegs: 24, moved: 30 });

/**
 * Creates the feed.
 * @returns {{legs: Array<{x: number, z: number}>, flat: {points: Float32Array, count: number},
 *   destination: {x: number, z: number} | null,
 *   refresh: (source: {points: ArrayLike<number>, count: number} | null, waypoint: {x: number, z: number} | null,
 *     navActive: boolean) => boolean, clear: () => boolean}}
 *   `refresh` returns true when `legs` changed (hand them to airplane.setAutopilotRoute then).
 */
export function createFlightRouteFeed() {
  const flat = { points: new Float32Array(FLIGHT_ROUTE.maxLegs * 2), count: 0 };
  const feed = {
    /** The legs' end points in flight order (a fresh array on every change; empty: no route). */
    legs: [],
    /** The same points as a flat x, z buffer (for the map display). */
    flat,
    destination: null,
    refresh(source, waypoint, navActive) {
      let endX;
      let endZ;
      const hasRoute = Boolean(source && source.count > 1);
      if (hasRoute) {
        endX = source.points[(source.count - 1) * 2];
        endZ = source.points[(source.count - 1) * 2 + 1];
      } else if (waypoint) {
        endX = waypoint.x;
        endZ = waypoint.z;
      } else return feed.clear();
      const d = feed.destination;
      const sameEnd = d !== null && Math.hypot(d.x - endX, d.z - endZ) < FLIGHT_ROUTE.moved;
      if (sameEnd) {
        if (navActive || !hasRoute) return false;
        // Not flown yet: keep it fresh only when its start has moved.
        const startMoved = Math.hypot(source.points[0] - startX, source.points[1] - startZ) > FLIGHT_ROUTE.moved * 4;
        if (!startMoved && fromRoad && feed.legs.length > 0) return false;
      }
      fromRoad = hasRoute;
      if (hasRoute) {
        startX = source.points[0];
        startZ = source.points[1];
        flat.count = simplifyRouteForFlight(source.points, source.count, FLIGHT_ROUTE.minLeg, flat.points, FLIGHT_ROUTE.maxLegs);
      } else {
        flat.points[0] = endX;
        flat.points[1] = endZ;
        flat.count = 1;
      }
      const legs = [];
      for (let i = 0; i < flat.count; i += 1) legs.push({ x: flat.points[i * 2], z: flat.points[i * 2 + 1] });
      feed.legs = legs;
      feed.destination = { x: endX, z: endZ };
      return true;
    },
    clear() {
      if (feed.destination === null && feed.legs.length === 0) return false;
      feed.legs = [];
      feed.destination = null;
      fromRoad = false;
      flat.count = 0;
      return true;
    },
  };
  let startX = 0;
  let startZ = 0;
  let fromRoad = false;
  return feed;
}

/**
 * Thins a road polyline to legs of at least `minLeg` metres: keeps a point when the way since the
 * last kept one is long enough and the road has turned, and always keeps the last point.
 * @param {ArrayLike<number>} points x, z pairs.
 * @param {number} count Points in the polyline.
 * @param {number} minLeg Metres.
 * @param {Float32Array} out x, z pairs of the legs' end points (the start is left out).
 * @param {number} [maxLegs] Capacity of `out` in points.
 * @returns {number} Points written.
 */
export function simplifyRouteForFlight(points, count, minLeg, out, maxLegs = out.length >> 1) {
  if (count < 1) return 0;
  let written = 0;
  let lastX = points[0];
  let lastZ = points[1];
  for (let i = 1; i < count - 1 && written < maxLegs - 1; i += 1) {
    const x = points[i * 2];
    const z = points[i * 2 + 1];
    const leg = Math.hypot(x - lastX, z - lastZ);
    if (leg < minLeg) continue;
    // Skip points on a straight run: only a turn of more than about 12 degrees ends a leg early;
    // a straight run still ends after four minimum legs, so the autopilot has something near.
    const nx = points[(i + 1) * 2] - x;
    const nz = points[(i + 1) * 2 + 1] - z;
    const next = Math.hypot(nx, nz);
    const cos = next > 0.01 ? ((x - lastX) * nx + (z - lastZ) * nz) / (leg * next) : 1;
    if (cos > 0.978 && leg < minLeg * 4) continue;
    out[written * 2] = x;
    out[written * 2 + 1] = z;
    written += 1;
    lastX = x;
    lastZ = z;
  }
  out[written * 2] = points[(count - 1) * 2];
  out[written * 2 + 1] = points[(count - 1) * 2 + 1];
  return written + 1;
}

/**
 * The compass bearing from one point to another on the map (-Z is north, +X east).
 * @param {number} fromX
 * @param {number} fromZ
 * @param {number} toX
 * @param {number} toZ
 * @returns {number} Degrees 0..360.
 */
export function bearingDegrees(fromX, fromZ, toX, toZ) {
  const degrees = Math.atan2(toX - fromX, -(toZ - fromZ)) * 180 / Math.PI;
  return degrees < 0 ? degrees + 360 : degrees;
}

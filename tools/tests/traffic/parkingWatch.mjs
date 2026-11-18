// A probe for the kerbside parking: walks, then drives, the player along a route of lanes through
// the test world while a camera follows 5 m behind, and counts the parked cars (real cars of the
// fleet and drawn instances alike) that appear or vanish inside the camera's view within
// `watched` metres, and the taken spots near the player that show nothing. Used by
// kerbsideParking.test.mjs; takes the factory so an older version can be measured the same way.

import { PARKING_OCCUPANCY, spotRoll } from '../../../game/src/traffic/kerbsideParking.js';
import { outOfSight } from '../../../game/src/traffic/trafficSpawning.js';
import { createTestWorld } from './trafficTestWorld.mjs';

const MODELS = ['family_sedan', 'sports_coupe'];

// About 900 m of lanes from a long street, following the first successor at each end.
function routeFrom(plan) {
  const lanes = plan.lanes;
  let lane = lanes.find((candidate) => candidate.roadClass === 'street' && candidate.length > 120 && candidate.successors.length > 0);
  const points = [];
  for (let length = 0; lane && length < 900; ) {
    for (let i = 0; i < lane.points.length; i += 2) points.push(lane.points[i], lane.points[i + 1]);
    length += lane.length;
    const next = lane.successors[0];
    lane = lanes[next?.lane ?? next];
  }
  return points;
}

function pointAt(points, along, out) {
  let left = along;
  for (let i = 0; i + 3 < points.length; i += 2) {
    const ex = points[i + 2] - points[i];
    const ez = points[i + 3] - points[i + 1];
    const span = Math.hypot(ex, ez);
    if (span < 1e-6) continue;
    if (left <= span) {
      out.x = points[i] + (ex * left) / span;
      out.z = points[i + 1] + (ez * left) / span;
      out.dx = ex / span;
      out.dz = ez / span;
      return true;
    }
    left -= span;
  }
  return false;
}

/**
 * Runs the walk and the drive.
 * @param {Function} createKerbsideParking The parking factory under test.
 * @param {{walkSeconds?: number, driveSeconds?: number, watched?: number, tier?: object}} [options]
 * @returns {{appeared: number, vanished: number, emptyNear: number, ticks: number, shownMax: number, real: number}}
 */
export function watchParking(createKerbsideParking, options = {}) {
  const { walkSeconds = 30, driveSeconds = 50, watched = 60, tier = { maxVehicles: 60, trafficDensity: 1 } } = options;
  const route = routeFrom(createTestWorld({ x: 0, z: 0 }).plan);
  const start = { x: 0, z: 0, dx: 0, dz: -1 };
  pointAt(route, 0, start);
  const world = createTestWorld(start, tier);
  const { context, city, fleet, records, entities } = world;
  context.seed = 1;
  const eye = { x: 0, z: 0, forwardX: 0, forwardZ: -1, cosHalfView: 0.5 };
  const centre = { x: start.x, z: start.z };
  const drivers = { centre, eye, pickModel: (x, z, roll) => MODELS[roll < 0.5 ? 0 : 1], pullOut: () => false };
  const parking = createKerbsideParking(context, { city, drivers, fleet });
  // The camera's real view: 46 degrees each side (60 degrees vertical at 16:9).
  const view = { x: 0, z: 0, forwardX: 0, forwardZ: -1, cosHalfView: Math.cos((46 * Math.PI) / 180) };
  const spots = context.entities ? city.plan.parkingSpots : [];
  const result = { appeared: 0, vanished: 0, emptyNear: 0, ticks: 0, shownMax: 0, real: 0 };
  let previous = null;
  const point = { x: 0, z: 0, dx: 0, dz: -1 };
  const dt = 0.5;
  let along = 0;
  for (let time = 0; time < walkSeconds + driveSeconds; time += dt) {
    along += (time < walkSeconds ? 4 : 14) * dt;
    if (!pointAt(route, along, point)) break;
    centre.x = point.x;
    centre.z = point.z;
    context.focus.position.x = point.x;
    context.focus.position.z = point.z;
    eye.x = view.x = point.x - point.dx * 5;
    eye.z = view.z = point.z - point.dz * 5;
    eye.forwardX = view.forwardX = point.dx;
    eye.forwardZ = view.forwardZ = point.dz;
    entities.refreshAll();
    parking.fixedUpdate(dt);
    context.simulation.time += dt;
    // What shows now: a key per place (a real car and the instance it swaps with share it).
    const shown = new Map();
    for (const record of records.values()) {
      const p = record.entity.position;
      shown.set(`${Math.round(p.x)},${Math.round(p.z)}`, p);
    }
    for (const spot of parking.drawnSpots ?? []) shown.set(`${Math.round(spot.x)},${Math.round(spot.z)}`, spot);
    const watchedNow = (p) => Math.hypot(p.x - view.x, p.z - view.z) < watched && !outOfSight(p.x, p.z, view);
    if (previous) {
      for (const [key, p] of shown) if (!previous.has(key) && watchedNow(p)) result.appeared += 1;
      for (const [key, p] of previous) if (!shown.has(key) && watchedNow(p)) result.vanished += 1;
    }
    // Taken spots within 39 m of the player that show nothing (after the first fill).
    if (previous) {
      for (const spot of spots) {
        if (Math.abs(spot.x - centre.x) > 39 || Math.abs(spot.z - centre.z) > 39) continue;
        if (Math.hypot(spot.x - centre.x, spot.z - centre.z) >= 39 || spotRoll(spot.id, 1) >= PARKING_OCCUPANCY) continue;
        if (!shown.has(`${Math.round(spot.x)},${Math.round(spot.z)}`)) result.emptyNear += 1;
      }
    }
    result.shownMax = Math.max(result.shownMax, shown.size);
    result.real = Math.max(result.real, records.size);
    result.ticks += 1;
    previous = shown;
  }
  parking.dispose();
  return result;
}

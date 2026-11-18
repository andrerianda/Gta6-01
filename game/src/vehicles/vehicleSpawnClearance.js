// Keeps a parked car's spawn clear of what it would overlap: posts, walls, props and other cars.
// A car created inside a collider is pushed out by the solver and sat jittering with a large
// velocity (traffic and the player saw a parked coupe at 6-11 m/s and tyre smoke). Before the body
// exists, two capsules along the car's sides at body height are tested against the static, prop
// and vehicle layers (not the ground, and low enough kerbs pass under them); if they overlap,
// the spawn is nudged sideways or along the car until it is clear. No allocation per call.
import { LAYER } from '../physics/collisionLayers.js';

/** What a parked car must not be inside of (characters and the ground are left out). */
const BLOCKERS = LAYER.STATIC | LAYER.SEE_THROUGH | LAYER.VEHICLE | LAYER.PROP;
/** Radius of the side capsules, metres. */
const SIDE_RADIUS = 0.42;
/** Height of the capsules' underside above the ground: a kerb (about 0.15 m) passes under it. */
const LIFT = 0.28;
/** Nudges tried in order, metres: [to the car's right, forward]; the first is no nudge. */
const NUDGES = Object.freeze([
  [0, 0], [0.3, 0], [-0.3, 0], [0.6, 0], [-0.6, 0], [0, 0.7], [0, -0.7], [0.9, 0], [-0.9, 0],
  [0, 1.4], [0, -1.4], [1.2, 0], [-1.2, 0], [0.6, 1.4], [-0.6, 1.4], [0.6, -1.4], [-0.6, -1.4],
]);

/**
 * Whether a car standing at (x, z) on ground at groundY, facing `heading`, would overlap something.
 * @param {object} world The PhysicsWorld (overlapCapsule).
 * @param {{dimensions: {length: number, width: number}}} entry The vehicleCatalog entry.
 * @param {number} x World X of the car's origin.
 * @param {number} groundY Ground height there.
 * @param {number} z World Z of the car's origin.
 * @param {number} heading Compass heading (0 = -Z, clockwise from above).
 * @returns {boolean}
 */
export function parkedSpawnBlocked(world, entry, x, groundY, z, heading) {
  const size = entry.dimensions;
  const r = SIDE_RADIUS;
  const along = Math.max(0, size.length / 2 - r);
  const aside = Math.max(0, size.width / 2 - r);
  const fx = Math.sin(heading);
  const fz = -Math.cos(heading);
  const y = groundY + LIFT + r;
  for (let side = -1; side <= 1; side += 2) {
    // The car's right is (-fz, fx) for a forward of (fx, fz).
    const cx = x - fz * aside * side;
    const cz = z + fx * aside * side;
    const count = world.overlapCapsule(cx - fx * along, y, cz - fz * along, cx + fx * along, y, cz + fz * along, r, BLOCKERS, null);
    if (count > 0) return true;
    if (aside === 0) break;
  }
  return false;
}

/**
 * Moves a parked spawn plan to the nearest clear place among a few nudges (it stays where it was
 * when it is already clear, or when nothing nearby is).
 * @param {object} world The PhysicsWorld (overlapCapsule, supportBelow).
 * @param {object} entry The vehicleCatalog entry.
 * @param {{position: {x: number, y: number | null, z: number}, heading: number}} plan From planVehicleSpawn; its position is updated.
 * @returns {'clear' | 'nudged' | 'blocked' | 'unknown'} What was found.
 */
export function clearParkedSpawn(world, entry, plan) {
  if (typeof world?.overlapCapsule !== 'function' || !entry?.dimensions) return 'unknown';
  const { x, z } = plan.position;
  let groundY = plan.position.y;
  if (groundY === null || groundY === undefined) {
    if (typeof world.supportBelow !== 'function' || !world.supportBelow(x, 400, z, 800, LAYER.GROUND)) return 'unknown';
    groundY = world.hit.y;
  }
  const heading = plan.heading ?? 0;
  // The car's right is (-fz, fx) for a forward of (fx, fz).
  const fx = Math.sin(heading);
  const fz = -Math.cos(heading);
  for (let i = 0; i < NUDGES.length; i += 1) {
    const right = NUDGES[i][0];
    const ahead = NUDGES[i][1];
    const nx = x - fz * right + fx * ahead;
    const nz = z + fx * right + fz * ahead;
    if (!parkedSpawnBlocked(world, entry, nx, groundY, nz, heading)) {
      plan.position.x = nx;
      plan.position.z = nz;
      return i === 0 ? 'clear' : 'nudged';
    }
  }
  return 'blocked';
}

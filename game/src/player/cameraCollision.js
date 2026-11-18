// Keeps the follow camera out of walls: a sphere is swept from the point the camera orbits to
// where it wants to be, through the physics system's collision world, and the camera stops short
// of the first wall. Thin things (a palm trunk, a lamp post, a sign pole: under THIN_OBSTACLE
// through, found by sweeping back from the camera) do not pull the camera in: it passes them, so
// the view never collapses into the lead because a trunk crossed the line. On foot the camera
// never comes closer to the pivot than `minimumDistance`, so it stays clear of the lead's body
// and the near plane never cuts through the lead. The pull-in is quick and the release slow, so
// a wall corner passing does not make the view pump. Without a physics system nothing blocks.
import { LAYER, MASK } from '../physics/collisionLayers.js';
import { approach } from './smoothMotion.js';

/** Radius of the camera's sphere, metres. */
export const CAMERA_RADIUS = 0.28;
/** An obstacle less deep than this along the camera line is passed, not avoided, metres. */
export const THIN_OBSTACLE = 0.7;

/**
 * Creates the camera's collision.
 * @param {() => any} findPhysics Gives the physics system (or null).
 */
export function createCameraCollision(findPhysics) {
  const hit = { hit: false, distance: 0, x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0 };
  const ignore = ['player'];
  let reach = 1; // the share of the wanted distance the camera may use, eased

  let mask = MASK.WORLD;

  function sweep(physics, ox, oy, oz, dx, dy, dz, length) {
    hit.hit = false;
    if (typeof physics.sweepSphere === 'function') {
      if (physics.sweepSphere(ox, oy, oz, dx, dy, dz, length, CAMERA_RADIUS, mask, ignore, hit)) return hit.distance;
      return length;
    }
    const world = physics.world;
    if (world && typeof world.sphereCast === 'function') {
      if (world.sphereCast(ox, oy, oz, dx, dy, dz, length, CAMERA_RADIUS, mask, ignore, hit)) return hit.distance;
    }
    return length;
  }

  /**
   * How far from the pivot the camera may stand along its line: the first solid obstacle, or
   * the whole length when the way is clear or only thin things are in it.
   */
  function freeLength(physics, pivot, dx, dy, dz, length) {
    const free = sweep(physics, pivot.x, pivot.y, pivot.z, dx, dy, dz, length);
    if (free >= length) return length;
    // Sweep back from the wanted camera: a hit soon after the first one means a thin obstacle.
    const back = sweep(physics, pivot.x + dx * length, pivot.y + dy * length, pivot.z + dz * length, -dx, -dy, -dz, length);
    const through = length - free - back;
    if (back > 0.05 && free + back < length && through < THIN_OBSTACLE) return length;
    return free;
  }

  /**
   * Pulls a wanted camera position in toward the pivot when the city is in the way.
   * @param {{x: number, y: number, z: number}} pivot Where the sweep starts (inside the lead).
   * @param {{x: number, y: number, z: number}} camera Wanted position; moved in place.
   * @param {number} dt Frame seconds (0 for a cut: no easing).
   * @param {number} [minimumDistance] Never closer to the pivot than this, metres (on foot: clear
   *   of the lead's body); 0 keeps the old floor of 8 % of the distance.
   * @param {boolean} [vehicles] Cars block the camera too (on foot, so it never goes inside a
   *   parked or passing car; not in the chase view, whose pivot is inside the driven car).
   */
  function resolve(pivot, camera, dt, minimumDistance = 0, vehicles = false) {
    mask = vehicles ? MASK.WORLD | LAYER.VEHICLE : MASK.WORLD;
    const dx = camera.x - pivot.x, dy = camera.y - pivot.y, dz = camera.z - pivot.z;
    const length = Math.hypot(dx, dy, dz);
    const physics = findPhysics();
    let allowed = 1;
    if (physics && length > 1e-3) {
      const free = freeLength(physics, pivot, dx / length, dy / length, dz / length, length);
      const floor = Math.min(1, Math.max(0.08, minimumDistance / length));
      allowed = Math.max(floor, Math.min(1, free / length));
    }
    // In at once (never through the wall), out gently.
    if (dt <= 0 || allowed < reach) reach = allowed;
    else reach = approach(reach, allowed, 2.5, dt);
    camera.x = pivot.x + dx * reach;
    camera.y = pivot.y + dy * reach;
    camera.z = pivot.z + dz * reach;
    return reach;
  }

  return { resolve };
}

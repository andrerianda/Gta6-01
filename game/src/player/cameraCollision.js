// Keeps the follow camera out of walls: a sphere is swept from the point the camera orbits to
// where it wants to be, through the physics system's collision world, and the camera stops short
// of the first wall. The pull-in is quick and the release slow, so a lamp post passing between
// the camera and the lead does not make the view pump. Without a physics system nothing blocks.
import { MASK } from '../physics/collisionLayers.js';
import { approach } from './smoothMotion.js';

/** Radius of the camera's sphere, metres. */
export const CAMERA_RADIUS = 0.28;

/**
 * Creates the camera's collision.
 * @param {() => any} findPhysics Gives the physics system (or null).
 */
export function createCameraCollision(findPhysics) {
  const hit = { hit: false, distance: 0, x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0 };
  const ignore = ['player'];
  let reach = 1; // the share of the wanted distance the camera may use, eased

  function sweep(physics, ox, oy, oz, dx, dy, dz, length) {
    hit.hit = false;
    if (typeof physics.sweepSphere === 'function') {
      if (physics.sweepSphere(ox, oy, oz, dx, dy, dz, length, CAMERA_RADIUS, MASK.WORLD, ignore, hit)) return hit.distance;
      return length;
    }
    const world = physics.world;
    if (world && typeof world.sphereCast === 'function') {
      if (world.sphereCast(ox, oy, oz, dx, dy, dz, length, CAMERA_RADIUS, MASK.WORLD, ignore, hit)) return hit.distance;
    }
    return length;
  }

  /**
   * Pulls a wanted camera position in toward the pivot when the city is in the way.
   * @param {{x: number, y: number, z: number}} pivot Where the sweep starts (inside the lead).
   * @param {{x: number, y: number, z: number}} camera Wanted position; moved in place.
   * @param {number} dt Frame seconds (0 for a cut: no easing).
   */
  function resolve(pivot, camera, dt) {
    const dx = camera.x - pivot.x, dy = camera.y - pivot.y, dz = camera.z - pivot.z;
    const length = Math.hypot(dx, dy, dz);
    const physics = findPhysics();
    let allowed = 1;
    if (physics && length > 1e-3) {
      const free = sweep(physics, pivot.x, pivot.y, pivot.z, dx / length, dy / length, dz / length, length);
      allowed = Math.max(0.08, Math.min(1, free / length));
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

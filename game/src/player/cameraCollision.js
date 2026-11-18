// Keeps the follow camera out of walls: a sphere is swept from the point the camera orbits to
// where it wants to be, through the physics system's collision world, and the camera stops short
// of the first wall. Thin things (a palm trunk, a lamp post, a sign pole, a thin fence: less than
// THIN_OBSTACLE deep, found by sweeping back from the camera, or from a little beyond it when the
// camera's spot is inside the trunk) do not pull the camera in: it keeps its distance and the
// occluder between it and the lead is cut away by the near plane (`clipNear`: the camera
// director moves camera.near just past the obstacle, never into the lead), so the lead stays in
// view and nothing else in the picture changes. On foot the camera never comes closer to the
// pivot than `minimumDistance`, so it stays clear of the lead's body and the near plane never
// cuts through the lead. The pull-in is quick and the release slow, so a wall corner passing
// does not make the view pump. Without a physics system nothing blocks.
import { LAYER, MASK } from '../physics/collisionLayers.js';
import { approach } from './smoothMotion.js';

/** Radius of the camera's sphere, metres. */
export const CAMERA_RADIUS = 0.28;
/**
 * An obstacle less deep than this along the camera line is passed, not avoided, metres. The
 * swept sphere meets an obstacle CAMERA_RADIUS early from each side, so the depth is the gap
 * between the two hits less two radii (QA bug 3: a 0.4 m palm trunk measured 0.96 m of gap and
 * held the camera at 0.95 m on Bulevar Dorado).
 */
export const THIN_OBSTACLE = 0.7;
/** How far beyond the wanted camera the back sweep may start when the camera's spot is inside the obstacle, metres. */
export const SWEEP_BEYOND = 0.6;
/** The near plane stays this far in front of the pivot (inside the lead) when it cuts an occluder away, metres. */
export const LEAD_CLEAR = 0.55;

/**
 * How far to one side the camera line is tried again when something blocks it, metres: a pole or
 * trunk up to ~0.5 m across (with the 0.28 m sphere) leaves one shifted line clear; a wall does not.
 */
export const SIDE_SLIDE = 0.55;

const BEYOND = [0, SWEEP_BEYOND];

/**
 * Creates the camera's collision.
 * @param {() => any} findPhysics Gives the physics system (or null).
 */
export function createCameraCollision(findPhysics) {
  const hit = { hit: false, distance: 0, x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0 };
  const ignore = ['player'];
  let reach = 1; // the share of the wanted distance the camera may use, eased
  let clip = 0;  // the near plane that cuts a passed thin occluder away (0: none), metres from the camera

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
   * the whole length when the way is clear or only a thin thing is in it (then `clip` is set).
   */
  function freeLength(physics, pivot, dx, dy, dz, length) {
    const free = sweep(physics, pivot.x, pivot.y, pivot.z, dx, dy, dz, length);
    if (free >= length) return length;
    for (let i = 0; i < BEYOND.length; i += 1) {
      // Sweep back toward the pivot: the far side of the obstacle (a sweep starting inside a
      // solid finds nothing near, so a wall never counts as thin).
      const from = length + BEYOND[i];
      const back = sweep(physics, pivot.x + dx * from, pivot.y + dy * from, pivot.z + dz * from, -dx, -dy, -dz, from);
      if (back <= 0.05 || free + back >= from) continue;
      if (from - free - back - 2 * CAMERA_RADIUS >= THIN_OBSTACLE) return free;
      // Passed: everything up to the obstacle's near face (seen from the lead) is cut away.
      const cut = length - free - CAMERA_RADIUS + 0.05;
      clip = Math.min(cut, length - LEAD_CLEAR);
      return length;
    }
    // Shift 11 (QA bug 9, Tolliver Tow; lamp poles at the m02/m03 starts): a pole or trunk the
    // back sweep could not measure (both of its starts inside or beside something) still collapsed
    // the view into the lead's back. Slide past it: when the same line shifted SIDE_SLIDE to one
    // side (and that side is reachable from the pivot) is clear, the obstacle is narrow; keep the
    // distance and cut it away. A wall blocks both shifted lines; a corner blocks the shift.
    const sx = -dz, sz = dx, side = Math.hypot(sx, sz);
    if (side > 0.2) {
      for (let s = -1; s <= 1; s += 2) {
        const ux = (sx / side) * s, uz = (sz / side) * s;
        if (sweep(physics, pivot.x, pivot.y, pivot.z, ux, 0, uz, SIDE_SLIDE) < SIDE_SLIDE) continue;
        const ox = pivot.x + ux * SIDE_SLIDE, oz = pivot.z + uz * SIDE_SLIDE;
        if (sweep(physics, ox, pivot.y, oz, dx, dy, dz, length) < length) continue;
        clip = Math.min(length - free - CAMERA_RADIUS + 0.05, length - LEAD_CLEAR);
        return length;
      }
    }
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
    clip = 0;
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
    // While easing back out past a passed obstacle the cut follows the camera.
    if (clip > 0) clip = Math.min(clip - length * (1 - reach), length * reach - LEAD_CLEAR);
    camera.x = pivot.x + dx * reach;
    camera.y = pivot.y + dy * reach;
    camera.z = pivot.z + dz * reach;
    return reach;
  }

  return {
    resolve,
    /**
     * After resolve(): the near-plane distance (metres from the camera) that cuts a passed thin
     * occluder away so the lead stays in view, or 0 when nothing needs cutting.
     */
    get clipNear() { return clip > 0 ? clip : 0; },
  };
}

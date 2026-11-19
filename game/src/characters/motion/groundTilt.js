// Lying on a slope: tilts a whole-body pose about the instance's origin (on the ground at the
// person's position) so that its "up" becomes the ground's normal there. Lying poses are written
// for flat ground; on a 10 % slope a flat pose would leave a foot or a hand 10 cm in the ground
// at one end and floating at the other. The normal comes from the ground-height function sampled
// across the body's length. Pure maths over the pose buffer; no allocation.
import { BONE } from '../skeleton/humanSkeleton.js';
import { quatFromDirections, quatMultiply } from '../skeleton/quaternionMath.js';

/** Half the distance over which the ground's slope is measured (metres): about a lying body's half length. */
export const GROUND_TILT_SPAN = 0.8;
/** The steepest slope followed (rad); steeper ground is followed only this far. */
const MAX_TILT = 0.5;
const q = new Float32Array(4);

/**
 * Tilts the pose's root to the ground's slope at world (x, z), seen from an instance turned by
 * yaw (its rotation.y), by `weight` 0..1 (how much the person is lying down).
 * @param {Float32Array} pose
 * @param {(x: number, z: number) => number} ground
 * @param {number} x
 * @param {number} z
 * @param {number} yaw
 * @param {number} weight
 * @returns {boolean} Whether the pose changed (bring the forward kinematics up to date then).
 */
export function tiltPoseToGround(pose, ground, x, z, yaw, weight) {
  if (!(weight > 0)) return false;
  const h = GROUND_TILT_SPAN;
  const gx = (ground(x + h, z) - ground(x - h, z)) / (2 * h), gz = (ground(x, z + h) - ground(x, z - h)) / (2 * h);
  if (!Number.isFinite(gx) || !Number.isFinite(gz) || Math.abs(gx) + Math.abs(gz) < 1e-3) return false;
  // The slope in character space (+X right, -Z forward): world = (x cos + z sin, y, -x sin + z cos).
  const cos = Math.cos(yaw), sin = Math.sin(yaw);
  let sx = gx * cos - gz * sin, sz = gx * sin + gz * cos;
  const steep = Math.hypot(sx, sz), cap = Math.tan(MAX_TILT);
  if (steep > cap) { sx *= cap / steep; sz *= cap / steep; }
  const n = Math.hypot(sx, 1, sz);
  const w = Math.min(1, weight);
  // The normal (-sx, 1, -sz) scaled towards up by the weight (a small-angle blend is enough here).
  let nx = -sx * w / n, ny = 1 / n, nz = -sz * w / n;
  const m = Math.hypot(nx, ny, nz);
  nx /= m; ny /= m; nz /= m;
  quatFromDirections(q, 0, 0, 1, 0, nx, ny, nz);
  quatMultiply(pose, BONE.ROOT * 4, q, 0, pose, BONE.ROOT * 4);
  return true;
}

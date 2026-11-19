// A pose: what the animation system hands to a skeleton. For every bone it holds one rotation
// relative to the rest pose, expressed in the canonical frame of the bone's parent: a frame that
// at rest is aligned with character space (+X right, +Y up, -Z forward) whatever roll the bone
// has in the file. So "rotate the thigh 30 degrees about +X" means the same on every body. It
// also holds where the root and the hips have moved to, and how firmly each foot is on the
// ground (for foot planting). A pose is one flat Float32Array, so blending is a tight loop.
import { BONE_COUNT } from './humanSkeleton.js';
import { quatNlerp } from './quaternionMath.js';

/** Offset of the root joint's translation (metres from its rest place, character space). */
export const POSE_ROOT_TRANSLATION = BONE_COUNT * 4;
/** Offset of the hips joint's translation (metres from its rest place, in the root's frame). */
export const POSE_HIPS_TRANSLATION = POSE_ROOT_TRANSLATION + 3;
/** Offset of the two foot-contact weights (left, right), 0 in the air and 1 planted. */
export const POSE_FOOT_CONTACT = POSE_HIPS_TRANSLATION + 3;
/** How many numbers a pose holds. */
export const POSE_SIZE = POSE_FOOT_CONTACT + 2;

/**
 * Creates a pose at rest.
 * @returns {Float32Array}
 */
export function createPose() {
  const pose = new Float32Array(POSE_SIZE);
  resetPose(pose);
  return pose;
}

/**
 * Puts a pose back to rest: every bone unrotated, nothing moved, both feet planted.
 * @param {Float32Array} pose
 * @returns {Float32Array} The same pose.
 */
export function resetPose(pose) {
  pose.fill(0);
  for (let bone = 0; bone < BONE_COUNT; bone += 1) pose[bone * 4 + 3] = 1;
  pose[POSE_FOOT_CONTACT] = 1;
  pose[POSE_FOOT_CONTACT + 1] = 1;
  return pose;
}

/**
 * Blends two poses.
 * @param {Float32Array} out May be `a` or `b`.
 * @param {Float32Array} a
 * @param {Float32Array} b
 * @param {number} t 0 gives a, 1 gives b.
 * @returns {Float32Array} `out`.
 */
export function blendPoses(out, a, b, t) {
  for (let offset = 0; offset < POSE_ROOT_TRANSLATION; offset += 4) quatNlerp(out, offset, a, offset, b, offset, t);
  for (let i = POSE_ROOT_TRANSLATION; i < POSE_SIZE; i += 1) out[i] = a[i] + (b[i] - a[i]) * t;
  return out;
}

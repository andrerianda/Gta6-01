// Look-at: turns the head towards a point, the way a person does it, with the neck doing most
// of the work, the chest helping a little, and soft limits so the head never spins round. It is
// applied on top of whatever pose a motion has written, so a walking person can look at a car
// that passes, and a turn can be led by the head.
import { computeForwardKinematics } from '../skeleton/forwardKinematics.js';
import { BONE, BONE_COUNT } from '../skeleton/humanSkeleton.js';
import { quatFromYawPitchRoll, quatMultiply, quatRotate } from '../skeleton/quaternionMath.js';

/** The furthest the head turns to a side and tips up or down, radians. */
export const LOOK_LIMITS = Object.freeze({ yaw: 1.25, pitch: 0.7 });

/** How the turn is shared between chest, neck and head (the shares add up to 1). */
export const LOOK_SHARES = Object.freeze([[BONE.CHEST, 0.15], [BONE.NECK, 0.4], [BONE.HEAD, 0.45]]);

const forward = new Float32Array(3);
const turn = new Float32Array(4);

/**
 * Limits an angle softly: unchanged up to 70 % of the limit, then easing towards it.
 * @param {number} angle
 * @param {number} limit
 * @returns {number}
 */
export function softAngleLimit(angle, limit) {
  const free = limit * 0.7, size = Math.abs(angle);
  if (size <= free) return angle;
  return Math.sign(angle) * (free + (limit - free) * Math.tanh((size - free) / (limit - free)));
}

/**
 * Turns chest, neck and head so that the face points at a target.
 * @param {Float32Array} pose The pose to change.
 * @param {import('../skeleton/bodyMeasurements.js').BodyModel} body
 * @param {import('../skeleton/forwardKinematics.js').FkState} fk The joints of `pose`; brought
 *   up to date again for every bone from the chest on.
 * @param {number} tx The target, in character space (+X right, +Y up, -Z forward).
 * @param {number} ty
 * @param {number} tz
 * @param {number} [weight] 0 leaves the pose alone, 1 looks fully (default 1).
 * @returns {number} The yaw the head was turned by, radians (positive to the left).
 */
export function writeLookAt(pose, body, fk, tx, ty, tz, weight = 1) {
  const h = BONE.HEAD * 3;
  const eyeHeight = body.headTop * 0.45;
  let dx = tx - fk.position[h], dy = ty - fk.position[h + 1] - eyeHeight, dz = tz - fk.position[h + 2];
  const n = Math.hypot(dx, dy, dz);
  if (n < 1e-4 || weight <= 0) return 0;
  dx /= n; dy /= n; dz /= n;
  quatRotate(forward, 0, fk.rotation, BONE.HEAD * 4, 0, 0, -1);
  let yaw = Math.atan2(-dx, -dz) - Math.atan2(-forward[0], -forward[2]);
  if (yaw > Math.PI) yaw -= 2 * Math.PI;
  if (yaw < -Math.PI) yaw += 2 * Math.PI;
  const pitch = Math.asin(Math.max(-1, Math.min(1, dy))) - Math.asin(Math.max(-1, Math.min(1, forward[1])));
  yaw = softAngleLimit(yaw, LOOK_LIMITS.yaw) * weight;
  const tip = softAngleLimit(pitch, LOOK_LIMITS.pitch) * weight;
  for (const [bone, share] of LOOK_SHARES) {
    quatFromYawPitchRoll(turn, 0, yaw * share, tip * share, 0);
    quatMultiply(pose, bone * 4, turn, 0, pose, bone * 4);
  }
  computeForwardKinematics(body, pose, fk, BONE.CHEST, body.hasJaw ? BONE_COUNT - 1 : BONE.HAND_R);
  return yaw;
}

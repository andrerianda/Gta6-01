// The lead's body beyond walking and running: folding the legs for a jump's take-off crouch,
// the tuck in the air and the dip on landing, sitting at the wheel with the hands on the rim,
// the hands raised for an arrest and the limp sprawl when wasted. Each one writes into a pose
// buffer of the character run-time (rotations relative to rest, in each parent's canonical
// frame: +X right, +Y up, -Z forward), on top of the locomotion pose or instead of it. Plain
// functions, no allocation.
import { reachWithLimb } from '../characters/ik/limbPosing.js';
import { computeForwardKinematics } from '../characters/skeleton/forwardKinematics.js';
import { ARM_L, ARM_R, BONE } from '../characters/skeleton/humanSkeleton.js';
import { POSE_HIPS_TRANSLATION, resetPose } from '../characters/skeleton/poseBuffer.js';
import { quatCopy, quatFromAxisAngle, quatMultiply, quatNlerp } from '../characters/skeleton/quaternionMath.js';

const turn = new Float32Array(4);
const kept = new Float32Array(8);

/**
 * Turns a bone about an axis of its parent's canonical frame, on top of what the pose holds.
 * About +X a hanging bone swings forward and an upright one tips back.
 */
export function turnBone(pose, bone, ax, ay, az, angle) {
  if (angle === 0) return;
  quatFromAxisAngle(turn, 0, ax, ay, az, angle);
  quatMultiply(pose, bone * 4, turn, 0, pose, bone * 4);
}

/**
 * Bends one leg: the thigh forward by `hip`, the knee by `knee`, the foot kept level.
 * @param {Float32Array} pose
 * @param {-1|1} side
 * @param {number} hip Radians.
 * @param {number} knee Radians.
 */
export function bendLeg(pose, side, hip, knee) {
  const thigh = side < 0 ? BONE.THIGH_L : BONE.THIGH_R;
  turnBone(pose, thigh, 1, 0, 0, hip);
  turnBone(pose, thigh + 1, 1, 0, 0, -knee);
  turnBone(pose, thigh + 2, 1, 0, 0, knee - hip);
}

/**
 * The hip angle that lowers the pelvis by `depth` with both feet staying put (knee = 2 x hip).
 * @param {number} depth Metres.
 * @param {number} legLength Thigh plus shin, metres.
 */
export function crouchAngle(depth, legLength) {
  const c = 1 - Math.max(0, depth) / legLength;
  return Math.acos(c < 0.45 ? 0.45 : c > 1 ? 1 : c);
}

/**
 * Lowers the body by bending both knees: the take-off crouch and the landing dip.
 * @param {Float32Array} pose
 * @param {{thighLength: number, shinLength: number}} body
 * @param {number} depth Metres the pelvis drops.
 */
export function dipLegs(pose, body, depth) {
  if (depth <= 0.001) return;
  const hip = crouchAngle(depth, body.thighLength + body.shinLength);
  bendLeg(pose, -1, hip, hip * 2);
  bendLeg(pose, 1, hip, hip * 2);
  turnBone(pose, BONE.SPINE, 1, 0, 0, -hip * 0.55);
  pose[POSE_HIPS_TRANSLATION + 1] -= depth;
}

/**
 * The jump in the air: legs tucked (the left more than the right), arms out for balance.
 * @param {Float32Array} pose
 * @param {number} tuck 0 legs straight .. 1 fully tucked.
 */
export function airbornePose(pose, tuck) {
  if (tuck <= 0.001) return;
  bendLeg(pose, -1, 0.95 * tuck, 1.35 * tuck);
  bendLeg(pose, 1, 0.3 * tuck, 0.85 * tuck);
  turnBone(pose, BONE.UPPER_ARM_L, 0, 0, 1, -0.55 * tuck);
  turnBone(pose, BONE.UPPER_ARM_R, 0, 0, 1, 0.55 * tuck);
  turnBone(pose, BONE.SPINE, 1, 0, 0, -0.12 * tuck);
}

/**
 * How tucked the legs are in the air: they draw up on the way up and reach for the ground
 * on the way down.
 * @param {number} verticalSpeed m/s, up positive.
 */
export function tuckFor(verticalSpeed) {
  const t = verticalSpeed > 0 ? 1 : 1 + verticalSpeed * 0.16;
  return t < 0.3 ? 0.3 : t;
}

/**
 * The landing dip: one bump that peaks after `rise` seconds and settles.
 * @param {number} seconds Since touching down.
 * @param {number} impactSpeed Downward speed at touch-down, m/s.
 * @returns {number} Metres the pelvis drops.
 */
export function landingDip(seconds, impactSpeed) {
  const rise = 0.085;
  const peak = Math.min(0.24, 0.04 + Math.max(0, impactSpeed) * 0.028);
  const t = seconds / rise;
  return t <= 0 || t > 8 ? 0 : peak * t * Math.exp(1 - t);
}

/**
 * Writes the seated pose from scratch: pelvis on the seat point (the instance's origin),
 * back reclined, thighs along the cushion, shins down to the pedals.
 * @param {Float32Array} pose
 * @param {{restPosition: Float32Array}} body
 */
export function writeSeatedPose(pose, body) {
  resetPose(pose);
  pose[POSE_HIPS_TRANSLATION + 1] = 0.1 - body.restPosition[BONE.HIPS * 3 + 1];
  pose[POSE_HIPS_TRANSLATION + 2] = 0.02;
  turnBone(pose, BONE.SPINE, 1, 0, 0, 0.16);
  turnBone(pose, BONE.NECK, 1, 0, 0, -0.12);
  bendLeg(pose, -1, 1.32, 1.12);
  bendLeg(pose, 1, 1.28, 0.98);
  turnBone(pose, BONE.UPPER_ARM_L, 1, 0, 0, 0.5);
  turnBone(pose, BONE.UPPER_ARM_R, 1, 0, 0, 0.5);
}

/**
 * Reaches both hands for two points (character space), blended in by `weight`: the rim of the
 * steering wheel, or above the head for an arrest. The fk state is brought up to date first.
 * @param {Float32Array} pose
 * @param {object} body
 * @param {object} fk
 * @param {ArrayLike<number>} grips [lx, ly, lz, rx, ry, rz]
 * @param {number} weight 0..1
 * @param {number} poleY How far down the elbows point (-1 down .. 0 out).
 */
export function reachBothHands(pose, body, fk, grips, weight, poleY = -0.8) {
  if (weight <= 0.001) return;
  computeForwardKinematics(body, pose, fk);
  for (let side = 0; side < 2; side += 1) {
    const limb = side === 0 ? ARM_L : ARM_R, o = side * 3;
    const upper = limb.upper * 4, lower = limb.lower * 4;
    quatCopy(kept, 0, pose, upper);
    quatCopy(kept, 4, pose, lower);
    reachWithLimb(pose, body, fk, limb, grips[o], grips[o + 1], grips[o + 2], limb.side, poleY, 0.35);
    if (weight < 0.999) {
      quatNlerp(pose, upper, kept, 0, pose, upper, weight);
      quatNlerp(pose, lower, kept, 4, pose, lower, weight);
    }
  }
}

/**
 * The limp body of a wasted lead, lying on its back: knees a little bent, arms flung out.
 * @param {Float32Array} pose
 * @param {number} weight 0..1
 */
export function sprawlPose(pose, weight) {
  if (weight <= 0.001) return;
  bendLeg(pose, -1, 0.25 * weight, 0.45 * weight);
  bendLeg(pose, 1, 0.1 * weight, 0.2 * weight);
  turnBone(pose, BONE.UPPER_ARM_L, 0, 0, 1, -1.1 * weight);
  turnBone(pose, BONE.UPPER_ARM_R, 0, 0, 1, 0.9 * weight);
  turnBone(pose, BONE.HEAD, 0, 1, 0, 0.5 * weight);
}

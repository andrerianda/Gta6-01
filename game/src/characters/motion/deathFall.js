// Falls in four directions (deaths, knock-downs) and the matching get-ups. Backwards is the
// existing sit-down-and-roll-back of reactionPose.js; forwards drops onto the knees and topples
// face down (prone: one arm up beside the turned head, the other along the side, one knee drawn
// out); sideways buckles into a crouch and goes over onto the hip and side (lying on that side,
// knees bent, the lower arm reaching ahead on the ground). Get-ups: from the front, pushes up into
// a crouch and stands; from a side, rolls up to sitting and continues as from the back. Every pose
// is written in character space with lengths from the body; the controller blends the returned
// weight over the person's current pose, as it does for writeFallSequence.
import { orientBoneTo, reachWithLimb } from '../ik/limbPosing.js';
import { computeForwardKinematics } from '../skeleton/forwardKinematics.js';
import { ARMS, BONE, LEGS } from '../skeleton/humanSkeleton.js';
import { blendPoses, resetPose } from '../skeleton/poseBuffer.js';
import { quatFromYawPitchRoll, quatIdentity, smoothStep } from '../skeleton/quaternionMath.js';
import { writeCrouchPose, writeFallSequence, writeGroundSitPose, writeLyingPose } from './reactionPose.js';
import { placeSeatedHips, plantLeg, writeTrunk } from './seatedPose.js';
import { writeKneelingPose } from './surrenderPose.js';

/** The directions a person can fall: the way the body goes (a blow from the front: 'back'). */
export const FALL_DIRECTIONS = Object.freeze(['back', 'forward', 'left', 'right']);

const q = new Float32Array(4);
const T = new Float32Array(3), C = new Float32Array(3), N = new Float32Array(3), H = new Float32Array(3);
const set3 = (a, x, y, z) => { a[0] = x; a[1] = y; a[2] = z; return a; };

/**
 * The way a person falls from a blow: from the direction towards the attacker or the blast, in
 * character space (a unit vector on the ground, -Z in front). Front and back are favoured.
 * @param {number} fromX
 * @param {number} fromZ
 * @returns {'back' | 'forward' | 'left' | 'right'}
 */
export function fallDirectionFrom(fromX, fromZ) {
  if (Math.abs(fromZ) >= Math.abs(fromX) * 0.8) return fromZ <= 0 ? 'back' : 'forward';
  return fromX < 0 ? 'right' : 'left';
}

/** Lying face down: head turned to the left cheek, right arm up beside it, left arm along the side. */
export function writeProneLyingPose(pose, body, fk, time = 0) {
  resetPose(pose);
  const s = body.legScale, hs = body.heightScale, breath = Math.sin(time * 2.2) * 0.012;
  writeTrunk(pose, -1.52, 0.04, set3(T, 0, -0.02, 0), set3(C, 0, -0.02 + breath, 0), set3(N, 0, 0.16, 0),
    set3(H, 0.95, 0.1, 0));
  placeSeatedHips(pose, body, fk, 0, 0.12 * hs, 0);
  computeForwardKinematics(body, pose, fk, BONE.ROOT, BONE.TOE_R);
  for (const leg of LEGS) {
    const drawn = leg.side < 0; // the left knee drawn out to the side
    plantLeg(pose, body, fk, leg, leg.side * (body.hipHalfWidth + (drawn ? 0.24 : 0.06)) * s,
      body.ankleHeight * 0.9 + 0.09 * s, // heels up on tucked toes: the balls on the ground
      (drawn ? 0.62 : 0.86) * s, leg.side, drawn ? 0.2 : -0.3, 0, -1.35, leg.side * (drawn ? 0.5 : 0.15));
  }
  const p = fk.position;
  for (const arm of ARMS) {
    const u = arm.upper * 3;
    if (arm.side > 0) { // up beside the head, elbow bent out
      reachWithLimb(pose, body, fk, arm, p[u] + 0.28 * hs, 0.05 * hs, p[u + 2] - 0.3 * hs, 1, 0.4, 0.2);
    } else { // down along the side, palm up
      reachWithLimb(pose, body, fk, arm, p[u] - 0.14 * hs, 0.05 * hs, p[u + 2] + 0.48 * hs, -0.3, 1, 0);
    }
    quatIdentity(pose, arm.end * 4);
    computeForwardKinematics(body, pose, fk, arm.end, arm.end);
  }
  return pose;
}

/**
 * Lying on one side (side 1: on the right side, head towards +X, the way a fall to the right
 * ends; -1 the mirror): knees bent forward, the lower arm ahead on the ground, the upper arm draped
 * in front of the chest.
 */
export function writeSideLyingPose(pose, body, fk, side, time = 0) {
  resetPose(pose);
  const s = body.legScale, hs = body.heightScale, breath = Math.sin(time * 2.2) * 0.012;
  const roll = -side * 1.45;
  writeTrunk(pose, -0.1, roll, set3(T, 0, -0.1, 0), set3(C, 0, -0.12 + breath, 0), set3(N, 0, -0.08, -side * 0.28),
    set3(H, 0, -0.05, -side * 0.1));
  const hipX = side * 0.15 * hs;
  placeSeatedHips(pose, body, fk, hipX, 0.1 * hs + body.hipHalfWidth, 0);
  computeForwardKinematics(body, pose, fk, BONE.ROOT, BONE.TOE_R);
  for (const leg of LEGS) {
    const under = leg.side === side;
    reachWithLimb(pose, body, fk, leg, hipX - side * 0.72 * s, under ? 0.08 * hs : 0.1 * hs + body.hipHalfWidth * 1.6,
      (under ? -0.12 : -0.3) * s, 0, 0, -1, 0.02);
    quatFromYawPitchRoll(q, 0, 0, -0.2, roll);
    orientBoneTo(pose, fk, leg.end, q, 0);
    quatIdentity(pose, leg.tip * 4);
    computeForwardKinematics(body, pose, fk, leg.tip, leg.tip);
  }
  const p = fk.position;
  for (const arm of ARMS) {
    const u = arm.upper * 3;
    if (arm.side === side) { // the lower arm reaching ahead along the ground
      reachWithLimb(pose, body, fk, arm, p[u] + side * 0.18 * hs, 0.05 * hs, p[u + 2] - 0.38 * hs, side * 0.9, 0.3, 0.4);
    } else { // the upper arm draped forward, hand on the ground in front of the chest
      reachWithLimb(pose, body, fk, arm, p[u] - side * 0.15 * hs, 0.05 * hs, p[u + 2] - 0.3 * hs, side * 0.2, 1, 0.5);
    }
    quatIdentity(pose, arm.end * 4);
    computeForwardKinematics(body, pose, fk, arm.end, arm.end);
  }
  return pose;
}

/** The lying pose a fall in `direction` ends in ('back': on the back). */
export function writeLyingPoseAfter(pose, body, fk, direction, time = 0) {
  if (direction === 'forward') return writeProneLyingPose(pose, body, fk, time);
  if (direction === 'left' || direction === 'right') return writeSideLyingPose(pose, body, fk, direction === 'right' ? 1 : -1, time);
  return writeLyingPose(pose, body, fk, time);
}

/**
 * Writes the fall in `direction` (getUp false) or the get-up from the pose that fall ends in
 * (getUp true) at progress t (0..1) into `pose`, and returns the weight to lay it over the
 * person's standing pose with. Same contract as writeFallSequence (which is used for 'back').
 * @param {Float32Array} pose
 * @param {Float32Array} spare
 * @param {import('../skeleton/bodyMeasurements.js').BodyModel} body
 * @param {import('../skeleton/forwardKinematics.js').FkState} fk
 * @param {number} t
 * @param {'back' | 'forward' | 'left' | 'right'} direction
 * @param {boolean} getUp
 * @param {number} [time]
 * @returns {number}
 */
export function writeDirectionalFall(pose, spare, body, fk, t, direction, getUp, time = 0) {
  if (direction !== 'forward' && direction !== 'left' && direction !== 'right') {
    return writeFallSequence(pose, spare, body, fk, t, getUp, time);
  }
  t = Math.max(0, Math.min(1, t));
  const forward = direction === 'forward';
  if (!getUp) { // the knees give (onto them, or into a crouch), then over: faster as it goes
    const knees = forward ? 0.4 : 0.32;
    if (forward) writeKneelingPose(pose, body, fk, time);
    else writeCrouchPose(pose, body, fk, false, time);
    if (t < knees) return smoothStep(0, 1, t / knees) ** 1.3;
    writeLyingPoseAfter(spare, body, fk, direction, time);
    const k = (t - knees) / (1 - knees);
    blendPoses(pose, pose, spare, Math.min(1, k * k * (2.2 - 1.2 * k)));
    return 1;
  }
  if (forward) { // push up into a crouch, then stand
    if (t < 0.45) {
      writeProneLyingPose(pose, body, fk, time);
      writeCrouchPose(spare, body, fk, false, time);
      blendPoses(pose, pose, spare, smoothStep(0, 0.45, t));
      return 1;
    }
    writeCrouchPose(pose, body, fk, false, time);
    return 1 - smoothStep(0.62, 1, t);
  }
  if (t < 0.3) { // roll up to sitting, then as from the back
    writeSideLyingPose(pose, body, fk, direction === 'right' ? 1 : -1, time);
    writeGroundSitPose(spare, body, fk, time);
    blendPoses(pose, pose, spare, smoothStep(0, 0.3, t));
    return 1;
  }
  return writeFallSequence(pose, spare, body, fk, t, true, time);
}

// A pedestrian's body in danger: crouching low on the balls of the feet (with the arms wrapped over
// the head to cower, or the forearms on the knees), sitting on the ground propped on the hands,
// lying on the back, the fall from standing to lying and the get-up back to standing as timed
// sequences through those key poses, and the flinch of being hit (an additive jolt of the trunk
// and head away from the blow). Whole-body poses reset the pose and place the hips themselves;
// every length comes from the body.
import { reachWithLimb } from '../ik/limbPosing.js';
import { computeForwardKinematics } from '../skeleton/forwardKinematics.js';
import { ARMS, BONE, LEGS } from '../skeleton/humanSkeleton.js';
import { blendPoses, resetPose } from '../skeleton/poseBuffer.js';
import { quatFromYawPitchRoll, quatIdentity, quatMultiply, quatRotate, smoothStep } from '../skeleton/quaternionMath.js';
import { placeSeatedHips, plantLeg, writeTrunk } from './seatedPose.js';

/** Seconds of the fall from standing to lying, and of getting up again. */
export const FALL_SECONDS = 1.0;
export const GETUP_SECONDS = 1.7;

const v = new Float32Array(4);
const turn = new Float32Array(4);
const T = new Float32Array(3), C = new Float32Array(3), N = new Float32Array(3), H = new Float32Array(3);
const set3 = (a, x, y, z) => { a[0] = x; a[1] = y; a[2] = z; return a; };
/** How a flinch is shared out: bone, share of the bend and twist, share of the sideways roll. */
const FLINCH_SHARES = Object.freeze([[BONE.SPINE, 0.35, 0.3], [BONE.CHEST, 0.45, 0.4], [BONE.NECK, 0.3, 0.2], [BONE.HEAD, 0.5, 0.3]]);

/**
 * A deep crouch on the balls of the feet, trunk folded forward.
 * @param {Float32Array} pose Reset and written.
 * @param {import('../skeleton/bodyMeasurements.js').BodyModel} body
 * @param {import('../skeleton/forwardKinematics.js').FkState} fk
 * @param {boolean} cover True: the arms wrapped over the head, face down (cowering). False: the
 *   forearms on the knees, looking ahead (crouching, getting up).
 * @param {number} [time] Seconds, for the tremble and breathing.
 */
export function writeCrouchPose(pose, body, fk, cover, time = 0) {
  resetPose(pose);
  const s = body.legScale, a = body.armLength / 0.58, shake = cover ? Math.sin(time * 9.1) * 0.012 : 0;
  const breath = Math.sin(time * (cover ? 3.2 : 1.8)) * 0.015;
  writeTrunk(pose, -0.6, 0, set3(T, 0, -0.22 + breath, 0), set3(C, 0, cover ? -0.32 : -0.12, shake),
    set3(N, 0, cover ? -0.25 : 0.32, 0), set3(H, 0, cover ? -0.3 : 0.3, 0));
  placeSeatedHips(pose, body, fk, 0, 0.42 * s, 0.1 * s);
  computeForwardKinematics(body, pose, fk, BONE.ROOT, BONE.TOE_R);
  for (const leg of LEGS) {
    plantLeg(pose, body, fk, leg, leg.side * (body.hipHalfWidth + 0.08) * s, body.ankleHeight + 0.07 * s, -0.12 * s,
      leg.side * 0.35, 0.2, -1, -0.5, -leg.side * 0.15);
  }
  const p = fk.position;
  for (const arm of ARMS) {
    const side = arm.side;
    if (cover) { // hands over the back of the head, elbows forward round the face
      quatRotate(v, 0, fk.rotation, BONE.HEAD * 4, side * 0.065 * a, 0.12 * a + shake, 0.05 * a);
      const h = BONE.HEAD * 3;
      reachWithLimb(pose, body, fk, arm, p[h] + v[0], p[h + 1] + v[1], p[h + 2] + v[2], side * 0.25, -0.5, -1);
      quatFromYawPitchRoll(pose, arm.end * 4, 0, 0.45, 0);
    } else { // forearms resting on the knees
      const k = LEGS[arm.index].lower * 3;
      reachWithLimb(pose, body, fk, arm, p[k] - side * 0.02, p[k + 1] + 0.03 * s, p[k + 2] - 0.1 * s, side * 0.6, -0.4, 0.5);
      quatIdentity(pose, arm.end * 4);
    }
    computeForwardKinematics(body, pose, fk, arm.end, arm.end);
  }
  return pose;
}

/** Sitting on the ground after a fall, leaning back on straight arms, knees up. */
export function writeGroundSitPose(pose, body, fk, time = 0) {
  resetPose(pose);
  const s = body.legScale, hs = body.heightScale, breath = Math.sin(time * 2.4) * 0.02;
  writeTrunk(pose, 0.32, 0, set3(T, 0, 0.1, 0), set3(C, 0, 0.04 + breath, 0), set3(N, 0, -0.22, 0), set3(H, 0, -0.18, 0));
  placeSeatedHips(pose, body, fk, 0, 0.1 * hs, 0);
  computeForwardKinematics(body, pose, fk, BONE.ROOT, BONE.TOE_R);
  for (const leg of LEGS) {
    plantLeg(pose, body, fk, leg, leg.side * (body.hipHalfWidth + 0.05) * s, body.ankleHeight, -0.52 * s,
      leg.side * 0.25, 1, -0.4, 0.1, -leg.side * 0.2);
  }
  for (const arm of ARMS) {
    reachWithLimb(pose, body, fk, arm, arm.side * (body.shoulderHalfWidth + 0.06), 0.04 * hs, 0.3 * s, arm.side * 0.3, 0, 1);
    quatFromYawPitchRoll(pose, arm.end * 4, 0, 0.9, 0); // palms flat on the ground, fingers back
    computeForwardKinematics(body, pose, fk, arm.end, arm.end);
  }
  return pose;
}

/** Lying on the back, one knee raised, arms out on the ground, head turned a little. */
export function writeLyingPose(pose, body, fk, time = 0) {
  resetPose(pose);
  const s = body.legScale, hs = body.heightScale, breath = Math.sin(time * 2.2) * 0.02;
  writeTrunk(pose, 1.5, 0, set3(T, 0, 0.02, 0), set3(C, 0, 0.02 + breath, 0), set3(N, 0, -0.15, 0), set3(H, 0.35, -0.12, 0));
  placeSeatedHips(pose, body, fk, 0, 0.1 * hs, 0);
  computeForwardKinematics(body, pose, fk, BONE.ROOT, BONE.TOE_R);
  for (const leg of LEGS) {
    const raised = leg.side > 0;
    plantLeg(pose, body, fk, leg, leg.side * (body.hipHalfWidth + (raised ? 0.06 : 0.12)) * s,
      body.ankleHeight * (raised ? 1 : 0.8), (raised ? -0.58 : -0.8) * s, leg.side * 0.2, 1, -0.3,
      raised ? 0.15 : 1.25, -leg.side * (raised ? 0.1 : 0.45));
  }
  const p = fk.position;
  for (const arm of ARMS) {
    const u = arm.upper * 3;
    reachWithLimb(pose, body, fk, arm, p[u] + arm.side * 0.42 * s, 0.05 * hs, p[u + 2] - (arm.side > 0 ? 0.18 : -0.05) * s,
      0, 1, -0.3);
    quatIdentity(pose, arm.end * 4);
    computeForwardKinematics(body, pose, fk, arm.end, arm.end);
  }
  return pose;
}

/**
 * Writes the key-pose sequence of falling onto the back (getUp false) or getting up from lying
 * (getUp true) at progress t (0..1) into `pose`, and returns the weight to lay it over the
 * person's standing pose with (blendPoses(current, current, pose, weight)).
 * @param {Float32Array} pose
 * @param {Float32Array} spare A second pose for the blend.
 * @param {import('../skeleton/bodyMeasurements.js').BodyModel} body
 * @param {import('../skeleton/forwardKinematics.js').FkState} fk
 * @param {number} t
 * @param {boolean} getUp
 * @param {number} [time]
 * @returns {number}
 */
export function writeFallSequence(pose, spare, body, fk, t, getUp, time = 0) {
  t = Math.max(0, Math.min(1, t));
  if (!getUp) { // knees give, sit down hard, then roll back flat
    writeGroundSitPose(pose, body, fk, time);
    if (t < 0.42) return smoothStep(0, 1, t / 0.42) ** 1.4;
    writeLyingPose(spare, body, fk, time);
    blendPoses(pose, pose, spare, smoothStep(0.42, 1, t));
    return 1;
  }
  if (t < 0.3) { // sit up
    writeLyingPose(pose, body, fk, time);
    writeGroundSitPose(spare, body, fk, time);
    blendPoses(pose, pose, spare, smoothStep(0, 0.3, t));
    return 1;
  }
  if (t < 0.62) { // feet in, onto the balls of the feet
    writeGroundSitPose(pose, body, fk, time);
    writeCrouchPose(spare, body, fk, false, time);
    blendPoses(pose, pose, spare, smoothStep(0.3, 0.62, t));
    return 1;
  }
  writeCrouchPose(pose, body, fk, false, time); // and stand
  return 1 - smoothStep(0.62, 1, t);
}

/** The flinch envelope `age` seconds after a hit: a 60 ms jolt and a 0.2 s settle. */
export function flinchEnvelope(age) {
  if (!(age >= 0) || age > 0.9) return 0;
  return age < 0.06 ? age / 0.06 : Math.exp(-(age - 0.06) / 0.2);
}

/**
 * Jolts the trunk and head away from a blow (additive, over any pose with fk up to date).
 * @param {Float32Array} pose
 * @param {import('../skeleton/bodyMeasurements.js').BodyModel} body
 * @param {import('../skeleton/forwardKinematics.js').FkState} fk Updated from the spine on.
 * @param {number} fromX Where the blow comes from, character space (unit vector on the ground).
 * @param {number} fromZ
 * @param {number} amount 0..1 (the envelope times the blow's strength).
 */
export function applyFlinch(pose, body, fk, fromX, fromZ, amount) {
  if (amount <= 0) return;
  const pitch = -fromZ * 0.32 * amount, roll = fromX * 0.26 * amount, yaw = -fromX * 0.15 * amount;
  for (let i = 0; i < 4; i += 1) {
    const [bone, k, r] = FLINCH_SHARES[i];
    quatFromYawPitchRoll(turn, 0, yaw * k, pitch * k, roll * r);
    quatMultiply(pose, bone * 4, turn, 0, pose, bone * 4);
  }
  // The arms jerk in towards the body.
  for (const arm of ARMS) {
    quatFromYawPitchRoll(turn, 0, 0, -0.35 * amount, -arm.side * 0.25 * amount);
    quatMultiply(pose, arm.lower * 4, turn, 0, pose, arm.lower * 4);
  }
  computeForwardKinematics(body, pose, fk, BONE.SPINE, BONE.HAND_R);
}

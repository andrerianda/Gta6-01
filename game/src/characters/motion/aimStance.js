// The shooter's stance under an aimed weapon (owner, 09:10): the whole body drops into it, not
// only the arms. Over any lower-body pose (standing, walking, strafing) it lowers and pushes back
// the hips, turns the pelvis towards the strong side, leans the trunk forward from the hips, and
// re-plants the feet wider and staggered (support foot forward, strong foot back and turned out),
// so the knees bend; moving, the same offsets ride on the gait's feet (a crouched tactical walk)
// and most of the gait's vertical bob is taken out so the head and gun stay level. The arms, the
// spine's twist to the target and the head come from the aim layer written after it. Pure maths
// over the pose buffer; no allocation; lengths scale with the body.
import { orientBoneTo, reachWithLimb } from '../ik/limbPosing.js';
import { computeForwardKinematics } from '../skeleton/forwardKinematics.js';
import { BONE, LEGS } from '../skeleton/humanSkeleton.js';
import { POSE_HIPS_TRANSLATION } from '../skeleton/poseBuffer.js';
import { quatFromYawPitchRoll, quatMultiply } from '../skeleton/quaternionMath.js';

/** The stance at 1.78 m (metres scale with the body; angles in radians). */
export const AIM_STANCE = Object.freeze({
  drop: 0.08, // hips lowered (knees bent about 25 degrees more than standing)
  back: 0.04, // hips pushed back
  hipPitch: 0.12, // pelvis tipped forward (the trunk leans from the hips; the aim layer adds the rest)
  hipYaw: -0.28, // pelvis turned towards the strong (right) side
  width: 0.1, // each foot further out (ankles about 0.4 m apart, feet about 0.5 m)
  supportForward: 0.1, // left foot ahead
  strongBack: 0.08, // right foot behind...
  strongTurn: -0.4, // ...turned out
  steady: 0.7, // share of the gait's vertical bob taken out of the hips
});

const ankle = new Float64Array(6);
const foot = new Float32Array(8);
const q = new Float32Array(4);

/**
 * Writes the stance over a pose whose forward kinematics `fk` is up to date.
 * @param {Float32Array} pose
 * @param {import('../skeleton/bodyMeasurements.js').BodyModel} body
 * @param {import('../skeleton/forwardKinematics.js').FkState} fk
 * @param {number} weight 0 standing as the gait has it .. 1 in the stance (the aim's raise).
 * @param {number} [restHipsY] The hips translation's height when standing still (to take out the bob).
 * @returns {Float32Array} pose
 */
export function writeAimStance(pose, body, fk, weight, restHipsY = 0) {
  if (!(weight > 0)) return pose;
  const s = body.heightScale, w = Math.min(1, weight), S = AIM_STANCE, p = fk.position, r = fk.rotation;
  for (let k = 0; k < 2; k += 1) {
    const end = LEGS[k].end;
    for (let i = 0; i < 3; i += 1) ankle[k * 3 + i] = p[end * 3 + i];
    for (let i = 0; i < 4; i += 1) foot[k * 4 + i] = r[end * 4 + i];
  }
  // The feet: wider, the left ahead, the right behind and turned out.
  ankle[0] -= S.width * s * w; ankle[2] -= S.supportForward * s * w;
  ankle[3] += S.width * s * w; ankle[5] += S.strongBack * s * w;
  quatFromYawPitchRoll(q, 0, S.strongTurn * w, 0, 0);
  quatMultiply(foot, 4, q, 0, foot, 4);
  // The hips: steadier, lower, back, tipped forward and turned to the strong side.
  const h = POSE_HIPS_TRANSLATION;
  pose[h + 1] += (restHipsY - pose[h + 1]) * S.steady * w - S.drop * s * w;
  pose[h + 2] += S.back * s * w;
  quatFromYawPitchRoll(q, 0, S.hipYaw * w, -S.hipPitch * w, 0);
  quatMultiply(pose, BONE.HIPS * 4, q, 0, pose, BONE.HIPS * 4);
  // The spine turned back by most of the pelvis's turn (the aim layer turns the chest to the target).
  quatFromYawPitchRoll(q, 0, -S.hipYaw * 0.6 * w, 0, 0);
  quatMultiply(pose, BONE.SPINE * 4, q, 0, pose, BONE.SPINE * 4);
  computeForwardKinematics(body, pose, fk);
  for (let k = 0; k < 2; k += 1) {
    const leg = LEGS[k];
    reachWithLimb(pose, body, fk, leg, ankle[k * 3], ankle[k * 3 + 1], ankle[k * 3 + 2], 0, 0, -1, 0.004);
    orientBoneTo(pose, fk, leg.end, foot, k * 4);
    computeForwardKinematics(body, pose, fk, leg.end, leg.tip);
  }
  return pose;
}

// The shooter's stance under an aimed weapon (owner, 09:10; coordinator's correction 09:1x): the
// whole body drops into it, not only the arms. Over any lower-body pose (standing, walking,
// strafing) it tips the trunk forward from the hips so the shoulders come ahead of the hips (over
// the front foot's toes), lowers the hips a little and pushes them back a few centimetres, turns
// the pelvis a little towards the strong side, and re-plants the feet staggered (support foot
// forward, strong foot back and turned out) with the knees bent a little and tracking over the
// toes; moving, the same offsets ride on the gait's feet (a crouched tactical walk) and most of the
// gait's vertical bob is taken out so the head and gun stay level. The arms, the trunk's turn to
// the target and the head come from the aim layer written after it. Pure maths over the pose
// buffer; no allocation; lengths scale with the body.
import { orientBoneTo, reachWithLimb } from '../ik/limbPosing.js';
import { computeForwardKinematics } from '../skeleton/forwardKinematics.js';
import { BONE, LEGS } from '../skeleton/humanSkeleton.js';
import { POSE_HIPS_TRANSLATION } from '../skeleton/poseBuffer.js';
import { quatFromAxisAngle, quatFromYawPitchRoll, quatMultiply } from '../skeleton/quaternionMath.js';

/** The stance at 1.78 m (metres scale with the body; angles in radians). */
export const AIM_STANCE = Object.freeze({
  drop: 0.08, // hips lowered about 7 cm in all (the bob taken out gives some back) (knees bent about 20 degrees more than standing)
  back: 0.035, // hips pushed back
  hipPitch: 0.31, // the trunk tipped forward from the hips (the aim layer's spine adds a little): in the game pelvis-to-neck 16-17 degrees

  hipYaw: -0.2, // pelvis turned towards the strong (right) side
  width: 0.05, // each foot further out at least (moving: a strafe already spreads the feet)...
  stanceWidth: 0.45, // ...and standing, the ankles this far apart side to side (QA 10:50, owner 0.45-0.55 m)
  supportForward: 0.12, // left foot ahead...
  strongBack: 0.1, // ...right foot behind (about 22 cm apart front to back)...
  strongTurn: -0.4, // ...and turned out
  strongKnee: 0.3, // share of that turn the rear knee follows (it tracks forward, not bowed out)
  heelLift: 0.01, // the rear heel light: the ankle raised and the foot pitched onto its ball
  steady: 0.7, // share of the gait's vertical bob taken out of the hips
});

const ankle = new Float64Array(6);
const toes = new Float64Array(4);
const knees = new Float64Array(4);
const foot = new Float32Array(8);
const q = new Float32Array(4);

/**
 * Writes the stance over a pose whose forward kinematics `fk` is up to date.
 * @param {Float32Array} pose
 * @param {import('../skeleton/bodyMeasurements.js').BodyModel} body
 * @param {import('../skeleton/forwardKinematics.js').FkState} fk
 * @param {number} weight 0 standing as the gait has it .. 1 in the stance (the aim's raise).
 * @param {number} [restHipsY] The hips translation's height when standing still (to take out the bob).
 * @param {number} [hipTurn] An extra turn of the pelvis (rad, + to the left: a swing driving from the hips).
 * @param {number} [shift] The weight moved onto the front foot (+1, a throw stepping through) or
 *   the rear one (-1); the rear heel rises as it goes forward.
 * @param {number} [still] 1 standing still .. 0 walking: how much of the standing width to spread to.
 * @returns {Float32Array} pose
 */
export function writeAimStance(pose, body, fk, weight, restHipsY = 0, hipTurn = 0, shift = 0, still = 1) {
  if (!(weight > 0)) return pose;
  const s = body.heightScale, w = Math.min(1, weight), S = AIM_STANCE, p = fk.position, r = fk.rotation;
  for (let k = 0; k < 2; k += 1) {
    const end = LEGS[k].end, tip = LEGS[k].tip;
    for (let i = 0; i < 3; i += 1) ankle[k * 3 + i] = p[end * 3 + i];
    for (let i = 0; i < 4; i += 1) foot[k * 4 + i] = r[end * 4 + i];
    const tx = p[tip * 3] - p[end * 3], tz = p[tip * 3 + 2] - p[end * 3 + 2], n = Math.hypot(tx, tz) || 1;
    toes[k * 2] = tx / n; toes[k * 2 + 1] = tz / n;
  }
  // The feet: a little wider, the left ahead, the right behind, turned out and up on its ball.
  const turn = S.strongTurn * w, c = Math.cos(turn), sn = Math.sin(turn);
  const kt = turn * S.strongKnee, kc = Math.cos(kt), ks = Math.sin(kt);
  knees[0] = toes[0]; knees[1] = toes[1];
  knees[2] = toes[2] * kc + toes[3] * ks; knees[3] = -toes[2] * ks + toes[3] * kc;
  // (standing, each foot goes out by half of what the stance's width lacks; walking, by `width`)
  const spread = Math.max(S.width * s, (S.stanceWidth * s - (ankle[3] - ankle[0])) * 0.5 * still) * w;
  ankle[0] -= spread; ankle[2] -= S.supportForward * s * w;
  ankle[3] += spread; ankle[5] += S.strongBack * s * w;
  const lift = (S.heelLift + 0.04 * Math.max(0, shift)) * s * w;
  ankle[4] += lift;
  quatFromYawPitchRoll(q, 0, turn, 0, 0);
  quatMultiply(foot, 4, q, 0, foot, 4);
  const rx = toes[2] * c + toes[3] * sn, rz = -toes[2] * sn + toes[3] * c;
  toes[2] = rx; toes[3] = rz;
  // Toes down about the foot's cross axis (toes x up) so the ball stays on the ground.
  quatFromAxisAngle(q, 0, rz, 0, -rx, Math.asin(Math.min(0.5, lift / (0.15 * s))));
  quatMultiply(foot, 4, q, 0, foot, 4);
  // The hips: steadier, a little lower and back, the trunk tipped forward, turned to the strong side.
  const h = POSE_HIPS_TRANSLATION;
  pose[h + 1] += (restHipsY - pose[h + 1]) * S.steady * w - S.drop * s * w;
  pose[h + 2] += (S.back - 0.1 * shift) * s * w;
  quatFromYawPitchRoll(q, 0, (S.hipYaw + hipTurn) * w, -S.hipPitch * w, 0);
  quatMultiply(pose, BONE.HIPS * 4, q, 0, pose, BONE.HIPS * 4);
  computeForwardKinematics(body, pose, fk);
  for (let k = 0; k < 2; k += 1) { // the front knee over its toes, the rear one tracking forward
    const leg = LEGS[k];
    reachWithLimb(pose, body, fk, leg, ankle[k * 3], ankle[k * 3 + 1], ankle[k * 3 + 2], knees[k * 2], 0, knees[k * 2 + 1], 0.004);
    orientBoneTo(pose, fk, leg.end, foot, k * 4);
    computeForwardKinematics(body, pose, fk, leg.end, leg.tip);
  }
  return pose;
}

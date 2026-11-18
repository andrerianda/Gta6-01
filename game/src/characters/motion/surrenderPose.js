// Giving up: hands raised in surrender, hands laced behind the head, wrists together behind the
// back (handcuffed), and kneeling on both knees for an arrest. The hands are an upper-body layer
// written over any pose; kneeling is a whole-body pose (the controller blends into it). Lengths
// come from the body, so every person kneels with knees on the ground and toes tucked under.
import { orientBoneTo, reachWithLimb } from '../ik/limbPosing.js';
import { computeForwardKinematics } from '../skeleton/forwardKinematics.js';
import { ARMS, BONE, LEGS } from '../skeleton/humanSkeleton.js';
import { POSE_FOOT_CONTACT, POSE_HIPS_TRANSLATION, resetPose } from '../skeleton/poseBuffer.js';
import { quatFromAxisAngle, quatFromYawPitchRoll, quatIdentity, quatRotate } from '../skeleton/quaternionMath.js';

/** Where the hands go: up beside the head, laced behind it, or together behind the back. */
export const HAND_POSES = Object.freeze(['up', 'head', 'behind']);

const v = new Float32Array(8);
const turn = new Float32Array(4);

/**
 * Writes the arms of a surrendering or arrested person over a pose whose FK is up to date.
 * @param {Float32Array} pose
 * @param {import('../skeleton/bodyMeasurements.js').BodyModel} body
 * @param {import('../skeleton/forwardKinematics.js').FkState} fk
 * @param {'up' | 'head' | 'behind'} hands
 * @param {number} [time] Seconds, for the small tremble of raised hands.
 * @returns {Float32Array} pose
 */
export function writeHandsPose(pose, body, fk, hands, time = 0) {
  const p = fk.position, chest = BONE.CHEST * 4, s = body.armLength / 0.58;
  const shake = Math.sin(time * 7.3) * 0.006 + Math.sin(time * 3.1) * 0.004;
  quatFromYawPitchRoll(pose, BONE.SHOULDER_L * 4, 0, 0, hands === 'up' ? -0.12 : 0);
  quatFromYawPitchRoll(pose, BONE.SHOULDER_R * 4, 0, 0, hands === 'up' ? 0.12 : 0);
  computeForwardKinematics(body, pose, fk, BONE.SHOULDER_L, BONE.HAND_R);
  for (const arm of ARMS) {
    const side = arm.side, u3 = arm.upper * 3;
    let ox = 0, oy = 0, oz = 0, px = 0, py = 0, pz = 0, from = u3;
    if (hands === 'up') { // upper arms out and a little up, forearms upright, palms forward
      ox = side * body.upperArmLength * 0.9; oy = body.forearmLength * 0.92 + body.upperArmLength * 0.18 + shake;
      oz = -0.05 * s; px = side; py = -0.5; pz = 0.25;
    } else if (hands === 'head') { // fingers laced behind the head, elbows wide
      from = BONE.HEAD * 3;
      ox = side * 0.075 * s; oy = 0.07 * s; oz = 0.075 * s; px = side; py = 0.25; pz = -0.35;
    } else { // wrists crossed behind the lower back
      from = BONE.SPINE * 3;
      ox = side * 0.03 * s; oy = -0.02 * s; oz = 0.17 * s; px = side * 0.5; py = -0.2; pz = 0.9;
    }
    quatRotate(v, 0, fk.rotation, chest, ox, oy, oz);
    quatRotate(v, 3, fk.rotation, chest, px, py, pz);
    reachWithLimb(pose, body, fk, arm, p[from] + v[0], p[from + 1] + v[1], p[from + 2] + v[2], v[3], v[4], v[5]);
    // The hand: straight on the wrist for raised palms, bent back behind the head.
    if (hands === 'head') quatFromAxisAngle(pose, arm.end * 4, 1, 0, 0, 0.5);
    else quatIdentity(pose, arm.end * 4);
    computeForwardKinematics(body, pose, fk, arm.end, arm.end);
  }
  return pose;
}

/**
 * Writes a whole-body pose kneeling on both knees, upright, on the balls of the feet, with the
 * arms hanging (lay writeHandsPose over it for the hands).
 * @param {Float32Array} pose Reset and written.
 * @param {import('../skeleton/bodyMeasurements.js').BodyModel} body
 * @param {import('../skeleton/forwardKinematics.js').FkState} fk Receives the joints.
 * @param {number} [time] Seconds, for breathing.
 * @returns {Float32Array} pose
 */
export function writeKneelingPose(pose, body, fk, time = 0) {
  resetPose(pose);
  const rest = body.restPosition, s = body.legScale;
  const kneeY = 0.055 * s, kneeAhead = 0.07 * s, back = 0.04 * s;
  const ankleY = body.ballForward * 0.9 + 0.015;
  const thighY = kneeY + Math.sqrt(Math.max(0, body.thighLength ** 2 - kneeAhead ** 2));
  const breath = Math.sin(time * 1.6);
  pose[POSE_HIPS_TRANSLATION] = 0;
  pose[POSE_HIPS_TRANSLATION + 1] = thighY - rest[BONE.THIGH_L * 3 + 1];
  pose[POSE_HIPS_TRANSLATION + 2] = back;
  quatFromYawPitchRoll(pose, BONE.HIPS * 4, 0, 0.06, 0);
  quatFromYawPitchRoll(pose, BONE.SPINE * 4, 0, -0.08 + breath * 0.006, 0);
  quatFromYawPitchRoll(pose, BONE.CHEST * 4, 0, -0.04 + breath * 0.012, 0);
  quatFromYawPitchRoll(pose, BONE.NECK * 4, 0, 0.02, 0);
  quatFromYawPitchRoll(pose, BONE.HEAD * 4, 0, 0.0, 0);
  computeForwardKinematics(body, pose, fk, 0, BONE.HAND_R);
  for (const leg of LEGS) {
    const u3 = leg.upper * 3, p = fk.position;
    computeForwardKinematics(body, pose, fk, leg.upper, leg.upper);
    const kneeZ = p[u3 + 2] - kneeAhead, drop = kneeY - ankleY;
    const ankleZ = kneeZ + Math.sqrt(Math.max(0, body.shinLength ** 2 - drop * drop)) * 0.99;
    reachWithLimb(pose, body, fk, leg, p[u3] * 1.05, ankleY, ankleZ, 0, 0, -1, 0.003);
    quatFromYawPitchRoll(turn, 0, 0, -1.3, 0); // the foot upright on its ball, toes tucked under
    orientBoneTo(pose, fk, leg.end, turn, 0);
    quatFromAxisAngle(pose, leg.tip * 4, 1, 0, 0, 1.15);
    computeForwardKinematics(body, pose, fk, leg.tip, leg.tip);
    pose[POSE_FOOT_CONTACT + leg.index] = 1;
  }
  return pose;
}

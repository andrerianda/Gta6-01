// The gestures the story's scenes need beyond the character run-time's own (salute, halt, talk,
// point, phone): holding something out (offer), taking it with both hands (take) and hauling a
// cover or a curtain hand over hand (pull). Each is an upper-body pose written over a finished
// pose with the run-time's own arm solver, so it blends with standing and walking. No three.js.
import { reachWithLimb } from '../characters/ik/limbPosing.js';
import { computeForwardKinematics } from '../characters/skeleton/forwardKinematics.js';
import { ARM_L, ARM_R, BONE } from '../characters/skeleton/humanSkeleton.js';
import { quatFromYawPitchRoll, quatRotate } from '../characters/skeleton/quaternionMath.js';

/** The gestures written here (the others are the locomotion controller's). */
export const SCENE_GESTURES = Object.freeze(['offer', 'take', 'pull']);

/** Scene gesture -> the controller's gesture of the same meaning. */
export const CONTROLLER_GESTURES = Object.freeze({ salute: 'salute', halt: 'halt', talk: 'talk', point: 'point', phone_ear: 'phone' });

const v = new Float32Array(3);

function reach(pose, body, fk, arm, x, y, z, poleX, poleY, poleZ, handPitch, handRoll) {
  const c = BONE.CHEST * 3, p = fk.position;
  quatRotate(v, 0, fk.rotation, BONE.CHEST * 4, x, y, z);
  reachWithLimb(pose, body, fk, arm, p[c] + v[0], p[c + 1] + v[1], p[c + 2] + v[2], poleX, poleY, poleZ);
  quatFromYawPitchRoll(pose, arm.end * 4, 0, handPitch, handRoll);
  computeForwardKinematics(body, pose, fk, arm.end, arm.end);
}

/**
 * Writes a scene gesture over a pose whose fk is up to date.
 * @param {Float32Array} pose
 * @param {import('../characters/skeleton/bodyMeasurements.js').BodyModel} body
 * @param {import('../characters/skeleton/forwardKinematics.js').FkState} fk
 * @param {'offer' | 'take' | 'pull'} gesture
 * @param {number} time Seconds since the gesture began.
 * @returns {Float32Array} pose
 */
export function writeSceneGesture(pose, body, fk, gesture, time) {
  const a = body.armLength / 0.58;
  if (gesture === 'offer') { // the right hand held out at the waist, palm up, a small settling dip
    const dip = Math.exp(-time * 2.2) * 0.03;
    reach(pose, body, fk, ARM_R, 0.14 * a, (-0.2 - dip) * a, -0.44 * a, 0.5, -1, 0.2, -0.25, -1.2);
  } else if (gesture === 'take') { // both hands out to receive, then drawn in to the body
    const drawn = Math.min(1, Math.max(0, (time - 0.9) / 0.8));
    const z = -0.42 + 0.2 * drawn, y = -0.2 - 0.08 * drawn;
    reach(pose, body, fk, ARM_R, 0.13 * a, y * a, z * a, 0.6, -1, 0.3, -0.2, -0.5);
    reach(pose, body, fk, ARM_L, -0.13 * a, y * a, z * a, -0.6, -1, 0.3, -0.2, 0.5);
  } else if (gesture === 'pull') { // hand over hand: each arm reaches up ahead and hauls down to the hip
    for (const arm of [ARM_R, ARM_L]) {
      const phase = time * 2.4 + (arm.side > 0 ? 0 : Math.PI);
      const k = 0.5 + 0.5 * Math.sin(phase);
      reach(pose, body, fk, arm, arm.side * 0.15 * a, (0.22 - 0.5 * k) * a, (-0.5 + 0.26 * k) * a, arm.side * 0.7, -1, 0.3, 0.3, 0);
    }
  }
  return pose;
}

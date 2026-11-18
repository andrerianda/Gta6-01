// Puts a palm on a held object: the grip point of the hand at a place, the hand's grip frame
// turned to a given rotation, the arm reaching there with the elbow towards a pole. Shared by the
// aim layer, the carried weapons and the seated poses. No allocation.
import { orientBoneTo, reachWithLimb } from '../ik/limbPosing.js';
import { quatMultiplyConjRight, quatRotate } from '../skeleton/quaternionMath.js';

const v = new Float32Array(4);
const q = new Float32Array(4);

/**
 * Places a palm's grip point at (x, y, z) with its grip frame turned to the rotation q[o]:
 * the wrist goes where the palm offset says, the arm reaches it, and the hand turns to fit.
 * @param {Float32Array} pose
 * @param {import('../skeleton/bodyMeasurements.js').BodyModel} body
 * @param {import('../skeleton/forwardKinematics.js').FkState} fk Up to date for the arm's base.
 * @param {import('../skeleton/humanSkeleton.js').Limb} arm ARM_L or ARM_R.
 * @param {Float32Array} rotation The grip frame's rotation (character space) at offset o.
 * @param {number} o
 * @param {number} x The grip point, character space.
 * @param {number} y
 * @param {number} z
 * @param {number} px The elbow's pole direction, character space.
 * @param {number} py
 * @param {number} pz
 * @param {number} [softness] The reach's ease-out share (default the limb's; small to let the arm go straight).
 */
export function placeHand(pose, body, fk, arm, rotation, o, x, y, z, px, py, pz, softness) {
  quatMultiplyConjRight(q, 0, rotation, o, body.gripRotation, arm.index * 4);
  const g = arm.index * 3;
  quatRotate(v, 0, q, 0, body.gripOffset[g], body.gripOffset[g + 1], body.gripOffset[g + 2]);
  reachWithLimb(pose, body, fk, arm, x - v[0], y - v[1], z - v[2], px, py, pz, softness);
  orientBoneTo(pose, fk, arm.end, q, 0);
}

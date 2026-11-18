// Puts a palm on a held object: the grip point of the hand at a place, the hand's grip frame
// turned to a given rotation, the arm reaching there with the elbow towards a pole. Shared by the
// aim layer, the carried weapons and the seated poses. No allocation.
//
// The forearm turns with the hand (owner, 11:08 "the arms look broken"): the rig has one forearm
// bone and no twist bones, so a hand rolled 100 degrees on its forearm (a support hand wrapping a
// pistol grip, a hand under a rifle's handguard) wrung the wrist's skin like a sweet wrapper. As
// the radius does in a real arm, the forearm now takes a share of the hand's roll about its own
// length (the wrist stays where it is; the hand keeps exactly its grip frame, so the weapon does
// not move), and the share grows so the wrist itself never rolls more than WRIST.maxTwist.
import { orientBoneTo, reachWithLimb } from '../ik/limbPosing.js';
import { quatFromAxisAngle, quatMultiply, quatMultiplyConjRight, quatRotate } from '../skeleton/quaternionMath.js';

/** How the hand's roll about the forearm is shared between the forearm and the wrist (radians). */
export const WRIST = Object.freeze({
  forearmShare: 0.55, // the forearm's share of the roll (pronation and supination happen along it)
  maxTwist: 0.75, // the most the wrist itself rolls (about 43 degrees)
  maxForearmTwist: 1.75, // the most the forearm rolls against the elbow's hinge (about 100 degrees)
});

const v = new Float32Array(4);
const q = new Float32Array(4);
const roll = new Float32Array(4);

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
  shareWristRoll(pose, body, fk, arm, q);
}

/**
 * Moves part of a hand's roll about its forearm into the forearm (see the header), keeping the
 * hand's character-space rotation `handRotation` and the wrist's place.
 * @param {Float32Array} pose
 * @param {import('../skeleton/bodyMeasurements.js').BodyModel} body
 * @param {import('../skeleton/forwardKinematics.js').FkState} fk Up to date for the arm.
 * @param {import('../skeleton/humanSkeleton.js').Limb} arm
 * @param {Float32Array} handRotation The hand's wanted rotation, character space (offset 0).
 */
export function shareWristRoll(pose, body, fk, arm, handRotation) {
  const off = body.restOffset, e = arm.end * 3, h = arm.end * 4;
  const n = Math.hypot(off[e], off[e + 1], off[e + 2]);
  if (!(n > 1e-6)) return;
  const ax = off[e] / n, ay = off[e + 1] / n, az = off[e + 2] / n; // the forearm's length, its own frame
  const t = ax * pose[h] + ay * pose[h + 1] + az * pose[h + 2], w = pose[h + 3];
  let twist = 2 * Math.atan2(t, w);
  if (twist > Math.PI) twist -= 2 * Math.PI;
  else if (twist < -Math.PI) twist += 2 * Math.PI;
  const W = WRIST, size = Math.abs(twist);
  let share = Math.max(W.forearmShare * size, size - W.maxTwist);
  share = Math.min(share, W.maxForearmTwist);
  if (!(share > 1e-4)) return;
  quatFromAxisAngle(roll, 0, ax, ay, az, Math.sign(twist) * share);
  const l = arm.lower * 4;
  quatMultiply(pose, l, pose, l, roll, 0);
  quatMultiply(fk.rotation, l, fk.rotation, arm.upper * 4, pose, l);
  orientBoneTo(pose, fk, arm.end, handRotation, 0);
}

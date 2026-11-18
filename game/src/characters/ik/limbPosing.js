// Poses an arm or a leg from where its bones should point, and reaches for targets with two-bone
// inverse kinematics. Everything is in character space and independent of the bone rolls in the
// file: a limb bone is turned so that its rest direction lands on the wanted direction and its
// rest hinge axis on the wanted hinge axis. The forward-kinematics state is kept up to date for
// the bones written, so the caller can go on to orient the hand or the foot.
import { BONE_PARENT } from '../skeleton/humanSkeleton.js';
import {
  quatFromBasis, quatMultiply, quatMultiplyConjLeft, quatMultiplyConjRight, quatRotate,
} from '../skeleton/quaternionMath.js';
import { createTwoBoneResult, solveTwoBone } from './twoBoneSolver.js';

const frame = new Float32Array(4);
const solved = createTwoBoneResult();

/**
 * Turns a limb's two bones to point along given directions.
 * @param {Float32Array} pose The pose to write.
 * @param {import('../skeleton/bodyMeasurements.js').BodyModel} body
 * @param {import('../skeleton/forwardKinematics.js').FkState} fk Up to date for the limb's base
 *   bone and first joint; updated for the limb's bones and joints.
 * @param {import('../skeleton/humanSkeleton.js').Limb} limb
 * @param {number} ux Unit direction of the upper bone, character space.
 * @param {number} uy
 * @param {number} uz
 * @param {number} lx Unit direction of the lower bone.
 * @param {number} ly
 * @param {number} lz
 * @param {number} hx Unit hinge axis of the middle joint (perpendicular to the upper direction).
 * @param {number} hy
 * @param {number} hz
 */
export function poseLimbAlong(pose, body, fk, limb, ux, uy, uz, lx, ly, lz, hx, hy, hz) {
  const rotation = fk.rotation, position = fk.position, offset = body.restOffset;
  const upper = limb.upper, lower = limb.lower, end = limb.end;
  const parent = BONE_PARENT[upper];
  // Upper bone: the frame (hinge, direction, hinge x direction) against the same frame at rest.
  quatFromBasis(frame, 0, hx, hy, hz, ux, uy, uz, hy * uz - hz * uy, hz * ux - hx * uz, hx * uy - hy * ux);
  quatMultiplyConjRight(rotation, upper * 4, frame, 0, body.limbFrame, upper * 4);
  quatMultiplyConjLeft(pose, upper * 4, rotation, parent * 4, rotation, upper * 4);
  quatRotate(position, lower * 3, rotation, upper * 4, offset[lower * 3], offset[lower * 3 + 1], offset[lower * 3 + 2]);
  position[lower * 3] += position[upper * 3];
  position[lower * 3 + 1] += position[upper * 3 + 1];
  position[lower * 3 + 2] += position[upper * 3 + 2];
  // Lower bone: the same hinge, made perpendicular to its own direction.
  const along = hx * lx + hy * ly + hz * lz;
  let kx = hx - lx * along, ky = hy - ly * along, kz = hz - lz * along;
  const n = 1 / Math.max(1e-6, Math.hypot(kx, ky, kz));
  kx *= n; ky *= n; kz *= n;
  quatFromBasis(frame, 0, kx, ky, kz, lx, ly, lz, ky * lz - kz * ly, kz * lx - kx * lz, kx * ly - ky * lx);
  quatMultiplyConjRight(rotation, lower * 4, frame, 0, body.limbFrame, lower * 4);
  quatMultiplyConjLeft(pose, lower * 4, rotation, upper * 4, rotation, lower * 4);
  quatRotate(position, end * 3, rotation, lower * 4, offset[end * 3], offset[end * 3 + 1], offset[end * 3 + 2]);
  position[end * 3] += position[lower * 3];
  position[end * 3 + 1] += position[lower * 3 + 1];
  position[end * 3 + 2] += position[lower * 3 + 2];
}

/**
 * Reaches for a target with a limb: places the wrist or the ankle at a point (as far as the
 * limb's soft limits allow) with the elbow or knee towards a pole direction.
 * @param {Float32Array} pose
 * @param {import('../skeleton/bodyMeasurements.js').BodyModel} body
 * @param {import('../skeleton/forwardKinematics.js').FkState} fk Up to date for the limb's base.
 * @param {import('../skeleton/humanSkeleton.js').Limb} limb
 * @param {number} tx Target for the wrist or ankle joint, character space.
 * @param {number} ty
 * @param {number} tz
 * @param {number} px Pole direction for the elbow or knee, character space.
 * @param {number} py
 * @param {number} pz
 * @returns {number} How much of the distance was reached (1 when the target was within reach).
 */
export function reachWithLimb(pose, body, fk, limb, tx, ty, tz, px, py, pz) {
  const position = fk.position, u3 = limb.upper * 3;
  const upperLength = limb.leg ? body.thighLength : body.upperArmLength;
  const lowerLength = limb.leg ? body.shinLength : body.forearmLength;
  solveTwoBone(solved, tx - position[u3], ty - position[u3 + 1], tz - position[u3 + 2], px, py, pz,
    upperLength, lowerLength, limb.leg ? 0.05 : 0.08, limb.leg ? 0.3 : 0.2);
  poseLimbAlong(pose, body, fk, limb, solved[0], solved[1], solved[2], solved[3], solved[4], solved[5],
    solved[6], solved[7], solved[8]);
  return solved[15];
}

/**
 * Turns a bone so that its accumulated rotation becomes a given character-space rotation (a
 * hand to a grip, a foot flat on the ground).
 * @param {Float32Array} pose
 * @param {import('../skeleton/forwardKinematics.js').FkState} fk Up to date for the bone's parent.
 * @param {number} bone The bone to turn.
 * @param {ArrayLike<number>} rotation The wanted accumulated rotation.
 * @param {number} offset Its offset in `rotation`.
 */
export function orientBoneTo(pose, fk, bone, rotation, offset) {
  const parent = BONE_PARENT[bone];
  quatMultiplyConjLeft(pose, bone * 4, fk.rotation, parent * 4, rotation, offset);
  quatMultiply(fk.rotation, bone * 4, fk.rotation, parent * 4, pose, bone * 4);
}

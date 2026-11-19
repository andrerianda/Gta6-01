// Forward kinematics in character space: from a pose and a body's measurements to where every
// joint is and how every bone is turned. Because poses are written in canonical frames this is
// one quaternion product and one rotated offset per bone, with no reference to the file's bone
// rolls. Inverse kinematics, foot planting, the ragdoll and the tests all read its result.
import { BONE, BONE_COUNT, BONE_PARENT } from './humanSkeleton.js';
import { POSE_HIPS_TRANSLATION, POSE_ROOT_TRANSLATION } from './poseBuffer.js';
import { quatCopy, quatMultiply, quatRotate } from './quaternionMath.js';

/**
 * Where a posed skeleton is, in character space.
 * @typedef {object} FkState
 * @property {Float32Array} rotation Each bone's rotation away from rest, accumulated down the
 *   hierarchy (4 per bone): a rest-space direction of the bone turned by it is where it points now.
 * @property {Float32Array} position Each joint's position (3 per bone).
 */

/**
 * Creates the storage for a forward-kinematics result.
 * @returns {FkState}
 */
export function createFkState() {
  const rotation = new Float32Array(BONE_COUNT * 4);
  for (let bone = 0; bone < BONE_COUNT; bone += 1) rotation[bone * 4 + 3] = 1;
  return { rotation, position: new Float32Array(BONE_COUNT * 3) };
}

/**
 * Computes joint positions and accumulated rotations for a range of bones (parents first).
 * @param {import('./bodyMeasurements.js').BodyModel} body
 * @param {Float32Array} pose
 * @param {FkState} fk Receives the result.
 * @param {number} [first] First bone index (default 0).
 * @param {number} [last] Last bone index, inclusive (default: the last bone).
 * @returns {FkState} `fk`.
 */
export function computeForwardKinematics(body, pose, fk, first = 0, last = BONE_COUNT - 1) {
  const rotation = fk.rotation, position = fk.position, offset = body.restOffset;
  for (let bone = first; bone <= last; bone += 1) {
    const parent = BONE_PARENT[bone];
    const b3 = bone * 3, b4 = bone * 4;
    if (parent < 0) {
      quatCopy(rotation, b4, pose, b4);
      position[b3] = offset[b3] + pose[POSE_ROOT_TRANSLATION];
      position[b3 + 1] = offset[b3 + 1] + pose[POSE_ROOT_TRANSLATION + 1];
      position[b3 + 2] = offset[b3 + 2] + pose[POSE_ROOT_TRANSLATION + 2];
      continue;
    }
    const p3 = parent * 3, p4 = parent * 4;
    let ox = offset[b3], oy = offset[b3 + 1], oz = offset[b3 + 2];
    if (bone === BONE.HIPS) {
      ox += pose[POSE_HIPS_TRANSLATION];
      oy += pose[POSE_HIPS_TRANSLATION + 1];
      oz += pose[POSE_HIPS_TRANSLATION + 2];
    }
    quatRotate(position, b3, rotation, p4, ox, oy, oz);
    position[b3] += position[p3];
    position[b3 + 1] += position[p3 + 1];
    position[b3 + 2] += position[p3 + 2];
    quatMultiply(rotation, b4, rotation, p4, pose, b4);
  }
  return fk;
}

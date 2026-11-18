// The rig: binds the run-time's poses to one instantiated character asset. It finds the shared
// skeleton's bones by name, reads where every joint is at rest (so the body's measurements come
// from the file, whatever the person's size), and writes a pose to the bones. A pose holds
// rotations relative to rest in character space, so the roll each bone has in the file never
// matters: the bone's own rest orientation is folded in here, once.
//
//   const person = assets.instantiate('lead_a');
//   const rig = createCharacterRig(person, { stature: assets.get('lead_a').extras.height });
//   writeLocomotionPose(rig.pose, rig.body, rig.fk, { speed: 1.4, phase });
//   rig.applyPose();
//
// It needs no import from three.js: it only reads and writes position, quaternion and scale of
// the objects it is given, so it also runs on plain objects in Node tests.
import { createBodyModel } from '../skeleton/bodyMeasurements.js';
import { createFkState } from '../skeleton/forwardKinematics.js';
import { BONE, BONE_COUNT, BONE_NAMES, OPTIONAL_BONES } from '../skeleton/humanSkeleton.js';
import { POSE_HIPS_TRANSLATION, POSE_ROOT_TRANSLATION, createPose } from '../skeleton/poseBuffer.js';
import { quatMultiply, quatMultiplyConjLeft, quatRotate, quatRotateInverse } from '../skeleton/quaternionMath.js';

/**
 * A character instance ready to be posed.
 * @typedef {object} CharacterRig
 * @property {object} instance The instance root (a THREE.Object3D): move and turn the person with it.
 * @property {import('../skeleton/bodyMeasurements.js').BodyModel} body The body's measurements.
 * @property {Array<object | null>} bones The bone objects in BONE_NAMES order (null: not in the file).
 * @property {Float32Array} pose The rig's own pose buffer, for motions to write into.
 * @property {import('../skeleton/forwardKinematics.js').FkState} fk Joint positions of the last pose written by a motion.
 * @property {(pose?: Float32Array) => void} applyPose Writes a pose (default: the rig's own) to the bones.
 * @property {(name: string) => object | null} node Finds a node of the instance by name (an anchor, a mesh).
 */

const scratch = new Float32Array(8);

/**
 * Creates the rig of a character instance.
 * @param {object} instance The object returned by Asset.instantiate() for a character.
 * @param {object} [options]
 * @param {number} [options.stature] The person's height in metres (the asset's extras.height);
 *   estimated from the skeleton when left out.
 * @returns {CharacterRig}
 */
export function createCharacterRig(instance, options = {}) {
  /** @type {Map<string, object>} */
  const byName = new Map();
  instance.traverse((node) => {
    if (node.name && !byName.has(node.name)) byName.set(node.name, node);
  });
  const bones = BONE_NAMES.map((name) => byName.get(name) ?? null);
  bones.forEach((bone, index) => {
    if (!bone && !OPTIONAL_BONES.includes(BONE_NAMES[index])) {
      throw new Error(`character "${instance.name}" has no bone "${BONE_NAMES[index]}"`);
    }
  });

  // Rest transforms in character space (the instance root's space), composed down each chain.
  const restPosition = new Float32Array(BONE_COUNT * 3);
  const restRotation = new Float32Array(BONE_COUNT * 4);
  const parentRotation = new Float32Array(BONE_COUNT * 4);
  const parentScale = new Float32Array(BONE_COUNT).fill(1);
  const restLocal = new Float32Array(BONE_COUNT * 3);
  const local = [0, 0, 0, 1];
  for (let index = 0; index < BONE_COUNT; index += 1) {
    const bone = bones[index];
    restRotation[index * 4 + 3] = 1;
    parentRotation[index * 4 + 3] = 1;
    if (!bone) continue;
    const chain = [];
    for (let node = bone; node && node !== instance; node = node.parent) chain.unshift(node);
    const p = [0, 0, 0], q = [0, 0, 0, 1];
    let s = 1;
    for (const node of chain) {
      if (node === bone) {
        parentRotation.set(q, index * 4);
        parentScale[index] = s;
      }
      quatRotate(scratch, 0, q, 0, node.position.x * s, node.position.y * s, node.position.z * s);
      p[0] += scratch[0]; p[1] += scratch[1]; p[2] += scratch[2];
      local[0] = node.quaternion.x; local[1] = node.quaternion.y; local[2] = node.quaternion.z; local[3] = node.quaternion.w;
      quatMultiply(q, 0, q, 0, local, 0);
      s *= node.scale.x;
    }
    restPosition.set(p, index * 3);
    restRotation.set(q, index * 4);
    restLocal[index * 3] = bone.position.x;
    restLocal[index * 3 + 1] = bone.position.y;
    restLocal[index * 3 + 2] = bone.position.z;
  }
  const body = createBodyModel(restPosition, { hasJaw: Boolean(bones[BONE.JAW]), stature: options.stature });

  const moveBone = (index, pose, offset) => {
    quatRotateInverse(scratch, 4, parentRotation, index * 4, pose[offset], pose[offset + 1], pose[offset + 2]);
    const k = 1 / parentScale[index];
    bones[index].position.set(restLocal[index * 3] + scratch[4] * k, restLocal[index * 3 + 1] + scratch[5] * k,
      restLocal[index * 3 + 2] + scratch[6] * k);
  };

  /** @type {CharacterRig} */
  const rig = {
    instance,
    body,
    bones,
    pose: createPose(),
    fk: createFkState(),
    applyPose(pose = rig.pose) {
      for (let index = 0; index < BONE_COUNT; index += 1) {
        const bone = bones[index];
        if (!bone) continue;
        // local = conj(parent's rest) * (rotation from rest, in the parent's canonical frame) * own rest
        quatMultiplyConjLeft(scratch, 0, parentRotation, index * 4, pose, index * 4);
        quatMultiply(scratch, 0, scratch, 0, restRotation, index * 4);
        bone.quaternion.set(scratch[0], scratch[1], scratch[2], scratch[3]);
      }
      moveBone(BONE.ROOT, pose, POSE_ROOT_TRANSLATION);
      moveBone(BONE.HIPS, pose, POSE_HIPS_TRANSLATION);
    },
    node(name) {
      return byName.get(name) ?? null;
    },
  };
  return rig;
}

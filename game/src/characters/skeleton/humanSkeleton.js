// The one skeleton every person in MARAZUL shares: bone names (the contract with the character
// artist, art/blender/lib/naming.py SKELETON_BONES plus an optional jaw), their order, parents
// and the limb chains the run-time poses. Parents always come before children.

/** Bone names in index order. */
export const BONE_NAMES = Object.freeze([
  'root', 'hips', 'spine', 'chest', 'neck', 'head',
  'shoulder_l', 'upper_arm_l', 'forearm_l', 'hand_l',
  'shoulder_r', 'upper_arm_r', 'forearm_r', 'hand_r',
  'thigh_l', 'shin_l', 'foot_l', 'toe_l',
  'thigh_r', 'shin_r', 'foot_r', 'toe_r',
  'jaw',
]);

/** How many bones a pose holds (the jaw included, present in the file or not). */
export const BONE_COUNT = BONE_NAMES.length;

/** Bone indices by upper-case name: BONE.HIPS, BONE.UPPER_ARM_L ... */
export const BONE = Object.freeze({
  ROOT: 0, HIPS: 1, SPINE: 2, CHEST: 3, NECK: 4, HEAD: 5,
  SHOULDER_L: 6, UPPER_ARM_L: 7, FOREARM_L: 8, HAND_L: 9,
  SHOULDER_R: 10, UPPER_ARM_R: 11, FOREARM_R: 12, HAND_R: 13,
  THIGH_L: 14, SHIN_L: 15, FOOT_L: 16, TOE_L: 17,
  THIGH_R: 18, SHIN_R: 19, FOOT_R: 20, TOE_R: 21,
  JAW: 22,
});

/** The parent of each bone (-1 for the root). */
export const BONE_PARENT = Object.freeze([
  -1, 0, 1, 2, 3, 4,
  3, 6, 7, 8,
  3, 10, 11, 12,
  1, 14, 15, 16,
  1, 18, 19, 20,
  5,
]);

/** Bones the file may leave out. */
export const OPTIONAL_BONES = Object.freeze(['jaw']);

/**
 * A limb: the bones of an arm or a leg, and which side it is on.
 * @typedef {object} Limb
 * @property {number} index 0 for the left limb, 1 for the right.
 * @property {number} side -1 on the left, +1 on the right (+X is the character's right).
 * @property {number} base The bone the limb hangs from (shoulder or hips).
 * @property {number} upper Upper arm or thigh.
 * @property {number} lower Forearm or shin.
 * @property {number} end Hand or foot.
 * @property {number} tip Toe (legs only, -1 for arms).
 * @property {boolean} leg True for a leg.
 */

/** @type {Limb} */
export const ARM_L = Object.freeze({ index: 0, side: -1, base: 6, upper: 7, lower: 8, end: 9, tip: -1, leg: false });
/** @type {Limb} */
export const ARM_R = Object.freeze({ index: 1, side: 1, base: 10, upper: 11, lower: 12, end: 13, tip: -1, leg: false });
/** @type {Limb} */
export const LEG_L = Object.freeze({ index: 0, side: -1, base: 1, upper: 14, lower: 15, end: 16, tip: 17, leg: true });
/** @type {Limb} */
export const LEG_R = Object.freeze({ index: 1, side: 1, base: 1, upper: 18, lower: 19, end: 20, tip: 21, leg: true });

/** Both arms, left first. */
export const ARMS = Object.freeze([ARM_L, ARM_R]);
/** Both legs, left first. */
export const LEGS = Object.freeze([LEG_L, LEG_R]);

/** For each bone, the bone that mirrors it across the body's mid-plane. */
export const BONE_MIRROR = Object.freeze([
  0, 1, 2, 3, 4, 5,
  10, 11, 12, 13,
  6, 7, 8, 9,
  18, 19, 20, 21,
  14, 15, 16, 17,
  22,
]);

/**
 * The index of a bone name, or -1.
 * @param {string} name A bone name such as "forearm_l".
 * @returns {number}
 */
export function boneIndexOf(name) {
  return BONE_NAMES.indexOf(name);
}

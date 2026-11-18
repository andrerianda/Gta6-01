// The upper-body aim layer: written over any lower-body pose (standing, walking, strafing,
// kneeling), it points a held weapon at a target the way a person does. The spine and chest
// twist towards the target (with the bladed stance of the long guns), the head looks along the
// sights (cheek on the stock for a rifle or a shotgun), the shooting hand's palm anchor is placed
// on the line of fire with its barrel axis along it, and the off hand reaches for the weapon's
// fore grip. Recoil and reload are inputs (0..1 envelopes the controller plays as one-shot
// actions), and `raise` lowers the weapon to a low ready. Pure maths over the pose buffer; no
// allocation; every length comes from the body.
import { orientBoneTo, reachWithLimb } from '../ik/limbPosing.js';
import { writeLookAt } from '../rig/lookAt.js';
import { computeForwardKinematics } from '../skeleton/forwardKinematics.js';
import { ARM_L, ARM_R, BONE } from '../skeleton/humanSkeleton.js';
import {
  quatFromAxisAngle, quatFromBasis, quatFromYawPitchRoll, quatMultiply, quatMultiplyConjRight, quatRotate,
} from '../skeleton/quaternionMath.js';

/**
 * How each kind of weapon is held. Distances are metres (scaled by arm length / 0.58), in the
 * aim frame (forward along the line of fire, right, up) from the right shoulder ('shoulder') or
 * the middle of the shoulders ('centre'). offGrip is the off hand's grip in the weapon's frame
 * (from anchor_hand_r: -Z along the barrel, +Y up) when the weapon gives no anchor_grip_off.
 */
export const WEAPON_HOLDS = Object.freeze({
  pistol: Object.freeze({ hands: 1, from: 'shoulder', forward: 0.53, right: 0.0, up: -0.02, blade: 0.45,
    offGrip: null, offRoll: 0, kick: 0.22, push: 0.03, poleR: [0.6, -1, 0.2], headTilt: 0 }),
  pistol_two_hand: Object.freeze({ hands: 2, from: 'centre', forward: 0.53, right: 0.02, up: -0.03, blade: 0.08,
    offGrip: [-0.03, -0.035, 0.0], offRoll: 0.45, kick: 0.16, push: 0.025, poleR: [0.7, -1, 0], headTilt: 0 }),
  // (A long gun blades the other way: the left shoulder forward, the stock in the right one.)
  smg: Object.freeze({ hands: 2, from: 'shoulder', forward: 0.36, right: -0.05, up: -0.02, blade: -0.3,
    offGrip: [0, -0.045, -0.17], offRoll: 1.1, kick: 0.07, push: 0.02, poleR: [1, -0.7, 0.2], headTilt: 0.08 }),
  shotgun: Object.freeze({ hands: 2, from: 'shoulder', forward: 0.32, right: -0.05, up: 0.02, blade: -0.5,
    offGrip: [0, -0.04, -0.36], offRoll: 1.25, kick: 0.24, push: 0.07, poleR: [1, -0.6, 0.3], headTilt: 0.2 }),
  rifle: Object.freeze({ hands: 2, from: 'shoulder', forward: 0.32, right: -0.05, up: 0.02, blade: -0.5,
    offGrip: [0, -0.04, -0.31], offRoll: 1.25, kick: 0.08, push: 0.03, poleR: [1, -0.6, 0.3], headTilt: 0.2 }),
});

/**
 * What the aim layer is asked to do; keep one object per person and change its fields.
 * @typedef {object} AimInput
 * @property {string} hold A key of WEAPON_HOLDS.
 * @property {number} targetX The target in character space (+X right, +Y up, -Z ahead).
 * @property {number} targetY
 * @property {number} targetZ
 * @property {number} raise 1 aiming, 0 the weapon lowered to a low ready.
 * @property {number} recoil 0..1, the kick of a shot (decays after it).
 * @property {number} reload -1 not reloading, else progress 0..1.
 * @property {Float32Array | null} offGrip The weapon's anchor_grip_off in anchor_hand_r's frame, or null.
 */

/** @returns {AimInput} */
export function createAimInput() {
  return { hold: 'pistol', targetX: 0, targetY: 1.4, targetZ: -10, raise: 1, recoil: 0, reload: -1, offGrip: null };
}

const v = new Float32Array(16);
const q = new Float32Array(16);

/**
 * Writes the aim layer over a pose whose forward kinematics `fk` is up to date.
 * @param {Float32Array} pose
 * @param {import('../skeleton/bodyMeasurements.js').BodyModel} body
 * @param {import('../skeleton/forwardKinematics.js').FkState} fk Brought up to date for the upper body.
 * @param {AimInput} aim
 * @returns {Float32Array} pose
 */
export function writeAimPose(pose, body, fk, aim) {
  const hold = WEAPON_HOLDS[aim.hold] ?? WEAPON_HOLDS.pistol;
  const p = fk.position, scale = body.armLength / 0.58;
  const raise = Math.max(0, Math.min(1, aim.raise));
  const reload = aim.reload >= 0 && aim.reload <= 1 ? Math.sin(Math.PI * aim.reload) : 0;
  const ready = raise * (1 - reload);
  const sl = BONE.UPPER_ARM_L * 3, sr = BONE.UPPER_ARM_R * 3;

  // The line of fire from the middle of the shoulders, lowered towards a low ready.
  let dx = aim.targetX - (p[sl] + p[sr]) / 2, dy = aim.targetY - (p[sl + 1] + p[sr + 1]) / 2;
  let dz = aim.targetZ - (p[sl + 2] + p[sr + 2]) / 2;
  const yaw = Math.atan2(-dx, -dz);
  const pitch = Math.atan2(dy, Math.hypot(dx, dz)) * ready + (1 - ready) * -0.75;

  // The trunk twists towards the target (and blades for a long gun), the spine bends with pitch.
  quatRotate(v, 0, fk.rotation, BONE.CHEST * 4, 0, 0, -1);
  let twist = yaw + hold.blade * raise - Math.atan2(-v[0], -v[2]);
  twist = Math.max(-1.3, Math.min(1.3, twist - 2 * Math.PI * Math.round(twist / (2 * Math.PI))));
  const bend = pitch * 0.3 + aim.recoil * hold.kick * 0.15;
  quatFromYawPitchRoll(q, 0, twist * 0.45, bend * 0.5, 0);
  quatMultiply(pose, BONE.SPINE * 4, q, 0, pose, BONE.SPINE * 4);
  quatFromYawPitchRoll(q, 0, twist * 0.55, bend * 0.5, 0);
  quatMultiply(pose, BONE.CHEST * 4, q, 0, pose, BONE.CHEST * 4);
  computeForwardKinematics(body, pose, fk, BONE.SPINE, BONE.HAND_R);
  writeLookAt(pose, body, fk, aim.targetX, aim.targetY, aim.targetZ, 0.4 + 0.6 * raise);
  if (hold.headTilt > 0) {
    quatFromYawPitchRoll(q, 0, 0, -hold.headTilt * 0.5 * ready, -hold.headTilt * ready);
    quatMultiply(pose, BONE.HEAD * 4, q, 0, pose, BONE.HEAD * 4);
    computeForwardKinematics(body, pose, fk, BONE.HEAD, BONE.HEAD);
  }

  // The aim frame (forward, right, up) and the barrel: kicked up by recoil, tipped by a reload.
  const cp = Math.cos(pitch), fx = -Math.sin(yaw) * cp, fy = Math.sin(pitch), fz = -Math.cos(yaw) * cp;
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);
  const ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy;
  const kick = aim.recoil * hold.kick + reload * 0.55;
  const ck = Math.cos(kick), sk = Math.sin(kick);
  dx = fx * ck + ux * sk; dy = fy * ck + uy * sk; dz = fz * ck + uz * sk;
  const ex = ux * ck - fx * sk, ey = uy * ck - fy * sk, ez = uz * ck - fz * sk; // the barrel's up
  // Weapon frame: X right (= up x back), Y up, Z back along the barrel.
  quatFromBasis(q, 0, ey * -dz - ez * -dy, ez * -dx - ex * -dz, ex * -dy - ey * -dx, ex, ey, ez, -dx, -dy, -dz);
  quatFromAxisAngle(q, 4, dx, dy, dz, -reload * 0.6); // a reload cants the weapon over
  quatMultiply(q, 0, q, 4, q, 0);

  // Where the shooting palm goes.
  const base = hold.from === 'centre' ? -1 : sr;
  const ox = base < 0 ? (p[sl] + p[sr]) / 2 : p[sr], oy = base < 0 ? (p[sl + 1] + p[sr + 1]) / 2 : p[sr + 1];
  const oz = base < 0 ? (p[sl + 2] + p[sr + 2]) / 2 : p[sr + 2];
  const fwd = (hold.forward - aim.recoil * hold.push) * scale, side = hold.right * scale, up = hold.up * scale;
  let gx = ox + fx * fwd + rx * side + ux * up, gy = oy + fy * fwd + uy * up, gz = oz + fz * fwd + rz * side + uz * up;
  if (reload > 0) { // brought in to the chest, a little low
    const cx = (p[sl] + p[sr]) / 2 - Math.sin(yaw) * 0.32 * scale, cz = (p[sl + 2] + p[sr + 2]) / 2 - Math.cos(yaw) * 0.32 * scale;
    gx += (cx - gx) * reload; gy += ((p[sr + 1] - 0.2 * scale) - gy) * reload; gz += (cz - gz) * reload;
  }
  placeHand(pose, body, fk, ARM_R, q, 0, gx, gy, gz, hold.poleR[0], hold.poleR[1], hold.poleR[2]);

  // The off hand on the fore grip (or wrapped round the shooting hand), off to the magazine in a reload.
  if (hold.hands === 2) {
    const grip = aim.offGrip ?? hold.offGrip;
    quatRotate(v, 0, q, 0, grip[0] * scale, grip[1] * scale, grip[2] * scale);
    let hx = gx + v[0], hy = gy + v[1], hz = gz + v[2];
    const r = aim.reload;
    if (r >= 0 && r <= 1) { // 0.15..0.5 down to the belt and back with a magazine, then on again
      const away = Math.sin(Math.PI * Math.max(0, Math.min(1, (r - 0.12) / 0.5)));
      const bx = p[BONE.HIPS * 3] - 0.14 * scale, by = p[BONE.HIPS * 3 + 1] + 0.05, bz = p[BONE.HIPS * 3 + 2] - 0.08;
      hx += (bx - hx) * away; hy += (by - hy) * away; hz += (bz - hz) * away;
    }
    quatFromAxisAngle(q, 8, -dx, -dy, -dz, hold.offRoll);
    quatMultiply(q, 8, q, 8, q, 0);
    placeHand(pose, body, fk, ARM_L, q, 8, hx, hy, hz, -0.3, -1, 0.15);
  }
  return pose;
}

/**
 * Places a palm's grip point at (x, y, z) with its grip frame turned to the rotation q[o]:
 * the wrist goes where the palm offset says, the arm reaches it, and the hand turns to fit.
 */
export function placeHand(pose, body, fk, arm, rotation, o, x, y, z, px, py, pz) {
  quatMultiplyConjRight(q, 12, rotation, o, body.gripRotation, arm.index * 4);
  const g = arm.index * 3;
  quatRotate(v, 4, q, 12, body.gripOffset[g], body.gripOffset[g + 1], body.gripOffset[g + 2]);
  reachWithLimb(pose, body, fk, arm, x - v[4], y - v[5], z - v[6], px, py, pz);
  orientBoneTo(pose, fk, arm.end, q, 12);
}

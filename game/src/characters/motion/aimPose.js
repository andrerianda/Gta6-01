// The upper-body aim layer: written over any lower-body pose (standing, walking, strafing,
// kneeling), it points a held weapon at a target the way a person does. Handguns are held at
// shoulder height on the line from the right shoulder (two hands: the middle of the shoulders) to
// the target: shoulder, wrist and muzzle on one line, the arm straight out (elbow almost straight,
// wrist straight), the pistol upright; the trunk leans a little forward and turns the right
// shoulder into the shot, the head bows and turns to look along the arm, a free left arm hangs
// relaxed. Long guns sit in the shoulder pocket with the cheek
// on the stock. The off hand takes the fore grip (or wraps the shooting hand). Lowered, a handgun
// hangs at the side with the muzzle down and a long gun rests at a low ready across the body.
// Recoil and reload are inputs (0..1 envelopes the controller plays as one-shot actions). Pure
// maths over the pose buffer; no allocation; every length comes from the body.
import { orientBoneTo, reachWithLimb } from '../ik/limbPosing.js';
import { writeLookAt } from '../rig/lookAt.js';
import { computeForwardKinematics } from '../skeleton/forwardKinematics.js';
import { ARM_L, ARM_R, BONE } from '../skeleton/humanSkeleton.js';
import {
  quatFromAxisAngle, quatFromBasis, quatFromYawPitchRoll, quatMultiply, quatMultiplyConjRight, quatNlerp, quatRotate,
  smoothStep,
} from '../skeleton/quaternionMath.js';

/**
 * How each kind of weapon is held. sight: true (handguns) puts the MUZZLE on the line from the
 * right shoulder (two hands: the middle of the shoulders) to the target, the barrel along that
 * line and the wrist at `reach` (share of the arm's length) from the right shoulder; `muzzle` is
 * the muzzle in the weapon's frame when the weapon gives none (AimInput.muzzle); otherwise (long guns) the grip
 * goes at forward / right / up metres (scaled by arm length / 0.58) in the aim frame from the right
 * shoulder. blade: the trunk's turn into the shot (rad, + left: the right shoulder forward). lean:
 * the trunk's forward lean (rad). shoulderLift / shoulderForward: the shooting collarbone raised
 * and brought forward (rad). headTilt: the head bowed and inclined towards the right arm (rad).
 * lowered: 'side' (hanging
 * by the thigh, muzzle down) or 'across' (low ready across the body). offGrip: the off hand's
 * grip in the weapon's frame (from anchor_hand_r: -Z along the barrel, +Y up) when the weapon
 * gives no anchor_grip_off.
 */
// Every handgun (owner, 09:05): the trained two-handed isosceles stance. The sights come up to the
// right (dominant) eye: the muzzle on the line from just under the right eye (`below`) to the
// target, both arms forward with soft elbows, the support hand wrapped round the shooting hand,
// the trunk square to the shot and leant forward 12 degrees, shoulders rolled forward, the head
// lowered and tilted into the sights.
const ISOSCELES = Object.freeze({ hands: 2, sight: true, reach: 0.985, blade: 0.0, lean: 0.21, shoulderLift: 0,
  shoulderForward: 0.2, headTilt: 0.2, lowered: 'side', from: 'eye', below: 0.05, forward: 0.53, right: 0, up: 0,
  muzzle: [0, 0.035, -0.17], offGrip: [-0.03, -0.035, 0.0], offRoll: -1.9, kick: 0.16, push: 0.025, poleR: [0.7, -1, 0] });
/** The right eye in the head bone's frame (metres at 1.78 m): the sights come up to it. */
const RIGHT_EYE = Object.freeze([0.032, 0.075, -0.085]);

export const WEAPON_HOLDS = Object.freeze({
  pistol: ISOSCELES,
  // One hand (a drive-by from a seat; the controller picks it when seated): the arm straight out
  // from the right shoulder at shoulder height, the right collarbone forward.
  pistol_one_hand: Object.freeze({ hands: 1, sight: true, reach: 0.995, blade: 0.16, lean: 0.12, shoulderLift: 0.06,
    shoulderForward: 0.42, headTilt: 0.24, lowered: 'side', from: 'shoulder', forward: 0.53, right: 0, up: 0,
    muzzle: [0, 0.035, -0.17], offGrip: null, offRoll: 0, kick: 0.22, push: 0.03, poleR: [0.45, -1, 0.05] }),
  pistol_two_hand: ISOSCELES, // the earlier name of the two-handed hold
  // (A long gun blades the other way: the left shoulder forward, the stock in the right one.)
  smg: Object.freeze({ hands: 2, sight: false, from: 'shoulder', forward: 0.36, right: -0.05, up: -0.02, blade: -0.3,
    shoulderLift: 0, shoulderForward: 0, lowered: 'across',
    offGrip: [0, -0.045, -0.17], offRoll: 1.1, kick: 0.07, push: 0.02, poleR: [1, -0.7, 0.2], headTilt: 0.08 }),
  shotgun: Object.freeze({ hands: 2, sight: false, from: 'shoulder', forward: 0.32, right: -0.05, up: 0.02, blade: -0.5,
    shoulderLift: 0, shoulderForward: 0, lowered: 'across',
    offGrip: [0, -0.04, -0.36], offRoll: 1.25, kick: 0.24, push: 0.07, poleR: [1, -0.6, 0.3], headTilt: 0.2 }),
  rifle: Object.freeze({ hands: 2, sight: false, from: 'shoulder', forward: 0.32, right: -0.05, up: 0.02, blade: -0.5,
    shoulderLift: 0, shoulderForward: 0, lowered: 'across',
    offGrip: [0, -0.04, -0.31], offRoll: -0.32, kick: 0.08, push: 0.03, poleR: [1, -0.6, 0.3], headTilt: 0.2 }),
});

/**
 * Aims within this pitch of level (rad, 15 degrees) hold the weapon level, at shoulder height;
 * beyond it the arm tilts by the excess (owner, 09:00: the aim camera looks a little down, so the
 * point under the reticle lies on the ground ahead; the arm must not follow it down).
 */
export const AIM_LEVEL_BAND = 0.26;
const levelled = (pitch) => (pitch > AIM_LEVEL_BAND ? pitch - AIM_LEVEL_BAND : pitch < -AIM_LEVEL_BAND ? pitch + AIM_LEVEL_BAND : 0);

/** A lowered handgun: the grip beside the thigh (from the right shoulder) and the muzzle's pitch. */
const SIDE_GRIP = Object.freeze([0.045, -0.6, -0.11]);
const SIDE_PITCH = -1.2;
/** A lowered long gun: the muzzle down and turned across the body (to the left). */
const ACROSS_PITCH = -0.75, ACROSS_YAW = 0.45;

/**
 * What the aim layer is asked to do; keep one object per person and change its fields.
 * @typedef {object} AimInput
 * @property {string} hold A key of WEAPON_HOLDS.
 * @property {number} targetX The target in character space (+X right, +Y up, -Z ahead).
 * @property {number} targetY
 * @property {number} targetZ
 * @property {number} raise 1 aiming, 0 the weapon lowered.
 * @property {number} recoil 0..1, the kick of a shot (decays after it).
 * @property {number} reload -1 not reloading, else progress 0..1.
 * @property {Float32Array | null} offGrip The weapon's anchor_grip_off in anchor_hand_r's frame, or null.
 * @property {Float32Array | null} muzzle The weapon's anchor_muzzle in anchor_hand_r's frame, or null.
 */

/** @returns {AimInput} */
export function createAimInput() {
  return { hold: 'pistol', targetX: 0, targetY: 1.4, targetZ: -10, raise: 1, recoil: 0, reload: -1, offGrip: null, muzzle: null };
}

const v = new Float32Array(16);
const q = new Float32Array(16);
const held = new Float32Array(12);
const wrapAngle = (a) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));

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

  // The direction to the target from the middle of the shoulders (the trunk's turn).
  let dx = aim.targetX - (p[sl] + p[sr]) / 2, dy = aim.targetY - (p[sl + 1] + p[sr + 1]) / 2;
  let dz = aim.targetZ - (p[sl + 2] + p[sr + 2]) / 2;
  let yawA = Math.atan2(-dx, -dz), pitchA = levelled(Math.atan2(dy, Math.hypot(dx, dz)));

  // The trunk twists towards the target (bladed by the hold), the spine bends with the pitch.
  quatRotate(v, 0, fk.rotation, BONE.CHEST * 4, 0, 0, -1);
  let twist = wrapAngle(yawA + hold.blade * raise - Math.atan2(-v[0], -v[2]));
  twist = Math.max(-1.3, Math.min(1.3, twist));
  const bend = pitchA * ready * 0.3 - (hold.lean ?? 0) * ready + aim.recoil * hold.kick * 0.15;
  quatFromYawPitchRoll(q, 0, twist * 0.45, bend * 0.5, 0);
  quatMultiply(pose, BONE.SPINE * 4, q, 0, pose, BONE.SPINE * 4);
  quatFromYawPitchRoll(q, 0, twist * 0.55, bend * 0.5, 0);
  quatMultiply(pose, BONE.CHEST * 4, q, 0, pose, BONE.CHEST * 4);
  // The shooting shoulder raised and forward (in the chest's frame).
  if (hold.shoulderLift > 0 || hold.shoulderForward > 0) {
    quatFromYawPitchRoll(q, 0, hold.shoulderForward * ready, 0, hold.shoulderLift * ready);
    quatMultiply(pose, BONE.SHOULDER_R * 4, q, 0, pose, BONE.SHOULDER_R * 4);
  }
  computeForwardKinematics(body, pose, fk, BONE.SPINE, BONE.HAND_R);
  writeLookAt(pose, body, fk, aim.targetX, aim.targetY, aim.targetZ, 0.4 + 0.6 * raise);
  if (hold.headTilt > 0) { // inclined towards the right arm (the sights, or the cheek on the stock)
    quatFromYawPitchRoll(q, 0, 0, -hold.headTilt * 0.5 * ready, -hold.headTilt * ready);
    quatMultiply(pose, BONE.HEAD * 4, q, 0, pose, BONE.HEAD * 4);
    computeForwardKinematics(body, pose, fk, BONE.HEAD, BONE.HEAD);
  }

  // Handguns: the line from the right shoulder (two hands: the middle of the shoulders, the gun on
  // the body's midline) to the target, at shoulder height.
  let lineX = 0, lineY = 0, lineZ = 0;
  if (hold.sight && hold.from === 'eye') { // just under the right eye (the head is posed by now)
    const hs = body.heightScale, h = BONE.HEAD * 3;
    quatRotate(v, 12, fk.rotation, BONE.HEAD * 4, RIGHT_EYE[0] * hs, RIGHT_EYE[1] * hs, RIGHT_EYE[2] * hs);
    lineX = p[h] + v[12]; lineY = p[h + 1] + v[13] - (hold.below ?? 0) * hs; lineZ = p[h + 2] + v[14];
    dx = aim.targetX - lineX; dy = aim.targetY - lineY; dz = aim.targetZ - lineZ;
    yawA = Math.atan2(-dx, -dz); pitchA = levelled(Math.atan2(dy, Math.hypot(dx, dz)));
  } else if (hold.sight) {
    const centre = hold.hands === 2;
    lineX = centre ? (p[sl] + p[sr]) / 2 : p[sr]; lineY = centre ? (p[sl + 1] + p[sr + 1]) / 2 : p[sr + 1];
    lineZ = centre ? (p[sl + 2] + p[sr + 2]) / 2 : p[sr + 2];
    dx = aim.targetX - lineX; dy = aim.targetY - lineY; dz = aim.targetZ - lineZ;
    yawA = Math.atan2(-dx, -dz); pitchA = levelled(Math.atan2(dy, Math.hypot(dx, dz)));
  }
  if (!hold.sight) pitchA = levelled(Math.atan2(aim.targetY - p[sr + 1], Math.hypot(aim.targetX - p[sr], aim.targetZ - p[sr + 2])));

  // The barrel's direction: aimed, or lowered (handgun muzzle down at the side, long gun across).
  const side = hold.lowered === 'side';
  const yawL = side ? -0.12 : yawA + ACROSS_YAW, pitchL = side ? SIDE_PITCH : ACROSS_PITCH;
  const yaw = yawL + wrapAngle(yawA - yawL) * ready, pitch = pitchL + (pitchA - pitchL) * ready;
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
  const push = aim.recoil * hold.push * scale;
  let gx, gy, gz;
  if (hold.sight) {
    // The muzzle on the line, the wrist where the arm's reach meets it (hold.reach of its length:
    // elbow almost straight), the grip between them, pushed back by recoil. With the wrist-to-grip
    // offset o and the grip-to-muzzle offset m (world): wrist = line + f t - o - m, |wrist - S| = R.
    const g = ARM_R.index * 3, mz = aim.muzzle ?? hold.muzzle;
    quatMultiplyConjRight(q, 12, q, 0, body.gripRotation, ARM_R.index * 4);
    quatRotate(v, 4, q, 12, body.gripOffset[g], body.gripOffset[g + 1], body.gripOffset[g + 2]);
    if (mz) quatRotate(v, 8, q, 0, mz[0], mz[1], mz[2]);
    else { v[8] = 0; v[9] = 0; v[10] = 0; }
    const mx = v[8], my = v[9], mzz = v[10], R = body.armLength * hold.reach;
    const wx = lineX - p[sr] - v[4] - mx, wy = lineY - p[sr + 1] - v[5] - my, wz = lineZ - p[sr + 2] - v[6] - mzz;
    const b = wx * fx + wy * fy + wz * fz, c = wx * wx + wy * wy + wz * wz - R * R;
    const t = -b + Math.sqrt(Math.max(0, b * b - c));
    const ax = lineX + fx * (t - push) - mx, ay = lineY + fy * (t - push) - my, az = lineZ + fz * (t - push) - mzz;
    const lx = p[sr] + SIDE_GRIP[0] * scale, ly = p[sr + 1] + SIDE_GRIP[1] * scale, lz = p[sr + 2] + SIDE_GRIP[2] * scale;
    gx = lx + (ax - lx) * ready; gy = ly + (ay - ly) * ready; gz = lz + (az - lz) * ready;
  } else {
    const base = hold.from === 'centre';
    const ox = base ? (p[sl] + p[sr]) / 2 : p[sr], oy = base ? (p[sl + 1] + p[sr + 1]) / 2 : p[sr + 1];
    const oz = base ? (p[sl + 2] + p[sr + 2]) / 2 : p[sr + 2];
    const fwd = hold.forward * scale - push, right = hold.right * scale, up = hold.up * scale;
    gx = ox + fx * fwd + rx * right + ux * up; gy = oy + fy * fwd + uy * up; gz = oz + fz * fwd + rz * right + uz * up;
  }
  if (reload > 0) { // brought in to the chest, a little low
    const cx = (p[sl] + p[sr]) / 2 - Math.sin(yaw) * 0.32 * scale, cz = (p[sl + 2] + p[sr + 2]) / 2 - Math.cos(yaw) * 0.32 * scale;
    gx += (cx - gx) * reload; gy += ((p[sr + 1] - 0.2 * scale) - gy) * reload; gz += (cz - gz) * reload;
  }
  // The elbow: out and down when aiming; back, the arm hanging, when a handgun is lowered.
  const pr = hold.poleR, low = side ? 1 - ready : 0;
  placeHand(pose, body, fk, ARM_R, q, 0, gx, gy, gz, pr[0] + (0.2 - pr[0]) * low, pr[1] + (0 - pr[1]) * low,
    pr[2] + (1 - pr[2]) * low, hold.sight ? 0.015 + 0.065 * (1 - ready) : undefined);

  // The off hand on the fore grip (or wrapped round the shooting hand), off to the magazine in a
  // reload; a lowered handgun leaves it free (it comes in as the weapon rises).
  if (hold.hands === 2) {
    const grip = aim.offGrip ?? hold.offGrip;
    const w = side ? smoothStep(0.35, 0.9, ready) : 1;
    if (w <= 0) return pose;
    if (w < 1) {
      for (let k = 0; k < 4; k += 1) held[k] = pose[ARM_L.upper * 4 + k];
      for (let k = 0; k < 4; k += 1) held[4 + k] = pose[ARM_L.lower * 4 + k];
      for (let k = 0; k < 4; k += 1) held[8 + k] = pose[ARM_L.end * 4 + k];
    }
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
    if (w < 1) {
      quatNlerp(pose, ARM_L.upper * 4, held, 0, pose, ARM_L.upper * 4, w);
      quatNlerp(pose, ARM_L.lower * 4, held, 4, pose, ARM_L.lower * 4, w);
      quatNlerp(pose, ARM_L.end * 4, held, 8, pose, ARM_L.end * 4, w);
      computeForwardKinematics(body, pose, fk, ARM_L.base, ARM_L.end);
    }
  }
  return pose;
}

/**
 * Places a palm's grip point at (x, y, z) with its grip frame turned to the rotation q[o]:
 * the wrist goes where the palm offset says, the arm reaches it, and the hand turns to fit.
 * softness: the reach's ease-out share (default the limb's; small to let the arm go straight).
 */
export function placeHand(pose, body, fk, arm, rotation, o, x, y, z, px, py, pz, softness) {
  quatMultiplyConjRight(q, 12, rotation, o, body.gripRotation, arm.index * 4);
  const g = arm.index * 3;
  quatRotate(v, 4, q, 12, body.gripOffset[g], body.gripOffset[g + 1], body.gripOffset[g + 2]);
  reachWithLimb(pose, body, fk, arm, x - v[4], y - v[5], z - v[6], px, py, pz, softness);
  orientBoneTo(pose, fk, arm.end, q, 12);
}

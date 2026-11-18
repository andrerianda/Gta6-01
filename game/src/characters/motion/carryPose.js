// Weapons the body carries rather than aims along a sight line (owner, 09:15: every weapon its
// own stance): the baseball bat cocked over the strong shoulder with both hands at the knob and
// the front elbow up; the tire iron raised at the strong shoulder with the other hand forward
// for balance; a grenade or bottle in a throwing stance, the support arm pointing at the target,
// the throwing arm cocked back over the shoulder, the weight on the back foot. Lowered, the bat
// rests on the shoulder, the tire iron hangs in the hand, a throwable is held at the side.
// The hands and the weapon are placed in the chest's frame after the trunk has turned to the
// target, so the hips and shoulders carry them. A swing or a throw (aim.swing, progress 0..1)
// drives from the hips: the trunk winds back, rotates through the target and follows through
// (the pelvis turning with it under the stance), the weapon sweeping along; a throw steps through
// onto the front foot. The melee model hangs on anchor_hand_r with its handle through the fist:
// the striking end along the grip frame's +Y (combat's heldWeaponModels). Pure maths over the
// pose buffer; no allocation; lengths scale with the arm.
import { writeLookAt } from '../rig/lookAt.js';
import { computeForwardKinematics } from '../skeleton/forwardKinematics.js';
import { ARM_L, ARM_R, BONE } from '../skeleton/humanSkeleton.js';
import { quatFromBasis, quatFromYawPitchRoll, quatMultiply, quatRotate, smoothStep } from '../skeleton/quaternionMath.js';
import { placeHand } from './handPlacement.js';

// A key of a carried hold, in the chest's frame (+X right, +Y up, -Z ahead) at a 0.58 m arm:
// hand: the shooting palm from the right shoulder; dir: the weapon's striking end (or for a
// throwable, the fist's top); twist: the trunk's extra turn (rad, + towards the left: through
// the target); off: the support palm from the left shoulder (null: the off hand points at the
// target or hangs).
const key = (hand, dir, twist, off = null) => Object.freeze({ hand, dir, twist, off });

/**
 * Carried holds: ready (aimed or swinging), lowered, and the keys of a swing (u 0..1 at `at`).
 * blade: the trunk's turn while ready (rad, - the right shoulder back); stance: share of the
 * full-body stance; offGrip: the support palm along the handle from the shooting palm (metres,
 * grip frame, + towards the striking end; null: the off hand is free); point: the support arm
 * points at the target while ready; impact: the swing's progress at contact (or release).
 */
export const CARRY_HOLDS = Object.freeze({
  // Bat: both hands at the knob (the left one below), cocked over the right shoulder, the front
  // (left) elbow up; the swing rotates the hips and shoulders through, level at chest height.
  two_hand_bat: Object.freeze({
    carry: true, hands: 2, blade: -0.5, lean: 0.06, stance: 1, offGrip: -0.085, point: false, impact: 0.5,
    ready: key([0.03, 0.06, -0.16], [0.28, 0.82, 0.5], 0),
    lowered: key([-0.02, -0.2, -0.2], [0.04, 0.42, 1], 0),
    swing: Object.freeze([
      Object.freeze({ at: 0, ...key([0.03, 0.06, -0.16], [0.28, 0.82, 0.5], 0) }),
      Object.freeze({ at: 0.28, ...key([0.07, 0.1, -0.08], [0.3, 0.6, 0.75], -0.3) }),
      Object.freeze({ at: 0.5, ...key([-0.18, -0.24, -0.44], [0.25, 0.08, -1], 0.75) }),
      Object.freeze({ at: 0.75, ...key([-0.42, -0.1, -0.2], [-0.85, 0.35, 0.4], 1.2) }),
      Object.freeze({ at: 1, ...key([0.03, 0.06, -0.16], [0.28, 0.82, 0.5], 0) }),
    ]),
    poleR: [0.7, -0.9, 0.2], poleL: [-0.3, 0.6, -0.8],
  }),
  // Tire iron: raised at the right shoulder ready to swing, the left hand forward for balance;
  // the swing comes down and across from the hips.
  one_hand_club: Object.freeze({
    carry: true, hands: 1, blade: -0.3, lean: 0.08, stance: 0.9, offGrip: null, point: false, impact: 0.45,
    ready: key([0.1, 0.1, -0.06], [0.1, 0.9, 0.42], 0, [0.04, -0.2, -0.42]),
    lowered: key([0.05, -0.6, -0.08], [0, -0.75, -0.66], 0),
    swing: Object.freeze([
      Object.freeze({ at: 0, ...key([0.1, 0.1, -0.06], [0.1, 0.9, 0.42], 0, [0.04, -0.2, -0.42]) }),
      Object.freeze({ at: 0.25, ...key([0.14, 0.16, 0.02], [0.2, 0.7, 0.7], -0.25, [0.06, -0.15, -0.46]) }),
      Object.freeze({ at: 0.45, ...key([-0.12, -0.18, -0.48], [0.15, -0.1, -1], 0.6, [0.12, -0.32, -0.25]) }),
      Object.freeze({ at: 0.72, ...key([-0.38, -0.36, -0.22], [-0.7, -0.6, 0.2], 0.95, [0.16, -0.38, -0.08]) }),
      Object.freeze({ at: 1, ...key([0.1, 0.1, -0.06], [0.1, 0.9, 0.42], 0, [0.04, -0.2, -0.42]) }),
    ]),
    poleR: [0.8, -0.8, 0.3], poleL: [-0.6, -1, 0.1],
  }),
  // Throw: side-on, the left arm pointing at the target, the right hand cocked back above and
  // behind the shoulder, the weight back; the throw comes over the top and steps through.
  throw: Object.freeze({
    carry: true, hands: 1, blade: -0.95, lean: -0.02, stance: 0.8, offGrip: null, point: true, impact: 0.5, throwStep: true,
    ready: key([0.1, 0.16, 0.22], [0, 1, -0.2], 0),
    lowered: key([0.05, -0.55, -0.1], [0, 0.3, -1], 0),
    swing: Object.freeze([
      Object.freeze({ at: 0, ...key([0.1, 0.16, 0.22], [0, 1, -0.2], 0) }),
      Object.freeze({ at: 0.3, ...key([0.14, 0.12, 0.3], [0, 0.9, 0.4], -0.12) }),
      Object.freeze({ at: 0.5, ...key([-0.02, 0.14, -0.42], [0, 0.4, -1], 0.85) }),
      Object.freeze({ at: 0.75, ...key([-0.3, -0.4, -0.35], [0, -0.6, -0.8], 1.15) }),
      Object.freeze({ at: 1, ...key([0.1, 0.16, 0.22], [0, 1, -0.2], 0) }),
    ]),
    poleR: [0.8, -0.4, 0.4], poleL: [-0.5, -1, 0.2],
  }),
});

/** How far a swing (progress u, or -1 none) has the body in its ready stance: in fast, out slow. */
export function swingWeight(u) {
  return u >= 0 && u <= 1 ? Math.min(1, u / 0.12, (1 - u) / 0.25) : 0;
}

/**
 * The weight's shift for a throw (a swing's progress u, or -1 none): back over the rear foot
 * (-0.5) while it is aimed and wound up, stepping through onto the front foot (+1) at the
 * release, settling back at the end.
 */
export function throwStep(u) {
  if (!(u >= 0 && u <= 1)) return -0.5;
  if (u < 0.3) return -0.5 - 0.2 * Math.sin(Math.PI * u / 0.6);
  if (u < 0.6) return -0.7 + 1.7 * smoothStep(0.3, 0.6, u);
  return 1 - 1.5 * smoothStep(0.6, 1, u);
}

/** The pelvis's share of a swing's trunk turn (the swing drives from the hips). */
export function swingHipTurn(hold, u) {
  return hold && hold.swing && u >= 0 && u <= 1 ? sampleSwing(hold, u).twist * 0.45 : 0;
}

const sampled = { hand: new Float64Array(3), dir: new Float64Array(3), off: new Float64Array(3), twist: 0, hasOff: false };
/** The swing's keys blended at progress u (eased between neighbours). */
function sampleSwing(hold, u) {
  const keys = hold.swing;
  let i = 0;
  while (i < keys.length - 2 && u > keys[i + 1].at) i += 1;
  const a = keys[i], b = keys[i + 1];
  const t = smoothStep(0, 1, (u - a.at) / Math.max(1e-6, b.at - a.at));
  for (let k = 0; k < 3; k += 1) {
    sampled.hand[k] = a.hand[k] + (b.hand[k] - a.hand[k]) * t;
    sampled.dir[k] = a.dir[k] + (b.dir[k] - a.dir[k]) * t;
  }
  sampled.hasOff = Boolean(a.off && b.off);
  if (sampled.hasOff) for (let k = 0; k < 3; k += 1) sampled.off[k] = a.off[k] + (b.off[k] - a.off[k]) * t;
  sampled.twist = a.twist + (b.twist - a.twist) * t;
  return sampled;
}

const v = new Float32Array(4);
const q = new Float32Array(12);
const chestQ = new Float32Array(4);
const wrapAngle = (a) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));
const mix = (a, b, k, t) => a[k] + (b[k] - a[k]) * t;

/** The grip frame (character space) whose +Y is the chest-frame direction d (the striking end). */
function gripFrame(out, o, chest, dx, dy, dz) {
  quatRotate(v, 0, chest, 0, dx, dy, dz);
  let n = Math.hypot(v[0], v[1], v[2]) || 1;
  const yx = v[0] / n, yy = v[1] / n, yz = v[2] / n;
  // The fist's front: the chest's ahead, tipped down as the end comes forward, square to the end.
  quatRotate(v, 0, chest, 0, 0, 0, -1);
  const ahead = Math.max(0, yx * v[0] + yy * v[1] + yz * v[2]);
  quatRotate(v, 0, chest, 0, 0, -ahead, -1);
  const along = v[0] * yx + v[1] * yy + v[2] * yz;
  let fx = v[0] - yx * along, fy = v[1] - yy * along, fz = v[2] - yz * along;
  n = Math.hypot(fx, fy, fz) || 1; fx /= n; fy /= n; fz /= n;
  // X = Y x Z with Z = -front.
  const zx = -fx, zy = -fy, zz = -fz;
  quatFromBasis(out, o, yy * zz - yz * zy, yz * zx - yx * zz, yx * zy - yy * zx, yx, yy, yz, zx, zy, zz);
}

/**
 * Writes a carried hold over a pose whose forward kinematics `fk` is up to date (the stance, if
 * any, already written).
 * @param {Float32Array} pose
 * @param {import('../skeleton/bodyMeasurements.js').BodyModel} body
 * @param {import('../skeleton/forwardKinematics.js').FkState} fk
 * @param {import('./aimPose.js').AimInput} aim Its swing (progress 0..1, or -1) drives a swing or throw.
 * @param {object} hold A CARRY_HOLDS entry.
 * @returns {Float32Array} pose
 */
export function writeCarryPose(pose, body, fk, aim, hold) {
  const p = fk.position, r = fk.rotation, scale = body.armLength / 0.58;
  const u = aim.swing >= 0 && aim.swing <= 1 ? aim.swing : -1;
  const ready = Math.max(Math.max(0, Math.min(1, aim.raise)), swingWeight(u));
  const sl = BONE.UPPER_ARM_L * 3, sr = BONE.UPPER_ARM_R * 3;
  const swing = u >= 0 ? sampleSwing(hold, u) : null;
  const R = swing ?? hold.ready, L = hold.lowered;

  // The trunk turns to the target (bladed), plus the swing's wind and drive through.
  const dx = aim.targetX - (p[sl] + p[sr]) / 2, dz = aim.targetZ - (p[sl + 2] + p[sr + 2]) / 2;
  const yawA = Math.atan2(-dx, -dz);
  quatRotate(v, 0, r, BONE.CHEST * 4, 0, 0, -1);
  const extra = swing ? swing.twist : 0;
  let twist = wrapAngle(yawA + (hold.blade + extra) * ready - Math.atan2(-v[0], -v[2]));
  twist = Math.max(-1.6, Math.min(1.6, twist));
  const bend = -(hold.lean ?? 0) * ready;
  quatFromYawPitchRoll(q, 0, twist * 0.45, bend * 0.5, 0);
  quatMultiply(pose, BONE.SPINE * 4, q, 0, pose, BONE.SPINE * 4);
  quatFromYawPitchRoll(q, 0, twist * 0.55, bend * 0.5, 0);
  quatMultiply(pose, BONE.CHEST * 4, q, 0, pose, BONE.CHEST * 4);
  computeForwardKinematics(body, pose, fk, BONE.SPINE, BONE.HAND_R);
  writeLookAt(pose, body, fk, aim.targetX, aim.targetY, aim.targetZ, 0.3 + 0.6 * ready);

  // The chest's frame; the keys blended from lowered to ready.
  for (let k = 0; k < 4; k += 1) { q[8 + k] = r[BONE.CHEST * 4 + k]; chestQ[k] = q[8 + k]; }
  quatRotate(v, 0, q, 8, mix(L.hand, R.hand, 0, ready) * scale, mix(L.hand, R.hand, 1, ready) * scale, mix(L.hand, R.hand, 2, ready) * scale);
  const gx = p[sr] + v[0], gy = p[sr + 1] + v[1], gz = p[sr + 2] + v[2];
  gripFrame(q, 0, chestQ, mix(L.dir, R.dir, 0, ready), mix(L.dir, R.dir, 1, ready), mix(L.dir, R.dir, 2, ready));
  const pr = hold.poleR;
  quatRotate(v, 0, q, 8, pr[0], pr[1], pr[2]);
  placeHand(pose, body, fk, ARM_R, q, 0, gx, gy, gz, v[0], v[1], v[2]);

  // The support hand: on the handle below the shooting hand, forward for balance, pointing at
  // the target, or (lowered) left to hang.
  const off = swing && swing.hasOff ? swing.off : R.off;
  const w = hold.offGrip != null ? smoothStep(0.2, 0.8, ready) : ready;
  if (w <= 0) return pose;
  const pl = hold.poleL;
  quatRotate(v, 0, q, 8, pl[0], pl[1], pl[2]);
  const plx = v[0], ply = v[1], plz = v[2];
  let hx, hy, hz;
  if (hold.offGrip != null) { // along the handle, the same grip frame (both fists the same way)
    quatRotate(v, 0, q, 0, 0, hold.offGrip * scale, 0);
    hx = gx + v[0]; hy = gy + v[1]; hz = gz + v[2];
    for (let k = 0; k < 4; k += 1) q[4 + k] = q[k];
  } else if (hold.point) { // the arm straight at the target, at shoulder height
    const tx = aim.targetX - p[sl], tz = aim.targetZ - p[sl + 2], n = Math.hypot(tx, tz) || 1;
    const reach = body.armLength * 0.9;
    hx = p[sl] + tx / n * reach; hy = p[sl + 1] + 0.04 * scale; hz = p[sl + 2] + tz / n * reach;
    quatFromBasis(q, 4, -tz / n, 0, tx / n, 0, 1, 0, -tx / n, 0, -tz / n);
  } else if (off) {
    quatRotate(v, 0, q, 8, off[0] * scale, off[1] * scale, off[2] * scale);
    hx = p[sl] + v[0]; hy = p[sl + 1] + v[1]; hz = p[sl + 2] + v[2];
    gripFrame(q, 4, chestQ, 0, 1, 0.3);
  } else return pose;
  if (w < 1) { // from the hanging hand towards its place
    const hl = BONE.HAND_L * 3;
    hx = p[hl] + (hx - p[hl]) * w; hy = p[hl + 1] + (hy - p[hl + 1]) * w; hz = p[hl + 2] + (hz - p[hl + 2]) * w;
  }
  placeHand(pose, body, fk, ARM_L, q, 4, hx, hy, hz, plx, ply, plz);
  return pose;
}

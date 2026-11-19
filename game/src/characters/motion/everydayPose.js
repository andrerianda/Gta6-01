// A pedestrian's everyday life: sitting on a bench (whole body), and the upper-body gestures laid
// over standing, walking, running or sitting: the phone held to the ear, talking with the hands,
// pointing at something, and the panic of a run with the arms thrown up over the head. Each
// person's seed shifts the rhythm so that a crowd never gestures in step.
import { reachWithLimb } from '../ik/limbPosing.js';
import { writeLookAt } from '../rig/lookAt.js';
import { computeForwardKinematics } from '../skeleton/forwardKinematics.js';
import { ARMS, ARM_R, BONE, LEGS } from '../skeleton/humanSkeleton.js';
import { resetPose } from '../skeleton/poseBuffer.js';
import { quatFromYawPitchRoll, quatMultiply, quatRotate } from '../skeleton/quaternionMath.js';
import { writeSmokeGesture } from './loiterPose.js';
import { placeSeatedHips, plantLeg, writeTrunk } from './seatedPose.js';

/** The gestures writeGesturePose knows. */
export const GESTURES = Object.freeze(['phone', 'talk', 'point', 'panic', 'smoke', 'salute', 'halt']);
/** A bench seat's height above the ground when none is given, metres. */
export const BENCH_SEAT_HEIGHT = 0.45;

const v = new Float32Array(4);
const turn = new Float32Array(4);
const T = new Float32Array(3), C = new Float32Array(3), N = new Float32Array(3), H = new Float32Array(3);
const set3 = (a, x, y, z) => { a[0] = x; a[1] = y; a[2] = z; return a; };

/**
 * Sitting on a bench. The instance stands on the ground at the middle of the seat's front edge,
 * facing away from the bench; the hip joints go a little behind and above the seat.
 * @param {Float32Array} pose Reset and written.
 * @param {import('../skeleton/bodyMeasurements.js').BodyModel} body
 * @param {import('../skeleton/forwardKinematics.js').FkState} fk
 * @param {number} [seatHeight] Metres above the ground (default BENCH_SEAT_HEIGHT).
 * @param {number} [time]
 * @param {number} [seed] Varies the slouch, the leg spread and the glances.
 */
export function writeBenchSitPose(pose, body, fk, seatHeight = BENCH_SEAT_HEIGHT, time = 0, seed = 0) {
  resetPose(pose);
  const s = body.legScale, hs = body.heightScale, r = fract(Math.sin(seed * 12.9898) * 43758.5453);
  const breath = Math.sin(time * 1.4 + seed) * 0.012, glance = Math.sin(time * 0.27 + seed * 2.1) * 0.4 * Math.max(0, Math.sin(time * 0.11 + seed));
  writeTrunk(pose, 0.14 + r * 0.14, 0, set3(T, 0, -0.04 - r * 0.06, 0), set3(C, glance * 0.15, -0.04 + breath, 0),
    set3(N, glance * 0.35, 0.02, 0), set3(H, glance * 0.5, -0.02 + r * 0.05, 0));
  placeSeatedHips(pose, body, fk, 0, seatHeight + 0.09 * hs, 0.13 * s);
  computeForwardKinematics(body, pose, fk, BONE.ROOT, BONE.TOE_R);
  const spread = 0.04 + r * 0.1;
  for (const leg of LEGS) {
    plantLeg(pose, body, fk, leg, leg.side * (body.hipHalfWidth + spread) * s, body.ankleHeight, (-0.3 - r * 0.12 + leg.side * 0.03) * s,
      leg.side * 0.2, 0.5, -1, 0, -leg.side * 0.15);
  }
  const p = fk.position;
  for (const arm of ARMS) { // hands resting on the thighs
    const leg = LEGS[arm.index], t3 = leg.upper * 3, k3 = leg.lower * 3;
    reachWithLimb(pose, body, fk, arm, p[t3] + (p[k3] - p[t3]) * 0.6 - arm.side * 0.02, p[t3 + 1] + (p[k3 + 1] - p[t3 + 1]) * 0.6 + 0.08 * s,
      p[t3 + 2] + (p[k3 + 2] - p[t3 + 2]) * 0.6, arm.side * 0.5, -0.5, 0.6);
    quatFromYawPitchRoll(pose, arm.end * 4, 0, -0.35, 0);
    computeForwardKinematics(body, pose, fk, arm.end, arm.end);
  }
  return pose;
}

/**
 * Input of a gesture: the clock, the person's seed and, for 'point', the target in character space.
 * @typedef {{ time: number, seed: number, targetX: number, targetY: number, targetZ: number }} GestureInput
 */
/** @returns {GestureInput} */
export function createGestureInput() {
  return { time: 0, seed: 0, targetX: 0, targetY: 1.4, targetZ: -10 };
}

/**
 * Writes an upper-body gesture over a pose whose fk is up to date.
 * @param {Float32Array} pose
 * @param {import('../skeleton/bodyMeasurements.js').BodyModel} body
 * @param {import('../skeleton/forwardKinematics.js').FkState} fk Updated for the upper body.
 * @param {'phone' | 'talk' | 'point' | 'panic'} gesture
 * @param {GestureInput} input
 * @returns {Float32Array} pose
 */
export function writeGesturePose(pose, body, fk, gesture, input) {
  const p = fk.position, a = body.armLength / 0.58, time = input.time, seed = input.seed;
  if (gesture === 'smoke') return writeSmokeGesture(pose, body, fk, time, seed);
  if (gesture === 'phone') { // right hand at the right ear, head tipped to it, the other arm loose
    tilt(pose, BONE.HEAD, 0, 0.04, -0.1);
    computeForwardKinematics(body, pose, fk, BONE.HEAD, BONE.HEAD);
    const h = BONE.HEAD * 3;
    quatRotate(v, 0, fk.rotation, BONE.HEAD * 4, 0.1 * a, 0.0, -0.05 * a);
    reachWithLimb(pose, body, fk, ARM_R, p[h] + v[0], p[h + 1] + v[1], p[h + 2] + v[2], 1, -0.7, -0.15);
    quatFromYawPitchRoll(pose, ARM_R.end * 4, 0.3, 0, 0.35);
    computeForwardKinematics(body, pose, fk, ARM_R.end, ARM_R.end);
    return pose;
  }
  if (gesture === 'point') { // the right arm straight at the target, the head and chest to it
    const u = ARM_R.upper * 3;
    const yaw = Math.atan2(-input.targetX, -input.targetZ);
    tilt(pose, BONE.CHEST, Math.max(-0.6, Math.min(0.6, yaw)) * 0.3, 0, 0);
    computeForwardKinematics(body, pose, fk, BONE.CHEST, BONE.HAND_R);
    writeLookAt(pose, body, fk, input.targetX, input.targetY, input.targetZ, 0.9);
    let dx = input.targetX - p[u], dy = input.targetY - p[u + 1], dz = input.targetZ - p[u + 2];
    const n = body.armLength * 0.97 / Math.max(1e-4, Math.hypot(dx, dy, dz));
    dx *= n; dy *= n; dz *= n;
    reachWithLimb(pose, body, fk, ARM_R, p[u] + dx, p[u + 1] + dy, p[u + 2] + dz, 0.3, -1, 0.4);
    quatFromYawPitchRoll(pose, ARM_R.end * 4, 0, 0, 0.1);
    computeForwardKinematics(body, pose, fk, ARM_R.end, ARM_R.end);
    return pose;
  }
  if (gesture === 'salute') { // the right hand flat at the right brow, the elbow out to the side, the head level
    const h = BONE.HEAD * 3;
    quatRotate(v, 0, fk.rotation, BONE.HEAD * 4, 0.115 * a, 0.035, -0.085 * a);
    reachWithLimb(pose, body, fk, ARM_R, p[h] + v[0], p[h + 1] + v[1], p[h + 2] + v[2], 1, -0.15, 0.25);
    quatFromYawPitchRoll(pose, ARM_R.end * 4, 0.15, 0, 0.1);
    computeForwardKinematics(body, pose, fk, ARM_R.end, ARM_R.end);
    return pose;
  }
  if (gesture === 'halt') { // the right arm out ahead at shoulder height, the palm up and out: stop
    const c = BONE.CHEST * 3;
    quatRotate(v, 0, fk.rotation, BONE.CHEST * 4, 0.2 * a, 0.2 * a, -0.5 * a);
    reachWithLimb(pose, body, fk, ARM_R, p[c] + v[0], p[c + 1] + v[1], p[c + 2] + v[2], 0.4, -1, 0.3);
    quatFromYawPitchRoll(pose, ARM_R.end * 4, 0, 1.1, 0);
    computeForwardKinematics(body, pose, fk, ARM_R.end, ARM_R.end);
    return pose;
  }
  for (const arm of ARMS) {
    const side = arm.side, k = seed * 1.37 + (side > 0 ? 0 : 2.1);
    let ox, oy, oz, from, px, py, pz;
    if (gesture === 'panic') { // thrown up over the head, flailing
      from = BONE.HEAD * 3;
      ox = side * (0.24 + 0.07 * Math.sin(time * 8.3 + k)) * a; oy = (0.26 + 0.1 * Math.sin(time * 7.1 + k * 1.9)) * a;
      oz = (-0.04 + 0.07 * Math.cos(time * 9.4 + k)) * a; px = side; py = -0.2; pz = 0.4;
    } else { // talking: hands in front of the waist, beating out the words, now and then opening out
      from = BONE.CHEST * 3;
      const beat = Math.sin(time * 2.6 + k) * 0.5 + Math.sin(time * 4.1 + k * 1.7) * 0.5;
      const open = Math.max(0, Math.sin(time * 0.9 + k * 0.6)) * (side > 0 ? 1 : 0.6);
      ox = side * (0.17 + 0.09 * open) * a; oy = (-0.22 + 0.05 * beat + 0.04 * open) * a; oz = (-0.27 - 0.04 * open) * a;
      px = side * 0.6; py = -1; pz = 0.3;
    }
    quatRotate(v, 0, fk.rotation, (from === BONE.HEAD * 3 ? BONE.HEAD : BONE.CHEST) * 4, ox, oy, oz);
    reachWithLimb(pose, body, fk, arm, p[from] + v[0], p[from + 1] + v[1], p[from + 2] + v[2], px, py, pz);
    if (gesture === 'panic') quatFromYawPitchRoll(pose, arm.end * 4, 0, 0.4 * Math.sin(time * 11 + k), 0);
    else quatFromYawPitchRoll(pose, arm.end * 4, 0, -0.2, -side * 0.5 * Math.max(0, Math.sin(time * 0.9 + k * 0.6)));
    computeForwardKinematics(body, pose, fk, arm.end, arm.end);
  }
  if (gesture === 'talk') { // small nods
    tilt(pose, BONE.HEAD, Math.sin(time * 0.7 + seed) * 0.12, Math.sin(time * 3.3 + seed) * 0.04, 0);
    computeForwardKinematics(body, pose, fk, BONE.HEAD, BONE.HEAD);
  } else {
    tilt(pose, BONE.HEAD, Math.sin(time * 5.2 + seed) * 0.25, -0.12, 0); // looking round in fear
    computeForwardKinematics(body, pose, fk, BONE.HEAD, BONE.HEAD);
  }
  return pose;
}

/** Turns a bone by a yaw, pitch and roll in its parent's frame (on top of what it has). */
function tilt(pose, bone, yaw, pitch, roll) {
  quatFromYawPitchRoll(turn, 0, yaw, pitch, roll);
  quatMultiply(pose, bone * 4, turn, 0, pose, bone * 4);
}

function fract(x) {
  return x - Math.floor(x);
}

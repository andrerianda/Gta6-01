// Loitering, for the crowd's idle crews (pedestrians, 10:40): keeping a still watch with the hands
// clasped in front at the belt and the head slowly scanning (an upper-body layer, the stance
// 'watch'); leaning back against a wall or a car with one sole up on it and the thumbs in the
// front pockets (a whole-body pose, the stance 'lean_wall': the wall about 0.3 m behind the
// person's origin); and smoking (the gesture 'smoke': the cigarette hand comes up to the mouth
// every 6 to 10 seconds, the other forearm across the waist). Pure maths over the pose buffer, no
// allocation; lengths scale with the body; each person's seed shifts the rhythm.
import { reachWithLimb } from '../ik/limbPosing.js';
import { computeForwardKinematics } from '../skeleton/forwardKinematics.js';
import { ARMS, ARM_L, ARM_R, BONE, LEGS } from '../skeleton/humanSkeleton.js';
import { resetPose } from '../skeleton/poseBuffer.js';
import { quatFromYawPitchRoll, quatMultiply, quatRotate, smoothStep } from '../skeleton/quaternionMath.js';
import { placeSeatedHips, plantLeg, writeTrunk } from './seatedPose.js';

/** How far behind the person's origin the wall of 'lean_wall' stands (metres at 1.78 m). */
export const LEAN_WALL_DISTANCE = 0.3;

const v = new Float32Array(4);
const turn = new Float32Array(4);
const T = new Float32Array(3), C = new Float32Array(3), N = new Float32Array(3), H = new Float32Array(3);
const set3 = (a, x, y, z) => { a[0] = x; a[1] = y; a[2] = z; return a; };

/**
 * The watch: both hands clasped in front of the belt (the right over the left), elbows soft by the
 * sides, the head turning slowly from side to side. Written over a standing pose whose fk is up to date.
 * @param {Float32Array} pose
 * @param {import('../skeleton/bodyMeasurements.js').BodyModel} body
 * @param {import('../skeleton/forwardKinematics.js').FkState} fk
 * @param {number} [time]
 * @param {number} [seed]
 * @returns {Float32Array} pose
 */
export function writeWatchHands(pose, body, fk, time = 0, seed = 0) {
  const p = fk.position, s = body.armLength / 0.58, hp = BONE.HIPS * 3;
  tilt(pose, BONE.CHEST, 0, -0.04, 0); // the chest up a little, shoulders back
  computeForwardKinematics(body, pose, fk, BONE.CHEST, BONE.HAND_R);
  for (const arm of ARMS) {
    const side = arm.side;
    quatRotate(v, 0, fk.rotation, BONE.HIPS * 4, side * 0.025 * s, (side > 0 ? 0.03 : 0.0) * s, (side > 0 ? -0.2 : -0.18) * s);
    reachWithLimb(pose, body, fk, arm, p[hp] + v[0], p[hp + 1] + v[1], p[hp + 2] + v[2], side * 0.7, -1, 0.25);
    quatFromYawPitchRoll(pose, arm.end * 4, -side * 0.5, -0.25, -side * 0.9); // palms in, over each other
    computeForwardKinematics(body, pose, fk, arm.end, arm.end);
  }
  scanHead(pose, body, fk, time, seed, 0.55);
  return pose;
}

/**
 * Leaning back against a wall (or a car) about LEAN_WALL_DISTANCE behind: the shoulders on it,
 * the left foot planted ahead, the right sole up on the wall with the knee bent forward, the
 * thumbs in the front pockets, the head now and then turning.
 * @param {Float32Array} pose Reset and written.
 * @param {import('../skeleton/bodyMeasurements.js').BodyModel} body
 * @param {import('../skeleton/forwardKinematics.js').FkState} fk
 * @param {number} [time]
 * @param {number} [seed]
 * @returns {Float32Array} pose
 */
export function writeLeanWallPose(pose, body, fk, time = 0, seed = 0) {
  resetPose(pose);
  const s = body.legScale, a = body.armLength / 0.58, hs = body.heightScale;
  const breath = Math.sin(time * 1.3 + seed) * 0.01;
  writeTrunk(pose, 0.2, 0.03, set3(T, 0, -0.05, 0), set3(C, 0, -0.07 + breath, 0), set3(N, 0, -0.04, 0), set3(H, 0, -0.04, 0));
  placeSeatedHips(pose, body, fk, 0.02 * s, body.hipHeight - 0.05 * s, 0.1 * hs);
  computeForwardKinematics(body, pose, fk, BONE.ROOT, BONE.TOE_R);
  const wall = LEAN_WALL_DISTANCE * hs;
  // The left foot planted ahead and a little out, the right sole flat on the wall, knee forward.
  plantLeg(pose, body, fk, LEGS[0], -0.14 * s, body.ankleHeight, -0.2 * s, -0.1, 0.1, -1, 0, 0.15);
  plantLeg(pose, body, fk, LEGS[1], 0.08 * s, 0.4 * s, wall - 0.1 * s, 0.15, 0.4, -1, -1.1, -0.15);
  computeForwardKinematics(body, pose, fk, BONE.SPINE, BONE.HAND_R);
  const p = fk.position, hp = BONE.HIPS * 3;
  for (const arm of ARMS) { // thumbs hooked in the front pockets
    const side = arm.side;
    quatRotate(v, 0, fk.rotation, BONE.HIPS * 4, side * 0.15 * a, -0.06 * a, -0.08 * a);
    reachWithLimb(pose, body, fk, arm, p[hp] + v[0], p[hp + 1] + v[1], p[hp + 2] + v[2], side * 0.8, -0.6, 0.6);
    quatFromYawPitchRoll(pose, arm.end * 4, 0, -0.3, side * 0.3);
    computeForwardKinematics(body, pose, fk, arm.end, arm.end);
  }
  scanHead(pose, body, fk, time, seed, 0.4);
  return pose;
}

/**
 * Smoking: the right hand with the cigarette rests in front of the hip, the elbow bent, and every
 * 6 to 10 seconds comes up to the mouth for a drag; the left forearm lies across the waist.
 * Written over a standing (or walking) pose whose fk is up to date.
 * @param {Float32Array} pose
 * @param {import('../skeleton/bodyMeasurements.js').BodyModel} body
 * @param {import('../skeleton/forwardKinematics.js').FkState} fk
 * @param {number} [time]
 * @param {number} [seed]
 * @returns {Float32Array} pose
 */
export function writeSmokeGesture(pose, body, fk, time = 0, seed = 0) {
  const p = fk.position, a = body.armLength / 0.58;
  const period = 6 + 4 * fract(Math.sin(seed * 7.13 + 1.7) * 43758.5453);
  const u = fract(time / period + seed * 0.37) * period; // seconds into this cycle
  const drag = smoothStep(0, 0.7, u) * (1 - smoothStep(2.0, 2.8, u)); // up, a drag, down again
  // The left forearm across the waist (its hand under the right elbow).
  const hp = BONE.HIPS * 3;
  quatRotate(v, 0, fk.rotation, BONE.HIPS * 4, 0.1 * a, 0.08 * a, -0.17 * a);
  reachWithLimb(pose, body, fk, ARM_L, p[hp] + v[0], p[hp + 1] + v[1], p[hp + 2] + v[2], -0.9, -0.5, 0.3);
  quatFromYawPitchRoll(pose, ARM_L.end * 4, 0, 0, 0.3);
  computeForwardKinematics(body, pose, fk, ARM_L.end, ARM_L.end);
  // The right hand: resting by the hip, or at the mouth.
  const c = BONE.CHEST * 3, h = BONE.HEAD * 3;
  quatRotate(v, 0, fk.rotation, BONE.CHEST * 4, 0.19 * a, -0.3 * a, -0.17 * a);
  let x = p[c] + v[0], y = p[c + 1] + v[1], z = p[c + 2] + v[2];
  if (drag > 0) {
    quatRotate(v, 0, fk.rotation, BONE.HEAD * 4, 0.025 * a, -0.06 * a, -0.13 * a);
    x += (p[h] + v[0] - x) * drag; y += (p[h + 1] + v[1] - y) * drag; z += (p[h + 2] + v[2] - z) * drag;
  }
  reachWithLimb(pose, body, fk, ARM_R, x, y, z, 0.8, -1, 0.15 - 0.3 * drag);
  quatFromYawPitchRoll(pose, ARM_R.end * 4, 0.2 + 0.5 * drag, -0.1 - 0.5 * drag, 0.3 + 0.5 * drag);
  computeForwardKinematics(body, pose, fk, ARM_R.end, ARM_R.end);
  // The head: a little down to meet the hand, then up and back blowing the smoke out.
  const exhale = smoothStep(2.4, 2.9, u) * (1 - smoothStep(3.6, 4.6, u));
  tilt(pose, BONE.HEAD, 0, 0.12 * drag - 0.22 * exhale, 0);
  computeForwardKinematics(body, pose, fk, BONE.HEAD, BONE.HEAD);
  return pose;
}

/** A slow look round: the head (and a little of the neck) turning to either side and back. */
function scanHead(pose, body, fk, time, seed, reach) {
  const yaw = Math.sin(time * 0.42 + seed * 1.9) * reach * (0.6 + 0.4 * Math.sin(time * 0.13 + seed));
  tilt(pose, BONE.NECK, yaw * 0.35, 0, 0);
  tilt(pose, BONE.HEAD, yaw * 0.65, 0, 0);
  computeForwardKinematics(body, pose, fk, BONE.NECK, BONE.HEAD);
}

/** Turns a bone by a yaw, pitch and roll in its parent's frame (on top of what it has). */
function tilt(pose, bone, yaw, pitch, roll) {
  quatFromYawPitchRoll(turn, 0, yaw, pitch, roll);
  quatMultiply(pose, bone * 4, turn, 0, pose, bone * 4);
}

function fract(x) {
  return x - Math.floor(x);
}

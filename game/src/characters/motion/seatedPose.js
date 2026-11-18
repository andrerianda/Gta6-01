// Seated in a vehicle: a driver with both hands on the steering wheel's rim (they follow the wheel
// as it turns and slide on the rim past about 100 degrees), leaning with the corner and turning to
// look back over the right shoulder when reversing; a passenger with the hands on the thighs and a
// wandering glance; a motorcycle rider crouched forward with the hands on the grips and the feet on
// the pegs, leaning into the bend. Everything is in character space with the seated hip joints at
// the origin (the vehicle's anchor_seat_* is where the hip joints go, facing its -Z), so the
// instance is simply placed at the anchor. Lengths come from the body: any person fits any seat
// as far as the limbs reach.
import { orientBoneTo, reachWithLimb } from '../ik/limbPosing.js';
import { computeForwardKinematics } from '../skeleton/forwardKinematics.js';
import { ARMS, ARM_R, BONE, LEGS } from '../skeleton/humanSkeleton.js';
import { POSE_FOOT_CONTACT, POSE_HIPS_TRANSLATION, resetPose } from '../skeleton/poseBuffer.js';
import { quatFromBasis, quatFromYawPitchRoll, quatIdentity, quatRotate } from '../skeleton/quaternionMath.js';
import { placeHand } from './aimPose.js';

/** The seats writeSeatedPose knows. */
export const SEAT_KINDS = Object.freeze(['driver', 'passenger', 'rider']);

/** Where the hands hold the rim: angle from 12 o'clock (radians, the right hand; the left mirrors). */
export const WHEEL_HOLD_ANGLE = 1.2;
/** How far the hands follow a turning wheel before they slide on the rim (radians). */
export const WHEEL_FOLLOW_LIMIT = 1.75;

const v = new Float32Array(8);
const q = new Float32Array(8);

/**
 * What a seated pose needs, in character space (hip joints at the origin, forward -Z). Fill the
 * arrays and set the `known` flags; anything unknown falls back to a typical car or motorcycle.
 * @typedef {object} SeatInput
 * @property {'driver' | 'passenger' | 'rider'} kind
 * @property {Float32Array} wheel [cx, cy, cz, ax, ay, az, ux, uy, uz, radius]: the rim's centre,
 *   the column axis towards the driver and the rim's 12 o'clock (turned with the wheel).
 * @property {boolean} wheelKnown
 * @property {Float32Array} grips [lx, ly, lz, rx, ry, rz]: a motorcycle's grips.
 * @property {boolean} gripsKnown
 * @property {Float32Array} feet [lx, ly, lz, rx, ry, rz]: pegs, or pedals and the floor in a car.
 * @property {boolean} feetKnown
 * @property {number} lean Body lean, radians, positive to the left (corner forces, a bike's bank).
 * @property {number} lookBack 0..1: turns to look back over the right shoulder (reversing).
 * @property {number} time Seconds, for breathing and glances.
 * @property {number} seed
 */

/** @returns {SeatInput} */
export function createSeatInput() {
  return {
    kind: 'driver', wheel: new Float32Array(10), wheelKnown: false, grips: new Float32Array(6), gripsKnown: false,
    feet: new Float32Array(6), feetKnown: false, lean: 0, lookBack: 0, time: 0, seed: 0,
  };
}

/**
 * Moves the hips so that the midpoint of the hip joints lands on (x, y, z) with the hips' current
 * rotation; brings fk up to date for the root and the hips.
 */
export function placeSeatedHips(pose, body, fk, x, y, z) {
  const h = POSE_HIPS_TRANSLATION, off = body.restOffset;
  pose[h] = 0; pose[h + 1] = 0; pose[h + 2] = 0;
  computeForwardKinematics(body, pose, fk, BONE.ROOT, BONE.HIPS);
  const a = BONE.THIGH_L * 3, b = BONE.THIGH_R * 3, p = fk.position, hp = BONE.HIPS * 3;
  quatRotate(v, 0, fk.rotation, BONE.HIPS * 4, (off[a] + off[b]) / 2, (off[a + 1] + off[b + 1]) / 2, (off[a + 2] + off[b + 2]) / 2);
  pose[h] = x - (p[hp] + v[0]);
  pose[h + 1] = y - (p[hp + 1] + v[1]);
  pose[h + 2] = z - (p[hp + 2] + v[2]);
}

/** Writes a trunk posture: hips tilt and roll, spine, chest, neck and head (yaw, pitch, roll each). */
export function writeTrunk(pose, hipsPitch, hipsRoll, spine, chest, neck, head) {
  quatFromYawPitchRoll(pose, BONE.HIPS * 4, 0, hipsPitch, hipsRoll);
  quatFromYawPitchRoll(pose, BONE.SPINE * 4, spine[0], spine[1], spine[2]);
  quatFromYawPitchRoll(pose, BONE.CHEST * 4, chest[0], chest[1], chest[2]);
  quatFromYawPitchRoll(pose, BONE.NECK * 4, neck[0], neck[1], neck[2]);
  quatFromYawPitchRoll(pose, BONE.HEAD * 4, head[0], head[1], head[2]);
}

/** Puts a leg's ankle at a point with the knee towards a pole and the foot pitched (toes up +). */
export function plantLeg(pose, body, fk, leg, x, y, z, px, py, pz, footPitch, footYaw = 0) {
  reachWithLimb(pose, body, fk, leg, x, y, z, px, py, pz, 0.02);
  quatFromYawPitchRoll(q, 0, footYaw, footPitch, 0);
  orientBoneTo(pose, fk, leg.end, q, 0);
  quatIdentity(pose, leg.tip * 4);
  computeForwardKinematics(body, pose, fk, leg.tip, leg.tip);
}

const T = new Float32Array(3), C = new Float32Array(3), N = new Float32Array(3), H = new Float32Array(3);

/**
 * Writes a whole-body seated pose.
 * @param {Float32Array} pose Reset and written.
 * @param {import('../skeleton/bodyMeasurements.js').BodyModel} body
 * @param {import('../skeleton/forwardKinematics.js').FkState} fk Receives the joints.
 * @param {SeatInput} seat
 * @returns {Float32Array} pose
 */
export function writeSeatedPose(pose, body, fk, seat) {
  resetPose(pose);
  const s = body.legScale, a = body.armLength / 0.58, time = seat.time, seed = seat.seed;
  const breath = Math.sin(time * 1.5 + seed) * 0.012, lean = Math.max(-0.5, Math.min(0.5, seat.lean));
  const back = Math.max(0, Math.min(1, seat.lookBack));
  if (seat.kind === 'rider') {
    // Crouched forward over the tank, head up to see the road; the body leans further than the bike.
    T[0] = 0; T[1] = -0.12 + breath; T[2] = lean * 0.15; C[0] = 0; C[1] = -0.08; C[2] = lean * 0.1;
    N[0] = 0; N[1] = 0.25; N[2] = -lean * 0.2; H[0] = 0; H[1] = 0.28; H[2] = -lean * 0.3;
    writeTrunk(pose, -0.42, lean * 0.25, T, C, N, H);
  } else {
    // Reclined against the seat back, the head upright; corner forces sway the trunk.
    const glance = seat.kind === 'passenger' ? Math.sin(time * 0.31 + seed * 1.7) * 0.35 * Math.max(0, Math.sin(time * 0.13 + seed)) : 0;
    T[0] = -0.2 * back; T[1] = -0.08 + breath * 0.5; T[2] = lean * 0.45;
    C[0] = -0.45 * back; C[1] = -0.06 + breath; C[2] = lean * 0.3;
    N[0] = -0.35 * back + glance * 0.4; N[1] = 0.04; N[2] = -lean * 0.3;
    H[0] = -0.55 * back + glance * 0.6; H[1] = 0.1; H[2] = -lean * 0.35;
    writeTrunk(pose, 0.26, 0, T, C, N, H);
  }
  placeSeatedHips(pose, body, fk, 0, 0, 0);
  computeForwardKinematics(body, pose, fk, BONE.ROOT, BONE.TOE_R);

  // Legs: pedals and floor in a car, pegs on a motorcycle.
  const half = body.hipHalfWidth;
  for (const leg of LEGS) {
    const side = leg.side, f = leg.index * 3;
    let x, y, z, pitch, px = side * 0.15, py = 0.4, pz = -1;
    if (seat.feetKnown) { x = seat.feet[f]; y = seat.feet[f + 1]; z = seat.feet[f + 2]; }
    if (seat.kind === 'rider') {
      if (!seat.feetKnown) { x = side * (half + 0.1) * s; y = -0.32 * s; z = -0.08 * s; }
      pitch = 0.05; px = side * 0.45; py = 0.2;
    } else if (seat.kind === 'driver') {
      if (!seat.feetKnown) { x = side * (half + 0.02 + (side > 0 ? 0.03 : 0)) * s; y = -0.38 * s; z = -0.74 * s; }
      pitch = side > 0 ? 0.55 : 0.4; // the right foot on the pedal, the left at rest
    } else {
      if (!seat.feetKnown) { x = side * (half + 0.06) * s; y = -0.4 * s; z = -0.62 * s; }
      pitch = 0.3; px = side * 0.25;
    }
    plantLeg(pose, body, fk, leg, x, y, z, px, py, pz, pitch, -side * 0.12);
    pose[POSE_FOOT_CONTACT + leg.index] = 1;
  }

  // Arms.
  if (seat.kind === 'driver') writeWheelHands(pose, body, fk, seat, back);
  else if (seat.kind === 'rider') {
    for (const arm of ARMS) {
      const side = arm.side, g = arm.index * 3;
      const gx = seat.gripsKnown ? seat.grips[g] : side * 0.34 * a;
      const gy = seat.gripsKnown ? seat.grips[g + 1] : 0.36 * s;
      const gz = seat.gripsKnown ? seat.grips[g + 2] : -0.56 * s;
      // The bar runs through the fist, thumb inside, knuckles up: -Y outwards, -Z forward and down.
      quatFromBasis(q, 0, 0, side * 0.96, -side * 0.28, -side, 0, 0, 0, 0.28, 0.96);
      placeHand(pose, body, fk, arm, q, 0, gx, gy, gz, side * 0.7, -0.6, 0.3);
    }
  } else {
    for (const arm of ARMS) { // hands resting on the thighs
      const leg = LEGS[arm.index], p = fk.position, t3 = leg.upper * 3, k3 = leg.lower * 3;
      reachWithLimb(pose, body, fk, arm, p[t3] + (p[k3] - p[t3]) * 0.62 - arm.side * 0.02, p[t3 + 1] + (p[k3 + 1] - p[t3 + 1]) * 0.62 + 0.075 * s,
        p[t3 + 2] + (p[k3 + 2] - p[t3 + 2]) * 0.62, arm.side * 0.5, -0.5, 0.6);
      quatFromYawPitchRoll(pose, arm.end * 4, 0, -0.35, 0);
      computeForwardKinematics(body, pose, fk, arm.end, arm.end);
    }
  }
  return pose;
}

/** Both hands on the rim (the right one to the passenger seat's back while looking back). */
function writeWheelHands(pose, body, fk, seat, back) {
  const w = seat.wheel, s = body.legScale;
  let cx = 0, cy = 0.34 * s, cz = -0.44 * s, ax = 0, ay = 0.42, az = 0.91, ux = 0, uy = 0.91, uz = -0.42, r = 0.185;
  if (seat.wheelKnown) {
    cx = w[0]; cy = w[1]; cz = w[2]; ax = w[3]; ay = w[4]; az = w[5]; ux = w[6]; uy = w[7]; uz = w[8]; r = w[9] || 0.185;
  }
  // Right of the rim: up x axis.
  const rx = uy * az - uz * ay, ry = uz * ax - ux * az, rz = ux * ay - uy * ax;
  for (const arm of ARMS) {
    const theta = arm.side * WHEEL_HOLD_ANGLE, sin = Math.sin(theta), cos = Math.cos(theta);
    const gx = cx + r * (cos * ux + sin * rx), gy = cy + r * (cos * uy + sin * ry), gz = cz + r * (cos * uz + sin * rz);
    // The rim through the fist like a pistol's grip: -Y down the rim away from 12, -Z along the column.
    const k = arm.side; // tangent towards 12 o'clock
    let yx = k * (sin * ux - cos * rx), yy = k * (sin * uy - cos * ry), yz = k * (sin * uz - cos * rz);
    const n = 1 / Math.max(1e-6, Math.hypot(yx, yy, yz));
    yx *= n; yy *= n; yz *= n;
    quatFromBasis(q, 0, yy * az - yz * ay, yz * ax - yx * az, yx * ay - yy * ax, yx, yy, yz, ax, ay, az);
    if (arm === ARM_R && back > 0) { // over to the passenger seat's back
      const bx = 0.42 * s, by = 0.5 * s, bz = 0.08 * s;
      const tx = gx + (bx - gx) * back, ty = gy + (by - gy) * back, tz = gz + (bz - gz) * back;
      if (back < 0.5) placeHand(pose, body, fk, arm, q, 0, tx, ty, tz, 0.5, -1, 0.2);
      else {
        reachWithLimb(pose, body, fk, arm, tx, ty, tz, 0.3, -1, 0.5);
        quatIdentity(pose, arm.end * 4);
        computeForwardKinematics(body, pose, fk, arm.end, arm.end);
      }
      continue;
    }
    placeHand(pose, body, fk, arm, q, 0, gx, gy, gz, arm.side * 0.5, -1, 0.25);
  }
}

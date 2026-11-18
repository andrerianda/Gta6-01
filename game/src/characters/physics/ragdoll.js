// A light ragdoll for being hit by a car or thrown by a blast: Verlet points on the skeleton's
// joints (and the crown of the head), held by distance constraints (a stiff torso with a little
// give between pelvis and chest, the head on the neck, upper and lower limbs, and minimum reaches so
// that an arm or a leg never folds flat), falling under gravity onto a supplied ground-height
// function and out of supplied boxes (cars, walls) with friction. The pose is rebuilt from the
// points every frame: pelvis, chest and head frames from their points, the spine and neck between
// them, arms and legs by the rig's two-bone reach with the elbow and knee points as poles, so the
// body keeps its proportions whatever the points do. restingPlacement() tells which way the body
// came to rest (on the back, face down, on a side) so the controller can blend into the matching
// lying pose and the get-up. Fixed 1/120 s substeps; no allocation after creation.
import { orientBoneTo, reachWithLimb } from '../ik/limbPosing.js';
import { placeSeatedHips } from '../motion/seatedPose.js';
import { computeForwardKinematics } from '../skeleton/forwardKinematics.js';
import { ARMS, BONE, LEGS } from '../skeleton/humanSkeleton.js';
import { resetPose } from '../skeleton/poseBuffer.js';
import {
  quatFromBasis, quatFromDirections, quatMultiplyConjRight, quatNlerp, quatRotate,
} from '../skeleton/quaternionMath.js';

/** Particle indices. */
const J = Object.freeze({
  THIGH_L: 0, THIGH_R: 1, SPINE: 2, CHEST: 3, NECK: 4, ARM_L: 5, ARM_R: 6, HEAD: 7, CROWN: 8,
  ELBOW_L: 9, WRIST_L: 10, ELBOW_R: 11, WRIST_R: 12, KNEE_L: 13, ANKLE_L: 14, KNEE_R: 15, ANKLE_R: 16,
  TOE_L: 17, TOE_R: 18,
});
const COUNT = 19;
/** The torso and head points: the rest test watches these (limbs settle with them). */
const TORSO_POINTS = 9;
const JOINT_BONE = Object.freeze([BONE.THIGH_L, BONE.THIGH_R, BONE.SPINE, BONE.CHEST, BONE.NECK, BONE.UPPER_ARM_L,
  BONE.UPPER_ARM_R, BONE.HEAD, -1, BONE.FOREARM_L, BONE.HAND_L, BONE.FOREARM_R, BONE.HAND_R, BONE.SHIN_L, BONE.FOOT_L,
  BONE.SHIN_R, BONE.FOOT_R, BONE.TOE_L, BONE.TOE_R]);
/** Collision radius of each point at 1.78 m (scaled by the body's height). */
const RADIUS = Object.freeze([0.1, 0.1, 0.11, 0.12, 0.08, 0.07, 0.07, 0.1, 0.08, 0.05, 0.04, 0.05, 0.04, 0.06, 0.05, 0.06, 0.05,
  0.03, 0.03]);
const CROWN_HEIGHT = 0.2;

/** Tuning: gravity, the substep, velocity kept per substep, ground friction, the rest test. */
export const RAGDOLL_TUNING = Object.freeze({
  gravity: 9.81, substep: 1 / 120, maxSubsteps: 12, damping: 0.998, friction: 0.22, iterations: 5,
  restSpeed: 0.3, restSeconds: 0.45, maxSeconds: 5,
});

/** Constraints [a, b, stiffness, minimum share (0: keep the length; > 0: only keep it from shrinking below)]. */
const CONSTRAINTS = (() => {
  const list = [];
  const torso = [J.THIGH_L, J.THIGH_R, J.SPINE, J.CHEST, J.NECK, J.ARM_L, J.ARM_R];
  for (let i = 0; i < torso.length; i += 1) {
    for (let k = i + 1; k < torso.length; k += 1) {
      const a = torso[i], b = torso[k], lowA = a <= J.THIGH_R, lowB = b <= J.THIGH_R;
      list.push([a, b, lowA === lowB ? 1 : a === J.SPINE || b === J.SPINE ? 0.8 : 0.3, 0]);
    }
  }
  list.push([J.NECK, J.HEAD, 1, 0], [J.HEAD, J.CROWN, 1, 0], [J.NECK, J.CROWN, 1, 0], [J.CHEST, J.HEAD, 0.5, 0],
    [J.ARM_L, J.CROWN, 0.2, 0], [J.ARM_R, J.CROWN, 0.2, 0]);
  for (const [s, e, w] of [[J.ARM_L, J.ELBOW_L, J.WRIST_L], [J.ARM_R, J.ELBOW_R, J.WRIST_R]]) {
    list.push([s, e, 1, 0], [e, w, 1, 0], [s, w, 1, 0.5]);
  }
  for (const [s, e, w] of [[J.THIGH_L, J.KNEE_L, J.ANKLE_L], [J.THIGH_R, J.KNEE_R, J.ANKLE_R]]) {
    list.push([s, e, 1, 0], [e, w, 1, 0], [s, w, 1, 0.62]);
  }
  list.push([J.ANKLE_L, J.TOE_L, 1, 0], [J.KNEE_L, J.TOE_L, 0.6, 0], [J.ANKLE_R, J.TOE_R, 1, 0], [J.KNEE_R, J.TOE_R, 0.6, 0]);
  list.push([J.KNEE_L, J.KNEE_R, 0.5, 0.6], [J.ANKLE_L, J.ANKLE_R, 0.5, 0.5]);
  return Object.freeze(list.map((c) => Object.freeze(c)));
})();
/** The limb bones in order from the body outwards: [parent point, child point, constraint index]. */
const LIMB_LINKS = Object.freeze([
  [J.ARM_L, J.ELBOW_L], [J.ELBOW_L, J.WRIST_L], [J.ARM_R, J.ELBOW_R], [J.ELBOW_R, J.WRIST_R],
  [J.THIGH_L, J.KNEE_L], [J.KNEE_L, J.ANKLE_L], [J.ANKLE_L, J.TOE_L],
  [J.THIGH_R, J.KNEE_R], [J.KNEE_R, J.ANKLE_R], [J.ANKLE_R, J.TOE_R],
].map(([a, b]) => Object.freeze([a, b, CONSTRAINTS.findIndex((c) => c[0] === a && c[1] === b && c[3] === 0)])));

const v = new Float32Array(4);
const q = new Float32Array(4 * 6); // 0 pelvis, 1 chest, 2 head, 3 spine, 4 neck, 5 scratch
const L = new Float64Array(COUNT * 3);

/**
 * @typedef {object} Ragdoll
 * @property {boolean} active
 * @property {number} age Seconds since start.
 * @property {number} speed Fastest point, m/s, over the last substep.
 * @property {number} still Seconds the body has been below the rest speed.
 * @property {boolean} resting True once still long enough (or maxSeconds passed).
 * @property {Float64Array} pos World positions of the points.
 */

/** Creates a ragdoll for a body (measures its rest frames once). */
export function createRagdoll(body) {
  const rd = {
    active: false, age: 0, speed: 0, still: 0, resting: false, carry: 0, scale: body.heightScale, floor: 0,
    pos: new Float64Array(COUNT * 3), prev: new Float64Array(COUNT * 3), from: new Float64Array(COUNT * 3),
    lengths: new Float64Array(CONSTRAINTS.length),
    rest: new Float32Array(12), ground: null, boxes: null,
    feet: new Float64Array(6), // the rest direction from each ankle to its toe joint (left, right)
  };
  for (const [k, foot, toe] of [[0, BONE.FOOT_L, BONE.TOE_L], [3, BONE.FOOT_R, BONE.TOE_R]]) {
    const r = body.restPosition, x = r[toe * 3] - r[foot * 3], y = r[toe * 3 + 1] - r[foot * 3 + 1], z = r[toe * 3 + 2] - r[foot * 3 + 2];
    const n = Math.hypot(x, y, z) || 1;
    rd.feet[k] = x / n; rd.feet[k + 1] = y / n; rd.feet[k + 2] = z / n;
  }
  // Rest frames of the pelvis, chest and head from the rest joints (character space).
  const r = body.restPosition;
  const at = (bone, k) => r[bone * 3 + k];
  for (let k = 0; k < 3; k += 1) {
    L[J.THIGH_L * 3 + k] = at(BONE.THIGH_L, k); L[J.THIGH_R * 3 + k] = at(BONE.THIGH_R, k);
    L[J.CHEST * 3 + k] = at(BONE.CHEST, k); L[J.NECK * 3 + k] = at(BONE.NECK, k);
    L[J.ARM_L * 3 + k] = at(BONE.UPPER_ARM_L, k); L[J.ARM_R * 3 + k] = at(BONE.UPPER_ARM_R, k);
    L[J.HEAD * 3 + k] = at(BONE.HEAD, k);
  }
  L[J.CROWN * 3] = L[J.HEAD * 3]; L[J.CROWN * 3 + 1] = L[J.HEAD * 3 + 1] + CROWN_HEIGHT * body.heightScale;
  L[J.CROWN * 3 + 2] = L[J.HEAD * 3 + 2];
  frames(L, rd.rest, 0);
  return rd;
}

/**
 * Frames of the pelvis, chest and head from points in `p` (any space) as quaternions into
 * out[o..o+11]. Returns nothing; the pelvis's axes are left in ax / ay / az for the caller.
 */
const axes = new Float64Array(9);
function frames(p, out, o) {
  basis(p, J.THIGH_L, J.THIGH_R, -1, J.CHEST, out, o, true);
  basis(p, J.ARM_L, J.ARM_R, J.CHEST, J.NECK, out, o + 4, false);
  basis(p, J.ARM_L, J.ARM_R, J.HEAD, J.CROWN, out, o + 8, false);
}
function basis(p, left, right, from, to, out, o, keep) {
  let xx = p[right * 3] - p[left * 3], xy = p[right * 3 + 1] - p[left * 3 + 1], xz = p[right * 3 + 2] - p[left * 3 + 2];
  let n = Math.hypot(xx, xy, xz) || 1;
  xx /= n; xy /= n; xz /= n;
  const fx = from < 0 ? (p[left * 3] + p[right * 3]) / 2 : p[from * 3];
  const fy = from < 0 ? (p[left * 3 + 1] + p[right * 3 + 1]) / 2 : p[from * 3 + 1];
  const fz = from < 0 ? (p[left * 3 + 2] + p[right * 3 + 2]) / 2 : p[from * 3 + 2];
  let yx = p[to * 3] - fx, yy = p[to * 3 + 1] - fy, yz = p[to * 3 + 2] - fz;
  const d = yx * xx + yy * xy + yz * xz;
  yx -= d * xx; yy -= d * xy; yz -= d * xz;
  n = Math.hypot(yx, yy, yz) || 1;
  yx /= n; yy /= n; yz /= n;
  const zx = xy * yz - xz * yy, zy = xz * yx - xx * yz, zz = xx * yy - xy * yx;
  quatFromBasis(out, o, xx, xy, xz, yx, yy, yz, zx, zy, zz);
  if (keep) { axes[0] = xx; axes[1] = xy; axes[2] = xz; axes[3] = yx; axes[4] = yy; axes[5] = yz; axes[6] = zx; axes[7] = zy; axes[8] = zz; }
}

/**
 * Starts the ragdoll from the current pose (fk up to date) of a person standing at the instance
 * position with yaw, thrown with world velocity (vx, vy, vz) m/s.
 * @param {Ragdoll} rd
 * @param {import('../skeleton/forwardKinematics.js').FkState} fk
 * @param {{ x: number, y: number, z: number }} origin The instance position.
 * @param {number} yaw The instance rotation.y.
 * @param {{ vx?: number, vy?: number, vz?: number, at?: number, spin?: number,
 *   ground?: (x: number, z: number) => number, boxes?: Array<object> }} options at: the height of
 *   the blow as a share of the stature (a bumper 0.3, a blast 0.5): points near it get the full
 *   velocity, points far from it less, so the body turns over; spin (rad/s) adds a turn about up.
 */
export function startRagdoll(rd, fk, origin, yaw, options) {
  const sin = Math.sin(yaw), cos = Math.cos(yaw), p = fk.position, dt = RAGDOLL_TUNING.substep;
  quatRotate(v, 0, fk.rotation, BONE.HEAD * 4, 0, CROWN_HEIGHT * rd.scale, 0);
  const vx = options.vx ?? 0, vy = options.vy ?? 0, vz = options.vz ?? 0, at = options.at ?? 0.5, spin = options.spin ?? 0;
  const stature = 1.78 * rd.scale;
  for (let i = 0; i < COUNT; i += 1) {
    const b = JOINT_BONE[i] < 0 ? BONE.HEAD : JOINT_BONE[i];
    let lx = p[b * 3], ly = p[b * 3 + 1], lz = p[b * 3 + 2];
    if (i === J.CROWN) { lx += v[0]; ly += v[1]; lz += v[2]; }
    const wx = origin.x + lx * cos + lz * sin, wy = origin.y + ly, wz = origin.z - lx * sin + lz * cos;
    const share = Math.max(0.35, Math.min(1.2, 1.2 - 0.9 * Math.abs(ly / stature - at)));
    const sx = -spin * (wz - origin.z), sz = spin * (wx - origin.x); // a turn about the vertical
    rd.pos[i * 3] = wx; rd.pos[i * 3 + 1] = wy; rd.pos[i * 3 + 2] = wz;
    rd.prev[i * 3] = wx - (vx * share + sx) * dt; rd.prev[i * 3 + 1] = wy - vy * share * dt; rd.prev[i * 3 + 2] = wz - (vz * share + sz) * dt;
  }
  for (let c = 0; c < CONSTRAINTS.length; c += 1) {
    const [a, b] = CONSTRAINTS[c], P = rd.pos;
    rd.lengths[c] = Math.hypot(P[a * 3] - P[b * 3], P[a * 3 + 1] - P[b * 3 + 1], P[a * 3 + 2] - P[b * 3 + 2]);
  }
  rd.ground = options.ground ?? null; rd.boxes = options.boxes ?? null; rd.floor = origin.y;
  rd.active = true; rd.age = 0; rd.still = 0; rd.resting = false; rd.carry = 0; rd.speed = 0;
}

/** Advances the ragdoll by dt seconds (fixed substeps). */
export function stepRagdoll(rd, dt) {
  if (!rd.active) return;
  const T = RAGDOLL_TUNING, h = T.substep, P = rd.pos, Q = rd.prev;
  rd.carry = Math.min(rd.carry + dt, h * T.maxSubsteps);
  while (rd.carry >= h) {
    rd.carry -= h; rd.age += h;
    let fastest = 0;
    for (let i = 0; i < COUNT * 3; i += 3) {
      for (let k = 0; k < 3; k += 1) {
        const x = P[i + k], step = (x - Q[i + k]) * T.damping;
        Q[i + k] = x;
        P[i + k] = x + step - (k === 1 ? T.gravity * h * h : 0);
      }
    }
    for (let it = 0; it < T.iterations; it += 1) {
      for (let c = 0; c < CONSTRAINTS.length; c += 1) {
        const con = CONSTRAINTS[c], a3 = con[0] * 3, b3 = con[1] * 3, stiff = con[2], min = con[3];
        const dx = P[b3] - P[a3], dy = P[b3 + 1] - P[a3 + 1], dz = P[b3 + 2] - P[a3 + 2], d = Math.hypot(dx, dy, dz) || 1e-6;
        const rest = min > 0 ? rd.lengths[c] * min : rd.lengths[c];
        if (min > 0 && d >= rest) continue;
        const k = ((d - rest) / d) * 0.5 * stiff;
        P[a3] += dx * k; P[a3 + 1] += dy * k; P[a3 + 2] += dz * k;
        P[b3] -= dx * k; P[b3 + 1] -= dy * k; P[b3 + 2] -= dz * k;
      }
      collide(rd, it === T.iterations - 1);
    }
    for (let i = 0; i < TORSO_POINTS * 3; i += 3) {
      fastest = Math.max(fastest, Math.hypot(P[i] - Q[i], P[i + 1] - Q[i + 1], P[i + 2] - Q[i + 2]) / h);
    }
    rd.speed = fastest;
    rd.still = fastest < T.restSpeed ? rd.still + h : 0;
  }
  if (rd.still >= T.restSeconds || rd.age >= T.maxSeconds) rd.resting = true;
}

/** Pushes points out of the ground and the boxes; friction on the last pass. */
function collide(rd, friction) {
  const P = rd.pos, Q = rd.prev, f = RAGDOLL_TUNING.friction, boxes = rd.boxes;
  for (let i = 0; i < COUNT; i += 1) {
    const i3 = i * 3, r = RADIUS[i] * rd.scale;
    const floor = (rd.ground ? rd.ground(P[i3], P[i3 + 2]) : rd.floor) + r;
    if (P[i3 + 1] < floor) {
      P[i3 + 1] = floor;
      if (Q[i3 + 1] < floor) Q[i3 + 1] = floor;
      if (friction) { Q[i3] += (P[i3] - Q[i3]) * f; Q[i3 + 2] += (P[i3 + 2] - Q[i3 + 2]) * f; }
    }
    if (!boxes) continue;
    for (let b = 0; b < boxes.length; b += 1) { // { x, y, z, hx, hy, hz, yaw }: the box's centre, half sizes, turn
      const box = boxes[b], s = Math.sin(box.yaw ?? 0), c = Math.cos(box.yaw ?? 0);
      const wx = P[i3] - box.x, wz = P[i3 + 2] - box.z;
      const lx = wx * c - wz * s, ly = P[i3 + 1] - box.y, lz = wx * s + wz * c;
      const ex = box.hx + r - Math.abs(lx), ey = box.hy + r - Math.abs(ly), ez = box.hz + r - Math.abs(lz);
      if (ex <= 0 || ey <= 0 || ez <= 0) continue;
      let ox = 0, oy = 0, oz = 0;
      if (ey <= ex && ey <= ez) oy = Math.sign(ly) * ey;
      else if (ex <= ez) ox = Math.sign(lx) * ex;
      else oz = Math.sign(lz) * ez;
      P[i3] += ox * c + oz * s; P[i3 + 1] += oy; P[i3 + 2] += -ox * s + oz * c;
      if (friction) { Q[i3] += (P[i3] - Q[i3]) * f; Q[i3 + 2] += (P[i3 + 2] - Q[i3 + 2]) * f; }
    }
  }
}

/**
 * Settling into a pose: moves the torso points in a straight line from where the body came to rest
 * (captured when `first`) to the joints of a target pose (fk up to date, seen from an instance at
 * origin turned by yaw), s 0..1, and swings each limb bone from its parent point by turning its
 * direction (at its bone length), kept out of the ground. Turning directions rather than moving
 * the elbow and knee points straight never lets a point pass through its parent (which flipped a
 * knee mid-settle). On a ground function each target joint keeps its height over the ground below
 * it, so the lying pose follows a slope.
 */
export function settleRagdollTowards(rd, fk, origin, yaw, s, first) {
  const P = rd.pos, F = rd.from, T = target, p = fk.position, sin = Math.sin(yaw), cos = Math.cos(yaw);
  if (first) F.set(P);
  quatRotate(v, 0, fk.rotation, BONE.HEAD * 4, 0, CROWN_HEIGHT * rd.scale, 0);
  const g0 = rd.ground ? rd.ground(origin.x, origin.z) : origin.y;
  for (let i = 0; i < COUNT; i += 1) {
    const b = JOINT_BONE[i] < 0 ? BONE.HEAD : JOINT_BONE[i], crown = i === J.CROWN;
    const lx = p[b * 3] + (crown ? v[0] : 0), ly = p[b * 3 + 1] + (crown ? v[1] : 0), lz = p[b * 3 + 2] + (crown ? v[2] : 0);
    const tx = origin.x + lx * cos + lz * sin, tz = origin.z - lx * sin + lz * cos, i3 = i * 3;
    const ty = origin.y + ly + (rd.ground ? rd.ground(tx, tz) - g0 : 0);
    T[i3] = tx; T[i3 + 1] = ty; T[i3 + 2] = tz;
    if (i < TORSO_POINTS) {
      P[i3] = F[i3] + (tx - F[i3]) * s; P[i3 + 1] = F[i3 + 1] + (ty - F[i3 + 1]) * s; P[i3 + 2] = F[i3 + 2] + (tz - F[i3 + 2]) * s;
    }
  }
  // The limbs from the shoulders and hips outwards, each bone turned from its direction at rest to
  // its direction in the target (exact at both ends of the settle).
  for (let k = 0; k < LIMB_LINKS.length; k += 1) {
    const link = LIMB_LINKS[k], a3 = link[0] * 3, b3 = link[1] * 3, c = link[2];
    turnDirection(F[b3] - F[a3], F[b3 + 1] - F[a3 + 1], F[b3 + 2] - F[a3 + 2],
      T[b3] - T[a3], T[b3 + 1] - T[a3 + 1], T[b3 + 2] - T[a3 + 2], s);
    const n = rd.lengths[c];
    P[b3] = P[a3] + turned[0] * n; P[b3 + 1] = P[a3 + 1] + turned[1] * n; P[b3 + 2] = P[a3 + 2] + turned[2] * n;
  }
  collide(rd, false);
  rd.prev.set(P);
}

const target = new Float64Array(COUNT * 3), turned = new Float64Array(3);
/** The unit direction s of the way from direction a to direction b (by the shorter arc) into `turned`. */
function turnDirection(ax, ay, az, bx, by, bz, s) {
  const na = Math.hypot(ax, ay, az) || 1, nb = Math.hypot(bx, by, bz) || 1;
  ax /= na; ay /= na; az /= na; bx /= nb; by /= nb; bz /= nb;
  const d = Math.max(-1, Math.min(1, ax * bx + ay * by + az * bz)), angle = Math.acos(d);
  if (angle < 1e-4) { turned[0] = bx; turned[1] = by; turned[2] = bz; return; }
  let px = bx - ax * d, py = by - ay * d, pz = bz - az * d; // b's part across a
  let n = Math.hypot(px, py, pz);
  if (n < 1e-4) { // opposite: turn through the vertical plane (or across, for a vertical bone)
    px = -ay * ax; py = 1 - ay * ay; pz = -ay * az; n = Math.hypot(px, py, pz);
    if (n < 1e-4) { px = 1; py = 0; pz = 0; n = 1; }
  }
  const c = Math.cos(angle * s), sn = Math.sin(angle * s) / n;
  turned[0] = ax * c + px * sn; turned[1] = ay * c + py * sn; turned[2] = az * c + pz * sn;
}

/**
 * Writes the person's pose from the ragdoll's points, seen from an instance at (ox, oy, oz) turned
 * by yaw (the pose is in that character space; the controller moves the instance with the body).
 */
export function writeRagdollPose(pose, body, fk, rd, ox, oy, oz, yaw) {
  const sin = Math.sin(yaw), cos = Math.cos(yaw), P = rd.pos;
  for (let i = 0; i < COUNT; i += 1) {
    const wx = P[i * 3] - ox, wz = P[i * 3 + 2] - oz;
    L[i * 3] = wx * cos - wz * sin; L[i * 3 + 1] = P[i * 3 + 1] - oy; L[i * 3 + 2] = wx * sin + wz * cos;
  }
  frames(L, q, 0);
  for (let k = 0; k < 3; k += 1) quatMultiplyConjRight(q, k * 4, q, k * 4, rd.rest, k * 4);
  quatNlerp(q, 12, q, 0, q, 4, 0.5);
  quatNlerp(q, 16, q, 4, q, 8, 0.5);
  resetPose(pose);
  computeForwardKinematics(body, pose, fk, BONE.ROOT, BONE.ROOT);
  orientBoneTo(pose, fk, BONE.HIPS, q, 0);
  placeSeatedHips(pose, body, fk, (L[0] + L[3]) / 2, (L[1] + L[4]) / 2, (L[2] + L[5]) / 2);
  orientBoneTo(pose, fk, BONE.SPINE, q, 12);
  orientBoneTo(pose, fk, BONE.CHEST, q, 4);
  orientBoneTo(pose, fk, BONE.NECK, q, 16);
  orientBoneTo(pose, fk, BONE.HEAD, q, 8);
  computeForwardKinematics(body, pose, fk);
  // The pelvis's back axis (z) for straight limbs: elbows back, knees forward.
  frames(L, q, 0);
  const zx = axes[6], zy = axes[7], zz = axes[8];
  posedLimb(pose, body, fk, ARMS[0], J.ELBOW_L, J.WRIST_L, zx, zy, zz);
  posedLimb(pose, body, fk, ARMS[1], J.ELBOW_R, J.WRIST_R, zx, zy, zz);
  posedLimb(pose, body, fk, LEGS[0], J.KNEE_L, J.ANKLE_L, -zx, -zy, -zz);
  posedLimb(pose, body, fk, LEGS[1], J.KNEE_R, J.ANKLE_R, -zx, -zy, -zz);
  for (let side = 0; side < 2; side += 1) { // each foot towards its toe point
    const leg = LEGS[side], toe = side ? J.TOE_R : J.TOE_L, k = side * 3, p = fk.position, a = leg.end * 3;
    let tx = L[toe * 3] - p[a], ty = L[toe * 3 + 1] - p[a + 1], tz = L[toe * 3 + 2] - p[a + 2];
    const n = Math.hypot(tx, ty, tz) || 1;
    tx /= n; ty /= n; tz /= n;
    quatFromDirections(q, 20, rd.feet[k], rd.feet[k + 1], rd.feet[k + 2], tx, ty, tz);
    orientBoneTo(pose, fk, leg.end, q, 20);
    computeForwardKinematics(body, pose, fk, leg.end, leg.tip);
  }
  return pose;
}

/** One limb to its end point (character space, in L) with its middle point as the pole. */
function posedLimb(pose, body, fk, limb, mid, end, bx, by, bz) {
  const s = limb.upper * 3, p = fk.position;
  let px = L[mid * 3] - (p[s] + L[end * 3]) / 2, py = L[mid * 3 + 1] - (p[s + 1] + L[end * 3 + 1]) / 2;
  let pz = L[mid * 3 + 2] - (p[s + 2] + L[end * 3 + 2]) / 2;
  if (Math.hypot(px, py, pz) < 0.02) { px = bx; py = by; pz = bz; }
  reachWithLimb(pose, body, fk, limb, L[end * 3], L[end * 3 + 1], L[end * 3 + 2], px, py, pz);
  computeForwardKinematics(body, pose, fk, limb.end, limb.leg ? limb.tip : limb.end);
}

/**
 * How the body lies now: out.direction ('back' face up, 'forward' face down, 'left' / 'right' on
 * that side), and the instance placement (out.x, out.z, out.yaw) whose lying pose of that
 * direction (motion/deathFall.js writeLyingPoseAfter) matches the body.
 */
export function restingPlacement(rd, out) {
  frames(rd.pos, q, 0);
  const P = rd.pos, ry = axes[1], frontY = -axes[7];
  const mx = (P[0] + P[3]) / 2, mz = (P[2] + P[5]) / 2;
  let hx = (P[J.HEAD * 3] + P[J.CROWN * 3]) / 2 - mx, hz = (P[J.HEAD * 3 + 2] + P[J.CROWN * 3 + 2]) / 2 - mz;
  const n = Math.hypot(hx, hz) || 1;
  hx /= n; hz /= n;
  if (Math.abs(frontY) >= Math.abs(ry)) {
    out.direction = frontY > 0 ? 'back' : 'forward';
    out.yaw = frontY > 0 ? Math.atan2(hx, hz) : Math.atan2(-hx, -hz);
    out.x = mx; out.z = mz;
  } else {
    const side = ry < 0 ? 1 : -1; // the right side down: lying on the right
    out.direction = side > 0 ? 'right' : 'left';
    out.yaw = side > 0 ? Math.atan2(-hz, hx) : Math.atan2(hz, -hx);
    // The side-lying pose has its hips 0.15 m to the lying side of the instance (character +X side).
    out.x = mx - side * 0.15 * rd.scale * Math.cos(out.yaw);
    out.z = mz + side * 0.15 * rd.scale * Math.sin(out.yaw);
  }
  return out;
}

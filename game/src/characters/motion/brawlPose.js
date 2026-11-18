// Unarmed combat: the guard (fists at the chin, the left hand leading, elbows in) and the block
// (forearms up before the face), and the strikes as timed one-shots over whatever the legs do:
// jab (left, straight), cross (right, straight, the chest turned into it), hook (right, the elbow
// up, the fist swung round to the centre line) and a front push kick (right leg: knee up, foot
// driven out at hip height, the hips over the left foot and leaning back). Each strike has an
// extension envelope (a small draw back, fast out to the impact, a short hold, an eased return);
// the writers work on the person's pose in place, in character space, lengths from the body.
import { reachWithLimb } from '../ik/limbPosing.js';
import { computeForwardKinematics } from '../skeleton/forwardKinematics.js';
import { ARMS, ARM_L, ARM_R, BONE, LEG_L, LEG_R } from '../skeleton/humanSkeleton.js';
import { POSE_HIPS_TRANSLATION } from '../skeleton/poseBuffer.js';
import { quatFromYawPitchRoll, quatIdentity, quatMultiply, quatRotate, smoothStep } from '../skeleton/quaternionMath.js';
import { plantLeg } from './seatedPose.js';

/** The strikes: seconds, impact (share of the time), limb, chest turn into it (rad, + left). */
export const STRIKES = Object.freeze({
  jab: Object.freeze({ seconds: 0.38, impact: 0.38, arm: ARM_L, twist: -0.2, kind: 'straight' }),
  cross: Object.freeze({ seconds: 0.48, impact: 0.42, arm: ARM_R, twist: 0.5, kind: 'straight' }),
  hook: Object.freeze({ seconds: 0.55, impact: 0.46, arm: ARM_R, twist: 0.65, kind: 'hook' }),
  kick: Object.freeze({ seconds: 0.85, impact: 0.42, arm: null, twist: 0.08, kind: 'kick' }),
});
/** The three-hit combination play('combo') runs. */
export const COMBO = Object.freeze(['jab', 'cross', 'hook']);

const v = new Float32Array(6);
const turn = new Float32Array(4);
const G = new Float64Array(3);

/**
 * The guard ('guard') or the block ('block') over the arms (fk up to date).
 * @param {Float32Array} pose
 * @param {import('../skeleton/bodyMeasurements.js').BodyModel} body
 * @param {import('../skeleton/forwardKinematics.js').FkState} fk
 * @param {'guard' | 'block'} kind
 * @param {number} [time] Seconds, for the guard's small bob.
 */
export function writeGuardPose(pose, body, fk, kind, time = 0) {
  const p = fk.position, s = body.armLength / 0.585, n = BONE.NECK * 3, bob = Math.sin(time * 5.3) * 0.008 * s;
  quatFromYawPitchRoll(turn, 0, 0, -0.08, 0); // chin tucked
  quatMultiply(pose, BONE.HEAD * 4, pose, BONE.HEAD * 4, turn, 0);
  computeForwardKinematics(body, pose, fk, BONE.HEAD, BONE.HAND_R);
  for (const arm of ARMS) {
    const side = arm.side, lead = side < 0;
    if (kind === 'block') { // forearms up before the face, elbows together in front of the chest
      quatRotate(v, 0, fk.rotation, BONE.CHEST * 4, side * 0.07 * s, 0.14 * s, -0.17 * s);
      quatRotate(v, 3, fk.rotation, BONE.CHEST * 4, side * 0.3, -1, -0.6);
    } else { // fists at the chin (the wrists under it: the fists stand above them), the left further out, elbows in and down
      quatRotate(v, 0, fk.rotation, BONE.CHEST * 4, side * 0.11 * s, -0.02 * s + bob, -(lead ? 0.37 : 0.27) * s);
      quatRotate(v, 3, fk.rotation, BONE.CHEST * 4, side * 0.5, -1, 0.15);
    }
    reachWithLimb(pose, body, fk, arm, p[n] + v[0], p[n + 1] + v[1], p[n + 2] + v[2], v[3], v[4], v[5]);
    quatIdentity(pose, arm.end * 4);
    computeForwardKinematics(body, pose, fk, arm.end, arm.end);
  }
  return pose;
}

/** The strike's extension at progress u (0..1): -0.12 drawn back .. 1 at full reach. */
export function strikeEnvelope(strike, u) {
  if (!(u > 0) || u >= 1) return 0;
  const i = strike.impact, back = i * 0.3;
  if (u < back) return -0.12 * smoothStep(0, back, u);
  if (u < i) return -0.12 + 1.12 * smoothStep(back, i, u);
  if (u < i + 0.08) return 1;
  return 1 - smoothStep(i + 0.08, 1, u);
}

/**
 * Lays a strike at progress u over the person's pose (in place; fk up to date) and writes the
 * striking fist's or foot's joint into `point` (character space): at the impact it is where the
 * blow lands. Returns the extension.
 * @param {Float32Array} pose
 * @param {import('../skeleton/bodyMeasurements.js').BodyModel} body
 * @param {import('../skeleton/forwardKinematics.js').FkState} fk
 * @param {typeof STRIKES.jab} strike
 * @param {number} u
 * @param {Float64Array} point
 */
export function writeStrikePose(pose, body, fk, strike, u, point) {
  const e = strikeEnvelope(strike, u), p = fk.position, s = body.armLength / 0.585, ls = body.legScale;
  const twist = strike.twist * Math.max(0, e) + strike.twist * 0.25 * Math.min(0, e);
  quatFromYawPitchRoll(turn, 0, twist * 0.35, 0, 0);
  quatMultiply(pose, BONE.SPINE * 4, pose, BONE.SPINE * 4, turn, 0);
  quatFromYawPitchRoll(turn, 0, twist * 0.65, 0, 0);
  quatMultiply(pose, BONE.CHEST * 4, pose, BONE.CHEST * 4, turn, 0);
  if (strike.kind === 'kick') return writeKick(pose, body, fk, strike, u, e, point, ls);
  computeForwardKinematics(body, pose, fk, BONE.SPINE, BONE.HAND_R);
  const arm = strike.arm, side = arm.side, h = arm.end * 3, n = BONE.NECK * 3, k = e;
  G[0] = p[h]; G[1] = p[h + 1]; G[2] = p[h + 2]; // where the fist is now (the guard)
  const ex = -side * 0.02 * s, ey = p[n + 1] + 0.05 * s;
  let x, y, z, px, py, pz;
  if (strike.kind === 'hook') { // round from the side to the centre line, the elbow up
    const ez = p[n + 2] - 0.42 * s, cx = side * 0.46 * s, cz = p[n + 2] - 0.28 * s, a = Math.max(0, k), b = 1 - a;
    x = b * b * G[0] + 2 * a * b * cx + a * a * ex;
    y = G[1] + (ey - G[1]) * a;
    z = b * b * G[2] + 2 * a * b * cz + a * a * ez;
    if (k < 0) { x = G[0] - k * side * 0.08 * s; z = G[2] - k * 0.05 * s; }
    px = side; py = 0.55; pz = 0.2;
  } else { // straight down the centre line at chin height
    const ez = p[n + 2] - 0.66 * s;
    x = G[0] + (ex - G[0]) * k; y = G[1] + (ey - G[1]) * k; z = G[2] + (ez - G[2]) * k;
    px = side * 0.6; py = -1; pz = 0.3;
  }
  reachWithLimb(pose, body, fk, arm, x, y, z, px, py, pz);
  quatIdentity(pose, arm.end * 4);
  computeForwardKinematics(body, pose, fk, arm.end, arm.end);
  point[0] = p[h]; point[1] = p[h + 1]; point[2] = p[h + 2];
  return e;
}

/** The front kick with the right leg; the left foot stays where it stands. */
function writeKick(pose, body, fk, strike, u, e, point, ls) {
  const p = fk.position, support = LEG_L, leg = LEG_R, a = support.end * 3;
  const planted = smoothStep(0, 0.18, u) * (1 - smoothStep(0.82, 1, u));
  const sx = p[a], sy = p[a + 1], sz = p[a + 2];
  // The hips over the left foot, leaning back against the kick.
  pose[POSE_HIPS_TRANSLATION] += support.side * body.hipHalfWidth * 0.85 * planted;
  pose[POSE_HIPS_TRANSLATION + 1] -= 0.03 * ls * planted;
  quatFromYawPitchRoll(turn, 0, 0, 0.2 * planted, 0);
  quatMultiply(pose, BONE.HIPS * 4, pose, BONE.HIPS * 4, turn, 0);
  quatFromYawPitchRoll(turn, 0, 0, -0.04 * planted, 0); // the trunk stays leant back (about 9 degrees)
  quatMultiply(pose, BONE.SPINE * 4, pose, BONE.SPINE * 4, turn, 0);
  computeForwardKinematics(body, pose, fk);
  reachWithLimb(pose, body, fk, support, sx, sy, sz, 0, 0, -1, 0.01);
  computeForwardKinematics(body, pose, fk, support.end, support.tip);
  // The kicking leg: knee up (chamber), then the foot out at hip height, then back down.
  const t = leg.upper * 3, f = leg.end * 3, L = body.legLength;
  const chamber = smoothStep(0.05, strike.impact * 0.7, u) * (1 - smoothStep(strike.impact + 0.22, 0.97, u));
  const out = Math.max(0, e);
  let x = p[f], y = p[f + 1], z = p[f + 2];
  const cx = p[t], cy = p[t + 1] - 0.05 * ls - body.shinLength * 0.88, cz = p[t + 2] - body.thighLength + 0.12 * ls;
  x += (cx - x) * chamber; y += (cy - y) * chamber; z += (cz - z) * chamber;
  const ex = p[t] - 0.03 * ls, ey = p[t + 1] - 0.1 * L, ez = p[t + 2] - 0.93 * L;
  x += (ex - x) * out; y += (ey - y) * out; z += (ez - z) * out;
  plantLeg(pose, body, fk, leg, x, y, z, 0, 0.4, -1, 1.1 * out + 0.3 * chamber);
  const toe = leg.tip * 3;
  point[0] = p[toe]; point[1] = p[toe + 1]; point[2] = p[toe + 2];
  return e;
}

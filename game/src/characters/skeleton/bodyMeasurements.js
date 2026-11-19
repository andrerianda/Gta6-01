// Measures a body from the rest positions of its joints. People in MARAZUL differ in height
// (1.55 to 1.95 m) and build, so nothing in the animation code assumes one body: every length a
// motion needs (leg, arm, hip width, ankle height, foot length ...) is read here from the loaded
// skeleton, and motions are written in "reference metres", the sizes of a 1.78 m adult, which the
// body's scales turn into its own.
//
// It also fixes the frame in which limbs are posed. A bone's roll in the file is ignored: an arm
// or leg bone is described by the direction it points along and by its hinge axis (the axis the
// elbow or knee turns about), both in character space (+X right, +Y up, -Z forward).
import { ARMS, BONE, BONE_COUNT, BONE_PARENT, LEGS } from './humanSkeleton.js';
import { quatFromBasis } from './quaternionMath.js';

/** The sizes of the reference adult that motions are written for. */
export const REFERENCE_BODY = Object.freeze({
  stature: 1.78,
  legLength: 0.874,
  armLength: 0.585,
});

/**
 * The measurements of one body.
 * @typedef {object} BodyModel
 * @property {Float32Array} restPosition Joint positions at rest, character space, 3 per bone.
 * @property {Float32Array} restOffset Each joint's rest offset from its parent joint, 3 per bone.
 * @property {Float32Array} limbFrame For limb bones, the rest frame (hinge, direction) as a
 *   quaternion, 4 per bone.
 * @property {Float32Array} gripRotation Rest orientation of each palm's grip frame (-Z along a
 *   held pistol's barrel, +Y up), 4 per hand, left first.
 * @property {Float32Array} gripOffset Rest offset of each grip point from its wrist, 3 per hand.
 * @property {boolean} hasJaw Whether the file has a jaw bone.
 * @property {number} stature Height of the standing person, metres.
 * @property {number} heightScale stature / 1.78.
 * @property {number} legLength Thigh plus shin.
 * @property {number} legScale legLength / 0.874: the scale of steps, crouches and jumps.
 * @property {number} thighLength
 * @property {number} shinLength
 * @property {number} armLength Upper arm plus forearm.
 * @property {number} upperArmLength
 * @property {number} forearmLength
 * @property {number} hipHeight Height of the hips joint above the ground at rest.
 * @property {number} hipJointHeight Height of the thigh joints above the ground at rest.
 * @property {number} hipHalfWidth Half the distance between the thigh joints.
 * @property {number} shoulderHalfWidth Half the distance between the upper-arm joints.
 * @property {number} ankleHeight Height of the ankle joint above the sole.
 * @property {number} ballForward Distance from the ankle forward to the ball of the foot.
 * @property {number} heelBack Distance from the ankle back to the heel's contact point.
 * @property {number} toeLength Length of the toes beyond the ball.
 * @property {number} toeHeight Height of the toe joint above the sole at rest.
 * @property {number} headTop Height of the crown above the head joint.
 * @property {number} armClearance The least abduction (radians) that keeps a hanging arm off the torso.
 * @property {number} torsoHalfWidth Half the width of the torso at the elbows' height.
 */

/**
 * Builds the measurements of a body.
 * @param {ArrayLike<number>} restPositions The joint (bone head) positions at rest in character
 *   space, three numbers per bone in BONE_NAMES order. A missing jaw may be left at zero.
 * @param {object} [options]
 * @param {boolean} [options.hasJaw] Whether the jaw's position is real (default: it is non-zero).
 * @param {number} [options.stature] Standing height in metres (default: estimated from the head).
 * @param {number} [options.torsoHalfWidth] Half-width of the torso at elbow height (default: by stature).
 * @param {number} [options.armRadius] Radius of the upper arm (default: by stature).
 * @param {ArrayLike<number>} [options.gripRotation] Grip frames read from the palm anchors (4 per hand).
 * @param {ArrayLike<number>} [options.gripOffset] Grip points relative to the wrists (3 per hand).
 * @returns {BodyModel}
 */
export function createBodyModel(restPositions, options = {}) {
  const restPosition = new Float32Array(BONE_COUNT * 3);
  for (let i = 0; i < BONE_COUNT * 3; i += 1) restPosition[i] = restPositions[i] ?? 0;
  const hasJaw = options.hasJaw ?? (Math.abs(restPosition[BONE.JAW * 3 + 1]) > 1e-6);
  if (!hasJaw) {
    // Park a missing jaw a little below and in front of the head joint.
    restPosition[BONE.JAW * 3] = restPosition[BONE.HEAD * 3];
    restPosition[BONE.JAW * 3 + 1] = restPosition[BONE.HEAD * 3 + 1] + 0.01;
    restPosition[BONE.JAW * 3 + 2] = restPosition[BONE.HEAD * 3 + 2] - 0.02;
  }
  const restOffset = new Float32Array(BONE_COUNT * 3);
  for (let bone = 0; bone < BONE_COUNT; bone += 1) {
    const parent = BONE_PARENT[bone];
    for (let axis = 0; axis < 3; axis += 1) {
      restOffset[bone * 3 + axis] = restPosition[bone * 3 + axis] - (parent < 0 ? 0 : restPosition[parent * 3 + axis]);
    }
  }
  const distance = (a, b) => Math.hypot(
    restPosition[a * 3] - restPosition[b * 3],
    restPosition[a * 3 + 1] - restPosition[b * 3 + 1],
    restPosition[a * 3 + 2] - restPosition[b * 3 + 2]);
  const groundY = restPosition[BONE.ROOT * 3 + 1];
  const y = (bone) => restPosition[bone * 3 + 1] - groundY;

  const thighLength = (distance(BONE.THIGH_L, BONE.SHIN_L) + distance(BONE.THIGH_R, BONE.SHIN_R)) / 2;
  const shinLength = (distance(BONE.SHIN_L, BONE.FOOT_L) + distance(BONE.SHIN_R, BONE.FOOT_R)) / 2;
  const upperArmLength = (distance(BONE.UPPER_ARM_L, BONE.FOREARM_L) + distance(BONE.UPPER_ARM_R, BONE.FOREARM_R)) / 2;
  const forearmLength = (distance(BONE.FOREARM_L, BONE.HAND_L) + distance(BONE.FOREARM_R, BONE.HAND_R)) / 2;
  const legLength = thighLength + shinLength;
  const armLength = upperArmLength + forearmLength;
  const stature = options.stature ?? y(BONE.HEAD) * 1.098;
  const heightScale = stature / REFERENCE_BODY.stature;
  const ballForward = (
    Math.hypot(restOffset[BONE.TOE_L * 3], restOffset[BONE.TOE_L * 3 + 2])
    + Math.hypot(restOffset[BONE.TOE_R * 3], restOffset[BONE.TOE_R * 3 + 2])) / 2;
  const shoulderHalfWidth = Math.abs(restPosition[BONE.UPPER_ARM_R * 3] - restPosition[BONE.UPPER_ARM_L * 3]) / 2;
  const torsoHalfWidth = options.torsoHalfWidth ?? 0.15 * heightScale;
  const armRadius = options.armRadius ?? 0.045 * heightScale;
  const clearance = Math.asin(Math.min(0.5, Math.max(0.05,
    (torsoHalfWidth + armRadius + 0.012 - shoulderHalfWidth) / upperArmLength)));

  /** @type {BodyModel} */
  const body = {
    restPosition,
    restOffset,
    limbFrame: new Float32Array(BONE_COUNT * 4),
    gripRotation: new Float32Array(8),
    gripOffset: new Float32Array(6),
    hasJaw,
    stature,
    heightScale,
    legLength,
    legScale: legLength / REFERENCE_BODY.legLength,
    thighLength,
    shinLength,
    armLength,
    upperArmLength,
    forearmLength,
    hipHeight: y(BONE.HIPS),
    hipJointHeight: (y(BONE.THIGH_L) + y(BONE.THIGH_R)) / 2,
    hipHalfWidth: Math.abs(restPosition[BONE.THIGH_R * 3] - restPosition[BONE.THIGH_L * 3]) / 2,
    shoulderHalfWidth,
    ankleHeight: (y(BONE.FOOT_L) + y(BONE.FOOT_R)) / 2,
    ballForward,
    heelBack: ballForward * 0.42,
    toeLength: ballForward * 0.5,
    toeHeight: Math.max(0, (y(BONE.TOE_L) + y(BONE.TOE_R)) / 2),
    headTop: stature - y(BONE.HEAD),
    armClearance: clearance,
    torsoHalfWidth,
  };

  for (let bone = 0; bone < BONE_COUNT; bone += 1) body.limbFrame[bone * 4 + 3] = 1;
  for (const arm of ARMS) {
    writeLimbFrames(body, arm.upper, arm.lower, arm.end, false);
    writeDefaultGrip(body, arm);
  }
  for (const leg of LEGS) writeLimbFrames(body, leg.upper, leg.lower, leg.end, true);
  if (options.gripRotation) body.gripRotation.set(options.gripRotation);
  if (options.gripOffset) body.gripOffset.set(options.gripOffset);
  return body;
}

/**
 * The rest frames of a limb's two bones. The direction is joint to joint; the hinge is the axis
 * the middle joint turns about: for an arm hanging at the side it is +X (the forearm folds
 * forwards), for a leg -X (the shin folds backwards). The A-pose only swings that frame sideways.
 */
function writeLimbFrames(body, upper, lower, end, isLeg) {
  const p = body.restPosition;
  let ux = p[lower * 3] - p[upper * 3], uy = p[lower * 3 + 1] - p[upper * 3 + 1], uz = p[lower * 3 + 2] - p[upper * 3 + 2];
  let n = 1 / Math.hypot(ux, uy, uz);
  ux *= n; uy *= n; uz *= n;
  let lx = p[end * 3] - p[lower * 3], ly = p[end * 3 + 1] - p[lower * 3 + 1], lz = p[end * 3 + 2] - p[lower * 3 + 2];
  n = 1 / Math.hypot(lx, ly, lz);
  lx *= n; ly *= n; lz *= n;
  // The hinge: direction x forward for arms, forward x direction for legs, forward = (0, 0, -1).
  let hx = -uy, hy = ux, hz = 0;
  if (isLeg) {
    hx = uy; hy = -ux;
  }
  n = Math.hypot(hx, hy, hz);
  if (n < 1e-4) {
    hx = isLeg ? -1 : 1; hy = 0; hz = 0; n = 1;
  }
  hx /= n; hy /= n; hz /= n;
  quatFromBasis(body.limbFrame, upper * 4, hx, hy, hz, ux, uy, uz,
    hy * uz - hz * uy, hz * ux - hx * uz, hx * uy - hy * ux);
  // The lower bone shares the joint axis, made perpendicular to its own direction.
  const along = hx * lx + hy * ly + hz * lz;
  let kx = hx - lx * along, ky = hy - ly * along, kz = hz - lz * along;
  n = 1 / Math.hypot(kx, ky, kz);
  kx *= n; ky *= n; kz *= n;
  quatFromBasis(body.limbFrame, lower * 4, kx, ky, kz, lx, ly, lz,
    ky * lz - kz * ly, kz * lx - kx * lz, kx * ly - ky * lx);
}

/**
 * The grip frame of a hand when the file has no palm anchor: the barrel runs along the forearm,
 * the gun's right side along the elbow's hinge axis, so the palm presses on the grip's side.
 */
function writeDefaultGrip(body, arm) {
  const p = body.restPosition;
  let bx = p[arm.end * 3] - p[arm.lower * 3], by = p[arm.end * 3 + 1] - p[arm.lower * 3 + 1], bz = p[arm.end * 3 + 2] - p[arm.lower * 3 + 2];
  let n = 1 / Math.hypot(bx, by, bz);
  bx *= n; by *= n; bz *= n;
  let rx = -by, ry = bx, rz = 0;
  n = 1 / Math.max(1e-6, Math.hypot(rx, ry, rz));
  rx *= n; ry *= n; rz *= n;
  const ux = ry * bz - rz * by, uy = rz * bx - rx * bz, uz = rx * by - ry * bx;
  quatFromBasis(body.gripRotation, arm.index * 4, rx, ry, rz, ux, uy, uz, -bx, -by, -bz);
  const reach = 0.085 * body.heightScale, palm = -arm.side * 0.022 * body.heightScale;
  body.gripOffset[arm.index * 3] = bx * reach + rx * palm;
  body.gripOffset[arm.index * 3 + 1] = by * reach + ry * palm;
  body.gripOffset[arm.index * 3 + 2] = bz * reach + rz * palm;
}

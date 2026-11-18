// Writes the pose of a person standing, walking, jogging, running or sprinting, from one gait
// model: the feet are placed on the ground by the model's fixed sole points and reached with leg
// inverse kinematics, the pelvis rides as high as the planted legs allow (which is what makes a
// walk rise over the standing leg and dip at the step), the pelvis turns with the legs and the
// chest and arms against it, and the head stays level and forward. Standing still it breathes
// and shifts its weight. Speed is the only thing a caller changes between gaits.
import { orientBoneTo, poseLimbAlong, reachWithLimb } from '../ik/limbPosing.js';
import { computeForwardKinematics } from '../skeleton/forwardKinematics.js';
import { ARM_L, ARM_R, BONE, LEG_L, LEG_R } from '../skeleton/humanSkeleton.js';
import { POSE_FOOT_CONTACT, POSE_HIPS_TRANSLATION, resetPose } from '../skeleton/poseBuffer.js';
import {
  quatFromAxisAngle, quatFromYawPitchRoll, quatMultiply, quatMultiplyConjRight, quatRotate, smoothMin,
} from '../skeleton/quaternionMath.js';
import { createFootSample, createGait, evaluateGait, sampleFootCycle } from './gaitModel.js';
import { createIdleSample, sampleIdleStance } from './idleStance.js';

/** How straight a planted leg may get, as a fraction of thigh plus shin. */
export const PLANTED_LEG_REACH = 0.996;
const LEG_SOFTNESS = 0.003;
const TWO_PI = Math.PI * 2;

/**
 * What drives a locomotion pose.
 * @typedef {object} LocomotionInput
 * @property {number} speed Ground speed, m/s.
 * @property {number} phase Stride phase; the left foot lands at whole numbers, the right at halves.
 * @property {number} [time] Seconds, for the standing idle.
 * @property {number} [seed] The person's seed (idle variation).
 * @property {number} [lean] Extra forward lean, radians (accelerating; negative when braking).
 * @property {number} [bank] Lean into a turn, radians (positive leans to the left).
 * @property {number} [headYaw] Where the head looks, radians to the left of straight ahead.
 */

/**
 * Creates the scratch state one locomotion pose needs; share one between people.
 * @returns {{ gait: import('./gaitModel.js').Gait, footL: import('./gaitModel.js').FootSample,
 *   footR: import('./gaitModel.js').FootSample, idle: import('./idleStance.js').IdleSample }}
 */
export function createLocomotionScratch() {
  return { gait: createGait(), footL: createFootSample(), footR: createFootSample(), idle: createIdleSample() };
}

const shared = createLocomotionScratch();
const vector = new Float32Array(9); // ankle targets (left, right) and one rotated hip offset
const armAxes = new Float32Array(9);
const turn = new Float32Array(4);
const hand = new Float32Array(8);

/**
 * Writes a standing or moving pose.
 * @param {Float32Array} pose The pose to write (it is reset first).
 * @param {import('../skeleton/bodyMeasurements.js').BodyModel} body
 * @param {import('../skeleton/forwardKinematics.js').FkState} fk Receives the joints of the pose.
 * @param {LocomotionInput} input
 * @param {ReturnType<typeof createLocomotionScratch>} [scratch] Receives the gait and both foot
 *   samples (for events and tests); a shared one is used when left out.
 * @returns {Float32Array} `pose`.
 */
export function writeLocomotionPose(pose, body, fk, input, scratch = shared) {
  const { gait, footL, footR, idle } = scratch;
  const rest = body.restPosition, scale = body.legScale;
  const restHalfWidth = (rest[BONE.FOOT_R * 3] - rest[BONE.FOOT_L * 3]) / 2;
  evaluateGait(gait, input.speed, scale, restHalfWidth);
  sampleIdleStance(idle, input.time ?? 0, input.seed ?? 0);
  const phase = input.phase, still = 1 - gait.move;
  sampleFootCycle(footL, gait, body, phase);
  sampleFootCycle(footR, gait, body, phase + 0.5);
  resetPose(pose);

  const angle = TWO_PI * phase;
  const support = Math.sin(TWO_PI * (phase - 0.06)); // +1 in the middle of standing on the left leg
  const bank = input.bank ?? 0;
  const lean = gait.lean + (input.lean ?? 0);

  // The pelvis: turned with the legs, dropped on the swing side, carried over the standing foot.
  const pelvisYaw = -gait.pelvisYaw * Math.cos(angle) + still * idle.pelvisYaw;
  const list = -gait.pelvisList * support + still * idle.list + bank * 0.35;
  quatFromYawPitchRoll(pose, BONE.HIPS * 4, pelvisYaw, -lean * 0.3, list);
  const swayX = -gait.pelvisSway * support + still * idle.sway * scale - Math.sin(bank) * body.hipHeight * 0.45;
  const pushZ = Math.sin(lean) * body.hipHeight * 0.12;
  let height = -gait.pelvisDrop - gait.bounce * Math.cos(2 * angle - TWO_PI * gait.duty) + still * idle.drop * scale;
  const hipX = rest[BONE.HIPS * 3] + swayX, hipY = rest[BONE.HIPS * 3 + 1], hipZ = rest[BONE.HIPS * 3 + 2] + pushZ;
  const reach = body.legLength * PLANTED_LEG_REACH;
  for (let side = 0; side < 2; side += 1) {
    const leg = side ? LEG_R : LEG_L, foot = side ? footR : footL, o = side * 3;
    const u3 = leg.upper * 3, e3 = leg.end * 3;
    quatRotate(vector, 6, pose, BONE.HIPS * 4, body.restOffset[u3], body.restOffset[u3 + 1], body.restOffset[u3 + 2]);
    vector[o] = leg.side * gait.stepHalfWidth;
    vector[o + 1] = foot.height;
    vector[o + 2] = rest[e3 + 2] - foot.forward;
    const dx = vector[o] - (hipX + vector[6]), dz = vector[o + 2] - (hipZ + vector[8]);
    const limit = foot.height + Math.sqrt(Math.max(1e-4, reach * reach - dx * dx - dz * dz)) - vector[7] - hipY;
    height = smoothMin(height, limit + (1 - foot.contact) * 0.3, 0.03 * scale);
  }
  pose[POSE_HIPS_TRANSLATION] = swayX;
  pose[POSE_HIPS_TRANSLATION + 1] = height;
  pose[POSE_HIPS_TRANSLATION + 2] = pushZ;

  // The trunk: the chest turns against the pelvis and levels the shoulders, the head stays put.
  const chestYaw = gait.chestYaw * Math.cos(angle) + still * idle.chestYaw;
  const trunkYaw = (chestYaw - pelvisYaw) * 0.5;
  const trunkRoll = -list * 0.5 + bank * 0.3;
  const breath = still * idle.breath;
  quatFromYawPitchRoll(pose, BONE.SPINE * 4, trunkYaw, -lean * 0.4 + breath * 0.006, trunkRoll);
  quatFromYawPitchRoll(pose, BONE.CHEST * 4, trunkYaw, -lean * 0.3 + breath * 0.014, trunkRoll);
  const headYaw = ((input.headYaw ?? 0) + still * idle.headYaw - chestYaw) * 0.5;
  const headPitch = lean * 0.3 - still * idle.headPitch * 0.5 - breath * 0.005;
  quatFromYawPitchRoll(pose, BONE.NECK * 4, headYaw, headPitch, -bank * 0.2 + still * idle.headRoll * 0.5);
  quatFromYawPitchRoll(pose, BONE.HEAD * 4, headYaw, headPitch, -bank * 0.2 + still * idle.headRoll * 0.5);

  // The arms swing against the legs: the left arm is forward when the right foot lands.
  const swing = Math.cos(TWO_PI * (phase - 0.04));
  // (The shoulder girdle follows its arm: forward with the arm in front, up a little breathing in.)
  quatFromYawPitchRoll(pose, BONE.SHOULDER_L * 4, 0.07 * gait.run * swing, 0, -breath * 0.01);
  quatFromYawPitchRoll(pose, BONE.SHOULDER_R * 4, 0.07 * gait.run * swing, 0, breath * 0.01);
  computeForwardKinematics(body, pose, fk, 0, BONE.UPPER_ARM_L);
  writeSwingingArm(pose, body, fk, ARM_L, gait, -swing, still * idle.armDrift);
  computeForwardKinematics(body, pose, fk, BONE.HAND_L, BONE.UPPER_ARM_R);
  writeSwingingArm(pose, body, fk, ARM_R, gait, swing, -still * idle.armDrift);
  computeForwardKinematics(body, pose, fk, BONE.HAND_R, BONE.HAND_R);

  // The legs reach for their ankles; the feet keep the pitch the gait gives them.
  for (let side = 0; side < 2; side += 1) {
    const leg = side ? LEG_R : LEG_L, foot = side ? footR : footL, o = side * 3;
    computeForwardKinematics(body, pose, fk, leg.upper, leg.upper);
    reachWithLimb(pose, body, fk, leg, vector[o], vector[o + 1], vector[o + 2], leg.side * 0.1, 0.2, -1, LEG_SOFTNESS);
    let pitch = foot.pitch;
    if (foot.planted === 0) {
      // In the air the foot hangs from the shin instead of holding an angle to the ground.
      const k3 = leg.lower * 3, e3 = leg.end * 3, position = fk.position;
      const shin = Math.atan2(position[e3 + 2] - position[k3 + 2], position[k3 + 1] - position[e3 + 1]);
      pitch += (0.1 - shin - pitch) * 0.8 * Math.sin(Math.PI * foot.swing);
    }
    quatFromYawPitchRoll(turn, 0, 0, pitch, 0);
    orientBoneTo(pose, fk, leg.end, turn, 0);
    quatFromAxisAngle(pose, leg.tip * 4, 1, 0, 0, foot.toeBend);
    computeForwardKinematics(body, pose, fk, leg.tip, leg.tip);
    pose[POSE_FOOT_CONTACT + side] = foot.contact;
  }
  if (body.hasJaw) computeForwardKinematics(body, pose, fk, BONE.JAW, BONE.JAW);
  return pose;
}

/**
 * One arm of the gait: the upper arm swings from the shoulder in the chest's frame, the elbow
 * bends more at the front of the swing, and the forearm turns in towards the midline.
 * @param {number} swing -1 at the back of the swing, +1 at the front.
 */
function writeSwingingArm(pose, body, fk, arm, gait, swing, drift) {
  const flex = (gait.armForward - gait.armBack) / 2 + (gait.armForward + gait.armBack) / 2 * swing + drift;
  const out = body.armClearance + 0.02 + gait.armOut * (1 - 0.4 * swing);
  const elbow = Math.max(0.06, gait.elbow + gait.elbowSwing * swing);
  const inward = gait.armTurn;
  const cosOut = Math.cos(out);
  const ux = arm.side * Math.sin(out), uy = -cosOut * Math.cos(flex), uz = -cosOut * Math.sin(flex);
  // The elbow's hinge: across the body, turned in, and made square to the upper arm.
  let hx = Math.cos(inward), hy = 0, hz = -arm.side * Math.sin(inward);
  const along = hx * ux + hy * uy + hz * uz;
  hx -= ux * along; hy -= uy * along; hz -= uz * along;
  const n = 1 / Math.hypot(hx, hy, hz);
  hx *= n; hy *= n; hz *= n;
  const c = Math.cos(elbow), s = Math.sin(elbow);
  const lx = ux * c + (hy * uz - hz * uy) * s, ly = uy * c + (hz * ux - hx * uz) * s, lz = uz * c + (hx * uy - hy * ux) * s;
  const chest = BONE.CHEST * 4;
  quatRotate(armAxes, 0, fk.rotation, chest, ux, uy, uz);
  quatRotate(armAxes, 3, fk.rotation, chest, lx, ly, lz);
  quatRotate(armAxes, 6, fk.rotation, chest, hx, hy, hz);
  poseLimbAlong(pose, body, fk, arm, armAxes[0], armAxes[1], armAxes[2], armAxes[3], armAxes[4], armAxes[5],
    armAxes[6], armAxes[7], armAxes[8]);
  writeRelaxedHand(pose, body, arm, gait, elbow);
}

/**
 * A relaxed hand: the bodies are modelled with the palm facing down (a little forward) in the
 * A-pose, which hanging at the side means facing the thigh and turned 18 degrees forward. Held
 * straight along a bent forearm that hand sticks out forwards like a flipper. A loose hand hangs
 * instead: it trails the forearm (bent towards the little finger, more as the elbow bends) and
 * turns its palm back towards the thigh. Running it firms up and lines up with the forearm.
 * Written in the forearm's rest frame (its hinge as X, its direction as Y), so any body works.
 */
function writeRelaxedHand(pose, body, arm, gait, elbow) {
  const deviation = -(0.18 + 0.3 * Math.min(1.2, elbow)) * (1 - 0.55 * gait.run);
  const pronation = 0.62 - 0.22 * gait.run;
  quatFromAxisAngle(hand, 0, 1, 0, 0, deviation);
  quatFromAxisAngle(hand, 4, 0, 1, 0, -arm.side * pronation);
  quatMultiply(hand, 0, hand, 4, hand, 0);
  const frame = arm.lower * 4;
  quatMultiply(hand, 0, body.limbFrame, frame, hand, 0);
  quatMultiplyConjRight(pose, arm.end * 4, hand, 0, body.limbFrame, frame);
}

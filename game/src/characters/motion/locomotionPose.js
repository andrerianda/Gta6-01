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
  quatFromAxisAngle, quatFromYawPitchRoll, quatMultiply, quatMultiplyConjRight, quatRotate, smoothMin, smoothStep,
} from '../skeleton/quaternionMath.js';
import {
  createFootSample, createGait, evaluateGait, lowestSolePoint, sampleFootCycle, toeBendOnGround, toeHingeForward,
  toeHingeUp,
} from './gaitModel.js';
import { createIdleSample, sampleIdleStance } from './idleStance.js';
import { NEUTRAL_STYLE } from './movementStyle.js';

/** How straight a planted leg may get, as a fraction of thigh plus shin. */
export const PLANTED_LEG_REACH = 0.996;
const LEG_SOFTNESS = 0.003;
const TWO_PI = Math.PI * 2;
/** Most a hanging upper arm is held out from the torso (radians; human norm 3 to 8 degrees). */
export const ARM_HANG_MAX = 0.1;
/** How far behind the side seam the upper arm hangs standing (radians). */
export const ARM_REST_EXTENSION = 0.05;
/** How far the collarbones are held down and back beyond level (radians). */
export const SHOULDER_DEPRESSION = 0.05;
export const SHOULDER_RETRACTION = 0.04;
/** How far the trunk line (hips to neck) leans forward standing, radians: upright, a touch forward. */
export const STANDING_TRUNK_LEAN = 0.025;
/** Steepest ground slope the feet follow (rise over run). */
export const MAX_FOOT_SLOPE = 0.4;

/** The posture correction of each body, by its rest skeleton (cached). */
const postures = new WeakMap();

/**
 * How far a body's rest trunk must lean forward to stand naturally (radians, + forward). A rest
 * skeleton whose chest sits behind the hips would walk sway-backed with the head pushed ahead of
 * the shoulders; this brings the trunk line to STANDING_TRUNK_LEAN whatever the file's rest.
 * @param {import('../skeleton/bodyMeasurements.js').BodyModel} body
 */
export function postureCorrection(body) {
  let fix = postures.get(body);
  if (fix === undefined) {
    const r = body.restPosition, h = BONE.HIPS * 3, n = BONE.NECK * 3;
    const restLean = Math.atan2(-(r[n + 2] - r[h + 2]), Math.max(0.05, r[n + 1] - r[h + 1]));
    fix = Math.max(-0.1, Math.min(0.14, STANDING_TRUNK_LEAN - restLean));
    postures.set(body, fix);
  }
  return fix;
}

/** How far the collarbones rise from the neck to the shoulder joints at rest (radians, 0 level, at most 0.25). */
export function shoulderLift(body) {
  const rest = body.restPosition, s = BONE.SHOULDER_R * 3, u = BONE.UPPER_ARM_R * 3;
  const lift = Math.atan2(rest[u + 1] - rest[s + 1], Math.max(1e-3, Math.abs(rest[u] - rest[s])));
  return Math.max(0, Math.min(0.25, lift));
}

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
 * @property {number} [travelX] Direction of travel in the body's space, unit (+X right)...
 * @property {number} [travelZ] ...(-Z ahead, the default (0, -1)): strafing and walking backwards.
 * @property {import('./movementStyle.js').MovementStyle} [style] The person's way of moving.
 * @property {number} [slopeX] Ground slope under the person in the body's space: rise per metre
 *   to the right (+X)...
 * @property {number} [slopeZ] ...and per metre backwards (+Z); 0 on the flat. The feet are placed
 *   on that plane and turned to it.
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
  const style = input.style ?? NEUTRAL_STYLE;
  const restHalfWidth = (rest[BONE.FOOT_R * 3] - rest[BONE.FOOT_L * 3]) / 2;
  evaluateGait(gait, input.speed, scale, restHalfWidth, style);
  sampleIdleStance(idle, input.time ?? 0, input.seed ?? 0, style);
  const phase = input.phase, still = 1 - gait.move;
  sampleFootCycle(footL, gait, body, phase);
  sampleFootCycle(footR, gait, body, phase + 0.5);
  // Standing, both feet carry weight whatever phase the stride stopped at.
  if (still > 0) {
    footL.contact += (1 - footL.contact) * still;
    footR.contact += (1 - footR.contact) * still;
  }
  const slopeX = clampSlope(input.slopeX), slopeZ = clampSlope(input.slopeZ);
  resetPose(pose);

  const angle = TWO_PI * phase;
  const support = Math.sin(TWO_PI * (phase - 0.06)); // +1 in the middle of standing on the left leg
  const bank = input.bank ?? 0;
  const lean = gait.lean + (input.lean ?? 0);

  // Strafing and backing: the feet travel along the direction of travel (so they stay planted),
  // the pelvis turns part of the way towards it (or towards its reverse, walking backwards) and
  // the chest turns back to face ahead; sideways steps widen the track so the feet never cross.
  const travelX = input.travelX ?? 0, travelZ = input.travelZ ?? -1;
  const travelAngle = Math.atan2(travelX, -travelZ); // 0 ahead, positive to the right
  const facingAngle = Math.abs(travelAngle) > Math.PI / 2 ? travelAngle - Math.PI * Math.sign(travelAngle) : travelAngle;
  // (faded out round a pure sideways step, where facingAngle flips from +90 to -90 degrees: it used
  // to swing the pelvis 1.1 rad in one frame and pop the aimed arms by 8 cm)
  const sideways = Math.min(1, Math.abs(Math.cos(travelAngle)) / 0.3);
  const hipTurn = -Math.max(-0.55, Math.min(0.55, facingAngle * 0.45)) * gait.move * sideways;
  const across = Math.abs(Math.sin(travelAngle + hipTurn)), ahead = Math.cos(travelAngle + hipTurn);
  const trackHalfWidth = gait.stepHalfWidth + across * 0.03 * scale;
  const turnSin = Math.sin(hipTurn), turnCos = Math.cos(hipTurn);
  // A sideways step crosses: the swinging foot passes in front of the standing one.
  const crossSign = travelX >= 0 ? 1 : -1; // (the side of the travel line that is ahead)
  const crossX = crossSign * travelZ * across * 0.13 * scale, crossZ = -crossSign * travelX * across * 0.13 * scale;

  // The pelvis: turned with the legs, dropped on the swing side, carried over the standing foot.
  const pelvisYaw = -gait.pelvisYaw * Math.cos(angle) * (0.4 + 0.6 * Math.abs(ahead)) + still * idle.pelvisYaw + hipTurn;
  const list = -gait.pelvisList * support + still * idle.list + bank * 0.35;
  // (the pelvis tips forward with a fraction of the trunk's lean)
  const trunkLean = lean + postureCorrection(body) + style.stoop * (1 - 0.5 * gait.run);
  const hipsPitch = -lean * 0.3;
  quatFromYawPitchRoll(pose, BONE.HIPS * 4, pelvisYaw, hipsPitch, list);
  const swayX = -gait.pelvisSway * support + still * idle.sway * scale - Math.sin(bank) * body.hipHeight * 0.45;
  // (accelerating, the hips stay back under the leaning trunk; running, the whole body leans from
  // the ankles: the pelvis rides a few centimetres ahead of the feet instead of sitting back)
  const pushZ = Math.sin(input.lean ?? 0) * body.hipHeight * 0.12 - Math.sin(gait.lean) * gait.run * body.hipHeight * 0.22;
  // The pelvis height: a walk rises over the standing leg and is lowest in the double support
  // just after each heel strike; a run is lowest at mid-stance and highest in the flight. A smooth
  // curve of the phase (no step at contacts); the legs' reach only caps it.
  const doubleSupport = (gait.duty - 0.5) / 2;
  const walkWave = 0.5 - 0.5 * Math.cos(2 * TWO_PI * (phase - doubleSupport));
  let height = -gait.pelvisDrop - gait.walkBob * (1 - walkWave)
    - gait.bounce * Math.cos(2 * angle - TWO_PI * gait.duty) + still * idle.drop * scale;
  const hipX = rest[BONE.HIPS * 3] + swayX, hipY = rest[BONE.HIPS * 3 + 1], hipZ = rest[BONE.HIPS * 3 + 2] + pushZ;
  const reach = body.legLength * PLANTED_LEG_REACH;
  if (gait.run > 0) {
    // A running foot lands well ahead: the pelvis comes down to meet it (the landing knee a
    // little bent) over the end of the flight instead of being pulled down at the contact frame.
    // The same at toe-off: the foot leaves far behind, the knee still a little bent.
    const touchdown = -gait.pelvisDrop - gait.bounce * Math.cos(TWO_PI * gait.duty);
    const ankle = body.ankleHeight + body.heelBack * Math.sin(Math.max(0, gait.heelStrikePitch));
    const ahead = gait.contactForward + pushZ;
    const fits = ankle + Math.sqrt(Math.max(0, (reach * 0.99) ** 2 - ahead * ahead)) - (body.hipJointHeight + touchdown);
    const behind = gait.contactForward - gait.stanceTravel + pushZ;
    const offAnkle = body.toeHeight - toeHingeUp(body, -gait.toeOffPitch);
    const fitsOff = offAnkle + Math.sqrt(Math.max(0, (reach * 0.975) ** 2 - behind * behind)) - (body.hipJointHeight + touchdown);
    const p = 2 * phase - Math.floor(2 * phase); // 0 at either foot's contact, in half strides
    if (fits < 0) height += fits * gait.run * bump(p, 0, 0.24, 1.3 * gait.duty);
    if (fitsOff < 0) height += Math.max(-0.03 * scale, fitsOff * 0.5) * gait.run * bump(p, 2 * gait.duty, 0.9 * gait.duty, 0.3);
  }
  const forwardShare = smoothStep(0.6, 0.95, ahead);
  for (let side = 0; side < 2; side += 1) {
    const leg = side ? LEG_R : LEG_L, foot = side ? footR : footL, o = side * 3;
    const u3 = leg.upper * 3, e3 = leg.end * 3;
    quatRotate(vector, 6, pose, BONE.HIPS * 4, body.restOffset[u3], body.restOffset[u3 + 1], body.restOffset[u3 + 2]);
    const arc = foot.swing > 0 ? Math.sin(Math.PI * foot.swing) : 0;
    vector[o] = leg.side * trackHalfWidth * turnCos + foot.forward * travelX + crossX * arc;
    vector[o + 2] = rest[e3 + 2] - leg.side * trackHalfWidth * turnSin + foot.forward * travelZ + crossZ * arc;
    // (on a slope the foot stands on the plane through the person's origin)
    vector[o + 1] = foot.height + slopeX * vector[o] + slopeZ * vector[o + 2];
    const dx = vector[o] - (hipX + vector[6]), dz = vector[o + 2] - (hipZ + vector[8]);
    const limit = vector[o + 1] + Math.sqrt(Math.max(1e-4, reach * reach - dx * dx - dz * dz)) - vector[7] - hipY;
    // (a foot rolling onto its ball does not hold the pelvis down: it rises further on its toes
    // instead, below; only feet in their weight-taking part cap the height)
    // (a landing foot takes the weight gradually over the second half of its swing, so the pelvis
    // settles onto the leg instead of dropping onto it at the contact frame)
    const holds = foot.planted ? 1 - smoothStep(0.25, 0.6, rollProgress(foot, gait)) * forwardShare
      : Math.max(still, smoothStep(0.45, 1, foot.swing));
    height -= holds * softExcess(height - limit, 0.012 * scale);
  }
  pose[POSE_HIPS_TRANSLATION] = swayX;
  pose[POSE_HIPS_TRANSLATION + 1] = height;
  pose[POSE_HIPS_TRANSLATION + 2] = pushZ;

  // The trunk: the chest turns against the pelvis and levels the shoulders, the head stays put.
  // The trunk, a gentle S: the lower back carries the lean (lumbar curve), the upper back rounds a
  // little forward over it (more with age), the chest is carried up (style.chest); the chest
  // turns against the pelvis and levels the shoulders.
  const chestYaw = gait.chestYaw * Math.cos(angle) + still * idle.chestYaw;
  const trunkYaw = (chestYaw - pelvisYaw) * 0.5;
  const trunkRoll = -list * 0.5 + bank * 0.3;
  const breath = still * idle.breath;
  const posture = trunkLean - lean; // posture correction and stoop, on top of the lean
  const spineBend = lean * 0.33 + posture * 0.55 + style.chest * 0.5;
  const chestBend = lean * 0.27 + posture * 0.45 - style.chest * 1.5 + style.stoop * 0.5;
  quatFromYawPitchRoll(pose, BONE.SPINE * 4, trunkYaw, -spineBend + breath * 0.006, trunkRoll);
  quatFromYawPitchRoll(pose, BONE.CHEST * 4, trunkYaw, -chestBend + breath * 0.016, trunkRoll);
  // The neck and head ride on the chest and level the face: they take back the trunk's forward
  // bend (so the chin stays level and the eyes ahead, a runner looking a little down the road),
  // the neck the smaller share so it stays in line with the chest instead of craning; an older
  // person carries the head a little forward, the face still level. Yaw: the head holds its
  // direction in the world while the shoulders counter-rotate under it (neck 40 %, head 60 %:
  // the neck skin follows the neck bone mid-neck). Roll: the head stays level over the pelvic
  // drop, leaning only a little into a turn.
  const forwardBend = -hipsPitch + spineBend + chestBend; // accumulated forward pitch of the chest
  const level = forwardBend - 0.06 * gait.run - still * idle.headPitch * 0.5 - breath * 0.005;
  const neckPitch = level * 0.35 - style.headForward;
  const headPitch = level * 0.65 + style.headForward;
  const headYaw = ((input.headYaw ?? 0) + still * idle.headYaw - chestYaw) * 0.5;
  const headRoll = -(list + 2 * trunkRoll) * 0.85 + bank * 0.25 + still * idle.headRoll * 0.5;
  quatFromYawPitchRoll(pose, BONE.NECK * 4, headYaw * 0.8, neckPitch, headRoll * 0.4);
  quatFromYawPitchRoll(pose, BONE.HEAD * 4, headYaw * 1.2, headPitch, headRoll * 0.6);

  // The arms swing against the legs: the left arm is forward when the right foot lands. Walking
  // they hang from the shoulder with gravity (a forward trunk does not carry them forward);
  // running they are driven in the trunk's frame.
  const swing = Math.cos(TWO_PI * (phase - 0.04)) * (0.3 + 0.7 * Math.abs(ahead));
  const hang = -forwardBend * (1 - gait.run) * 0.8;
  const flexL = armFlex(gait, -swing, still * idle.armDrift + hang);
  const flexR = armFlex(gait, swing, -still * idle.armDrift + hang);
  // (The shoulder girdle follows its arm: the collarbone comes forward with the arm in front and
  // back with it behind, and rises a little as the arm swings high or the chest breathes in. It
  // is held down and a little back: a collarbone modelled raised in the A-pose is levelled first,
  // so the shoulders never read as shrugged.)
  const lift = shoulderLift(body), down = lift + SHOULDER_DEPRESSION, back = SHOULDER_RETRACTION;
  const protractL = clavicleProtraction(flexL, gait), protractR = clavicleProtraction(flexR, gait);
  const raiseL = clavicleRaise(flexL, gait) + breath * 0.012, raiseR = clavicleRaise(flexR, gait) + breath * 0.012;
  quatFromYawPitchRoll(pose, BONE.SHOULDER_L * 4, back - protractL, 0, down - raiseL);
  quatFromYawPitchRoll(pose, BONE.SHOULDER_R * 4, -back + protractR, 0, -down + raiseR);
  computeForwardKinematics(body, pose, fk, 0, BONE.UPPER_ARM_L);
  writeSwingingArm(pose, body, fk, ARM_L, gait, -swing, flexL);
  computeForwardKinematics(body, pose, fk, BONE.HAND_L, BONE.UPPER_ARM_R);
  writeSwingingArm(pose, body, fk, ARM_R, gait, swing, flexR);
  computeForwardKinematics(body, pose, fk, BONE.HAND_R, BONE.HAND_R);

  // The legs reach for their ankles; the feet keep the pitch the gait gives them, turned to the
  // slope of the ground; the toes bend at push-off so their tips stay on the ground.
  const footYaw = hipTurn * 0.8;
  const slopePitch = Math.atan(-slopeX * Math.sin(footYaw) - slopeZ * Math.cos(footYaw));
  const slopeRoll = Math.atan(slopeX * Math.cos(footYaw) - slopeZ * Math.sin(footYaw));
  for (let side = 0; side < 2; side += 1) {
    const leg = side ? LEG_R : LEG_L, foot = side ? footR : footL, o = side * 3;
    computeForwardKinematics(body, pose, fk, leg.upper, leg.upper);
    const poleX = leg.side * 0.1, poleZ = -1; // the knee points where the pelvis turned
    const poleTx = poleX * turnCos + poleZ * turnSin, poleTz = -poleX * turnSin + poleZ * turnCos;
    let pitch = foot.pitch * (ahead >= 0 ? 0.35 + 0.65 * ahead : 0.6 * ahead);
    if (foot.planted && foot.pivotLocal > 0 && forwardShare > 0.99) {
      // (a runner leaves the ground with the knee still a little bent; the rise hands back to the
      // gait's own toe-off angle just before lift-off, so the swing starts where it expects)
      const u = phase + side * 0.5, stance = (u - Math.floor(u)) / gait.duty;
      const keep = 1 - 0.6 * smoothStep(0.8, 1, stance);
      if (keep > 0) {
        const ax = vector[o], ay = vector[o + 1], az = vector[o + 2];
        const risen = riseOnToes(body, fk, leg, foot, vector, o, pitch, reach * (1 - 0.02 * gait.run), travelX, travelZ);
        pitch += (risen - pitch) * keep;
        vector[o] = ax + (vector[o] - ax) * keep;
        vector[o + 1] = ay + (vector[o + 1] - ay) * keep;
        vector[o + 2] = az + (vector[o + 2] - az) * keep;
      }
    }
    reachWithLimb(pose, body, fk, leg, vector[o], vector[o + 1], vector[o + 2], poleTx, 0.2, poleTz, LEG_SOFTNESS);
    let bend = foot.toeBend;
    if (foot.planted === 0) {
      // In the air the foot hangs from the shin instead of holding an angle to the ground.
      const k3 = leg.lower * 3, e3 = leg.end * 3, position = fk.position;
      const shin = Math.atan2(position[e3 + 2] - position[k3 + 2], position[k3 + 1] - position[e3 + 1]) - slopePitch;
      pitch += (0.1 - shin - pitch) * 0.8 * Math.sin(Math.PI * foot.swing) * gait.move;
      // Heel and toes clear the ground: if the hanging foot would scrape, lift the ankle.
      const need = gait.toeClearance * Math.sqrt(Math.sin(Math.PI * foot.swing)) - lowestSolePoint(body, pitch, bend);
      if (need > foot.height + 1e-4) {
        vector[o + 1] += need - foot.height;
        computeForwardKinematics(body, pose, fk, leg.upper, leg.upper);
        reachWithLimb(pose, body, fk, leg, vector[o], vector[o + 1], vector[o + 2], poleTx, 0.2, poleTz, LEG_SOFTNESS);
      }
    } else if (pitch < 0) bend = toeBendOnGround(body, pitch);
    quatFromYawPitchRoll(turn, 0, footYaw, pitch + slopePitch, slopeRoll * foot.contact);
    orientBoneTo(pose, fk, leg.end, turn, 0);
    quatFromAxisAngle(pose, leg.tip * 4, 1, 0, 0, bend);
    computeForwardKinematics(body, pose, fk, leg.tip, leg.tip);
    pose[POSE_FOOT_CONTACT + side] = foot.contact;
  }
  if (body.hasJaw) computeForwardKinematics(body, pose, fk, BONE.JAW, BONE.JAW);
  return pose;
}

/** How far a planted foot is through rolling onto its ball (0 heel down .. 1 at toe-off). */
function rollProgress(foot, gait) {
  return foot.planted && foot.pivotLocal > 0 ? -foot.pitch / Math.max(1e-3, gait.toeOffPitch) : 0;
}

/**
 * A foot on its ball whose leg cannot reach the ankle rises further onto its toes: the ankle
 * turns up about the ball until the hip can reach it (a few bisection steps, only when needed).
 * Writes the new ankle into vector[o..o+2] and returns the new pitch.
 */
function riseOnToes(body, fk, leg, foot, vector, o, pitch, reach, dirX, dirZ) {
  const h3 = leg.upper * 3, p = fk.position;
  const ax = vector[o], ay = vector[o + 1], az = vector[o + 2];
  const far = (x, y, z) => Math.hypot(x - p[h3], y - p[h3 + 1], z - p[h3 + 2]);
  if (far(ax, ay, az) <= reach) return pitch;
  // the toe joint (the hinge), from the ankle at the current pitch
  const f0 = -toeHingeForward(body, pitch), h0 = -toeHingeUp(body, pitch);
  const bx = ax - dirX * f0, by = ay - h0, bz = az - dirZ * f0;
  let lo = pitch, hi = -1.35;
  for (let i = 0; i < 8; i += 1) {
    const q = (lo + hi) / 2, f = -toeHingeForward(body, q), h = -toeHingeUp(body, q);
    if (far(bx + dirX * f, by + h, bz + dirZ * f) > reach) lo = q; else hi = q;
  }
  const f = -toeHingeForward(body, hi), h = -toeHingeUp(body, hi);
  vector[o] = bx + dirX * f; vector[o + 1] = by + h; vector[o + 2] = bz + dirZ * f;
  return hi;
}

/**
 * A raised-cosine bump on a cycle of length 1: 1 at `centre`, falling to 0 `before` earlier and
 * `after` later (wrapping round the cycle).
 */
function bump(p, centre, before, after) {
  let d = p - centre;
  d -= Math.round(d);
  const x = d >= 0 ? d / after : d / before;
  return x > -1 && x < 1 ? 0.5 + 0.5 * Math.cos(Math.PI * x) : 0;
}

/** How far x is above 0, with the corner rounded over [-k, k] (continuous, smooth). */
function softExcess(x, k) {
  if (x >= k) return x;
  if (x <= -k) return 0;
  return (x + k) * (x + k) / (4 * k);
}

/** A slope clamped to what the feet follow (0 when absent). */
function clampSlope(slope) {
  return slope > 0 || slope < 0 ? Math.max(-MAX_FOOT_SLOPE, Math.min(MAX_FOOT_SLOPE, slope)) : 0;
}

/**
 * The upper arm's forward swing (radians, + forward) at a point of its swing. Standing, it hangs
 * a little behind the side seam (the hand beside the thigh, not in front of the hip).
 */
function armFlex(gait, swing, offset) {
  return (gait.armForward - gait.armBack) / 2 + (gait.armForward + gait.armBack) / 2 * swing + offset
    - ARM_REST_EXTENSION * (1 - gait.move);
}

/** How far the collarbone comes forward (radians) with its arm swung by `flex`. */
function clavicleProtraction(flex, gait) {
  return (flex > 0 ? 0.11 : 0.07) * flex * (0.6 + 0.4 * gait.run);
}

/** How far the collarbone rises (radians) with its arm swung by `flex`: high arms lift it. */
function clavicleRaise(flex, gait) {
  return 0.04 * Math.abs(flex) + 0.06 * Math.max(0, flex - 0.4) + 0.015 * gait.run;
}

/**
 * One arm of the gait: the upper arm swings from the shoulder in the chest's frame, the elbow
 * bends more at the front of the swing, and the forearm turns in towards the midline.
 * @param {number} swing -1 at the back of the swing, +1 at the front.
 * @param {number} flex The upper arm's forward swing angle (armFlex).
 */
function writeSwingingArm(pose, body, fk, arm, gait, swing, flex) {
  // Close to the body: 3 to 8 degrees out whatever the body's clearance estimate says (a bulky
  // jacket must not push a real arm out; the clothing is the artist's to fit).
  const out = Math.min(body.armClearance, ARM_HANG_MAX) + 0.01 + gait.armOut * (1 - 0.4 * swing);
  const elbow = Math.max(0.14, gait.elbow + gait.elbowSwing * swing); // never a straight rod
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
  const deviation = -(0.18 + 0.3 * Math.min(1.2, elbow)) * (1 - 0.6 * gait.run);
  const pronation = 0.62 - 0.42 * gait.run; // running: thumb up, palm facing in
  const extension = 0.3 * gait.run; // running: the wrist undoes the forearm's inward turn
  quatFromAxisAngle(hand, 0, 1, 0, 0, deviation);
  quatFromAxisAngle(hand, 4, 0, 0, 1, -arm.side * extension);
  quatMultiply(hand, 0, hand, 0, hand, 4);
  quatFromAxisAngle(hand, 4, 0, 1, 0, -arm.side * pronation);
  quatMultiply(hand, 0, hand, 4, hand, 0);
  const frame = arm.lower * 4;
  quatMultiply(hand, 0, body.limbFrame, frame, hand, 0);
  quatMultiplyConjRight(pose, arm.end * 4, hand, 0, body.limbFrame, frame);
}

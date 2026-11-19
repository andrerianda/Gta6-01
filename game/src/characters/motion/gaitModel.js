// One gait model for standing, walking, jogging, running and sprinting. Everything a step is made
// of (cadence, stride length, how long a foot stays down, where it lands and leaves, heel strike
// and toe-off angles, swing height, pelvis and chest counter-rotation, bounce, lean, arm swing) is
// a continuous function of speed, so there is nothing to pop between "walk" and "run": the
// controller only changes the speed. Speeds are compared between bodies by leg length (a short
// person takes more, shorter steps), and lengths are in the body's own metres.
//
// A foot is never interpolated while it is on the ground. During stance the model gives a point
// of the sole that is fixed to the ground (the heel while the foot rolls down, then the whole
// sole, then the ball while the heel rises) and the foot's pitch about it; the ankle follows from
// those. That is what keeps feet from sliding at any speed and body size.
import { smoothStep } from '../skeleton/quaternionMath.js';

/**
 * The gait at one speed.
 * @typedef {object} Gait
 * @property {number} speed Ground speed, m/s.
 * @property {number} move 0 standing, 1 from a slow walk upwards: scales every amplitude.
 * @property {number} run 0 walking, 1 running (a flight phase), blended between.
 * @property {number} strideRate Strides (two steps) per second: the rate the phase advances.
 * @property {number} strideLength Metres per stride.
 * @property {number} duty Fraction of the stride a foot is on the ground.
 * @property {number} contactForward Where the ankle lands ahead of its rest place (flat-foot reference).
 * @property {number} stanceTravel How far the planted foot travels backwards under the body.
 * @property {number} heelStrikePitch Toe-up angle of the foot at contact.
 * @property {number} toeOffPitch Heel-up angle of the foot when it leaves the ground.
 * @property {number} rollDownEnd Fraction of stance at which the sole is flat.
 * @property {number} heelRiseStart Fraction of stance at which the heel starts to rise.
 * @property {number} swingLift Extra height of the ankle at the top of the swing.
 * @property {number} swingPeak Where in the swing that top is (0..1).
 * @property {number} stepHalfWidth Half the distance between the left and right foot tracks.
 * @property {number} pelvisYaw Amplitude of the pelvis turning with the legs, radians.
 * @property {number} pelvisList Amplitude of the hip dropping on the swing side, radians.
 * @property {number} pelvisSway Amplitude of the pelvis moving over the standing foot, metres.
 * @property {number} pelvisDrop How far below standing height the pelvis rides, metres.
 * @property {number} bounce Amplitude of the running bounce, metres.
 * @property {number} chestYaw Amplitude of the shoulders turning against the pelvis, radians.
 * @property {number} lean Forward lean of the trunk, radians.
 * @property {number} armForward How far the upper arm swings forward, radians.
 * @property {number} armBack How far it swings back.
 * @property {number} elbow Mean elbow bend.
 * @property {number} elbowSwing How much the elbow bends more at the front of the swing.
 * @property {number} armOut Extra abduction of the upper arm.
 * @property {number} armTurn Inward turn of the forearm (hands towards the midline in front).
 */

/**
 * Creates a gait record, filled in for standing still.
 * @returns {Gait}
 */
export function createGait() {
  /** @type {Gait} */
  const gait = {
    speed: 0, move: 0, run: 0, strideRate: 0.5, strideLength: 0, duty: 0.66, contactForward: 0,
    stanceTravel: 0, heelStrikePitch: 0, toeOffPitch: 0, rollDownEnd: 0.15, heelRiseStart: 0.55,
    swingLift: 0, swingPeak: 0.4, stepHalfWidth: 0.08, pelvisYaw: 0, pelvisList: 0, pelvisSway: 0,
    pelvisDrop: 0, bounce: 0, chestYaw: 0, lean: 0, armForward: 0, armBack: 0, elbow: 0.2,
    elbowSwing: 0, armOut: 0, armTurn: 0.15,
  };
  return evaluateGait(gait, 0, 1, 0.09);
}

// How far between walking (0) and running (1) the gait being evaluated is; module state rather
// than a closure so that evaluating a gait every frame allocates nothing.
let mixRun = 0;
const mix = (walk, running) => walk + (running - walk) * mixRun;

/**
 * Fills in the gait for a speed and a body.
 * @param {Gait} gait The record to write.
 * @param {number} speed Ground speed in m/s (0 to about 8).
 * @param {number} legScale The body's leg length over the reference adult's (BodyModel.legScale).
 * @param {number} restHalfWidth Half the distance between the ankles in the rest pose, metres.
 * @returns {Gait} `gait`.
 */
export function evaluateGait(gait, speed, legScale, restHalfWidth) {
  const size = Math.sqrt(legScale);
  const v = Math.max(0, speed) / size; // the speed a reference adult would move at to look alike
  const move = smoothStep(0, 0.5, v);
  const run = smoothStep(1.9, 2.9, v);
  mixRun = run;
  const fast = Math.max(0, v - 2.9);

  const stepsPerSecond = mix(1.05 + 0.6 * v, 2.45 + 0.09 * v + 0.012 * v * v) / size;
  gait.speed = speed;
  gait.move = move;
  gait.run = run;
  gait.strideRate = stepsPerSecond / 2;
  gait.strideLength = speed / gait.strideRate;
  gait.duty = mix(Math.max(0.58, 0.66 - 0.03 * v), Math.max(0.2, 0.4 - 0.03 * v));
  gait.stanceTravel = gait.duty * gait.strideLength;
  // Walking lands about as far ahead as it leaves behind (the raised heel reaches further
  // back); running lands closer under the body the faster it goes.
  const centre = mix(-0.11 * gait.stanceTravel, (-0.02 - 0.025 * v) * legScale);
  gait.contactForward = centre + gait.stanceTravel / 2;
  gait.heelStrikePitch = move * mix(0.35, Math.max(-0.05, 0.12 - 0.04 * fast));
  gait.toeOffPitch = move * mix(0.85, 1.0);
  gait.rollDownEnd = mix(0.15, 0.12);
  gait.heelRiseStart = mix(0.55, 0.42);
  // (running: a clear heel kick behind, growing with speed; the knee folds well past 90 degrees)
  gait.swingLift = move * mix(0.05, 0.22 + 0.08 * fast) * legScale;
  gait.swingPeak = mix(0.36, 0.42);
  gait.stepHalfWidth = restHalfWidth + (mix(0.07, 0.035) * legScale - restHalfWidth) * move;
  gait.pelvisYaw = move * mix(0.06 + 0.025 * v, 0.12 + 0.012 * v);
  gait.pelvisList = move * mix(0.055, 0.07);
  gait.pelvisSway = move * mix(0.03 - 0.006 * v, 0.008) * legScale;
  // A runner never stands on a straight leg: the pelvis rides lower, so the planted knee bends
  // ~20 degrees at contact and ~40 under the body (a stick-legged run came from 2 cm here).
  gait.pelvisDrop = move * mix(0.012, 0.055 + 0.006 * fast) * legScale;
  gait.bounce = run * (0.03 + 0.004 * fast) * legScale;
  gait.chestYaw = move * mix(0.03 + 0.02 * v, 0.1 + 0.012 * v);
  gait.lean = move * 0.03 + run * Math.min(0.25, 0.045 * v - 0.02);
  // Running the arms drive from the shoulder: the hand comes up to the chest in front and passes
  // the hip behind, the elbow held near 90 degrees (closing a little in front, opening behind).
  gait.armForward = move * mix(0.08 + 0.12 * v, 0.78 + 0.08 * fast);
  gait.armBack = move * mix(0.12 + 0.14 * v, 0.6 + 0.06 * fast);
  gait.elbow = mix(0.24 + 0.02 * move, 1.5 + 0.04 * fast); // standing 14 degrees, relaxed; running near 86
  gait.elbowSwing = move * mix(0.22, 0.28);
  // Running hands come up towards the chest but do not cross the midline (seen from the front).
  // (QA 13:15: from the chase camera behind, inward-turned forearms hid behind the torso and read
  // as pinned: the elbows a little wider and the forearms swinging more fore and aft)
  gait.armOut = run * 0.17;
  gait.armTurn = mix(0.12, 0.14);
  return gait;
}

/**
 * The measurements of a foot the model needs (BodyModel has the same names).
 * @typedef {object} FootSize
 * @property {number} ankleHeight
 * @property {number} ballForward
 * @property {number} heelBack
 */

/**
 * Where a foot is at one moment of its cycle, in the vertical plane it moves in.
 * @typedef {object} FootSample
 * @property {number} forward Ankle position ahead of its rest place, metres.
 * @property {number} height Ankle height above the ground.
 * @property {number} pitch Foot pitch, radians: positive lifts the toes, negative lifts the heel.
 * @property {number} toeBend How far the toes bend up against the foot (they stay on the ground).
 * @property {number} contact 1 while the foot carries weight; eases in and out around the swing.
 * @property {number} planted 1 while a point of the sole is fixed to the ground, else 0.
 * @property {number} pivotForward That fixed point's position ahead of the ankle's rest place.
 * @property {number} pivotLocal The fixed point in the foot: forward of the ankle along the sole
 *   (negative: the heel, positive: the ball).
 * @property {number} swing Progress of the swing, 0 during stance.
 */

/**
 * Creates the storage for a foot sample.
 * @returns {FootSample}
 */
export function createFootSample() {
  return { forward: 0, height: 0, pitch: 0, toeBend: 0, contact: 1, planted: 1, pivotForward: 0, pivotLocal: 0, swing: 0 };
}

/**
 * The foot at the start of contact or at lift-off, written as forward, height and pitch.
 */
function stanceEnd(gait, foot, atLiftOff, out) {
  if (atLiftOff) {
    const pitch = -gait.toeOffPitch, c = Math.cos(pitch), s = Math.sin(pitch);
    const ball = gait.contactForward - gait.stanceTravel + foot.ballForward;
    out.forward = ball - foot.ballForward * c - foot.ankleHeight * s;
    out.height = -foot.ballForward * s + foot.ankleHeight * c;
    out.pitch = pitch;
  } else {
    const pitch = gait.heelStrikePitch, c = Math.cos(pitch), s = Math.sin(pitch);
    const heel = gait.contactForward - foot.heelBack;
    out.forward = heel + foot.heelBack * c - foot.ankleHeight * s;
    out.height = foot.heelBack * s + foot.ankleHeight * c;
    out.pitch = pitch;
  }
}

const liftOff = { forward: 0, height: 0, pitch: 0 };
const touchDown = { forward: 0, height: 0, pitch: 0 };

/**
 * Samples one foot's cycle.
 * @param {FootSample} out Receives the sample.
 * @param {Gait} gait The gait (from evaluateGait).
 * @param {FootSize} foot The foot's measurements.
 * @param {number} phase The foot's own phase, 0 at its contact (any real number; it wraps).
 * @returns {FootSample} `out`.
 */
export function sampleFootCycle(out, gait, foot, phase) {
  const u = phase - Math.floor(phase);
  const duty = gait.duty;
  if (u < duty) {
    const s = u / duty;
    const reference = gait.contactForward - gait.stanceTravel * s;
    out.planted = 1;
    out.contact = 1;
    out.swing = 0;
    out.toeBend = 0;
    if (s < gait.rollDownEnd) {
      // Heel strike: the foot turns down about the heel.
      const x = s / gait.rollDownEnd;
      const pitch = gait.heelStrikePitch * (1 - x * x * (3 - 2 * x));
      const c = Math.cos(pitch), sn = Math.sin(pitch);
      out.pivotLocal = -foot.heelBack;
      out.pivotForward = reference - foot.heelBack;
      out.forward = out.pivotForward + foot.heelBack * c - foot.ankleHeight * sn;
      out.height = foot.heelBack * sn + foot.ankleHeight * c;
      out.pitch = pitch;
    } else if (s <= gait.heelRiseStart) {
      out.pivotLocal = 0;
      out.pivotForward = reference;
      out.forward = reference;
      out.height = foot.ankleHeight;
      out.pitch = 0;
    } else {
      // Push-off: the heel rises about the ball of the foot, the toes stay down.
      const x = (s - gait.heelRiseStart) / (1 - gait.heelRiseStart);
      const pitch = -gait.toeOffPitch * x * x * (2 - x);
      const c = Math.cos(pitch), sn = Math.sin(pitch);
      out.pivotLocal = foot.ballForward;
      out.pivotForward = reference + foot.ballForward;
      out.forward = out.pivotForward - foot.ballForward * c - foot.ankleHeight * sn;
      out.height = -foot.ballForward * sn + foot.ankleHeight * c;
      out.pitch = pitch;
      out.toeBend = -pitch * 0.92;
    }
    return out;
  }
  // Swing: from lift-off to the next contact, leaving and meeting the ground at its speed.
  const s = (u - duty) / (1 - duty);
  stanceEnd(gait, foot, true, liftOff);
  stanceEnd(gait, foot, false, touchDown);
  const tangent = -(1 - duty) * gait.strideLength;
  const s2 = s * s, s3 = s2 * s;
  // (Tangents below the ground speed keep the foot from reaching far ahead of where it lands:
  // it arrives over its landing place late in the swing, still raised, and comes down on it.)
  out.forward = (2 * s3 - 3 * s2 + 1) * liftOff.forward + (s3 - 2 * s2 + s) * tangent * 0.55
    + (-2 * s3 + 3 * s2) * touchDown.forward + (s3 - s2) * tangent * 0.4;
  const ease = s2 * (3 - 2 * s);
  // A walk lifts the foot briefly; a run carries it high through most of the swing.
  const arch = Math.pow(Math.sin(Math.PI * Math.pow(s, Math.log(0.5) / Math.log(gait.swingPeak))), 2 - gait.run);
  out.pitch = liftOff.pitch + (touchDown.pitch - liftOff.pitch) * smoothStep(0.05, 0.9, s);
  // The toes must clear the ground while the foot still points down.
  const clearance = foot.ankleHeight + foot.ballForward * 0.65 * Math.sin(Math.max(0, -out.pitch));
  out.height = Math.max(
    liftOff.height + (touchDown.height - liftOff.height) * ease + gait.swingLift * arch, clearance);
  out.toeBend = -liftOff.pitch * 0.92 * Math.max(0, 1 - s * 5);
  out.planted = 0;
  out.swing = s;
  out.contact = Math.max(1 - smoothStep(0, 0.14, s), smoothStep(0.86, 1, s));
  out.pivotLocal = 0;
  out.pivotForward = out.forward;
  return out;
}

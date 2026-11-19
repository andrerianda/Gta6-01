// From the pilot's stick, pedals and lever to what the control surfaces ask of the airframe, by
// flight mode. Realistic: the stick and the trim set the angle of attack the aircraft seeks, the
// ailerons a roll rate, the pedals the rudder; nothing is protected. Casual (and whenever the
// autopilot flies): the stick asks for a climb angle and a bank instead; releasing it levels the
// wings and the flight path, the elevator is trimmed for the speed and the bank, the angle of
// attack is kept short of the stall with a nose-down nudge near the stall speed, the turn is
// coordinated without the pedals, and the throttle is eased near the speed limit. On the runway
// both modes fly the elevator directly, so the takeoff needs a pull at rotate speed.
// Pure numbers; imports only the wing's lift curve.
import { alphaForLift } from './wingAerodynamics.js';

/**
 * Resolves one step's control demands.
 * @param {'casual' | 'realistic'} mode
 * @param {{pitch: number, roll: number, yaw: number, throttle: number}} input The pilot's controls.
 * @param {FlightSense} sense The flight state the assists read.
 * @param {object} tuning From deriveAirplaneTuning.
 * @param {{active: boolean, bankTarget: number, verticalSpeedTarget: number, throttle: number}} guidance The autopilot's output.
 * @param {FlightDemand} out
 * @returns {FlightDemand} `out`.
 */
export function resolveFlightControls(mode, input, sense, tuning, guidance, out) {
  const wing = tuning.wing;
  const trimAlpha = tuning.trimAlpha + sense.trim * tuning.trimRange;
  const stick = clamp(input.pitch, -1, 1);
  const directAlpha = trimAlpha + (stick >= 0
    ? stick * (wing.criticalAlpha + 0.09 - trimAlpha)
    : stick * (trimAlpha - wing.negativeAlpha * 0.7));
  out.throttle = clamp(input.throttle, 0, 1);
  out.trim = sense.trim;
  if (mode !== 'casual' && !guidance.active) {
    out.alphaTarget = directAlpha;
    out.rollCommand = clamp(input.roll, -1, 1);
    out.rudder = clamp(input.yaw, -1, 1);
    out.coordination = 0;
    out.assisted = false;
    return out;
  }

  let bankTarget;
  let climbTarget;
  if (guidance.active) {
    bankTarget = guidance.bankTarget;
    climbTarget = Math.asin(clamp(guidance.verticalSpeedTarget / Math.max(sense.airspeed, 10), -0.5, 0.6));
    if (guidance.throttle >= 0) out.throttle = guidance.throttle;
  } else {
    bankTarget = clamp(input.roll, -1, 1) * CASUAL_MAX_BANK;
    climbTarget = stick >= 0 ? stick * tuning.casualClimbAngle : stick * CASUAL_DIVE_ANGLE;
  }
  // Stall protection: under 1.12 times the stall speed the path is pushed down, harder the slower.
  const margin = sense.indicatedAirspeed / Math.max(sense.stallSpeed, 1) - 1.12;
  if (margin < 0) climbTarget = Math.min(climbTarget, margin * 1.4);
  // A gentle speed limit: ease the throttle and lift the nose.
  if (sense.overspeed > 0) {
    out.throttle *= 1 - sense.overspeed;
    if (!guidance.active) climbTarget += 0.12 * sense.overspeed;
  }
  // The lift a level, banked flight path needs, as an angle of attack: the auto-trim.
  const loadFactor = 1 / Math.max(Math.cos(sense.roll), 0.5);
  const liftNeeded = (loadFactor * tuning.mass * 9.81 * Math.cos(sense.gamma)) / Math.max(sense.dynamicPressure * wing.area, 1);
  const trimmed = alphaForLift(wing, liftNeeded, sense.flaps);
  const pathAlpha = clamp(
    trimmed + clamp((climbTarget - sense.gamma) * 1.3, -0.1, 0.1),
    wing.negativeAlpha * 0.6, wing.criticalAlpha - STALL_MARGIN);
  const air = sense.airborne;
  out.alphaTarget = directAlpha + (pathAlpha - directAlpha) * air;
  out.rollCommand = clamp((bankTarget - sense.roll) * 2.4 - sense.rollRate * 0.25, -1, 1) * air
    + clamp(input.roll, -1, 1) * 0.3 * (1 - air);
  // On its wheels the roll keys steer too, so A and D taxi the aircraft.
  out.rudder = clamp(input.yaw + (air < 0.5 ? input.roll : 0), -1, 1);
  out.coordination = air;
  out.assisted = true;
  if (air > 0.5) out.trim = clamp((trimmed - tuning.trimAlpha) / tuning.trimRange, -1, 1);
  return out;
}

/** The steepest bank the casual mode flies, radians (45 degrees). */
export const CASUAL_MAX_BANK = Math.PI / 4;
/** The steepest descent the casual stick asks for, radians. */
export const CASUAL_DIVE_ANGLE = 0.35;
/** How far short of the stall angle the protected modes stop, radians (2 degrees). */
export const STALL_MARGIN = 0.035;

/** A fresh demand record for resolveFlightControls. */
export function createFlightDemand() {
  return { alphaTarget: 0, rollCommand: 0, rudder: 0, coordination: 0, throttle: 0, trim: 0, assisted: false };
}

function clamp(value, low, high) {
  return value < low ? low : value > high ? high : value;
}

/**
 * @typedef {object} FlightSense
 * @property {number} roll Radians, + right wing down.
 * @property {number} rollRate Radians per second.
 * @property {number} gamma Flight-path angle, radians, + climbing.
 * @property {number} airspeed True, m/s.
 * @property {number} indicatedAirspeed
 * @property {number} stallSpeed Indicated, for the present flaps.
 * @property {number} dynamicPressure Pascals.
 * @property {number} overspeed 0..1.
 * @property {number} flaps 0..1.
 * @property {number} trim -1..1.
 * @property {number} airborne 0 (on the wheels) .. 1 (a second into the air).
 */

/**
 * @typedef {object} FlightDemand
 * @property {number} alphaTarget The angle of attack the elevator asks for, radians.
 * @property {number} rollCommand -1..1 of the full roll rate, + right.
 * @property {number} rudder -1..1, + nose right.
 * @property {number} coordination 0..1: how much the turn is coordinated for the pilot.
 * @property {number} throttle 0..1.
 * @property {number} trim The elevator trim to show and keep, -1..1.
 * @property {boolean} assisted
 */

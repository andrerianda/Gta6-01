// The pure part of the locomotion controller: how a person's speed, heading, stride phase, lean,
// bank and head turn follow what the player asks for. No bones here, only numbers, so it is
// tested in Node and is the same at any frame rate: every smoothing is an exact exponential of
// dt, every acceleration and turn rate is a limit per second, and the stride phase advances by
// distance (metres travelled over the stride length), so the planted feet never slide whatever
// the speed curve does. One step per rendered frame (or per fixed step); no allocation.
//
// Conventions: world axes of three.js (+Y up), a yaw is what goes in object.rotation.y (0 faces
// -Z, positive turns left, seen from above counter-clockwise). A physics heading is -yaw.
import { smoothStep } from '../skeleton/quaternionMath.js';
import { createGait, evaluateGait } from '../motion/gaitModel.js';
import { NEUTRAL_STYLE } from '../motion/movementStyle.js';

/** Default feel of a person on foot; pass overrides to createLocomotionState. */
export const LOCOMOTION_TUNING = Object.freeze({
  accelerate: 5.5, // m/s^2 at most when speeding up (a walk is reached in about two steps)
  brake: 8, // m/s^2 at most when slowing down
  response: 4.5, // 1/s: how quickly speed closes the last of the gap (the ease at the end of a start)
  stopBelow: 0.03, // m/s: slower than this with nothing asked for, the person stands
  turnResponse: 9, // 1/s: how quickly the body closes a heading error (critically damped)
  turnRateWalking: 6.5, // rad/s at most while walking, falling with speed...
  turnRateSprinting: 2.4, // ...to this at 7 m/s
  spotTurnBelow: 0.7, // m/s: slower than this a change of facing is a turn on the spot
  spotTurnStart: 0.4, // rad: smaller facing changes when standing are taken by the head alone
  spotTurnRate: 3.6, // rad/s at most turning on the spot
  spotStepPerRadian: 0.13, // m/s of stepping in place per rad/s of turning
  leanPerAcceleration: 0.032, // rad of forward lean per m/s^2 of acceleration
  leanLimit: 0.2, // rad
  bankScale: 0.8, // fraction of the angle a turn's centripetal acceleration asks for
  bankLimit: 0.3, // rad
  headLead: 0.7, // fraction of the heading error the head turns ahead of the body
  headLimit: 0.95, // rad
  bodyResponse: 7, // 1/s: smoothing of lean, bank and head
  strikeAbove: 0.35, // gait.move above which a foot landing is an event (not a shuffle at rest)
  strafeForward: 6, // m/s at most strafing straight ahead (aiming while running)...
  strafeSide: 3.4, // ...sideways...
  strafeBack: 2.4, // ...and backwards
  travelResponse: 10, // 1/s: how quickly the legs' direction of travel follows a change
});

const TWO_PI = Math.PI * 2;

/** An angle brought into [-pi, pi]. */
export function wrapAngle(angle) {
  return angle - TWO_PI * Math.round(angle / TWO_PI);
}

/** The yaw that faces along a ground direction (x, z); 0 faces -Z. */
export function yawOfDirection(x, z) {
  return Math.atan2(-x, -z);
}

/**
 * The state of one person's locomotion; read it, do not write it (except through reset).
 * @typedef {object} LocomotionState
 * @property {number} vx Ground velocity, m/s, world X: move the person (capsule) by this.
 * @property {number} vz Ground velocity, world Z.
 * @property {number} speed Its length.
 * @property {number} forwardAcceleration m/s^2 along the body's facing (negative braking).
 * @property {number} yaw Body yaw (object.rotation.y).
 * @property {number} yawRate rad/s, positive turning left.
 * @property {number} wantedYaw Where the body is turning to.
 * @property {boolean} spotTurn True while turning on the spot.
 * @property {number} stepSpeed The speed the legs step at: the ground speed, or a small stepping
 *   speed while turning on the spot.
 * @property {number} phase Stride phase in [0, 1): the left foot lands at 0, the right at 0.5.
 * @property {number} strikes Feet that landed this step: bit 1 left, bit 2 right.
 * @property {number} lean Forward lean from acceleration, radians.
 * @property {number} bank Lean into the turn, radians, positive to the left.
 * @property {number} headYaw Head turn ahead of the body, radians, positive to the left.
 * @property {number} travelX Direction of travel in the body's space (unit, +X right)...
 * @property {number} travelZ ...(-Z ahead): (0, -1) walking forwards, (0, 1) backwards, (1, 0)
 *   strafing right. Smoothed, so the legs swing round instead of snapping.
 * @property {number} strafe 0..1: how much the body is facing a given way instead of its travel.
 * @property {import('../motion/gaitModel.js').Gait} gait The gait at stepSpeed (stride, cadence, ...).
 */

/**
 * Creates a locomotion state.
 * @param {object} [options]
 * @param {number} [options.legScale] The body's leg length over the reference adult's (body.legScale).
 * @param {number} [options.restHalfWidth] Half the distance between the ankles at rest, metres.
 * @param {number} [options.yaw] Starting yaw.
 * @param {import('../motion/movementStyle.js').MovementStyle} [options.style] The person's way of
 *   moving (stride and cadence follow it; set state.style to change it).
 * @param {Partial<typeof LOCOMOTION_TUNING>} [options.tuning]
 * @returns {LocomotionState & { tuning: typeof LOCOMOTION_TUNING, legScale: number, restHalfWidth: number }}
 */
export function createLocomotionState(options = {}) {
  const yaw = options.yaw ?? 0;
  return {
    tuning: { ...LOCOMOTION_TUNING, ...options.tuning },
    legScale: options.legScale ?? 1,
    style: options.style ?? NEUTRAL_STYLE,
    restHalfWidth: options.restHalfWidth ?? 0.09,
    gait: createGait(),
    vx: 0, vz: 0, speed: 0, forwardAcceleration: 0,
    yaw, yawRate: 0, wantedYaw: yaw, spotTurn: false,
    stepSpeed: 0, phase: 0, strikes: 0,
    lean: 0, bank: 0, headYaw: 0,
    travelX: 0, travelZ: -1, strafe: 0,
  };
}

/**
 * Puts a person at rest facing a yaw (after a teleport, a cut scene, leaving a car).
 * @param {LocomotionState} state
 * @param {number} yaw
 */
export function resetLocomotionState(state, yaw) {
  state.vx = 0; state.vz = 0; state.speed = 0; state.forwardAcceleration = 0;
  state.yaw = yaw; state.yawRate = 0; state.wantedYaw = yaw; state.spotTurn = false;
  state.stepSpeed = 0; state.strikes = 0; state.lean = 0; state.bank = 0; state.headYaw = 0;
  state.travelX = 0; state.travelZ = -1; state.strafe = 0;
}

/**
 * Advances a person's locomotion by one step.
 * @param {ReturnType<typeof createLocomotionState>} state
 * @param {number} dt Seconds (any frame time; 0 does nothing).
 * @param {object} input
 * @param {number} [input.moveX] Wanted ground velocity, m/s, world X (0 when absent).
 * @param {number} [input.moveZ] Wanted ground velocity, world Z.
 * @param {number} [input.facing] Yaw to face when standing (no move asked); absent (or NaN):
 *   keep the last facing. While a move is asked the body faces the way of travel and this is
 *   ignored, unless `strafe` is set.
 * @param {boolean} [input.strafe] Face `facing` while moving too (aiming, backing away): the
 *   legs strafe and walk backwards; speed is limited to strafeForward / strafeSide / strafeBack
 *   by the angle between facing and travel.
 * @param {number} [input.measuredSpeed] The ground speed the person really made last step (a
 *   capsule stopped by a wall); when lower, the controller's speed is pulled down to it so the
 *   legs do not run on the spot against the wall.
 * @returns {typeof state}
 */
export function stepLocomotionState(state, dt, input) {
  state.strikes = 0;
  if (!(dt > 0)) return state;
  const t = state.tuning;
  const wantX = input.moveX ?? 0, wantZ = input.moveZ ?? 0;
  const wantSpeed = Math.hypot(wantX, wantZ);
  const asked = wantSpeed > 0.05;

  // Where the body should face: the asked way of travel when moving (there is no strafing yet, so
  // a facing given while moving is ignored rather than holding the person still), the asked
  // facing when standing, else the last one.
  const facing = input.facing;
  const hasFacing = facing === facing && facing !== undefined && facing !== null;
  const strafing = Boolean(input.strafe) && hasFacing;
  let faceYaw = state.wantedYaw;
  if (asked && !strafing) faceYaw = yawOfDirection(wantX, wantZ);
  else if (hasFacing) faceYaw = facing;
  const moving = strafing ? 0 : smoothStep(0.4, 1.2, state.speed);
  const travelYaw = state.speed > 0.05 ? yawOfDirection(state.vx, state.vz) : faceYaw;
  const wantedYaw = wrapAngle(faceYaw + moving * wrapAngle(travelYaw - faceYaw));
  state.wantedYaw = faceYaw;

  // Speed with inertia: a person only goes the way they face, so the speed allowed falls with
  // the angle between the body and the asked direction (beyond about 120 degrees they stop,
  // turn and go). Strafing, any direction goes, slower sideways and slower still backwards.
  let targetX = 0, targetZ = 0;
  if (asked) {
    const off = wrapAngle(yawOfDirection(wantX, wantZ) - state.yaw);
    const c = Math.cos(off);
    let allow = smoothStep(-0.5, 0.6, c);
    if (strafing) {
      const cap = c >= 0 ? t.strafeSide + (t.strafeForward - t.strafeSide) * c
        : t.strafeSide + (t.strafeBack - t.strafeSide) * -c;
      allow = Math.min(1, cap / wantSpeed);
    }
    targetX = wantX * allow; targetZ = wantZ * allow;
  }
  let changeX = (targetX - state.vx) * (1 - Math.exp(-t.response * dt));
  let changeZ = (targetZ - state.vz) * (1 - Math.exp(-t.response * dt));
  const speeding = Math.hypot(targetX, targetZ) > state.speed;
  const limit = (speeding ? t.accelerate : t.brake) * dt;
  const change = Math.hypot(changeX, changeZ);
  if (change > limit) {
    changeX *= limit / change; changeZ *= limit / change;
  }
  state.vx += changeX; state.vz += changeZ;
  state.speed = Math.hypot(state.vx, state.vz);
  if (!asked && state.speed < t.stopBelow) {
    changeX -= state.vx; changeZ -= state.vz;
    state.vx = 0; state.vz = 0; state.speed = 0;
  }
  const measured = input.measuredSpeed;
  if (measured !== undefined && measured >= 0 && measured < state.speed) {
    const k = measured / state.speed;
    state.vx *= k; state.vz *= k; state.speed = measured;
  }

  // The body's heading: critically damped towards the wanted yaw, at a limited turn rate.
  let error = wrapAngle(wantedYaw - state.yaw);
  const slow = state.speed < t.spotTurnBelow;
  if (slow && !asked) {
    if (Math.abs(error) > t.spotTurnStart) state.spotTurn = true;
    else if (Math.abs(error) < 0.04) state.spotTurn = false;
    if (!state.spotTurn) error = 0; // a small change of facing is the head's
  } else {
    state.spotTurn = slow && Math.abs(error) > 0.04;
  }
  const maxRate = slow ? t.spotTurnRate
    : t.turnRateWalking + (t.turnRateSprinting - t.turnRateWalking) * Math.min(1, state.speed / 7);
  const rateWanted = Math.max(-maxRate, Math.min(maxRate, error * t.turnResponse));
  state.yawRate += (rateWanted - state.yawRate) * (1 - Math.exp(-4 * t.turnResponse * dt));
  state.yaw = wrapAngle(state.yaw + state.yawRate * dt);

  // The legs: the ground speed, or stepping in place to turn; the phase advances by distance.
  const stepping = state.spotTurn || (slow && Math.abs(state.yawRate) > 0.5)
    ? Math.abs(state.yawRate) * t.spotStepPerRadian : 0;
  state.stepSpeed = Math.max(state.speed, stepping);
  const gait = state.gait;
  evaluateGait(gait, state.stepSpeed, state.legScale, state.restHalfWidth, state.style);
  // distance / strideLength, which is strideRate * dt (the gait defines strideLength = speed / strideRate)
  const before = state.phase, after = before + gait.strideRate * dt;
  if (gait.move > t.strikeAbove) {
    if (Math.floor(after) > Math.floor(before)) state.strikes |= 1;
    if (Math.floor(after - 0.5) > Math.floor(before - 0.5)) state.strikes |= 2;
  }
  state.phase = after - Math.floor(after);

  // Lean from acceleration, bank from the turn, the head ahead of the body.
  const sin = Math.sin(state.yaw), cos = Math.cos(state.yaw);
  state.forwardAcceleration = (-sin * changeX - cos * changeZ) / dt;
  const lean = Math.max(-t.leanLimit * 0.7, Math.min(t.leanLimit, state.forwardAcceleration * t.leanPerAcceleration));
  const k = 1 - Math.exp(-t.bodyResponse * dt);
  state.strafe += ((strafing ? 1 : 0) - state.strafe) * k;
  const bank = Math.max(-t.bankLimit, Math.min(t.bankLimit, Math.atan(state.speed * state.yawRate / 9.81) * t.bankScale))
    * (1 - state.strafe);
  const lead = wrapAngle(faceYaw - state.yaw) * (state.spotTurn || !slow ? t.headLead : 1);
  const head = Math.max(-t.headLimit, Math.min(t.headLimit, lead));

  // The legs' direction of travel in the body's space (forwards when standing still).
  let tx = 0, tz = -1;
  if (state.speed > 0.05) {
    tx = (state.vx * cos - state.vz * sin) / state.speed;
    tz = (state.vx * sin + state.vz * cos) / state.speed;
  }
  // (turned by angle, so a reversal swings round instead of collapsing through zero)
  const kt = 1 - Math.exp(-t.travelResponse * dt);
  const was = Math.atan2(state.travelX, -state.travelZ);
  const travel = was + wrapAngle(Math.atan2(tx, -tz) - was) * kt;
  state.travelX = Math.sin(travel); state.travelZ = -Math.cos(travel);
  state.lean += (lean - state.lean) * k;
  state.bank += (bank - state.bank) * k;
  state.headYaw += (head - state.headYaw) * k;
  return state;
}

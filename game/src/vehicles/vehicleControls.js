// The driving controls of one vehicle, as the player, traffic and police write them, and the
// rules that turn them into what the physics vehicle understands (input.drive, steer,
// handbrake). Pure: no three.js, no engine; tested in tools/tests/vehicle-system/.
//
// Keyboard feel (tuned for WASD and the arrows, which are all-or-nothing):
// - Steering is eased: the wheel turns in at STEER_IN_RATE and comes back to centre faster
//   (STEER_OUT_RATE), so a tap is a small correction and holding gives full lock in about a
//   quarter of a second. Reversing the key passes through centre at the faster rate, so
//   flicking from left to right catches a slide instead of lagging behind it. The physics then
//   limits the lock by speed, so the same key press is gentle on the motorway and sharp in town.
// - Brake brakes; once the car is nearly stopped it reverses only when `autoReverse` is set
//   (the player's arcade pedal), so a traffic car told to brake stays stopped.
// - Throttle and brake together: brake wins (a burnout needs the handbrake).

/** Steering input change per second when turning away from centre. */
export const STEER_IN_RATE = 4.5;
/** Steering input change per second when returning to (or passing through) centre. */
export const STEER_OUT_RATE = 7.5;
/** Below this forward speed (m/s) a brake request becomes a reverse request with autoReverse. */
export const REVERSE_BELOW_SPEED = 0.8;

/**
 * @typedef {object} VehicleControls What a driver asks of a vehicle; written by player, traffic, police.
 * @property {number} throttle 0..1 accelerator.
 * @property {number} brake 0..1 brake pedal (reverses at a standstill when autoReverse is true).
 * @property {number} steer -1 full left .. 1 full right (the wanted position, eased by the fleet).
 * @property {number} handbrake 0 or 1.
 * @property {boolean} reverse True drives backwards with the throttle (for AI that reverses on purpose).
 * @property {boolean} autoReverse True: holding brake at a standstill reverses (the player's pedal).
 * @property {boolean} horn True while the horn sounds.
 * @property {boolean | null} headlights null follows the time of day; true or false forces them.
 */

/**
 * New neutral controls.
 * @returns {VehicleControls}
 */
export function createVehicleControls() {
  return {
    throttle: 0, brake: 0, steer: 0, handbrake: 0, reverse: false, autoReverse: false, horn: false, headlights: null,
    pitch: 0, roll: 0, yaw: 0, lever: 0, wheelBrake: 0,
  };
}

/**
 * Puts controls back to neutral (a driver left), keeping the headlight choice.
 * @param {VehicleControls} controls The controls to reset.
 * @returns {VehicleControls} The same object.
 */
export function releaseVehicleControls(controls) {
  controls.throttle = 0;
  controls.brake = 0;
  controls.steer = 0;
  controls.handbrake = 0;
  controls.reverse = false;
  controls.horn = false;
  // An airplane's stick, pedals, throttle lever and wheel brakes (vehicleCraftControls.js).
  controls.pitch = 0;
  controls.roll = 0;
  controls.yaw = 0;
  controls.lever = 0;
  controls.wheelBrake = 0;
  return controls;
}

function clamp(value, low, high) {
  if (!(value > low)) return low;
  return value > high ? high : value;
}

/**
 * Moves the eased steering one step towards the wanted position.
 * @param {number} current The eased steering now (-1..1).
 * @param {number} target The wanted steering (-1..1).
 * @param {number} dt Seconds.
 * @returns {number} The new eased steering.
 */
export function easeSteering(current, target, dt) {
  const goal = clamp(target, -1, 1);
  if (goal === current) return current;
  const outward = Math.abs(goal) > Math.abs(current) && goal * current >= 0;
  const rate = (outward ? STEER_IN_RATE : STEER_OUT_RATE) * dt;
  if (goal > current) return current + rate > goal ? goal : current + rate;
  return current - rate < goal ? goal : current - rate;
}

/**
 * Turns controls into the physics vehicle's input.
 * @param {VehicleControls} controls What the driver asks.
 * @param {number} forwardSpeed The vehicle's speed along its nose, m/s (negative backwards).
 * @param {{drive: number, steer: number, handbrake: number}} out The physics input to write
 *   (its `steer` keeps the eased value between calls).
 * @param {number} dt Seconds since the last call.
 * @returns {{drive: number, steer: number, handbrake: number}} `out`.
 */
export function resolveDriveInput(controls, forwardSpeed, out, dt) {
  const throttle = clamp(controls.throttle, 0, 1);
  const brake = clamp(controls.brake, 0, 1);
  let drive = 0;
  if (controls.reverse) {
    drive = forwardSpeed > 1 ? (brake > 0 ? -brake : 0) : -throttle;
    if (brake > 0 && forwardSpeed < -1) drive = brake;
  } else if (brake > 0) {
    if (forwardSpeed > REVERSE_BELOW_SPEED) drive = -brake;
    else if (forwardSpeed < -1) drive = brake;
    else drive = controls.autoReverse ? -brake : 0;
  } else {
    drive = throttle;
  }
  out.drive = drive;
  out.steer = easeSteering(out.steer, controls.steer, dt);
  out.handbrake = controls.handbrake > 0 ? 1 : 0;
  return out;
}

/**
 * Whether the brake lamps glow: the driver brakes, or holds the car still with the pedal.
 * @param {{drive: number}} input The physics input written by resolveDriveInput.
 * @param {number} forwardSpeed m/s.
 * @param {VehicleControls} controls The controls.
 * @returns {boolean}
 */
export function brakeLampsLit(input, forwardSpeed, controls) {
  if (controls.brake > 0 && !(controls.autoReverse && Math.abs(forwardSpeed) < REVERSE_BELOW_SPEED && input.drive < 0)) return true;
  return (input.drive < 0 && forwardSpeed > 1) || (input.drive > 0 && forwardSpeed < -1);
}

// The pilot's hands and feet as numbers: the keys of the `inAircraft` context turned into a stick
// (pitch, roll), pedals (yaw), a throttle lever that stays where it is put, wheel brakes, the trim
// wheel, and one-shot commands (flaps, gear, autopilot, leave). Pure data, no three.js: tested in
// Node (tools/tests/flight/aircraftControls.test.mjs). aircraftPilotSeat.js feeds it the keys and
// hands the result to the fleet's controls and to the Airplane.
//
// Conventions (physics/aircraft/Airplane.js): pitch +1 = stick back (nose up), roll +1 = right
// wing down, yaw +1 = nose right, lever 0..1.

/**
 * One fixed step of the pilot's controls.
 * @param {ReturnType<typeof createPilotControls>} pilot The state (written and returned).
 * @param {PilotKeys} keys What is held and what was pressed this step.
 * @param {number} dt Step seconds.
 * @param {{onGround: boolean, groundSpeed: number, flapNotch: number, flapNotchCount: number, trim: number,
 *   vertical?: string | null}} flight What the aircraft is doing now.
 * @param {typeof PILOT_TUNING} [tuning]
 * @returns {ReturnType<typeof createPilotControls>}
 */
export function stepPilotControls(pilot, keys, dt, flight, tuning = PILOT_TUNING) {
  const command = pilot.command;
  command.flapNotch = null;
  command.leave = false;
  command.gear = false;
  command.autopilot = false;
  command.mode = null;
  command.headingDelta = 0;
  command.altitudeDelta = 0;
  command.verticalSpeedDelta = 0;

  const pull = (keys.pitchUp ? 1 : 0) - (keys.pitchDown ? 1 : 0);
  // T held: W / S turn the trim wheel and the stick is left alone.
  pilot.trim = flight.trim;
  if (keys.trim) {
    pilot.trim = clamp(flight.trim + pull * tuning.trimRate * dt, -1, 1);
    pilot.pitch = ramp(pilot.pitch, 0, dt, tuning);
  } else {
    pilot.pitch = ramp(pilot.pitch, pull, dt, tuning);
  }
  pilot.roll = ramp(pilot.roll, (keys.rollRight ? 1 : 0) - (keys.rollLeft ? 1 : 0), dt, tuning);
  pilot.yaw = ramp(pilot.yaw, (keys.rudderRight ? 1 : 0) - (keys.rudderLeft ? 1 : 0), dt, tuning);
  pilot.lever = clamp(pilot.lever + ((keys.throttleUp ? 1 : 0) - (keys.throttleDown ? 1 : 0)) * tuning.leverRate * dt, 0, 1);
  pilot.wheelBrake = keys.wheelBrakes ? 1 : 0;

  // F: out of the aircraft when it stands still on the ground, otherwise the flaps.
  const standing = flight.onGround && Math.abs(flight.groundSpeed) < tuning.standStill;
  let flapStep = keys.pressedFlaps ? 1 : 0;
  if (keys.pressedExit) {
    if (standing) command.leave = true;
    else flapStep += 1;
  }
  if (flapStep > 0 && flight.flapNotchCount > 1) command.flapNotch = nextFlapNotch(flight.flapNotch, flight.flapNotchCount, flapStep);
  command.gear = Boolean(keys.pressedGear);
  command.autopilot = Boolean(keys.pressedAutopilot);
  command.mode = keys.pressedMode ?? null;
  command.headingDelta = ((keys.autopilotRight ? 1 : 0) - (keys.autopilotLeft ? 1 : 0)) * tuning.headingRate * dt;
  const up = (keys.autopilotUp ? 1 : 0) - (keys.autopilotDown ? 1 : 0);
  if (flight.vertical === 'VS') command.verticalSpeedDelta = up * tuning.verticalSpeedRate * dt;
  else command.altitudeDelta = up * tuning.altitudeRate * dt;
  return pilot;
}

/** How the keys feel: rates per second. */
export const PILOT_TUNING = Object.freeze({
  /** The stick and pedals move this fast towards a held key (a tap of 0.1 s is a 0.3 input)... */
  rampUp: 3,
  /** ...and spring back this fast when it is released. */
  rampDown: 5,
  /** The throttle lever's travel per second. */
  leverRate: 0.5,
  /** The trim wheel's travel per second (T held with W / S). */
  trimRate: 0.25,
  /** Ground speed (m/s) under which F leaves the aircraft instead of moving the flaps. */
  standStill: 1.5,
  /** The autopilot's heading bug, radians per second while an arrow is held. */
  headingRate: 0.5,
  /** The autopilot's altitude target, metres per second while Page Up / Down is held. */
  altitudeRate: 150,
  /** The autopilot's vertical-speed target, m/s per second while Page Up / Down is held. */
  verticalSpeedRate: 2.5,
});

/**
 * A pilot's controls at rest.
 * @param {number} [lever] Where the throttle lever stands (an aircraft boarded in flight keeps its power).
 */
export function createPilotControls(lever = 0) {
  return {
    pitch: 0, roll: 0, yaw: 0, lever, wheelBrake: 0, trim: 0,
    command: {
      /** The flap notch to select, or null. */
      flapNotch: null,
      /** Get out (F standing still on the ground). */
      leave: false,
      /** Toggle the landing gear. */
      gear: false,
      /** Toggle the autopilot. */
      autopilot: false,
      /** 'HDG' | 'ALT' | 'VS' | 'NAV' | 'ATHR' or null. */
      mode: null,
      headingDelta: 0, altitudeDelta: 0, verticalSpeedDelta: 0,
    },
  };
}

/**
 * The notch after `steps` presses: one further down each press, back to up after the last.
 * @param {number} notch The notch now.
 * @param {number} count How many notches the aircraft has (up included).
 * @param {number} [steps]
 */
export function nextFlapNotch(notch, count, steps = 1) {
  if (!(count > 1)) return 0;
  return (((notch + steps) % count) + count) % count;
}

/**
 * The line the key hint shows when the lead takes an aircraft's controls.
 * @param {{retractableGear?: boolean, autoThrottle?: boolean}} [aircraft]
 */
export function pilotHintText(aircraft = {}) {
  return `throttle up, Ctrl down, W/S pitch, A/D roll, Q/E rudder, X flaps${aircraft.retractableGear ? ', G gear' : ''}, B brakes, P autopilot, C camera, F leaves when stopped`;
}

function ramp(value, target, dt, tuning) {
  const rate = (target === 0 || Math.sign(target) !== Math.sign(value) && value !== 0 ? tuning.rampDown : tuning.rampUp) * dt;
  const next = value + Math.max(-rate, Math.min(rate, target - value));
  return Math.abs(next) < 1e-6 ? 0 : next;
}

function clamp(value, low, high) {
  return value < low ? low : value > high ? high : value;
}

/**
 * @typedef {object} PilotKeys
 * @property {boolean} [pitchUp] Stick back. @property {boolean} [pitchDown] Stick forward.
 * @property {boolean} [rollLeft] @property {boolean} [rollRight]
 * @property {boolean} [rudderLeft] @property {boolean} [rudderRight]
 * @property {boolean} [throttleUp] @property {boolean} [throttleDown]
 * @property {boolean} [trim] The trim key is held. @property {boolean} [wheelBrakes]
 * @property {boolean} [pressedFlaps] @property {boolean} [pressedExit] F this step.
 * @property {boolean} [pressedGear] @property {boolean} [pressedAutopilot]
 * @property {string | null} [pressedMode] 'HDG' | 'ALT' | 'VS' | 'NAV' | 'ATHR'
 * @property {boolean} [autopilotLeft] @property {boolean} [autopilotRight]
 * @property {boolean} [autopilotUp] @property {boolean} [autopilotDown]
 */

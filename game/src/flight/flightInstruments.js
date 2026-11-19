// What each cockpit instrument shows, from the aircraft's flight state: the one place where the
// flight model's SI numbers become a pilot's units (knots, feet, feet per minute, degrees, percent,
// degrees Celsius), so the HUD and every instrument panel read the same values. The turn needle is
// at half deflection in a standard-rate turn (3 degrees a second); the slip ball slides to the side
// the aircraft is slipping towards ("step on the ball"). Pure numbers, no imports.

/**
 * Reads the instruments of an aircraft into `out`.
 * @param {{state: object, tuning: object, autopilot: object, mode: string}} airplane The Airplane (physics/aircraft/Airplane.js).
 * @param {InstrumentReadout} out From createInstrumentReadout; reused, nothing is allocated.
 * @returns {InstrumentReadout} `out`.
 */
export function readInstruments(airplane, out) {
  const state = airplane.state;
  const tuning = airplane.tuning;
  out.airspeedKnots = state.indicatedAirspeed * KNOTS_PER_METRE_PER_SECOND;
  out.groundSpeedKnots = state.groundSpeed * KNOTS_PER_METRE_PER_SECOND;
  out.altitudeFeet = state.altitude * FEET_PER_METRE;
  out.radarAltitudeFeet = state.radarAltitude * FEET_PER_METRE;
  out.verticalSpeedFpm = state.verticalSpeed * FEET_PER_METRE * 60;
  out.headingDegrees = compassDegrees(state.heading);
  out.pitchDegrees = state.pitch * DEGREES;
  out.rollDegrees = state.roll * DEGREES;
  out.turnNeedle = clamp((state.turnRate * DEGREES) / (2 * STANDARD_RATE_TURN), -1, 1);
  // A slip to the right (the air coming from the right) rolls the ball to the right.
  out.slipBall = clamp(state.slip / SLIP_BALL_FULL, -1, 1);
  out.mach = state.mach;
  out.alphaDegrees = state.alpha * DEGREES;
  out.loadFactor = state.loadFactor;
  out.throttlePercent = state.throttle * 100;
  out.rpmPercent = state.rpm * 100;
  out.afterburner = state.afterburner > 0.02;
  const notches = tuning.flapNotches;
  out.flapsDegrees = state.flaps * notches[notches.length - 1];
  out.flapNotch = state.flapNotch;
  out.gearDown = state.gear > 0.99;
  out.gearInTransit = state.gear > 0.01 && state.gear < 0.99;
  out.trimPercent = state.trim * 100;
  out.fuelPercent = state.fuel * 100;
  out.brake = state.brake > 0.05;
  out.stallWarning = state.stallWarning > 0.05;
  out.stalled = state.stalled;
  out.overspeed = state.overspeed > 0.5;
  out.stallSpeedKnots = state.stallSpeed * KNOTS_PER_METRE_PER_SECOND;
  out.rotateSpeedKnots = tuning.rotateSpeed * KNOTS_PER_METRE_PER_SECOND;
  out.neverExceedKnots = tuning.neverExceedSpeed * KNOTS_PER_METRE_PER_SECOND;
  out.maxMach = tuning.maxMach;
  out.skinTemperatureC = state.skinTemperature;
  out.outsideTemperatureC = state.outsideTemperature;
  // The exhaust (a jet) or the cylinder heads (a piston) warm with the power set.
  out.engineTemperatureC = state.rpm <= 0.01
    ? state.outsideTemperature
    : tuning.kind === 'jet' ? 380 + 420 * state.throttle + 520 * state.afterburner : 90 + 130 * state.throttle;
  out.mode = airplane.mode;
  out.onGround = state.onGround;
  const autopilot = airplane.autopilot;
  const shown = out.autopilot;
  shown.engaged = autopilot.engaged;
  shown.lateral = autopilot.lateral;
  shown.vertical = autopilot.vertical;
  shown.autoThrottle = autopilot.autoThrottle;
  shown.headingDegrees = compassDegrees(autopilot.targetHeading);
  shown.altitudeFeet = autopilot.targetAltitude * FEET_PER_METRE;
  shown.verticalSpeedFpm = autopilot.targetVerticalSpeed * FEET_PER_METRE * 60;
  shown.speedKnots = autopilot.targetSpeed * KNOTS_PER_METRE_PER_SECOND;
  shown.routeDistanceNm = autopilot.route !== null && autopilot.routeIndex < autopilot.route.length
    ? autopilot.routeDistance / METRES_PER_NAUTICAL_MILE
    : null;
  return out;
}

/** Knots in a metre per second. */
export const KNOTS_PER_METRE_PER_SECOND = 3600 / 1852;
/** Feet in a metre. */
export const FEET_PER_METRE = 1 / 0.3048;
/** Metres in a nautical mile. */
export const METRES_PER_NAUTICAL_MILE = 1852;
/** A standard-rate turn, degrees per second (a full circle in two minutes). */
export const STANDARD_RATE_TURN = 3;
/** The sideslip that puts the ball against its stop, radians (about 8.6 degrees). */
export const SLIP_BALL_FULL = 0.15;

const DEGREES = 180 / Math.PI;

/**
 * A compass heading in degrees, 0 (north) up to but not including 360.
 * @param {number} radians Compass radians, any turn count.
 * @returns {number}
 */
export function compassDegrees(radians) {
  const degrees = (radians * DEGREES) % 360;
  const wrapped = degrees < 0 ? degrees + 360 : degrees;
  return wrapped >= 360 ? 0 : wrapped;
}

/**
 * A readout with every field present.
 * @returns {InstrumentReadout}
 */
export function createInstrumentReadout() {
  return {
    airspeedKnots: 0, groundSpeedKnots: 0, altitudeFeet: 0, radarAltitudeFeet: 0, verticalSpeedFpm: 0, headingDegrees: 0,
    pitchDegrees: 0, rollDegrees: 0, turnNeedle: 0, slipBall: 0, mach: 0, alphaDegrees: 0, loadFactor: 1,
    throttlePercent: 0, rpmPercent: 0, afterburner: false, flapsDegrees: 0, flapNotch: 0, gearDown: true,
    gearInTransit: false, trimPercent: 0, fuelPercent: 100, brake: false, stallWarning: false, stalled: false,
    overspeed: false, stallSpeedKnots: 0, rotateSpeedKnots: 0, neverExceedKnots: 0, maxMach: 0, skinTemperatureC: 15,
    outsideTemperatureC: 15, engineTemperatureC: 15, mode: 'casual', onGround: true,
    autopilot: {
      engaged: false, lateral: null, vertical: null, autoThrottle: false, headingDegrees: 0, altitudeFeet: 0,
      verticalSpeedFpm: 0, speedKnots: 0, routeDistanceNm: null,
    },
  };
}

function clamp(value, low, high) {
  return value < low ? low : value > high ? high : value;
}

/**
 * @typedef {object} InstrumentReadout
 * @property {number} airspeedKnots Indicated.
 * @property {number} groundSpeedKnots
 * @property {number} altitudeFeet Above sea level.
 * @property {number} radarAltitudeFeet Above what is below.
 * @property {number} verticalSpeedFpm
 * @property {number} headingDegrees 0..360.
 * @property {number} pitchDegrees
 * @property {number} rollDegrees + right wing down.
 * @property {number} turnNeedle -1..1; 0.5 is a standard-rate turn to the right.
 * @property {number} slipBall -1..1; + the ball is to the right.
 * @property {number} mach
 * @property {number} alphaDegrees
 * @property {number} loadFactor
 * @property {number} throttlePercent Power delivered.
 * @property {number} rpmPercent Engine speed.
 * @property {boolean} afterburner
 * @property {number} flapsDegrees
 * @property {number} flapNotch
 * @property {boolean} gearDown Down and locked.
 * @property {boolean} gearInTransit
 * @property {number} trimPercent -100..100, + nose up.
 * @property {number} fuelPercent
 * @property {boolean} brake
 * @property {boolean} stallWarning The horn.
 * @property {boolean} stalled
 * @property {boolean} overspeed
 * @property {number} stallSpeedKnots For the present flaps.
 * @property {number} rotateSpeedKnots
 * @property {number} neverExceedKnots
 * @property {number} maxMach
 * @property {number} skinTemperatureC
 * @property {number} outsideTemperatureC
 * @property {number} engineTemperatureC
 * @property {'casual' | 'realistic'} mode
 * @property {boolean} onGround
 * @property {{engaged: boolean, lateral: string | null, vertical: string | null, autoThrottle: boolean, headingDegrees: number,
 *   altitudeFeet: number, verticalSpeedFpm: number, speedKnots: number, routeDistanceNm: number | null}} autopilot
 */

// The instrument readout: unit conversions, the turn needle at standard rate, the slip ball's
// side, the heading's wrap, and that every field of the contract is there and live in flight.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { VEHICLE_CATALOG } from '../../../game/src/catalog/vehicleCatalog.js';
import { deriveAirplaneTuning } from '../../../game/src/flight/airplaneTuning.js';
import { createAutopilotState } from '../../../game/src/flight/flightAutopilot.js';
import { compassDegrees, createInstrumentReadout, readInstruments } from '../../../game/src/flight/flightInstruments.js';
import { createFlightState } from '../../../game/src/physics/aircraft/Airplane.js';
import { createFlightBench, fly } from './flightTestBench.mjs';

const near = (actual, expected, tolerance, what) => assert.ok(Math.abs(actual - expected) <= tolerance, `${what}: ${actual} vs ${expected}`);
const DEGREE = Math.PI / 180;

/** A stand-in aircraft with a hand-set state. */
function aircraft(id, changes = {}) {
  return {
    state: { ...createFlightState(), ...changes }, tuning: deriveAirplaneTuning(VEHICLE_CATALOG[id]),
    autopilot: createAutopilotState(), mode: 'realistic',
  };
}

const FIELDS = [
  'airspeedKnots', 'groundSpeedKnots', 'altitudeFeet', 'radarAltitudeFeet', 'verticalSpeedFpm', 'headingDegrees', 'pitchDegrees',
  'rollDegrees', 'turnNeedle', 'slipBall', 'mach', 'alphaDegrees', 'loadFactor', 'throttlePercent', 'rpmPercent', 'afterburner',
  'flapsDegrees', 'flapNotch', 'gearDown', 'gearInTransit', 'trimPercent', 'fuelPercent', 'brake', 'stallWarning', 'stalled',
  'overspeed', 'stallSpeedKnots', 'rotateSpeedKnots', 'neverExceedKnots', 'maxMach', 'skinTemperatureC', 'outsideTemperatureC',
  'engineTemperatureC', 'mode', 'onGround', 'autopilot',
];
const AUTOPILOT_FIELDS = ['engaged', 'lateral', 'vertical', 'autoThrottle', 'headingDegrees', 'altitudeFeet', 'verticalSpeedFpm', 'speedKnots', 'routeDistanceNm'];

test('a fresh readout has every field of the contract', () => {
  const out = createInstrumentReadout();
  assert.deepEqual(Object.keys(out).sort(), [...FIELDS].sort());
  assert.deepEqual(Object.keys(out.autopilot).sort(), [...AUTOPILOT_FIELDS].sort());
});

test('metres per second become knots and feet per minute, metres become feet, radians degrees', () => {
  const out = readInstruments(aircraft('gaviota_t2', {
    indicatedAirspeed: 51.4444, groundSpeed: 25.7222, altitude: 304.8, radarAltitude: 30.48, verticalSpeed: 2.54,
    pitch: 5 * DEGREE, roll: -20 * DEGREE, alpha: 4 * DEGREE, mach: 0.15, loadFactor: 1.1, throttle: 0.6, rpm: 0.8,
    flaps: 2 / 3, flapNotch: 2, gear: 1, trim: -0.25, fuel: 0.5, stallSpeed: 24.7, skinTemperature: 21, outsideTemperature: 13,
  }), createInstrumentReadout());
  near(out.airspeedKnots, 100, 0.01, 'airspeed');
  near(out.groundSpeedKnots, 50, 0.01, 'ground speed');
  near(out.altitudeFeet, 1000, 0.01, 'altitude');
  near(out.radarAltitudeFeet, 100, 0.01, 'radar altitude');
  near(out.verticalSpeedFpm, 500, 0.01, 'vertical speed');
  near(out.pitchDegrees, 5, 1e-9, 'pitch');
  near(out.rollDegrees, -20, 1e-9, 'roll');
  near(out.alphaDegrees, 4, 1e-9, 'alpha');
  near(out.throttlePercent, 60, 1e-9, 'throttle');
  near(out.rpmPercent, 80, 1e-9, 'rpm');
  near(out.flapsDegrees, 20, 1e-9, 'flaps: two thirds of the 30 degree last notch');
  near(out.trimPercent, -25, 1e-9, 'trim');
  near(out.fuelPercent, 50, 1e-9, 'fuel');
  near(out.stallSpeedKnots, 48.01, 0.02, 'stall speed');
  near(out.rotateSpeedKnots, 54.43, 0.02, 'rotate speed');
  near(out.neverExceedKnots, 159.4, 0.05, 'never-exceed speed');
  assert.equal(out.mach, 0.15);
  assert.equal(out.flapNotch, 2);
  assert.equal(out.skinTemperatureC, 21);
  assert.equal(out.outsideTemperatureC, 13);
  assert.equal(out.mode, 'realistic');
  assert.ok(out.engineTemperatureC > 150 && out.engineTemperatureC < 230, 'cylinder heads warm with power');
  assert.deepEqual([out.gearDown, out.gearInTransit, out.afterburner, out.stalled, out.overspeed, out.brake], [true, false, false, false, false, false]);
});

test('the turn needle is at half scale in a standard-rate turn, each way, and stops at full scale', () => {
  const read = (turnRate) => readInstruments(aircraft('gaviota_t2', { turnRate }), createInstrumentReadout()).turnNeedle;
  near(read(3 * DEGREE), 0.5, 1e-9, 'standard rate right');
  near(read(-3 * DEGREE), -0.5, 1e-9, 'standard rate left');
  assert.equal(read(0), 0);
  assert.equal(read(20 * DEGREE), 1);
  assert.equal(read(-20 * DEGREE), -1);
});

test('the slip ball goes to the side the aircraft slips towards', () => {
  const read = (slip) => readInstruments(aircraft('gaviota_t2', { slip }), createInstrumentReadout()).slipBall;
  assert.ok(read(0.05) > 0.2, 'slipping right: ball right');
  assert.ok(read(-0.05) < -0.2, 'slipping left: ball left');
  assert.equal(read(0), 0);
  assert.equal(read(1), 1);
  // Flown: right rudder alone skids the nose right of the airflow, and the ball goes left ("step on the ball" says left foot).
  const bench = createFlightBench('gaviota_t2', { y: 800, mode: 'realistic' });
  fly(bench, 3, (plane) => { plane.input.yaw = 1; });
  assert.ok(readInstruments(bench.plane, createInstrumentReadout()).slipBall < -0.2);
});

test('the heading wraps into 0 .. 360', () => {
  near(compassDegrees(0), 0, 1e-9, 'north');
  near(compassDegrees(Math.PI / 2), 90, 1e-9, 'east');
  near(compassDegrees(-Math.PI / 2), 270, 1e-9, 'west from a negative angle');
  near(compassDegrees(2 * Math.PI + 0.5 * DEGREE), 0.5, 1e-9, 'past a full turn');
  near(compassDegrees(-0.5 * DEGREE), 359.5, 1e-9, 'just west of north');
  assert.ok(compassDegrees(2 * Math.PI) < 360 && compassDegrees(-1e-15) < 360);
  const out = readInstruments(aircraft('gaviota_t2', { heading: 3.5 * Math.PI }), createInstrumentReadout());
  near(out.headingDegrees, 270, 1e-6, 'state heading');
});

test('flags: gear in transit, stall horn, overspeed, afterburner, brakes', () => {
  const out = readInstruments(aircraft('garza_negra', {
    gear: 0.4, stallWarning: 0.6, stalled: true, overspeed: 0.9, afterburner: 0.5, brake: 1, throttle: 1, rpm: 1, mach: 3,
    skinTemperature: 300,
  }), createInstrumentReadout());
  assert.deepEqual([out.gearDown, out.gearInTransit, out.stallWarning, out.stalled, out.overspeed, out.afterburner, out.brake],
    [false, true, true, true, true, true, true]);
  assert.equal(out.skinTemperatureC, 300);
  assert.equal(out.maxMach, 3.2);
  assert.equal(out.flapsDegrees, 0, 'no flaps on the fast jet');
  assert.ok(out.engineTemperatureC > 900, 'exhaust temperature with the burners lit');
  const cold = readInstruments(aircraft('garza_negra', { rpm: 0, outsideTemperature: 18 }), createInstrumentReadout());
  assert.equal(cold.engineTemperatureC, 18, 'a stopped engine is at the air\'s temperature');
});

test('the autopilot panel reads the targets in pilot units', () => {
  const plane = aircraft('manta_sombra');
  Object.assign(plane.autopilot, {
    engaged: true, lateral: 'NAV', vertical: 'VS', autoThrottle: true, targetHeading: -Math.PI / 2, targetAltitude: 3048,
    targetVerticalSpeed: -5.08, targetSpeed: 128.611, route: [{ x: 0, z: 0 }, { x: 0, z: -3704 }], routeIndex: 1, routeDistance: 3704,
  });
  const shown = readInstruments(plane, createInstrumentReadout()).autopilot;
  assert.deepEqual([shown.engaged, shown.lateral, shown.vertical, shown.autoThrottle], [true, 'NAV', 'VS', true]);
  near(shown.headingDegrees, 270, 1e-9, 'heading bug');
  near(shown.altitudeFeet, 10000, 0.01, 'altitude');
  near(shown.verticalSpeedFpm, -1000, 0.01, 'vertical speed');
  near(shown.speedKnots, 250, 0.01, 'speed');
  near(shown.routeDistanceNm, 2, 1e-9, 'distance to go');
  plane.autopilot.route = null;
  assert.equal(readInstruments(plane, createInstrumentReadout()).autopilot.routeDistanceNm, null);
});

test('in flight the readout follows the real state, in both modes, without making new objects', () => {
  const bench = createFlightBench('gaviota_t2', { y: 1000, heading: 4, mode: 'casual' });
  bench.plane.engageAutopilot();
  fly(bench, 20);
  const out = createInstrumentReadout();
  const autopilot = out.autopilot;
  assert.equal(readInstruments(bench.plane, out), out);
  assert.equal(out.autopilot, autopilot);
  near(out.altitudeFeet, 3281, 15, 'altitude');
  near(out.headingDegrees, 4 / DEGREE, 1, 'heading');
  near(out.airspeedKnots, 105, 12, 'cruise');
  near(out.verticalSpeedFpm, 0, 60, 'level');
  near(out.loadFactor, 1, 0.05, 'one g');
  near(out.outsideTemperatureC, 8.5, 0.2, 'standard air at 1000 m');
  assert.deepEqual([out.mode, out.onGround, out.gearDown, out.stallWarning, out.autopilot.engaged, out.autopilot.lateral], ['casual', false, true, false, true, 'HDG']);
  near(out.autopilot.altitudeFeet, 3281, 2, 'altitude target');
  // A standard-rate turn on the autopilot: the needle near half scale, the ball near the middle.
  bench.plane.autopilot.targetHeading = 4 + 2;
  fly(bench, 12);
  readInstruments(bench.plane, out);
  near(out.turnNeedle, 0.5, 0.25, 'turn needle in the turn');
  near(out.slipBall, 0, 0.25, 'ball centred');
  assert.ok(out.rollDegrees > 10);
});

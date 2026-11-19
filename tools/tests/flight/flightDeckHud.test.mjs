// The flight HUD: its layout maths (ladder, tapes, heading wrap, flight-path marker), the warning
// logic, the autopilot line, which HUD a view gets, the GPS route feed, and the painter run against
// a recording context in every mode and at extreme readouts.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LADDER, autopilotLine, firstLadderRung, flightPathMarkerOffset, flightWarnings, headingDifference, headingText, headingTickLabel,
  hudFrame, hudModeFor, ladderRungPosition, tapeTicks, thousands,
} from '../../../game/src/flight/deck/flightHudLayout.js';
import { paintFlightHud } from '../../../game/src/flight/deck/flightHudPainter.js';
import { bearingDegrees, createFlightRouteFeed, simplifyRouteForFlight } from '../../../game/src/flight/deck/flightRouteFeed.js';
import { EXTREME_READOUTS, createRecordingContext, makeReadout } from './flightDeckTestKit.mjs';

const near = (a, b, tolerance = 1e-6) => assert.ok(Math.abs(a - b) <= tolerance, `${a} is not within ${tolerance} of ${b}`);
const frame = () => hudFrame(1280, 720, 60, { cx: 0, cy: 0, unit: 0, pixelsPerDegree: 0, width: 0, height: 0 });

test('the HUD frame is centred and its ladder is conformal with the field of view', () => {
  const f = frame();
  assert.equal(f.cx, 640);
  assert.equal(f.cy, 360);
  assert.equal(f.unit, 1);
  assert.equal(f.pixelsPerDegree, 12);
  const small = hudFrame(768, 480, 60, { ...f });
  near(small.unit, 0.6, 1e-9);
  assert.equal(small.pixelsPerDegree, 8);
});

test('the horizon drops as the nose rises and turns against the bank', () => {
  const out = { x: 0, y: 0, angle: 0 };
  ladderRungPosition(0, 10, 0, 12, out);
  near(out.x, 0);
  near(out.y, 120); // nose 10 up: the horizon is 10 degrees below the centre
  ladderRungPosition(10, 10, 0, 12, out);
  near(out.y, 0); // the 10 degree rung is on the nose
  ladderRungPosition(20, 10, 0, 12, out);
  near(out.y, -120);
  // Right wing down 90: the horizon stands upright, its near point to the right of the centre.
  ladderRungPosition(0, 10, 90, 12, out);
  near(out.x, 120, 1e-9);
  near(out.y, 0, 1e-9);
  near(out.angle, -Math.PI / 2);
  // Banked right 30 and level: the horizon passes through the centre, rotated counter-clockwise.
  ladderRungPosition(0, 0, 30, 12, out);
  near(out.x, 0);
  near(out.y, 0);
  near(out.angle, -30 * Math.PI / 180);
});

test('ladder rungs start on a multiple of the step within reach', () => {
  assert.equal(firstLadderRung(0), -10);
  assert.equal(firstLadderRung(7), -5);
  assert.equal(firstLadderRung(-88), -90);
  assert.equal(firstLadderRung(NaN), -10);
  assert.ok(LADDER.reach > LADDER.step * 2);
});

test('tape ticks surround the reading and respect the floor', () => {
  const out = { first: 0, count: 0 };
  tapeTicks(105, 10, 50, 0, out);
  assert.equal(out.first, 60);
  assert.equal(out.count, 10); // 60 .. 150
  tapeTicks(20, 10, 50, 0, out);
  assert.equal(out.first, 0);
  assert.equal(out.count, 8); // 0 .. 70
  tapeTicks(-200, 100, 500, -1000, out);
  assert.equal(out.first, -700);
  assert.equal(out.count, 11);
  tapeTicks(NaN, 10, 50, 0, out);
  assert.equal(out.first, 0);
});

test('headings wrap across north', () => {
  assert.equal(headingDifference(10, 350), 20);
  assert.equal(headingDifference(350, 10), -20);
  assert.equal(headingDifference(180, 0), 180);
  assert.equal(headingDifference(90, 90), 0);
  assert.equal(headingDifference(NaN, 90), 0);
  assert.equal(headingText(7), '007');
  assert.equal(headingText(359.6), '000');
  assert.equal(headingText(-90), '270');
  assert.equal(headingTickLabel(360), 'N');
  assert.equal(headingTickLabel(90), 'E');
  assert.equal(headingTickLabel(-90), 'W');
  assert.equal(headingTickLabel(30), '03');
  assert.equal(headingTickLabel(330), '33');
});

test('the flight-path marker sits below the nose by the angle of attack', () => {
  const out = { x: 0, y: 0 };
  flightPathMarkerOffset(5, 0, 12, out);
  near(out.y, 60);
  near(out.x, 0);
  flightPathMarkerOffset(90, 1, 12, out);
  near(out.y, 240); // clamped to 20 degrees
  assert.ok(out.x < 0);
});

test('warnings: stall, pull up, overspeed, gear, autopilot off', () => {
  const out = { stall: false, pullUp: false, overspeed: false, gear: false, apOff: false, any: false };
  flightWarnings(makeReadout(), { retractableGear: true, apOffSeconds: Infinity }, out);
  assert.equal(out.any, false);
  flightWarnings(makeReadout({ stallWarning: true }), {}, out);
  assert.equal(out.stall, true);
  flightWarnings(makeReadout({ stallWarning: true, onGround: true }), {}, out);
  assert.equal(out.stall, false, 'no stall warning on the ground');
  // 600 ft, sinking 6,000 ft/min: six seconds to the ground.
  flightWarnings(makeReadout({ radarAltitudeFeet: 600, verticalSpeedFpm: -6000 }), {}, out);
  assert.equal(out.pullUp, true);
  // A normal approach never warns.
  flightWarnings(makeReadout({ radarAltitudeFeet: 50, verticalSpeedFpm: -600 }), {}, out);
  assert.equal(out.pullUp, false);
  flightWarnings(makeReadout({ radarAltitudeFeet: 2400, verticalSpeedFpm: -3000 }), {}, out);
  assert.equal(out.pullUp, false, '48 seconds to the ground');
  flightWarnings(makeReadout({ overspeed: true }), {}, out);
  assert.equal(out.overspeed, true);
  const low = makeReadout({ radarAltitudeFeet: 400, airspeedKnots: 70, gearDown: false, verticalSpeedFpm: -400 });
  flightWarnings(low, { retractableGear: true }, out);
  assert.equal(out.gear, true);
  flightWarnings(low, { retractableGear: false }, out);
  assert.equal(out.gear, false, 'fixed gear never warns');
  flightWarnings({ ...low, gearInTransit: true }, { retractableGear: true }, out);
  assert.equal(out.gear, false);
  flightWarnings(makeReadout(), { apOffSeconds: 1 }, out);
  assert.equal(out.apOff, true);
  flightWarnings(makeReadout(), { apOffSeconds: 9 }, out);
  assert.equal(out.apOff, false);
});

test('the autopilot line reads like the design', () => {
  assert.equal(autopilotLine(makeReadout().autopilot), '');
  const ap = makeReadout({ autopilot: { engaged: true, lateral: 'HDG', vertical: 'ALT', headingDegrees: 270, altitudeFeet: 12000 } }).autopilot;
  assert.equal(autopilotLine(ap), 'AP HDG 270 | ALT 12,000');
  assert.equal(autopilotLine({ ...ap, vertical: 'VS', verticalSpeedFpm: 800 }), 'AP HDG 270 | VS +800');
  assert.equal(autopilotLine({ ...ap, lateral: 'NAV', routeDistanceNm: 3.24, autoThrottle: true, speedKnots: 250 }), 'AP NAV 3.2 nm | ALT 12,000 | A/THR 250');
  assert.equal(autopilotLine({ ...ap, lateral: 'NAV', routeDistanceNm: null }), 'AP NAV -- nm | ALT 12,000');
  assert.equal(autopilotLine({ ...ap, engaged: false, autoThrottle: true, speedKnots: 300 }), 'A/THR 300');
  assert.equal(thousands(1234567), '1,234,567');
  assert.equal(thousands(-1500), '-1,500');
  assert.equal(thousands(999), '999');
});

test('the cockpit view picks the reduced HUD', () => {
  assert.equal(hudModeFor('chase', 'analog_six'), 'full');
  assert.equal(hudModeFor('outside', 'glass_four'), 'full');
  assert.equal(hudModeFor('cockpit', 'analog_six'), 'annunciator');
  assert.equal(hudModeFor('cockpit', 'glass_four'), 'combiner');
  assert.equal(hudModeFor('cockpit', 'analog_gauges'), 'combiner');
  assert.equal(hudModeFor('cockpit', null), 'full', 'no cockpit modelled: the full HUD');
  assert.equal(hudModeFor(null, 'glass_four'), 'full');
});

test('the painter draws every mode and survives extreme readouts', () => {
  const warnings = { stall: true, pullUp: true, overspeed: true, gear: true, apOff: true, any: true };
  const readouts = [makeReadout(), ...Object.values(EXTREME_READOUTS).map((make) => make())];
  for (const mode of ['full', 'combiner', 'annunciator']) {
    for (const readout of readouts) {
      const ctx = createRecordingContext();
      const options = { mode, warnings, flash: true, jet: readout.maxMach > 1, waypointBearing: 45, autopilotText: autopilotLine(readout.autopilot), retractableGear: true, flapSteps: 4 };
      paintFlightHud(ctx, readout, frame(), options);
      assert.ok(ctx.calls.length > 10);
      assert.ok(ctx.texts.includes('STALL') && ctx.texts.includes('PULL UP') && ctx.texts.includes('OVERSPEED') && ctx.texts.includes('GEAR') && ctx.texts.includes('AP OFF'));
      assert.ok(ctx.texts.includes(readout.mode === 'realistic' ? 'REALISTIC' : 'CASUAL'));
    }
  }
  // The full HUD shows the readings; the annunciator line does not draw the tapes.
  const full = createRecordingContext();
  const quiet = { stall: false, pullUp: false, overspeed: false, gear: false, apOff: false, any: false };
  const readout = makeReadout({ headingDegrees: 270, altitudeFeet: 12340, airspeedKnots: 250, mach: 0.82, autopilot: { engaged: true, lateral: 'HDG', vertical: 'ALT', headingDegrees: 270, altitudeFeet: 12000 } });
  paintFlightHud(full, readout, frame(), { mode: 'full', warnings: quiet, flash: true, jet: true, waypointBearing: null, autopilotText: autopilotLine(readout.autopilot), retractableGear: true, flapSteps: 2 });
  for (const expected of ['270', '250', '12,340', 'M 0.82', 'W', 'AP HDG 270 | ALT 12,000', 'GEAR DN', 'G 1.0']) {
    assert.ok(full.texts.includes(expected), `the HUD shows ${expected}`);
  }
  assert.ok(!full.texts.includes('STALL'));
  const line = createRecordingContext();
  paintFlightHud(line, readout, frame(), { mode: 'annunciator', warnings: quiet, flash: true, jet: false, waypointBearing: null, autopilotText: '', retractableGear: false, flapSteps: 4 });
  assert.ok(!line.texts.includes('12,340'));
  assert.ok(line.texts.includes('CASUAL') && line.texts.includes('FLAPS 0'));
  assert.ok(!line.texts.some((text) => text.startsWith('GEAR')), 'fixed gear has no gear annunciator');
  // Warnings blink: nothing in the dark half of the flash.
  const dark = createRecordingContext();
  paintFlightHud(dark, readout, frame(), { mode: 'full', warnings: { ...quiet, stall: true }, flash: false, jet: true, waypointBearing: null, autopilotText: '', retractableGear: true, flapSteps: 2 });
  assert.ok(!dark.texts.includes('STALL'));
});

test('a road route is thinned to long legs and always ends at the destination', () => {
  // 3 km east along a road in 50 m steps, then 2 km south.
  const points = [];
  for (let x = 0; x <= 3000; x += 50) points.push(x, 0);
  for (let z = 50; z <= 2000; z += 50) points.push(3000, z);
  const out = new Float32Array(48);
  const count = simplifyRouteForFlight(points, points.length / 2, 450, out);
  assert.ok(count >= 2 && count <= 8, `a few legs, got ${count}`);
  assert.equal(out[(count - 1) * 2], 3000);
  assert.equal(out[(count - 1) * 2 + 1], 2000);
  let px = 0;
  let pz = 0;
  for (let i = 0; i < count - 1; i += 1) {
    assert.ok(Math.hypot(out[i * 2] - px, out[i * 2 + 1] - pz) >= 450);
    px = out[i * 2];
    pz = out[i * 2 + 1];
  }
  assert.equal(simplifyRouteForFlight([5, 6], 1, 450, out), 1);
  assert.equal(out[0], 5);
});

test('the route feed changes only when the autopilot should hear of it', () => {
  const feed = createFlightRouteFeed();
  assert.equal(feed.refresh(null, null, false), false);
  // A waypoint with no road route: one direct leg.
  assert.equal(feed.refresh(null, { x: 100, z: -400 }, false), true);
  assert.deepEqual(feed.legs, [{ x: 100, z: -400 }]);
  assert.equal(feed.refresh(null, { x: 100, z: -400 }, false), false);
  // A road route to the same place replaces it, then stays while NAV flies it.
  const route = { points: new Float32Array([0, 0, 600, 0, 600, -400, 100, -400]), count: 4 };
  assert.equal(feed.refresh(route, { x: 100, z: -400 }, false), true);
  assert.equal(feed.legs.at(-1).x, 100);
  assert.equal(feed.flat.count, feed.legs.length);
  assert.equal(feed.refresh(route, { x: 100, z: -400 }, true), false);
  // Recomputed from a new position: fed again while NAV is off, kept while it is on.
  const moved = { points: new Float32Array([900, 300, 600, 0, 600, -400, 100, -400]), count: 4 };
  assert.equal(feed.refresh(moved, { x: 100, z: -400 }, true), false);
  assert.equal(feed.refresh(moved, { x: 100, z: -400 }, false), true);
  // A new destination always goes through; clearing the waypoint clears the route.
  assert.equal(feed.refresh(null, { x: -2000, z: 50 }, true), true);
  assert.deepEqual(feed.legs, [{ x: -2000, z: 50 }]);
  assert.equal(feed.refresh(null, null, true), true);
  assert.deepEqual(feed.legs, []);
  assert.equal(feed.destination, null);
});

test('bearings follow the map: -Z is north, +X east', () => {
  near(bearingDegrees(0, 0, 0, -100), 0);
  near(bearingDegrees(0, 0, 100, 0), 90);
  near(bearingDegrees(0, 0, 0, 100), 180);
  near(bearingDegrees(0, 0, -100, 0), 270);
});

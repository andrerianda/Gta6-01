// The flight HUD: its layout maths (ladder, tapes, heading wrap, flight-path marker), the warning
// logic, the autopilot line, which HUD a view gets, the GPS route feed, and the painter run against
// a recording context in every mode and at extreme readouts.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COMMON_FLIGHT_SLOTS, LADDER, STRIP_CELLS, autopilotLine, firstLadderRung, flightPathMarkerOffset, flightScreenRectangles, flightScreenSlots,
  flightWarnings, headingDifference, headingText, headingTickLabel, hudFrame, hudModeFor, ladderRungPosition, overlappingRectangles,
  screenHudModeFor, screenHudParts, spacedThousands, stripCells, tapeTicks, thousands, topWarning,
} from '../../../game/src/flight/deck/flightHudLayout.js';
import { combinerGeometry, paintCombinerHud, paintFlightHud } from '../../../game/src/flight/deck/flightHudPainter.js';
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
  for (const mode of ['assisted', 'simulation', 'full', 'combiner', 'annunciator']) {
    for (const view of ['cockpit', 'chase', 'outside']) {
      for (const hasCombiner of [true, false]) {
        for (const readout of readouts) {
          const ctx = createRecordingContext();
          const options = { mode, view, hasCombiner, warnings, flash: true, jet: readout.maxMach > 1, waypointBearing: 45, autopilotText: autopilotLine(readout.autopilot), retractableGear: true, flapSteps: 4 };
          paintFlightHud(ctx, readout, frame(), options);
          assert.ok(ctx.calls.length > 5);
          // One warning word at a time, the most urgent.
          assert.ok(ctx.texts.includes('PULL UP'));
          assert.ok(!ctx.texts.includes('STALL') && !ctx.texts.includes('OVERSPEED') && !ctx.texts.includes('AP OFF'));
        }
      }
    }
  }
  const quiet = { stall: false, pullUp: false, overspeed: false, gear: false, apOff: false, any: false };
  const readout = makeReadout({ headingDegrees: 270, altitudeFeet: 12340, airspeedKnots: 250, mach: 0.82, verticalSpeedFpm: 800, autopilot: { engaged: true, lateral: 'HDG', vertical: 'ALT', headingDegrees: 270, altitudeFeet: 12000 } });
  const paint = (mode, view, hasCombiner, extra = {}) => {
    const ctx = createRecordingContext();
    paintFlightHud(ctx, readout, frame(), { mode, view, hasCombiner, warnings: quiet, flash: true, jet: true, waypointBearing: null, autopilotText: autopilotLine(readout.autopilot), retractableGear: true, flapSteps: 2, ...extra });
    return ctx;
  };
  const clips = (ctx) => ctx.calls.filter(([name]) => name === 'clip').length;

  // ASSISTED in the cockpit: only the two-line readout. No ladder, no boxes, no strip, no words.
  const clean = paint('assisted', 'cockpit', true);
  assert.deepEqual([...new Set(clean.texts)].sort(), ['12 340', '250', 'FT', 'KT']);
  assert.equal(clips(clean), 0, 'nothing clipped: no ladder, no horizon ball, no heading scale');
  assert.ok(!clean.calls.some(([name]) => name === 'rect' || name === 'arc' || name === 'lineTo'), 'no symbology strokes at all');

  // SIMULATION in the cockpit: the readout and one strip; still no ladder or boxes.
  const strip = paint('simulation', 'cockpit', true);
  for (const expected of ['250', 'KT', '12 340', 'FT', 'HDG', '270', 'VS', '+800', 'THR', '70%', 'FLAPS', 'GEAR', 'DN', 'AP', 'AP HDG 270 | ALT 12,000']) {
    assert.ok(strip.texts.includes(expected), `the strip shows ${expected}`);
  }
  assert.equal(clips(strip), 0);
  assert.ok(!strip.texts.includes('12,340') && !strip.texts.includes('M 0.82'), 'no boxed digits on the screen in the cockpit');

  // Outside the cockpit: ASSISTED adds the horizon ball, SIMULATION draws the restrained HUD instead of the readout.
  const ball = paint('assisted', 'chase', false);
  assert.ok(ball.texts.includes('KT') && ball.calls.some(([name]) => name === 'arc'));
  assert.equal(clips(ball), 1, 'only the ball is clipped');
  assert.ok(!ball.texts.includes('HDG'));
  const full = paint('simulation', 'chase', false);
  for (const expected of ['270', '250', '12,340', 'M 0.82', 'AP HDG 270 | ALT 12,000', 'HDG', 'DN']) {
    assert.ok(full.texts.includes(expected), `the HUD shows ${expected}`);
  }
  assert.ok(!full.texts.includes('KT'), 'the boxes replace the small readout');
  assert.ok(clips(full) >= 2, 'the ladder and the heading scale');
  // A cockpit view whose model has no combiner yet behaves as the chase view; `outside` too.
  assert.deepEqual(paint('simulation', 'cockpit', false).texts, full.texts);
  assert.deepEqual(paint('assisted', 'outside', false).texts, ball.texts);
  // A fixed gear and fixed flaps say so; nothing reads a gear position.
  const fixed = paint('simulation', 'cockpit', true, { retractableGear: false, flapSteps: 1 });
  assert.ok(fixed.texts.filter((text) => text === 'FIX').length >= 2 && !fixed.texts.includes('DN'));
  // Warnings blink: nothing in the dark half of the flash.
  const dark = paint('simulation', 'chase', false, { warnings: { ...quiet, stall: true }, flash: false });
  assert.ok(!dark.texts.includes('STALL'));
  assert.ok(paint('assisted', 'cockpit', true, { warnings: { ...quiet, stall: true } }).texts.includes('STALL'));
  assert.ok(paint('assisted', 'cockpit', true, { warnings: { ...quiet, gear: true, apOff: true } }).texts.includes('GEAR'));
});

test('the screen mode follows the flight mode, and the parts follow the view', () => {
  for (const view of ['cockpit', 'chase', 'outside', null]) {
    for (const cockpit of ['glass_four', 'analog_gauges', 'analog_six', null]) {
      assert.equal(screenHudModeFor(view, cockpit, 'casual'), 'assisted');
      assert.equal(screenHudModeFor(view, cockpit, 'realistic'), 'simulation');
      assert.equal(screenHudModeFor(view, cockpit, undefined), 'assisted');
    }
  }
  assert.deepEqual(screenHudParts('assisted', 'cockpit', true), { readout: true, horizon: false, strip: false, fullHud: false });
  assert.deepEqual(screenHudParts('simulation', 'cockpit', true), { readout: true, horizon: false, strip: true, fullHud: false });
  assert.deepEqual(screenHudParts('assisted', 'chase', false), { readout: true, horizon: true, strip: false, fullHud: false });
  assert.deepEqual(screenHudParts('simulation', 'chase', false), { readout: false, horizon: false, strip: true, fullHud: true });
  assert.deepEqual(screenHudParts('simulation', 'cockpit', false), screenHudParts('simulation', 'chase', false), 'no cockpit model: as the chase view');
  assert.deepEqual(screenHudParts('assisted', 'outside', true), screenHudParts('assisted', 'chase', false), 'a combiner counts only in the cockpit view');
  assert.equal(topWarning({ stall: true, gear: true }).text, 'STALL');
  assert.equal(topWarning({ pullUp: true, stall: true }).text, 'PULL UP');
  assert.equal(topWarning({}), null);
  assert.equal(spacedThousands(2450), '2 450');
  assert.equal(spacedThousands(45000), '45 000');
  assert.equal(spacedThousands(286), '286');
});

test('the flight screen has a slot for everything and no two slots overlap', () => {
  const sizes = [[1280, 800], [768, 480], [1280, 720], [1920, 1080], [1024, 768], [2560, 1440]];
  for (const [width, height] of sizes) {
    for (const mode of ['assisted', 'simulation']) {
      for (const [view, hasCombiner] of [['cockpit', true], ['cockpit', false], ['chase', false], ['outside', false]]) {
        const rectangles = flightScreenRectangles(width, height, mode, view, hasCombiner);
        assert.deepEqual(overlappingRectangles(rectangles), [], `${width}x${height} ${mode} ${view}`);
        for (const r of rectangles) {
          assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= width && r.y + r.h <= height, `${r.name} is on the screen at ${width}x${height}`);
          assert.ok(r.w > 0 && r.h > 0);
        }
        const names = rectangles.map((r) => r.name);
        for (const name of COMMON_FLIGHT_SLOTS) assert.ok(names.includes(name));
        assert.equal(names.includes('ladder'), mode === 'simulation' && !hasCombiner);
        assert.equal(names.includes('strip'), mode === 'simulation');
        assert.equal(names.includes('readout'), !(mode === 'simulation' && !hasCombiner));
        assert.equal(names.includes('horizon'), mode === 'assisted' && !hasCombiner);
      }
    }
    const s = flightScreenSlots(width, height);
    // The centre of the view stays free: nothing but the simulation's own ladder reaches it.
    const centre = { name: 'centre', x: width * 0.38, y: height * 0.34, w: width * 0.24, h: height * 0.24 };
    const blockers = flightScreenRectangles(width, height, 'simulation', 'cockpit', true).concat([centre]);
    assert.deepEqual(overlappingRectangles(blockers).filter((pair) => pair.includes('centre')), []);
    // The readout is in the lower right corner, the key hint above the minimap on the left, the subtitle above both.
    assert.ok(s.readout.x > width * 0.8 && s.readout.y > height * 0.85);
    assert.ok(s.keyHint.x + s.keyHint.w < width * 0.3 && s.keyHint.y + s.keyHint.h < s.minimap.y);
    assert.ok(s.subtitle.y + s.subtitle.h < Math.min(s.minimap.y, s.readout.y, s.strip.y, s.banner.y));
    assert.ok(s.type >= 15 && s.stripType >= 11, 'readable at 768x480');
  }
  assert.deepEqual(overlappingRectangles([{ name: 'a', x: 0, y: 0, w: 10, h: 10 }, { name: 'b', x: 5, y: 5, w: 10, h: 10 }, { name: 'c', x: 10, y: 0, w: 5, h: 5 }]), ['a+b']);
});

test('the simulation strip is six cells: heading, vertical speed, throttle, flaps, gear, autopilot', () => {
  const cells = Array.from({ length: STRIP_CELLS }, () => ({ label: '', value: '', level: '' }));
  const read = (readout, craft) => stripCells(readout, craft, cells).map((cell) => `${cell.label} ${cell.value}`);
  assert.deepEqual(read(makeReadout({ headingDegrees: 7, verticalSpeedFpm: -1234, flapsDegrees: 20 }), { retractableGear: true, flapSteps: 3 }),
    ['HDG 007', 'VS -1250', 'THR 70%', 'FLAPS 20', 'GEAR DN', 'AP OFF']);
  assert.deepEqual(read(EXTREME_READOUTS.machThree(), { retractableGear: true, flapSteps: 2 }).slice(2), ['A/B 100%', 'FLAPS 0', 'GEAR UP', 'AP NAV']);
  assert.deepEqual(read(EXTREME_READOUTS.broken(), { retractableGear: false, flapSteps: 1 }), ['HDG 000', 'VS 0', 'THR 70%', 'FLAPS FIX', 'GEAR FIX', 'AP OFF']);
  assert.equal(read(makeReadout({ gearInTransit: true }), { retractableGear: true })[4], 'GEAR ---');
  assert.equal(read(makeReadout({ autopilot: { autoThrottle: true } }), {})[5], 'AP A/THR');
});

test('the combiner glass: bold green symbols inside its margin, conformal with the glass', () => {
  const g = combinerGeometry(512, 448, 14);
  assert.equal(g.pixelsPerDegree, 32);
  assert.ok(g.text >= 34, 'text of at least 34 px on the 512 canvas');
  const boxes = ['heading', 'speed', 'altitude', 'ladder', 'warning'].map((name) => ({ name, ...g[name] }));
  assert.deepEqual(overlappingRectangles(boxes), []);
  for (const box of boxes) {
    assert.ok(box.x >= g.margin && box.y >= g.margin && box.x + box.w <= 512 - g.margin && box.y + box.h <= 448 - g.margin, `${box.name} keeps off the edges`);
  }
  assert.ok(g.speed.x < g.ladder.x && g.altitude.x > g.ladder.x + g.ladder.w, 'speed left, altitude right');
  assert.equal(combinerGeometry(256, 224, 7).pixelsPerDegree, 32);
  assert.ok(combinerGeometry(512, 448).pixelsPerDegree > 20, 'a default field without degreesTall');

  const warnings = { stall: true, pullUp: false, overspeed: false, gear: false, apOff: false, any: true };
  for (const readout of [makeReadout(), ...Object.values(EXTREME_READOUTS).map((make) => make())]) {
    const ctx = createRecordingContext();
    paintCombinerHud(ctx, readout, 512, 448, { degreesTall: 14, warnings, flash: true });
    assert.equal(ctx.calls[0][0], 'clearRect');
    assert.ok(ctx.texts.includes('STALL'));
    assert.ok(ctx.lineWidth >= 2 && ctx.lineWidth <= 3, 'crisp 2-3 px lines');
    // Every text and line stays on the canvas, off its edges, in canvas coordinates outside rotations.
    const fonts = ctx.calls.filter(([name]) => name === 'fillText');
    assert.ok(fonts.length >= 4, 'heading, speed, altitude and the warning');
  }
  const ctx = createRecordingContext();
  const readout = makeReadout({ headingDegrees: 276, altitudeFeet: 2450, airspeedKnots: 286, pitchDegrees: 4, rollDegrees: 12 });
  paintCombinerHud(ctx, readout, 512, 448, { degreesTall: 14, warnings: { ...warnings, stall: false }, flash: true });
  for (const expected of ['276', '286', '2450', '5']) assert.ok(ctx.texts.includes(expected), `the glass shows ${expected}`);
  assert.ok(!ctx.texts.includes('STALL'));
  assert.ok(String(ctx.font).includes('36px'));
  // No options at all still paints.
  paintCombinerHud(createRecordingContext(), readout, 512, 448);
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

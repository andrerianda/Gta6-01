// The cockpit panels: each painter run against a recording context (the needles move with the
// readout; nothing is thrown or drawn at a non-finite place at extreme values), the shared dial
// maths, the map display's projection and range, and the stealth-signature function.
import test from 'node:test';
import assert from 'node:assert/strict';
import { dialAngle } from '../../../game/src/flight/deck/gaugeDrawing.js';
import { paintTrainerSixPackPanel, trainerAirspeedAngle } from '../../../game/src/flight/deck/trainerSixPackPanel.js';
import { MAP_RANGES_NM, headingUpOffset, mapRangeFor, paintGlassCockpitPanel } from '../../../game/src/flight/deck/glassCockpitPanel.js';
import { SKIN_TEMPERATURE_LIMITS, paintAnalogJetPanel } from '../../../game/src/flight/deck/analogJetPanel.js';
import { SIGNATURE_DETECTED, stealthSignatureLabel, stealthSignatureOf } from '../../../game/src/flight/deck/stealthSignature.js';
import { EXTREME_READOUTS, createRecordingContext, makeReadout } from './flightDeckTestKit.mjs';

const near = (a, b, tolerance = 1e-6) => assert.ok(Math.abs(a - b) <= tolerance, `${a} is not within ${tolerance} of ${b}`);
const DEG = Math.PI / 180;
const paint = (painter, readout, extra) => {
  const ctx = createRecordingContext();
  const layout = { width: 1024, height: 512, trace: {} };
  painter(ctx, readout, layout, extra);
  return { trace: layout.trace, ctx };
};

test('a dial clamps to its scale and never returns NaN', () => {
  near(dialAngle(50, 0, 100, 0, 360), Math.PI);
  near(dialAngle(-20, 0, 100, 30, 300), 30 * DEG);
  near(dialAngle(500, 0, 100, 30, 300), 330 * DEG);
  near(dialAngle(NaN, 0, 100, 30, 300), 30 * DEG);
});

test('the trainer panel: every needle follows the readout', () => {
  const slow = paint(paintTrainerSixPackPanel, makeReadout({ airspeedKnots: 60 })).trace;
  const fast = paint(paintTrainerSixPackPanel, makeReadout({ airspeedKnots: 120 })).trace;
  assert.ok(fast.airspeed > slow.airspeed);
  near(slow.airspeed, trainerAirspeedAngle(60, 159));
  // Altimeter: 3,200 ft puts the long hand on 2 and the short hand just past 3.
  const cruise = paint(paintTrainerSixPackPanel, makeReadout({ altitudeFeet: 3200 })).trace;
  near(cruise.altimeterHundreds, 0.2 * Math.PI * 2, 1e-9);
  near(cruise.altimeterThousands, 0.32 * Math.PI * 2, 1e-9);
  // Vertical speed: zero at nine o'clock, a climb above it, a descent below.
  const level = paint(paintTrainerSixPackPanel, makeReadout({ verticalSpeedFpm: 0 })).trace.verticalSpeed;
  const climb = paint(paintTrainerSixPackPanel, makeReadout({ verticalSpeedFpm: 700 })).trace.verticalSpeed;
  const sink = paint(paintTrainerSixPackPanel, makeReadout({ verticalSpeedFpm: -700 })).trace.verticalSpeed;
  near(level, 270 * DEG, 1e-9);
  assert.ok(climb > level && sink < level);
  // Turn coordinator: standard rate (0.5) meets the 20 degree mark; the ball follows the slip.
  const turn = paint(paintTrainerSixPackPanel, makeReadout({ turnNeedle: 0.5, slipBall: -0.4 })).trace;
  near(turn.turn, 20 * DEG, 1e-9);
  near(turn.slipBall, -0.4);
  // Heading card turns against the heading; attitude traces pitch and roll.
  const east = paint(paintTrainerSixPackPanel, makeReadout({ headingDegrees: 90, pitchDegrees: 8, rollDegrees: -25 })).trace;
  near(east.heading, -90 * DEG);
  near(east.attitudePitch, 8 * DEG);
  near(east.attitudeRoll, -25 * DEG);
  // Engine and systems.
  const idle = paint(paintTrainerSixPackPanel, makeReadout({ rpmPercent: 25, fuelPercent: 20, flapsDegrees: 30, trimPercent: -50, throttlePercent: 0 })).trace;
  const full = paint(paintTrainerSixPackPanel, makeReadout({ rpmPercent: 100, fuelPercent: 90, flapsDegrees: 0, trimPercent: 50, throttlePercent: 100 })).trace;
  assert.ok(full.tachometer > idle.tachometer && full.fuel > idle.fuel && full.throttle > idle.throttle);
  near(idle.flaps, 1);
  near(full.flaps, 0);
  near(idle.trim, -0.5);
  near(full.trim, 0.5);
});

test('the trainer panel shows its annunciators and labels', () => {
  const { ctx } = paint(paintTrainerSixPackPanel, makeReadout({ stallWarning: true, mode: 'realistic' }));
  for (const text of ['STALL', 'AIRSPEED', 'ALT', 'VERT SPEED', 'RPM', 'FUEL', 'FLAPS', 'TRIM', 'MASTER', 'SIMULATION', 'N', 'E', 'S', 'W']) {
    assert.ok(ctx.texts.includes(text), `the panel shows ${text}`);
  }
  // The stall lamp is lit in red: its fill was set just before its box.
  const fills = ctx.calls.filter((call) => call[0] === 'fillRect');
  assert.ok(fills.length > 10);
});

test('the glass cockpit: four displays, a route on the map, contacts on the radar', () => {
  const route = { points: new Float32Array([0, -3000, 4000, -3000]), count: 2 };
  const extra = { position: { x: 0, z: 0 }, route, contacts: [{ bearingDegrees: 30, distanceNm: 8 }, { bearingDegrees: 200, distanceNm: 15, hostile: false }], timeSeconds: 3 };
  const readout = makeReadout({ headingDegrees: 0, mach: 0.6, altitudeFeet: 30000, radarAltitudeFeet: 8200, gearDown: false, autopilot: { engaged: true, lateral: 'NAV', vertical: 'ALT', routeDistanceNm: 2.7 } });
  const { trace, ctx } = paint(paintGlassCockpitPanel, readout, extra);
  assert.equal(trace.radarContacts, 2);
  assert.ok(MAP_RANGES_NM.includes(trace.mapRange));
  // The destination is 4 km east and 3 km north: right of and ahead of the own-ship symbol.
  assert.ok(trace.mapTargetX > 0 && trace.mapTargetY < 0);
  near(trace.engineRpm, 0.85);
  near(trace.fuel, 0.8);
  near(trace.pfdPitch, 2 * DEG);
  for (const text of ['ENGINES', 'FUEL', 'SEARCH 20 NM', '2 PURSUING', 'SIG', 'HDG 000', '2.7 NM', 'AP NAV ALT', 'GEAR UP', 'NO CAUTIONS']) {
    assert.ok(ctx.texts.includes(text), `the displays show ${text}`);
  }
  // Without a route or contacts it says so; with trouble it lists cautions.
  const bare = paint(paintGlassCockpitPanel, makeReadout({ stallWarning: true, fuelPercent: 8, overspeed: true }), { hatchOpen: true });
  assert.ok(bare.ctx.texts.includes('NO ROUTE') && bare.ctx.texts.includes('NO PURSUIT'));
  for (const text of ['STALL', 'OVERSPEED', 'FUEL LOW', 'HATCH OPEN', 'AP OFF']) assert.ok(bare.ctx.texts.includes(text), `caution ${text}`);
  assert.equal(bare.trace.cautions, 5);
  // And with no extra at all.
  paint(paintGlassCockpitPanel, makeReadout());
});

test('the map is heading-up and picks a range that holds the destination', () => {
  const out = { x: 0, y: 0 };
  headingUpOffset(0, -1000, 0, 0.1, out); // north of us, heading north: straight up
  near(out.x, 0, 1e-9);
  near(out.y, -100, 1e-9);
  headingUpOffset(1000, 0, 0, 0.1, out); // east of us, heading north: to the right
  near(out.x, 100, 1e-9);
  near(out.y, 0, 1e-9);
  headingUpOffset(1000, 0, 90, 0.1, out); // east of us, heading east: straight up
  near(out.x, 0, 1e-9);
  near(out.y, -100, 1e-9);
  headingUpOffset(0, -1000, 90, 0.1, out); // north of us, heading east: to the left
  near(out.x, -100, 1e-9);
  assert.equal(mapRangeFor(1000), 2);
  assert.equal(mapRangeFor(6000), 5);
  assert.equal(mapRangeFor(30000), 20);
  assert.equal(mapRangeFor(9e6), 40);
});

test('the analog jet panel: Mach, skin temperature and the engines follow the readout', () => {
  const slow = paint(paintAnalogJetPanel, makeReadout({ mach: 0.8, skinTemperatureC: 10, rpmPercent: 60, engineTemperatureC: 500, maxMach: 3.2, altitudeFeet: 20000 })).trace;
  const fast = paint(paintAnalogJetPanel, makeReadout({ mach: 3.0, skinTemperatureC: 300, rpmPercent: 100, engineTemperatureC: 850, maxMach: 3.2, altitudeFeet: 78000 })).trace;
  assert.ok(fast.mach > slow.mach);
  assert.ok(fast.skinTemperature > slow.skinTemperature);
  assert.ok(fast.rpmLeft > slow.rpmLeft && fast.rpmRight > slow.rpmRight);
  assert.ok(fast.egtLeft > slow.egtLeft && fast.egtRight > slow.egtRight);
  near(slow.altimeterThousands, 0, 1e-9); // 20,000 ft: the thousands hand back on 0
  near(slow.altimeterTenThousands, 0.2 * Math.PI * 2, 1e-9);
  near(fast.altimeterTenThousands, 0.78 * Math.PI * 2, 1e-9);
  assert.ok(SKIN_TEMPERATURE_LIMITS.limit === 320 && SKIN_TEMPERATURE_LIMITS.caution < SKIN_TEMPERATURE_LIMITS.limit);
  // Caution lights.
  const calm = paint(paintAnalogJetPanel, makeReadout({ gearDown: false })).trace.lampsLit;
  const hot = paint(paintAnalogJetPanel, makeReadout({ skinTemperatureC: 340, afterburner: true, overspeed: true, gearDown: false })).trace.lampsLit;
  assert.equal(calm, 0);
  assert.equal(hot, 3);
  const { ctx } = paint(paintAnalogJetPanel, makeReadout({ mach: 2.5 }));
  for (const text of ['MACH', '2.50', 'SKIN °C', 'EGT L', 'EGT R', 'RPM L', 'RPM R', 'FUEL', 'SKIN HOT', 'BURNER']) {
    assert.ok(ctx.texts.includes(text), `the panel shows ${text}`);
  }
});

test('no panel throws or draws at a non-finite place at extreme values', () => {
  const extra = { position: { x: 12000, z: -9000 }, route: { points: new Float32Array([0, 0, 50000, -80000]), count: 2 }, contacts: [{ bearingDegrees: 720, distanceNm: 900 }], hatchOpen: true, timeSeconds: 1e6 };
  for (const [name, make] of Object.entries(EXTREME_READOUTS)) {
    for (const painter of [paintTrainerSixPackPanel, paintGlassCockpitPanel, paintAnalogJetPanel]) {
      for (const size of [[1024, 512], [2048, 512], [256, 512]]) {
        const ctx = createRecordingContext();
        const layout = { width: size[0], height: size[1], trace: {} };
        assert.doesNotThrow(() => painter(ctx, make(), layout, extra), `${painter.name} with the ${name} readout at ${size.join('x')}`);
        for (const [key, value] of Object.entries(layout.trace)) assert.ok(Number.isFinite(value), `${painter.name} ${key} is finite (${name})`);
      }
    }
  }
});

test('the stealth signature: low, slow, level and closed is quiet', () => {
  const quiet = stealthSignatureOf(makeReadout({ radarAltitudeFeet: 300, mach: 0.5, rollDegrees: 0, gearDown: false }));
  assert.ok(quiet < 0.15, `quiet at 300 ft, got ${quiet}`);
  assert.equal(stealthSignatureLabel(quiet), 'HIDDEN');
  const high = stealthSignatureOf(makeReadout({ radarAltitudeFeet: 8200, mach: 0.5, gearDown: false }));
  assert.ok(high > quiet + 0.3 && high < SIGNATURE_DETECTED, 'height shows more, but level cruise is not tracked');
  const banked = stealthSignatureOf(makeReadout({ radarAltitudeFeet: 8200, mach: 0.5, rollDegrees: -60, gearDown: false }));
  assert.ok(banked > high && banked >= SIGNATURE_DETECTED, 'a steep bank at height exposes the planform');
  assert.equal(stealthSignatureOf(makeReadout({ radarAltitudeFeet: 300, mach: 0.5, rollDegrees: 60, gearDown: false })),
    stealthSignatureOf(makeReadout({ radarAltitudeFeet: 300, mach: 0.5, rollDegrees: -60, gearDown: false })));
  const fast = stealthSignatureOf(makeReadout({ radarAltitudeFeet: 300, mach: 0.9, gearDown: false }));
  assert.ok(fast > quiet);
  const gear = stealthSignatureOf(makeReadout({ radarAltitudeFeet: 300, mach: 0.5, gearDown: true }));
  near(gear - quiet, 0.3);
  const hatch = stealthSignatureOf(makeReadout({ radarAltitudeFeet: 300, mach: 0.5, gearDown: false }), { hatchOpen: true });
  near(hatch - quiet, 0.25);
  assert.equal(stealthSignatureOf(makeReadout({ onGround: true })), 1);
  const worst = stealthSignatureOf(makeReadout({ radarAltitudeFeet: 8200, mach: 0.95, rollDegrees: 80, gearDown: true, afterburner: true }), { hatchOpen: true });
  assert.equal(worst, 1);
  assert.equal(stealthSignatureLabel(worst), 'TRACKED');
  assert.equal(stealthSignatureLabel(SIGNATURE_DETECTED), 'EXPOSED');
  assert.equal(stealthSignatureLabel(0.4), 'LOW');
  assert.ok(Number.isFinite(stealthSignatureOf(makeReadout({ radarAltitudeFeet: NaN, mach: NaN, rollDegrees: NaN }))));
});

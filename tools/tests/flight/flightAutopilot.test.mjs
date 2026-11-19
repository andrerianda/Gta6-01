// The autopilot flown in the physics world: HDG, ALT, VS, NAV along a route and the jets'
// auto-throttle, plus when it engages and when it lets go.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createAutopilotState, engageAutopilot, selectAutopilotMode, updateAutopilot, wrapAngle,
} from '../../../game/src/flight/flightAutopilot.js';
import { AIRCRAFT_IDS, createFlightBench, fly, positionOf } from './flightTestBench.mjs';

const within = (actual, low, high, what) => assert.ok(actual >= low && actual <= high, `${what}: ${actual} is not in ${low} .. ${high}`);
const DEGREE = Math.PI / 180;

test('it refuses to engage on the ground and takes the present heading and altitude in the air', () => {
  const parked = createFlightBench('gaviota_t2');
  fly(parked, 1);
  assert.equal(parked.plane.engageAutopilot(), false);
  assert.equal(parked.plane.setAutopilotMode('ALT'), false);
  assert.equal(parked.plane.autopilot.engaged, false);

  const bench = createFlightBench('gaviota_t2', { y: 800, heading: 1.2 });
  assert.equal(bench.plane.engageAutopilot(), true);
  const autopilot = bench.plane.autopilot;
  assert.deepEqual([autopilot.engaged, autopilot.lateral, autopilot.vertical, autopilot.autoThrottle], [true, 'HDG', 'ALT', false]);
  within(autopilot.targetHeading, 1.19, 1.21, 'target heading');
  within(autopilot.targetAltitude, 799, 801, 'target altitude');
});

for (const id of AIRCRAFT_IDS) {
  test(`${id}: holds heading and altitude steadily at cruise`, () => {
    const bench = createFlightBench(id, { y: 3000, heading: 2 });
    bench.plane.engageAutopilot();
    let worstRoll = 0;
    fly(bench, 120, (plane, time) => { if (time > 20) worstRoll = Math.max(worstRoll, Math.abs(plane.state.roll)); });
    const s = bench.plane.state;
    within(Math.abs(s.altitude - 3000), 0, 6, 'altitude error, m');
    within(Math.abs(wrapAngle(s.heading - 2)) / DEGREE, 0, 1, 'heading error, degrees');
    within(worstRoll / DEGREE, 0, 1.5, 'roll, degrees');
    within(Math.abs(s.verticalSpeed), 0, 0.6, 'vertical speed, m/s');
    assert.ok(bench.plane.autopilot.engaged);
  });
}

test('HDG turns the shortest way round with at most 25 degrees of bank and captures the heading', () => {
  for (const [turn, side] of [[90, 1], [-90, -1], [190, -1], [-200, 1]]) {
    const bench = createFlightBench('gaviota_t2', { y: 800, heading: 0.5 });
    bench.plane.setAutopilotMode('HDG');
    const target = 0.5 + turn * DEGREE;
    bench.plane.autopilot.targetHeading = target;
    let steepest = 0;
    let wrongWay = 0;
    fly(bench, 110, (plane) => {
      const roll = plane.state.roll;
      steepest = Math.max(steepest, Math.abs(roll));
      wrongWay = Math.max(wrongWay, -roll * side);
    });
    const s = bench.plane.state;
    within(steepest / DEGREE, 18, 27, `bank for a ${turn} degree turn`);
    within(wrongWay / DEGREE, 0, 2, `never banks away from the shortest way (${turn})`);
    within(Math.abs(wrapAngle(s.heading - target)) / DEGREE, 0, 1.5, `heading captured (${turn}), degrees off`);
    within(Math.abs(s.roll) / DEGREE, 0, 2, 'wings level at the end');
    within(Math.abs(s.altitude - 800), 0, 12, 'altitude kept in the turn, m');
  }
});

test('ALT climbs or descends to the selected altitude and holds it', () => {
  for (const change of [300, -300]) {
    const bench = createFlightBench('gaviota_t2', { y: 1000 });
    bench.plane.setAutopilotMode('ALT');
    bench.plane.autopilot.targetAltitude = 1000 + change;
    let furthest = 0;
    fly(bench, 220, (plane) => {
      plane.input.throttle = 0.9;
      furthest = Math.max(furthest, (plane.state.altitude - 1000) * Math.sign(change));
    });
    within(Math.abs(bench.plane.state.altitude - (1000 + change)), 0, 5, `captured ${change}, m off`);
    within(furthest, 295, 315, 'overshoot, m');
    within(Math.abs(bench.plane.state.verticalSpeed), 0, 0.5, 'level, m/s');
  }
});

test('VS holds the selected vertical speed', () => {
  for (const [id, rate] of [['gaviota_t2', 2], ['gaviota_t2', -3], ['manta_sombra', 12], ['manta_sombra', -10]]) {
    const bench = createFlightBench(id, { y: 2000 });
    assert.equal(bench.plane.setAutopilotMode('VS'), true);
    assert.equal(bench.plane.autopilot.vertical, 'VS');
    within(Math.abs(bench.plane.autopilot.targetVerticalSpeed), 0, 0.5, 'VS starts from the present vertical speed');
    bench.plane.autopilot.targetVerticalSpeed = rate;
    fly(bench, 40, (plane) => { plane.input.throttle = rate > 0 ? 1 : 0.5; });
    within(bench.plane.state.verticalSpeed, rate - 0.4, rate + 0.4, `${id} vertical speed, m/s`);
    within((bench.plane.state.altitude - 2000) / (rate * 40), 0.8, 1.1, 'share of the height the rate should have gained');
  }
});

test('NAV follows a dog-leg route leg by leg and holds the last course at the end', () => {
  for (const wind of [null, { x: -7, z: 3 }]) {
    const bench = createFlightBench('gaviota_t2', { y: 600, heading: 0, wind });
    const route = [{ x: 0, z: -2500 }, { x: 2500, z: -2500 }, { x: 2500, z: -5500 }];
    assert.equal(bench.plane.setAutopilotMode('NAV'), false, 'NAV needs a route');
    bench.plane.setAutopilotRoute(route);
    assert.equal(bench.plane.setAutopilotMode('NAV'), true);
    assert.equal(bench.plane.autopilot.lateral, 'NAV');
    let offSecondLeg = 0;
    let offThirdLeg = 0;
    let passed = 0;
    const seconds = fly(bench, 260, (plane) => {
      const at = positionOf(plane);
      const autopilot = plane.autopilot;
      passed = Math.max(passed, autopilot.routeIndex);
      // Established on a leg: its middle part, clear of the turns at both ends.
      if (autopilot.routeIndex === 1 && at.x > 900 && at.x < 1700) offSecondLeg = Math.max(offSecondLeg, Math.abs(at.z + 2500));
      if (autopilot.routeIndex === 2 && at.z < -3600 && at.z > -5000) offThirdLeg = Math.max(offThirdLeg, Math.abs(at.x - 2500));
      return autopilot.lateral === 'HDG';
    });
    const label = wind ? 'with a crosswind' : 'calm';
    assert.ok(seconds < 260, `${label}: the route ends`);
    assert.equal(passed, 3, 'every waypoint was passed');
    assert.equal(bench.plane.autopilot.routeIndex, 3);
    assert.ok(offSecondLeg > 0 && offThirdLeg > 0, 'both legs were flown');
    within(offSecondLeg, 0, 45, `${label}: metres off the second leg`);
    within(offThirdLeg, 0, 45, `${label}: metres off the third leg`);
    const end = positionOf(bench.plane);
    within(Math.hypot(end.x - 2500, end.z + 5500), 0, 260, `${label}: metres from the last waypoint when NAV ends`);
    within(Math.abs(wrapAngle(bench.plane.autopilot.targetHeading)) / DEGREE, 0, 0.01, 'it holds the last leg\'s course (north)');
    within(Math.abs(bench.plane.state.altitude - 600), 0, 15, 'altitude kept, m');
    // Taking the route away in NAV falls back to HDG.
    bench.plane.setAutopilotRoute(route);
    bench.plane.setAutopilotMode('NAV');
    bench.plane.setAutopilotRoute(null);
    assert.equal(bench.plane.autopilot.lateral, 'HDG');
  }
});

test('the auto-throttle holds an indicated airspeed on the jets and does not exist on the trainer', () => {
  const trainer = createFlightBench('gaviota_t2', { y: 800 });
  assert.equal(trainer.plane.setAutopilotMode('ATHR'), false);
  assert.equal(trainer.plane.autopilot.autoThrottle, false);

  for (const [id, speed] of [['manta_sombra', 150], ['manta_sombra', 220], ['halcon', 190], ['garza_negra', 200]]) {
    const bench = createFlightBench(id, { y: 4000 });
    assert.equal(bench.plane.setAutopilotMode('ATHR'), true);
    assert.equal(bench.plane.autopilot.autoThrottle, true);
    bench.plane.autopilot.targetSpeed = speed;
    fly(bench, 240);
    const s = bench.plane.state;
    within(s.indicatedAirspeed, speed - 3, speed + 3, `${id} indicated airspeed, m/s`);
    within(Math.abs(s.altitude - 4000), 0, 10, `${id} altitude, m`);
    assert.ok(s.throttle > 0.02 && s.throttle < 1, 'on a part throttle');
    // Toggling it hands the lever back.
    assert.equal(bench.plane.setAutopilotMode('ATHR'), false);
    assert.equal(bench.plane.autopilot.autoThrottle, false);
    assert.ok(bench.plane.autopilot.engaged, 'the autopilot itself stays in');
  }
});

test('a firm stick input or a stall disengages it; a nudge does not', () => {
  const bench = createFlightBench('gaviota_t2', { y: 800 });
  bench.plane.engageAutopilot();
  fly(bench, 2, (plane) => { plane.input.roll = 0.3; plane.input.pitch = -0.3; });
  assert.ok(bench.plane.autopilot.engaged, 'still engaged after a nudge');
  assert.equal(bench.plane.state.autopilotDisengaged, 0);
  fly(bench, 0.2, (plane) => { plane.input.roll = 0.9; });
  assert.equal(bench.plane.autopilot.engaged, false);
  assert.equal(bench.plane.autopilot.lateral, null);
  assert.equal(bench.plane.state.autopilotDisengaged, 1);

  // Without power the autopilot holds the height until the stall protection can do no more; it never stalls the aircraft.
  const gliding = createFlightBench('gaviota_t2', { y: 800, mode: 'realistic' });
  gliding.plane.engageAutopilot();
  let stalled = false;
  fly(gliding, 90, (plane) => { plane.input.throttle = 0; stalled ||= plane.state.stalled; });
  assert.equal(stalled, false);
  assert.ok(gliding.plane.autopilot.engaged && gliding.plane.state.altitude < 795, 'it gives up height rather than stall');
});

test('the guidance law itself: bank limit, turn direction, vertical-speed limits', () => {
  const autopilot = createAutopilotState();
  const sense = {
    x: 0, z: 0, heading: 0, track: 0, altitude: 1000, verticalSpeed: 0, airspeed: 60, indicatedAirspeed: 60, groundSpeed: 60,
    acceleration: 0, throttle: 0.5, onGround: false, stalled: false,
  };
  const limits = { maxBank: 25 * DEGREE, maxVerticalSpeed: 5, autoThrottle: true, climbSpeed: 0 };
  const out = { active: false, bankTarget: 0, verticalSpeedTarget: 0, throttle: -1 };
  assert.equal(updateAutopilot(autopilot, sense, limits, 1 / 60, out).active, false);
  assert.equal(engageAutopilot(autopilot, { ...sense, onGround: true }), false);
  assert.equal(engageAutopilot(autopilot, sense), true);
  autopilot.targetHeading = 2;
  updateAutopilot(autopilot, sense, limits, 1 / 60, out);
  within(out.bankTarget, 24.9 * DEGREE, 25 * DEGREE, 'full bank right');
  autopilot.targetHeading = -0.02;
  updateAutopilot(autopilot, sense, limits, 1 / 60, out);
  assert.ok(out.bankTarget < 0 && out.bankTarget > -5 * DEGREE, 'a small correction to the left');
  autopilot.targetAltitude = 5000;
  updateAutopilot(autopilot, sense, limits, 1 / 60, out);
  assert.equal(out.verticalSpeedTarget, 5);
  // Below the climbing speed the climb is given up for speed.
  limits.climbSpeed = 80;
  updateAutopilot(autopilot, sense, limits, 1 / 60, out);
  assert.ok(out.verticalSpeedTarget < 0);
  assert.equal(out.throttle, -1, 'the lever is the pilot\'s without the auto-throttle');
  assert.equal(selectAutopilotMode(autopilot, 'ATHR', sense, true), true);
  autopilot.targetSpeed = 90;
  updateAutopilot(autopilot, sense, limits, 1 / 60, out);
  assert.ok(out.throttle > 0.9, 'too slow: throttle up');
});

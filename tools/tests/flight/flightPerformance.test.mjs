// The flight model flown in a real PhysicsWorld: each aircraft stalls where the catalog says,
// climbs, glides with the engine off, and reaches its cruise, top speed, Mach number and ceiling.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AIRCRAFT_IDS, KNOTS, createFlightBench, fly, positionOf } from './flightTestBench.mjs';

const within = (actual, low, high, what) => assert.ok(actual >= low && actual <= high, `${what}: ${actual} is not in ${low} .. ${high}`);

/** Level flight at idle, the pilot holding height with the stick until the wing lets go: the indicated stall speed. */
function findStallSpeed(id, notch) {
  const bench = createFlightBench(id, { y: 1000, speed: 0, mode: 'realistic' });
  bench.plane.setFlaps(notch);
  let held = 0;
  let stall = null;
  fly(bench, 240, (plane, time, dt) => {
    const s = plane.state;
    plane.input.throttle = 0.1;
    held += (-s.verticalSpeed * 0.02 + (1000 - s.altitude) * 0.004) * dt;
    plane.input.pitch = Math.max(-1, Math.min(1, held - s.verticalSpeed * 0.05));
    if (s.stalled) stall = s.indicatedAirspeed;
    return stall !== null;
  });
  return { stall, bench };
}

for (const id of AIRCRAFT_IDS) {
  test(`${id}: stalls in level flight within 2 kt of the catalog, clean and with flaps`, () => {
    const clean = findStallSpeed(id, 0);
    assert.ok(clean.stall !== null, 'it stalls');
    const tuning = clean.bench.tuning;
    within(clean.stall * KNOTS, tuning.stallSpeedClean * KNOTS - 2, tuning.stallSpeedClean * KNOTS + 2, 'clean stall, kt');
    within(clean.bench.plane.state.stallSpeed, tuning.stallSpeedClean - 0.01, tuning.stallSpeedClean + 0.01, 'state.stallSpeed');
    const flapped = findStallSpeed(id, tuning.flapNotches.length - 1);
    within(flapped.stall * KNOTS, tuning.stallSpeedFlaps * KNOTS - 2, tuning.stallSpeedFlaps * KNOTS + 2, 'flaps stall, kt');
    assert.ok(flapped.stall <= clean.stall + 0.01, 'flaps never raise the stall speed');
  });

  test(`${id}: the stall warning sounds before the stall and the buffet comes at it`, () => {
    const bench = createFlightBench(id, { y: 1000, speed: 0, mode: 'realistic' });
    let held = 0;
    let warnedAt = null;
    let buffetAtWarning = 1;
    fly(bench, 240, (plane, time, dt) => {
      const s = plane.state;
      plane.input.throttle = 0.1;
      held += (-s.verticalSpeed * 0.02 + (1000 - s.altitude) * 0.004) * dt;
      plane.input.pitch = Math.max(-1, Math.min(1, held - s.verticalSpeed * 0.05));
      if (warnedAt === null && s.stallWarning > 0.05) {
        warnedAt = s.indicatedAirspeed;
        buffetAtWarning = s.buffet;
      }
      return s.stalled;
    });
    const s = bench.plane.state;
    within((warnedAt - s.indicatedAirspeed) * KNOTS, 2.5, 9, 'warning margin, kt');
    assert.equal(buffetAtWarning, 0, 'no buffet yet at the first warning');
    assert.ok(s.buffet > 0.2 && s.stallWarning > 0.95, 'buffet and full warning at the stall');
  });

  test(`${id}: climbs at full power and glides with the engine off`, () => {
    const climb = createFlightBench(id, { y: 300, mode: 'casual' });
    climb.plane.engageAutopilot();
    climb.plane.autopilot.targetAltitude = 3000;
    fly(climb, 40, (plane) => { plane.input.throttle = 1; });
    const rate = climb.plane.state.verticalSpeed;
    within(rate, climb.tuning.climbRate * 0.5, climb.tuning.climbRate * 1.6, 'climb rate, m/s');

    const glide = createFlightBench(id, { y: 2500, speed: 0, mode: 'realistic' });
    glide.plane.engineOn = false;
    glide.plane.trim = 0.55;
    fly(glide, 60);
    const from = positionOf(glide.plane);
    fly(glide, 30);
    const to = positionOf(glide.plane);
    const ratio = Math.hypot(to.x - from.x, to.z - from.z) / (from.y - to.y);
    const [low, high] = { gaviota_t2: [7, 13], manta_sombra: [14, 26], garza_negra: [4, 11], halcon: [5, 12] }[id];
    within(ratio, low, high, 'glide ratio');
    assert.equal(glide.plane.state.thrust, 0);
    assert.ok(!glide.plane.state.stalled && Math.abs(glide.plane.state.roll) < 0.05, 'a steady, wings-level glide');
  });
}

test('gaviota_t2: cruises about 110 kt at 75 percent power, tops out near 62 m/s, climbs about 4 m/s', () => {
  const cruise = createFlightBench('gaviota_t2', { y: 300 });
  cruise.plane.engageAutopilot();
  fly(cruise, 150, (plane) => { plane.input.throttle = 0.75; });
  within(cruise.plane.state.indicatedAirspeed * KNOTS, 101, 116, 'cruise, kt');
  within(Math.abs(cruise.plane.state.altitude - 300), 0, 3, 'height held, m');
  fly(cruise, 150, (plane) => { plane.input.throttle = 1; });
  within(cruise.plane.state.airspeed, 58, 66, 'top speed, m/s');

  const climb = createFlightBench('gaviota_t2', { y: 100, mode: 'casual' });
  climb.plane.engageAutopilot();
  climb.plane.autopilot.targetAltitude = 2000;
  fly(climb, 45, (plane) => { plane.input.throttle = 1; });
  within(climb.plane.state.verticalSpeed, 3, 5, 'sea-level climb, m/s');
});

test('manta_sombra: holds Mach 0.85 at its 15 km ceiling', () => {
  const bench = createFlightBench('manta_sombra', { y: 14600, mode: 'casual' });
  bench.plane.engageAutopilot();
  bench.plane.autopilot.targetAltitude = 15000;
  fly(bench, 300, (plane) => { plane.input.throttle = 1; });
  const s = bench.plane.state;
  within(s.altitude, 14950, 15050, 'altitude, m');
  within(s.mach, 0.82, 0.92, 'Mach');
});

test('garza_negra: reaches Mach 3 near 24 km with the skin near 300 C', () => {
  const bench = createFlightBench('garza_negra', { y: 21000, speed: 760, mode: 'casual' });
  bench.plane.engageAutopilot();
  bench.plane.autopilot.targetAltitude = 24000;
  fly(bench, 300, (plane) => { plane.input.throttle = 1; });
  const s = bench.plane.state;
  within(s.altitude, 23900, 24100, 'altitude, m');
  within(s.mach, 2.95, 3.3, 'Mach');
  within(s.airspeed, 870, 990, 'true airspeed, m/s');
  within(s.skinTemperature, 270, 345, 'skin, C');
  assert.ok(s.afterburner > 0.9, 'on the burners');
  assert.ok(Math.abs(s.roll) < 0.02 && Math.abs(s.verticalSpeed) < 2, 'steady at 900 m/s');
});

test('garza_negra: from brake release to Mach 3 at 24 km in minutes', () => {
  const bench = createFlightBench('garza_negra', { mode: 'casual' });
  let engaged = false;
  const seconds = fly(bench, 900, (plane) => {
    const s = plane.state;
    plane.input.throttle = 1;
    if (!engaged) {
      plane.input.pitch = s.indicatedAirspeed > bench.tuning.rotateSpeed ? 0.6 : 0;
      if (s.radarAltitude > 150) {
        plane.input.pitch = 0;
        plane.setGear(false);
        engaged = plane.engageAutopilot();
        plane.autopilot.targetAltitude = 24000;
      }
    }
    return s.mach > 3 && s.altitude > 23500;
  });
  within(seconds / 60, 3, 13, 'minutes to Mach 3');
  assert.ok(!bench.plane.state.crashed);
});

test('halcon: Mach 1.8 at 11 km', () => {
  const bench = createFlightBench('halcon', { y: 11000, mode: 'casual' });
  bench.plane.engageAutopilot();
  fly(bench, 200, (plane) => { plane.input.throttle = 1; });
  within(bench.plane.state.mach, 1.7, 1.95, 'Mach');
  within(Math.abs(bench.plane.state.altitude - 11000), 0, 40, 'height held, m');
});

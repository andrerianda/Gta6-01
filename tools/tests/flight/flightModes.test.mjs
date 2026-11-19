// Realistic against casual: the raw model stalls, drops and needs trimming; the casual assists
// trim, protect from the stall, limit the bank, level the wings and the path, coordinate the turn
// and ease the throttle at the speed limit.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CASUAL_MAX_BANK } from '../../../game/src/flight/flightAssists.js';
import { AIRCRAFT_IDS, KNOTS, createFlightBench, fly } from './flightTestBench.mjs';

const within = (actual, low, high, what) => assert.ok(actual >= low && actual <= high, `${what}: ${actual} is not in ${low} .. ${high}`);

for (const id of AIRCRAFT_IDS) {
  test(`${id} casual: full back stick at idle never stalls; it settles into a glide above the stall speed`, () => {
    const bench = createFlightBench(id, { y: 1500, mode: 'casual' });
    let slowest = Infinity;
    let steepest = 0;
    let stalled = false;
    fly(bench, 60, (plane) => {
      plane.input.pitch = 1;
      plane.input.throttle = 0;
      const s = plane.state;
      slowest = Math.min(slowest, s.indicatedAirspeed);
      steepest = Math.max(steepest, s.alpha);
      stalled ||= s.stalled;
    });
    assert.equal(stalled, false);
    assert.ok(steepest < bench.tuning.wing.criticalAlpha, 'the angle of attack stays short of the stall');
    assert.ok(slowest >= bench.tuning.stallSpeedClean, `slowest ${slowest * KNOTS} kt`);
    assert.ok(bench.plane.state.verticalSpeed < 0, 'gliding down, not hanging on the stall');
    within(Math.abs(bench.plane.state.roll), 0, 0.03, 'wings level, rad');
  });

  test(`${id} casual: banks to 45 degrees at most, turns coordinated, levels itself when released`, () => {
    const bench = createFlightBench(id, { y: 1500, mode: 'casual' });
    const start = bench.plane.state.altitude;
    let steepest = 0;
    let worstSlip = 0;
    fly(bench, 14, (plane, time) => {
      plane.input.roll = 1;
      steepest = Math.max(steepest, plane.state.roll);
      if (time > 4) worstSlip = Math.max(worstSlip, Math.abs(plane.state.slip));
    });
    within(steepest, CASUAL_MAX_BANK - 0.06, CASUAL_MAX_BANK + 0.05, 'bank, rad');
    assert.ok(bench.plane.state.turnRate > 0.01, 'turning right');
    within(worstSlip, 0, 0.03, 'sideslip in the turn, rad');
    within(Math.abs(bench.plane.state.altitude - start), 0, 40, 'height kept in the turn, m');
    fly(bench, 10, (plane) => { plane.input.roll = 0; });
    within(Math.abs(bench.plane.state.roll), 0, 0.02, 'wings level again, rad');
    within(Math.abs(bench.plane.state.verticalSpeed), 0, 1.2, 'path level again, m/s');
  });

  test(`${id} casual: the stick asks for a climb or a descent and letting go levels off; it trims itself`, () => {
    const bench = createFlightBench(id, { y: 1500, mode: 'casual' });
    const lever = bench.plane.input.throttle;
    fly(bench, 8, (plane) => { plane.input.pitch = 0.5; plane.input.throttle = 1; });
    assert.ok(bench.plane.state.verticalSpeed > 2, 'climbing');
    fly(bench, 8, (plane) => { plane.input.pitch = 0; plane.input.throttle = lever; });
    within(Math.abs(bench.plane.state.verticalSpeed), 0, 1.5, 'level, m/s');
    fly(bench, 6, (plane) => { plane.input.pitch = -0.5; });
    assert.ok(bench.plane.state.verticalSpeed < -2, 'descending');
    // Hands off at a quite different speed: still level, the trim has followed.
    const trimBefore = bench.plane.trim;
    fly(bench, 40, (plane) => { plane.input.pitch = 0; plane.input.throttle = 0.35; });
    within(Math.abs(bench.plane.state.verticalSpeed), 0, 1.5, 'level at the new speed, m/s');
    assert.notEqual(bench.plane.trim, trimBefore);
  });
}

test('realistic: holding the stick back at idle stalls the trainer; it drops, and flies again when released', () => {
  const bench = createFlightBench('gaviota_t2', { y: 1500, speed: 0, mode: 'realistic' });
  let stalledAt = null;
  let buffeted = 0;
  fly(bench, 40, (plane, time) => {
    plane.input.throttle = 0;
    plane.input.pitch = Math.min(1, time * 0.12);
    buffeted = Math.max(buffeted, plane.state.buffet);
    if (plane.state.stalled && stalledAt === null) stalledAt = plane.state.altitude;
    return stalledAt !== null && plane.state.verticalSpeed < -6;
  });
  assert.ok(stalledAt !== null, 'stalled');
  assert.ok(buffeted > 0.5, 'with buffet');
  assert.ok(bench.plane.state.verticalSpeed < -6, 'and it drops');
  assert.ok(bench.plane.state.stallWarning > 0.9, 'the horn is on');
  // Stick forward, power on: the wing flies again within a few seconds.
  fly(bench, 6, (plane) => { plane.input.pitch = -0.2; plane.input.throttle = 1; });
  assert.equal(bench.plane.state.stalled, false);
  assert.ok(bench.plane.state.indicatedAirspeed > bench.tuning.stallSpeedClean * 1.2, 'flying speed again');
  let lowest = bench.plane.state.altitude;
  let stalledAgain = false;
  fly(bench, 12, (plane) => {
    plane.input.pitch = 0;
    lowest = Math.min(lowest, plane.state.altitude);
    stalledAgain ||= plane.state.stalled;
  });
  assert.ok(!stalledAgain && bench.plane.state.verticalSpeed > 0, 'recovered and climbing on the trim');
  assert.ok(stalledAt - lowest < 300, `in ${stalledAt - lowest} m`);
});

test('realistic: no self-levelling, and the trim sets the speed the aircraft seeks', () => {
  const banked = createFlightBench('gaviota_t2', { y: 1500, mode: 'realistic' });
  fly(banked, 1.5, (plane) => { plane.input.roll = 1; });
  const bank = banked.plane.state.roll;
  assert.ok(bank > 0.5, 'rolled past what casual mode allows in the same time is possible');
  fly(banked, 4, (plane) => { plane.input.roll = 0; });
  assert.ok(banked.plane.state.roll > bank * 0.6, 'the bank stays when the stick is centred');

  const speeds = [];
  for (const trim of [-0.5, 0.3, 0.8]) {
    const bench = createFlightBench('gaviota_t2', { y: 2500, mode: 'realistic' });
    bench.plane.trim = trim;
    // The mean over two minutes: the speed swings slowly about the trimmed one (the phugoid).
    let sum = 0;
    let count = 0;
    fly(bench, 180, (plane, time) => {
      plane.input.throttle = 0.6;
      if (time > 60) {
        sum += plane.state.indicatedAirspeed;
        count += 1;
      }
    });
    speeds.push(sum / count);
    assert.equal(bench.plane.trim, trim, 'realistic mode leaves the trim to the pilot');
  }
  assert.ok(speeds[0] > speeds[1] + 3 && speeds[1] > speeds[2] + 3, `nose-up trim, slower flight: ${speeds.map((v) => (v * KNOTS).toFixed(0))}`);
});

test('realistic: aileron alone skids the turn (the ball leaves the centre); rudder brings a sideslip', () => {
  const bench = createFlightBench('gaviota_t2', { y: 1500, mode: 'realistic' });
  let skid = 0;
  fly(bench, 4, (plane) => { plane.input.roll = plane.state.roll < 0.5 ? 1 : 0; skid = Math.max(skid, plane.state.slip); });
  const casual = createFlightBench('gaviota_t2', { y: 1500, mode: 'casual' });
  let casualSkid = 0;
  fly(casual, 4, (plane) => { plane.input.roll = 0.66; casualSkid = Math.max(casualSkid, Math.abs(plane.state.slip)); });
  assert.ok(skid > casualSkid * 2 && skid > 0.04, `rolling in without rudder slips: ${skid} against ${casualSkid} coordinated`);

  const pedal = createFlightBench('gaviota_t2', { y: 1500, mode: 'realistic' });
  fly(pedal, 3, (plane) => { plane.input.yaw = 1; });
  assert.ok(pedal.plane.state.slip < -0.03, 'right rudder: the nose goes right of the airflow');
  assert.ok(pedal.plane.state.heading > 0.02 && pedal.plane.state.heading < 1, 'and the heading follows');
});

test('casual: the throttle is eased at the speed limit; realistic lets the alarm sound', () => {
  const casual = createFlightBench('manta_sombra', { y: 3000, mode: 'casual' });
  let worst = 0;
  fly(casual, 150, (plane, time) => { plane.input.throttle = 1; plane.input.pitch = -0.4; if (time > 60) worst = Math.max(worst, plane.state.overspeed); });
  const raw = createFlightBench('manta_sombra', { y: 6000, mode: 'realistic' });
  raw.plane.trim = -1;
  let rawWorst = 0;
  fly(raw, 40, (plane) => { plane.input.throttle = 1; plane.input.pitch = -0.25; rawWorst = Math.max(rawWorst, plane.state.overspeed); });
  assert.ok(rawWorst > 0.9, `realistic dive overspeeds: ${rawWorst}`);
  assert.ok(casual.plane.state.throttle < 1, 'throttle eased');
});

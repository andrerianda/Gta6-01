// On the wheels: standing parked, the takeoff roll, the landing roll with brakes, nose-wheel
// steering, a crosswind, and what a hard touchdown, a belly landing and the sea do to the aircraft.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { VEHICLE_CATALOG } from '../../../game/src/catalog/vehicleCatalog.js';
import { PhysicsWorld } from '../../../game/src/physics/PhysicsWorld.js';
import { Airplane, deriveAirplaneTuning } from '../../../game/src/physics/aircraft/Airplane.js';
import { AIRCRAFT_IDS, KNOTS, createFlightBench, fly, positionOf, takeOff } from './flightTestBench.mjs';

const within = (actual, low, high, what) => assert.ok(actual >= low && actual <= high, `${what}: ${actual} is not in ${low} .. ${high}`);
const TAKEOFF_LIMIT = { gaviota_t2: 300, manta_sombra: 700, garza_negra: 700, halcon: 600 };
const LANDING_LIMIT = { gaviota_t2: 300, manta_sombra: 800, garza_negra: 800, halcon: 800 };

/** A casual-mode approach at approach speed with full flaps, a flare, then full brakes to a stop. */
function land(id, brakes = 1) {
  const bench = createFlightBench(id, { y: 120, mode: 'casual' });
  const { plane, tuning } = bench;
  plane.placeAt(0, 120, 0, 0, tuning.approachSpeed * 1.05);
  plane.setFlaps(tuning.flapNotches.length - 1);
  plane.setGear(true);
  const result = { touchdownSpeed: 0, sink: 0, roll: null, impact: 0, bounced: false };
  let touchedAt = null;
  fly(bench, 240, (p) => {
    const s = p.state;
    result.impact = Math.max(result.impact, s.impact);
    if (touchedAt === null) {
      const wanted = s.radarAltitude > 8 ? -3 : -0.6;
      p.input.pitch = Math.max(-1, Math.min(1, (wanted - s.verticalSpeed) * 0.15));
      p.input.throttle = Math.max(0, Math.min(1, 0.35 + (tuning.approachSpeed - s.indicatedAirspeed) * 0.05)) * (s.radarAltitude < 8 ? 0.3 : 1);
      if (s.onGround) {
        touchedAt = positionOf(p).z;
        result.touchdownSpeed = s.indicatedAirspeed;
        result.sink = -s.verticalSpeed;
      }
      return false;
    }
    p.input.pitch = 0;
    p.input.throttle = 0;
    p.input.brake = brakes;
    if (s.radarAltitude > 1.5) result.bounced = true;
    if (s.groundSpeed < 0.5 || touchedAt - positionOf(p).z > 4000) {
      result.roll = touchedAt - positionOf(p).z;
      return true;
    }
    return false;
  });
  result.crashed = plane.state.crashed;
  return result;
}

for (const id of AIRCRAFT_IDS) {
  test(`${id}: stands parked on its three wheels and goes to sleep`, () => {
    const bench = createFlightBench(id);
    bench.plane.engineOn = false;
    fly(bench, 4);
    const at = positionOf(bench.plane);
    const s = bench.plane.state;
    assert.equal(s.wheelsOnGround, 3);
    assert.ok(s.onGround && !s.crashed && s.impact === 0);
    within(at.y, -0.03, 0.05, 'the model origin rests on the ground, m');
    within(Math.hypot(at.x, at.z), 0, 0.02, 'it has not rolled, m');
    within(Math.abs(s.pitch) + Math.abs(s.roll), 0, 0.02, 'level, rad');
    assert.ok(bench.plane.body.asleep, 'asleep');
    // The gear lever is refused on the ground (and does nothing on fixed gear).
    assert.equal(bench.plane.setGear(false), false);
    assert.equal(bench.plane.gearDown, true);
    // The engine wakes it; the brakes then hold it against idle thrust.
    bench.plane.engineOn = true;
    fly(bench, 3, (plane) => { plane.input.brake = 1; });
    assert.ok(!bench.plane.body.asleep && bench.plane.state.rpm > 0.15);
    within(Math.hypot(positionOf(bench.plane).x, positionOf(bench.plane).z), 0, 0.3, 'held by the brakes, m');
  });

  test(`${id}: takes off within ${TAKEOFF_LIMIT[id]} m, and only when the pilot pulls`, () => {
    const bench = createFlightBench(id, { mode: 'casual' });
    const flight = takeOff(bench, bench.tuning.flapNotches.length > 1 ? 1 : 0);
    assert.ok(flight.roll !== null, 'it lifts off');
    within(flight.roll, 60, TAKEOFF_LIMIT[id], 'ground roll, m');
    assert.ok(flight.liftOffSpeed > bench.tuning.stallSpeedFlaps, 'above the stall at lift-off');
    assert.ok(!bench.plane.state.crashed && bench.plane.state.verticalSpeed > 1, 'climbing away');

    const lazy = createFlightBench(id, { mode: 'casual' });
    fly(lazy, 60, (plane) => {
      plane.input.throttle = 1;
      return plane.state.indicatedAirspeed > lazy.tuning.rotateSpeed * 1.15;
    });
    assert.ok(lazy.plane.state.onGround, 'no pull, no takeoff: still rolling well past rotate speed');
  });

  test(`${id}: lands and stops within ${LANDING_LIMIT[id]} m with the brakes on`, () => {
    const landing = land(id);
    assert.ok(landing.roll !== null && !landing.crashed, 'it lands and stops');
    assert.equal(landing.impact, 0, 'a flared touchdown is within what the gear takes');
    within(landing.sink, 0, 2.5, 'sink rate at touchdown, m/s');
    within(landing.roll, 40, LANDING_LIMIT[id], 'landing roll, m');
    const coasting = land(id, 0);
    assert.ok(coasting.roll > landing.roll * 1.8, `without brakes it rolls much further (${coasting.roll} m)`);
  });
}

test('the nose wheel steers on the ground, and in casual mode the roll keys taxi too', () => {
  for (const [mode, key] of [['realistic', 'yaw'], ['casual', 'roll']]) {
    const bench = createFlightBench('gaviota_t2', { mode });
    let turnedRight = false;
    fly(bench, 12, (plane, time) => {
      plane.input.throttle = plane.state.groundSpeed < 4 ? 0.5 : 0.1;
      plane.input[key] = 1;
      if (time > 3 && time < 3.1) turnedRight = plane.state.heading > 0.02 && plane.state.heading < 3 && plane.state.turnRate > 0;
    });
    const s = bench.plane.state;
    assert.ok(s.wheelsOnGround === 3 && s.groundSpeed > 1, 'taxiing');
    assert.ok(turnedRight, `${mode}: the turn starts to the right`);
    assert.ok(s.heading > 0.8 || s.heading < 0.1, `${mode}: well round: heading ${s.heading}`);
    within(Math.abs(s.roll), 0, 0.12, 'without tipping over, rad');
  }
});

test('a crosswind: the tyres hold the centreline, the fin weathercocks the nose into the wind', () => {
  // The air moves towards +X (a wind from the west); the aircraft rolls north.
  const bench = createFlightBench('gaviota_t2', { mode: 'realistic', wind: { x: 6, z: 0 } });
  let slipAtSpeed = 0;
  fly(bench, 9, (plane) => {
    plane.input.throttle = 1;
    if (plane.state.groundSpeed > 12 && slipAtSpeed === 0) slipAtSpeed = plane.state.slip;
  });
  const s = bench.plane.state;
  const at = positionOf(bench.plane);
  assert.ok(s.onGround && s.groundSpeed > 15, 'still on the ground roll');
  assert.ok(slipAtSpeed < -0.05, `the air comes from the left: slip ${slipAtSpeed}`);
  assert.ok(s.heading > Math.PI, `the nose has turned left, into the wind: heading ${s.heading}`);
  within(Math.abs(at.x), 0.01, 25, 'drift off the centreline, m');
  // The same roll in calm air runs straight.
  const calm = createFlightBench('gaviota_t2', { mode: 'realistic' });
  fly(calm, 9, (plane) => { plane.input.throttle = 1; });
  within(Math.abs(positionOf(calm.plane).x), 0, 0.05, 'calm: no drift, m');

  // In the air the aircraft goes with the air mass: hands off, it drifts downwind.
  const aloft = createFlightBench('gaviota_t2', { y: 500, mode: 'realistic', wind: { x: 6, z: 0 } });
  fly(aloft, 30);
  within(positionOf(aloft.plane).x, 100, 200, 'downwind drift in 30 s, m');
  within(Math.abs(aloft.plane.state.slip), 0, 0.02, 'no sideslip once it flies with the air, rad');
});

test('a hard touchdown is reported as an impact; a flown-in one as a crash', () => {
  const bench = createFlightBench('gaviota_t2', { mode: 'realistic' });
  const { plane, tuning } = bench;
  // Dropped onto the runway far below flying speed, so the wing cannot cushion it.
  plane.placeAt(0, 1.2, 0, 0, 30);
  plane.body.linearVelocity.z = -8;
  plane.body.linearVelocity.y = -5.5;
  let worst = 0;
  fly(bench, 2, (p) => { p.input.throttle = 0; worst = Math.max(worst, p.state.impact); });
  // It falls a little faster still before the wheels touch: about 7 m/s against a 3.5 m/s gear.
  within(worst, 5.5 - tuning.touchdownLimit, 7.6 - tuning.touchdownLimit, 'impact beyond what the gear takes, m/s');
  assert.equal(plane.state.crashed, false, 'bent, not broken');

  const dive = createFlightBench('gaviota_t2', { y: 120, mode: 'realistic' });
  let hit = 0;
  fly(dive, 12, (p) => { p.input.pitch = -1; hit = Math.max(hit, p.state.impact); return p.state.crashed; });
  assert.ok(dive.plane.state.crashed, 'flown into the ground');
  assert.ok(hit > 5, `with a heavy impact (${hit} m/s)`);
  assert.equal(dive.plane.engineOn, false, 'the engine has stopped');
});

test('a belly landing with the gear up scrapes the hull', () => {
  const bench = createFlightBench('halcon', { y: 3, mode: 'realistic' });
  bench.plane.placeAt(0, 3, 0, 0, 80);
  assert.equal(bench.plane.gearDown, false);
  let worst = 0;
  fly(bench, 30, (p) => { p.input.throttle = 0; worst = Math.max(worst, p.state.impact); return p.state.crashed; });
  assert.equal(bench.plane.state.wheelsOnGround, 0);
  assert.ok(worst > 1, `hull impact ${worst}`);
  assert.ok(bench.plane.state.crashed);
});

test('the sea ends the flight', () => {
  const world = new PhysicsWorld({ ground: { heightAt: () => -30 } });
  const plane = new Airplane(world, deriveAirplaneTuning(VEHICLE_CATALOG.gaviota_t2), { x: 0, y: 12, z: 0, heading: 0 });
  plane.mode = 'realistic';
  assert.ok(plane.state.radarAltitude > 0);
  let lowest = Infinity;
  for (let i = 0; i < 60 * 20 && !plane.state.crashed; i += 1) {
    plane.input.pitch = -0.6;
    plane.input.throttle = 0;
    world.step();
    lowest = Math.min(lowest, plane.state.radarAltitude);
  }
  assert.ok(plane.state.crashed, 'ditched');
  assert.equal(lowest, 0, 'the radar altimeter reads the sea, not the sea bed');
  assert.ok(plane.state.altitude > -3 && plane.state.impact > 3);
  assert.ok(KNOTS > 1.9);
});

// Tests of the two-wheelers on the Vehicle core: top speed and acceleration from the catalog, a
// leaned steady circle, braking, the side stand, and a crash that throws the rider off.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PhysicsWorld } from '../../../game/src/physics/PhysicsWorld.js';
import { PHYSICS_EVENT } from '../../../game/src/physics/physicsEvents.js';
import { Motorcycle } from '../../../game/src/physics/vehicles/Motorcycle.js';
import { deriveVehicleTuning } from '../../../game/src/physics/vehicles/vehicleTuning.js';
import { VEHICLE_CATALOG } from '../../../game/src/catalog/vehicleCatalog.js';

const HUNDRED = 100 / 3.6;

function spawn(id, options = { rider: true }) {
  const world = new PhysicsWorld();
  const bike = new Motorcycle(world, deriveVehicleTuning(VEHICLE_CATALOG[id]), options);
  return { world, bike };
}

function run(world, seconds, each) {
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i += 1) {
    if (each) each(i);
    world.step();
  }
}

function launch(bike, speed) {
  const r = bike.body.rotation;
  bike.body.wake();
  bike.body.linearVelocity.x = -r[2] * speed;
  bike.body.linearVelocity.z = -r[8] * speed;
}

test('two-wheelers get two in-line wheels, a slim hull and a lean limit from the catalog', () => {
  const tuning = deriveVehicleTuning(VEHICLE_CATALOG.sport_motorcycle);
  assert.equal(tuning.twoWheeled, true);
  assert.equal(tuning.wheels.length, 2);
  assert.equal(tuning.wheels[0].steered, true);
  assert.equal(tuning.wheels[1].driven, true);
  assert.ok(tuning.hull.halfX <= 0.2);
  assert.ok(tuning.maxLean > 0.6 && tuning.maxLean < 0.9);
  const given = deriveVehicleTuning(VEHICLE_CATALOG.chopper_motorcycle, [
    { x: 0, y: 0.33, z: -0.9, radius: 0.33 }, { x: 0, y: 0.33, z: 0.86, radius: 0.33 }]);
  assert.equal(given.twoWheeled, true);
  assert.equal(given.wheels[0].z, -0.9);
});

for (const id of ['sport_motorcycle', 'chopper_motorcycle']) {
  test(`${id} reaches its top speed upright and accelerates like its catalog entry`, () => {
    const { world, bike } = spawn(id);
    const spec = VEHICLE_CATALOG[id];
    let hundredAt = null;
    let worstLean = 0;
    run(world, spec.handling.timeToTopSpeed * 2.6, (i) => {
      bike.input.drive = 1;
      if (hundredAt === null && bike.speed >= HUNDRED) hundredAt = i / 60;
      if (i > 30) worstLean = Math.max(worstLean, Math.abs(bike.lean));
    });
    const top = spec.handling.topSpeed;
    console.log(`${id}: 0-100 ${hundredAt?.toFixed(2)} s (catalog ${spec.handling.zeroToHundred}), top ${bike.speed.toFixed(1)} m/s (${top})`);
    assert.ok(Math.abs(bike.speed - top) / top < 0.05, `top speed ${bike.speed}`);
    assert.ok(hundredAt !== null && hundredAt < spec.handling.zeroToHundred * 1.35, `0-100 ${hundredAt}`);
    assert.ok(worstLean < 0.05, `lean on a straight ${worstLean}`);
    assert.equal(bike.riderSeated, true);
    assert.equal(bike.groundedWheels, 2);
  });
}

test('a steady circle leans into the turn by about atan(v^2 / (r g)) and keeps both wheels down', () => {
  const { world, bike } = spawn('sport_motorcycle');
  launch(bike, 16);
  let speedSum = 0;
  let leanSum = 0;
  let samples = 0;
  run(world, 8, (i) => {
    bike.input.drive = bike.speed < 16 ? 0.5 : 0;
    bike.input.steer = 0.6;
    if (i > 300) {
      speedSum += bike.speed;
      leanSum += bike.lean;
      samples += 1;
      assert.equal(bike.groundedWheels, 2);
    }
  });
  const speed = speedSum / samples;
  const lean = leanSum / samples;
  const yawRate = -bike.body.angularVelocity.y;
  const expected = Math.atan((speed * yawRate) / 9.81);
  console.log(`circle: ${speed.toFixed(1)} m/s, lean ${(lean * 57.3).toFixed(1)} deg (turn needs ${(expected * 57.3).toFixed(1)})`);
  assert.ok(lean > 0.2, `leans right ${lean}`);
  assert.ok(Math.abs(lean - expected) < 0.12, `lean ${lean} vs ${expected}`);
  assert.equal(bike.riderSeated, true);
  assert.ok(bike.body.rotation[4] > 0.5);
});

test('it stops from 100 km/h in a believable distance and keeps its rider', () => {
  const { world, bike } = spawn('sport_motorcycle');
  launch(bike, HUNDRED);
  const start = { x: bike.body.position.x, z: bike.body.position.z };
  run(world, 6, () => { bike.input.drive = bike.speed > 0.5 ? -1 : 0; });
  const distance = Math.hypot(bike.body.position.x - start.x, bike.body.position.z - start.z);
  console.log(`sport_motorcycle braking from 100 km/h: ${distance.toFixed(1)} m`);
  assert.ok(distance > 25 && distance < 60, `braking distance ${distance}`);
  assert.equal(bike.riderSeated, true);
  assert.ok(Math.abs(bike.lean) < 0.05);
});

test('without a rider it stands on its side stand, sleeps, and a rider can mount and ride off', () => {
  const { world, bike } = spawn('chopper_motorcycle', { rider: false });
  run(world, 3);
  assert.ok(bike.lean < -0.08 && bike.lean > -0.2, `stand lean ${bike.lean}`);
  assert.equal(bike.fallen, false);
  assert.equal(bike.body.asleep, true);
  bike.mount();
  run(world, 3, () => { bike.input.drive = 1; });
  assert.ok(bike.speed > 10 && Math.abs(bike.lean) < 0.05, `rides off ${bike.speed} ${bike.lean}`);
});

test('a crash into a wall throws the rider; the bike falls over and mount() stands it up', () => {
  const { world, bike } = spawn('sport_motorcycle');
  world.addStaticBox(0, 2, -30, 6, 2, 0.5, 0);
  launch(bike, 18);
  let thrown = null;
  run(world, 4, () => {
    bike.input.drive = 0.3;
    for (let i = 0; i < world.events.count; i += 1) {
      const event = world.events.items[i];
      if (event.type === PHYSICS_EVENT.RIDER_THROWN) thrown = { y: event.y, speed: event.speed };
    }
    world.events.clear();
  });
  assert.ok(thrown, 'rider thrown');
  assert.ok(thrown.speed > 12 && thrown.y > 0.6, `throw ${JSON.stringify(thrown)}`);
  assert.equal(bike.riderSeated, false);
  assert.equal(bike.fallen, true);
  assert.ok(bike.riderThrow.vz < -8 && bike.riderThrow.vy > 1, 'launch velocity follows the bike');
  assert.ok(bike.body.position.z > -30, 'did not pass the wall');
  bike.mount();
  run(world, 1);
  assert.ok(Math.abs(bike.lean) < 0.05 && bike.body.rotation[4] > 0.95);
});

test('the same inputs give the same ride', () => {
  const ride = () => {
    const { world, bike } = spawn('sport_motorcycle');
    run(world, 5, (i) => { bike.input.drive = 1; bike.input.steer = Math.sin(i / 40); });
    return world.digest();
  };
  assert.equal(ride(), ride());
});

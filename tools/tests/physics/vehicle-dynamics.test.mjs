// Tests of the car dynamics with tunings derived from the real vehicle catalog: top speed,
// acceleration, braking, parking on a slope, cornering, the handbrake, stability at speed, walls,
// determinism and the step time of forty cars.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PhysicsWorld } from '../../../game/src/physics/PhysicsWorld.js';
import { CharacterController } from '../../../game/src/physics/characters/CharacterController.js';
import { Vehicle } from '../../../game/src/physics/vehicles/Vehicle.js';
import { deriveVehicleTuning } from '../../../game/src/physics/vehicles/vehicleTuning.js';
import { VEHICLE_CATALOG } from '../../../game/src/catalog/vehicleCatalog.js';

const HUNDRED = 100 / 3.6;
const IDS = ['compact_hatch', 'supercar', 'box_truck'];

function spawn(id, worldOptions = {}, options = {}) {
  const world = new PhysicsWorld(worldOptions);
  const car = new Vehicle(world, deriveVehicleTuning(VEHICLE_CATALOG[id]), options);
  return { world, car };
}

function run(world, seconds, each) {
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i += 1) {
    if (each) each(i);
    world.step();
  }
}

function launch(car, speed) {
  const r = car.body.rotation;
  car.body.wake();
  car.body.linearVelocity.x = -r[2] * speed;
  car.body.linearVelocity.y = -r[5] * speed;
  car.body.linearVelocity.z = -r[8] * speed;
}

function upright(car) {
  return car.body.rotation[4];
}

for (const id of IDS) {
  test(`${id}: settles, accelerates to its top speed and brakes from 100 km/h`, () => {
    const spec = VEHICLE_CATALOG[id];
    const { world, car } = spawn(id);
    run(world, 3);
    const com = car.tuning.centreOfMass;
    assert.ok(Math.abs(car.body.position.y - com.y) < 0.03, `rides at its design height (${car.body.position.y} vs ${com.y})`);
    assert.ok(car.body.asleep, 'a parked car sleeps');
    assert.equal(car.groundedWheels, 4);

    car.input.drive = 1;
    let toHundred = null;
    let time = 0;
    run(world, Math.max(spec.handling.timeToTopSpeed * 3, 45), () => {
      time += 1 / 60;
      if (toHundred === null && car.speed >= HUNDRED) toHundred = time;
    });
    const top = car.speed;
    console.log(`${id}: 0-100 km/h ${toHundred?.toFixed(2)} s (catalog ${spec.handling.zeroToHundred}), top speed ${top.toFixed(2)} m/s `
      + `(catalog ${spec.handling.topSpeed}), gear ${car.gear}, rpm ${car.rpm.toFixed(0)}`);
    assert.ok(Math.abs(top - spec.handling.topSpeed) / spec.handling.topSpeed < 0.05, `top speed ${top} vs ${spec.handling.topSpeed}`);
    if (spec.handling.topSpeed > HUNDRED * 1.08) {
      assert.ok(Math.abs(toHundred - spec.handling.zeroToHundred) / spec.handling.zeroToHundred < 0.2, `0-100 in ${toHundred}`);
    }
    assert.ok(upright(car) > 0.99 && Math.abs(car.body.position.x) < 1.5, 'runs straight and level');
    assert.ok(car.gear >= 3 && car.rpm > 3000, 'the gearbox followed');

    launch(car, Math.min(HUNDRED, top));
    const from = car.body.position.z;
    const startSpeed = Math.min(HUNDRED, top);
    car.input.drive = -1;
    let stopped = null;
    run(world, 8, () => {
      if (stopped === null && car.speed < 0.3) {
        stopped = Math.abs(car.body.position.z - from);
        car.input.drive = 0;
      }
    });
    const ideal = (Math.min(HUNDRED, top) ** 2) / (2 * spec.handling.braking);
    console.log(`${id}: braking from ${(startSpeed * 3.6).toFixed(0)} km/h in ${stopped?.toFixed(1)} m (ideal ${ideal.toFixed(1)} m)`);
    assert.ok(stopped !== null && stopped > ideal * 0.7 && stopped < ideal * 1.5, `stopping distance ${stopped} vs ${ideal}`);
    assert.ok(upright(car) > 0.98);
  });
}

test('a parked car holds a 10 percent slope without creeping and sleeps', () => {
  const { world, car } = spawn('compact_hatch', { ground: { heightAt: (x, z) => z * 0.1 } }, { x: 0, z: 0, heading: 0 });
  run(world, 1);
  const x = car.body.position.x;
  const z = car.body.position.z;
  run(world, 5);
  const moved = Math.hypot(car.body.position.x - x, car.body.position.z - z);
  assert.ok(moved < 0.01, `moved ${moved} m in five seconds`);
  assert.ok(car.body.asleep);
  // Across the slope too.
  const side = spawn('box_truck', { ground: { heightAt: (x) => x * 0.1 } });
  run(side.world, 1);
  const sx = side.car.body.position.x;
  run(side.world, 5);
  assert.ok(Math.abs(side.car.body.position.x - sx) < 0.01, 'truck holds across the slope');
});

test('holds a steady circle, and is stable at 200 km/h after a steering jab', () => {
  const { world, car } = spawn('compact_hatch');
  run(world, 1);
  car.input.drive = 0.45;
  run(world, 6);
  car.input.steer = 0.6;
  let minYaw = Infinity;
  let maxYaw = -Infinity;
  run(world, 8, (i) => {
    if (i < 240) return;
    minYaw = Math.min(minYaw, -car.body.angularVelocity.y);
    maxYaw = Math.max(maxYaw, -car.body.angularVelocity.y);
  });
  console.log(`compact_hatch circle: speed ${car.speed.toFixed(1)} m/s, yaw rate ${minYaw.toFixed(3)}..${maxYaw.toFixed(3)} rad/s, lean ${upright(car).toFixed(4)}`);
  assert.ok(minYaw > 0.05, 'keeps turning right');
  assert.ok(maxYaw - minYaw < 0.25 * maxYaw + 0.05, `steady yaw rate (${minYaw}..${maxYaw})`);
  assert.ok(upright(car) > 0.97 && car.groundedWheels === 4, 'all wheels down');

  const fast = spawn('supercar');
  run(fast.world, 1);
  launch(fast.car, 200 / 3.6);
  fast.car.input.drive = 1;
  run(fast.world, 1);
  fast.car.input.steer = 1;
  run(fast.world, 0.35);
  fast.car.input.steer = 0;
  run(fast.world, 3);
  const yaw = Math.abs(fast.car.body.angularVelocity.y);
  const slide = Math.abs(fast.car.body.linearVelocity.x * fast.car.body.rotation[0] + fast.car.body.linearVelocity.z * fast.car.body.rotation[6]);
  console.log(`supercar at 200 km/h after a jab: speed ${fast.car.speed.toFixed(1)} m/s, yaw rate ${yaw.toFixed(4)}, side slip ${slide.toFixed(3)} m/s`);
  assert.ok(fast.car.speed > 50, 'still at speed');
  assert.ok(yaw < 0.05 && slide < 0.5, 'straightened out');
  assert.ok(upright(fast.car) > 0.98);
});

test('the handbrake swings the tail round and the car recovers', () => {
  const { world, car } = spawn('sports_coupe');
  run(world, 1);
  launch(car, 22);
  car.input.drive = 0.3;
  run(world, 0.3);
  const before = car.heading;
  car.input.steer = 1;
  car.input.handbrake = 1;
  car.input.drive = 0;
  let slipped = 0;
  run(world, 1.3, () => {
    slipped = Math.max(slipped, car.wheelSlip[2]);
  });
  let turned = car.heading - before;
  if (turned < -Math.PI) turned += Math.PI * 2;
  car.input.handbrake = 0;
  car.input.steer = 0;
  car.input.drive = 0.6;
  run(world, 3.5);
  const slide = Math.abs(car.body.linearVelocity.x * car.body.rotation[0] + car.body.linearVelocity.z * car.body.rotation[6]);
  console.log(`sports_coupe handbrake turn: turned ${(turned * 57.3).toFixed(0)} degrees, rear slip ${slipped.toFixed(2)}, `
    + `afterwards side slip ${slide.toFixed(2)} m/s, speed ${car.speed.toFixed(1)} m/s`);
  assert.ok(turned > 0.8, `turned ${turned} rad to the right`);
  assert.ok(slipped > 0.9, 'the rear tyres were sliding');
  assert.ok(slide < 0.6 && car.speed > 3, 'grips again and drives on');
  assert.ok(upright(car) > 0.97);
});

test('a car at 60 m/s stops at a wall and reports the crash', () => {
  const { world, car } = spawn('supercar');
  world.addStaticBox(0, 2, -60, 10, 2, 0.15, 0, { userRef: 'wall' });
  run(world, 1);
  launch(car, 60);
  let furthest = 0;
  run(world, 2, () => {
    furthest = Math.min(furthest, car.body.position.z);
  });
  assert.ok(furthest > -59.85, `the car's centre never reached the wall (${furthest})`);
  const impacts = world.events.items.slice(0, world.events.count).filter((event) => event.bRef === 'wall');
  assert.ok(impacts.length >= 1 && impacts.some((event) => event.speed > 30), 'crash reported');
  assert.ok(Number.isFinite(car.body.position.x + car.body.position.y + car.body.angularVelocity.x));
});

test('rides over a curb, lands a jump, and two cars colliding share momentum', () => {
  // A 12 cm curb across the road, taken at 10 m/s.
  const curb = spawn('family_sedan');
  curb.world.addStaticBox(0, 0.06, -30, 6, 0.06, 1.5, 0, { surface: 'concrete' });
  run(curb.world, 1);
  launch(curb.car, 10);
  curb.car.input.drive = 0.4;
  let lowestUp = 1;
  let highest = 0;
  run(curb.world, 5, () => {
    lowestUp = Math.min(lowestUp, upright(curb.car));
    highest = Math.max(highest, curb.car.body.position.y);
  });
  assert.ok(curb.car.body.position.z < -45, `kept going over the curb (z ${curb.car.body.position.z})`);
  assert.ok(lowestUp > 0.985, `stayed level over the curb (${lowestUp})`);
  assert.ok(highest > curb.car.tuning.centreOfMass.y + 0.05, 'the body rose over it');

  // A ramp in the terrain: 1.5 m up over 12 m, then a drop back to the road.
  const jump = spawn('sports_coupe', { ground: { heightAt: (x, z) => (z < -40 && z > -52 ? (-40 - z) * 0.125 : 0) } });
  run(jump.world, 1);
  launch(jump.car, 24);
  jump.car.input.drive = 0.5;
  let airborne = 0;
  let peak = 0;
  run(jump.world, 6, () => {
    if (jump.car.groundedWheels === 0) airborne += 1;
    peak = Math.max(peak, jump.car.body.position.y);
    assert.ok(Number.isFinite(jump.car.body.position.y) && jump.car.body.position.y < 8, 'no explosion');
  });
  console.log(`sports_coupe jump: ${airborne} steps in the air, peak height ${peak.toFixed(2)} m, upright ${upright(jump.car).toFixed(3)} after landing`);
  assert.ok(airborne > 15, `it flew (${airborne} steps)`);
  assert.ok(upright(jump.car) > 0.95 && jump.car.groundedWheels === 4, 'landed on its wheels');
  assert.ok(jump.car.body.position.y < jump.car.tuning.centreOfMass.y + 0.1, 'and settled');

  // A moving sedan runs into the back of a parked compact.
  const world = new PhysicsWorld();
  const sedan = new Vehicle(world, deriveVehicleTuning(VEHICLE_CATALOG.family_sedan), { z: 0, userRef: 'sedan' });
  const compact = new Vehicle(world, deriveVehicleTuning(VEHICLE_CATALOG.compact_hatch), { z: -12, userRef: 'compact' });
  run(world, 3);
  assert.ok(compact.body.asleep);
  launch(sedan, 15);
  let pushed = 0;
  let sedanAfter = 15;
  run(world, 1, () => {
    if (compact.speed > pushed) {
      pushed = compact.speed;
      sedanAfter = sedan.speed;
    }
  });
  const impacts = world.events.items.slice(0, world.events.count).filter((event) => event.aRef === 'sedan' && event.bRef === 'compact');
  console.log(`sedan (${sedan.tuning.mass} kg) at 15 m/s into a parked compact (${compact.tuning.mass} kg): compact leaves at ${pushed.toFixed(1)} m/s, `
    + `sedan keeps ${sedanAfter.toFixed(1)} m/s, ${impacts.length} impact events`);
  assert.ok(impacts.length >= 1 && impacts[0].speed > 8, 'the crash is reported with its closing speed');
  assert.ok(pushed > 6 && pushed < 16, `the compact is shoved forward (${pushed})`);
  assert.ok(sedanAfter < 13 && sedanAfter > 2, `the sedan loses speed (${sedanAfter})`);
  assert.ok(sedan.body.position.z - compact.body.position.z > 3.2, 'they do not end up inside each other');
});

test('a car left on its roof or its side is righted onto its wheels', () => {
  for (const [label, quaternion] of [['roof', { x: 0, y: 0, z: 1, w: 0 }], ['side', { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 }]]) {
    const { world, car } = spawn('family_sedan');
    run(world, 0.5);
    car.body.setPose(0, 1.3, 0, quaternion);
    car.body.wake();
    let lowest = Infinity;
    run(world, 9, () => {
      lowest = Math.min(lowest, car.body.position.y);
      assert.ok(Number.isFinite(car.body.position.y) && car.body.position.y < 6, 'no explosion');
    });
    console.log(`family_sedan from its ${label}: upright ${upright(car).toFixed(3)}, wheels down ${car.groundedWheels}, lowest centre ${lowest.toFixed(2)} m`);
    assert.ok(upright(car) > 0.97 && car.groundedWheels === 4, `back on its wheels from its ${label}`);
    assert.ok(lowest > 0.2, 'the hull never sank into the ground');
    assert.ok(Math.hypot(car.body.position.x, car.body.position.z) < 6, 'it did not wander off');
  }
});

function traffic(count) {
  const world = new PhysicsWorld({ ground: { heightAt: (x, z) => Math.sin(x * 0.05) * 0.6 + Math.cos(z * 0.04) * 0.5 } });
  for (let i = 0; i < 2000; i += 1) {
    world.addStaticBox((i % 50) * 16 - 400 + 8, 3, Math.floor(i / 50) * 16 - 320 + 8, 4, 4, 4, 0, { group: 1 + (i % 16) });
  }
  const ids = Object.keys(VEHICLE_CATALOG).filter((id) => VEHICLE_CATALOG[id].handling.driveWheels.length <= 5
    && VEHICLE_CATALOG[id].class !== 'motorcycle');
  const cars = [];
  for (let i = 0; i < count; i += 1) {
    const car = new Vehicle(world, deriveVehicleTuning(VEHICLE_CATALOG[ids[i % ids.length]]),
      { x: (i % 8) * 16 - 64, z: Math.floor(i / 8) * 16 - 40, heading: (i % 4) * Math.PI * 0.5 });
    cars.push(car);
  }
  const walkers = [];
  for (let i = 0; i < 60; i += 1) {
    walkers.push(new CharacterController(world, { x: -67 + (i % 10) * 0.7, z: 60.5 + Math.floor(i / 10) * 1.1 }));
  }
  return { world, cars, walkers };
}

test('forty cars and sixty characters run deterministically and inside the step budget', () => {
  const digests = [];
  let perStep = 0;
  for (let pass = 0; pass < 2; pass += 1) {
    const { world, cars, walkers } = traffic(40);
    const start = performance.now();
    for (let step = 0; step < 600; step += 1) {
      for (let i = 0; i < walkers.length; i += 1) {
        walkers[i].input.x = Math.sin(step * 0.01 + i) * 3;
        walkers[i].input.z = Math.cos(step * 0.013 + i * 2) * 3;
        walkers[i].input.jump = (step + i * 13) % 240 === 0;
      }
      for (let i = 0; i < cars.length; i += 1) {
        cars[i].input.drive = (step + i * 7) % 300 < 200 ? 0.7 : -0.5;
        cars[i].input.steer = Math.sin(step * 0.02 + i);
        cars[i].input.handbrake = (step + i * 11) % 400 > 380 ? 1 : 0;
      }
      world.step();
    }
    perStep = (performance.now() - start) / 600;
    let walked = 0;
    for (const walker of walkers) {
      walked += walker.position.x * 3 + walker.position.y * 5 + walker.position.z * 7;
      assert.ok(walker.position.y >= world.ground.heightAt(walker.position.x, walker.position.z) - 1e-6, 'feet on or above the ground');
    }
    assert.ok(Number.isFinite(walked));
    digests.push(`${world.digest()}:${walked}`);
    for (const car of cars) assert.ok(Number.isFinite(car.body.position.x + car.body.position.y + car.body.position.z));
  }
  console.log(`40 driven cars and 60 walking characters among 2000 static colliders: ${perStep.toFixed(3)} ms per step`);
  assert.equal(digests[0], digests[1]);
  assert.ok(perStep < 4, `step time ${perStep} ms`);
});

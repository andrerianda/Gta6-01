// Pure parts of the physics and vehicle systems: drive controls, damage maths, spawn data,
// level of detail, explosion falloff, and the physics system stepping a world deterministically.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createVehicleControls, easeSteering, resolveDriveInput, brakeLampsLit, STEER_IN_RATE } from '../../../game/src/vehicles/vehicleControls.js';
import {
  impactDamage, damageStageOf, DAMAGE_STAGE, dentVertices, MAX_DENT, windowStateAfter, bumperHitBy, dentDepthOf,
} from '../../../game/src/vehicles/vehicleDamage.js';
import { planVehicleSpawn, wheelPlacementsOf, vehicleRadiusOf } from '../../../game/src/vehicles/vehicleSpawning.js';
import { chooseVehicleLevel, VEHICLE_LEVEL } from '../../../game/src/vehicles/vehicleLevelOfDetail.js';
import { blastFalloff, createPhysicsEventPublisher } from '../../../game/src/world/physicsEvents.js';
import { createPhysicsSimulationSystem } from '../../../game/src/world/physicsSimulation.js';
import { VEHICLE_CATALOG } from '../../../game/src/catalog/vehicleCatalog.js';
import { Vehicle } from '../../../game/src/physics/vehicles/Vehicle.js';
import { deriveVehicleTuning } from '../../../game/src/physics/vehicles/vehicleTuning.js';
import { GAME_EVENTS } from '../../../game/src/core/events/gameEvents.js';

const coupe = VEHICLE_CATALOG.sports_coupe;

test('controls: throttle drives, brake brakes, and reverses only with autoReverse', () => {
  const controls = createVehicleControls();
  const out = { drive: 0, steer: 0, handbrake: 0 };
  controls.throttle = 1;
  assert.equal(resolveDriveInput(controls, 0, out, 1 / 60).drive, 1);
  controls.throttle = 0;
  controls.brake = 1;
  assert.equal(resolveDriveInput(controls, 10, out, 1 / 60).drive, -1, 'brakes while rolling forward');
  assert.equal(resolveDriveInput(controls, 0, out, 1 / 60).drive, 0, 'a traffic car told to brake stays stopped');
  controls.autoReverse = true;
  assert.equal(resolveDriveInput(controls, 0, out, 1 / 60).drive, -1, 'the player reverses from a standstill');
  assert.equal(resolveDriveInput(controls, -5, out, 1 / 60).drive, 1, 'brake while rolling back brakes');
  controls.throttle = 1;
  assert.equal(resolveDriveInput(controls, 10, out, 1 / 60).drive, -1, 'brake wins over throttle');
  assert.equal(brakeLampsLit({ drive: -1 }, 10, controls), true);
});

test('controls: keyboard steering eases in and snaps back through centre faster', () => {
  let steer = 0;
  for (let i = 0; i < 6; i += 1) steer = easeSteering(steer, 1, 1 / 60);
  assert.ok(Math.abs(steer - (6 * STEER_IN_RATE) / 60) < 1e-9);
  let frames = 0;
  while (steer < 1) { steer = easeSteering(steer, 1, 1 / 60); frames += 1; }
  assert.ok(frames < 16, 'full lock in about a quarter of a second');
  let back = 0;
  while (steer > 0) { steer = easeSteering(steer, 0, 1 / 60); back += 1; }
  assert.ok(back < frames + 6, 'returns faster than it turns in');
  assert.equal(easeSteering(0.5, 3, 10), 1, 'clamped to full lock');
});

test('damage: taps do nothing, a 50 km/h wall crash takes about half a sports car', () => {
  assert.equal(impactDamage(1470 * 1.5, 1470), 0);
  const speed = 50 / 3.6;
  const crash = impactDamage(0.5 * 1470 * speed * speed, 1470);
  assert.ok(crash > coupe.durability * 0.35 && crash < coupe.durability * 0.65, `crash ${crash}`);
  assert.equal(damageStageOf(800, 800), DAMAGE_STAGE.INTACT);
  assert.equal(damageStageOf(250, 800), DAMAGE_STAGE.SMOKING);
  assert.equal(damageStageOf(100, 800), DAMAGE_STAGE.BURNING);
  assert.equal(damageStageOf(0, 800), DAMAGE_STAGE.WRECKED);
  assert.ok(dentDepthOf(10000) <= MAX_DENT);
});

test('damage: dents fall off with distance and never exceed the cap', () => {
  const original = new Float32Array([0, 0, 0, 0.3, 0, 0, 2, 0, 0]);
  const positions = Float32Array.from(original);
  const moved = dentVertices(positions, original, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, 1, 0.1);
  assert.equal(moved, 2);
  assert.ok(Math.abs(positions[2] - 0.1) < 1e-6);
  assert.ok(positions[5] > 0 && positions[5] < 0.1);
  assert.equal(positions[8], 0, 'outside the radius nothing moves');
  for (let i = 0; i < 20; i += 1) dentVertices(positions, original, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, 1, 0.1);
  assert.ok(positions[2] <= MAX_DENT + 1e-6);
  const flat = new Float32Array([0.3, 0, 0, 2, 0, 0]);
  const normals = new Float32Array([0, 0, 1, 0, 0, 1]);
  dentVertices(flat, Float32Array.from(flat), { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, 1, 0.1, normals);
  assert.ok(normals[0] < 0 && normals[2] > 0.9, 'the bowl wall leans towards the dent centre');
  assert.deepEqual([...normals.slice(3)], [0, 0, 1], 'normals outside the dent stay as built');
});

test('damage: windows crack then shatter, bumpers by impact end', () => {
  assert.equal(windowStateAfter(0, 0.3, 30), 1);
  assert.equal(windowStateAfter(1, 0.3, 40), 2);
  assert.equal(windowStateAfter(0, 0.3, 200), 2);
  assert.equal(windowStateAfter(0, 3, 500), 0, 'far from the pane nothing happens');
  assert.equal(bumperHitBy(-2.1, 4.46), 'front');
  assert.equal(bumperHitBy(2.1, 4.46), 'rear');
  assert.equal(bumperHitBy(0.2, 4.46), null);
});

test('spawn: colours from the catalog, seats, wheels from the registry extras', () => {
  const plan = planVehicleSpawn(coupe, { position: { x: 1, z: 2 }, heading: 0.5 }, () => 0.99);
  assert.ok(coupe.colors.includes(plan.colour));
  assert.equal(plan.seats.length, coupe.seats);
  assert.equal(plan.seats[0].name, 'driver');
  assert.equal(plan.maxHealth, coupe.durability);
  assert.equal(planVehicleSpawn(coupe, { position: { x: 0, z: 0 }, colour: '#123456' }).colour, '#123456');
  const wheels = wheelPlacementsOf(coupe, { wheel_radius: 0.35, track: 1.58, wheelbase: 2.62 });
  assert.equal(wheels.length, 4);
  assert.ok(Math.abs(wheels[1].x - 0.79) < 1e-9 && Math.abs(wheels[0].z + 1.31) < 1e-9 && wheels[2].z > 0);
  assert.ok(vehicleRadiusOf(coupe) > 2);
  for (const entry of Object.values(VEHICLE_CATALOG)) assert.ok(planVehicleSpawn(entry, { position: { x: 0, z: 0 } }).colour);
});

test('level of detail: near, middle, far and hidden with hysteresis', () => {
  assert.equal(chooseVehicleLevel(10, VEHICLE_LEVEL.FAR), VEHICLE_LEVEL.NEAR);
  assert.equal(chooseVehicleLevel(19, VEHICLE_LEVEL.NEAR), VEHICLE_LEVEL.NEAR, 'stays near just past the boundary');
  assert.equal(chooseVehicleLevel(19, VEHICLE_LEVEL.MID), VEHICLE_LEVEL.MID);
  assert.equal(chooseVehicleLevel(47, VEHICLE_LEVEL.NEAR), VEHICLE_LEVEL.MID);
  assert.equal(chooseVehicleLevel(72, VEHICLE_LEVEL.MID), VEHICLE_LEVEL.MID, 'stays middle just past the boundary');
  assert.equal(chooseVehicleLevel(72, VEHICLE_LEVEL.FAR), VEHICLE_LEVEL.FAR);
  assert.equal(chooseVehicleLevel(200, VEHICLE_LEVEL.NEAR), VEHICLE_LEVEL.FAR);
  assert.equal(chooseVehicleLevel(600, VEHICLE_LEVEL.FAR), VEHICLE_LEVEL.HIDDEN);
  assert.equal(chooseVehicleLevel(300, VEHICLE_LEVEL.FAR, 1, 250), VEHICLE_LEVEL.HIDDEN, 'the draw distance wins');
  assert.equal(chooseVehicleLevel(300, VEHICLE_LEVEL.FAR, 1, Infinity, true), VEHICLE_LEVEL.NEAR, "the player's car stays near");
});

function fakeContext() {
  const queued = [];
  return {
    queued,
    focus: { groundLevel: 0 },
    atmosphere: null,
    events: { queue: (topic, payload) => queued.push({ topic, payload }), emit() {}, on: () => () => {} },
    systems: { find: () => null, get: () => null },
  };
}

async function runCrash() {
  const context = fakeContext();
  const physics = createPhysicsSimulationSystem(context);
  await physics.init(() => {});
  physics.start();
  const tuning = deriveVehicleTuning(coupe);
  const a = new Vehicle(physics.world, tuning, { x: 0, z: 0, heading: 0, userRef: 1 });
  const b = new Vehicle(physics.world, tuning, { x: 0, z: -14, heading: Math.PI, userRef: 2 });
  physics.addStaticColliders([{ shape: 'box', position: { x: 0, y: 1, z: 0 }, size: { x: 2, y: 2, z: 2 } }], { x: 30, y: 0, z: 0 }, { group: 'sector' });
  physics.removeStaticColliders('sector');
  for (let i = 0; i < 150; i += 1) {
    a.input.drive = 1;
    b.input.drive = 1;
    physics.fixedUpdate(1 / 60);
  }
  return { context, physics, a, b };
}

test('physics system: steps deterministically and reports vehicle collisions', async () => {
  const first = await runCrash();
  const second = await runCrash();
  assert.equal(first.physics.world.digest(), second.physics.world.digest());
  const collisions = first.context.queued.filter((each) => each.topic === GAME_EVENTS.VEHICLE_COLLIDED);
  assert.ok(collisions.length >= 2, 'a head-on crash reaches both cars');
  const ids = new Set(collisions.map((each) => each.payload.vehicleId));
  assert.ok(ids.has(1) && ids.has(2));
  assert.ok(collisions[0].payload.energy > 0 && collisions[0].payload.position);
  const pushed = first.physics.explode({ position: { x: 0, y: 0.5, z: -7 }, radius: 10, power: 9000, causeId: 'test' });
  assert.ok(pushed >= 2);
  assert.ok(first.context.queued.some((each) => each.topic === GAME_EVENTS.EXPLOSION_DETONATED));
  assert.equal(first.physics.raycast(0, 20, -7, 0, -1, 0, 50), true);
  assert.equal(blastFalloff(0, 5), 1);
  assert.equal(blastFalloff(5, 5), 0);
  assert.equal(typeof createPhysicsEventPublisher, 'function');
});

test('physics system: 60 vehicles step within the budget', async () => {
  const context = fakeContext();
  const physics = createPhysicsSimulationSystem(context);
  await physics.init(() => {});
  const tuning = deriveVehicleTuning(VEHICLE_CATALOG.family_sedan);
  const cars = [];
  for (let i = 0; i < 60; i += 1) cars.push(new Vehicle(physics.world, tuning, { x: (i % 10) * 8, z: Math.floor(i / 10) * 12, heading: 0, userRef: i }));
  for (const car of cars) car.input.drive = 0.6;
  for (let i = 0; i < 30; i += 1) physics.fixedUpdate(1 / 60);
  const start = process.hrtime.bigint();
  for (let i = 0; i < 60; i += 1) physics.fixedUpdate(1 / 60);
  const perStep = Number(process.hrtime.bigint() - start) / 1e6 / 60;
  console.log(`# 60 driving vehicles: ${perStep.toFixed(3)} ms per step`);
  assert.ok(perStep < 8, `step took ${perStep} ms`);
});

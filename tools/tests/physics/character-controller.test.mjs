// Tests of the character capsule controller: walking, sliding along walls, curbs and steps,
// the slope limit, jumping and landing, never falling through the ground, and cars pushing it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PhysicsWorld } from '../../../game/src/physics/PhysicsWorld.js';
import { CharacterController } from '../../../game/src/physics/characters/CharacterController.js';
import { PHYSICS_EVENT } from '../../../game/src/physics/physicsEvents.js';
import { LAYER } from '../../../game/src/physics/collisionLayers.js';

function run(world, seconds, each) {
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i += 1) {
    if (each) each(i);
    world.step();
  }
}

test('walks at the wanted speed, slides along a wall and is stopped by it', () => {
  const world = new PhysicsWorld();
  world.addStaticBox(0, 1.5, -5.5, 20, 1.5, 0.5);
  const walker = new CharacterController(world, { x: 0, z: 0 });
  walker.input.z = -4;
  run(world, 1);
  assert.ok(walker.grounded);
  assert.ok(Math.abs(walker.position.z + 4) < 0.35, `walked about four metres (${walker.position.z})`);
  walker.input.x = 3;
  run(world, 2);
  assert.ok(walker.position.z > -5 + 0.3 - 0.01 && walker.position.z < -5 + 0.3 + 0.06, `stands against the wall face (${walker.position.z})`);
  assert.ok(walker.position.x > 5.2, `slid along the wall (${walker.position.x})`);
  assert.ok(Math.abs(walker.velocity.z) < 0.05, 'no speed left into the wall');
});

test('climbs curbs and steps up to 0.35 m, is blocked by higher ones, and stops at a steep slope', () => {
  const world = new PhysicsWorld({ ground: { heightAt: (x) => (x > 20 ? (x - 20) * 1.8 : 0) } });
  world.addStaticBox(0, 0.075, -4, 3, 0.075, 1);
  world.addStaticBox(0, 0.15, -8, 3, 0.15, 1);
  world.addStaticBox(0, 0.3, -14, 3, 0.3, 1);
  const walker = new CharacterController(world, { x: 0, z: 0 });
  walker.input.z = -3;
  let highest = 0;
  run(world, 6, () => {
    highest = Math.max(highest, walker.position.y);
  });
  assert.ok(Math.abs(highest - 0.3) < 0.01, `stood on the 0.3 m step (highest ${highest})`);
  assert.ok(walker.position.z > -13 + 0.3 - 0.01 && walker.position.z < -13 + 0.3 + 0.06, `stopped at the face of the 0.6 m block (${walker.position.z})`);
  assert.ok(Math.abs(walker.position.y) < 1e-6 && walker.grounded, 'back on the ground before it');

  const climber = new CharacterController(world, { x: 15, z: 30 });
  climber.input.x = 4;
  run(world, 4);
  assert.ok(climber.position.x < 20.4, `the 60 degree slope stops the climb (${climber.position.x})`);
  assert.ok(climber.position.y < 0.6 && climber.grounded);
});

test('jumps, lands, follows a gentle slope and never falls through the ground', () => {
  const world = new PhysicsWorld({ ground: { heightAt: (x, z) => (z < -10 ? (-10 - z) * 0.3 : 0) + Math.sin(x) * 0.1 } });
  const walker = new CharacterController(world, { x: 0, z: 0 });
  run(world, 0.2);
  walker.input.jump = true;
  let peak = 0;
  let lowestGap = Infinity;
  const track = () => {
    peak = Math.max(peak, walker.position.y);
    lowestGap = Math.min(lowestGap, walker.position.y - world.ground.heightAt(walker.position.x, walker.position.z));
  };
  run(world, 0.1, track);
  walker.input.jump = false;
  run(world, 1.5, track);
  assert.ok(peak > 0.85 && peak < 1.4, `jump height ${peak}`);
  assert.ok(walker.grounded && Math.abs(walker.position.y) < 1e-6, 'landed');

  walker.input.z = -5;
  walker.input.x = 1;
  run(world, 6, track);
  const ground = world.ground.heightAt(walker.position.x, walker.position.z);
  assert.ok(walker.position.z < -25, `walked up the gentle slope (${walker.position.z})`);
  assert.ok(Math.abs(walker.position.y - ground) < 0.02 && walker.grounded, 'feet on the slope');

  walker.placeAt(3, 12, 3);
  walker.input.z = 0;
  walker.input.x = 0;
  run(world, 3, track);
  assert.ok(lowestGap > -1e-6, `never under the ground (${lowestGap})`);
  assert.ok(walker.grounded);
  const landings = world.events.items.slice(0, world.events.count).filter((event) => event.type === PHYSICS_EVENT.LANDING);
  assert.ok(landings.length >= 1 && landings[landings.length - 1].speed > 12, 'the long fall is reported as a landing');
});

test('trigger volumes report bodies and characters entering and leaving, and block nothing', () => {
  const world = new PhysicsWorld();
  const zone = world.addTriggerBox(0, 1, -10, 3, 1.5, 2, 0, { userRef: 'zone' });
  const walker = new CharacterController(world, { x: 1, z: 0, userRef: 'walker' });
  walker.input.z = -4;
  const crate = world.createBody({ colliders: [{ shape: 'box', size: { x: 0.6, y: 0.6, z: 0.6 } }], mass: 20, x: -1, y: 1, z: 0, userRef: 'crate' });
  crate.gravityScale = 0;
  crate.linearDamping = 0;
  crate.linearVelocity.z = -6;
  assert.equal(world.raycast(0, 1, 0, 0, 0, -1, 30), false, 'a solid ray passes through the trigger');
  assert.equal(world.overlapSphere(0, 1, -10, 0.5, LAYER.TRIGGER), 1, 'an overlap that asks for triggers finds it');
  run(world, 5);
  const seen = world.events.items.slice(0, world.events.count)
    .filter((event) => event.type === PHYSICS_EVENT.TRIGGER_ENTER || event.type === PHYSICS_EVENT.TRIGGER_EXIT)
    .map((event) => `${event.aRef} ${event.type} ${event.bRef} ${event.staticHandle === zone}`);
  assert.deepEqual(seen, [
    'crate triggerEnter zone true', 'crate triggerExit zone true', 'walker triggerEnter zone true', 'walker triggerExit zone true',
  ]);
  assert.ok(walker.position.z < -15 && crate.position.z < -25, 'neither was slowed down');
  assert.equal(world.triggers.inside.size, 0);
});

test('a car that drives into a character pushes it aside and knocks it down', () => {
  const world = new PhysicsWorld();
  const walker = new CharacterController(world, { x: 0.3, z: -6, userRef: 'pedestrian' });
  const car = world.createBody({
    colliders: [{ shape: 'box', size: { x: 1.8, y: 1.2, z: 4.2 } }], mass: 1300, x: 0, y: 0.75, z: 0, layer: LAYER.VEHICLE, userRef: 'car',
  });
  car.gravityScale = 0;
  car.linearDamping = 0;
  car.linearVelocity.z = -8;
  run(world, 1.2, () => {
    const dx = Math.abs(walker.position.x - car.position.x);
    const dz = Math.abs(walker.position.z - car.position.z);
    assert.ok(dx > 0.9 + 0.3 - 0.02 || dz > 2.1 + 0.3 - 0.02, 'the capsule is never left inside the hull');
  });
  assert.ok(walker.knockedDown);
  const knocks = world.events.items.slice(0, world.events.count).filter((event) => event.type === PHYSICS_EVENT.KNOCKDOWN);
  assert.equal(knocks.length, 1);
  assert.equal(knocks[0].aRef, 'pedestrian');
  assert.equal(knocks[0].bRef, 'car');
  assert.ok(knocks[0].speed > 5, `hit at ${knocks[0].speed} m/s`);
  assert.ok(walker.position.z < -6.5, 'carried along by the car');
});

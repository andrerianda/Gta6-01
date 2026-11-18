// Tests of the physics world's collision side: queries against known shapes, static colliders
// streamed by sector, rigid bodies that land, rest, collide and never tunnel, and determinism.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PhysicsWorld } from '../../../game/src/physics/PhysicsWorld.js';
import { LAYER, MASK } from '../../../game/src/physics/collisionLayers.js';
import { HIT_KIND } from '../../../game/src/physics/collision/worldQueries.js';
import { PHYSICS_EVENT } from '../../../game/src/physics/physicsEvents.js';

function near(actual, expected, tolerance, label = 'value') {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected} +- ${tolerance}, got ${actual}`);
}

function boxBody(world, x, y, z, halfX, halfY, halfZ, mass, extra = {}) {
  return world.createBody({
    colliders: [{ shape: 'box', size: { x: halfX * 2, y: halfY * 2, z: halfZ * 2 } }], mass, x, y, z, ...extra,
  });
}

function eventsOf(world, type) {
  return world.events.items.slice(0, world.events.count).filter((event) => event.type === type);
}

function sceneWithWall() {
  const world = new PhysicsWorld();
  const wall = world.addStaticBox(0, 1, -10, 2, 1, 0.5, 0, { userRef: 'wall' });
  const pole = world.addStaticCylinder(10, 1.5, 0, 0.5, 1.5, { userRef: 'pole' });
  return { world, wall, pole };
}

test('ray casts hit the terrain, static shapes and bodies at the right distance', () => {
  const { world, wall } = sceneWithWall();
  const hit = world.hit;
  assert.ok(world.raycast(0, 1, 0, 0, 0, -1, 50));
  assert.equal(hit.kind, HIT_KIND.STATIC);
  near(hit.distance, 9.5, 1e-9, 'wall distance');
  near(hit.nz, 1, 1e-9, 'wall normal');
  assert.equal(hit.userRef, 'wall');
  assert.equal(hit.handle, wall);
  near(hit.z, -9.5, 1e-9, 'wall point');

  assert.ok(world.raycast(0, 1, 0, 1, 0, 0, 50));
  near(hit.distance, 9.5, 1e-6, 'pole distance');
  assert.equal(hit.userRef, 'pole');

  assert.ok(world.raycast(5, 3, 5, 0, -1, 0, 50));
  assert.equal(hit.kind, HIT_KIND.GROUND);
  near(hit.distance, 3, 1e-3, 'ground distance');
  near(hit.ny, 1, 1e-9, 'ground normal');

  assert.equal(world.raycast(0, 1, 0, 0, 0, -1, 50, LAYER.GROUND), false, 'the mask leaves the wall out');
  assert.equal(world.raycast(0, 1, 0, 0, 0, -1, 50, MASK.SOLID, [wall]), false, 'ignored by handle');
  assert.equal(world.raycast(0, 1, 0, 0, 0, -1, 50, MASK.SOLID, ['wall']), false, 'ignored by user reference');
  assert.equal(world.raycast(0, 1, 0, 0, 0, -1, 9), false, 'too short to reach');

  const body = boxBody(world, 0, 1, 10, 1, 0.5, 0.5, 50, { userRef: 'crate' });
  assert.ok(world.raycast(0, 1, 0, 0, 0, 1, 50));
  assert.equal(hit.kind, HIT_KIND.BODY);
  assert.equal(hit.body, body);
  near(hit.distance, 9.5, 1e-9, 'body distance');
  assert.equal(world.raycast(0, 1, 0, 0, 0, 1, 50, MASK.SOLID, [body]), false, 'body ignored');

  const hill = new PhysicsWorld({ ground: { heightAt: (x) => x * 0.1 } });
  assert.ok(hill.raycast(10, 5, 0, 0, -1, 0, 50));
  near(hill.hit.distance, 4, 1e-3, 'slope distance');
  assert.ok(hill.hit.nx < -0.05 && hill.hit.ny > 0.9, 'slope normal leans downhill');
});

test('sphere casts, capsule casts, overlaps, support and line of sight agree with the shapes', () => {
  const { world } = sceneWithWall();
  const hit = world.hit;
  assert.ok(world.sphereCast(0, 1, 0, 0, 0, -1, 50, 0.5));
  near(hit.distance, 9, 1e-6, 'sphere stops a radius short of the wall');
  near(hit.z, -9.5, 1e-6, 'sphere contact point');
  assert.ok(world.sphereCast(5, 3, 5, 0, -1, 0, 50, 0.5));
  near(hit.distance, 2.5, 1e-3, 'sphere lands on the ground');
  assert.equal(world.sphereCast(5, 1, 0, 0, 0, -1, 50, 0.5), false, 'sphere passes beside the wall');

  assert.ok(world.capsuleCast(0, 0.5, 0, 0, 1.5, 0, 0.4, 0, 0, -1, 50));
  near(hit.distance, 9.1, 0.01, 'capsule stops a radius short of the wall');
  near(hit.nz, 1, 1e-6, 'capsule normal');
  assert.equal(world.capsuleCast(5, 0.4, 0, 5, 1.4, 0, 0.4, 1, 0, 0, 4), false, 'a capsule glides along flat ground');
  assert.ok(world.capsuleCast(5, 1.4, 0, 5, 2.4, 0, 0.4, 0, -1, 0, 4));
  near(hit.distance, 1, 0.01, 'capsule drops onto the ground');
  assert.equal(hit.kind, HIT_KIND.GROUND);

  assert.equal(world.overlapSphere(0, 1, -9.3, 0.3), 1);
  assert.equal(world.overlaps.kinds[0], HIT_KIND.STATIC);
  assert.equal(world.overlapSphere(0, 1, -8, 0.3), 0);
  const body = boxBody(world, 20, 1, 20, 0.5, 0.5, 0.5, 20);
  assert.equal(world.overlapCapsule(20.7, 0.6, 20, 20.7, 1.6, 20, 0.3), 1);
  assert.equal(world.overlaps.bodies[0], body);
  assert.equal(world.overlapCapsule(21.5, 0.6, 20, 21.5, 1.6, 20, 0.3), 0);
  assert.equal(world.overlapSphere(30, 0.2, 30, 0.3, MASK.SOLID), 1, 'a sphere sunk in the ground overlaps it');

  assert.ok(world.supportBelow(0, 5, -10));
  assert.equal(hit.kind, HIT_KIND.STATIC);
  near(hit.y, 2, 1e-9, 'the top of the wall holds the point up');
  assert.ok(world.supportBelow(5, 5, 5));
  assert.equal(hit.kind, HIT_KIND.GROUND);
  near(hit.distance, 5, 1e-9, 'ground support');

  assert.equal(world.lineOfSight(0, 1, 0, 0, 1, -20), false);
  assert.equal(world.lineOfSight(5, 1, 0, 5, 1, -20), true);
});

test('static colliders stream in and out by sector, and a triangle mesh is solid', () => {
  const world = new PhysicsWorld();
  const handles = [];
  for (let i = 0; i < 2000; i += 1) {
    const sector = 1 + (i % 20);
    handles.push(world.addStaticBox((i % 50) * 12, 2, Math.floor(i / 50) * 12, 3, 2, 3, i * 0.37, { group: sector, userRef: i }));
  }
  assert.equal(world.statics.count, 2000);
  assert.ok(world.raycast(24, 10, 0, 0, -1, 0, 20), 'box 2 (sector 3) is there');
  assert.equal(world.hit.userRef, 2);
  near(world.hit.distance, 6, 1e-9, 'box top');
  assert.equal(world.removeStaticGroup(3), 100);
  assert.equal(world.statics.count, 1900);
  assert.ok(world.raycast(24, 10, 0, 0, -1, 0, 20));
  assert.equal(world.hit.kind, HIT_KIND.GROUND, 'the sector is gone, the ray reaches the ground');
  assert.equal(world.removeStatic(handles[0]), true);
  assert.equal(world.removeStatic(handles[0]), false, 'a stale handle removes nothing');
  assert.equal(world.removeStatic(handles[2]), false, 'a handle of a removed sector is stale');
  world.addStaticBox(24, 2, 0, 3, 2, 3, 0, { group: 3, userRef: 'again' });
  assert.ok(world.raycast(24, 10, 0, 0, -1, 0, 20));
  assert.equal(world.hit.userRef, 'again');

  // A sloping deck as a two-triangle mesh, placed away from the boxes.
  const [deck] = world.addStatics([{
    shape: 'mesh', vertices: [-4, 2, -4, 4, 2, -4, 4, 2, 4, -4, 2, 4], indices: [0, 2, 1, 0, 3, 2],
  }], { x: -50, y: 0, z: -50 }, { userRef: 'deck', surface: 'wood' });
  assert.ok(world.raycast(-50, 6, -50, 0, -1, 0, 20));
  assert.equal(world.hit.handle, deck);
  near(world.hit.distance, 4, 1e-6, 'deck height');
  assert.ok(world.sphereCast(-49, 6, -51, 0, -1, 0, 20, 0.5));
  near(world.hit.distance, 3.5, 1e-6, 'sphere on the deck');
  const crate = boxBody(world, -50, 3, -50, 0.4, 0.4, 0.4, 30);
  for (let i = 0; i < 240; i += 1) world.step();
  near(crate.position.y, 2.4, 0.02, 'the crate rests on the deck');
  assert.ok(crate.asleep, 'and sleeps');
});

test('a dropped box lands, reports the impact, rests and sleeps', () => {
  const world = new PhysicsWorld();
  const box = boxBody(world, 0, 3, 0, 0.5, 0.25, 0.8, 80, { userRef: 'box' });
  let lowest = Infinity;
  for (let i = 0; i < 300; i += 1) {
    world.step();
    lowest = Math.min(lowest, box.position.y);
  }
  assert.ok(lowest > 0.2, `never sinks into the ground (lowest centre ${lowest})`);
  near(box.position.y, 0.25, 0.015, 'resting height');
  assert.ok(box.asleep, 'asleep at rest');
  const impacts = eventsOf(world, PHYSICS_EVENT.IMPACT);
  assert.ok(impacts.length >= 1, 'landing reported');
  assert.equal(impacts[0].aRef, 'box');
  assert.equal(impacts[0].ground, true);
  assert.ok(impacts[0].speed > 5 && impacts[0].speed < 8.5, `landing speed ${impacts[0].speed}`);
  world.events.clear();
  assert.equal(world.events.count, 0);

  // On a slope with friction a box stays where it lands; a tilted start settles flat on it.
  const hill = new PhysicsWorld({ ground: { heightAt: (x) => x * 0.2 } });
  const brick = boxBody(hill, 0, 0.6, 0, 0.5, 0.25, 0.5, 40, { friction: 0.9 });
  for (let i = 0; i < 300; i += 1) hill.step();
  assert.ok(Math.abs(brick.position.x) < 0.25, `holds on the slope (x ${brick.position.x})`);
  assert.ok(brick.asleep);
});

test('a body at 60 m/s does not pass through a thin wall', () => {
  const world = new PhysicsWorld();
  world.addStaticBox(0, 1.5, -30, 6, 1.5, 0.1, 0, { userRef: 'thin wall' });
  const car = boxBody(world, 0, 1, 0, 0.9, 0.6, 2.1, 1300, { layer: LAYER.VEHICLE });
  car.gravityScale = 0;
  car.linearVelocity.z = -60;
  let furthest = 0;
  for (let i = 0; i < 90; i += 1) {
    world.step();
    furthest = Math.min(furthest, car.position.z - 2.1);
  }
  assert.ok(furthest > -30.05, `front never beyond the wall face (reached ${furthest})`);
  assert.ok(car.position.z > -28, 'stayed on its side');
  const impacts = eventsOf(world, PHYSICS_EVENT.IMPACT);
  assert.ok(impacts.length >= 1);
  const hardest = impacts.reduce((best, event) => (event.energy > best.energy ? event : best));
  assert.equal(hardest.bRef, 'thin wall');
  assert.ok(hardest.speed > 30, `closing speed ${hardest.speed}`);
  assert.ok(hardest.nz < -0.9, 'normal points from the car into the wall');
  assert.ok(hardest.energy > 5e5, `energy ${hardest.energy}`);
});

test('two bodies colliding share momentum, and a sleeping body is woken by the hit', () => {
  for (const sleeping of [false, true]) {
    const world = new PhysicsWorld();
    const a = boxBody(world, -6, 5, 0, 1, 0.5, 0.5, 1000, { userRef: 'a', restitution: 0.2 });
    const b = boxBody(world, 0, 5, 0, 1, 0.5, 0.5, 1500, { userRef: 'b', restitution: 0.2 });
    a.gravityScale = 0;
    b.gravityScale = 0;
    a.linearDamping = b.linearDamping = 0;
    a.linearVelocity.x = 12;
    if (sleeping) b.sleep();
    for (let i = 0; i < 60; i += 1) world.step();
    const momentum = a.mass * a.linearVelocity.x + b.mass * b.linearVelocity.x;
    near(momentum, 12000, 120, `momentum (sleeping ${sleeping})`);
    assert.ok(b.linearVelocity.x > 4.5 && b.linearVelocity.x < 6.5, `struck body speed ${b.linearVelocity.x}`);
    assert.ok(a.linearVelocity.x < b.linearVelocity.x, 'they separate');
    assert.ok(a.position.x + 1 <= b.position.x - 1 + 0.02, 'no overlap left');
    const impacts = eventsOf(world, PHYSICS_EVENT.IMPACT);
    assert.ok(impacts.length >= 1);
    assert.equal(impacts[0].aRef, 'a');
    assert.equal(impacts[0].bRef, 'b');
    assert.ok(impacts[0].nx > 0.9, 'normal from a to b');
  }
});

function runPile(chunks) {
  const world = new PhysicsWorld({ ground: { heightAt: (x, z) => Math.sin(x * 0.3) * 0.2 + z * 0.02 } });
  world.addStaticBox(3, 0.5, 0, 0.2, 1.5, 4, 0.3);
  world.addStaticCylinder(-2, 1, 1, 0.3, 1);
  for (let i = 0; i < 12; i += 1) {
    const body = boxBody(world, (i % 3) * 0.7 - 0.5, 1 + i * 0.9, (i % 2) * 0.4, 0.3 + (i % 4) * 0.05, 0.25, 0.4, 20 + i * 5);
    body.angularVelocity.x = i * 0.3;
    body.linearVelocity.x = (i % 5) - 2;
  }
  let steps = 0;
  if (chunks) {
    // The same 360 steps, asked for in uneven pieces as a slow renderer would.
    const pieces = [0.5, 1 / 60, 2.2, 0.05, 1 / 30, 3.2];
    for (const piece of pieces) steps += world.advance(piece, 1000);
    while (steps < 360) {
      world.step();
      steps += 1;
    }
  } else {
    for (; steps < 360; steps += 1) world.step();
  }
  for (const body of world.bodies) {
    assert.ok(Number.isFinite(body.position.x + body.position.y + body.position.z), 'finite pose');
    assert.ok(body.position.y > -1 && body.position.y < 20, `body stays in the scene (y ${body.position.y})`);
  }
  return { digest: world.digest(), steps: world.stepCount };
}

test('the simulation is deterministic, also when steps come in uneven batches', () => {
  const first = runPile(false);
  const second = runPile(false);
  const batched = runPile(true);
  assert.equal(first.digest, second.digest);
  assert.equal(batched.steps >= 360, true);
  if (batched.steps === 360) assert.equal(batched.digest, first.digest);
});

test('queries are cheap in a field of two thousand static colliders', () => {
  const world = new PhysicsWorld();
  for (let i = 0; i < 2000; i += 1) {
    world.addStaticBox((i % 50) * 14 - 350, 3, Math.floor(i / 50) * 14 - 280, 4, 3, 4, i * 0.21, { group: 1 + (i % 16) });
  }
  let hits = 0;
  const start = performance.now();
  for (let i = 0; i < 2000; i += 1) {
    const angle = i * 0.618;
    if (world.raycast((i % 40) * 15 - 300, 1.5, (i % 37) * 14 - 250, Math.cos(angle), 0, Math.sin(angle), 60)) hits += 1;
  }
  const rayMs = performance.now() - start;
  const startSweep = performance.now();
  for (let i = 0; i < 1000; i += 1) {
    const angle = i * 0.618;
    world.capsuleCast((i % 40) * 15 - 300, 0.5, (i % 37) * 14 - 250, (i % 40) * 15 - 300, 1.4, (i % 37) * 14 - 250, 0.35,
      Math.cos(angle), 0, Math.sin(angle), 0.5);
  }
  const sweepMs = performance.now() - startSweep;
  console.log(`2000 ray casts of 60 m: ${rayMs.toFixed(2)} ms (${hits} hits); 1000 capsule casts of 0.5 m: ${sweepMs.toFixed(2)} ms`);
  assert.ok(hits > 500);
  assert.ok(rayMs < 200, `ray casts took ${rayMs} ms`);
});

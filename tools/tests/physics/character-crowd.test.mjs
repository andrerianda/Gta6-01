// Tests of characters among characters: the queries see the capsules (on LAYER.CHARACTER only),
// characters keep apart from each other without being pushed through walls, and push() and
// world.explode() shove them (knocking down the near ones) as well as the bodies.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PhysicsWorld } from '../../../game/src/physics/PhysicsWorld.js';
import { CharacterController } from '../../../game/src/physics/characters/CharacterController.js';
import { PHYSICS_EVENT } from '../../../game/src/physics/physicsEvents.js';
import { LAYER, MASK } from '../../../game/src/physics/collisionLayers.js';
import { HIT_KIND, createOverlapList, createQueryHit } from '../../../game/src/physics/collision/worldQueries.js';

function run(world, seconds, each) {
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i += 1) {
    if (each) each(i);
    world.step();
  }
}

function closestPair(walkers) {
  let closest = Infinity;
  for (let i = 0; i < walkers.length; i += 1) {
    for (let j = i + 1; j < walkers.length; j += 1) {
      const a = walkers[i].position;
      const b = walkers[j].position;
      closest = Math.min(closest, Math.hypot(a.x - b.x, a.z - b.z));
    }
  }
  return closest;
}

test('rays, sphere casts and overlaps see characters on LAYER.CHARACTER only', () => {
  const world = new PhysicsWorld();
  const walker = new CharacterController(world, { x: 0, z: -5, userRef: 'ped_7' });
  const hit = createQueryHit();
  assert.equal(world.raycast(0, 1, 0, 0, 0, -1, 20, MASK.SOLID, null, hit), false, 'solid mask passes people');
  assert.ok(world.raycast(0, 1, 0, 0, 0, -1, 20, MASK.SHOT, null, hit));
  assert.equal(hit.kind, HIT_KIND.CHARACTER);
  assert.equal(hit.character, walker);
  assert.equal(hit.userRef, 'ped_7');
  assert.equal(hit.layer, LAYER.CHARACTER);
  assert.ok(Math.abs(hit.distance - 4.7) < 0.01, `front of the capsule (${hit.distance})`);
  assert.ok(hit.nz > 0.99, 'normal faces the caster');
  assert.equal(world.raycast(0, 2.2, 0, 0, 0, -1, 20, MASK.SHOT, null, hit), false, 'over the head');
  assert.equal(world.raycast(0, 1, 0, 0, 0, -1, 20, MASK.SHOT, ['ped_7'], hit), false, 'ignored by userRef');
  assert.equal(world.raycast(0, 1, 0, 0, 0, -1, 20, MASK.SHOT, [walker], hit), false, 'ignored by controller');
  assert.ok(world.sphereCast(0.5, 1, 0, 0, 0, -1, 20, 0.3, LAYER.CHARACTER, null, hit));
  // Centres 0.5 apart sideways, radii 0.3 + 0.3: touching 0.33 before the axis.
  assert.ok(Math.abs(hit.distance - (5 - Math.sqrt(0.36 - 0.25))) < 0.03, `sphere touches early (${hit.distance})`);
  const found = createOverlapList(8);
  assert.equal(world.overlapSphere(0.4, 1, -5, 0.2, LAYER.CHARACTER, null, found), 1);
  assert.equal(found.kinds[0], HIT_KIND.CHARACTER);
  assert.equal(found.bodies[0], walker);
  assert.ok(world.capsuleCast(0, 0.5, 0, 0, 1.5, 0, 0.3, 0, 0, -1, 20, LAYER.CHARACTER, null, hit));
  assert.equal(hit.character, walker);
  assert.ok(Math.abs(hit.distance - 4.4) < 0.03, `capsule touches at 4.4 (${hit.distance})`);
  // It follows the character as it walks, and an inactive one is invisible.
  walker.input.x = 2;
  run(world, 1);
  assert.equal(world.raycast(0, 1, 0, 0, 0, -1, 20, MASK.SHOT, null, hit), false, 'walked out of the line');
  assert.ok(world.raycast(walker.position.x, 1, 0, 0, 0, -1, 20, MASK.SHOT, null, hit));
  walker.active = false;
  assert.equal(world.raycast(walker.position.x, 1, 0, 0, 0, -1, 20, MASK.SHOT, null, hit), false, 'inactive');
  walker.dispose();
  walker.active = true;
  assert.equal(world.raycast(walker.position.x, 1, 0, 0, 0, -1, 20, MASK.SHOT, null, hit), false, 'disposed');
});

test('two characters walking into each other do not overlap, and pass each other', () => {
  const world = new PhysicsWorld();
  const a = new CharacterController(world, { x: -4, z: 0.1 });
  const b = new CharacterController(world, { x: 4, z: -0.1 });
  let closest = Infinity;
  run(world, 4, () => {
    a.input.x = 2;
    b.input.x = -2;
    closest = Math.min(closest, closestPair([a, b]));
  });
  assert.ok(closest > 0.6 - 0.05, `kept apart (${closest})`);
  assert.ok(a.position.x > 2 && b.position.x < -2, `slipped past each other (${a.position.x}, ${b.position.x})`);
});

test('a crowd pressing to one point spreads out without overlaps or walking through a wall', () => {
  const world = new PhysicsWorld();
  world.addStaticBox(0, 1.5, -1, 6, 1.5, 0.5);
  const walkers = [];
  for (let i = 0; i < 24; i += 1) {
    const angle = (i / 24) * Math.PI;
    walkers.push(new CharacterController(world, { x: Math.cos(angle) * 6, z: Math.sin(angle) * 6, userRef: i }));
  }
  run(world, 6, () => {
    for (const walker of walkers) {
      const p = walker.position;
      const toward = Math.hypot(p.x, p.z + 0.2) || 1;
      walker.input.x = (-p.x / toward) * 2.5;
      walker.input.z = (-(p.z + 0.2) / toward) * 2.5;
    }
  });
  assert.ok(closestPair(walkers) > 0.6 - 0.08, `no two overlap (${closestPair(walkers)})`);
  for (const walker of walkers) {
    assert.ok(walker.position.z > -0.5 + 0.3 - 0.02, `stays in front of the wall (${walker.position.z})`);
  }
  // A character that lets another pass (a carried hostage, say) is not pushed by it.
  const ghost = new CharacterController(world, { x: 0, z: 8 });
  const host = new CharacterController(world, { x: 0.1, z: 8 });
  host.ignore.push(ghost);
  run(world, 0.5);
  assert.ok(Math.hypot(ghost.position.x - host.position.x, ghost.position.z - host.position.z) < 0.2, 'ignored pair overlaps');
});

test('push() and world.explode() shove characters and bodies; the near ones are knocked down', () => {
  const world = new PhysicsWorld();
  const near = new CharacterController(world, { x: 2, z: 0, userRef: 'near' });
  const edge = new CharacterController(world, { x: 0, z: 6.5, userRef: 'edge' });
  const far = new CharacterController(world, { x: -20, z: 0, userRef: 'far' });
  const crate = world.createBody({ colliders: [{ shape: 'box', size: { x: 1, y: 1, z: 1 } }], mass: 40, x: 0, y: 0.5, z: -3 });
  run(world, 0.5);
  const pushed = world.explode(0, 0.5, 0, { radius: 8 });
  assert.equal(pushed, 3, 'the crate, the near one and the one at the edge');
  assert.ok(near.velocity.x > 5 && near.velocity.y > 2, `near one flies (${near.velocity.x}, ${near.velocity.y})`);
  assert.equal(near.knockedDown, true);
  assert.equal(edge.knockedDown, false, 'the edge only stumbles');
  assert.ok(edge.velocity.z > 0, 'away from the blast');
  assert.equal(far.velocity.x, 0);
  assert.ok(crate.linearVelocity.z < -1 && crate.linearVelocity.y > 0, 'the crate is thrown');
  let knockdowns = 0;
  for (let i = 0; i < world.events.count; i += 1) {
    const event = world.events.items[i];
    if (event.type === PHYSICS_EVENT.KNOCKDOWN && event.aRef === 'near') knockdowns += 1;
  }
  assert.equal(knockdowns, 1);
  world.events.clear();
  // Knocked down, it ignores its input, lands and tumbles to a stop.
  near.getUpTime = Infinity;
  run(world, 3, () => { near.input.x = -3; });
  assert.ok(near.grounded);
  assert.ok(Math.hypot(near.velocity.x, near.velocity.z) < 0.01, 'stopped');
  assert.ok(near.position.x > 4, `thrown away from the blast (${near.position.x})`);
  near.knockedDown = false;
  run(world, 1, () => { near.input.x = -3; });
  assert.ok(near.velocity.x < -2.5, 'walks again once the game clears knockedDown');
  // A light push is absorbed; a hard one knocks down, and left alone it gets up by itself.
  far.push(1.5, 0, 0);
  assert.equal(far.knockedDown, false);
  far.push(0, 0, 6);
  assert.equal(far.knockedDown, true, 'a hard shove knocks down');
  run(world, 1);
  assert.equal(far.knockedDown, true, 'still down while sliding and lying');
  run(world, 2);
  assert.equal(far.knockedDown, false, 'up again after lying still for getUpTime');
});

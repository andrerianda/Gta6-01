// A parked spawn kept clear of colliders (vehicleSpawnClearance.js): a car asked to park on top of
// a post is nudged beside it; a clear spot is left alone; the ground is found under the spawn.
import assert from 'node:assert/strict';
import test from 'node:test';
import { clearParkedSpawn, parkedSpawnBlocked } from '../../../game/src/vehicles/vehicleSpawnClearance.js';

const sedan = { dimensions: { length: 4.6, width: 1.84 } };

/** A world with round posts (x, z, radius) from the ground to 1.2 m, and flat ground at y 2. */
function worldWithPosts(posts) {
  const calls = [];
  return {
    calls,
    hit: { y: 0 },
    supportBelow(x, y, z, maxDrop, mask) {
      calls.push({ supportMask: mask });
      this.hit.y = 2;
      return true;
    },
    overlapCapsule(ax, ay, az, bx, by, bz, radius, mask) {
      calls.push({ ay, mask });
      let count = 0;
      for (const [px, pz, pr] of posts) {
        if (ay - radius > 2 + 1.2) continue;
        const dx = bx - ax;
        const dz = bz - az;
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1)));
        if (Math.hypot(ax + dx * t - px, az + dz * t - pz) < radius + pr) count += 1;
      }
      return count;
    },
  };
}

test('a parked car asked to stand on a post is nudged beside it, clear of it', () => {
  const world = worldWithPosts([[0.5, 0, 0.1]]);
  const plan = { position: { x: 0, y: null, z: 0 }, heading: 0 };
  assert.equal(parkedSpawnBlocked(world, sedan, 0, 2, 0, 0), true);
  assert.equal(clearParkedSpawn(world, sedan, plan), 'nudged');
  assert.equal(parkedSpawnBlocked(world, sedan, plan.position.x, 2, plan.position.z, 0), false);
  assert.ok(Math.hypot(plan.position.x, plan.position.z) <= 1.5, 'only a short nudge');
  const capsule = world.calls.find((call) => call.ay !== undefined);
  assert.ok(capsule.ay > 2 + 0.6, 'tested at body height above the ground found below');
  assert.equal(capsule.mask & 1, 0, 'the ground layer is not a blocker');
});

test('a clear spot is left alone; turned cars test along their own length', () => {
  const world = worldWithPosts([[2.4, 0.5, 0.2]]);
  const plan = { position: { x: 0, y: 0, z: 0 }, heading: 0 };
  assert.equal(clearParkedSpawn(world, sedan, plan), 'clear');
  assert.deepEqual([plan.position.x, plan.position.z], [0, 0]);
  // Facing east (+X) the car's length runs along X to x = 2.3, into the post at x = 2.4.
  assert.equal(parkedSpawnBlocked(world, sedan, 0, 0, 0, Math.PI / 2), true);
  assert.equal(clearParkedSpawn({}, sedan, plan), 'unknown', 'no physics: nothing changes');
});

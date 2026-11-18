// The light ragdoll: thrown by a car, a blast and against a wall box, on two body sizes. It stays
// finite and out of the ground, keeps the bones' lengths (the pose is rebuilt from the points),
// comes to rest within seconds, settles into the lying pose of the way it landed and gets up.
import assert from 'node:assert/strict';
import test from 'node:test';
import { FALL_DIRECTIONS, createLocomotionController } from '../../../game/src/characters/controller/locomotionController.js';
import { BONE } from '../../../game/src/characters/skeleton/humanSkeleton.js';
import { createFkState } from '../../../game/src/characters/skeleton/forwardKinematics.js';
import { createPose } from '../../../game/src/characters/skeleton/poseBuffer.js';
import { createTestBody } from './referenceBody.mjs';

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function testRig(stature) {
  const instance = { position: { x: 0, y: 0, z: 0 }, rotation: { y: 0.4 }, matrixWorld: { elements: IDENTITY } };
  return { instance, body: createTestBody(stature), pose: createPose(), fk: createFkState(), applyPose() {} };
}
function world(rig, bone) {
  const p = rig.fk.position, i = bone * 3, y = rig.instance.rotation.y, c = Math.cos(y), s = Math.sin(y), o = rig.instance.position;
  return [o.x + p[i] * c + p[i + 2] * s, o.y + p[i + 1], o.z - p[i] * s + p[i + 2] * c];
}
const length = (rig, a, b) => Math.hypot(...world(rig, a).map((v, k) => v - world(rig, b)[k]));

const THROWS = {
  car: { vx: 9, vy: 1.5, at: 0.3 },
  blast: { vz: 6, vy: 4.5, at: 0.5, spin: 1 },
  wall: { vx: 6, vy: 1, at: 0.5, boxes: [{ x: 2, y: 1, z: 0, hx: 0.3, hy: 1, hz: 3 }] },
};

test('thrown by a car, a blast and into a wall: lands, settles lying, gets up', () => {
  for (const [name, options] of Object.entries(THROWS)) {
    for (const stature of [1.55, 1.95]) {
      const rig = testRig(stature), walker = createLocomotionController(rig, { seed: 3 }), label = `${name} ${stature}`;
      for (let i = 0; i < 30; i += 1) walker.update(1 / 60, { moveX: 0, moveZ: -1.4 });
      const forearm = length(rig, BONE.FOREARM_R, BONE.HAND_R), shin = length(rig, BONE.SHIN_L, BONE.FOOT_L);
      const stages = [];
      walker.on('action', (e) => stages.push(`${e.action}:${e.stage}`));
      walker.holdWeapon('pistol');
      walker.ragdoll(options);
      assert.ok(walker.ragdolling, label);
      let low = Infinity, flew = 0, seconds = 0;
      for (; seconds < 6 && walker.ragdolling; seconds += 1 / 60) {
        walker.update(1 / 60);
        for (const x of rig.pose) assert.ok(Number.isFinite(x), `${label}: finite pose`);
        for (let b = 1; b < 22; b += 1) low = Math.min(low, world(rig, b)[1]);
        flew = Math.max(flew, Math.hypot(rig.instance.position.x, rig.instance.position.z));
        assert.ok(Math.abs(length(rig, BONE.FOREARM_R, BONE.HAND_R) - forearm) < 1e-3, `${label}: forearm keeps its length`);
        assert.ok(Math.abs(length(rig, BONE.SHIN_L, BONE.FOOT_L) - shin) < 1e-3, `${label}: shin keeps its length`);
      }
      assert.ok(seconds < 4, `${label}: came to rest (${seconds.toFixed(2)} s)`);
      assert.deepEqual(stages, ['ragdoll:start', 'ragdoll:rest'], label);
      assert.equal(walker.stance, 'fallen', label);
      assert.ok(FALL_DIRECTIONS.includes(walker.fallDirection), label);
      assert.ok(low > -0.08, `${label}: nothing under the ground (${low.toFixed(3)} m)`);
      assert.ok(flew > (name === 'wall' ? 0.8 : 2.5), `${label}: thrown (${flew.toFixed(2)} m)`);
      if (options.boxes) assert.ok(rig.instance.position.x < 1.7, `${label}: stopped by the wall`);
      assert.ok(world(rig, BONE.HEAD)[1] < 0.45, `${label}: lying`);
      walker.play('getup');
      for (let t = 0; t < 1.9; t += 1 / 60) walker.update(1 / 60);
      assert.equal(walker.stance, 'stand', label);
      assert.ok(world(rig, BONE.HEAD)[1] > 1.4 * stature / 1.78, `${label}: back on the feet`);
    }
  }
});

test('getUp: true rises by itself; reset() cancels a ragdoll', () => {
  const rig = testRig(1.78), walker = createLocomotionController(rig);
  walker.update(1 / 60);
  walker.ragdoll({ vx: 5, vy: 2, getUp: true });
  for (let t = 0; t < 7; t += 1 / 60) walker.update(1 / 60);
  assert.equal(walker.stance, 'stand');
  assert.ok(world(rig, BONE.HEAD)[1] > 1.4);
  walker.ragdoll({ vz: 4 });
  walker.update(1 / 60);
  walker.reset(0);
  walker.update(1 / 60);
  assert.equal(walker.ragdolling, false);
});

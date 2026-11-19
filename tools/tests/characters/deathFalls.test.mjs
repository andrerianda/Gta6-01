// Falls in four directions and the get-ups from each, on bodies of different sizes: the events,
// where the head ends (the way the body went), nothing through the ground, no joint jumping
// between frames, the direction read from a world blow, and back on the feet afterwards.
import assert from 'node:assert/strict';
import test from 'node:test';
import { FALL_DIRECTIONS, FALL_SECONDS, GETUP_SECONDS, createLocomotionController } from '../../../game/src/characters/controller/locomotionController.js';
import { BONE } from '../../../game/src/characters/skeleton/humanSkeleton.js';
import { createFkState } from '../../../game/src/characters/skeleton/forwardKinematics.js';
import { createPose } from '../../../game/src/characters/skeleton/poseBuffer.js';
import { createTestBody } from './referenceBody.mjs';

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const JOINTS = Object.values(BONE).filter((b) => b !== BONE.ROOT);
function testRig(stature) {
  const instance = { position: { x: 0, y: 0, z: 0 }, rotation: { y: 0 }, matrixWorld: { elements: IDENTITY } };
  return { instance, body: createTestBody(stature), pose: createPose(), fk: createFkState(), applyPose() {} };
}
const joint = (rig, bone) => [rig.fk.position[bone * 3], rig.fk.position[bone * 3 + 1], rig.fk.position[bone * 3 + 2]];

/** Runs `seconds`, checking every frame; returns the largest joint step and the lowest joint. */
function run(walker, rig, seconds, label) {
  let jump = 0, low = Infinity, last = null;
  for (let t = 0; t < seconds; t += 1 / 60) {
    walker.update(1 / 60);
    for (const x of rig.pose) assert.ok(Number.isFinite(x), `${label}: finite pose`);
    const now = JOINTS.map((b) => joint(rig, b));
    if (last) for (let k = 0; k < now.length; k += 1) jump = Math.max(jump, Math.hypot(now[k][0] - last[k][0], now[k][1] - last[k][1], now[k][2] - last[k][2]));
    for (const p of now) low = Math.min(low, p[1]);
    last = now;
  }
  return { jump, low };
}

test('falls back, forward, left and right, lies that way and gets up again', () => {
  // Where the head ends, character space (forward is -Z, right is +X).
  const away = { back: [2, 1], forward: [2, -1], left: [0, -1], right: [0, 1] };
  for (const stature of [1.55, 1.78, 1.95]) {
    for (const direction of FALL_DIRECTIONS) {
      const rig = testRig(stature), walker = createLocomotionController(rig, { seed: 3 }), stages = [];
      const label = `${direction} ${stature}`;
      walker.on('action', (e) => stages.push(`${e.action}:${e.stage}`));
      walker.update(1 / 60);
      walker.play('fall', { direction });
      const fall = run(walker, rig, FALL_SECONDS + 0.4, label);
      assert.equal(walker.stance, 'fallen', label);
      assert.equal(walker.fallDirection, direction, label);
      const head = joint(rig, BONE.HEAD), [axis, sign] = away[direction];
      assert.ok(head[1] < 0.42 * stature / 1.78, `${label}: lying (head ${head[1].toFixed(2)} m up)`);
      assert.ok(head[axis] * sign > 0.6 * stature / 1.78, `${label}: head went ${direction} (${head[axis].toFixed(2)})`);
      assert.ok(fall.low > -0.06, `${label}: no joint under the ground (${fall.low.toFixed(3)})`);
      assert.ok(fall.jump < 0.12, `${label}: no joint jumps (${fall.jump.toFixed(3)} m)`);

      walker.play('getup');
      const up = run(walker, rig, GETUP_SECONDS + 0.3, `${label} getup`);
      assert.deepEqual(stages, ['fall:start', 'fall:landed', 'getup:start', 'getup:done'], label);
      assert.equal(walker.stance, 'stand');
      assert.ok(joint(rig, BONE.HEAD)[1] > 1.45 * stature / 1.78, `${label}: back on the feet`);
      assert.ok(up.low > -0.06, `${label} getup: no joint under the ground (${up.low.toFixed(3)})`);
      assert.ok(up.jump < 0.12, `${label} getup: no joint jumps (${up.jump.toFixed(3)} m)`);
    }
  }
});

test('the fall direction comes from the world blow, whatever way the person faces', () => {
  const cases = [
    [0, [0, -1], 'back'], [0, [0, 1], 'forward'], [0, [-1, 0], 'right'], [0, [1, 0], 'left'],
    [Math.PI / 2, [-1, 0], 'back'], [Math.PI / 2, [1, 0], 'forward'], [Math.PI, [0, -1], 'forward'],
  ];
  for (const [yaw, [fromX, fromZ], expected] of cases) {
    const rig = testRig(1.78), walker = createLocomotionController(rig, { yaw });
    walker.update(1 / 60);
    walker.play('fall', { fromX, fromZ });
    assert.equal(walker.fallDirection, expected, `yaw ${yaw.toFixed(2)}, blow from (${fromX}, ${fromZ})`);
  }
  const rig = testRig(1.78), walker = createLocomotionController(rig);
  walker.setStance('fallen', { direction: 'left' });
  run(walker, rig, 0.8, 'laid down');
  assert.ok(joint(rig, BONE.HEAD)[0] < -0.6 && joint(rig, BONE.HEAD)[1] < 0.42, 'laid on the left side without a fall');
  assert.throws(() => walker.setStance('stand') || walker.play('fall', { direction: 'up' }), /no fall direction/);
});

// Lying on a slope and the ragdoll's settle: a person lying on a 12 % slope (setGround) keeps every
// joint out of the ground and close to it in all four lying directions, and a ragdoll that lands
// face down settles into its lying pose without a joint jumping (the knee used to flip mid-settle).
import assert from 'node:assert/strict';
import test from 'node:test';
import { FALL_DIRECTIONS, createLocomotionController } from '../../../game/src/characters/controller/locomotionController.js';
import { BONE } from '../../../game/src/characters/skeleton/humanSkeleton.js';
import { createFkState } from '../../../game/src/characters/skeleton/forwardKinematics.js';
import { createPose } from '../../../game/src/characters/skeleton/poseBuffer.js';
import { createTestBody } from './referenceBody.mjs';

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function testRig(stature, yaw) {
  const instance = { position: { x: 0, y: 0, z: 0 }, rotation: { y: yaw }, matrixWorld: { elements: IDENTITY } };
  return { instance, body: createTestBody(stature), pose: createPose(), fk: createFkState(), applyPose() {} };
}
function joints(rig) {
  const p = rig.fk.position, y = rig.instance.rotation.y, c = Math.cos(y), s = Math.sin(y), o = rig.instance.position, out = [];
  for (let b = 1; b < 22; b += 1) out.push([o.x + p[b * 3] * c + p[b * 3 + 2] * s, o.y + p[b * 3 + 1], o.z - p[b * 3] * s + p[b * 3 + 2] * c]);
  return out;
}

test('lying on a slope: every joint stays out of the ground and near it, all four ways', () => {
  const ground = (x, z) => 0.12 * z - 0.05 * x;
  for (const direction of FALL_DIRECTIONS) {
    for (const yaw of [0.4, 2.2]) {
      const rig = testRig(1.86, yaw), walker = createLocomotionController(rig, { seed: 5 });
      walker.setGround(ground);
      rig.instance.position.y = ground(0, 0);
      walker.reset(yaw);
      walker.setStance('fallen', { direction });
      for (let i = 0; i < 90; i += 1) walker.update(1 / 60);
      let low = Infinity, lowest3 = [];
      for (const [x, y, z] of joints(rig)) { const h = y - ground(x, z); low = Math.min(low, h); lowest3.push(h); }
      lowest3.sort((a, b) => a - b);
      assert.ok(low > -0.05, `${direction} yaw ${yaw}: a joint ${low.toFixed(3)} m in the slope`);
      assert.ok(lowest3[2] < 0.2, `${direction} yaw ${yaw}: lying on the slope, not floating (${lowest3[2].toFixed(3)})`);
    }
  }
});

test('a ragdoll lands face down and settles without a joint jumping', () => {
  for (const stature of [1.55, 1.95]) {
    const rig = testRig(stature, 0.4), walker = createLocomotionController(rig, { seed: 3 });
    for (let i = 0; i < 30; i += 1) walker.update(1 / 60, { moveX: 0, moveZ: -1.4 });
    walker.ragdoll({ vz: 6, vy: 4.5, at: 0.5, spin: 1 });
    let last = null, at = null, settleJump = 0, frames = 0;
    for (let i = 0; i < 600 && walker.ragdolling; i += 1) {
      walker.update(1 / 60);
      const now = joints(rig), o = rig.instance.position;
      const placed = at && at[0] === o.x && at[1] === o.z; // the instance stands still once the body rests
      if (placed && last) {
        frames += 1;
        for (let k = 0; k < now.length; k += 1) settleJump = Math.max(settleJump, Math.hypot(...now[k].map((v, n) => v - last[k][n])));
      }
      last = now; at = [o.x, o.z];
    }
    assert.ok(frames >= 20, `${stature}: settled over ${frames} frames`);
    // A leg may sweep 2 m in the 0.5 s settle (a smooth 0.14 m a frame at its fastest); the
    // knee flip jumped 0.5 m in one frame.
    assert.ok(settleJump < 0.18, `${stature}: a joint jumped ${settleJump.toFixed(3)} m in one frame while settling`);
    assert.equal(walker.stance, 'fallen');
    assert.ok(BONE.HEAD > 0);
  }
});

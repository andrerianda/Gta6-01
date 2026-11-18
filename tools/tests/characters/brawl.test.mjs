// Unarmed combat on bodies of different sizes: the guard and the block put the fists before the
// face, every strike fires start / impact / done with the impact point where a blow lands (fists
// at chin height out in front, the kick's foot at hip height), the kick keeps the standing foot
// planted, the combination runs jab, cross, hook, and no joint jumps between frames.
import assert from 'node:assert/strict';
import test from 'node:test';
import { STRIKES, createLocomotionController } from '../../../game/src/characters/controller/locomotionController.js';
import { BONE } from '../../../game/src/characters/skeleton/humanSkeleton.js';
import { createFkState } from '../../../game/src/characters/skeleton/forwardKinematics.js';
import { createPose } from '../../../game/src/characters/skeleton/poseBuffer.js';
import { createTestBody } from './referenceBody.mjs';

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function testRig(stature) {
  const instance = { position: { x: 0, y: 0, z: 0 }, rotation: { y: 0 }, matrixWorld: { elements: IDENTITY } };
  return { instance, body: createTestBody(stature), pose: createPose(), fk: createFkState(), applyPose() {} };
}
const joint = (rig, bone) => [rig.fk.position[bone * 3], rig.fk.position[bone * 3 + 1], rig.fk.position[bone * 3 + 2]];
function settle(walker, seconds) {
  for (let t = 0; t < seconds; t += 1 / 60) walker.update(1 / 60);
}

test('guard and block hold the fists before the face', () => {
  for (const stature of [1.55, 1.95]) {
    const rig = testRig(stature), walker = createLocomotionController(rig, { seed: 1 });
    for (const stance of ['guard', 'block']) {
      walker.setStance(stance);
      settle(walker, 0.8);
      const neck = joint(rig, BONE.NECK);
      for (const hand of [BONE.HAND_L, BONE.HAND_R]) {
        const w = joint(rig, hand);
        assert.ok(w[2] < neck[2] - 0.08, `${stance} ${stature}: fist in front (${(w[2] - neck[2]).toFixed(2)})`);
        assert.ok(Math.abs(w[1] - neck[1]) < 0.2 * stature / 1.78, `${stance} ${stature}: fist at the face (${(w[1] - neck[1]).toFixed(2)})`);
        assert.ok(Math.abs(w[0]) < 0.25, `${stance} ${stature}: fist before the body (${w[0].toFixed(2)})`);
      }
    }
    assert.ok(joint(rig, BONE.HAND_L)[1] > joint(rig, BONE.NECK)[1], 'block: forearms up');
  }
});

test('every strike lands where a blow lands, with its events, and the kick keeps a foot planted', () => {
  for (const stature of [1.55, 1.78, 1.95]) {
    for (const name of Object.keys(STRIKES)) {
      const rig = testRig(stature), walker = createLocomotionController(rig, { seed: 2 }), stages = [], label = `${name} ${stature}`;
      walker.setStance('guard');
      settle(walker, 0.8);
      let impact = null;
      walker.on('action', (e) => {
        stages.push(`${e.action}:${e.stage}`);
        if (e.stage === 'impact') impact = [e.x, e.y, e.z];
      });
      const neck = joint(rig, BONE.NECK), hip = joint(rig, BONE.THIGH_R), footL = joint(rig, BONE.FOOT_L);
      walker.play(name);
      let jump = 0, last = null, slide = 0;
      for (let t = 0; t < STRIKES[name].seconds + 0.1; t += 1 / 60) {
        walker.update(1 / 60);
        for (const x of rig.pose) assert.ok(Number.isFinite(x), `${label}: finite`);
        const now = [BONE.HAND_L, BONE.HAND_R, BONE.FOOT_R, BONE.HEAD].map((b) => joint(rig, b));
        if (last) for (let k = 0; k < 4; k += 1) jump = Math.max(jump, Math.hypot(...now[k].map((v, i) => v - last[k][i])));
        last = now;
        slide = Math.max(slide, Math.hypot(...joint(rig, BONE.FOOT_L).map((v, i) => v - footL[i])));
      }
      assert.deepEqual(stages, [`${name}:start`, `${name}:impact`, `${name}:done`], label);
      assert.ok(impact, label);
      const s = stature / 1.78;
      if (name === 'kick') {
        assert.ok(impact[1] > hip[1] * 0.75, `${label}: foot at hip height (${impact[1].toFixed(2)} / ${hip[1].toFixed(2)})`);
        assert.ok(impact[2] < -0.65 * s, `${label}: foot out in front (${impact[2].toFixed(2)})`);
        assert.ok(slide < 0.03, `${label}: standing foot planted (${slide.toFixed(3)} m)`);
      } else {
        assert.ok(Math.abs(impact[1] - neck[1]) < 0.15 * s, `${label}: at chin height (${(impact[1] - neck[1]).toFixed(2)})`);
        assert.ok(impact[2] < neck[2] - 0.35 * s, `${label}: out in front (${(impact[2] - neck[2]).toFixed(2)})`);
        assert.ok(Math.abs(impact[0]) < 0.15 * s, `${label}: on the centre line (${impact[0].toFixed(2)})`);
      }
      assert.ok(jump < 0.16, `${label}: no joint jumps (${jump.toFixed(3)} m)`);
    }
  }
});

test('the combination runs jab, cross, hook and returns to the guard', () => {
  const rig = testRig(1.86), walker = createLocomotionController(rig, { seed: 5 }), stages = [];
  walker.setStance('guard');
  settle(walker, 0.8);
  const guard = joint(rig, BONE.HAND_R);
  walker.on('action', (e) => { if (e.stage !== 'start') stages.push(`${e.action}:${e.stage}`); });
  walker.play('combo');
  settle(walker, STRIKES.jab.seconds + STRIKES.cross.seconds + STRIKES.hook.seconds + 0.2);
  assert.deepEqual(stages, ['jab:impact', 'jab:done', 'cross:impact', 'cross:done', 'hook:impact', 'hook:done']);
  assert.ok(Math.hypot(...joint(rig, BONE.HAND_R).map((v, i) => v - guard[i])) < 0.04, 'back in the guard');
  walker.play('fall', { direction: 'back' });
  walker.play('jab');
  assert.equal(walker.action, 'fall', 'no strikes while falling');
});

test('reset() mid-strike, mid-kick and mid-fall stands the person still without throwing', () => {
  const rig = testRig(1.78), walker = createLocomotionController(rig, { seed: 6 });
  for (const name of ['combo', 'kick']) {
    walker.setStance('guard');
    settle(walker, 0.3);
    walker.play(name);
    settle(walker, 0.1);
    assert.doesNotThrow(() => walker.reset(0.5), name);
    settle(walker, 0.6);
    for (const x of rig.pose) assert.ok(Number.isFinite(x));
  }
  walker.setStance('stand');
  walker.play('fall', { direction: 'left' });
  settle(walker, 0.3);
  assert.doesNotThrow(() => walker.reset());
  settle(walker, 0.2);
  assert.equal(rig.instance.rotation.y, 0.5);
});

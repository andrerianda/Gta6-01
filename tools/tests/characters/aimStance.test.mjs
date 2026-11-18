// The shooter's stance (owner, 09:05 and 09:10): aiming a handgun drops the whole body into a
// trained two-handed stance - hips 6 to 10 cm lower, knees bent, feet wider and staggered (left
// ahead), trunk leant 12 to 22 degrees, both hands together on the gun in front of the face at
// the eye line - and an aim at the ground ahead keeps the gun level (AIM_LEVEL_BAND).
import assert from 'node:assert/strict';
import test from 'node:test';
import { createLocomotionController } from '../../../game/src/characters/controller/locomotionController.js';
import { BONE } from '../../../game/src/characters/skeleton/humanSkeleton.js';
import { createFkState } from '../../../game/src/characters/skeleton/forwardKinematics.js';
import { createPose } from '../../../game/src/characters/skeleton/poseBuffer.js';
import { quatRotate } from '../../../game/src/characters/skeleton/quaternionMath.js';
import { createTestBody } from './referenceBody.mjs';

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function testRig(stature) {
  const instance = { position: { x: 0, y: 0, z: 0 }, rotation: { y: 0 }, matrixWorld: { elements: IDENTITY } };
  return { instance, body: createTestBody(stature), pose: createPose(), fk: createFkState(), applyPose() {} };
}

test('aiming a handgun: lowered, leaning, staggered feet, both hands at the eye line', () => {
  for (const stature of [1.6, 1.86]) {
    const rig = testRig(stature), walker = createLocomotionController(rig, { seed: 1 }), p = rig.fk.position, s = stature / 1.78;
    const y = (b) => p[b * 3 + 1], z = (b) => p[b * 3 + 2];
    walker.holdWeapon('pistol');
    for (let i = 0; i < 60; i += 1) walker.update(1 / 60);
    const hips = y(BONE.HIPS);
    for (let i = 0; i < 40; i += 1) { walker.aimAt(0, 1.3 * s, -12); walker.update(1 / 60); }
    const drop = hips - y(BONE.HIPS), label = `${stature} m`;
    assert.ok(drop > 0.035 * s && drop < 0.075 * s, `${label}: hips lowered ${drop.toFixed(3)} m`);
    // The trunk (hips joint to neck joint) leant 13-22 degrees: the shoulders ahead of the hips.
    const lean = Math.atan2(z(BONE.HIPS) - z(BONE.NECK), y(BONE.NECK) - y(BONE.HIPS)) * 180 / Math.PI;
    assert.ok(lean > 13 && lean < 22, `${label}: trunk leant ${lean.toFixed(1)} degrees`);
    assert.ok(z(BONE.FOOT_R) - z(BONE.FOOT_L) > 0.18 * s, `${label}: left foot ahead of the right`);
    // Bladed with the right shoulder back.
    const blade = Math.atan2(-(z(BONE.UPPER_ARM_R) - z(BONE.UPPER_ARM_L)), p[BONE.UPPER_ARM_R * 3] - p[BONE.UPPER_ARM_L * 3]) * 180 / Math.PI;
    assert.ok(blade < -7 && blade > -20, `${label}: shoulders bladed ${blade.toFixed(1)} degrees`);
    for (const toe of [BONE.TOE_L, BONE.TOE_R]) assert.ok(Math.abs(y(toe)) < 0.04, `${label}: toes on the ground (${y(toe).toFixed(3)})`);
    const hand = (b) => [p[b * 3], p[b * 3 + 1], p[b * 3 + 2]];
    const gap = Math.hypot(...hand(BONE.HAND_L).map((v, k) => v - hand(BONE.HAND_R)[k]));
    assert.ok(gap < 0.12 * s, `${label}: the hands ${gap.toFixed(3)} m apart`);
    const head = y(BONE.HEAD), wrist = y(BONE.HAND_R);
    assert.ok(wrist > head - 0.12 * s && wrist < head + 0.06 * s, `${label}: the gun hand at the face (${(wrist - head).toFixed(3)} from the head joint)`);
    const ahead = z(BONE.HEAD) - z(BONE.HAND_R); // the head is pushed forward into the sights too
    assert.ok(ahead > 0.36 * s, `${label}: arms extended in front of the face (${ahead.toFixed(3)} m)`);
  }
});

test('an aim at the ground ahead keeps the gun level; steep aims tilt it', () => {
  const heights = [];
  for (const targetY of [0, 1.4, -6]) {
    const rig = testRig(1.86), walker = createLocomotionController(rig, { seed: 1 }), p = rig.fk.position;
    walker.holdWeapon('pistol');
    for (let i = 0; i < 60; i += 1) { walker.aimAt(0, targetY, -11); walker.update(1 / 60); }
    heights.push(p[BONE.HAND_R * 3 + 1]);
  }
  assert.ok(Math.abs(heights[0] - heights[1]) < 0.05, `ground aim ${heights[0].toFixed(3)} vs level ${heights[1].toFixed(3)}`);
  assert.ok(heights[2] < heights[1] - 0.1, `a steep aim down lowers the gun (${heights[2].toFixed(3)})`);
});

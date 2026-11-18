// Carried weapons (owner, 09:15: every weapon its own stance): the bat cocked over the strong
// shoulder with both hands and the front elbow up, its swing driven from the hips (the pelvis
// turns through with the chest, the bat level in front at contact); the tire iron raised at the
// shoulder; the throw side-on with the support arm pointing and the throwing hand cocked behind
// the shoulder, stepping through onto the front foot at the release; the rocket launcher's grip
// in front of the shoulder (tube on it), riding up on the shoulder when lowered; swing and throw
// actions send their impact / release and done events.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createLocomotionController } from '../../../game/src/characters/controller/locomotionController.js';
import { ALL_HOLDS, WEAPON_HOLDS } from '../../../game/src/characters/motion/aimPose.js';
import { BONE } from '../../../game/src/characters/skeleton/humanSkeleton.js';
import { createFkState } from '../../../game/src/characters/skeleton/forwardKinematics.js';
import { createPose } from '../../../game/src/characters/skeleton/poseBuffer.js';
import { quatMultiply, quatRotate } from '../../../game/src/characters/skeleton/quaternionMath.js';
import { createTestBody } from './referenceBody.mjs';

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function person(hold) {
  const instance = { position: { x: 0, y: 0, z: 0 }, rotation: { y: 0 }, matrixWorld: { elements: IDENTITY } };
  const rig = { instance, body: createTestBody(1.86), pose: createPose(), fk: createFkState(), applyPose() {} };
  const walker = createLocomotionController(rig, { seed: 1 });
  const events = [];
  walker.on('action', (e) => events.push(`${e.action}:${e.stage}`));
  walker.holdWeapon(hold);
  const run = (seconds) => { for (let i = 0; i < Math.round(seconds * 60); i += 1) { walker.aimAt(0, 1.3, -10); walker.update(1 / 60); } };
  return { walker, rig, events, run, p: rig.fk.position, R: rig.fk.rotation };
}
const joint = (p, b) => [p[b * 3], p[b * 3 + 1], p[b * 3 + 2]];
/** The striking end's direction (grip frame +Y) of the right hand. */
function weaponEnd(rig) {
  const q = new Float32Array(4), v = new Float32Array(3);
  quatMultiply(q, 0, rig.fk.rotation, BONE.HAND_R * 4, rig.body.gripRotation, 4);
  quatRotate(v, 0, q, 0, 0, 1, 0);
  return Array.from(v);
}
const yawOf = (R, bone) => { const v = new Float32Array(3); quatRotate(v, 0, R, bone * 4, 0, 0, -1); return Math.atan2(-v[0], -v[2]); };

test('the carried holds exist under the combat catalog names, kept out of the gun holds', () => {
  for (const hold of ['two_hand_bat', 'one_hand_club', 'throw', 'launcher_shoulder']) assert.ok(ALL_HOLDS[hold], hold);
  assert.ok(WEAPON_HOLDS.launcher_shoulder, 'the launcher is aimed like a gun');
  // (combat's controllerHoldOf maps weapons through WEAPON_HOLDS for the crowd and police guns)
  for (const hold of ['two_hand_bat', 'one_hand_club', 'throw']) assert.equal(WEAPON_HOLDS[hold], undefined, hold);
});

test('bat: cocked over the right shoulder with both hands, the front elbow up; the swing drives from the hips', () => {
  const { rig, run, walker, events, p, R } = person('two_hand_bat');
  run(1);
  const shoulder = joint(p, BONE.UPPER_ARM_R), hand = joint(p, BONE.HAND_R), off = joint(p, BONE.HAND_L);
  assert.ok(Math.abs(hand[1] - shoulder[1]) < 0.12, 'hands at the shoulder');
  assert.ok(Math.hypot(hand[0] - off[0], hand[1] - off[1], hand[2] - off[2]) < 0.14, 'both hands on the handle');
  const end = weaponEnd(rig);
  assert.ok(end[1] > 0.7 && end[2] > 0.1, `bat up and back over the shoulder (${end.map((x) => x.toFixed(2))})`);
  assert.ok(p[BONE.FOREARM_L * 3 + 1] > hand[1] - 0.05, 'front elbow up');
  const hips0 = yawOf(R, BONE.HIPS);
  walker.play('swing', { duration: 0.55 });
  run(0.275); // contact
  const atContact = weaponEnd(rig), contactHand = joint(p, BONE.HAND_R);
  assert.ok(atContact[2] < -0.8 && Math.abs(atContact[1]) < 0.4, 'bat level and ahead at contact');
  assert.ok(contactHand[2] < -0.3, 'hands through in front');
  assert.ok(yawOf(R, BONE.HIPS) - hips0 > 0.25, 'the pelvis turns through with the swing');
  run(0.4);
  assert.deepEqual(events, ['swing:start', 'swing:impact', 'swing:done']);
});

test('tire iron raised at the shoulder; lowered it hangs by the thigh', () => {
  const { rig, run, walker, p } = person('one_hand_club');
  run(1);
  assert.ok(p[BONE.HAND_R * 3 + 1] > p[BONE.UPPER_ARM_R * 3 + 1] - 0.05, 'raised at the shoulder');
  assert.ok(weaponEnd(rig)[1] > 0.7, 'iron up');
  walker.lowerWeapon();
  for (let i = 0; i < 60; i += 1) walker.update(1 / 60);
  assert.ok(p[BONE.HAND_R * 3 + 1] < 1.0, 'hanging at the side');
});

test('throw: side-on, support arm pointing, throwing hand cocked back; the throw steps through', () => {
  const { run, walker, events, p } = person('throw');
  run(1);
  const sl = joint(p, BONE.UPPER_ARM_L), off = joint(p, BONE.HAND_L), hand = joint(p, BONE.HAND_R), sr = joint(p, BONE.UPPER_ARM_R);
  assert.ok(off[2] < sl[2] - 0.45 && Math.abs(off[1] - sl[1]) < 0.12, 'support arm pointing ahead at shoulder height');
  assert.ok(hand[2] > sr[2] + 0.1 && hand[1] > sr[1] + 0.1, 'throwing hand above and behind the shoulder');
  const hipsBack = p[BONE.HIPS * 3 + 2];
  walker.play('throw', { duration: 0.7 });
  run(0.4);
  assert.ok(p[BONE.HIPS * 3 + 2] < hipsBack - 0.06, 'weight onto the front foot at the release');
  assert.ok(p[BONE.HAND_R * 3 + 2] < sr[2] - 0.2, 'hand through ahead');
  run(0.4);
  assert.deepEqual(events, ['throw:start', 'throw:release', 'throw:done']);
});

test('rocket launcher: grip in front of the shoulder, raised along the sight; lowered it points up', () => {
  const { rig, run, walker, p } = person('launcher_shoulder');
  run(1);
  const sr = joint(p, BONE.UPPER_ARM_R), hand = joint(p, BONE.HAND_R);
  assert.ok(Math.abs(hand[1] - sr[1]) < 0.1 && hand[2] < sr[2] - 0.05, 'grip just in front of the shoulder');
  const q = new Float32Array(4), v = new Float32Array(3);
  quatMultiply(q, 0, rig.fk.rotation, BONE.HAND_R * 4, rig.body.gripRotation, 4);
  quatRotate(v, 0, q, 0, 0, 0, -1);
  assert.ok(v[2] < -0.95, 'tube along the line of sight');
  walker.lowerWeapon();
  for (let i = 0; i < 60; i += 1) walker.update(1 / 60);
  quatMultiply(q, 0, rig.fk.rotation, BONE.HAND_R * 4, rig.body.gripRotation, 4);
  quatRotate(v, 0, q, 0, 0, 0, -1);
  assert.ok(v[1] > 0.2, 'carried pointing forward and up');
});

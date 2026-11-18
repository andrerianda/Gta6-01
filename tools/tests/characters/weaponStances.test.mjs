// Every weapon its own stance (owner, 09:15): long guns cheeked with the support hand UNDER the
// handguard (palm up, fingers round it, the handguard across the palm) and the shooting elbow out
// to the side; a pump gun's support hand racks back after a shot; the sniper stands more upright
// than the rifle; the combat catalog's hold names are accepted; a boxing guard stands on the
// fighting stance (lower, staggered) with the eyes still on the opponent.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createLocomotionController } from '../../../game/src/characters/controller/locomotionController.js';
import { WEAPON_HOLDS, rackStroke } from '../../../game/src/characters/motion/aimPose.js';
import { BONE } from '../../../game/src/characters/skeleton/humanSkeleton.js';
import { createFkState } from '../../../game/src/characters/skeleton/forwardKinematics.js';
import { createPose } from '../../../game/src/characters/skeleton/poseBuffer.js';
import { quatMultiply, quatRotate } from '../../../game/src/characters/skeleton/quaternionMath.js';
import { createTestBody } from './referenceBody.mjs';

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function aimed(hold, stature = 1.86, frames = 90) {
  const instance = { position: { x: 0, y: 0, z: 0 }, rotation: { y: 0 }, matrixWorld: { elements: IDENTITY } };
  const rig = { instance, body: createTestBody(stature), pose: createPose(), fk: createFkState(), applyPose() {} };
  const walker = createLocomotionController(rig, { seed: 1 });
  walker.holdWeapon(hold);
  for (let i = 0; i < frames; i += 1) { walker.aimAt(0, 1.3, -12); walker.update(1 / 60); }
  return { walker, rig, p: rig.fk.position, R: rig.fk.rotation };
}
const joint = (p, b) => [p[b * 3], p[b * 3 + 1], p[b * 3 + 2]];

test('long guns: support palm up under the handguard, shooting elbow out to the side', () => {
  for (const hold of ['rifle', 'shotgun', 'sniper']) {
    const { rig, p, R } = aimed(hold), q = new Float32Array(8), v = new Float32Array(3);
    quatMultiply(q, 0, R, BONE.HAND_R * 4, rig.body.gripRotation, 4);
    quatRotate(v, 0, q, 0, 0, 0, -1); const barrel = Array.from(v);
    quatMultiply(q, 4, R, BONE.HAND_L * 4, rig.body.gripRotation, 0);
    quatRotate(v, 0, q, 4, 1, 0, 0); const palm = Array.from(v);
    quatRotate(v, 0, q, 4, 0, 1, 0); const across = barrel[0] * v[0] + barrel[1] * v[1] + barrel[2] * v[2];
    assert.ok(palm[1] > 0.75, `${hold}: support palm faces up (${palm.map((x) => x.toFixed(2))})`);
    assert.ok(Math.abs(across) > 0.9, `${hold}: the handguard lies across the support palm (${across.toFixed(2)})`);
    const s = joint(p, BONE.UPPER_ARM_R), e = joint(p, BONE.FOREARM_R);
    const out = Math.atan2(e[0] - s[0], s[1] - e[1]) * 180 / Math.PI; // 0 hanging, 90 straight out sideways
    assert.ok(out > 40 && out < 70, `${hold}: shooting elbow out ${out.toFixed(0)} degrees`);
    const el = joint(p, BONE.FOREARM_L), hl = joint(p, BONE.HAND_L);
    assert.ok(el[1] < hl[1] - 0.05, `${hold}: support elbow under the hand`);
  }
});

test('the pump gun racks after a shot; the sniper stands taller than the rifle', () => {
  assert.equal(rackStroke(0), 0);
  assert.ok(rackStroke(0.36) > 0.9, 'mid-stroke 0.2 s after the kick');
  assert.equal(rackStroke(0.7), 0);
  const { walker, p } = aimed('shotgun'), before = joint(p, BONE.HAND_L);
  walker.play('fire');
  for (let i = 0; i < 22; i += 1) { walker.aimAt(0, 1.3, -12); walker.update(1 / 60); }
  const during = joint(p, BONE.HAND_L);
  assert.ok(during[2] - before[2] > 0.04, `pump hand drawn back ${(during[2] - before[2]).toFixed(3)} m`);
  for (let i = 0; i < 40; i += 1) { walker.aimAt(0, 1.3, -12); walker.update(1 / 60); }
  assert.ok(Math.abs(joint(p, BONE.HAND_L)[2] - before[2]) < 0.01, 'and forward again');
  const rifle = aimed('rifle').p, sniper = aimed('sniper').p;
  assert.ok(sniper[BONE.HIPS * 3 + 1] > rifle[BONE.HIPS * 3 + 1] + 0.01, 'sniper hips higher (steadier, upright)');
});

test('the combat catalog\'s gun hold names are holds', () => {
  for (const name of ['pistol_two_hand', 'revolver_two_hand', 'smg_compact', 'shotgun_pump', 'rifle', 'sniper']) {
    assert.ok(WEAPON_HOLDS[name], name);
  }
  assert.ok(WEAPON_HOLDS.revolver_two_hand.kick > WEAPON_HOLDS.pistol.kick, 'the revolver lifts more');
});

test('a boxing guard stands on the fighting stance with the eyes level', () => {
  const instance = { position: { x: 0, y: 0, z: 0 }, rotation: { y: 0 }, matrixWorld: { elements: IDENTITY } };
  const rig = { instance, body: createTestBody(1.78), pose: createPose(), fk: createFkState(), applyPose() {} };
  const walker = createLocomotionController(rig, { seed: 1 }), p = rig.fk.position;
  for (let i = 0; i < 30; i += 1) walker.update(1 / 60);
  const hips = p[BONE.HIPS * 3 + 1];
  walker.setStance('guard');
  for (let i = 0; i < 60; i += 1) walker.update(1 / 60);
  assert.ok(hips - p[BONE.HIPS * 3 + 1] > 0.025, 'lowered');
  assert.ok(p[BONE.FOOT_R * 3 + 2] - p[BONE.FOOT_L * 3 + 2] > 0.12, 'left foot ahead');
  const v = new Float32Array(3);
  quatRotate(v, 0, rig.fk.rotation, BONE.HEAD * 4, 0, 0, -1);
  const pitch = Math.asin(v[1]) * 180 / Math.PI;
  assert.ok(pitch > -22 && pitch < 5, `eyes on the opponent (head pitch ${pitch.toFixed(1)})`);
});

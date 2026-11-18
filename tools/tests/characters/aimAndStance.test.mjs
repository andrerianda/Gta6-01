// Tests of strafing and walking backwards, the aim layer (every weapon hold), the one-shot fire
// and reload actions with their events, and the surrender and kneeling stances.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LOCOMOTION_TUNING, createLocomotionState, stepLocomotionState,
} from '../../../game/src/characters/controller/locomotionState.js';
import { STANCES, createLocomotionController, recoilEnvelope } from '../../../game/src/characters/controller/locomotionController.js';
import { WEAPON_HOLDS } from '../../../game/src/characters/motion/aimPose.js';
import { createLocomotionScratch, writeLocomotionPose } from '../../../game/src/characters/motion/locomotionPose.js';
import { BONE } from '../../../game/src/characters/skeleton/humanSkeleton.js';
import { createFkState } from '../../../game/src/characters/skeleton/forwardKinematics.js';
import { createPose } from '../../../game/src/characters/skeleton/poseBuffer.js';
import { quatRotate } from '../../../game/src/characters/skeleton/quaternionMath.js';
import { createTestBody } from './referenceBody.mjs';

function testRig(stature = 1.78) {
  const instance = { position: { x: 0, y: 0, z: 0 }, rotation: { y: 0 } };
  return { instance, body: createTestBody(stature), pose: createPose(), fk: createFkState(), applyPose() {} };
}

test('strafing keeps the facing, caps the speed by direction and sets the legs\' travel', () => {
  const side = createLocomotionState();
  for (let i = 0; i < 180; i += 1) stepLocomotionState(side, 1 / 60, { moveX: 6, moveZ: 0, facing: 0, strafe: true });
  assert.ok(Math.abs(side.yaw) < 0.01, 'still faces ahead');
  assert.ok(Math.abs(side.speed - LOCOMOTION_TUNING.strafeSide) < 0.05, `sideways capped (${side.speed.toFixed(2)})`);
  assert.ok(side.travelX > 0.99 && Math.abs(side.travelZ) < 0.05, 'the legs travel to the right');
  assert.ok(side.strafe > 0.95 && Math.abs(side.bank) < 0.01, 'strafing, no bank');
  const back = createLocomotionState({ yaw: 1 });
  for (let i = 0; i < 180; i += 1) {
    stepLocomotionState(back, 1 / 60, { moveX: Math.sin(1) * 5, moveZ: Math.cos(1) * 5, facing: 1, strafe: true });
  }
  assert.ok(Math.abs(back.yaw - 1) < 0.01, 'backing away keeps facing');
  assert.ok(Math.abs(back.speed - LOCOMOTION_TUNING.strafeBack) < 0.05, `backwards capped (${back.speed.toFixed(2)})`);
  assert.ok(back.travelZ > 0.99, 'the legs travel backwards');
  const plain = createLocomotionState();
  for (let i = 0; i < 120; i += 1) stepLocomotionState(plain, 1 / 60, { moveX: 3, moveZ: 0, facing: 0 });
  assert.ok(plain.yaw < -1.4, 'without strafe the body turns to its travel as before');
});

test('planted feet do not slide walking backwards or sideways', () => {
  for (const [tx, tz, speed] of [[0, 1, 1.2], [1, 0, 1.4], [-0.7071, -0.7071, 2.5], [0.6, 0.8, 2.2]]) {
    const body = createTestBody(1.78), pose = createPose(), fk = createFkState(), scratch = createLocomotionScratch();
    const dt = 1 / 120;
    let x = 0, z = 0, phase = 0, last = null, worst = 0;
    for (let i = 0; i < 240; i += 1) {
      writeLocomotionPose(pose, body, fk, { speed, phase, travelX: tx, travelZ: tz }, scratch);
      const a = BONE.FOOT_L * 3, wx = x + fk.position[a], wz = z + fk.position[a + 2];
      const flat = scratch.footL.contact === 1 && Math.abs(scratch.footL.pitch) < 0.01;
      if (flat && last) worst = Math.max(worst, Math.hypot(wx - last[0], wz - last[1]));
      last = flat ? [wx, wz] : null;
      x += tx * speed * dt; z += tz * speed * dt;
      phase += scratch.gait.strideRate * dt;
      phase -= Math.floor(phase);
    }
    assert.ok(worst < 0.002, `foot drift per frame ${worst.toFixed(4)} m at (${tx}, ${tz}) ${speed} m/s`);
  }
});

test('every weapon hold points the barrel at the target with both hands on the weapon', () => {
  for (const stature of [1.55, 1.95]) {
    for (const hold of Object.keys(WEAPON_HOLDS)) {
      const rig = testRig(stature);
      const walker = createLocomotionController(rig, { seed: 2 });
      walker.holdWeapon(hold);
      walker.aimAt(8, 1.2, -3); // far enough round that the body turns, not only the spine
      for (let i = 0; i < 90; i += 1) walker.update(1 / 60, { moveX: 0, moveZ: 0, facing: NaN });
      const fk = rig.fk, body = rig.body, out = new Float32Array(6);
      for (let k = 0; k < rig.pose.length; k += 1) assert.ok(Number.isFinite(rig.pose[k]), `${hold}: finite pose`);
      // The barrel: the right palm's grip frame -Z, against the direction from the grip to the target.
      quatRotate(out, 0, fk.rotation, BONE.HAND_R * 4, body.gripOffset[3], body.gripOffset[4], body.gripOffset[5]);
      const h = BONE.HAND_R * 3;
      const gx = fk.position[h] + out[0], gy = fk.position[h + 1] + out[1], gz = fk.position[h + 2] + out[2];
      const g = [body.gripRotation[4], body.gripRotation[5], body.gripRotation[6], body.gripRotation[7]];
      const q = new Float32Array(4);
      // accumulated palm frame = hand rotation * rest grip frame
      const hr = fk.rotation.subarray(BONE.HAND_R * 4, BONE.HAND_R * 4 + 4);
      q[0] = hr[3] * g[0] + hr[0] * g[3] + hr[1] * g[2] - hr[2] * g[1];
      q[1] = hr[3] * g[1] - hr[0] * g[2] + hr[1] * g[3] + hr[2] * g[0];
      q[2] = hr[3] * g[2] + hr[0] * g[1] - hr[1] * g[0] + hr[2] * g[3];
      q[3] = hr[3] * g[3] - hr[0] * g[0] - hr[1] * g[1] - hr[2] * g[2];
      quatRotate(out, 3, q, 0, 0, 0, -1);
      const a = walker.aim;
      let dx = a.targetX - gx, dy = a.targetY - gy, dz = a.targetZ - gz;
      const n = Math.hypot(dx, dy, dz);
      dx /= n; dy /= n; dz /= n;
      const angle = Math.acos(Math.min(1, out[3] * dx + out[4] * dy + out[5] * dz));
      assert.ok(angle < 0.12, `${hold} at ${stature} m: barrel ${angle.toFixed(3)} rad off the target`);
      assert.ok(Math.abs(rig.instance.rotation.y - Math.atan2(-8, 3)) < 0.1, `${hold}: body turned to the target`);
      if (WEAPON_HOLDS[hold].hands === 2) { // the off hand's wrist is near the weapon (within reach)
        const l = BONE.HAND_L * 3;
        const d = Math.hypot(fk.position[l] - gx, fk.position[l + 1] - gy, fk.position[l + 2] - gz);
        assert.ok(d < 0.5 * stature / 1.78, `${hold}: off hand ${d.toFixed(2)} m from the grip`);
      }
    }
  }
});

test('fire and reload are one-shot actions with events; recoil decays', () => {
  assert.equal(recoilEnvelope(0), 0);
  assert.ok(recoilEnvelope(0.04) > 0.99 && recoilEnvelope(0.3) < 0.1 && recoilEnvelope(1) === 0);
  const walker = createLocomotionController(testRig(), { seed: 1 });
  const events = [];
  walker.on('fire', (e) => events.push(`fire:${e.hold}`));
  walker.on('reload', (e) => events.push(e.stage));
  walker.holdWeapon('rifle');
  walker.aimAt(0, 1.5, -20);
  for (let i = 0; i < 30; i += 1) walker.update(1 / 60, {});
  walker.play('fire');
  walker.update(1 / 60, {}); walker.update(1 / 60, {});
  assert.ok(walker.aim.recoil > 0.5, 'kicks');
  walker.play('reload', { duration: 1 });
  for (let i = 0; i < 70; i += 1) walker.update(1 / 60, {});
  assert.deepEqual(events, ['fire:rifle', 'mag_out', 'mag_in', 'done']);
  assert.equal(walker.aim.reload, -1);
  assert.ok(walker.aim.recoil < 0.01);
});

test('surrender raises the hands; kneeling puts the knees on the ground and ignores moves', () => {
  for (const stature of [1.55, 1.78, 1.95]) {
    const rig = testRig(stature);
    const walker = createLocomotionController(rig, { seed: 4 });
    const settled = [];
    walker.on('stance', (e) => settled.push(e.stance));
    walker.setStance('hands_up');
    for (let i = 0; i < 60; i += 1) walker.update(1 / 60, {});
    const p = rig.fk.position, head = p[BONE.HEAD * 3 + 1];
    assert.ok(p[BONE.HAND_L * 3 + 1] > head && p[BONE.HAND_R * 3 + 1] > head, 'wrists above the head joint');
    walker.setStance('kneel');
    for (let i = 0; i < 90; i += 1) walker.update(1 / 60, { moveX: 0, moveZ: -3 });
    assert.equal(walker.state.speed, 0, 'kneeling ignores moves');
    const kneeL = p[BONE.SHIN_L * 3 + 1], kneeR = p[BONE.SHIN_R * 3 + 1];
    assert.ok(kneeL < 0.1 && kneeR < 0.1 && kneeL > 0.0, `knees on the ground (${kneeL.toFixed(3)})`);
    for (const toe of [BONE.TOE_L, BONE.TOE_R]) assert.ok(p[toe * 3 + 1] > -0.03, 'toes not below the ground');
    assert.ok(p[BONE.HAND_L * 3 + 1] > p[BONE.NECK * 3 + 1], 'hands on the head');
    for (const name of Object.keys(STANCES)) {
      walker.setStance(name);
      for (let i = 0; i < 70; i += 1) walker.update(1 / 60, {});
      for (let k = 0; k < rig.pose.length; k += 1) assert.ok(Number.isFinite(rig.pose[k]), `${name}: finite`);
    }
    assert.deepEqual(settled.slice(0, 2), ['hands_up', 'kneel']);
  }
});

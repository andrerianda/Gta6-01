// The gait model: planted feet do not slide at any speed or body size, legs stay within reach
// with knees that bend forwards, and nothing jumps when the speed or the phase changes a little.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createGait, evaluateGait } from '../../../game/src/characters/motion/gaitModel.js';
import { createLocomotionScratch, writeLocomotionPose } from '../../../game/src/characters/motion/locomotionPose.js';
import { createFkState } from '../../../game/src/characters/skeleton/forwardKinematics.js';
import { BONE, BONE_COUNT, LEGS } from '../../../game/src/characters/skeleton/humanSkeleton.js';
import { createPose } from '../../../game/src/characters/skeleton/poseBuffer.js';
import { quatRotate } from '../../../game/src/characters/skeleton/quaternionMath.js';
import { createTestBody } from './referenceBody.mjs';

const SPEEDS = [0.6, 1.4, 2.0, 2.4, 3.0, 4.5, 7.0];
const STATURES = [1.55, 1.78, 1.95];

test('a planted foot stays where it is on the ground at every speed and body size', () => {
  const pose = createPose(), fk = createFkState(), scratch = createLocomotionScratch(), point = new Float32Array(3);
  for (const stature of STATURES) {
    const body = createTestBody(stature);
    for (const speed of SPEEDS) {
      for (const leg of LEGS) {
        let low = Infinity, high = -Infinity, lowX = Infinity, highX = -Infinity, samples = 0;
        const steps = 400;
        for (let i = 0; i < steps; i += 1) {
          // Follow the left foot from its contact, the right from its own half a stride later.
          const phase = (leg.index ? 0.5 : 0) + i / steps;
          writeLocomotionPose(pose, body, fk, { speed, phase }, scratch);
          const foot = leg.index ? scratch.footR : scratch.footL;
          if (!foot.planted) continue;
          samples += 1;
          quatRotate(point, 0, fk.rotation, leg.end * 4, 0, -body.ankleHeight, -foot.pivotLocal);
          const y = fk.position[leg.end * 3 + 1] + point[1];
          assert.ok(Math.abs(y) < 0.003, `sole point ${y.toFixed(4)} m off the ground (speed ${speed}, stature ${stature})`);
          // The sole's reference point in the world: the body has moved speed * time towards -Z.
          const travelled = speed * (phase / scratch.gait.strideRate);
          const z = fk.position[leg.end * 3 + 2] + point[2] + foot.pivotLocal - travelled;
          const x = fk.position[leg.end * 3] + point[0];
          low = Math.min(low, z); high = Math.max(high, z);
          lowX = Math.min(lowX, x); highX = Math.max(highX, x);
        }
        assert.ok(samples > steps * 0.15, 'the foot is planted for part of the stride');
        assert.ok(high - low < 0.004, `foot slides ${(high - low).toFixed(4)} m (speed ${speed}, stature ${stature})`);
        assert.ok(highX - lowX < 0.004, `foot slides sideways ${(highX - lowX).toFixed(4)} m (speed ${speed})`);
      }
    }
  }
});

test('legs keep their length and knees bend forwards through the whole stride', () => {
  const pose = createPose(), fk = createFkState();
  for (const stature of STATURES) {
    const body = createTestBody(stature);
    for (const speed of [0, ...SPEEDS]) {
      for (let i = 0; i < 120; i += 1) {
        writeLocomotionPose(pose, body, fk, { speed, phase: i / 120, time: i * 0.3 });
        for (const value of pose) assert.ok(Number.isFinite(value));
        for (const leg of LEGS) {
          const p = fk.position, h = leg.upper * 3, k = leg.lower * 3, a = leg.end * 3;
          const thigh = Math.hypot(p[k] - p[h], p[k + 1] - p[h + 1], p[k + 2] - p[h + 2]);
          const shin = Math.hypot(p[a] - p[k], p[a + 1] - p[k + 1], p[a + 2] - p[k + 2]);
          assert.ok(Math.abs(thigh - body.thighLength) < 1e-3 && Math.abs(shin - body.shinLength) < 1e-3);
          // The knee lies in front of the line from hip to ankle (forward is -Z).
          const t = (p[k + 1] - p[h + 1]) / (p[a + 1] - p[h + 1] || 1);
          const lineZ = p[h + 2] + (p[a + 2] - p[h + 2]) * t;
          assert.ok(p[k + 2] <= lineZ + 0.004, `knee bends backwards at speed ${speed}, phase ${i / 120}`);
          assert.ok(p[a + 1] > body.ankleHeight * 0.55, 'the ankle stays above the ground');
        }
      }
    }
  }
});

test('gait parameters and poses change smoothly with speed: no pop between walk, jog, run, sprint', () => {
  const body = createTestBody(1.78), a = createGait(), b = createGait();
  const poseA = createPose(), poseB = createPose(), fkA = createFkState(), fkB = createFkState();
  let previousRate = 0;
  for (let speed = 0.05; speed < 8; speed += 0.05) {
    evaluateGait(a, speed, body.legScale, 0.09);
    evaluateGait(b, speed + 0.05, body.legScale, 0.09);
    assert.ok(a.strideRate >= previousRate, 'cadence rises with speed');
    previousRate = a.strideRate;
    assert.ok(Math.abs(a.strideLength * a.strideRate - speed) < 1e-9);
    for (const key of Object.keys(a)) {
      assert.ok(Math.abs(b[key] - a[key]) < 0.16,`${key} jumps by ${Math.abs(b[key] - a[key]).toFixed(3)} near ${speed.toFixed(2)} m/s`);
    }
    for (const phase of [0.05, 0.3, 0.55, 0.8]) {
      writeLocomotionPose(poseA, body, fkA, { speed, phase });
      writeLocomotionPose(poseB, body, fkB, { speed: speed + 0.05, phase });
      for (let i = 0; i < BONE_COUNT * 3; i += 1) {
        // (A swinging foot covers more than this in one frame; where walking turns into
        // running the time on the ground shortens quickly, which moves the feet in phase.)
        assert.ok(Math.abs(fkB.position[i] - fkA.position[i]) < 0.09, `a joint jumps near ${speed.toFixed(2)} m/s`);
      }
    }
  }
});

test('the stride is periodic and continuous in phase', () => {
  const body = createTestBody(1.78);
  const poseA = createPose(), poseB = createPose(), fkA = createFkState(), fkB = createFkState();
  for (const speed of SPEEDS) {
    const steps = 500;
    for (let i = 0; i < steps; i += 1) {
      writeLocomotionPose(poseA, body, fkA, { speed, phase: i / steps });
      writeLocomotionPose(poseB, body, fkB, { speed, phase: (i + 1) / steps });
      for (let j = 0; j < BONE_COUNT * 3; j += 1) {
        assert.ok(Math.abs(fkB.position[j] - fkA.position[j]) < 0.06, `a joint jumps at phase ${i / steps}, speed ${speed}`);
      }
    }
  }
});

test('walking rises over the standing leg; running is highest in flight; the trunk leans with speed', () => {
  const body = createTestBody(1.78), pose = createPose(), fk = createFkState(), scratch = createLocomotionScratch();
  const hipHeight = (speed, phase) => {
    writeLocomotionPose(pose, body, fk, { speed, phase }, scratch);
    return fk.position[BONE.HIPS * 3 + 1];
  };
  assert.ok(hipHeight(1.4, 0.31) > hipHeight(1.4, 0.03) + 0.015, 'a walk dips at the step');
  const walkRange = hipHeight(1.4, 0.31) - hipHeight(1.4, 0.03);
  assert.ok(walkRange < 0.09, `walk bounce ${walkRange.toFixed(3)} m is not exaggerated`);
  writeLocomotionPose(pose, body, fk, { speed: 4.5, phase: 0 }, scratch);
  const duty = scratch.gait.duty;
  assert.ok(duty < 0.5, 'running has a flight phase');
  assert.ok(hipHeight(4.5, duty + (0.5 - duty) / 2) > hipHeight(4.5, duty / 2) + 0.02, 'a run is highest in flight');
  const chestForward = (speed) => {
    writeLocomotionPose(pose, body, fk, { speed, phase: 0.2 });
    return fk.position[BONE.HIPS * 3 + 2] - fk.position[BONE.NECK * 3 + 2];
  };
  assert.ok(chestForward(7) > chestForward(4.5) && chestForward(4.5) > chestForward(1.4));
});

test('arms swing against the legs', () => {
  const body = createTestBody(1.78), pose = createPose(), fk = createFkState();
  for (const speed of [1.4, 4.5]) {
    writeLocomotionPose(pose, body, fk, { speed, phase: 0.02 }); // the left foot has just landed in front
    assert.ok(fk.position[BONE.FOOT_L * 3 + 2] < fk.position[BONE.FOOT_R * 3 + 2], 'left foot in front');
    assert.ok(fk.position[BONE.HAND_R * 3 + 2] < fk.position[BONE.HAND_L * 3 + 2], 'right hand in front');
    // Elbows stay outside the torso.
    assert.ok(fk.position[BONE.FOREARM_L * 3] < -body.torsoHalfWidth * 0.9 && fk.position[BONE.FOREARM_R * 3] > body.torsoHalfWidth * 0.9);
  }
});

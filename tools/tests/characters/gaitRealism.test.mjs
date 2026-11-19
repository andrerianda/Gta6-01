// The gait, measured: every person walks, runs and sprints on the real skeletons from the GLBs,
// and the numbers a person's eye checks are checked here. Planted feet do not slide, no sole goes
// through the ground, a run has a flight phase and a walk has none, the elbows bend as people's
// do, the head rides smoothly, the trunk stands upright walking and leans running, and nothing
// pops between frames through starts, stops, turns and the walk-run-sprint blend.
import assert from 'node:assert/strict';
import test from 'node:test';
import { performance } from 'node:perf_hooks';
import { CHARACTER_IDS, bendAt, makeWalker, measurePoints, runProgram, straight } from './gaitHarness.mjs';
import { BONE } from '../../../game/src/characters/skeleton/humanSkeleton.js';
import { createMovementStyle } from '../../../game/src/characters/motion/movementStyle.js';
import { createGait, evaluateGait } from '../../../game/src/characters/motion/gaitModel.js';

const DEG = 180 / Math.PI;
const BODIES = ['dez_tolliver', 'pedestrian_older_f', 'police_officer_f', 'swat_officer'];

test('steady gaits: planted feet still, no ground penetration, flight only when running', () => {
  for (const id of BODIES) {
    for (const speed of [1.4, 2.2, 3.5, 5.5, 7.5]) {
      const s = runProgram(makeWalker(id), straight(speed), { seconds: 4.5, skip: 2 });
      const at = `${id} at ${speed} m/s`;
      assert.equal(s.nan, false, `${at}: NaN`);
      assert.ok(s.slideMax < 0.12, `${at}: a planted foot slides at ${s.slideMax.toFixed(3)} m/s`);
      assert.ok(s.slideMean < 0.01, `${at}: mean stance slide ${s.slideMean.toFixed(4)} m/s`);
      assert.ok(s.penetration < 0.004, `${at}: a sole ${(s.penetration * 100).toFixed(1)} cm under the ground`);
      if (speed < 2.5) assert.equal(s.flight, 0, `${at}: a walk has no flight phase`);
      else assert.ok(s.flight > 0.15 && s.flight < 0.65, `${at}: flight share ${s.flight.toFixed(2)}`);
      assert.ok(s.jump < 0.4, `${at}: a bone turns ${s.jump.toFixed(2)} rad in one frame`);
    }
  }
});

test('elbows: relaxed 10-35 degrees walking, near 90 running', () => {
  const walk = runProgram(makeWalker('dez_tolliver'), straight(1.4), { seconds: 4, skip: 2 });
  assert.ok(walk.elbowMin * DEG > 8 && walk.elbowMax * DEG < 38, `walk elbows ${(walk.elbowMin * DEG).toFixed(0)}-${(walk.elbowMax * DEG).toFixed(0)}`);
  const run = runProgram(makeWalker('dez_tolliver'), straight(4.5), { seconds: 4, skip: 2 });
  assert.ok(run.elbowMean * DEG > 75 && run.elbowMean * DEG < 105, `run elbow mean ${(run.elbowMean * DEG).toFixed(0)}`);
});

test('head: smooth vertical ride, walking bob 2-5 cm', () => {
  const walk = runProgram(makeWalker('dez_tolliver'), straight(1.4), { seconds: 4, skip: 2 });
  assert.ok(walk.headRange > 0.02 && walk.headRange < 0.05, `walk head bob ${(walk.headRange * 100).toFixed(1)} cm`);
  assert.ok(walk.headAccel < 15, `walk head vertical acceleration ${walk.headAccel.toFixed(1)} m/s2`);
  for (const speed of [3.5, 5.5, 7.5]) {
    const run = runProgram(makeWalker('dez_tolliver'), straight(speed), { seconds: 4, skip: 2 });
    assert.ok(run.headRange < 0.11, `run ${speed}: head range ${(run.headRange * 100).toFixed(1)} cm`);
    assert.ok(run.headAccel < 70, `run ${speed}: head vertical acceleration ${run.headAccel.toFixed(1)} m/s2`);
  }
});

/** The trunk line (hips to neck) forward of vertical, degrees, averaged over a stride. */
function trunkLean(id, speed) {
  const { walker, instance, rig } = makeWalker(id);
  let sum = 0, n = 0;
  for (let i = 0; i < 300; i += 1) {
    instance.position.z += walker.state.vz / 60;
    walker.update(1 / 60, { moveX: 0, moveZ: -speed });
    if (i < 200) continue;
    const p = measurePoints(rig, instance), h = BONE.HIPS * 3, k = BONE.NECK * 3;
    sum += Math.atan2(-(p[k + 2] - p[h + 2]), p[k + 1] - p[h + 1]) * DEG; n += 1;
  }
  return sum / n;
}

test('posture: upright standing and walking, leaning into a run, more into a sprint', () => {
  for (const id of BODIES) {
    const stand = trunkLean(id, 0), walk = trunkLean(id, 1.4), run = trunkLean(id, 4.5), sprint = trunkLean(id, 7.5);
    assert.ok(Math.abs(stand) < 3, `${id} standing trunk ${stand.toFixed(1)} deg`);
    assert.ok(walk > -1 && walk < 4, `${id} walking trunk ${walk.toFixed(1)} deg`);
    assert.ok(run > 5 && run < 12, `${id} running trunk ${run.toFixed(1)} deg`);
    assert.ok(sprint > run && sprint < 15, `${id} sprinting trunk ${sprint.toFixed(1)} deg`);
  }
});

test('transitions: starts, stops, turns and the speed blend keep the feet planted and nothing pops', () => {
  const programs = {
    startStop: (t) => ({ x: 0, z: t > 1 && t < 3.5 ? -1.4 : 0 }),
    rampUp: (t) => ({ x: 0, z: -Math.min(7.5, Math.max(0, (t - 0.5) * 1.5)) }),
    runStop: (t) => ({ x: 0, z: t < 3 ? -5 : 0 }),
    sharpTurn: (t) => (t < 2.5 ? { x: 0, z: -1.6 } : { x: 1.6, z: 0.4 }),
    runTurn: (t) => (t < 2.5 ? { x: 0, z: -5 } : { x: -5, z: 0 }),
    spotTurn: (t) => ({ x: 0, z: 0, facing: t < 1.5 ? 0 : Math.PI * 0.9 }),
    circle: (t) => ({ x: Math.sin(t * 1.2) * 3, z: -Math.cos(t * 1.2) * 3 }),
  };
  for (const [name, program] of Object.entries(programs)) {
    const s = runProgram(makeWalker('dez_tolliver'), program, { seconds: 6, skip: 0.2 });
    assert.equal(s.nan, false, `${name}: NaN`);
    assert.ok(s.slideMean < 0.02, `${name}: mean stance slide ${s.slideMean.toFixed(4)} m/s`);
    assert.ok(s.penetration < 0.006, `${name}: a sole ${(s.penetration * 100).toFixed(1)} cm under the ground`);
    assert.ok(s.jump < 0.4, `${name}: a bone turns ${s.jump.toFixed(2)} rad in one frame at ${s.jumpAt.toFixed(2)} s`);
  }
});

test('stopping: the feet end up together under the body (a settling step), still', () => {
  const kit = makeWalker('dez_tolliver');
  runProgram(kit, (t) => ({ x: 0, z: t < 2 ? -1.6 : 0 }), { seconds: 4.5, skip: 4 });
  const p = measurePoints(kit.rig, kit.instance);
  const l = BONE.FOOT_L * 3, r = BONE.FOOT_R * 3;
  const apartAlong = Math.abs(p[l + 2] - p[r + 2]);
  assert.ok(apartAlong < 0.12, `feet ${(apartAlong * 100).toFixed(0)} cm apart front to back after stopping`);
  for (const foot of kit.walker.footLock.feet) assert.ok(Math.hypot(foot.offX, foot.offZ) < 0.08, 'a standing foot left out of place');
});

test('slopes: the feet stand on a 15 % incline, up, down and across', () => {
  for (const [gx, gz] of [[0, -0.15], [0, 0.15], [0.15, 0]]) {
    const ground = (x, z) => gx * x + gz * z;
    const s = runProgram(makeWalker('dez_tolliver'), straight(1.4), { seconds: 4, skip: 2, ground });
    assert.ok(s.penetration < 0.012, `slope ${gx},${gz}: a sole ${(s.penetration * 100).toFixed(1)} cm under the ground`);
    assert.ok(s.slideMean < 0.01, `slope ${gx},${gz}: mean stance slide ${s.slideMean.toFixed(4)}`);
  }
});

test('style: an older person takes shorter, quicker steps with a smaller arm swing', () => {
  const adult = createGait(), senior = createGait();
  evaluateGait(adult, 1.3, 1, 0.09, createMovementStyle({ ageBand: 'adult' }));
  evaluateGait(senior, 1.3, 1, 0.09, createMovementStyle({ ageBand: 'senior' }));
  assert.ok(senior.strideLength < adult.strideLength * 0.92);
  assert.ok(senior.strideRate > adult.strideRate);
  assert.ok(senior.armForward + senior.armBack < (adult.armForward + adult.armBack) * 0.8);
  const kit = makeWalker('pedestrian_older_f');
  kit.walker.setStyle({ ageBand: 'senior', build: 'heavy' });
  const s = runProgram(kit, straight(1.2), { seconds: 4, skip: 2 });
  assert.ok(s.slideMax < 0.12 && s.penetration < 0.004 && !s.nan);
});

test('idle: breathing and weight shifts move the body a little, the feet stay put', () => {
  const s = runProgram(makeWalker('pedestrian_casual_m'), () => ({ x: 0, z: 0 }), { seconds: 30, skip: 1 });
  assert.ok(s.slideMax < 0.01 && s.penetration < 0.002 && !s.nan);
  assert.ok(s.hipHigh - s.hipLow > 0.002, 'the weight shift moves the hips');
  assert.ok(s.jump < 0.05, 'nothing pops standing');
});

test('every character file walks and runs on its own measurements', () => {
  for (const id of CHARACTER_IDS) {
    for (const speed of [1.4, 5]) {
      const s = runProgram(makeWalker(id), straight(speed), { seconds: 3, skip: 1.5 });
      assert.ok(!s.nan && s.slideMax < 0.15 && s.penetration < 0.005, `${id} at ${speed}: slide ${s.slideMax.toFixed(3)} pen ${s.penetration.toFixed(3)}`);
    }
  }
});

test('cost: one update stays cheap enough for a crowd', () => {
  const kit = makeWalker('pedestrian_casual_m');
  const input = { moveX: 0, moveZ: -1.4 };
  for (let i = 0; i < 300; i += 1) kit.walker.update(1 / 60, input);
  const start = performance.now();
  for (let i = 0; i < 3000; i += 1) {
    kit.instance.position.z += kit.walker.state.vz / 60;
    kit.walker.update(1 / 60, input);
  }
  const each = (performance.now() - start) / 3000 * 1000;
  assert.ok(each < 60, `an update takes ${each.toFixed(1)} microseconds`);
});

test('knees: walking swing folds 50-70 degrees, a run past 100', () => {
  const kneeMax = (speed) => runProgram(makeWalker('dez_tolliver'), straight(speed), { seconds: 4, skip: 2 }).kneeMax * DEG;
  const walk = kneeMax(1.4), run = kneeMax(4.5);
  assert.ok(walk > 50 && walk < 72, `walk knee ${walk.toFixed(0)}`);
  assert.ok(run > 100 && run < 150, `run knee ${run.toFixed(0)}`);
  assert.equal(typeof bendAt, 'function');
});

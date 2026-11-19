// Getting into and out of a car through its door, carjacking and being dragged out, on bodies of
// different sizes: the stage events, the door amount the fleet is given, the hand on the handle,
// where the person ends (seated at the seat anchor, standing clear of the door, lying beside it),
// no foot through the ground and no joint jumping between frames.
import assert from 'node:assert/strict';
import test from 'node:test';
import { TRANSIT_SECONDS, createLocomotionController } from '../../../game/src/characters/controller/locomotionController.js';
import { BONE } from '../../../game/src/characters/skeleton/humanSkeleton.js';
import { createFkState } from '../../../game/src/characters/skeleton/forwardKinematics.js';
import { createPose } from '../../../game/src/characters/skeleton/poseBuffer.js';
import { createTestBody } from './referenceBody.mjs';

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const WATCHED = [BONE.HEAD, BONE.HAND_L, BONE.HAND_R, BONE.FOOT_L, BONE.FOOT_R, BONE.HIPS];
function testRig(stature) {
  const instance = { position: { x: -1.7, y: 0, z: 0.1 }, rotation: { y: 0 }, matrixWorld: { elements: IDENTITY } };
  return { instance, body: createTestBody(stature), pose: createPose(), fk: createFkState(), applyPose() {} };
}
const at = (p) => ({ matrixWorld: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, ...p, 1] } });
// A car at the origin facing -Z: the driver's seat (hip joints) and the door anchor beside it.
const SEAT = at([-0.37, 0.5, 0]), DOOR = at([-1.45, 0, -0.25]);

/** World position of a joint (the instance turned by rotation.y). */
function world(rig, bone) {
  const p = rig.fk.position, i = bone * 3, y = rig.instance.rotation.y, c = Math.cos(y), s = Math.sin(y), o = rig.instance.position;
  return [o.x + p[i] * c + p[i + 2] * s, o.y + p[i + 1], o.z - p[i] * s + p[i + 2] * c];
}
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Runs `seconds`, checking every frame; returns the largest door amount and joint step seen. */
function run(walker, rig, seconds, label, check = () => {}) {
  let door = 0, jump = 0, last = null;
  for (let t = 0; t < seconds; t += 1 / 60) {
    walker.update(1 / 60);
    for (const x of rig.pose) assert.ok(Number.isFinite(x), `${label}: finite pose`);
    door = Math.max(door, walker.transit.door);
    const now = WATCHED.map((b) => world(rig, b));
    if (last) for (let k = 0; k < now.length; k += 1) jump = Math.max(jump, dist(now[k], last[k]));
    last = now;
    for (const toe of [BONE.TOE_L, BONE.TOE_R]) assert.ok(world(rig, toe)[1] > -0.05, `${label}: toes above the ground`);
    check();
  }
  return { door, jump };
}

test('getting into the driver seat: door opened and shut, hand on the handle, seated at the anchor', () => {
  for (const stature of [1.55, 1.78, 1.95]) {
    const rig = testRig(stature), walker = createLocomotionController(rig, { seed: 2 }), stages = [];
    walker.on('action', (e) => stages.push(`${e.action}:${e.stage}`));
    walker.enterVehicle({ door: DOOR, seat: SEAT, kind: 'driver' });
    assert.equal(walker.action, 'enter');
    let onHandle = Infinity;
    const result = run(walker, rig, TRANSIT_SECONDS.enter + 0.1, `enter ${stature}`, () => {
      if (walker.transit.stage === 'open' && walker.transit.hand === 'right') {
        onHandle = Math.min(onHandle, dist(world(rig, BONE.HAND_R), walker.transit.handR));
      }
    });
    assert.deepEqual(stages, ['enter:start', 'enter:reach', 'enter:open', 'enter:step_in', 'enter:close', 'enter:done']);
    assert.ok(result.door > 0.95, 'the door opened fully');
    assert.ok(walker.transit.door < 0.02, 'and was shut again');
    assert.ok(onHandle < 0.12, `right hand on the outer handle (${onHandle.toFixed(3)} m)`);
    assert.ok(result.jump < 0.09, `no joint jumps between frames (${result.jump.toFixed(3)} m)`);
    assert.equal(walker.seated, 'driver');
    assert.equal(walker.action, null);
    const o = rig.instance.position;
    assert.ok(Math.hypot(o.x + 0.37, o.y - 0.5, o.z) < 1e-6, 'instance at the seat anchor');
    const hip = [(world(rig, BONE.THIGH_L)[0] + world(rig, BONE.THIGH_R)[0]) / 2, (world(rig, BONE.THIGH_L)[1] + world(rig, BONE.THIGH_R)[1]) / 2];
    assert.ok(Math.abs(hip[0] + 0.37) < 0.03 && Math.abs(hip[1] - 0.5) < 0.03, 'hip joints on the seat');

    // And out again: standing clear of the door, the door shut.
    stages.length = 0;
    walker.exitVehicle({ door: DOOR, seat: SEAT });
    const out = run(walker, rig, TRANSIT_SECONDS.exit + 0.1, `exit ${stature}`);
    assert.deepEqual(stages, ['exit:start', 'exit:step_out', 'exit:close', 'exit:done']);
    assert.ok(out.door > 0.95 && walker.transit.door < 0.02, 'door opened and shut');
    assert.ok(out.jump < 0.09, `exit: no joint jumps (${out.jump.toFixed(3)} m)`);
    assert.equal(walker.seated, null);
    assert.ok(Math.abs(rig.instance.position.y) < 1e-6 && rig.instance.position.x < -1.5, 'standing outside the door');
    const head = world(rig, BONE.HEAD);
    assert.ok(head[1] > 1.4 * stature / 1.78, 'standing upright');
    walker.update(1 / 60, { moveX: 0, moveZ: -1.5 });
    run(walker, rig, 0.5, 'walk away');
  }
});

test('carjacking: the pull event hauls the driver out; the dragged driver ends lying and gets up', () => {
  const thief = testRig(1.86), driver = testRig(1.7);
  const t = createLocomotionController(thief, { seed: 1 }), d = createLocomotionController(driver, { seed: 4 });
  driver.instance.position = { x: -0.37, y: 0.5, z: 0 };
  d.sit({ kind: 'driver' }, { fade: 0 });
  d.update(1 / 60);
  const stages = [];
  t.on('action', (e) => {
    stages.push(e.stage);
    if (e.stage === 'pull') d.exitVehicle({ door: DOOR, seat: SEAT, dragged: true });
  });
  let dragged = null;
  d.on('action', (e) => { if (e.action === 'dragged') dragged = e.stage; });
  t.enterVehicle({ door: DOOR, seat: SEAT, kind: 'driver', jack: true });
  for (let time = 0; time < TRANSIT_SECONDS.jack + 0.1; time += 1 / 60) {
    t.update(1 / 60); d.update(1 / 60);
    for (const x of driver.pose) assert.ok(Number.isFinite(x), 'driver pose finite');
  }
  assert.deepEqual(stages, ['start', 'reach', 'open', 'pull', 'step_in', 'close', 'done']);
  assert.equal(t.seated, 'driver');
  assert.equal(dragged, 'done');
  assert.equal(d.stance, 'fallen');
  const o = driver.instance.position;
  assert.ok(o.y === 0 && o.x < -1.6, 'thrown on the ground beside the door');
  assert.ok(world(driver, BONE.HEAD)[1] < 0.35, 'lying');
  d.play('getup');
  for (let time = 0; time < 1.9; time += 1 / 60) d.update(1 / 60);
  assert.equal(d.stance, 'stand');
  assert.ok(world(driver, BONE.HEAD)[1] > 1.4, 'back on the feet');
});

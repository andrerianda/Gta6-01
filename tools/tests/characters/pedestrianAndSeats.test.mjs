// The pedestrian poses and actions (crouch, cower, bench, phone, talk, point, panic, hit, fall,
// get up) and the vehicle seats (driver with the hands on a turning wheel, passenger, rider) on
// bodies of different sizes: where the hands, hips and feet end up, events, and finite poses.
import assert from 'node:assert/strict';
import test from 'node:test';
import { STANCES, createLocomotionController } from '../../../game/src/characters/controller/locomotionController.js';
import { BONE } from '../../../game/src/characters/skeleton/humanSkeleton.js';
import { createFkState } from '../../../game/src/characters/skeleton/forwardKinematics.js';
import { createPose } from '../../../game/src/characters/skeleton/poseBuffer.js';
import { createTestBody } from './referenceBody.mjs';

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function testRig(stature = 1.78) {
  const instance = { position: { x: 0, y: 0, z: 0 }, rotation: { y: 0 }, matrixWorld: { elements: IDENTITY } };
  return { instance, body: createTestBody(stature), pose: createPose(), fk: createFkState(), applyPose() {} };
}
const run = (walker, seconds, input = {}) => { for (let t = 0; t < seconds; t += 1 / 60) walker.update(1 / 60, input); };
const joint = (rig, bone) => { const p = rig.fk.position; return [p[bone * 3], p[bone * 3 + 1], p[bone * 3 + 2]]; };
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const finite = (rig, label) => { for (const x of rig.pose) assert.ok(Number.isFinite(x), `${label}: finite`); };
/** A node at p with columns X, Y (the wheel's column axis) and Z = X x Y. */
function node(p, X, Y) {
  const Z = [X[1] * Y[2] - X[2] * Y[1], X[2] * Y[0] - X[0] * Y[2], X[0] * Y[1] - X[1] * Y[0]];
  return { matrixWorld: { elements: [...X, 0, ...Y, 0, ...Z, 0, ...p, 1] } };
}

test('crouch, cower and bench sitting put hips, hands and feet where a person would', () => {
  for (const stature of [1.55, 1.78, 1.95]) {
    const rig = testRig(stature), walker = createLocomotionController(rig, { seed: 3 }), s = rig.body.legScale;
    walker.setStance('cower');
    run(walker, 0.6, { moveX: 0, moveZ: -2 });
    assert.equal(walker.state.speed, 0, 'cowering ignores moves');
    const head = joint(rig, BONE.HEAD);
    assert.ok(dist(joint(rig, BONE.HAND_L), head) < 0.25 && dist(joint(rig, BONE.HAND_R), head) < 0.25, 'hands over the head');
    assert.ok(joint(rig, BONE.THIGH_L)[1] < 0.55 * s, 'low crouch');
    for (const toe of [BONE.TOE_L, BONE.TOE_R]) assert.ok(joint(rig, toe)[1] > -0.03, 'toes not below the ground');
    walker.setStance('sit_bench', { seatHeight: 0.46 });
    run(walker, 1.6);
    assert.equal(walker.stance, 'sit_bench');
    const hip = (joint(rig, BONE.THIGH_L)[1] + joint(rig, BONE.THIGH_R)[1]) / 2;
    assert.ok(Math.abs(hip - 0.46 - 0.09 * rig.body.heightScale) < 0.02, `hips over the seat (${hip.toFixed(3)})`);
    for (const foot of [BONE.FOOT_L, BONE.FOOT_R]) {
      const y = joint(rig, foot)[1];
      assert.ok(y < rig.body.ankleHeight + 0.03 && y > rig.body.ankleHeight - 0.03, `feet on the ground (${y.toFixed(3)})`);
    }
    for (const name of Object.keys(STANCES)) { walker.setStance(name); run(walker, 1.2); finite(rig, name); }
  }
});

test('gestures: phone at the ear, panic arms over the head, pointing along the line, talking in front', () => {
  for (const stature of [1.55, 1.95]) {
    const rig = testRig(stature), walker = createLocomotionController(rig, { seed: 5 });
    walker.setGesture('phone');
    run(walker, 0.6);
    assert.ok(dist(joint(rig, BONE.HAND_R), joint(rig, BONE.HEAD)) < 0.2, 'phone hand at the head');
    walker.setGesture('panic');
    run(walker, 1, { moveX: 0, moveZ: -5 });
    const headY = joint(rig, BONE.HEAD)[1];
    assert.ok(joint(rig, BONE.HAND_L)[1] > headY && joint(rig, BONE.HAND_R)[1] > headY, 'panic: hands above the head');
    walker.setGesture(null);
    run(walker, 2);
    walker.pointAt(6, 2, -6);
    run(walker, 0.8);
    const shoulder = joint(rig, BONE.UPPER_ARM_R), hand = joint(rig, BONE.HAND_R), at = rig.instance.position;
    const sin = Math.sin(walker.state.yaw), cos = Math.cos(walker.state.yaw);
    const tx = (6 - at.x) * cos - (-6 - at.z) * sin, tz = (6 - at.x) * sin + (-6 - at.z) * cos;
    const a = [hand[0] - shoulder[0], hand[1] - shoulder[1], hand[2] - shoulder[2]];
    const b = [tx - shoulder[0], 2 - shoulder[1], tz - shoulder[2]];
    const angle = Math.acos((a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (Math.hypot(...a) * Math.hypot(...b)));
    assert.ok(angle < 0.15, `arm along the line to the target (${angle.toFixed(3)} rad)`);
    walker.setGesture('talk');
    run(walker, 1);
    for (const h of [BONE.HAND_L, BONE.HAND_R]) assert.ok(joint(rig, h)[2] < joint(rig, BONE.HIPS)[2] - 0.1, 'talking hands in front');
    finite(rig, 'talk');
  }
});

test('hit jolts away from the blow; fall lands lying with events; get up stands again', () => {
  const rig = testRig(1.78), walker = createLocomotionController(rig, { seed: 1 });
  const events = [];
  walker.on('action', (e) => events.push(`${e.action}:${e.stage}`));
  run(walker, 0.3);
  const before = joint(rig, BONE.HEAD)[2];
  walker.play('hit'); // from in front
  run(walker, 0.08);
  assert.ok(joint(rig, BONE.HEAD)[2] > before + 0.03, 'head thrown back');
  walker.play('fall');
  run(walker, 0.5);
  assert.equal(walker.action, 'fall');
  run(walker, 0.7);
  assert.equal(walker.stance, 'fallen');
  assert.ok(joint(rig, BONE.CHEST)[1] < 0.3 && joint(rig, BONE.HEAD)[1] < 0.35, 'lying flat');
  finite(rig, 'fallen');
  walker.play('getup');
  run(walker, 0.9);
  assert.equal(walker.action, 'getup');
  finite(rig, 'getting up');
  run(walker, 1.2);
  assert.equal(walker.stance, 'stand');
  assert.ok(joint(rig, BONE.HEAD)[1] > 1.45, 'standing again');
  assert.deepEqual(events, ['hit:start', 'fall:start', 'fall:landed', 'getup:start', 'getup:done']);
});

test('seats: hands on a turning wheel, on the grips, feet on the pegs, hips at the anchor', () => {
  for (const stature of [1.55, 1.78, 1.95]) {
    const rig = testRig(stature), walker = createLocomotionController(rig, { seed: 2 });
    const k = 1 / Math.hypot(0.42, 0.91), axis = [0, 0.42 * k, 0.91 * k], centre = [0, 0.34, -0.44];
    const wheel = node(centre, [1, 0, 0], axis);
    const events = [];
    walker.on('action', (e) => events.push(`${e.action}:${e.stage}`));
    walker.sit({ kind: 'driver', wheel, wheelRadius: 0.185 });
    run(walker, 0.8, { moveX: 0, moveZ: -3 });
    assert.equal(walker.state.speed, 0, 'seated ignores moves');
    const mid = (joint(rig, BONE.THIGH_L)[1] + joint(rig, BONE.THIGH_R)[1]) / 2;
    assert.ok(Math.abs(mid) < 0.01, 'hip joints at the anchor');
    for (const h of [BONE.HAND_L, BONE.HAND_R]) {
      const d = dist(joint(rig, h), centre);
      assert.ok(d > 0.08 && d < 0.3, `wrist at the rim (${d.toFixed(3)})`);
    }
    const leftY = joint(rig, BONE.HAND_L)[1], rightY = joint(rig, BONE.HAND_R)[1];
    // Turn the wheel 0.6 rad to the left (counter-clockwise from the driver).
    const c = Math.cos(0.6), s = Math.sin(0.6);
    const z0 = [0, -axis[2], axis[1]];
    const X = [c * 1 + s * (axis[1] * 0 - axis[2] * 0), c * 0 + s * (axis[2] * 1 - 0), c * 0 + s * (0 - axis[1] * 1)];
    wheel.matrixWorld.elements = node(centre, X, axis).matrixWorld.elements;
    run(walker, 0.1);
    assert.ok(joint(rig, BONE.HAND_R)[1] > rightY + 0.03 && joint(rig, BONE.HAND_L)[1] < leftY - 0.03, 'hands follow the wheel');
    assert.ok(z0.length === 3);
    walker.seat.lookBack = 1;
    run(walker, 0.2);
    finite(rig, 'looking back');
    walker.sit({ kind: 'passenger' });
    run(walker, 0.8);
    finite(rig, 'passenger');
    const gripL = node([-0.34, 0.4, -0.55], [1, 0, 0], [0, 1, 0]), gripR = node([0.34, 0.4, -0.55], [1, 0, 0], [0, 1, 0]);
    const footL = node([-0.2, -0.3, -0.08], [1, 0, 0], [0, 1, 0]), footR = node([0.2, -0.3, -0.08], [1, 0, 0], [0, 1, 0]);
    walker.sit({ kind: 'rider', gripL, gripR, footL, footR }, { fade: 0 });
    walker.seat.lean = 0.3;
    run(walker, 0.3);
    assert.ok(dist(joint(rig, BONE.FOOT_L), [-0.2, -0.3, -0.08]) < 0.03 && dist(joint(rig, BONE.FOOT_R), [0.2, -0.3, -0.08]) < 0.03, 'feet on the pegs');
    for (const [h, g] of [[BONE.HAND_L, [-0.34, 0.4, -0.55]], [BONE.HAND_R, [0.34, 0.4, -0.55]]]) {
      assert.ok(dist(joint(rig, h), g) < 0.14, `hand at the grip (${dist(joint(rig, h), g).toFixed(3)})`);
    }
    walker.sit(null);
    run(walker, 0.8);
    assert.equal(walker.layers.seat, 0);
    finite(rig, 'stood up');
    assert.deepEqual(events.slice(0, 1), ['sit:done']);
    assert.ok(events.includes('stand_up:done'));
  }
});

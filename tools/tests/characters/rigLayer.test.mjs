// The rig layer's maths: two-bone inverse kinematics, the look-at, and the binding of a pose to
// a skeleton whose bones have arbitrary roll (a posed file skeleton must land on the same joints
// as the run-time's own forward kinematics).
import assert from 'node:assert/strict';
import test from 'node:test';
import { SOLVED, createTwoBoneResult, solveTwoBone } from '../../../game/src/characters/ik/twoBoneSolver.js';
import { reachWithLimb } from '../../../game/src/characters/ik/limbPosing.js';
import { writeLocomotionPose } from '../../../game/src/characters/motion/locomotionPose.js';
import { createCharacterRig } from '../../../game/src/characters/rig/characterRig.js';
import { LOOK_LIMITS, writeLookAt } from '../../../game/src/characters/rig/lookAt.js';
import { computeForwardKinematics, createFkState } from '../../../game/src/characters/skeleton/forwardKinematics.js';
import { ARM_R, BONE, BONE_COUNT, BONE_NAMES, BONE_PARENT, LEG_L } from '../../../game/src/characters/skeleton/humanSkeleton.js';
import { createPose } from '../../../game/src/characters/skeleton/poseBuffer.js';
import { quatFromYawPitchRoll, quatMultiply, quatRotate, quatRotateInverse } from '../../../game/src/characters/skeleton/quaternionMath.js';
import { createTestBody } from './referenceBody.mjs';

test('two-bone IK reaches a target within reach, keeps bone lengths and bends towards the pole', () => {
  const out = createTwoBoneResult();
  const targets = [[0.1, -0.6, -0.2], [0.3, 0.2, -0.3], [-0.2, -0.3, 0.4], [0, -0.75, 0.05]];
  for (const [x, y, z] of targets) {
    solveTwoBone(out, x, y, z, 0, 0, -1, 0.45, 0.42, 0.01);
    assert.ok(Math.hypot(out[SOLVED.END] - x, out[SOLVED.END + 1] - y, out[SOLVED.END + 2] - z) < 1e-5);
    assert.ok(Math.abs(Math.hypot(out[SOLVED.MIDDLE], out[SOLVED.MIDDLE + 1], out[SOLVED.MIDDLE + 2]) - 0.45) < 1e-5);
    const lower = Math.hypot(out[SOLVED.END] - out[SOLVED.MIDDLE], out[SOLVED.END + 1] - out[SOLVED.MIDDLE + 1], out[SOLVED.END + 2] - out[SOLVED.MIDDLE + 2]);
    assert.ok(Math.abs(lower - 0.42) < 1e-5);
    // The middle joint is on the pole's side of the line to the target.
    const t = (out[SOLVED.MIDDLE] * x + out[SOLVED.MIDDLE + 1] * y + out[SOLVED.MIDDLE + 2] * z) / (x * x + y * y + z * z);
    assert.ok(out[SOLVED.MIDDLE + 2] - z * t < 1e-6, 'the knee points forward (-Z)');
    assert.equal(out[SOLVED.STRETCH], 1);
  }
});

test('two-bone IK eases a limb straight for a target beyond reach, without a jump or a NaN', () => {
  const out = createTwoBoneResult();
  let previous = 0.49;
  for (let distance = 0.5; distance < 1.6; distance += 0.01) {
    solveTwoBone(out, 0, -distance, 0, 0, 0, -1, 0.45, 0.42);
    for (const value of out) assert.ok(Number.isFinite(value));
    const reached = Math.hypot(out[SOLVED.END], out[SOLVED.END + 1], out[SOLVED.END + 2]);
    assert.ok(reached <= 0.87 && reached >= previous - 1e-6, 'reach grows steadily and never exceeds the limb');
    assert.ok(reached - previous < 0.0101);
    previous = reached;
  }
  solveTwoBone(out, 0, 0, 0, 0, 0, -1, 0.45, 0.42);
  for (const value of out) assert.ok(Number.isFinite(value));
});

test('a limb reaches a point in character space on bodies of every size', () => {
  for (const stature of [1.55, 1.78, 1.95]) {
    const body = createTestBody(stature), pose = createPose(), fk = createFkState();
    computeForwardKinematics(body, pose, fk);
    const k = stature / 1.78;
    reachWithLimb(pose, body, fk, LEG_L, -0.12 * k, 0.3 * k, -0.25 * k, 0, 0.2, -1, 0.01);
    reachWithLimb(pose, body, fk, ARM_R, 0.25 * k, 1.3 * k, -0.35 * k, 0.5, -1, 0.3, 0.01);
    const check = createFkState();
    computeForwardKinematics(body, pose, check);
    const foot = BONE.FOOT_L * 3, hand = BONE.HAND_R * 3;
    assert.ok(Math.hypot(check.position[foot] + 0.12 * k, check.position[foot + 1] - 0.3 * k, check.position[foot + 2] + 0.25 * k) < 1e-4);
    assert.ok(Math.hypot(check.position[hand] - 0.25 * k, check.position[hand + 1] - 1.3 * k, check.position[hand + 2] + 0.35 * k) < 1e-4);
  }
});

test('look-at points the face at a target within its limits and never beyond them', () => {
  const body = createTestBody(1.78), pose = createPose(), fk = createFkState(), face = new Float32Array(3);
  const lookError = (x, y, z) => {
    writeLocomotionPose(pose, body, fk, { speed: 1.4, phase: 0.2 });
    writeLookAt(pose, body, fk, x, y, z);
    quatRotate(face, 0, fk.rotation, BONE.HEAD * 4, 0, 0, -1);
    const h = BONE.HEAD * 3, dx = x - fk.position[h], dy = y - fk.position[h + 1] - body.headTop * 0.45, dz = z - fk.position[h + 2];
    const n = Math.hypot(dx, dy, dz);
    return Math.acos(Math.min(1, (face[0] * dx + face[1] * dy + face[2] * dz) / n));
  };
  assert.ok(lookError(-3, 2.6, -4) < 0.09, 'a target ahead to the left and above');
  assert.ok(lookError(2, 0.4, -5) < 0.09, 'a target ahead to the right and below');
  lookError(0.5, 1.6, 6); // behind: the head turns as far as it comfortably can and stops
  const yaw = Math.atan2(-face[0], -face[2]);
  assert.ok(Math.abs(yaw) < LOOK_LIMITS.yaw + 0.2 && Math.abs(yaw) > 0.8);
});

/** A stand-in for a THREE.Object3D: just what the rig reads and writes. */
function fakeNode(name, parent) {
  const node = {
    name, parent, children: [],
    position: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
    quaternion: { x: 0, y: 0, z: 0, w: 1, set(x, y, z, w) { this.x = x; this.y = y; this.z = z; this.w = w; } },
    scale: { x: 1, y: 1, z: 1 },
    traverse(visit) {
      visit(node);
      for (const child of node.children) child.traverse(visit);
    },
  };
  if (parent) parent.children.push(node);
  return node;
}

function worldOf(node, root, position, rotation) {
  const chain = [];
  for (let each = node; each !== root; each = each.parent) chain.unshift(each);
  position.fill(0);
  rotation.set([0, 0, 0, 1]);
  const moved = new Float32Array(3);
  for (const each of chain) {
    quatRotate(moved, 0, rotation, 0, each.position.x, each.position.y, each.position.z);
    position[0] += moved[0]; position[1] += moved[1]; position[2] += moved[2];
    quatMultiply(rotation, 0, rotation, 0, [each.quaternion.x, each.quaternion.y, each.quaternion.z, each.quaternion.w], 0);
  }
}

test('a pose written to a file skeleton with arbitrary bone rolls lands on the run-time joints', () => {
  const body = createTestBody(1.9);
  // Build the file's skeleton: every bone at its rest joint, each with its own odd orientation.
  const instance = fakeNode('person', null), armature = fakeNode('rig', instance);
  const nodes = [], rolls = new Float32Array(BONE_COUNT * 4), local = new Float32Array(3);
  for (let bone = 0; bone < BONE_COUNT - 1; bone += 1) { // the file has no jaw
    const parent = BONE_PARENT[bone];
    const node = fakeNode(BONE_NAMES[bone], parent < 0 ? armature : nodes[parent]);
    quatFromYawPitchRoll(rolls, bone * 4, bone * 0.7, bone * 1.3 - 2, bone * 0.4 + 1);
    const p = body.restPosition, b = bone * 3;
    if (parent < 0) {
      node.position.set(p[b], p[b + 1], p[b + 2]);
      node.quaternion.set(rolls[0], rolls[1], rolls[2], rolls[3]);
    } else {
      quatRotateInverse(local, 0, rolls, parent * 4, p[b] - p[parent * 3], p[b + 1] - p[parent * 3 + 1], p[b + 2] - p[parent * 3 + 2]);
      node.position.set(local[0], local[1], local[2]);
      const q = [0, 0, 0, 1];
      quatMultiply(q, 0, [-rolls[parent * 4], -rolls[parent * 4 + 1], -rolls[parent * 4 + 2], rolls[parent * 4 + 3]], 0, rolls, bone * 4);
      node.quaternion.set(q[0], q[1], q[2], q[3]);
    }
    nodes.push(node);
  }
  const rig = createCharacterRig(instance, { stature: 1.9 });
  assert.ok(Math.abs(rig.body.legLength - body.legLength) < 1e-5, 'the body is measured from the file');
  assert.equal(rig.body.hasJaw, false);
  const position = new Float32Array(3), rotation = new Float32Array(4);
  for (const [speed, phase] of [[0, 0.1], [1.4, 0.05], [1.4, 0.6], [4.5, 0.3], [7, 0.85]]) {
    writeLocomotionPose(rig.pose, rig.body, rig.fk, { speed, phase, time: 3 });
    writeLookAt(rig.pose, rig.body, rig.fk, -2, 1.2, -3);
    rig.applyPose();
    const expected = computeForwardKinematics(rig.body, rig.pose, createFkState());
    for (let bone = 0; bone < BONE_COUNT - 1; bone += 1) {
      worldOf(nodes[bone], instance, position, rotation);
      const e = expected.position, b = bone * 3;
      const error = Math.hypot(position[0] - e[b], position[1] - e[b + 1], position[2] - e[b + 2]);
      assert.ok(error < 2e-4, `${BONE_NAMES[bone]} is ${error.toFixed(5)} m off at speed ${speed}`);
    }
  }
});

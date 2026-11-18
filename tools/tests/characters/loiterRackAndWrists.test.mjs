// Shift 11: the crowd's loitering poses (stance 'watch': hands clasped at the belt; stance
// 'lean_wall': one sole up on the wall behind; gesture 'smoke': the hand to the mouth now and
// then), the pump's play('rack') (the off hand rides the caller's stroke and a shot no longer racks
// by itself once it is used), the wrist's roll shared with the forearm (no wrung wrists), the
// standing shooter's stance as wide as the owner asked, and no pop of the aimed arms when a
// strafe crosses pure sideways.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createLocomotionController, STANCES } from '../../../game/src/characters/controller/locomotionController.js';
import { GESTURES } from '../../../game/src/characters/motion/everydayPose.js';
import { WRIST } from '../../../game/src/characters/motion/handPlacement.js';
import { createGripHands } from '../../../game/src/characters/rig/gripHands.js';
import { ARM_L, ARM_R, BONE } from '../../../game/src/characters/skeleton/humanSkeleton.js';
import { createFkState } from '../../../game/src/characters/skeleton/forwardKinematics.js';
import { createPose } from '../../../game/src/characters/skeleton/poseBuffer.js';
import { createTestBody } from './referenceBody.mjs';

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function person() {
  const instance = { position: { x: 0, y: 0, z: 0 }, rotation: { y: 0 }, matrixWorld: { elements: IDENTITY } };
  const rig = { instance, body: createTestBody(1.86), pose: createPose(), fk: createFkState(), applyPose() {} };
  return { walker: createLocomotionController(rig, { seed: 3 }), rig, p: rig.fk.position };
}
const J = (p, b) => [p[b * 3], p[b * 3 + 1], p[b * 3 + 2]];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const finite = (pose) => pose.every(Number.isFinite);

test('watch: hands clasped together in front of the belt', () => {
  const { walker, rig, p } = person();
  assert.ok(STANCES.watch && STANCES.lean_wall);
  walker.setStance('watch');
  for (let i = 0; i < 90; i += 1) walker.update(1 / 60);
  assert.ok(finite(rig.pose));
  const l = J(p, ARM_L.end), r = J(p, ARM_R.end), hips = J(p, BONE.HIPS);
  assert.ok(dist(l, r) < 0.12, `hands ${dist(l, r).toFixed(3)} apart`);
  assert.ok(Math.abs((l[1] + r[1]) / 2 - hips[1]) < 0.12, 'at the belt');
  assert.ok((l[2] + r[2]) / 2 < hips[2] - 0.08, 'in front of the body');
});

test('lean_wall: the right sole up behind, the left foot planted, still', () => {
  const { walker, rig, p } = person();
  walker.setStance('lean_wall');
  for (let i = 0; i < 90; i += 1) walker.update(1 / 60, { moveX: 1, moveZ: 0 });
  assert.ok(finite(rig.pose));
  assert.equal(rig.instance.position.x, 0, 'does not walk off');
  const fr = J(p, BONE.FOOT_R), fl = J(p, BONE.FOOT_L), neck = J(p, BONE.NECK), hips = J(p, BONE.HIPS);
  assert.ok(fr[1] > 0.3, `right foot raised ${fr[1].toFixed(2)}`);
  assert.ok(fl[1] < 0.15, 'left foot on the ground');
  assert.ok(fr[2] > fl[2] + 0.2, 'the raised foot behind, against the wall');
  assert.ok(neck[2] > hips[2], 'leaning back');
});

test('smoke: the cigarette hand comes up to the mouth within ten seconds', () => {
  assert.ok(GESTURES.includes('smoke'));
  const { walker, rig, p } = person();
  walker.setGesture('smoke');
  let nearest = Infinity, farthest = 0;
  for (let i = 0; i < 600; i += 1) {
    walker.update(1 / 60);
    if (i < 30) continue;
    const d = dist(J(p, ARM_R.end), J(p, BONE.HEAD));
    nearest = Math.min(nearest, d); farthest = Math.max(farthest, d);
  }
  assert.ok(finite(rig.pose));
  assert.ok(nearest < 0.2, `hand to the mouth (${nearest.toFixed(2)} m from the head joint)`);
  assert.ok(farthest > 0.4, 'and down again');
});

test("play('rack'): the off hand rides the caller's stroke; shots no longer rack by themselves", () => {
  const { walker } = person();
  walker.holdWeapon('shotgun_pump');
  const aim = walker.aim;
  const run = (n) => { let most = 0; for (let i = 0; i < n; i += 1) { walker.aimAt(0, 1.3, -10); walker.update(1 / 60); most = Math.max(most, aim.rack); } return most; };
  run(30);
  walker.play('fire');
  assert.ok(run(50) > 0.5, 'before any rack call a shot racks by itself');
  walker.play('rack', { duration: 0.5, delay: 0.1 });
  const stroke = run(50);
  assert.ok(stroke > 0.6 && stroke <= 0.78 + 1e-6, `the stroke follows the pump's 7 cm (${stroke.toFixed(2)})`);
  assert.equal(aim.rack, 0);
  walker.play('fire');
  assert.equal(run(50), 0, 'a shot alone no longer racks');
});

test('wrists: the forearm takes the roll, the wrist itself rolls at most WRIST.maxTwist', () => {
  for (const hold of ['pistol_two_hand', 'rifle', 'shotgun_pump', 'two_hand_bat']) {
    const { walker, rig } = person();
    walker.holdWeapon(hold);
    for (let i = 0; i < 60; i += 1) { walker.aimAt(0.3, 1.35, -12); walker.update(1 / 60); }
    const off = rig.body.restOffset, P = rig.pose;
    for (const arm of [ARM_L, ARM_R]) {
      const e = arm.end * 3, n = Math.hypot(off[e], off[e + 1], off[e + 2]), h = arm.end * 4;
      const t = (off[e] * P[h] + off[e + 1] * P[h + 1] + off[e + 2] * P[h + 2]) / n;
      let twist = Math.abs(2 * Math.atan2(t, P[h + 3]));
      if (twist > Math.PI) twist = 2 * Math.PI - twist;
      assert.ok(twist <= WRIST.maxTwist + 0.02, `${hold} ${arm.side < 0 ? 'left' : 'right'} wrist rolls ${(twist * 57.3).toFixed(0)} deg`);
    }
  }
});

test('the standing shooter: feet 0.45-0.55 m apart sideways, the left 15-25 cm ahead', () => {
  const { walker, p } = person();
  walker.holdWeapon('pistol_two_hand');
  for (let i = 0; i < 60; i += 1) { walker.aimAt(0, 1.35, -12); walker.update(1 / 60); }
  const width = p[BONE.FOOT_R * 3] - p[BONE.FOOT_L * 3], stagger = p[BONE.FOOT_R * 3 + 2] - p[BONE.FOOT_L * 3 + 2];
  assert.ok(width >= 0.43 && width <= 0.56, `width ${width.toFixed(2)}`);
  assert.ok(stagger >= 0.15 && stagger <= 0.26, `stagger ${stagger.toFixed(2)}`);
});

test('grip hands: hidden on set-up, swapped in while a weapon is held, out again when put away', () => {
  const nodes = ['hands', 'hands_lod0', 'hand_r_grip', 'hand_l_grip', 'body_lod0'].map((name) => ({ name, visible: true }));
  const instance = { position: { x: 0, y: 0, z: 0 }, rotation: { y: 0 }, matrixWorld: { elements: IDENTITY }, traverse(f) { nodes.forEach(f); } };
  const rig = { instance, body: createTestBody(1.86), pose: createPose(), fk: createFkState(), applyPose() {} };
  const walker = createLocomotionController(rig, { seed: 1 });
  const vis = () => nodes.map((n) => (n.visible ? 1 : 0)).join('');
  assert.equal(vis(), '11001', 'grips hidden at once, the LOD level left to its LOD');
  walker.holdWeapon('pistol_two_hand');
  for (let i = 0; i < 30; i += 1) walker.update(1 / 60);
  assert.equal(vis(), '01111');
  walker.holdWeapon(null);
  for (let i = 0; i < 30; i += 1) walker.update(1 / 60);
  assert.equal(vis(), '11001');
  assert.ok(createGripHands({}).available === false, 'a person without grip meshes is left alone');
});

test('aimed and strafing across pure sideways: no pop of the hands', () => {
  const { walker, p } = person();
  walker.holdWeapon('pistol_two_hand');
  let prev = null, worst = 0;
  for (let i = 0; i < 240; i += 1) {
    const a = -0.6 + 1.2 * (i / 240); // the walk direction sweeps through sideways to the right
    walker.aimAt(0, 1.35, -12);
    walker.update(1 / 60, { moveX: 1.3 * Math.cos(a), moveZ: 1.3 * Math.sin(a), facing: 0, strafe: true });
    const h = J(p, ARM_R.end);
    if (prev && i > 60) worst = Math.max(worst, dist(h, prev));
    prev = h;
  }
  assert.ok(worst < 0.03, `largest hand step ${(worst * 100).toFixed(1)} cm per frame`);
});

// Pure rules of the player and the follow camera: frame-rate independent smoothing, the on-foot
// movement rules (inertia, turning, sprint, sharp turns) and the shoulder framing.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  approach, approachAngle, createPointSpring, lerpAngle, moveToward, springToward, wrapAngle,
} from '../../../game/src/player/smoothMotion.js';
import { ON_FOOT_TUNING, createOnFootMovement, createOnFootState, readOnFootIntent, steerOnFoot } from '../../../game/src/player/onFootMovement.js';
import { createOnFootCamera, orbitPoint, shoulderOffsetFor } from '../../../game/src/player/onFootCamera.js';

const close = (a, b, tolerance, message) => assert.ok(Math.abs(a - b) <= tolerance, `${message}: ${a} vs ${b}`);

test('smoothing gives the same result at any frame rate', () => {
  for (const rate of [30, 60, 144]) {
    let value = 0;
    for (let i = 0; i < rate; i += 1) value = approach(value, 10, 3, 1 / rate);
    close(value, 10 * (1 - Math.exp(-3)), 1e-9, `approach at ${rate} fps`);
  }
  const results = [30, 60, 144].map((rate) => {
    const spring = createPointSpring();
    for (let i = 0; i < rate * 2; i += 1) springToward(spring.x, 5 * (i / rate), 0.1, 1 / rate);
    return spring.x.value;
  });
  // The 30 fps run sees the target half a frame older; within a couple of per cent of the travel.
  close(results[0], results[2], 0.1, 'a spring following a moving point');
});

test('angles wrap and approach the short way round', () => {
  close(wrapAngle(Math.PI * 3), Math.PI, 1e-9, 'wrap');
  close(lerpAngle(3, -3, 0.5), Math.PI, 0.01, 'lerp across the seam');
  const turned = approachAngle(3, -3, 100, 1);
  close(turned, -3, 1e-6, 'approach across the seam');
  close(approachAngle(0, 1, 1000, 0.1, 2), 0.2, 1e-9, 'turn rate limit');
  assert.equal(moveToward(0, 5, 2, 4, 0.5), 1);
  assert.equal(moveToward(5, 0, 2, 4, 0.5), 3);
});

test('the wanted velocity runs by default, sprints with Shift, walks, and stops', () => {
  const state = createOnFootState();
  const intent = { x: 0, z: -1, sprint: false, walk: false };
  steerOnFoot(state, intent);
  close(state.wantZ, -ON_FOOT_TUNING.runSpeed, 1e-9, 'runs by default');
  close(state.wantedHeading, 0, 1e-9, 'north');
  intent.sprint = true;
  steerOnFoot(state, intent);
  close(state.wantZ, -ON_FOOT_TUNING.sprintSpeed, 1e-9, 'sprints with Shift');
  assert.ok(state.sprinting);
  intent.walk = true;
  steerOnFoot(state, intent);
  close(state.wantZ, -ON_FOOT_TUNING.walkSpeed, 1e-9, 'walk beats sprint');
  intent.x = 0.3; intent.z = 0; intent.walk = false; intent.sprint = false;
  steerOnFoot(state, intent);
  close(state.wantX, ON_FOOT_TUNING.runSpeed * 0.3, 1e-9, 'half a stick, a slower pace');
  intent.x = 0;
  steerOnFoot(state, intent);
  assert.ok(!state.moving && state.wantX === 0 && state.wantZ === 0);
});

test('a jump crouches first, then takes off, and the landing is recorded', () => {
  const movement = createOnFootMovement({ groundHeightAt: () => 0 });
  movement.placeAt(0, 0, 0);
  const jump = { x: 0, z: 0, sprint: false, walk: false, jump: true };
  movement.step(jump, 1 / 60);
  assert.ok(movement.state.grounded && movement.state.takeoff > 0, 'crouching, still on the ground');
  jump.jump = false;
  for (let i = 0; i < 8; i += 1) movement.step(jump, 1 / 60);
  assert.ok(!movement.state.grounded, 'airborne after the crouch');
  for (let i = 0; i < 90; i += 1) movement.step(jump, 1 / 60);
  assert.ok(movement.state.grounded && movement.state.landings === 1 && movement.state.landedSpeed > 3);
});

test('move keys are relative to the camera', () => {
  const held = new Set(['moveForward']);
  const input = { axis: (name) => (name === 'moveZ' && held.has('moveForward') ? 1 : 0), held: () => false, pressed: () => false };
  const intent = readOnFootIntent(input, Math.PI / 2, {});
  close(intent.x, -1, 1e-9, 'facing west, W walks west'); close(intent.z, 0, 1e-9, 'no north part');
});

test('the ground follower walks over flat ground and lands a jump', () => {
  const movement = createOnFootMovement({ groundHeightAt: () => 1.2 });
  movement.placeAt(0, 0, 0);
  for (let i = 0; i < 8; i += 1) movement.step({ x: 0, z: 0, sprint: false, walk: false, jump: i === 0 }, 1 / 60);
  assert.ok(!movement.state.grounded && movement.state.y > 1.2, 'leaves the ground');
  movement.follow(0, -4.3, 0, 4.3);   // what the locomotion controller hands back each frame
  for (let i = 0; i < 120; i += 1) movement.step({ x: 0, z: -1, sprint: false, walk: false, jump: false }, 1 / 60);
  assert.ok(movement.state.grounded);
  assert.equal(movement.state.y, 1.2);
  assert.ok(movement.state.z < -2, 'moved north');
});

test('the shoulder view puts the lead a third of the way from the left edge', () => {
  const fov = 58, aspect = 16 / 9, distance = 3.6;
  const offset = shoulderOffsetFor(0.33, distance, fov, aspect);
  const pivot = { x: 0, y: 0, z: 0 };
  const camera = orbitPoint({}, pivot, 0, 0, offset, 0.3, distance);
  // Seen from the camera (looking down -Z), the pivot is offset to the left by `offset`.
  const ndcX = (pivot.x - camera.x) / (distance * Math.tan((fov * Math.PI) / 360) * aspect);
  close((ndcX + 1) / 2, 1 / 3, 0.01, 'screen share from the left');
  const turned = orbitPoint({}, pivot, Math.PI / 2, 0, 0, 0, 4);
  close(turned.x, 4, 1e-9, 'facing west, the camera is east of the pivot');
});

test('the close view and the aim framing meet the owner\'s settled numbers', () => {
  const view = createOnFootCamera();
  const target = { x: 0, y: 0, z: 0, heading: 0, speed: 0, sprinting: false, aiming: false };
  const still = { lookX: 0, lookY: 0, sensitivity: 0, invertY: false, swapShoulder: false };
  const shot = { pivot: {}, shoulder: {}, camera: {} };
  const degrees = (radians) => (radians * 180) / Math.PI;
  view.cut(target);
  view.update(0, target, still, 58, 16 / 9, shot);
  const ground = Math.hypot(shot.camera.x, shot.camera.z) - 0.13;   // to the upper back
  assert.ok(ground >= 2.0 && ground <= 2.4, `close: ${ground} m behind the back`);
  assert.ok(shot.camera.y >= 1.6 && shot.camera.y <= 1.75, `close: camera at ${shot.camera.y} m`);
  assert.ok(-degrees(shot.pitch) >= 2 && -degrees(shot.pitch) <= 5.01, 'close: 2 to 5 degrees down');
  const fov = 58 + shot.fovOffset;
  assert.ok(fov >= 55 && fov <= 60, 'close: field of view');
  const half = Math.tan(((fov / 2) * Math.PI) / 180);
  const vanishing = 0.5 - 0.5 * Math.tan(-shot.pitch) / half;
  assert.ok(vanishing >= 0.38 && vanishing <= 0.42, `close: vanishing point at ${vanishing} from the top`);
  const spineAt = 0.5 - 0.5 * view.rig.screenOffset;
  assert.ok(spineAt >= 0.34 && spineAt <= 0.4, `close: spine at ${spineAt}`);
  const screenY = (height) => 0.5 + 0.5 * Math.tan(Math.atan2(shot.camera.y - height, ground + 0.13) + shot.pitch) / half;
  assert.ok(screenY(1.86) > 0.28 && screenY(1.86) < 0.4, `close: head near the upper third (${screenY(1.86)})`);
  assert.ok(screenY(0) > 1 && screenY(0.6) < 1.02, 'close: from about the thighs up');
  target.aiming = true;
  let settled = 0;
  for (let i = 0; i < 60 && view.rig.aim < 0.95; i += 1) { view.update(1 / 60, target, still, 58, 16 / 9, shot); settled += 1 / 60; }
  assert.ok(settled > 0.2 && settled < 0.36, `aim eases in over ${settled} s`);
  for (let i = 0; i < 60; i += 1) view.update(1 / 60, target, still, 58, 16 / 9, shot);
  // The owner's direction on aiming (08:00): over the right shoulder, 0.55 to 0.7 m right of the
  // spine (0.52 kept for the framing), about 1.1 to 1.4 m from the head (1.5 kept for the
  // framing), eye height, 45 to 50 degrees; the back of the head 28 to 32 % from the left, its
  // top 38 to 42 % from the top (a little latitude: the aspect and the pose move them).
  const head = { x: 0, y: 1.86, z: -0.05 };
  const fromHead = Math.hypot(shot.camera.x - head.x, shot.camera.y - head.y, shot.camera.z - head.z);
  assert.ok(fromHead >= 1.1 && fromHead <= 1.65, `aim: ${fromHead} m from the head`);
  assert.ok(shot.camera.x >= 0.5 && shot.camera.x <= 0.7, `aim: ${shot.camera.x} m right of the spine`);
  assert.ok(shot.camera.y >= 1.65 && shot.camera.y <= 1.75, `aim: camera at ${shot.camera.y} m`);
  const aimFov = 58 + shot.fovOffset;
  assert.ok(aimFov >= 45 && aimFov <= 50, `aim: field of view ${aimFov}`);
  const aimHalf = Math.tan(((aimFov / 2) * Math.PI) / 180);
  const depth = shot.camera.z - head.z;
  const headX = 0.5 + 0.5 * ((head.x - shot.camera.x) / depth) / (aimHalf * (16 / 9));
  assert.ok(headX >= 0.26 && headX <= 0.32, `aim: head at ${headX} from the left`);
  const headTop = 0.5 - 0.5 * (Math.tan(Math.atan2(1.9 - shot.camera.y, depth) + shot.pitch) / aimHalf);
  assert.ok(headTop >= 0.34 && headTop <= 0.42, `aim: top of the head at ${headTop} from the top`);
});

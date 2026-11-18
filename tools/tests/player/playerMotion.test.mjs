// Pure rules of the player and the follow camera: frame-rate independent smoothing, the on-foot
// movement rules (inertia, turning, sprint, sharp turns), the shoulder framing and the exit door.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  approach, approachAngle, createPointSpring, lerpAngle, moveToward, springToward, wrapAngle,
} from '../../../game/src/player/smoothMotion.js';
import { ON_FOOT_TUNING, createOnFootMovement, createOnFootState, readOnFootIntent, steerOnFoot } from '../../../game/src/player/onFootMovement.js';
import { createOnFootCamera, orbitPoint, shoulderOffsetFor } from '../../../game/src/player/onFootCamera.js';
import { driverDoorPoint } from '../../../game/src/player/vehicleEntry.js';

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

test('free roam centres the whole lead; aiming eases in over the right shoulder (owner\'s numbers)', () => {
  const view = createOnFootCamera();
  const target = { x: 0, y: 0, z: 0, heading: 0, speed: 0, sprinting: false, aiming: false };
  const still = { lookX: 0, lookY: 0, sensitivity: 0, invertY: false, swapShoulder: false };
  const shot = { pivot: {}, shoulder: {}, camera: {} };
  const degrees = (radians) => (radians * 180) / Math.PI;
  view.cut(target);
  view.update(0, target, still, 58, 16 / 9, shot);
  assert.ok(shot.camera.z >= 3.5 && shot.camera.z <= 4.0, `roam: ${shot.camera.z} m behind`);
  assert.ok(shot.camera.y >= 2.3 && shot.camera.y <= 2.6, `roam: camera at ${shot.camera.y} m`);
  assert.ok(-degrees(shot.pitch) >= 8 && -degrees(shot.pitch) <= 12, 'roam: 8 to 12 degrees down');
  assert.ok(Math.abs(shot.camera.x) < 1e-9, 'roam: centred');
  assert.ok(58 + shot.fovOffset >= 50 && 58 + shot.fovOffset <= 55, 'roam: field of view');
  // Feet 8-10 % above the bottom edge and the lead 40-45 % of the height (a 1.86 m lead).
  const half = Math.tan((((58 + shot.fovOffset) / 2) * Math.PI) / 180);
  const screenY = (height) => 0.5 + 0.5 * Math.tan(Math.atan2(shot.camera.y - height, shot.camera.z) + shot.pitch) / half;
  close(screenY(0), 0.91, 0.015, 'feet above the bottom');
  close(screenY(0) - screenY(1.86), 0.425, 0.03, 'share of the height');
  target.aiming = true;
  let settled = 0;
  for (let i = 0; i < 60 && view.rig.aim < 0.95; i += 1) { view.update(1 / 60, target, still, 58, 16 / 9, shot); settled += 1 / 60; }
  assert.ok(settled > 0.2 && settled < 0.36, `aim eases in over ${settled} s`);
  for (let i = 0; i < 60; i += 1) view.update(1 / 60, target, still, 58, 16 / 9, shot);
  const behind = Math.hypot(shot.camera.x, shot.camera.z);
  assert.ok(behind >= 1.2 && behind <= 1.6, `aim: ${behind} m behind`);
  assert.ok(shot.camera.y >= 1.4 && shot.camera.y <= 1.7 && shot.camera.x > 0.3, 'aim: shoulder height, to the right');
  const spine = 0.5 - 0.5 * view.rig.screenOffset;
  assert.ok(spine >= 0.3 && spine <= 0.38, `aim: spine at ${spine}`);
});

test('the lead steps out on the driver side', () => {
  const door = driverDoorPoint({ x: 0, z: 0 }, 0, 2.4);
  assert.ok(door.x < -1 && Math.abs(door.z) < 1e-9, 'left of a car facing north');
});

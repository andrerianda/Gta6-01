// Pure rules of the player and the follow camera: frame-rate independent smoothing, the on-foot
// movement rules (inertia, turning, sprint, sharp turns), the shoulder framing and the exit door.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  approach, approachAngle, createPointSpring, lerpAngle, moveToward, springToward, wrapAngle,
} from '../../../game/src/player/smoothMotion.js';
import { ON_FOOT_TUNING, createOnFootMovement, createOnFootState, readOnFootIntent, steerOnFoot } from '../../../game/src/player/onFootMovement.js';
import { orbitPoint, shoulderOffsetFor } from '../../../game/src/player/onFootCamera.js';
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

test('the lead accelerates with a step of inertia, sprints, and stops', () => {
  const state = createOnFootState();
  const intent = { x: 0, z: -1, sprint: false, walk: false };
  steerOnFoot(state, intent, 1 / 60);
  assert.ok(state.speed > 0 && state.speed < 0.2, 'no instant start');
  for (let i = 0; i < 120; i += 1) steerOnFoot(state, intent, 1 / 60);
  close(state.speed, ON_FOOT_TUNING.runSpeed, 1e-9, 'runs by default');
  intent.sprint = true;
  for (let i = 0; i < 120; i += 1) steerOnFoot(state, intent, 1 / 60);
  close(state.speed, ON_FOOT_TUNING.sprintSpeed, 1e-9, 'sprints with Shift');
  assert.ok(state.sprinting);
  intent.z = 0; intent.sprint = false;
  steerOnFoot(state, intent, 1 / 60);
  assert.ok(state.speed > 6, 'no instant stop');
  for (let i = 0; i < 60; i += 1) steerOnFoot(state, intent, 1 / 60);
  assert.equal(state.speed, 0);
});

test('the lead turns smoothly toward the move direction and slows through a sharp turn', () => {
  const state = createOnFootState();
  const ahead = { x: 0, z: -1, sprint: false, walk: false };
  for (let i = 0; i < 120; i += 1) steerOnFoot(state, ahead, 1 / 60);
  const back = { x: 0, z: 1, sprint: false, walk: false };
  steerOnFoot(state, back, 1 / 60);
  assert.ok(Math.abs(state.heading) < 0.2, 'no snap on reversing');
  let slowest = Infinity;
  for (let i = 0; i < 90; i += 1) {
    steerOnFoot(state, back, 1 / 60);
    slowest = Math.min(slowest, state.speed);
  }
  assert.ok(slowest < ON_FOOT_TUNING.runSpeed * 0.6, 'slows through the turn');
  close(Math.abs(state.heading), Math.PI, 0.01, 'faces the new way');
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
  movement.step({ x: 0, z: 0, sprint: false, walk: false, jump: true }, 1 / 60);
  assert.ok(!movement.state.grounded && movement.state.y > 1.2, 'leaves the ground');
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

test('the lead steps out on the driver side', () => {
  const door = driverDoorPoint({ x: 0, z: 0 }, 0, 2.4);
  assert.ok(door.x < -1 && Math.abs(door.z) < 1e-9, 'left of a car facing north');
});

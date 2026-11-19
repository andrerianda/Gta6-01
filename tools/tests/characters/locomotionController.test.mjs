// The locomotion controller: inertia, frame-rate independence, the phase tied to distance, foot
// strikes, turning on the spot, lean and bank, determinism, and any body size.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createLocomotionController } from '../../../game/src/characters/controller/locomotionController.js';
import {
  LOCOMOTION_TUNING, createLocomotionState, stepLocomotionState, wrapAngle, yawOfDirection,
} from '../../../game/src/characters/controller/locomotionState.js';
import { createFkState } from '../../../game/src/characters/skeleton/forwardKinematics.js';
import { createPose } from '../../../game/src/characters/skeleton/poseBuffer.js';
import { createTestBody } from './referenceBody.mjs';

/** A rig-shaped stand-in: what the controller reads (no bones to write to). */
function testRig(stature = 1.78) {
  const instance = { position: { x: 0, y: 0, z: 0 }, rotation: { y: 0 } };
  return { instance, body: createTestBody(stature), pose: createPose(), fk: createFkState(), applyPose() {} };
}

/** Runs a state for `seconds` at `fps` with one input; returns the speed at the end. */
function run(state, seconds, fps, input) {
  const dt = 1 / fps;
  for (let i = 0; i < Math.round(seconds * fps); i += 1) stepLocomotionState(state, dt, input);
  return state.speed;
}

test('starting and stopping take a step of acceleration within the limits, at any frame rate', () => {
  const walk = { moveX: 0, moveZ: -1.4 };
  const state = createLocomotionState();
  let previous = 0, reached = -1;
  for (let i = 0; i < 120; i += 1) {
    stepLocomotionState(state, 1 / 60, walk);
    assert.ok(state.speed >= previous - 1e-9, 'speed never dips when starting straight ahead');
    assert.ok(state.speed - previous <= LOCOMOTION_TUNING.accelerate / 60 + 1e-9, 'acceleration within the limit');
    assert.ok(state.speed <= 1.4 + 1e-9, 'no overshoot');
    if (reached < 0 && state.speed > 1.33) reached = i / 60;
    previous = state.speed;
  }
  assert.ok(reached > 0.25 && reached < 1.2, `walking speed reached in ${reached.toFixed(2)} s`);
  // The same start at 30, 60 and 144 frames per second.
  const at = [30, 60, 144].map((fps) => run(createLocomotionState(), 0.5, fps, walk));
  assert.ok(Math.max(...at) - Math.min(...at) < 0.06, `frame-rate independent: ${at.map((v) => v.toFixed(3))}`);
  // Stopping: decelerates within the brake limit, then stands exactly still.
  previous = state.speed;
  for (let i = 0; i < 90; i += 1) {
    stepLocomotionState(state, 1 / 60, {});
    assert.ok(previous - state.speed <= LOCOMOTION_TUNING.brake / 60 + 1e-9);
    previous = state.speed;
  }
  assert.equal(state.speed, 0);
  assert.ok(state.lean < 0.002, 'no lean left once standing');
});

test('the stride phase advances by distance: one stride per stride length, feet alternate', () => {
  for (const speed of [1.4, 4.5, 7]) {
    const state = createLocomotionState({ legScale: 1.1 });
    run(state, 3, 60, { moveZ: -speed }); // settle at speed
    let strides = 0, distance = 0, last = 0;
    for (let i = 0; i < 600; i += 1) {
      stepLocomotionState(state, 1 / 60, { moveZ: -speed });
      distance += state.speed / 60;
      if (state.strikes & 1) { strides += 1; assert.notEqual(last, 1, 'left follows right'); last = 1; }
      if (state.strikes & 2) { assert.notEqual(last, 2, 'right follows left'); last = 2; }
    }
    const expected = distance / state.gait.strideLength;
    assert.ok(Math.abs(strides - expected) <= 1, `${speed} m/s: ${strides} strides over ${expected.toFixed(2)} stride lengths`);
  }
});

test('standing still gives no foot strikes; a small change of facing is the head, a big one a turn on the spot', () => {
  const state = createLocomotionState();
  for (let i = 0; i < 300; i += 1) {
    stepLocomotionState(state, 1 / 60, { facing: 0.25 });
    assert.equal(state.strikes, 0);
  }
  assert.ok(Math.abs(state.yaw) < 1e-6, 'the body stays put');
  assert.ok(Math.abs(state.headYaw - 0.25) < 0.01, 'the head looks there');
  let turning = 0, strikes = 0;
  for (let i = 0; i < 120; i += 1) {
    stepLocomotionState(state, 1 / 60, { facing: 2.2 });
    if (state.spotTurn) turning += 1;
    if (state.strikes) strikes += 1;
    assert.equal(state.speed, 0, 'no travel while turning on the spot');
    assert.ok(Math.abs(state.yawRate) <= LOCOMOTION_TUNING.spotTurnRate + 1e-6);
    if (i === 10) assert.ok(state.headYaw > 0.3, 'the head leads the turn');
  }
  assert.ok(Math.abs(wrapAngle(state.yaw - 2.2)) < 0.05, `turned to ${state.yaw.toFixed(3)}`);
  assert.ok(turning > 10 && strikes >= 1, 'the turn steps');
});

test('asking to move away from a given facing still goes: the person turns and walks', () => {
  const state = createLocomotionState();
  run(state, 2, 60, { moveX: 0, moveZ: 1.4, facing: 0 }); // straight behind the body and the facing
  assert.ok(Math.abs(wrapAngle(state.yaw - Math.PI)) < 0.05, `turned round (${state.yaw.toFixed(3)})`);
  assert.ok(state.speed > 1.3, `and walks (${state.speed.toFixed(3)} m/s)`);
});

test('lean follows acceleration, bank follows the turn', () => {
  const state = createLocomotionState();
  run(state, 0.25, 60, { moveZ: -4.5 });
  assert.ok(state.lean > 0.05, `leans forward speeding up (${state.lean.toFixed(3)})`);
  run(state, 2, 60, { moveZ: -4.5 });
  run(state, 0.25, 60, {});
  assert.ok(state.lean < -0.03, `leans back braking (${state.lean.toFixed(3)})`);
  const turner = createLocomotionState();
  run(turner, 2, 60, { moveZ: -4.5 });
  // Ask to go 60 degrees to the left: the body turns left (yaw grows) and banks left.
  const left = yawOfDirection(-Math.sin(1.05), -Math.cos(1.05));
  assert.ok(Math.abs(left - 1.05) < 1e-9);
  run(turner, 0.2, 60, { moveX: -4.5 * Math.sin(1.05), moveZ: -4.5 * Math.cos(1.05) });
  assert.ok(turner.yawRate > 0.5 && turner.bank > 0.03, `banks into the turn (${turner.bank.toFixed(3)})`);
  assert.ok(turner.headYaw > 0.05, 'the head leads the turn');
  assert.ok(turner.speed > 2.5, 'keeps most of its speed through a 60 degree turn');
});

test('the controller poses any body deterministically and reports foot strikes in the world', () => {
  const inputs = (i) => (i < 150 ? { moveX: 0, moveZ: -1.6 } : i < 300 ? { moveX: -3, moveZ: -3 } : { facing: -1 });
  const results = [];
  for (const stature of [1.55, 1.78, 1.95, 1.78]) {
    const rig = testRig(stature);
    rig.instance.position.x = 10;
    const walker = createLocomotionController(rig, { seed: 3 });
    const strikes = [];
    walker.on('footstrike', (e) => strikes.push([e.side, e.x, e.z]));
    for (let i = 0; i < 420; i += 1) {
      walker.update(1 / 60, inputs(i));
      // the caller moves the person by the controller's velocity
      rig.instance.position.x += walker.state.vx / 60;
      rig.instance.position.z += walker.state.vz / 60;
      for (let j = 0; j < rig.pose.length; j += 1) assert.ok(Number.isFinite(rig.pose[j]), `pose finite (${stature})`);
    }
    assert.ok(strikes.length > 6, `${strikes.length} foot strikes`);
    for (const [side, x, z] of strikes) {
      assert.ok(side === -1 || side === 1);
      assert.ok(Number.isFinite(x) && Number.isFinite(z));
    }
    assert.equal(rig.instance.rotation.y, walker.state.yaw);
    results.push({ stature, pose: Array.from(rig.pose), strikes: strikes.length });
  }
  assert.deepEqual(results[3].pose, results[1].pose, 'same inputs, same pose');
  assert.equal(results[3].strikes, results[1].strikes);
  // A strike lands near the person's feet (within a stride of the root).
  const rig = testRig();
  const walker = createLocomotionController(rig);
  let worst = 0;
  walker.on('footstrike', (e) => {
    worst = Math.max(worst, Math.hypot(e.x - rig.instance.position.x, e.z - rig.instance.position.z));
  });
  for (let i = 0; i < 240; i += 1) walker.update(1 / 60, { moveZ: -2 });
  assert.ok(worst > 0.05 && worst < 0.9, `strikes land by the body (${worst.toFixed(2)} m)`);
});

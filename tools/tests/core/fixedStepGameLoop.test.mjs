// The game loop: fixed stepping, clamped catch-up, interpolation alpha, pause, time scale and the
// deterministic mode used by automation.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFixedStepGameLoop, FIXED_STEP_SECONDS } from '../../../game/src/core/loop/fixedStepGameLoop.js';

function recordingLoop(options = {}) {
  const calls = { steps: 0, frames: [], renders: 0, order: [] };
  const loop = createFixedStepGameLoop({
    ...options,
    fixedStep: (seconds) => {
      calls.steps += 1;
      calls.order.push('step');
      assert.equal(seconds, options.stepSeconds ?? FIXED_STEP_SECONDS);
    },
    frame: (timing) => {
      calls.frames.push({ ...timing });
      calls.order.push('frame');
    },
    render: () => {
      calls.renders += 1;
      calls.order.push('render');
    },
  });
  return { loop, calls };
}

test('a frame runs the due steps, then the frame work, then the drawing', () => {
  const { loop, calls } = recordingLoop();
  loop.tick(10);
  assert.equal(calls.steps, 0, 'the first tick only reads the clock');
  loop.tick(10 + 2.5 / 60);
  assert.equal(calls.steps, 2);
  assert.deepEqual(calls.order, ['frame', 'render', 'step', 'step', 'frame', 'render']);
  const timing = calls.frames[1];
  assert.equal(timing.steps, 2);
  assert.ok(Math.abs(timing.alpha - 0.5) < 1e-6, `alpha ${timing.alpha}`);
  assert.equal(timing.virtual, false);
});

test('sixty frames of one sixtieth run exactly sixty steps', () => {
  const { loop, calls } = recordingLoop();
  for (let frame = 0; frame <= 60; frame += 1) loop.tick(frame / 60);
  assert.equal(calls.steps, 60);
  assert.ok(Math.abs(loop.simulationTime - 1) < 1e-9);
});

test('a long stall is clamped instead of causing a spiral of steps', () => {
  const { loop, calls } = recordingLoop({ maxCatchUpSteps: 5 });
  loop.tick(0);
  loop.tick(3);
  assert.equal(calls.steps, 5);
  assert.equal(calls.frames[1].realDelta, 0.25);
  loop.tick(3 + 1 / 60);
  assert.equal(calls.steps, 6, 'the dropped time is not made up later');
});

test('pause stops the steps but not the frames', () => {
  const { loop, calls } = recordingLoop();
  loop.tick(0);
  loop.paused = true;
  loop.tick(0.1);
  assert.equal(calls.steps, 0);
  assert.equal(calls.frames[1].delta, 0);
  assert.ok(calls.frames[1].realDelta > 0.09);
  assert.equal(calls.renders, 2);
  loop.paused = false;
  loop.tick(0.2);
  assert.equal(calls.steps, 5, 'the 0.1 s after the pause; the paused time is not simulated');
});

test('the time scale slows the simulation, not the step', () => {
  const { loop, calls } = recordingLoop();
  loop.timeScale = 0.5;
  for (let frame = 0; frame <= 120; frame += 1) loop.tick(frame / 60);
  assert.equal(calls.steps, 60);
  assert.ok(Math.abs(calls.frames[10].delta - 0.5 / 60) < 1e-9);
});

test('rendering can be skipped for a frame', () => {
  const { loop, calls } = recordingLoop();
  loop.tick(0, { render: false });
  loop.tick(0.02);
  assert.equal(calls.renders, 1);
});

test('advance() runs whole steps as virtual frames and draws nothing', () => {
  const { loop, calls } = recordingLoop();
  const steps = loop.advance(2);
  assert.equal(steps, 120);
  assert.equal(calls.steps, 120);
  assert.equal(calls.renders, 0);
  assert.equal(calls.frames.length, 120);
  assert.ok(calls.frames.every((timing) => timing.virtual && timing.steps === 1 && timing.alpha === 1));
  assert.ok(Math.abs(loop.simulationTime - 2) < 1e-9);
});

test('advance() ignores the pause flag and leaves no catch-up debt', () => {
  const { loop, calls } = recordingLoop();
  loop.tick(0);
  loop.paused = true;
  loop.advance(0.5);
  assert.equal(calls.steps, 30);
  loop.paused = false;
  loop.tick(100);
  assert.equal(calls.steps, 30, 'the first tick after advance() only reads the clock');
});

test('the same inputs give the same simulation, whatever the frame pacing', () => {
  const simulate = (frameTimes) => {
    let state = 1;
    const loop = createFixedStepGameLoop({
      fixedStep: () => {
        state = (state * 1103515245 + 12345) % 2147483648;
      },
      frame: () => {},
    });
    let clock = 0;
    loop.tick(clock);
    for (const delta of frameTimes) {
      clock += delta;
      loop.tick(clock);
    }
    return { state, steps: loop.stepCount };
  };
  const smooth = simulate(Array.from({ length: 120 }, () => 1 / 60));
  const jittery = simulate(Array.from({ length: 80 }, (_, i) => (i % 2 === 0 ? 1 / 30 : 1 / 60)));
  assert.equal(smooth.steps, 120);
  assert.equal(jittery.steps, 120);
  assert.equal(smooth.state, jittery.state);

  const direct = createFixedStepGameLoop({ fixedStep: () => {}, frame: () => {} });
  assert.equal(direct.advance(2), 120);
});

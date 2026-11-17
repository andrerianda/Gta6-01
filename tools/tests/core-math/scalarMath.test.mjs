// Tests of the scalar helpers and easing curves (game/src/core/math/scalarMath.js and
// easingCurves.js). Run with: node --test "tools/tests/core-math/*.test.mjs"
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  approach,
  approachAngle,
  clamp,
  clamp01,
  damp,
  dampAngle,
  dampFactor,
  fadeInOut,
  inverseLerp,
  lerp,
  lerpAngle,
  nearlyEqual,
  pingPong,
  remap,
  remapClamped,
  shortestAngleDifference,
  smootherstep,
  smoothstep,
  snapToStep,
  summarise,
  toDegrees,
  toRadians,
  wrap,
  wrapAngle,
} from '../../../game/src/core/math/scalarMath.js';
import { EASING, ease, easingByName, springDamp } from '../../../game/src/core/math/easingCurves.js';

const close = (actual, expected, tolerance = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);

test('clamp, lerp, inverse lerp and remap', () => {
  assert.equal(clamp(5, 0, 3), 3);
  assert.equal(clamp(-5, 0, 3), 0);
  assert.equal(clamp(2, 0, 3), 2);
  assert.equal(clamp01(1.5), 1);
  assert.equal(clamp01(-0.1), 0);
  assert.equal(lerp(10, 20, 0.25), 12.5);
  assert.equal(inverseLerp(10, 20, 12.5), 0.25);
  assert.equal(inverseLerp(3, 3, 9), 0);
  assert.equal(remap(5, 0, 10, 100, 200), 150);
  assert.equal(remap(15, 0, 10, 100, 200), 250);
  assert.equal(remapClamped(15, 0, 10, 100, 200), 200);
  assert.equal(remapClamped(5, 10, 0, 0, 1), 0.5);
});

test('smoothstep and smootherstep are monotonic with flat ends', () => {
  for (const step of [smoothstep, smootherstep]) {
    assert.equal(step(2, 4, 1), 0);
    assert.equal(step(2, 4, 5), 1);
    assert.equal(step(2, 4, 3), 0.5);
    let previous = 0;
    for (let x = 2; x <= 4; x += 0.05) {
      const value = step(2, 4, x);
      assert.ok(value >= previous - 1e-12);
      previous = value;
    }
    assert.ok(step(0, 1, 0.01) < 0.001);
    // Descending edges give a falling step.
    close(step(4, 2, 2.5), step(2, 4, 3.5));
  }
});

test('damping does not depend on the frame rate', () => {
  let coarse = 0;
  for (let i = 0; i < 30; i += 1) coarse = damp(coarse, 100, 3, 1 / 30);
  let fine = 0;
  for (let i = 0; i < 240; i += 1) fine = damp(fine, 100, 3, 1 / 240);
  close(coarse, fine, 1e-9);
  close(coarse, 100 * (1 - Math.exp(-3)), 1e-9);
  close(dampFactor(3, 1), 1 - Math.exp(-3));
  assert.equal(damp(5, 5, 10, 0.1), 5);
  // Angles take the short way across the wrap.
  const turned = dampAngle(3.1, -3.1, 1000, 1);
  close(wrapAngle(turned), -3.1, 1e-9);
  assert.ok(turned > 3.1);
});

test('approach never overshoots', () => {
  assert.equal(approach(0, 10, 3), 3);
  assert.equal(approach(9, 10, 3), 10);
  assert.equal(approach(10, 0, 4), 6);
  assert.equal(approach(1, 0, 4), 0);
  close(approachAngle(3.0, -3.0, 0.1), 3.1);
  close(wrapAngle(approachAngle(3.0, -3.0, 10)), -3.0);
});

test('wrap and angle differences', () => {
  assert.equal(wrap(370, 0, 360), 10);
  assert.equal(wrap(-1, 0, 4), 3);
  assert.equal(wrap(4, 0, 4), 0);
  assert.equal(wrap(7, 5, 5), 5);
  close(wrapAngle(3 * Math.PI), -Math.PI);
  close(shortestAngleDifference(0.1, -0.1), -0.2);
  close(shortestAngleDifference(3.1, -3.1), 2 * Math.PI - 6.2);
  close(shortestAngleDifference(-3.1, 3.1), -(2 * Math.PI - 6.2));
  for (let a = -10; a < 10; a += 0.37) {
    for (let b = -10; b < 10; b += 0.41) {
      const d = shortestAngleDifference(a, b);
      assert.ok(d >= -Math.PI && d < Math.PI);
      close(Math.sin(a + d), Math.sin(b), 1e-9);
      close(Math.cos(a + d), Math.cos(b), 1e-9);
    }
  }
  close(wrapAngle(lerpAngle(3.0, -3.0, 0.5)), -Math.PI, 1e-9);
});

test('small helpers', () => {
  assert.equal(pingPong(0.5, 2), 0.5);
  assert.equal(pingPong(3, 2), 1);
  assert.equal(pingPong(-1, 2), 1);
  assert.equal(snapToStep(7.3, 0.5), 7.5);
  assert.equal(snapToStep(7.3, 0), 7.3);
  assert.ok(nearlyEqual(0.1 + 0.2, 0.3));
  assert.ok(!nearlyEqual(1, 1.1));
  close(toRadians(180), Math.PI);
  close(toDegrees(Math.PI / 2), 90);
  assert.equal(fadeInOut(-1, 10, 2, 2), 0);
  assert.equal(fadeInOut(1, 10, 2, 2), 0.5);
  assert.equal(fadeInOut(5, 10, 2, 2), 1);
  assert.equal(fadeInOut(9.5, 10, 2, 2), 0.25);
  const summary = summarise([1, 2, 3, 4]);
  assert.equal(summary.mean, 2.5);
  assert.equal(summary.min, 1);
  assert.equal(summary.max, 4);
  close(summary.deviation, Math.sqrt(1.25));
  assert.deepEqual(summarise([]), { mean: 0, deviation: 0, min: 0, max: 0 });
});

test('every easing curve starts at 0 and ends at 1', () => {
  for (const [name, curve] of Object.entries(EASING)) {
    close(curve(0), 0, 1e-9);
    close(curve(1), 1, 1e-9);
    for (let t = 0; t <= 1; t += 0.05) assert.ok(Number.isFinite(curve(t)), name);
  }
  assert.ok(EASING.inCubic(0.5) < 0.5 && EASING.outCubic(0.5) > 0.5);
  close(EASING.inOutCubic(0.5), 0.5);
  close(EASING.inOutSine(0.5), 0.5);
  assert.ok(EASING.outBack(0.7) > 1);
  assert.equal(easingByName('nope'), EASING.linear);
  assert.equal(ease('outQuad', 2, 10, 20), 20);
  assert.equal(ease((t) => t * t, 0.5, 0, 8), 2);
});

test('the spring reaches its target smoothly and never overshoots', () => {
  const state = { value: 0, velocity: 0 };
  let peak = 0;
  for (let i = 0; i < 300; i += 1) {
    springDamp(state, 10, 0.4, 1 / 60);
    peak = Math.max(peak, state.value);
  }
  close(state.value, 10, 1e-3);
  assert.ok(peak <= 10 + 1e-9);
  // A speed limit holds the approach back.
  const limited = { value: 0, velocity: 0 };
  springDamp(limited, 1000, 0.5, 0.1, 5);
  assert.ok(limited.value < 1);
});

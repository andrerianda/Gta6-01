// Tests of the real-light budget (game/src/render/lighting/localLightBudget.js).
// Run with: node --test "tools/tests/render/*.test.mjs"
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  INCUMBENT_BONUS,
  LOCAL_LIGHT_BUDGETS,
  MAX_REAL_LIGHT_DISTANCE,
  scoreLocalLight,
  selectTopScores,
} from '../../../game/src/render/lighting/localLightBudget.js';

/** A camera at the origin looking along -Z (north). */
const view = { x: 0, y: 1.7, z: 0, forwardX: 0, forwardY: 0, forwardZ: -1 };
const score = (x, y, z, { range = 24, intensity = 300, importance = 1, incumbent = false } = {}) =>
  scoreLocalLight(x, y, z, range, intensity, importance, incumbent, view);

test('a nearer lamp outranks a farther one of the same kind', () => {
  assert.ok(score(0, 8, -10) > score(0, 8, -40));
  assert.ok(score(0, 8, -40) > score(0, 8, -90));
});

test('lights that are off, unimportant or out of reach never get a real light', () => {
  assert.equal(score(0, 8, -10, { intensity: 0 }), 0);
  assert.equal(score(0, 8, -10, { importance: 0 }), 0);
  assert.equal(score(0, 8, -10, { range: 0 }), 0);
  assert.equal(score(0, 8, -(MAX_REAL_LIGHT_DISTANCE + 60)), 0);
  assert.ok(score(0, 8, -(MAX_REAL_LIGHT_DISTANCE - 20)) > 0);
});

test('the score fades toward the distance limit instead of dropping', () => {
  const justInside = score(0, 8, -(MAX_REAL_LIGHT_DISTANCE + 23));
  const farther = score(0, 8, -(MAX_REAL_LIGHT_DISTANCE + 23.9));
  assert.ok(justInside > 0 && farther >= 0 && farther < justInside);
});

test('a lamp in front outranks an equally distant lamp behind the camera', () => {
  assert.ok(score(0, 8, -50) > score(0, 8, 50) * 2);
  // Inside its own reach a lamp behind the camera still counts fully.
  assert.ok(Math.abs(score(0, 8, 6) - score(0, 8, -6)) < 1e-9);
});

test('importance and brightness raise the score; a searchlight cannot starve the street', () => {
  assert.ok(score(0, 1, -30, { importance: 3 }) > score(0, 1, -30, { importance: 1 }) * 2.9);
  assert.ok(score(0, 8, -20, { intensity: 600 }) > score(0, 8, -20, { intensity: 100 }));
  const huge = score(0, 8, -20, { intensity: 100000 });
  const normal = score(0, 8, -20, { intensity: 300 });
  assert.ok(huge <= normal * 1.0001, 'brightness saturates');
});

test('the incumbent bonus keeps two similar lamps from swapping', () => {
  const a = score(3, 8, -30);
  const b = score(-3, 8, -30.5);
  assert.ok(a > b, 'a is slightly nearer');
  assert.ok(score(-3, 8, -30.5, { incumbent: true }) > a, 'but b keeps its slot once it has one');
  assert.ok(Math.abs(score(3, 8, -30, { incumbent: true }) / a - INCUMBENT_BONUS) < 1e-9);
});

test('selectTopScores keeps the best within the budget, best first', () => {
  const scores = new Float32Array([0.2, 0.9, 0, 0.5, 0.7, -1, 0.1, 0.8]);
  const out = new Int32Array(8);
  assert.equal(selectTopScores(scores, scores.length, 3, out), 3);
  assert.deepEqual(Array.from(out.subarray(0, 3)), [1, 7, 4]);
  // Fewer candidates than the budget: zero and negative scores are never kept.
  assert.equal(selectTopScores(scores, scores.length, 8, out), 6);
  assert.deepEqual(Array.from(out.subarray(0, 6)), [1, 7, 4, 3, 0, 6]);
  // A zero budget keeps nothing; `count` limits the candidates looked at.
  assert.equal(selectTopScores(scores, scores.length, 0, out), 0);
  assert.equal(selectTopScores(scores, 3, 4, out), 2);
  assert.deepEqual(Array.from(out.subarray(0, 2)), [1, 0]);
});

test('selectTopScores never exceeds the budget on random input', () => {
  let seed = 12345;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const scores = new Float32Array(500);
  const out = new Int32Array(16);
  for (let round = 0; round < 50; round += 1) {
    for (let i = 0; i < scores.length; i += 1) scores[i] = random() < 0.3 ? 0 : random();
    const budget = 1 + Math.floor(random() * 16);
    const kept = selectTopScores(scores, scores.length, budget, out);
    assert.ok(kept <= budget);
    const expected = Array.from(scores)
      .map((value, index) => ({ value, index }))
      .filter((entry) => entry.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, budget);
    assert.equal(kept, expected.length);
    for (let k = 0; k < kept; k += 1) assert.equal(scores[out[k]], expected[k].value, `rank ${k}`);
  }
});

test('every quality level has a fixed, growing budget', () => {
  const levels = ['low', 'medium', 'high', 'ultra'];
  for (let i = 0; i < levels.length; i += 1) {
    const budget = LOCAL_LIGHT_BUDGETS[levels[i]];
    assert.ok(Number.isInteger(budget.spots) && budget.spots > 0);
    assert.ok(Number.isInteger(budget.points) && budget.points > 0);
    if (i > 0) assert.ok(budget.spots >= LOCAL_LIGHT_BUDGETS[levels[i - 1]].spots);
  }
});

// Tests of the spline helpers (game/src/core/math/splineCurves.js).
// Run with: node --test "tools/tests/core-math/*.test.mjs"
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  catmullRomDerivative,
  catmullRomPoint,
  createArcLengthTable,
  createCatmullRomPath,
  createCubicBezierPath,
  cubicBezierDerivative,
  cubicBezierPoint,
  normaliseVector,
} from '../../../game/src/core/math/splineCurves.js';

const close = (actual, expected, tolerance = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);

test('a Catmull-Rom segment passes through its two inner points', () => {
  const p = [[0, 0], [1, 2], [3, 3], [6, 1]];
  assert.deepEqual(catmullRomPoint(p[0], p[1], p[2], p[3], 0), [1, 2]);
  assert.deepEqual(catmullRomPoint(p[0], p[1], p[2], p[3], 1), [3, 3]);
  // The derivative matches a finite difference.
  const h = 1e-6;
  const before = catmullRomPoint(p[0], p[1], p[2], p[3], 0.4 - h);
  const after = catmullRomPoint(p[0], p[1], p[2], p[3], 0.4 + h);
  const derivative = catmullRomDerivative(p[0], p[1], p[2], p[3], 0.4);
  close(derivative[0], (after[0] - before[0]) / (2 * h), 1e-5);
  close(derivative[1], (after[1] - before[1]) / (2 * h), 1e-5);
});

test('a Catmull-Rom path through collinear points is a straight line of the right length', () => {
  const path = createCatmullRomPath([[0, 0, 0], [10, 0, 0], [20, 0, 0], [40, 0, 0]]);
  close(path.length, 40, 1e-6);
  assert.equal(path.segmentCount, 3);
  const sample = path.sampleAtDistance(25);
  close(sample.point[0], 25, 0.05);
  close(sample.point[1], 0);
  assert.deepEqual(sample.tangent.map((v) => Math.round(v * 1e6) / 1e6), [1, 0, 0]);
  assert.deepEqual(path.pointAt(0), [0, 0, 0]);
  assert.deepEqual(path.pointAt(1), [40, 0, 0]);
  assert.deepEqual(path.pointAt(2), [40, 0, 0]);
});

test('arc-length sampling of a curved path is evenly spaced', () => {
  const path = createCatmullRomPath([[0, 0], [30, 5], [60, 40], [90, 45], [140, 10]], { samplesPerSegment: 32 });
  const stations = path.toPolyline(5);
  const gaps = [];
  for (let i = 1; i < stations.length; i += 1) {
    gaps.push(Math.hypot(stations[i][0] - stations[i - 1][0], stations[i][1] - stations[i - 1][1]));
  }
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  for (const gap of gaps) assert.ok(Math.abs(gap - mean) < mean * 0.03, `gap ${gap} against ${mean}`);
  assert.deepEqual(stations[0], [0, 0]);
  close(stations[stations.length - 1][0], 140, 1e-9);
  // Tangents are unit vectors that follow the chord direction.
  for (let d = 0; d < path.length; d += 7) {
    const { tangent } = path.sampleAtDistance(d);
    close(Math.hypot(tangent[0], tangent[1]), 1, 1e-9);
    assert.ok(tangent[0] > 0);
  }
});

test('a closed Catmull-Rom path wraps', () => {
  const ring = createCatmullRomPath([[10, 0], [0, 10], [-10, 0], [0, -10]], { closed: true });
  assert.equal(ring.segmentCount, 4);
  // Four points make a rounded square a little shorter than the circle through them.
  assert.ok(ring.length > 2 * Math.PI * 10 * 0.9 && ring.length < 2 * Math.PI * 10);
  const start = ring.sampleAtDistance(0).point;
  const lap = ring.sampleAtDistance(ring.length).point;
  close(start[0], lap[0], 1e-6);
  close(start[1], lap[1], 1e-6);
  const backwards = ring.sampleAtDistance(-ring.length / 4).point;
  close(backwards[0], 0, 0.2);
  close(backwards[1], -10, 0.2);
  for (const point of ring.toPolyline(3)) {
    const radius = Math.hypot(point[0], point[1]);
    assert.ok(radius > 8.8 && radius < 10.01, `radius ${radius}`);
  }
});

test('cubic Bezier points, tangents and length', () => {
  const p = [[0, 0], [0, 10], [10, 10], [10, 0]];
  assert.deepEqual(cubicBezierPoint(p[0], p[1], p[2], p[3], 0), [0, 0]);
  assert.deepEqual(cubicBezierPoint(p[0], p[1], p[2], p[3], 1), [10, 0]);
  assert.deepEqual(cubicBezierPoint(p[0], p[1], p[2], p[3], 0.5), [5, 7.5]);
  assert.deepEqual(cubicBezierDerivative(p[0], p[1], p[2], p[3], 0), [0, 30]);
  assert.deepEqual(cubicBezierDerivative(p[0], p[1], p[2], p[3], 0.5), [15, 0]);
  const path = createCubicBezierPath(p[0], p[1], p[2], p[3], 200);
  close(path.length, 20, 0.01);
  const middle = path.sampleAtDistance(path.length / 2);
  close(middle.point[0], 5, 1e-3);
  close(middle.t, 0.5, 1e-3);
  close(middle.tangent[0], 1, 1e-6);
  assert.equal(path.toPolyline(2).length, 11);
  // A straight Bezier measures as its chord.
  const line = createCubicBezierPath([0, 0, 0], [1, 1, 1], [2, 2, 2], [3, 3, 3]);
  close(line.length, Math.sqrt(27), 1e-9);
});

test('the arc-length table inverts itself', () => {
  const table = createArcLengthTable((u) => [u * u * 10, 0], 256);
  close(table.length, 10, 1e-9);
  for (const distance of [0.5, 2.5, 5, 9.9]) {
    const u = table.parameterAt(distance);
    close(u * u * 10, distance, 1e-3);
    close(table.distanceAt(u), distance, 1e-9);
  }
  assert.equal(table.parameterAt(-1), 0);
  assert.equal(table.parameterAt(11), 1);
  const unit = normaliseVector([3, 4]);
  close(unit[0], 0.6);
  close(unit[1], 0.8);
  assert.deepEqual(normaliseVector([0, 0, 0]), [1, 0, 0]);
});

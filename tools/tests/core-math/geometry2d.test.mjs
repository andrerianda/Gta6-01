// Tests of the 2D geometry modules (game/src/core/math/segmentGeometry2d.js,
// polygonGeometry2d.js, orientedRectangle2d.js, boundingBox2d.js).
// Run with: node --test "tools/tests/core-math/*.test.mjs"
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  closestPointOnSegment,
  cross2d,
  distanceToPolyline,
  distanceToSegment,
  lineIntersection,
  offsetPolyline,
  pointAlongPolyline,
  polylineLength,
  projectOnPolyline,
  resamplePolyline,
  rotatePoint,
  segmentIntersection,
  segmentsIntersect,
  sideOfLine,
} from '../../../game/src/core/math/segmentGeometry2d.js';
import {
  clipPolygonByConvex,
  convexHull,
  convexPolygonsOverlap,
  ensureCounterClockwise,
  isConvexPolygon,
  offsetConvexPolygon,
  pointInPolygon,
  polygonArea,
  polygonCentroid,
  polygonPerimeter,
  polygonSignedArea,
  polygonWinding,
  signedDistanceToPolygon,
} from '../../../game/src/core/math/polygonGeometry2d.js';
import {
  createOrientedRectangle,
  distanceToOrientedRectangle,
  orientedRectangleBounds,
  orientedRectangleContains,
  orientedRectangleCorners,
  orientedRectangleFromSegment,
  orientedRectangleOverlapsCircle,
  orientedRectanglesOverlap,
  setOrientedRectangle,
  toRectangleFrame,
} from '../../../game/src/core/math/orientedRectangle2d.js';
import {
  boundsAreEmpty,
  boundsCentre,
  boundsContainBounds,
  boundsContainPoint,
  boundsOfCircle,
  boundsOfPoints,
  boundsOverlap,
  boundsOverlapCircle,
  boundsSize,
  clipSegmentToBounds,
  createBounds,
  distanceToBounds,
  growBoundsToBounds,
  inflateBounds,
  intersectBounds,
} from '../../../game/src/core/math/boundingBox2d.js';

const close = (actual, expected, tolerance = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);

const SQUARE = [[0, 0], [4, 0], [4, 4], [0, 4]];
const L_SHAPE = [[0, 0], [4, 0], [4, 2], [2, 2], [2, 4], [0, 4]];

test('closest point and distance to a segment', () => {
  const middle = closestPointOnSegment(2, 3, 0, 0, 4, 0);
  assert.deepEqual([middle.x, middle.y, middle.t, middle.distance], [2, 0, 0.5, 3]);
  const beyond = closestPointOnSegment(7, 4, 0, 0, 4, 0);
  assert.deepEqual([beyond.x, beyond.y, beyond.t, beyond.distance], [4, 0, 1, 5]);
  assert.equal(distanceToSegment(-3, 4, 0, 0, 4, 0), 5);
  assert.equal(distanceToSegment(1, 1, 2, 2, 2, 2), Math.SQRT2);
  assert.equal(cross2d(1, 0, 0, 1), 1);
  assert.ok(sideOfLine(0, 1, 0, 0, 1, 0) > 0);
  assert.ok(sideOfLine(0, -1, 0, 0, 1, 0) < 0);
});

test('segment and line intersections', () => {
  const hit = segmentIntersection(0, 0, 4, 4, 0, 4, 4, 0);
  assert.deepEqual([hit.x, hit.y, hit.t, hit.u], [2, 2, 0.5, 0.5]);
  assert.equal(segmentIntersection(0, 0, 1, 1, 0, 4, 4, 0), null);
  assert.equal(segmentIntersection(0, 0, 4, 0, 0, 1, 4, 1), null);
  assert.ok(segmentsIntersect(0, 0, 4, 0, 4, 0, 4, 4));
  assert.deepEqual(lineIntersection(0, 0, 1, 1, 0, 4, 1, 3), { x: 2, y: 2 });
  assert.equal(lineIntersection(0, 0, 1, 0, 0, 1, 1, 1), null);
});

test('polyline length, projection and walking', () => {
  const path = [[0, 0], [10, 0], [10, 10]];
  assert.equal(polylineLength(path), 20);
  assert.equal(polylineLength(path, true), 20 + Math.hypot(10, 10));
  const projection = projectOnPolyline(path, 12, 4);
  assert.deepEqual([projection.x, projection.y, projection.segment, projection.along, projection.distance], [10, 4, 1, 14, 2]);
  assert.equal(projection.side, -1);
  assert.equal(projectOnPolyline(path, 5, 3).side, 1);
  assert.equal(projectOnPolyline([[1, 1]], 4, 5).distance, 5);
  assert.equal(distanceToPolyline(path, 5, -3), 3);
  assert.equal(distanceToPolyline([[1, 1]], 4, 5), 5);

  const at = pointAlongPolyline(path, 14);
  assert.deepEqual([at.x, at.y, at.tangentX, at.tangentY, at.segment], [10, 4, 0, 1, 1]);
  assert.deepEqual(pointAlongPolyline(path, 99).t, 1);
  assert.deepEqual([pointAlongPolyline(path, -5).x, pointAlongPolyline(path, -5).y], [0, 0]);
  const wrapped = pointAlongPolyline(SQUARE, 17, true);
  assert.deepEqual([wrapped.x, wrapped.y], [1, 0]);

  const resampled = resamplePolyline(path, 5);
  assert.deepEqual(resampled, [[0, 0], [5, 0], [10, 0], [10, 5], [10, 10]]);
  assert.equal(resamplePolyline(SQUARE, 4, true).length, 4);
});

test('offsetting a polyline keeps its distance on straight runs and mitres corners', () => {
  const left = offsetPolyline([[0, 0], [10, 0], [10, 10]], 1);
  assert.deepEqual(left[0], [0, 1]);
  close(left[1][0], 9);
  close(left[1][1], 1);
  close(left[2][0], 9);
  close(left[2][1], 10);
  const ring = offsetPolyline(SQUARE, -1, true);
  close(polygonArea(ring), 36);
  const [x, y] = rotatePoint(1, 0, Math.PI / 2);
  close(x, 0);
  close(y, 1);
});

test('polygon area, winding, centroid, perimeter', () => {
  assert.equal(polygonSignedArea(SQUARE), 16);
  assert.equal(polygonSignedArea(SQUARE.slice().reverse()), -16);
  assert.equal(polygonArea(L_SHAPE), 12);
  assert.equal(polygonWinding(SQUARE), 1);
  assert.equal(polygonWinding(SQUARE.slice().reverse()), -1);
  assert.equal(polygonWinding([[0, 0], [1, 1]]), 0);
  assert.equal(polygonSignedArea(ensureCounterClockwise(SQUARE.slice().reverse())), 16);
  assert.deepEqual(polygonCentroid(SQUARE), [2, 2]);
  const [cx, cy] = polygonCentroid(L_SHAPE);
  close(cx, 5 / 3);
  close(cy, 5 / 3);
  assert.deepEqual(polygonCentroid([[0, 0], [2, 0]]), [1, 0]);
  assert.equal(polygonPerimeter(SQUARE), 16);
});

test('containment, convexity and signed distance', () => {
  assert.ok(pointInPolygon(1, 1, L_SHAPE));
  assert.ok(!pointInPolygon(3, 3, L_SHAPE));
  assert.ok(pointInPolygon(3, 1, L_SHAPE.slice().reverse()));
  assert.ok(!pointInPolygon(5, 1, SQUARE));
  assert.ok(isConvexPolygon(SQUARE));
  assert.ok(isConvexPolygon(SQUARE.slice().reverse()));
  assert.ok(!isConvexPolygon(L_SHAPE));
  assert.ok(!isConvexPolygon([[0, 0], [1, 1]]));
  assert.equal(signedDistanceToPolygon(2, 2, SQUARE), -2);
  assert.equal(signedDistanceToPolygon(7, 8, SQUARE), 5);
});

test('offsetting a convex polygon grows and shrinks it by the distance', () => {
  const grown = offsetConvexPolygon(SQUARE, 1);
  assert.equal(polygonArea(grown), 36);
  const shrunk = offsetConvexPolygon(SQUARE.slice().reverse(), -1);
  close(polygonArea(shrunk), 4);
  assert.equal(polygonWinding(shrunk), 1);
  assert.deepEqual(offsetConvexPolygon(SQUARE, -2.5), []);
  // A thin triangle loses an edge when shrunk; the result stays inside the original.
  const triangle = [[0, 0], [10, 0], [5, 3]];
  const inner = offsetConvexPolygon(triangle, -0.5);
  assert.ok(inner.length >= 3);
  for (const [x, y] of inner) {
    assert.ok(signedDistanceToPolygon(x, y, triangle) <= -0.5 + 1e-6);
  }
  // Every edge of the grown polygon is 0.75 m outside the original.
  const outer = offsetConvexPolygon(triangle, 0.75);
  for (let i = 0; i < outer.length; i += 1) {
    const a = outer[i];
    const b = outer[(i + 1) % outer.length];
    close(signedDistanceToPolygon((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, triangle), 0.75, 1e-9);
  }
});

test('clipping, hull and overlap of convex polygons', () => {
  const clipped = clipPolygonByConvex(L_SHAPE, [[1, 1], [5, 1], [5, 5], [1, 5]]);
  close(polygonArea(clipped), 5);
  assert.deepEqual(clipPolygonByConvex(SQUARE, [[10, 10], [11, 10], [11, 11]]), []);
  const hull = convexHull([[0, 0], [2, 2], [4, 0], [4, 4], [0, 4], [2, 1], [2, 0]]);
  assert.equal(hull.length, 4);
  assert.equal(polygonSignedArea(hull), 16);
  assert.ok(convexPolygonsOverlap(SQUARE, [[3, 3], [6, 3], [6, 6], [3, 6]]));
  assert.ok(!convexPolygonsOverlap(SQUARE, [[5, 0], [6, 0], [6, 1]]));
  // Diagonal neighbours whose bounding boxes overlap but which do not touch.
  assert.ok(!convexPolygonsOverlap([[0, 0], [3, 0], [0, 3]], [[3, 3], [3, 1.6], [1.6, 3]]));
});

test('oriented rectangles', () => {
  const rectangle = createOrientedRectangle(0, 0, 2, 1, Math.PI / 2);
  const corners = orientedRectangleCorners(rectangle);
  close(corners[0][0], -1);
  close(corners[0][1], 2);
  close(polygonSignedArea(corners), 8);
  assert.ok(orientedRectangleContains(rectangle, 0.9, 1.9));
  assert.ok(!orientedRectangleContains(rectangle, 1.9, 0.9));
  assert.ok(orientedRectangleContains(rectangle, 1.4, 0, 0.5));
  const [along, across] = toRectangleFrame(rectangle, 0, 1.5);
  close(along, 1.5);
  close(across, 0);
  close(distanceToOrientedRectangle(rectangle, 4, 0), 3);
  close(distanceToOrientedRectangle(rectangle, 0, 0), 0);
  close(distanceToOrientedRectangle(rectangle, 4, 6), 5);
  assert.ok(orientedRectangleOverlapsCircle(rectangle, 2, 0, 1.01));
  assert.ok(!orientedRectangleOverlapsCircle(rectangle, 2, 0, 0.99));
  const bounds = orientedRectangleBounds(rectangle);
  close(bounds.minX, -1);
  close(bounds.maxY, 2);

  const road = orientedRectangleFromSegment(0, 0, 10, 0, 6);
  assert.deepEqual([road.x, road.y, road.halfLength, road.halfWidth, road.angle], [5, 0, 5, 3, 0]);

  const a = createOrientedRectangle(0, 0, 2, 1, 0);
  const b = createOrientedRectangle(3.5, 0, 2, 1, 0);
  assert.ok(orientedRectanglesOverlap(a, b));
  setOrientedRectangle(b, 4.1, 0, 0);
  assert.ok(!orientedRectanglesOverlap(a, b));
  // Turned 45 degrees its corner reaches further and touches again.
  setOrientedRectangle(b, 4.1, 0, Math.PI / 4);
  assert.ok(orientedRectanglesOverlap(a, b));
  // Agreement with the general convex test on a sweep of poses.
  for (let i = 0; i < 400; i += 1) {
    const p = createOrientedRectangle(0, 0, 2.2, 0.9, i * 0.13);
    const q = createOrientedRectangle(Math.cos(i * 0.7) * 3.4, Math.sin(i * 0.31) * 3.4, 2.4, 1, i * 0.29);
    assert.equal(orientedRectanglesOverlap(p, q), convexPolygonsOverlap(orientedRectangleCorners(p), orientedRectangleCorners(q)), `pose ${i}`);
  }
});

test('bounding boxes', () => {
  const empty = createBounds();
  assert.ok(boundsAreEmpty(empty));
  const bounds = boundsOfPoints(L_SHAPE);
  assert.deepEqual(bounds, { minX: 0, minY: 0, maxX: 4, maxY: 4 });
  assert.ok(!boundsAreEmpty(bounds));
  assert.ok(boundsContainPoint(bounds, 4, 4));
  assert.ok(!boundsContainPoint(bounds, 4.1, 4));
  assert.deepEqual(boundsCentre(bounds), [2, 2]);
  assert.deepEqual(boundsSize(bounds), [4, 4]);
  assert.deepEqual(inflateBounds(bounds, 1), { minX: -1, minY: -1, maxX: 5, maxY: 5 });
  assert.ok(boundsOverlap(bounds, boundsOfCircle(5, 5, 1)));
  assert.ok(!boundsOverlap(bounds, boundsOfCircle(6, 6, 1)));
  assert.ok(boundsContainBounds(bounds, { minX: 1, minY: 1, maxX: 2, maxY: 2 }));
  assert.deepEqual(intersectBounds(bounds, { minX: 3, minY: -2, maxX: 9, maxY: 1 }), { minX: 3, minY: 0, maxX: 4, maxY: 1 });
  assert.equal(intersectBounds(bounds, { minX: 5, minY: 5, maxX: 6, maxY: 6 }), null);
  assert.deepEqual(growBoundsToBounds(createBounds(), bounds), bounds);
  assert.equal(distanceToBounds(bounds, 7, 8), 5);
  assert.equal(distanceToBounds(bounds, 2, 2), 0);
  assert.ok(boundsOverlapCircle(bounds, 5, 2, 1));
  assert.ok(!boundsOverlapCircle(bounds, 5.1, 2, 1));
  assert.deepEqual(clipSegmentToBounds(bounds, -2, 2, 6, 2), { ax: 0, ay: 2, bx: 4, by: 2 });
  assert.equal(clipSegmentToBounds(bounds, -2, 5, 6, 5), null);
  assert.deepEqual(clipSegmentToBounds(bounds, 1, 1, 2, 2), { ax: 1, ay: 1, bx: 2, by: 2 });
});

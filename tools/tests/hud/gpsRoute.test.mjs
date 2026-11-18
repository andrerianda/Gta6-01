// The GPS router of the radar: shortest ways along a small road graph, snapping both ends to the
// nearest road, and the route buffer's contents.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRoadRouter, createRoute } from '../../../game/src/ui/gpsRoute.js';

// A 2 x 2 block grid: nodes on a 100 m lattice (ids 10..18, not indices), segments with points
// every 25 m. The middle node 14 joins all four sides.
function gridRoads() {
  const nodes = [];
  for (let j = 0; j < 3; j += 1) for (let i = 0; i < 3; i += 1) nodes.push({ id: 10 + j * 3 + i, x: i * 100, z: j * 100 });
  const segments = [];
  const join = (a, b) => {
    const na = nodes[a - 10], nb = nodes[b - 10];
    const points = [];
    for (let k = 0; k <= 4; k += 1) points.push(na.x + ((nb.x - na.x) * k) / 4, na.z + ((nb.z - na.z) * k) / 4);
    segments.push({ id: segments.length, a, b, points, length: 100 });
  };
  for (let j = 0; j < 3; j += 1) for (let i = 0; i < 2; i += 1) join(10 + j * 3 + i, 11 + j * 3 + i);
  for (let j = 0; j < 2; j += 1) for (let i = 0; i < 3; i += 1) join(10 + j * 3 + i, 13 + j * 3 + i);
  return { nodes, segments };
}

const pointsOf = (route) => Array.from({ length: route.count }, (_, k) => [route.points[k * 2], route.points[k * 2 + 1]]);

test('a route runs from the start along the roads to the target', () => {
  const router = createRoadRouter(gridRoads());
  const route = createRoute();
  assert.equal(router.route(5, 50, 195, 150, route), true);
  const points = pointsOf(route);
  assert.deepEqual(points[0], [5, 50]);
  assert.deepEqual(points[points.length - 1], [195, 150]);
  // From x 0 (snapped), up or across to the target's road at x 200: about 50 + 200 + 50 m of road.
  assert.ok(route.length > 290 && route.length < 320, `length ${route.length}`);
  // Every point but the two ends lies on a road line of the lattice.
  for (const [x, z] of points.slice(1, -1)) assert.ok(x % 100 === 0 || z % 100 === 0, `off road ${x},${z}`);
});

test('a target on the same road goes straight along it', () => {
  const router = createRoadRouter(gridRoads());
  const route = createRoute();
  router.route(10, 2, 90, -3, route);
  const points = pointsOf(route);
  assert.deepEqual(points[0], [10, 2]);
  assert.deepEqual(points[1], [10, 0]);
  assert.deepEqual(points[points.length - 2], [90, 0]);
  assert.ok(points.every(([, z]) => Math.abs(z) <= 3));
});

test('the shortest way is taken, not the first found', () => {
  const router = createRoadRouter(gridRoads());
  const route = createRoute();
  router.route(0, 0, 200, 200, route);
  assert.ok(Math.abs(route.length - 400) < 1e-6, `length ${route.length}`);
});

test('a full buffer stops without overrunning', () => {
  const router = createRoadRouter(gridRoads());
  const route = createRoute(4);
  router.route(0, 0, 200, 200, route);
  assert.equal(route.count, 4);
});

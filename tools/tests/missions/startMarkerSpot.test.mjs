// The start marker's drawn spot keeps the shell off parked cars and the people round the start.
import test from 'node:test';
import assert from 'node:assert/strict';
import { overlap, startMarkerSpot } from '../../../game/src/missions/startMarkerSpot.js';

// A start 4 m out from a door at the origin, the street to +z; the kerb lane at z = 6.5.
const point = { x: 0, z: 4, frontX: 0, frontZ: 1, doorX: 0, doorZ: 0 };
const radius = 2.2;

test('a clear start keeps its marker where it is', () => {
  assert.deepEqual(startMarkerSpot(point, [], [], radius), { x: 0, z: 4 });
});

test('a car parked over the start pushes the shell along the frontage or toward the door, clear of it', () => {
  // Parked along the kerb (heading +x is pi/2), its side 0.6 m from the start point.
  const cars = [{ x: 0, z: 5.6, heading: Math.PI / 2, halfLength: 2.3, halfWidth: 0.9 }];
  assert.ok(overlap(point.x, point.z, cars, [], radius) > 0);
  const spot = startMarkerSpot(point, cars, [], radius);
  assert.equal(overlap(spot.x, spot.z, cars, [], radius), 0);
  // Never nearer the door than its gap.
  assert.ok(spot.z >= 1.2 - 1e-9);
  assert.ok(Math.hypot(spot.x - point.x, spot.z - point.z) <= 4);
});

test('the giver standing at the start moves the shell off them', () => {
  const people = [{ x: 0.5, z: 4.2 }];
  const spot = startMarkerSpot(point, [], people, radius);
  assert.ok(Math.hypot(spot.x - 0.5, spot.z - 4.2) > radius);
});

test('with no clear spot the least crowded one is chosen, near the start', () => {
  const cars = [-6, -3, 0, 3, 6].map((x) => ({ x, z: 4, heading: Math.PI / 2, halfLength: 2.3, halfWidth: 0.9 }));
  const spot = startMarkerSpot(point, cars, [], radius);
  assert.ok(Number.isFinite(spot.x) && Number.isFinite(spot.z));
  assert.ok(overlap(spot.x, spot.z, cars, [], radius) <= overlap(point.x, point.z, cars, [], radius));
});

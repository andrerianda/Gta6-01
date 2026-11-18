// The near lanes are busy: new traffic cars favour the lanes within 90 m of the player, appear
// as close as 40 m when the camera cannot see the place, never in view during play, and at a cut
// the street in front of the camera fills first.

import assert from 'node:assert/strict';
import test from 'node:test';

import { createSeededRandom } from '../../../game/src/core/random/seededRandom.js';
import { SPAWN_RING, createLaneSpawnIndex, findTrafficSpawn, outOfSight, viewStreetWeight } from '../../../game/src/traffic/trafficSpawning.js';
import { testPlan } from './trafficTestWorld.mjs';

const plan = testPlan();
const index = createLaneSpawnIndex(plan.lanes, plan.roads.segments);
const busiest = plan.lanes.filter((lane) => lane.roadClass === 'avenue' && lane.length > 120)[0];
const centre = { x: busiest.points[0], z: busiest.points[1] };
const eye = { x: centre.x, z: centre.z + 3, forwardX: 0, forwardZ: -1, cosHalfView: Math.cos(1.05) };

function sample(filling, count = 600) {
  const random = createSeededRandom(`near-${filling}`);
  const places = [];
  for (let i = 0; i < count; i += 1) {
    const place = findTrafficSpawn(index, centre, () => random.next(), eye, () => true, 6, filling);
    if (place) places.push(place);
  }
  return places;
}

test('in play, cars appear out of sight, from 40 m, and favour the near lanes', () => {
  const places = sample(false);
  assert.ok(places.length > 500);
  let near = 0;
  for (const place of places) {
    const distance = Math.hypot(place.x - centre.x, place.z - centre.z);
    assert.ok(distance >= SPAWN_RING.near - 1e-6, `spawned ${distance.toFixed(1)} m away`);
    assert.ok(outOfSight(place.x, place.z, eye), 'spawned in view');
    if (distance < SPAWN_RING.band) near += 1;
  }
  // By area alone (40..90 m of a 40..180 m ring) about a quarter would be near.
  assert.ok(near / places.length > 0.4, `only ${(100 * near / places.length).toFixed(0)} % near`);
});

test('the lanes that drive into the picture are weighted, the others not', () => {
  const view = { x: 0, z: 0, forwardX: 0, forwardZ: -1 };
  const w = (x, z, dz, filling = false) => viewStreetWeight({ x, z, dx: 0, dz }, view, filling);
  assert.equal(w(4, -120, 1), SPAWN_RING.streetWeight, 'ahead, coming towards the camera');
  assert.equal(w(-6, 60, -1), SPAWN_RING.streetWeight, 'behind, going the camera\'s way');
  assert.equal(w(4, -120, -1), 1, 'ahead and going away: only at a cut');
  assert.equal(w(4, -120, -1, true), SPAWN_RING.streetWeight);
  assert.equal(w(-6, 60, 1, true), 1, 'behind and going away never feeds the picture');
  assert.equal(w(60, -80, 1, true), 1, 'a parallel street off the view axis');
  assert.equal(viewStreetWeight({ x: 0, z: -50, dx: 1, dz: 0 }, view, false), 1, 'a cross street');
});

test('at a cut the street in front of the camera fills first', () => {
  const places = sample(true);
  let inFrontNear = 0;
  for (const place of places) {
    const distance = Math.hypot(place.x - centre.x, place.z - centre.z);
    if (distance < SPAWN_RING.band && !outOfSight(place.x, place.z, eye)) inFrontNear += 1;
  }
  assert.ok(inFrontNear / places.length > 0.12, `only ${(100 * inFrontNear / places.length).toFixed(0)} % in view near`);
});

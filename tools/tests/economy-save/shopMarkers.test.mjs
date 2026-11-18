// The shop and property markers: shown only in free play, kept off parked cars and people, small.
import test from 'node:test';
import assert from 'node:assert/strict';
import { shopMarkersShown, shopMarkerSpot, standsIn, SHOP_MARKER_SHAPE } from '../../../game/src/economy/shopMarkerRules.js';
import { overlap } from '../../../game/src/missions/startMarkerSpot.js';
import { GAME_STATE_NAMES } from '../../../game/src/core/state/gameStates.js';

test('markers show only in free play and in still scenes that ask for them', () => {
  for (const state of GAME_STATE_NAMES) {
    assert.equal(shopMarkersShown({ state }), state === 'playing', state);
  }
  assert.equal(shopMarkersShown({ state: 'cutscene' }), false);
  assert.equal(shopMarkersShown({ state: 'mapOpen' }), false);
  assert.equal(shopMarkersShown({ state: 'paused' }), false);
  assert.equal(shopMarkersShown({ state: 'playing', shot: 'chase-cover' }), false);
  assert.equal(shopMarkersShown({ state: 'playing', shot: 'economy-gun-shop', shotAsks: true }), true);
  assert.equal(shopMarkersShown({ state: 'cutscene', shot: 'economy-gun-shop', shotAsks: true }), false);
});

test('the marker is modest: well inside the walk-in reach, low glow', () => {
  assert.ok(SHOP_MARKER_SHAPE.radius <= 1, 'radius');
  assert.ok(SHOP_MARKER_SHAPE.height <= 1.5, 'height');
  assert.ok(SHOP_MARKER_SHAPE.glow + SHOP_MARKER_SHAPE.pulse <= 0.3, 'glow');
  assert.ok(SHOP_MARKER_SHAPE.ringInner < SHOP_MARKER_SHAPE.radius);
});

test('a clear place keeps its marker where it is', () => {
  const place = { x: 10, z: 20, frontX: 0, frontZ: 1, doorX: 10, doorZ: 16.5 };
  assert.deepEqual(shopMarkerSpot(place, [], []), { x: 10, z: 20 });
});

test('a marker slides off a car parked on its spot and off people standing there', () => {
  const place = { x: 0, z: 0, frontX: 0, frontZ: 1, doorX: 0, doorZ: -3.5 };
  // A car parked along the kerb (heading along x) right over the place, and a person beside it.
  const cars = [{ x: 0, z: 0.5, heading: Math.PI / 2, halfLength: 2.3, halfWidth: 0.95 }];
  const people = [{ x: -1.4, z: -0.6, radius: 0.35 }];
  const r = SHOP_MARKER_SHAPE.radius;
  assert.ok(overlap(0, 0, cars, people, r) > 0, 'the place itself is covered');
  const spot = shopMarkerSpot(place, cars, people);
  assert.equal(overlap(spot.x, spot.z, cars, people, r), 0, `spot ${JSON.stringify(spot)} is clear`);
  assert.ok(Math.hypot(spot.x, spot.z) <= 4, 'stays near its place');
});

test('the lead walks in at the place or at its drawn marker', () => {
  const place = { x: 0, z: 0, spotX: 3, spotZ: 0 };
  assert.equal(standsIn(place, { x: 0.5, z: 0 }, 2.2), true);
  assert.equal(standsIn(place, { x: 3.4, z: 0.2 }, 2.2), true);
  assert.equal(standsIn(place, { x: -3, z: 0 }, 2.2), false);
  assert.equal(standsIn({ x: 0, z: 0 }, { x: 5, z: 0 }, 2.2), false);
});

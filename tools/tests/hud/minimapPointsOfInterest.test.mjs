// Points of interest on the maps: service landmarks of the plan and catalog shops at their landmarks.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { placePointsOfInterest } from '../../../game/src/ui/minimapPointsOfInterest.js';
import { MAP_ICON_STYLES } from '../../../game/src/ui/mapIconPainter.js';

const plan = {
  landmarks: [
    { id: 'h1', kind: 'hospital', x: 10, z: 20, name: 'Hospital One' },
    { id: 'p1', kind: 'police_station', x: -5, z: 3 },
    { id: 's1', kind: 'safehouse_apartment', x: 1, z: 2 },
    { id: 'g1', kind: 'gun_shop', x: 40, z: 41 },
    { id: 'x1', kind: 'stadium', x: 0, z: 0 },
  ],
};
plan.landmarkById = Object.fromEntries(plan.landmarks.map((l) => [l.id, l]));

test('service landmarks become hospital, police and safehouse icons', () => {
  const kinds = placePointsOfInterest(plan, {}).map((p) => p.kind).sort();
  assert.deepEqual(kinds, ['hospital', 'police', 'safehouse']);
});

test('shops are placed at their landmark with their letter and colour; unknown ones are skipped', () => {
  const places = placePointsOfInterest(plan, {
    a: { kind: 'gun_shop', landmark: 'g1', name: 'Ammo' }, b: { kind: 'gun_shop', landmark: 'missing' }, c: { kind: 'nope', landmark: 'g1' },
  });
  const shops = places.filter((p) => p.kind === 'shop');
  assert.equal(shops.length, 1);
  assert.equal(shops[0].letter, 'G');
  assert.equal(shops[0].x, 40);
  assert.match(shops[0].fill, /^#[0-9a-f]{6}$/i);
});

test('every placed kind has an icon style, and a missing plan places nothing', () => {
  for (const place of placePointsOfInterest(plan, { a: { kind: 'diner', landmark: 'x1' } })) assert.ok(MAP_ICON_STYLES[place.kind], place.kind);
  assert.deepEqual(placePointsOfInterest(null, null), []);
});

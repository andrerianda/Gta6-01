// The district a place belongs to agrees with the road plan: a street (carriageway and both
// pavements) reads its own district even where a district polygon's edge runs through it (Calle
// Iguana, Barrio Hierro), a lot reads its lot's, and open ground the polygon's. The HUD's location
// card (ui/hudFormatting.js placeLineFor) then names Barrio Hierro all along Calle Iguana.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSeededRandom } from '../../../game/src/core/random/seededRandom.js';
import { generateCityPlan } from '../../../game/src/world/plan/cityPlanGenerator.js';
import { createCityQueries } from '../../../game/src/world/cityQueries.js';
import { createStreetDistrictLookup, streetReachOf } from '../../../game/src/world/streetDistricts.js';
import { candidateStreets, segmentFrame } from '../../../game/src/combat/barrioFirefightScene.js';
import { placeLineFor } from '../../../game/src/ui/hudFormatting.js';

test('a street straddling a district edge reads its own district to the building line', () => {
  // Polygon edge at z = 0: north (z < 0) 'alto', south 'bajo'. The street runs along z = -2.
  const segment = { points: [-100, -2, 0, -2, 100, -2], halfWidth: 4, sidewalkLeft: 3, sidewalkRight: 3, district: 'alto' };
  const lot = { district: 'alto' };
  const plan = {
    districtAt: (x, z) => (z < 0 ? 'alto' : 'bajo'),
    sectors: { minX: -256, minZ: -256, size: 128, columns: 4, rows: 4 },
    roads: { segments: [segment] },
    lotAt: (x, z) => (x > 40 && x < 60 && z > 7 && z < 30 ? lot : null),
    nearestRoad: (x, z, maxDistance = 96) => {
      const distance = Math.abs(z + 2);
      return distance <= maxDistance && Math.abs(x) <= 100 ? { segment, distance, x, z: -2 } : null;
    },
  };
  const districtAt = createStreetDistrictLookup(plan);
  assert.equal(streetReachOf(segment), 4 + 3 + 1.5);
  for (const x of [-80, -10, 0, 33, 90]) {
    for (const z of [-9, -2, 0.5, 3, 5.4]) assert.equal(districtAt(x, z), 'alto', `street at ${x}, ${z}`);
  }
  assert.equal(districtAt(0, 8), 'bajo', 'beyond the building line');
  assert.equal(districtAt(0, 40), 'bajo', 'open ground');
  assert.equal(districtAt(50, 20), 'alto', 'a lot reads its own district');
  assert.equal(districtAt(0, -60), 'alto');
  // A plan with no road queries falls back to the polygons.
  const bare = createStreetDistrictLookup({ ...plan, nearestRoad: undefined, lotAt: undefined });
  assert.equal(bare(0, 3), 'bajo');
});

test('Calle Iguana reads Barrio Hierro on its carriageway and both pavements, in the HUD too', () => {
  const plan = generateCityPlan(createSeededRandom(1).fork('cityPlan'));
  const queries = createCityQueries(plan);
  const street = candidateStreets(plan, 'barrio_hierro')[0];
  assert.ok(street, 'the firefight street exists');
  const frame = segmentFrame(street);
  let polygonDisagrees = 0;
  // The whole block between its junctions (Calle Manglar, La Marisma, crosses about 50 m on).
  for (let ahead = -40; ahead <= 40; ahead += 5) {
    for (const side of [frame.left, frame.left / 2, 0, frame.right / 2, frame.right]) {
      const x = frame.x + frame.fx * ahead - frame.fz * side;
      const z = frame.z + frame.fz * ahead + frame.fx * side;
      assert.equal(plan.nearestRoad(x, z).segment, street);
      if (plan.districtAt(x, z) !== street.district) polygonDisagrees += 1;
      assert.equal(queries.districtAt(x, z), street.district, `${street.name} ${ahead} m along, ${side.toFixed(1)} m across`);
      const card = placeLineFor(plan.nearestRoad(x, z), queries.districtAt, x, z);
      assert.equal(card.districtId, street.district, `location card at ${ahead}, ${side.toFixed(1)}`);
      assert.equal(card.street, street.name);
    }
  }
  assert.ok(polygonDisagrees > 0, 'the polygon alone puts part of the street in another district');
});

test('city-wide, the pavements of every street read its district away from junctions', () => {
  const plan = generateCityPlan(createSeededRandom(1).fork('cityPlan'));
  const queries = createCityQueries(plan);
  let checked = 0;
  let wrong = 0;
  for (const segment of plan.roads.segments) {
    const p = segment.points;
    if (!segment.district || p.length < 6 || !(segment.length > 60)) continue;
    const middle = (p.length >> 2) * 2;
    const x = p[middle];
    const z = p[middle + 1];
    const tx = p[middle + 2] - p[middle - 2];
    const tz = p[middle + 3] - p[middle - 1];
    const length = Math.hypot(tx, tz) || 1;
    const half = segment.halfWidth ?? (segment.width ?? 0) / 2;
    for (const side of [-1, 1]) {
      const reach = half + (side < 0 ? segment.sidewalkLeft ?? 0 : segment.sidewalkRight ?? 0) * 0.5;
      const px = x - (tz / length) * reach * side;
      const pz = z + (tx / length) * reach * side;
      // Only where this street is the nearest one (not on a crossing or a parallel slip road).
      if (plan.nearestRoad(px, pz)?.segment !== segment || plan.lotAt(px, pz)) continue;
      checked += 1;
      if (queries.districtAt(px, pz) !== segment.district) wrong += 1;
    }
  }
  assert.ok(checked > 300, `checked ${checked} pavement points`);
  assert.equal(wrong, 0);
});

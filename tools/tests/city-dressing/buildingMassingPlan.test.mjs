// Tests of the city dressing's pure logic: bay fitting, building plans on real lots, and the
// lamp and planting layouts along real roads.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createSeededRandom } from '../../../game/src/core/random/seededRandom.js';
import { CITY_DISTRICTS } from '../../../game/src/catalog/cityDistricts.js';
import { fitBays, kitRulesForLot, planBuilding } from '../../../game/src/world/buildings/buildingMassingPlan.js';
import { generateCityPlan } from '../../../game/src/world/plan/cityPlanGenerator.js';
import { layOutStreetLamps } from '../../../game/src/world/props/streetFurnitureLayout.js';
import { layOutRoadsidePlanting } from '../../../game/src/world/vegetation/roadsidePlantingLayout.js';

const plan = generateCityPlan(createSeededRandom('marazul'));

test('fitBays fills a facade within the 12 percent stretch', () => {
  for (const length of [3.6, 4, 7.3, 11, 17.5, 23.9, 40, 101.2]) {
    const { nominal, scale } = fitBays(length);
    const sum = nominal.reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum * scale - length) < 1e-9, `length ${length}`);
    assert.ok(scale >= 0.88 && scale <= 1.12, `scale ${scale} for ${length}`);
  }
  assert.deepEqual(fitBays(1).nominal, []);
});

test('every building lot gets a closed plan with bays on four edges', () => {
  let planned = 0;
  for (const lot of plan.lots.slice(0, 600)) {
    const building = planBuilding(lot, createSeededRandom(`lot${lot.id}`), CITY_DISTRICTS[lot.district]?.moodColors);
    if (!kitRulesForLot(lot)) { assert.equal(building, null); continue; }
    if (!building) continue;
    planned += 1;
    // A kit with a storey cap (the residential kit: at most 4) may stay under the lot's minimum.
    const cap = kitRulesForLot(lot).maxStoreys ?? Infinity;
    assert.ok(building.storeys >= Math.min(lot.floorsMin ?? 1, cap) && building.storeys <= Math.min(cap, Math.max(lot.floorsMin ?? 1, lot.floorsMax ?? 1)));
    assert.equal(building.edges.length, 4);
    assert.ok(building.edges.some((edge) => edge.front), `lot ${lot.id} has a street front`);
    for (const edge of building.edges) {
      const along = edge.bays.reduce((sum, bay) => sum + bay.width, 0) + 1;
      assert.ok(Math.abs(along - edge.length) < 1e-6, 'bays and corner posts fill the edge');
      // The module +X (t) runs along the edge, and n points away from the building centre.
      assert.ok(Math.abs(edge.tx * edge.nx + edge.tz * edge.nz) < 1e-9);
    }
  }
  assert.ok(planned > 300, `planned ${planned}`);
});

test('the same seed plans the same building', () => {
  const lot = plan.lots.find((each) => each.style === 'glass_tower');
  const a = planBuilding(lot, createSeededRandom('x'), CITY_DISTRICTS.centro.moodColors);
  const b = planBuilding(lot, createSeededRandom('x'), CITY_DISTRICTS.centro.moodColors);
  assert.deepEqual(a, b);
  assert.equal(a.kit, 'kit_glass_tower');
});

test('lamps line the avenues and palms the palm medians', () => {
  const avenue = plan.roads.segments.find((segment) => segment.streetscape === 'palm_median');
  assert.ok(avenue, 'a palm median avenue exists');
  const lamps = layOutStreetLamps(avenue);
  const palms = layOutRoadsidePlanting(avenue);
  assert.ok(lamps.length >= Math.floor((avenue.length - 60) / 30), `lamps ${lamps.length} on ${avenue.length} m`);
  assert.ok(palms.length > lamps.length, 'more palms than lamps');
  for (const lamp of lamps) assert.ok(Number.isFinite(lamp.x) && Number.isFinite(lamp.rotationY));
});

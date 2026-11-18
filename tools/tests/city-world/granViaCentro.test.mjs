// Gran Via Marazul reads Centro along its whole tower stretch (orchestrator's decision, 18 Nov
// 10:55): from Calle Iguana's end of Centro east past the Las Lomas apartment blocks to Calle
// Lomas 2, on the carriageway, both pavements and the lots that line it, through the city's own
// districtAt (the HUD's location card and DISTRICT_ENTERED). The hills to the north and the clinic
// stretch at the east end stay Las Lomas, and the move renames only: the lots, their zoning and
// the landmarks are the ones the Las Lomas rules gave before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSeededRandom } from '../../../game/src/core/random/seededRandom.js';
import { generateCityPlan } from '../../../game/src/world/plan/cityPlanGenerator.js';
import { cityToWorld, worldToCity } from '../../../game/src/world/plan/cityFrame.js';
import { createCityQueries } from '../../../game/src/world/cityQueries.js';
import { placeLineFor } from '../../../game/src/ui/hudFormatting.js';

const plan = generateCityPlan(createSeededRandom(1).fork('cityPlan'));
const city = createCityQueries(plan);

test('the tower stretch of Gran Via reads Centro on the street, both pavements and its lots', () => {
  const street = plan.stagingStreets.find((s) => s.key === 'gran_via_marazul');
  const { eastEnd: east, westEnd: west } = street;
  const length = Math.hypot(west.x - east.x, west.z - east.z);
  const dx = (west.x - east.x) / length;
  const dz = (west.z - east.z) / length;
  let checked = 0;
  // t = 0.21 (e ~ 1170) to 0.80 (e ~ -220, Centro's west edge at La Marisma).
  for (let t = 0.21; t <= 0.8; t += 0.01) {
    for (const side of [-14, -9, -4, 0, 4, 9, 14]) {
      const x = east.x + (west.x - east.x) * t - dz * side;
      const z = east.z + (west.z - east.z) * t + dx * side;
      assert.equal(city.districtAt(x, z), 'centro', `t ${t.toFixed(2)} side ${side}`);
      checked += 1;
    }
    const x = east.x + (west.x - east.x) * t;
    const z = east.z + (west.z - east.z) * t;
    const card = placeLineFor(city.nearestRoad(x, z, 40), city.districtAt, x, z);
    assert.equal(card.districtId, 'centro', `card at t ${t.toFixed(2)}`);
  }
  assert.ok(checked > 350);
  for (const lot of plan.lots) {
    const [e, n] = worldToCity(lot.x, lot.z);
    if (e > 765 && e < 1170 && n > -240 && n < -120) assert.equal(lot.district, 'centro', `lot ${lot.id} at ${e | 0}, ${n | 0}`);
  }
});

test('the hills and the clinic stretch stay Las Lomas, and the lots keep their Las Lomas rules', () => {
  for (const [e, n] of [[1000, 150], [1300, 0], [900, 600], [1400, -350], [1600, -180]]) {
    assert.equal(plan.districtAt(...cityToWorld(e, n)), 'las_lomas', `${e}, ${n}`);
  }
  assert.equal(plan.landmarks.find((l) => l.id === 'clinica_las_lomas').district, 'las_lomas');
  let renamed = 0;
  for (const lot of plan.lots) {
    const [e, n] = worldToCity(lot.x, lot.z);
    if (lot.district !== 'centro' || e < 780 || n < -260 || n > -100 || lot.landmarkId) continue;
    renamed += 1;
    assert.ok(['apartment_block', 'townhouse'].includes(lot.style), `lot ${lot.id} at ${e | 0}, ${n | 0} is ${lot.style}`);
    assert.ok(lot.floorsMax <= 10, `lot ${lot.id} floors ${lot.floorsMax}`);
  }
  assert.ok(renamed >= 20, `renamed lots ${renamed}`);
});

// The rail yard steps back behind a row of industrial lots on its side street (QA bug 5: the first
// mission giver's street, Calle Gaviota in Barrio Hierro, looked across 100 m of bare concrete),
// keeps a lorry park in its front rows, and the ground cover agrees with the moved lots.

import assert from 'node:assert/strict';
import test from 'node:test';

import { createSeededRandom, deriveSeed } from '../../../game/src/core/random/seededRandom.js';
import { generateCityPlan } from '../../../game/src/world/plan/cityPlanGenerator.js';
import { convexRingsOverlap } from '../../../game/src/world/plan/planGeometry.js';

// The game's own plan for the default world seed (openWorldCity: context.random('cityPlan')).
const plan = generateCityPlan(createSeededRandom(deriveSeed(1, 'cityPlan')));
const GIVER = { x: -422, z: -434 };

test('across the first giver\'s street stands a row of industrial lots, not the open yard', () => {
  const nearest = plan.nearestRoad(GIVER.x, GIVER.z, 30);
  assert.equal(nearest.segment.name, 'Calle Gaviota');
  let built = 0;
  // From the giver to 50 m north; the last ~15 m before Avenida del Riel is the junction corner.
  for (let z = GIVER.z - 12; z <= GIVER.z + 50; z += 4) {
    // The first lot met walking west from the street's corridor.
    for (let x = GIVER.x - 12; x > GIVER.x - 60; x -= 1) {
      const lot = plan.lotAt(x, z);
      if (!lot) continue;
      assert.equal(lot.landmarkKind, null, `open landmark ground faces the street at z ${z}`);
      assert.equal(lot.zone, 'industrial');
      built += 1;
      break;
    }
  }
  assert.ok(built >= 14, `only ${built} of 16 lines meet a building lot`);
});

test('the rail yard keeps its landmark, a lorry park, and touches no other lot', () => {
  const yard = plan.lots.find((lot) => lot.landmarkKind === 'train_yard');
  assert.ok(yard.width >= 44 && yard.depth >= 60);
  assert.equal(plan.lotAt(yard.x, yard.z), yard);
  assert.equal(plan.landmarkById.patio_ferroviario.x, yard.x);
  for (const other of plan.lots) {
    if (other !== yard) assert.ok(!convexRingsOverlap(yard.ring, other.ring, 0.2), `yard overlaps lot ${other.id}`);
  }
  const park = plan.specialAreas.find((area) => area.kind === 'parking_lot' && area.lot === yard.id);
  assert.ok(park && park.bays >= 20, 'the yard has a lorry park');
});

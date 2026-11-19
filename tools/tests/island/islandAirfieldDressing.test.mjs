// The dressing of the Norvast strip (game/src/world/island/islandGarrison.js): the garrison's
// stores and ground equipment by the netted hangar, and the grass and scrub of the valley floor.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GROUND_KIT_ITEMS } from '../../../game/src/world/airbase/airBaseDressingPlan.js';
import { ISLAND_PROPS, PARKED, SENTRY_POSTS, planIslandPlanting } from '../../../game/src/world/island/islandGarrison.js';
import { NORVAST_ISLAND_SHAPE as SHAPE, islandHeightLocal } from '../../../game/src/world/island/norvastIslandShape.js';

const { u0, u1, halfWidth, y } = SHAPE.stripLocal;
const apron = SHAPE.apronLocal;
const hangar = SHAPE.hangarLocal;
/** The hangar's arch feet stand 30 m either side of its centre line, over its 44 m depth. */
const HANGAR_HALF = { width: 30, depth: 22 };

test('a few kit props stand by the netted hangar: drums, crates, a power unit, a bowser, the tug', () => {
  const count = (node) => ISLAND_PROPS.filter(([name]) => name === node).length;
  assert.ok(ISLAND_PROPS.length >= 25 && ISLAND_PROPS.length <= 60);
  assert.ok(count('gse_drum') >= 10 && count('gse_crate_stack') >= 4 && count('gse_cone') >= 4);
  for (const node of ['gse_generator', 'gse_tug', 'gse_fuel_truck', 'gse_tool_trolley', 'gse_fire_extinguisher_cart']) assert.ok(count(node) >= 1, node);
  for (const [node, u, v] of ISLAND_PROPS) {
    assert.ok(GROUND_KIT_ITEMS[node], `unknown kit item ${node}`);
    assert.ok(Math.hypot(u - hangar.u, v - hangar.v) < 80, `${node} is not by the hangar`);
  }
});

test('they stand on the flat apron, off the strip, out of the arch feet, the posts and the parked vehicles', () => {
  for (const [node, u, v] of ISLAND_PROPS) {
    const size = GROUND_KIT_ITEMS[node];
    const reach = Math.hypot(size.width, size.length) / 2;
    assert.ok(u - reach > apron.u0 + 6 && u + reach < apron.u1 - 6 && v + reach < apron.v1 - 6, `${node} is off the apron`);
    assert.ok(v - reach > halfWidth + 20, `${node} is in the strip's shoulder`);
    assert.ok(Math.abs(islandHeightLocal(u, v) - y) < 1e-6, `${node} is not on flat ground`);
    // The arch feet and the stores along them: 27.6 to 31 m off the centre line.
    const side = Math.abs(u - hangar.u), deep = Math.abs(v - hangar.v);
    assert.ok(!(side > 26.5 - reach && side < 31 + reach && deep < HANGAR_HALF.depth + reach) || !size.collide, `${node} is in the hangar's side`);
    for (const [pu, pv] of SENTRY_POSTS) assert.ok(Math.hypot(u - pu, v - pv) > 1.5 + (size.collide ? reach : 0), `${node} stands on a sentry`);
    for (const [, pu, pv] of PARKED) assert.ok(Math.hypot(u - pu, v - pv) > 5 + reach, `${node} is in a parked vehicle`);
    // The handover point and the way from the hangar's mouth to it stay free.
    assert.ok(Math.abs(u - hangar.u) > 6 || v > hangar.v - 4 || !size.collide, `${node} blocks the hangar's mouth`);
  }
  const solid = ISLAND_PROPS.filter(([node]) => GROUND_KIT_ITEMS[node].collide);
  for (let i = 0; i < solid.length; i += 1) {
    for (let j = i + 1; j < solid.length; j += 1) {
      const least = (Math.min(GROUND_KIT_ITEMS[solid[i][0]].width, GROUND_KIT_ITEMS[solid[i][0]].length) + Math.min(GROUND_KIT_ITEMS[solid[j][0]].width, GROUND_KIT_ITEMS[solid[j][0]].length)) / 2;
      assert.ok(Math.hypot(solid[i][1] - solid[j][1], solid[i][2] - solid[j][2]) >= least, `${solid[i][0]} and ${solid[j][0]} overlap`);
    }
  }
});

test('grass fringes the strip and clumps over the valley floor, never on the paving or a slope', () => {
  const planting = planIslandPlanting();
  assert.deepEqual(planIslandPlanting(), planting);
  assert.ok(planting.grass.length >= 1500 && planting.grass.length <= 5000, `${planting.grass.length} clumps`);
  assert.ok(planting.scrub.length >= 40 && planting.scrub.length <= 250, `${planting.scrub.length} bushes`);
  const pad = SHAPE.padLocal;
  for (const plant of [...planting.grass, ...planting.scrub]) {
    assert.ok(!(plant.x > u0 && plant.x < u1 && Math.abs(plant.z) < halfWidth), 'grass on the strip');
    assert.ok(!(plant.x > apron.u0 && plant.x < apron.u1 && plant.z > apron.v0 && plant.z < apron.v1), 'grass on the apron');
    assert.ok(Math.hypot(plant.x - pad.u, plant.z - pad.v) > pad.radius, 'grass on the turning pad');
    assert.equal(plant.y, y);
    assert.ok(Math.abs(islandHeightLocal(plant.x, plant.z) - y) < 0.03, 'grass off the valley floor');
    assert.ok(plant.scale > 0.4 && plant.scale < 2.6);
  }
  for (const side of [-1, 1]) {
    const fringe = planting.grass.filter((plant) => plant.z * side > halfWidth && plant.z * side < halfWidth + 4);
    assert.ok(fringe.length >= 250, `${fringe.length} tufts along one edge`);
  }
  // Bushes keep to the foot of the slopes, clear of the landing aircraft's wing.
  for (const bush of planting.scrub) assert.ok(Math.abs(bush.z) > 36, `a bush ${Math.abs(bush.z).toFixed(0)} m from the centre line`);
});

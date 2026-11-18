// Shift 8: lit shop signs over the shopping streets' shop fronts, building shadow boxes for the far
// sun cascade, front-yard hedges and shrubs, leaning palms near walls, pallet-fenced open lots,
// and the residential kit on the apartment lots. All on the real default city.
import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';

register('../city-world/vendoredThreeHook.mjs', import.meta.url);
const { createSeededRandom, deriveSeed } = await import('../../../game/src/core/random/seededRandom.js');
const { generateCityPlan } = await import('../../../game/src/world/plan/cityPlanGenerator.js');
const { planBuilding, kitRulesForLot } = await import('../../../game/src/world/buildings/buildingMassingPlan.js');
const { layOutShopSigns, SHOP_SIGN_DISTRICTS } = await import('../../../game/src/world/props/shopSignDressing.js');
const { buildShadowBoxes, isFarCascade } = await import('../../../game/src/world/buildings/buildingShadowProxies.js');
const { layOutFrontYardPlanting } = await import('../../../game/src/world/vegetation/frontYardPlantingLayout.js');
const { fitCrownsToFacades } = await import('../../../game/src/world/props/sectorStreetItems.js');
const { layOutOpenLotFence, insideQuad } = await import('../../../game/src/world/props/streetClutterLayout.js');

const plan = generateCityPlan(createSeededRandom(deriveSeed(1, 'cityPlan')));
const plans = [];
for (const lot of plan.lots) {
  const building = planBuilding(lot, createSeededRandom(lot.id + 1));
  if (building) plans.push(building);
}
const lotsById = new Map(plan.lots.map((lot) => [lot.id, lot]));

test('shop signs stand on the shopping districts\' front shop bays, proud of the wall, both blade faces', () => {
  const fronts = [];
  for (const building of plans) {
    if (!building.shopfront) continue;
    for (const edge of building.edges) {
      if (!edge.front) continue;
      let along = 0.5;
      edge.bays.forEach((bay, column) => {
        const centre = along + bay.width / 2;
        if (bay.ground === 'ground_shop') {
          fronts.push({ x: edge.ax + edge.tx * centre, y: building.y, z: edge.az + edge.tz * centre, nx: edge.nx, nz: edge.nz,
            width: bay.width, district: building.district, key: (building.seed + column * 7919) >>> 0 });
        }
        along += bay.width;
      });
    }
  }
  const signs = layOutShopSigns(fronts);
  const lit = fronts.filter((front) => SHOP_SIGN_DISTRICTS.has(front.district));
  assert.ok(lit.length > 200, `shop bays in the shopping districts: ${lit.length}`);
  const fascias = signs.filter((sign) => !sign.blade);
  const blades = signs.filter((sign) => sign.blade);
  assert.ok(fascias.length >= lit.length * 0.9, `${fascias.length} fascias for ${lit.length} bays`);
  assert.equal(blades.length % 2, 0, 'every blade has two faces');
  assert.ok(blades.length > fascias.length * 0.2, `blades: ${blades.length / 2}`);
  for (const sign of fascias) {
    assert.ok(sign.width > 1 && sign.width <= 3.4 && sign.height > 0.3 && sign.height <= 0.62);
    assert.ok(sign.y > 3 && sign.y < 4.3 + 100, 'fascia over the shop window');
  }
  assert.ok(new Set(signs.map((sign) => sign.brand)).size >= 10, 'varied brands');
  assert.equal(layOutShopSigns(fronts.filter((front) => front.district === 'barrio_hierro')).length, 0, 'no neon in Barrio Hierro');
});

test('shadow boxes: closed, outward boxes per building; far cascades are the wide ones', () => {
  const sample = plans.slice(0, 200);
  const { positions, indices, boxes } = buildShadowBoxes(sample);
  assert.equal(boxes, sample.length);
  assert.equal(indices.length, boxes * 30);
  for (let index = 0; index < indices.length; index += 30) {
    const base = indices[index] - (indices[index] % 8);
    let cx = 0; let cz = 0;
    for (let v = 0; v < 8; v += 1) { cx += positions[(base + v) * 3] / 8; cz += positions[(base + v) * 3 + 2] / 8; }
    for (let t = index; t < index + 30; t += 3) {
      const [a, b, c] = [indices[t], indices[t + 1], indices[t + 2]];
      const p = (i) => [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];
      const [pa, pb, pc] = [p(a), p(b), p(c)];
      const u = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]];
      const w = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]];
      const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
      const mid = [(pa[0] + pb[0] + pc[0]) / 3 - cx, (pa[2] + pb[2] + pc[2]) / 3 - cz];
      const outward = n[1] > 0.01 ? n[1] : n[0] * mid[0] + n[2] * mid[1];
      assert.ok(outward > 0, 'faces point out of the box');
    }
  }
  assert.equal(isFarCascade({ left: -21, right: 21 }), false);
  assert.equal(isFarCascade({ left: -96, right: 96 }), true);
  assert.equal(isFarCascade({ left: -52, right: 52 }), false);
});

test('front yards: hedges and shrub groups inside the homes\' lots, clear of the facade', () => {
  const plants = layOutFrontYardPlanting(plans, lotsById);
  const hedges = plants.filter((plant) => plant.species === 'hedge_clipped');
  const shrubs = plants.filter((plant) => plant.species === 'shrubs_tropical');
  assert.ok(hedges.length > 500, `hedge modules: ${hedges.length}`);
  assert.ok(shrubs.length > 300, `shrubs: ${shrubs.length}`);
  let outside = 0;
  for (const building of plans) {
    if (building.family !== 'residential' && building.family !== 'villa') continue;
    const lot = lotsById.get(building.lotId);
    const mine = layOutFrontYardPlanting([building], lotsById);
    for (const plant of mine) {
      if (!insideQuad(lot.ring, plant.x, plant.z, 0.05)) outside += 1;
      const front = building.edges.find((edge) => edge.front);
      const out = (plant.x - front.ax) * front.nx + (plant.z - front.az) * front.nz;
      assert.ok(out > 0.5, 'in front of the facade');
    }
  }
  assert.ok(outside <= plants.length * 0.02, `${outside} of ${plants.length} outside their lot`);
});

test('coconut palms within 4 m of a wall become leaning palms; apartments use the residential kit', () => {
  const wall = { height: 12, edges: [{ ax: 0, az: 0, bx: 20, bz: 0 }] };
  const [near, far, median] = fitCrownsToFacades([
    { species: 'coconut_palm', x: 5, z: 3, scale: 1 },
    { species: 'coconut_palm', x: 5, z: 6, scale: 1 },
    { species: 'coconut_palm', x: 9, z: 3.2, scale: 1, place: 'median' },
  ], [wall]);
  assert.equal(near.species, 'coconut_palm_leaning');
  assert.equal(far.species, 'coconut_palm');
  assert.equal(median.species, 'coconut_palm');
  assert.equal(kitRulesForLot({ style: 'apartment_block' }).kit, 'kit_residential');
  assert.equal(kitRulesForLot({ style: 'safehouse_apartment' }).maxStoreys, 4);
  for (const building of plans) if (building.kit === 'kit_residential' && building.family === 'residential') assert.ok(building.storeys <= 4);
});

test('open lots of the worn districts are pallet-fenced with a gap for cars', () => {
  const open = plan.lots.filter((lot) => lot.district === 'barrio_hierro' && lot.zone === 'parking');
  assert.ok(open.length > 0);
  for (const lot of open) {
    const items = layOutOpenLotFence(lot);
    const fences = items.filter((each) => each.object === 'pallet_fence');
    assert.ok(fences.length >= 4, `lot ${lot.id}: ${fences.length} panels`);
    assert.ok(items.some((each) => each.object === 'warning_post'), 'a warning post at the opening');
    for (const each of items) assert.ok(insideQuad(lot.ring, each.x, each.z, 0.2), 'inside the lot');
  }
  assert.equal(layOutOpenLotFence(plan.lots.find((lot) => lot.district === 'centro' && lot.zone === 'parking') ?? {}).length, 0);
});

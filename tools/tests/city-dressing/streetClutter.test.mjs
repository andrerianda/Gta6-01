// Street clutter over the whole default city, laid out as the city dressing does (pavements of
// every sector's segments, service sides, yards, fences and walls of every building, through the
// clearance that asks the built street): nothing standing on the asphalt, Barrio Hierro and the
// port more cluttered than Playa Dorada, bus shelters on the avenues, seats published; and the
// pools' show/hide and body/lamp part selection the junction controls use.
import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';

register('../city-world/vendoredThreeHook.mjs', import.meta.url);
const THREE = await import('three');
const { createSeededRandom, deriveSeed } = await import('../../../game/src/core/random/seededRandom.js');
const { generateCityPlan } = await import('../../../game/src/world/plan/cityPlanGenerator.js');
const { layOutSectorClutter } = await import('../../../game/src/world/props/sectorStreetItems.js');
const { createSurfaceClearance } = await import('../../../game/src/world/props/surfaceClearance.js');
const { insideQuad, layOutLotFence } = await import('../../../game/src/world/props/streetClutterLayout.js');
const { planBuilding } = await import('../../../game/src/world/buildings/buildingMassingPlan.js');
const { CITY_DISTRICTS } = await import('../../../game/src/catalog/cityDistricts.js');
const { roadCrossSection, sampleRoadCentreLines } = await import('../../../game/src/world/streets/roadSampling.js');
const { createStreetSurfaceQuery } = await import('../../../game/src/world/streets/streetSurfaceQuery.js');
const { createStreetItemPools } = await import('../../../game/src/world/props/streetItemPools.js');

const plan = generateCityPlan(createSeededRandom(deriveSeed(1, 'cityPlan')));
const streets = createStreetSurfaceQuery(plan, sampleRoadCentreLines(plan), plan.roads.segments.map(roadCrossSection));
const clearance = createSurfaceClearance(streets);
const random = createSeededRandom(deriveSeed(1, 'cityDressing'));
const lotsById = new Map(plan.lots.map((lot) => [lot.id, lot]));
const grid = plan.sectors;

const all = [];
for (let cell = 0; cell < grid.cells.length; cell += 1) {
  const column = cell % grid.columns;
  const row = Math.floor(cell / grid.columns);
  const minX = grid.minX + column * grid.size;
  const minZ = grid.minZ + row * grid.size;
  const bounds = { minX, minZ, maxX: minX + grid.size, maxZ: minZ + grid.size };
  const lots = grid.cells[cell].lots.map((id) => lotsById.get(id)).filter((lot) => lot && lot.x >= minX && lot.x < bounds.maxX && lot.z >= minZ && lot.z < bounds.maxZ);
  const buildings = lots.map((lot) => planBuilding(lot, random.fork(`lot${lot.id}`), CITY_DISTRICTS[lot.district]?.moodColors ?? {})).filter(Boolean);
  all.push(...layOutSectorClutter({ segments: grid.cells[cell].segments.map((id) => plan.roads.segments[id]), buildings, lotsById, bounds, clearance }));
}

const BAD = new Set(['carriageway', 'junction', 'crosswalk']);
const probe = {};

test('the city is cluttered and nothing standing is on the built asphalt', (t) => {
  const byZone = {};
  for (const item of all) byZone[item.zone] = (byZone[item.zone] ?? 0) + 1;
  t.diagnostic(`${all.length} items: ${JSON.stringify(byZone)}`);
  assert.ok(all.length > 3000, 'thousands of items');
  for (const zone of ['kerb', 'wall', 'service', 'stop', 'fence']) assert.ok(byZone[zone] > 20, `zone ${zone} is used`);
  const bad = [];
  for (const item of all) {
    if (item.mounted) continue;
    const reach = item.fence ? 0 : Math.min(item.halfZ, 0.9);
    for (let i = 0; i <= 12; i += 1) {
      const a = (i / 12) * Math.PI * 2;
      const r = i === 12 ? 0 : reach;
      const kind = streets.surfaceAt(item.x + Math.cos(a) * r, item.z + Math.sin(a) * r, probe).kind;
      if (BAD.has(kind)) { bad.push({ object: item.object, x: Math.round(item.x), z: Math.round(item.z), kind }); break; }
    }
  }
  assert.deepEqual(bad.slice(0, 5), [], `${bad.length} items on the asphalt`);
});

test('Barrio Hierro and the port carry more clutter per street metre than Playa Dorada', (t) => {
  const metres = {};
  for (const segment of plan.roads.segments) metres[segment.district] = (metres[segment.district] ?? 0) + (segment.length ?? 0);
  const count = {};
  for (const item of all) {
    if (item.zone !== 'kerb' && item.zone !== 'wall') continue;
    const district = plan.districtAt(item.x, item.z);
    count[district] = (count[district] ?? 0) + 1;
  }
  const per = (d) => (count[d] ?? 0) / Math.max(1, metres[d] ?? 1) * 100;
  t.diagnostic(`items per 100 m: ${Object.keys(metres).map((d) => `${d} ${per(d).toFixed(2)}`).join(', ')}`);
  assert.ok(per('barrio_hierro') > per('playa_dorada') * 1.8, 'Barrio Hierro is far busier than Playa Dorada');
  assert.ok(per('puerto_tamarindo') > per('playa_dorada'), 'the port is busier than Playa Dorada');
});

test('bus shelters stand on avenues and fences inside their lots', () => {
  const shelters = all.filter((item) => item.object === 'bus_shelter');
  assert.ok(shelters.length > 10, `${shelters.length} shelters`);
  const lot = { id: 7, ring: [30, 0, 0, 0, 0, 20, 30, 20] };
  const fence = layOutLotFence(lot);
  assert.ok(fence.length > 12 && fence.some((item) => item.object === 'fence_gate'), `a fence with a gate: ${fence.length}`);
  for (const item of fence) assert.ok(insideQuad(lot.ring, item.x, item.z, 0.2), `panel at ${item.x}, ${item.z} inside the lot`);
});

function fakeSet() {
  const scene = new THREE.Group();
  const object = new THREE.Group();
  object.name = 'signal';
  scene.add(object);
  for (const level of [0, 1]) {
    const node = new THREE.Group();
    node.name = `signal_lod${level}`;
    object.add(node);
    const body = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ name: 'atlas' }));
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), new THREE.MeshStandardMaterial({ name: 'lamp_red' }));
    node.add(body, lamp);
  }
  return { has: () => true, get: () => ({ scene }) };
}

test('pools draw a body and a switched lamp, shown and hidden per item', () => {
  const pools = createStreetItemPools(fakeSet(), { shadowCasterDistance: 45 });
  const matrices = new Float32Array(32);
  new THREE.Matrix4().makeTranslation(2, 0, 0).toArray(matrices, 0);
  new THREE.Matrix4().makeTranslation(4, 0, 0).toArray(matrices, 16);
  const swap = (material, state) => (state === 'on' ? new THREE.MeshBasicMaterial({ name: 'lit' }) : material);
  const handle = pools.addSector([
    { source: { assetId: 'set', object: 'signal', select: 'body' }, kind: 'control', matrices, count: 2 },
    { source: { assetId: 'set', object: 'signal', select: 'lamp_red', state: 'on', swap, noShadow: true }, kind: 'control', matrices, count: 2, hidden: true },
  ]);
  pools.update(0, 0);
  const pool = (key) => pools.describePool(key);
  assert.equal(pool('set_signal_body_lod0').count, 2);
  assert.deepEqual(pool('set_signal_body_lod0').materials, ['atlas'], 'the body has no lamp part');
  assert.equal(pool('set_signal_lamp_red_on_lod0'), null, 'hidden lamps make no pool yet');
  handle.setShown(1, 1, true);
  assert.equal(pool('set_signal_lamp_red_on_lod0').count, 1);
  assert.deepEqual(pool('set_signal_lamp_red_on_lod0').materials, ['lit']);
  assert.equal(pool('set_signal_lamp_red_on_lod0').castShadow, false);
  assert.equal(pool('set_signal_lamp_red_on_lod0').meshes[0].castShadow, false);
  assert.deepEqual(pool('set_signal_lamp_red_on_lod0').xs, [4]);
  handle.setShown(1, 1, false);
  assert.equal(pool('set_signal_lamp_red_on_lod0').count, 0);
  assert.equal(pools.stats().byKind.control.instances, 2);
  handle.dispose();
  assert.equal(pools.stats().instances, 0);
});

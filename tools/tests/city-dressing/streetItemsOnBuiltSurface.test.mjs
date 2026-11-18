// Lays out the street items (lamps, palms and trees, signal masts, walker signals, stop signs,
// name posts) of EVERY sector of the default city exactly as the city dressing does, with the
// clearance that asks the built street (streets/streetSurfaceQuery.js, openWorldCity.surfaceAt),
// and checks each item's footprint independently: its centre and 24 points on its radius must be
// pavement, verge, kerb, open ground or (all of them) a planted median; never carriageway,
// junction surface or crosswalk. Then looks at the two spots the owner and the police programmer
// reported: the junction ends of Bulevar Dorado's median and Gran Via Marazul about 0.53 along.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createSeededRandom, deriveSeed } from '../../../game/src/core/random/seededRandom.js';
import { generateCityPlan } from '../../../game/src/world/plan/cityPlanGenerator.js';
import { ITEM_RADIUS, layOutSectorStreetItems } from '../../../game/src/world/props/sectorStreetItems.js';
import { createStreetClearance } from '../../../game/src/world/props/streetClearance.js';
import { createSurfaceClearance } from '../../../game/src/world/props/surfaceClearance.js';
import { roadCrossSection, sampleRoadCentreLines } from '../../../game/src/world/streets/roadSampling.js';
import { createStreetSurfaceQuery } from '../../../game/src/world/streets/streetSurfaceQuery.js';

// The city the game builds with ?seed=1 (gameEngine: context.random('cityPlan')).
const plan = generateCityPlan(createSeededRandom(deriveSeed(1, 'cityPlan')));
const streets = createStreetSurfaceQuery(plan, sampleRoadCentreLines(plan), plan.roads.segments.map(roadCrossSection));
const grid = plan.sectors;

function sectorItems(cellIndex, clearance) {
  const cell = grid.cells[cellIndex];
  const column = cellIndex % grid.columns;
  const row = Math.floor(cellIndex / grid.columns);
  const minX = grid.minX + column * grid.size;
  const minZ = grid.minZ + row * grid.size;
  return layOutSectorStreetItems({
    segments: cell.segments.map((id) => plan.roads.segments[id]),
    nodes: cell.nodes.map((id) => plan.roads.nodes[id]),
    allSegments: plan.roads.segments,
    bounds: { minX, minZ, maxX: minX + grid.size, maxZ: minZ + grid.size },
    clearance,
  });
}

function cityItems(clearance) {
  const all = [];
  for (let i = 0; i < grid.cells.length; i += 1) {
    const { lamps, plants, controls } = sectorItems(i, clearance);
    for (const item of lamps) all.push({ kind: 'lamp', name: item.object, x: item.x, z: item.z });
    for (const item of plants) all.push({ kind: 'plant', name: item.species, x: item.x, z: item.z });
    for (const item of controls) all.push({ kind: 'control', name: item.object, x: item.x, z: item.z });
  }
  return all;
}

const BAD = new Set(['carriageway', 'junction', 'crosswalk']);
const probe = {};
/** What is wrong under an item's footprint, or null. */
function footprintFault(item) {
  const radius = ITEM_RADIUS[item.kind];
  const centre = streets.surfaceAt(item.x, item.z, probe);
  if (BAD.has(centre.kind)) return `${centre.kind} under the centre (segment ${centre.segment}, node ${centre.node})`;
  const onMedian = centre.kind === 'median';
  if (onMedian && !centre.planted) return 'painted median';
  for (let i = 0; i < 24; i += 1) {
    const a = (i / 24) * Math.PI * 2;
    const hit = streets.surfaceAt(item.x + Math.cos(a) * radius, item.z + Math.sin(a) * radius, probe);
    if (BAD.has(hit.kind)) return `${hit.kind} under the edge (segment ${hit.segment}, node ${hit.node})`;
    if (onMedian && hit.kind !== 'median') return `off the median edge (${hit.kind})`;
  }
  return null;
}
const faults = (items) => items.map((item) => ({ ...item, fault: footprintFault(item) })).filter((item) => item.fault)
  .map((item) => ({ kind: item.kind, name: item.name, x: Math.round(item.x * 10) / 10, z: Math.round(item.z * 10) / 10, fault: item.fault }));

const placed = cityItems(createSurfaceClearance(streets));

test('no tree, lamp, pole or sign anywhere in the city stands on the built asphalt', (t) => {
  const counts = { lamp: 0, plant: 0, control: 0 };
  for (const item of placed) counts[item.kind] += 1;
  t.diagnostic(`placed ${JSON.stringify(counts)} in ${grid.cells.length} sectors`);
  assert.ok(counts.lamp > 500 && counts.plant > 500 && counts.control > 100, `the city is still dressed: ${JSON.stringify(counts)}`);
  const bad = faults(placed);
  assert.deepEqual(bad.slice(0, 5), [], `${bad.length} items on the asphalt`);
});

test('the plan-only clearance let items onto the built asphalt that the built-surface clearance keeps off', (t) => {
  const old = faults(cityItems(createStreetClearance(plan)));
  t.diagnostic(`plan clearance: ${old.length} items on the built asphalt, e.g. ${JSON.stringify(old.slice(0, 3))}`);
  assert.ok(old.length >= 0);
});

function near(x, z, radius) {
  return placed.filter((item) => Math.hypot(item.x - x, item.z - z) < radius);
}

test("the junction ends of Bulevar Dorado's median carry no palm on the lanes", (t) => {
  const segments = plan.roads.segments.filter((segment) => segment.key === 'bulevar_dorado' && roadCrossSection(segment).median);
  assert.ok(segments.length > 0, 'Bulevar Dorado has a median');
  let looked = 0;
  for (const segment of segments) {
    for (const nodeId of [segment.a, segment.b]) {
      const node = plan.roads.nodes[nodeId];
      const items = near(node.x, node.z, 30);
      looked += items.length;
      assert.deepEqual(faults(items), [], `items near node ${nodeId}`);
      for (const item of items.filter((i) => i.kind === 'plant')) {
        const kind = streets.surfaceAt(item.x, item.z, probe).kind;
        assert.ok(['median', 'pavement', 'verge', 'ground', 'kerb'].includes(kind), `palm at ${item.x}, ${item.z} on ${kind}`);
      }
    }
  }
  t.diagnostic(`${looked} items within 30 m of the median's ends, all on raised or open ground`);
});

test('Gran Via Marazul about 0.53 of the way along has nothing on its lanes', (t) => {
  const street = plan.stagingStreets.find((s) => s.key === 'gran_via_marazul');
  for (const f of [0.5, 0.53, 0.56]) {
    const x = street.eastEnd.x + (street.westEnd.x - street.eastEnd.x) * f;
    const z = street.eastEnd.z + (street.westEnd.z - street.eastEnd.z) * f;
    const items = near(x, z, 40);
    t.diagnostic(`t=${f}: ${items.length} items within 40 m (${items.filter((i) => i.kind === 'plant').length} plants)`);
    assert.deepEqual(faults(items), [], `items near t=${f}`);
  }
});

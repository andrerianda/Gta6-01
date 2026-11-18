// Street trees over the whole default city, laid out as the city dressing does (lamps, plants,
// junction controls and clutter of every sector, through the clearance that asks the built
// street): every tree whose trunk stands on paving has a pit whose whole grate lies on the
// pavement (never over the kerb or the asphalt), every other tree stands on planted ground
// (verge, median, open ground), and no lamp, signal or standing clutter (bench, shelter, bin,
// kiosk ...) intrudes on a pit or crowds a trunk.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createSeededRandom, deriveSeed } from '../../../game/src/core/random/seededRandom.js';
import { generateCityPlan } from '../../../game/src/world/plan/cityPlanGenerator.js';
import { layOutSectorClutter, layOutSectorStreetItems, TREE_PIT_CLEAR, TREE_PIT_HALF } from '../../../game/src/world/props/sectorStreetItems.js';
import { createSurfaceClearance } from '../../../game/src/world/props/surfaceClearance.js';
import { planBuilding } from '../../../game/src/world/buildings/buildingMassingPlan.js';
import { CITY_DISTRICTS } from '../../../game/src/catalog/cityDistricts.js';
import { roadCrossSection, sampleRoadCentreLines } from '../../../game/src/world/streets/roadSampling.js';
import { createStreetSurfaceQuery } from '../../../game/src/world/streets/streetSurfaceQuery.js';

const plan = generateCityPlan(createSeededRandom(deriveSeed(1, 'cityPlan')));
const streets = createStreetSurfaceQuery(plan, sampleRoadCentreLines(plan), plan.roads.segments.map(roadCrossSection));
const clearance = createSurfaceClearance(streets);
const random = createSeededRandom(deriveSeed(1, 'cityDressing'));
const lotsById = new Map(plan.lots.map((lot) => [lot.id, lot]));
const grid = plan.sectors;

const trees = [];
const poles = [];
const clutter = [];
for (let cell = 0; cell < grid.cells.length; cell += 1) {
  const column = cell % grid.columns;
  const row = Math.floor(cell / grid.columns);
  const minX = grid.minX + column * grid.size;
  const minZ = grid.minZ + row * grid.size;
  const bounds = { minX, minZ, maxX: minX + grid.size, maxZ: minZ + grid.size };
  const data = grid.cells[cell];
  const segments = data.segments.map((id) => plan.roads.segments[id]);
  const { lamps, plants, controls } = layOutSectorStreetItems({
    segments, nodes: data.nodes.map((id) => plan.roads.nodes[id]), allSegments: plan.roads.segments, bounds, clearance,
  });
  const lots = data.lots.map((id) => lotsById.get(id)).filter((lot) => lot && lot.x >= minX && lot.x < bounds.maxX && lot.z >= minZ && lot.z < bounds.maxZ);
  const buildings = lots.map((lot) => planBuilding(lot, random.fork(`lot${lot.id}`), CITY_DISTRICTS[lot.district]?.moodColors ?? {})).filter(Boolean);
  trees.push(...plants);
  poles.push(...lamps, ...controls);
  clutter.push(...layOutSectorClutter({ segments, buildings, lotsById, bounds, clearance, fixed: [...lamps, ...controls, ...plants] }));
}

test('every tree on paving stands in a pit that lies wholly on the pavement', (t) => {
  const pits = trees.filter((tree) => tree.pit);
  t.diagnostic(`${trees.length} trees, ${pits.length} in pits`);
  assert.ok(pits.length > 1500, 'the pavement trees have pits');
  const planted = new Set(['verge', 'ground', 'median']);
  const bad = [];
  for (const tree of trees) {
    const kind = clearance.kindAt(tree.x, tree.z);
    if (kind === 'pavement') {
      if (!tree.pit) { bad.push({ why: 'no pit', x: tree.x, z: tree.z }); continue; }
      const c = Math.cos(tree.pit.rotationY);
      const s = Math.sin(tree.pit.rotationY);
      for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]]) {
        const x = tree.x + (u * c + v * s) * TREE_PIT_HALF;
        const z = tree.z + (-u * s + v * c) * TREE_PIT_HALF;
        const under = clearance.kindAt(x, z);
        if (under !== 'pavement') { bad.push({ why: `pit over ${under}`, x: Math.round(x), z: Math.round(z) }); break; }
      }
    } else if (!planted.has(kind)) bad.push({ why: `trunk on ${kind}`, x: Math.round(tree.x), z: Math.round(tree.z) });
    else if (tree.pit) bad.push({ why: `pit on ${kind}`, x: Math.round(tree.x), z: Math.round(tree.z) });
  }
  assert.deepEqual(bad.slice(0, 10), [], `${bad.length} trees wrong`);
});

test('no lamp, signal or standing clutter intrudes on a pit or crowds a trunk', () => {
  const bad = [];
  for (const tree of trees) {
    for (const pole of poles) {
      if ((pole.x - tree.x) ** 2 + (pole.z - tree.z) ** 2 < 2.2 ** 2) bad.push({ why: `${pole.object ?? 'lamp'} at a trunk`, x: Math.round(tree.x), z: Math.round(tree.z) });
    }
    const keep = tree.pit ? TREE_PIT_CLEAR : 0.9;
    for (const item of clutter) {
      if (item.mounted) continue;
      if ((item.x - tree.x) ** 2 + (item.z - tree.z) ** 2 < (item.halfX + keep) ** 2) bad.push({ why: `${item.object} in a pit`, x: Math.round(tree.x), z: Math.round(tree.z) });
    }
  }
  assert.deepEqual(bad.slice(0, 10), [], `${bad.length} intrusions`);
});

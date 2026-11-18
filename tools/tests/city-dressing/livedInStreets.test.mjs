// Lived-in streets over the whole default city, laid out as the city dressing does: overhead
// cables (pole to pole, service drops, facade to facade in the crowded districts) hang at sane
// heights with sane spans and end on real walls; no tree's crown reaches a building footprint;
// coconut palms lean over the road; every trunk, pole, signal and standing clutter item is
// covered by a walker's obstacle circle; Barrio Hierro is the densest street in town.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createSeededRandom, deriveSeed } from '../../../game/src/core/random/seededRandom.js';
import { generateCityPlan } from '../../../game/src/world/plan/cityPlanGenerator.js';
import { CROWN_MIN_SCALE, CROWN_REACH, layOutSectorClutter, layOutSectorStreetItems, streetObstacleCircles } from '../../../game/src/world/props/sectorStreetItems.js';
import { layOutSectorCables } from '../../../game/src/world/props/overheadCableLayout.js';
import { layOutRoadsidePlanting } from '../../../game/src/world/vegetation/roadsidePlantingLayout.js';
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

const sectors = [];
for (let cell = 0; cell < grid.cells.length; cell += 1) {
  const minX = grid.minX + (cell % grid.columns) * grid.size;
  const minZ = grid.minZ + Math.floor(cell / grid.columns) * grid.size;
  const bounds = { minX, minZ, maxX: minX + grid.size, maxZ: minZ + grid.size };
  const data = grid.cells[cell];
  const segments = data.segments.map((id) => plan.roads.segments[id]);
  const lots = data.lots.map((id) => lotsById.get(id)).filter((lot) => lot && lot.x >= minX && lot.x < bounds.maxX && lot.z >= minZ && lot.z < bounds.maxZ);
  const buildings = lots.map((lot) => planBuilding(lot, random.fork(`lot${lot.id}`), CITY_DISTRICTS[lot.district]?.moodColors ?? {})).filter(Boolean);
  const { lamps, plants, controls, nearby } = layOutSectorStreetItems({
    segments, nodes: data.nodes.map((id) => plan.roads.nodes[id]), allSegments: plan.roads.segments, allNodes: plan.roads.nodes, bounds, clearance, buildings,
  });
  const openLots = lots.filter((lot) => !buildings.some((building) => building.lotId === lot.id));
  const clutter = layOutSectorClutter({ segments, buildings, lotsById, bounds, clearance, fixed: nearby, openLots });
  const inside = (x, z) => x >= minX && x < bounds.maxX && z >= minZ && z < bounds.maxZ;
  const cables = layOutSectorCables({ segments, poles: lamps, buildings, inside });
  sectors.push({ bounds, segments, buildings, lamps, plants, controls: controls.filter((c) => c.own), clutter, cables });
}
const districtAt = (x, z) => {
  const district = plan.districtAt(x, z);
  return typeof district === 'string' ? district : district?.id ?? null;
};

test('overhead cables hang at sane heights and spans, Barrio Hierro full of them', (t) => {
  const all = sectors.flatMap((sector) => sector.cables);
  const byDistrict = {};
  const bad = [];
  for (const span of all) {
    const length = Math.hypot(span.bx - span.ax, span.bz - span.az);
    if (!(length > 0.5 && length <= 70) || !(span.sag > 0 && span.sag < 2)) bad.push({ why: 'span', length, sag: span.sag });
    for (const y of [span.ay, span.by]) if (!(y >= 3 && y <= 11.5)) bad.push({ why: 'height', y });
    const district = districtAt((span.ax + span.bx) / 2, (span.az + span.bz) / 2) ?? 'street';
    byDistrict[district] = (byDistrict[district] ?? 0) + 1;
  }
  t.diagnostic(`${all.length} spans: ${JSON.stringify(byDistrict)}`);
  assert.deepEqual(bad.slice(0, 5), []);
  assert.ok((byDistrict.barrio_hierro ?? 0) > 150, 'Barrio Hierro has wires overhead');
  assert.ok((byDistrict.barrio_hierro ?? 0) > 3 * (byDistrict.playa_dorada ?? 0), 'the resort is tidier');
});

test('facade ends of the cables sit on a building wall of their sector', () => {
  const bad = [];
  for (const sector of sectors) {
    for (const span of sector.cables) {
      for (const [x, z, base] of [[span.ax, span.az, span.aBase], [span.bx, span.bz, span.bBase]]) {
        if (base === null) continue;
        let nearest = Infinity;
        for (const building of sector.buildings) for (const e of building.edges) nearest = Math.min(nearest, segmentDistance(x, z, e.ax, e.az, e.bx, e.bz));
        if (nearest > 0.1) bad.push({ x, z, nearest });
      }
    }
  }
  assert.deepEqual(bad.slice(0, 5), []);
});

test('no tree crown reaches a building footprint of its sector', (t) => {
  let trees = 0;
  let shrunk = 0;
  const bad = [];
  for (const sector of sectors) {
    for (const plant of sector.plants) {
      trees += 1;
      if (plant.scale < 0.85 - 1e-9 && plant.scale >= CROWN_MIN_SCALE) shrunk += 1;
      const reach = (CROWN_REACH[plant.species] ?? 4) * plant.scale;
      for (const building of sector.buildings) {
        if ((building.height ?? 10) < 3.5) continue;
        for (const e of building.edges) {
          const d = segmentDistance(plant.x, plant.z, e.ax, e.az, e.bx, e.bz);
          if (d < reach - 1e-6) bad.push({ species: plant.species, x: plant.x, z: plant.z, d, reach });
        }
      }
    }
  }
  t.diagnostic(`${trees} trees, ${shrunk} shrunk to fit`);
  assert.ok(trees > 4500, 'most trees kept');
  assert.deepEqual(bad.slice(0, 5), []);
});

test('coconut palms on the pavement lean over the road', () => {
  let checked = 0;
  for (const segment of plan.roads.segments) {
    if (segment.streetscape !== 'palm_median' && segment.streetscape !== 'hillside') continue;
    for (const plant of layOutRoadsidePlanting(segment)) {
      if (plant.species !== 'coconut_palm' || plant.place !== 'side') continue;
      // Object +X in world (rotation about +Y): (cos, -sin).
      const leanX = Math.cos(plant.rotationY);
      const leanZ = -Math.sin(plant.rotationY);
      const before = polylineDistance(plant.x, plant.z, segment.points);
      const after = polylineDistance(plant.x + leanX * 2.5, plant.z + leanZ * 2.5, segment.points);
      assert.ok(after < before - 1.8, `palm at ${plant.x.toFixed(1)}, ${plant.z.toFixed(1)} leans towards the road`);
      checked += 1;
    }
  }
  assert.ok(checked > 50);
});

test('every trunk, pole, signal and standing clutter item is a walker obstacle', (t) => {
  let circles = 0;
  const missing = [];
  for (const sector of sectors) {
    const obstacles = streetObstacleCircles(sector);
    circles += obstacles.length;
    const covered = (x, z) => obstacles.some((o) => (o.x - x) ** 2 + (o.z - z) ** 2 <= o.radius * o.radius + 1e-9);
    for (const item of [...sector.plants, ...sector.lamps, ...sector.controls, ...sector.clutter.filter((c) => !c.mounted && !c.fence)]) {
      if (!covered(item.x, item.z)) missing.push({ x: item.x, z: item.z, object: item.object ?? item.species });
    }
  }
  t.diagnostic(`${circles} obstacle circles`);
  assert.deepEqual(missing.slice(0, 5), []);
});

test('Barrio Hierro streets are the most cluttered in the city', (t) => {
  const length = {};
  const count = {};
  for (const segment of plan.roads.segments) length[segment.district] = (length[segment.district] ?? 0) + (segment.length ?? 0);
  for (const sector of sectors) for (const item of sector.clutter) {
    const district = districtAt(item.x, item.z);
    if (district) count[district] = (count[district] ?? 0) + 1;
  }
  const per100 = (d) => (100 * (count[d] ?? 0)) / (length[d] || 1);
  t.diagnostic(`items per 100 m of street: barrio_hierro ${per100('barrio_hierro').toFixed(1)}, centro ${per100('centro').toFixed(1)}, playa_dorada ${per100('playa_dorada').toFixed(1)}`);
  assert.ok(per100('barrio_hierro') > 30);
  assert.ok(per100('barrio_hierro') > 2.5 * per100('centro'));
});

test('the port container terminal (an open yard) is stocked and fenced, all inside its lot', (t) => {
  const terminal = plan.lots.find((lot) => lot.landmarkKind === 'container_terminal');
  assert.ok(terminal, 'the plan has a container terminal');
  const stock = sectors.flatMap((sector) => sector.clutter).filter((item) => item.lotId === terminal.id);
  t.diagnostic(`${stock.length} items on the terminal (${stock.filter((item) => item.fence).length} fence pieces)`);
  assert.ok(stock.filter((item) => !item.fence).length > 100);
  assert.ok(stock.some((item) => item.fence));
  for (const item of stock) assert.ok(insideRing(terminal.ring, item.x, item.z), `${item.object} at ${item.x.toFixed(1)}, ${item.z.toFixed(1)} inside`);
});

function insideRing(ring, x, z) {
  let inside = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    if ((ring[i + 1] > z) !== (ring[j + 1] > z) && x < ((ring[j] - ring[i]) * (z - ring[i + 1])) / (ring[j + 1] - ring[i + 1]) + ring[i]) inside = !inside;
  }
  return inside;
}

function segmentDistance(x, z, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - ax - dx * t, z - az - dz * t);
}

function polylineDistance(x, z, p) {
  let best = Infinity;
  for (let i = 0; i + 3 < p.length; i += 2) best = Math.min(best, segmentDistance(x, z, p[i], p[i + 1], p[i + 2], p[i + 3]));
  return best;
}

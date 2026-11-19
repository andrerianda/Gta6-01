// Places the street items (lamps, palms and trees, signals, signs, name posts) of whole districts
// of the default city and checks that none stands on a traffic lane: every item's disc must stay
// outside every lane polygon of the plan (lane centre line +- half the lane width). Also checks
// that the clearance answers "asphalt" on the lanes and "free" on the pavement.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createSeededRandom } from '../../../game/src/core/random/seededRandom.js';
import { generateCityPlan } from '../../../game/src/world/plan/cityPlanGenerator.js';
import { ITEM_RADIUS, layOutSectorStreetItems } from '../../../game/src/world/props/sectorStreetItems.js';
import { createStreetClearance } from '../../../game/src/world/props/streetClearance.js';

const plan = generateCityPlan(createSeededRandom(1));
const clearance = createStreetClearance(plan);

/** Lane pieces in a 16 m spatial hash: {ax, az, bx, bz, half}. */
function laneIndex() {
  const cells = new Map();
  for (const lane of plan.lanes) {
    const segment = plan.roads.segments[lane.segment];
    const half = (segment?.laneWidth ?? 3.3) / 2;
    const points = flat(lane.points);
    for (let i = 0; i + 3 < points.length; i += 2) {
      const piece = { ax: points[i], az: points[i + 1], bx: points[i + 2], bz: points[i + 3], half, lane: lane.id };
      for (let cx = Math.floor((Math.min(piece.ax, piece.bx) - 6) / 16); cx <= Math.floor((Math.max(piece.ax, piece.bx) + 6) / 16); cx += 1) {
        for (let cz = Math.floor((Math.min(piece.az, piece.bz) - 6) / 16); cz <= Math.floor((Math.max(piece.az, piece.bz) + 6) / 16); cz += 1) {
          const key = `${cx},${cz}`;
          if (!cells.has(key)) cells.set(key, []);
          cells.get(key).push(piece);
        }
      }
    }
  }
  return cells;
}
function flat(points) {
  if (!points?.length) return [];
  if (typeof points[0] === 'number') return points;
  return points.flatMap((p) => [p.x, p.z]);
}
const lanes = laneIndex();
function onLane(x, z, radius) {
  for (const piece of lanes.get(`${Math.floor(x / 16)},${Math.floor(z / 16)}`) ?? []) {
    const ux = piece.bx - piece.ax; const uz = piece.bz - piece.az;
    const length2 = ux * ux + uz * uz || 1;
    const t = Math.max(0, Math.min(1, ((x - piece.ax) * ux + (z - piece.az) * uz) / length2));
    const d = Math.hypot(x - piece.ax - ux * t, z - piece.az - uz * t);
    if (d < piece.half + radius) return piece;
  }
  return null;
}

function districtItems(districts, withClearance) {
  const segments = plan.roads.segments.filter((segment) => districts.includes(segment.district));
  const nodeIds = new Set(segments.flatMap((segment) => [segment.a, segment.b]));
  return layOutSectorStreetItems({
    segments, nodes: [...nodeIds].map((id) => plan.roads.nodes[id]), allSegments: plan.roads.segments,
    clearance: withClearance ? clearance : null,
  });
}

function offenders(items) {
  const bad = [];
  for (const [kind, list] of [['lamp', items.lamps], ['plant', items.plants], ['control', items.controls]]) {
    for (const item of list) {
      const lane = onLane(item.x, item.z, ITEM_RADIUS[kind]);
      if (lane) bad.push({ kind, object: item.object ?? item.species, x: Math.round(item.x), z: Math.round(item.z), lane: lane.lane });
    }
  }
  return bad;
}

test('no tree, pole or sign of Playa Dorada, Bahia Vista and Centro stands on a lane', (t) => {
  const districts = ['playa_dorada', 'bahia_vista', 'centro'];
  const raw = offenders(districtItems(districts, false));
  t.diagnostic(`without the clearance ${raw.length} items stood on lanes, e.g. ${JSON.stringify(raw.slice(0, 3))}`);
  const items = districtItems(districts, true);
  assert.ok(items.plants.length > 100 && items.lamps.length > 100 && items.controls.length > 20, 'the districts are still dressed');
  const bad = offenders(items);
  assert.deepEqual(bad.slice(0, 5), [], `${bad.length} items on lanes`);
});

test('no street item anywhere in the city stands on a lane', () => {
  const districts = [...new Set(plan.roads.segments.map((segment) => segment.district))];
  const bad = offenders(districtItems(districts, true));
  assert.deepEqual(bad.slice(0, 5), [], `${bad.length} items on lanes`);
});

test('the clearance sees asphalt on the lanes and room on the pavement of Bulevar Dorado', () => {
  const segment = plan.roads.segments.find((s) => s.key === 'bulevar_dorado' && s.length > 60);
  // The middle of the segment, between two of its points: s metres right of the centre line.
  const i = Math.floor(segment.points.length / 4) * 2;
  const [ax, az, bx, bz] = segment.points.slice(i, i + 4);
  const length = Math.hypot(bx - ax, bz - az);
  const ux = (bx - ax) / length; const uz = (bz - az) / length;
  const along = length / 2;
  const at = (s) => [ax + ux * along - uz * s, az + uz * along + ux * s];
  assert.equal(clearance.isClear(...at(segment.halfWidth - 1.5), 0.3), false, 'the parking lane');
  assert.equal(clearance.isClear(...at(-segment.halfWidth + 4), 0.3), false, 'a driving lane');
  assert.equal(clearance.isClear(...at(segment.halfWidth + 2), 0.3), true, 'the pavement');
  assert.equal(clearance.isClear(...at(segment.halfWidth + 0.2), 0.3), false, 'too close to the kerb');
});

// The parked fleet: four to six static Halcón at Base Aérea Punta Garza (a line on the apron, the
// rest in the fighter shelters) beside the untouched alert pair, clear of every stand, taxiway,
// the patrol loop and the people; and the row of two or three Gaviota T-2 at Aeródromo Los
// Pantanos, clear of the runway and of each other, on the field's flat ground.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PUNTA_GARZA_AIR_BASE, puntaGarzaToWorld } from '../../../game/src/catalog/puntaGarzaAirBase.js';
import { createSeededRandom } from '../../../game/src/core/random/seededRandom.js';
import { TRAINER_ROW, runwayOf, trainerRow, trainerStand } from '../../../game/src/vehicles/aerodromeTrainer.js';
import { BASE_KIT_SIZES, PARKED_FIGHTER_SIZE, planAirBaseLayout } from '../../../game/src/world/airbase/airBaseLayout.js';
import { generateCityPlan } from '../../../game/src/world/plan/cityPlanGenerator.js';

const base = PUNTA_GARZA_AIR_BASE;
const layout = planAirBaseLayout();
const fighters = base.parkedFighters;
/** Half spans of what stands on the apron, metres (Manta Sombra 46 m, Garza Negra and Halcón below 30 m and 9.6 m). */
const HALF_SPAN = { manta_sombra: 23, garza_negra: 15, halcon: PARKED_FIGHTER_SIZE.span / 2 };
// The rectangle a fighter covers in city coordinates (they all point north in the city frame: heading 6).
const footprint = (item) => ({
  west: item.at[0] - PARKED_FIGHTER_SIZE.span / 2, east: item.at[0] + PARKED_FIGHTER_SIZE.span / 2,
  south: item.at[1] - PARKED_FIGHTER_SIZE.tailBehind, north: item.at[1] + PARKED_FIGHTER_SIZE.noseAhead,
});
const distanceToSegment = (p, a, b) => {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const t = dx === 0 && dz === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dz * t);
};
// The least distance from a rectangle to a segment, sampled along the rectangle's outline and centre.
const rectToSegment = (rect, a, b) => {
  let least = Infinity;
  for (let i = 0; i <= 8; i += 1) {
    for (let j = 0; j <= 8; j += 1) {
      least = Math.min(least, distanceToSegment([rect.west + ((rect.east - rect.west) * i) / 8, rect.south + ((rect.north - rect.south) * j) / 8], a, b));
    }
  }
  return least;
};

test('four to six Halcón are parked, and the alert pair is as it was', () => {
  assert.ok(fighters.length >= 4 && fighters.length <= 6, `${fighters.length} parked`);
  assert.ok(fighters.every((item) => item.model === 'halcon'));
  assert.equal(new Set(fighters.map((item) => item.id)).size, fighters.length);
  assert.ok(fighters.filter((item) => item.place === 'apron').length >= 2, 'a line on the apron');
  assert.ok(fighters.filter((item) => item.place === 'shelter').length >= 1, 'some in the shelters');
  assert.deepEqual(base.stands.filter((stand) => stand.model === 'halcon').map((stand) => [stand.id, ...stand.at, stand.heading]),
    [['alert_1', -1460, 1190, 6], ['alert_2', -1395, 1190, 6]]);
  assert.deepEqual(base.stands.map((stand) => stand.id), ['stand_manta', 'stand_garza', 'alert_1', 'alert_2']);
});

test('the layout places them in the world on the pad, the line parallel', () => {
  assert.equal(layout.parkedAircraft.length, fighters.length);
  layout.parkedAircraft.forEach((spot, index) => {
    const world = puntaGarzaToWorld(...fighters[index].at);
    assert.ok(Math.abs(spot.x - world.x) < 1e-9 && Math.abs(spot.z - world.z) < 1e-9);
    assert.ok(Math.abs(spot.heading - (6 * Math.PI) / 180) < 1e-9, 'nose north in the city frame');
  });
  assert.equal(layout.y, 1.6);
  const line = fighters.filter((item) => item.place === 'apron');
  assert.equal(new Set(line.map((item) => item.at[1])).size, 1, 'one straight line');
  const steps = line.slice(1).map((item, index) => item.at[0] - line[index].at[0]);
  assert.ok(steps.every((step) => Math.abs(step - steps[0]) < 1e-9 && step >= PARKED_FIGHTER_SIZE.span + 6), `even spacing ${steps}`);
});

test('the line is inside the apron and the others are inside open fighter shelters, nose out', () => {
  const { width, depth } = BASE_KIT_SIZES.base_hardened_shelter;
  const used = new Set();
  for (const item of fighters) {
    const rect = footprint(item);
    if (item.place === 'apron') {
      assert.ok(rect.west > base.apron.west + 3 && rect.east < base.apron.east - 3 && rect.south > base.apron.south + 3 && rect.north < base.apron.north - 3, `${item.id} on the apron`);
      continue;
    }
    const shelter = base.shelters.find((each) => each.id === item.shelter);
    assert.ok(shelter, `${item.id} names its shelter`);
    assert.equal(shelter.holds, 'halcon');
    assert.ok(!used.has(shelter.id), 'one aircraft in a shelter');
    used.add(shelter.id);
    assert.equal(item.heading, shelter.facing, 'nose out of the door');
    assert.ok(rect.west > shelter.at[0] - width / 2 + 2 && rect.east < shelter.at[0] + width / 2 - 2, `${item.id} between the side walls`);
    assert.ok(rect.south > shelter.at[1] - depth / 2 + 2 && rect.north < shelter.at[1] + depth / 2, `${item.id} under the roof`);
  }
});

test('nothing parked overlaps another aircraft, a stand, a mast or the tower', () => {
  const rects = fighters.map(footprint);
  for (let i = 0; i < rects.length; i += 1) {
    for (let j = i + 1; j < rects.length; j += 1) {
      const a = rects[i], b = rects[j];
      const gap = Math.max(b.west - a.east, a.west - b.east, b.south - a.north, a.south - b.north);
      assert.ok(gap >= 4, `${fighters[i].id} and ${fighters[j].id} are ${gap} m apart`);
    }
  }
  fighters.forEach((item, index) => {
    for (const stand of base.stands) {
      // A stand keeps a circle of its aircraft's half span and four metres more.
      const reach = HALF_SPAN[stand.model] + 4;
      const rect = rects[index];
      const dx = Math.max(rect.west - stand.at[0], 0, stand.at[0] - rect.east);
      const dn = Math.max(rect.south - stand.at[1], 0, stand.at[1] - rect.north);
      assert.ok(Math.hypot(dx, dn) > reach, `${item.id} is ${Math.hypot(dx, dn).toFixed(1)} m from ${stand.id}`);
    }
    for (const mast of base.floodlights) assert.ok(rectToSegment(rects[index], mast, mast) > 4, `${item.id} and a mast`);
    assert.ok(rectToSegment(rects[index], base.controlTower.at, base.controlTower.at) > BASE_KIT_SIZES.base_control_tower.width, `${item.id} and the tower`);
  });
});

test('they stand clear of the runway, taxiways, the alert pair\'s way out, the road, the patrol loop and the posts', () => {
  const rects = fighters.map(footprint);
  const lanes = [
    { name: 'runway', a: base.runway.from, b: base.runway.to, clear: base.runway.width / 2 + 20 },
    ...base.taxiways.map((taxiway) => ({ name: taxiway.id, a: taxiway.line[0], b: taxiway.line[1], clear: taxiway.width / 2 + 3 })),
    // The alert pair taxis straight ahead from its pad to the runway.
    ...base.stands.filter((stand) => stand.model === 'halcon').map((stand) => ({ name: `${stand.id} taxi line`, a: stand.at, b: [stand.at[0], base.runway.from[1]], clear: HALF_SPAN.halcon + 6 })),
    { name: 'access road', a: base.accessRoad.line[0], b: base.accessRoad.line[2], clear: base.accessRoad.width / 2 + 4 },
    ...base.patrolRoute.map((point, index) => ({ name: `patrol leg ${index}`, a: point, b: base.patrolRoute[(index + 1) % base.patrolRoute.length], clear: 6 })),
  ];
  fighters.forEach((item, index) => {
    for (const lane of lanes) {
      const distance = rectToSegment(rects[index], lane.a, lane.b);
      assert.ok(distance > lane.clear, `${item.id} is ${distance.toFixed(1)} m from ${lane.name}`);
    }
    for (const post of base.posts) assert.ok(rectToSegment(rects[index], post.at, post.at) > 3, `${item.id} and ${post.id}`);
    assert.ok(rectToSegment(rects[index], base.gate.at, base.gate.at) > 50);
  });
  // The lead's spot with ?stage=base stays free.
  const visitor = [(base.stands[0].at[0] + base.stands[1].at[0]) / 2, base.stands[0].at[1] + 45];
  for (const rect of rects) assert.ok(rectToSegment(rect, visitor, visitor) > 20);
});

test('two or three Gaviota T-2 stand in a row at Los Pantanos, clear of the runway and of each other', () => {
  const plan = generateCityPlan(createSeededRandom('1'));
  const runway = runwayOf(plan);
  const landmark = plan.landmarks.find((each) => each.kind === 'airstrip');
  const towards = landmark.position ?? landmark.center ?? landmark;
  const row = trainerRow(runway, towards);
  assert.ok(row.length >= 2 && row.length <= 3 && row.length === TRAINER_ROW.count, `${row.length} in the row`);
  assert.deepEqual(row[0], trainerStand(runway, towards), 'the first is the trainer\'s own stand');
  assert.ok(Math.hypot(row[0].x + 458.3, row[0].z + 1187.9) < 0.5);
  const ux = (runway.x1 - runway.x0) / runway.length, uz = (runway.z1 - runway.z0) / runway.length;
  const SPAN = 8.6, NOSE = 2.6, TAIL = 4.3;
  row.forEach((stand, index) => {
    const along = (stand.x - runway.x0) * ux + (stand.z - runway.z0) * uz;
    const aside = Math.abs((stand.x - runway.x0) * -uz + (stand.z - runway.z0) * ux);
    assert.ok(along > SPAN && along < runway.length - SPAN, `stand ${index} beside the runway`);
    assert.ok(aside - NOSE > runway.width / 2 + 2, `stand ${index}: nose ${(aside - NOSE - runway.width / 2).toFixed(1)} m off the runway's edge`);
    assert.ok(Math.abs(stand.heading - row[0].heading) < 1e-9, 'all parallel');
    // Nose towards the centreline.
    const fx = Math.sin(stand.heading), fz = -Math.cos(stand.heading);
    const before = Math.abs((stand.x - runway.x0) * -uz + (stand.z - runway.z0) * ux);
    const after = Math.abs((stand.x + fx - runway.x0) * -uz + (stand.z + fz - runway.z0) * ux);
    assert.ok(after < before - 0.99);
    // Flat, dry ground of the field under the whole aircraft.
    for (let back = -NOSE; back <= TAIL; back += 1.15) {
      for (let right = -SPAN / 2; right <= SPAN / 2; right += 2.15) {
        const x = stand.x - fx * back - fz * right, z = stand.z - fz * back + fx * right;
        assert.ok(Math.abs(plan.heightAt(x, z) - runway.y) < 0.08, `height ${plan.heightAt(x, z)} under stand ${index}`);
        assert.equal(plan.isWaterAt(x, z), false);
      }
    }
    for (const lot of plan.lots) assert.ok(Math.hypot(lot.x - stand.x, lot.z - stand.z) > 40, `stand ${index} and lot ${lot.id}`);
    for (let other = index + 1; other < row.length; other += 1) {
      assert.ok(Math.hypot(row[other].x - stand.x, row[other].z - stand.z) >= SPAN + 3, 'wing tips apart');
    }
  });
});

// Base Aérea Punta Garza in the city plan and its world layout: the pad is flat and dry, the runway
// is paved and 980 m long, runway_1 is still the first runway, nothing of the city lies on the pad,
// the plan is the same on every build, and the fence and the posts stand on the pad.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PUNTA_GARZA_AIR_BASE, puntaGarzaToWorld } from '../../../game/src/catalog/puntaGarzaAirBase.js';
import { createSeededRandom } from '../../../game/src/core/random/seededRandom.js';
import { planAirBaseLayout } from '../../../game/src/world/airbase/airBaseLayout.js';
import { generateCityPlan } from '../../../game/src/world/plan/cityPlanGenerator.js';
import { distanceToRing, pointInRing } from '../../../game/src/world/plan/planGeometry.js';

const plan = generateCityPlan(createSeededRandom('1'));
const base = plan.specialAreas.find((area) => area.kind === 'airbase');
const layout = planAirBaseLayout();
const Y = PUNTA_GARZA_AIR_BASE.groundHeight;
// The raised ground of the plan (the catalog's pad and a few metres round it).
const isOnAirBasePad = (x, z) => pointInRing(base.ring, x, z);

test('the pad is flat at its ground height and dry', () => {
  assert.ok(base, 'the plan has an airbase area');
  let samples = 0;
  for (let x = -2040; x < -980; x += 7) {
    for (let z = -1660; z < -950; z += 7) {
      if (!pointInRing(base.ring, x, z) || distanceToRing(base.ring, x, z) < 6) continue;
      samples += 1;
      assert.ok(Math.abs(plan.heightAt(x, z) - Y) < 0.02, `height ${plan.heightAt(x, z)} at ${x}, ${z}`);
      assert.equal(plan.isWaterAt(x, z), false);
      assert.ok(plan.shoreDistanceAt(x, z) > 0, `shore distance at ${x}, ${z}`);
    }
  }
  assert.ok(samples > 5000);
});

test('the armour slope falls into the sea and stays inside the height field', () => {
  const tip = puntaGarzaToWorld(-2185, 1385);
  assert.ok(tip.x > plan.frame.extent.minX + 8);
  assert.ok(plan.heightAt(plan.frame.extent.minX, tip.z) < -1);
  assert.equal(plan.isWaterAt(tip.x - 14, tip.z), true);
});

test('the runway is paved, 980 m long, heads 276, and runway_1 is still the first runway', () => {
  const runways = plan.specialAreas.filter((area) => area.kind === 'runway');
  assert.equal(runways[0].id, 'runway_1');
  const runway = runways.find((area) => area.id === 'runway_punta_garza');
  assert.ok(runway);
  assert.ok(Math.abs(runway.length - 980) < 0.01);
  assert.equal(runway.heading, 276);
  const [x0, z0, x1, z1] = runway.line;
  for (let t = 0.01; t < 1; t += 0.02) {
    for (const across of [-20, 0, 20]) {
      const x = x0 + (x1 - x0) * t + ((z1 - z0) / 980) * across;
      const z = z0 + (z1 - z0) * t - ((x1 - x0) / 980) * across;
      assert.equal(plan.surfaceAt(x, z), 'paved', `surface at ${x}, ${z}`);
      assert.ok(Math.abs(plan.heightAt(x, z) - Y) < 0.02);
    }
  }
  assert.ok(Math.abs(layout.runway.length - 980) < 0.01);
  assert.ok(layout.runway.x0 > layout.runway.x1, 'end 0 is the east threshold');
  // Compass heading of the line from end 0 to end 1.
  const heading = (Math.atan2(layout.runway.x1 - layout.runway.x0, -(layout.runway.z1 - layout.runway.z0)) * 180) / Math.PI;
  assert.ok(Math.abs(((heading + 360) % 360) - 276) < 0.01);
});

test('apron, taxiways and the access road are paved', () => {
  for (const stand of layout.stands) assert.equal(plan.surfaceAt(stand.x, stand.z), 'paved');
  for (const taxiway of layout.taxiways) assert.equal(plan.surfaceAt((taxiway.a.x + taxiway.b.x) / 2, (taxiway.a.z + taxiway.b.z) / 2), 'paved');
  for (const point of layout.road.points) assert.equal(plan.surfaceAt(point.x, point.z), 'paved');
});

test('no road, lot, parking spot or pavement lies on the pad', () => {
  assert.deepEqual(plan.diagnostics.filter((line) => /pad/.test(line)), []);
  for (const segment of plan.roads.segments) {
    for (let i = 0; i < segment.points.length; i += 2) assert.equal(pointInRing(base.ring, segment.points[i], segment.points[i + 1]), false, segment.key);
  }
  for (const lot of plan.lots) assert.equal(pointInRing(base.ring, lot.x, lot.z), false);
  for (const spot of plan.parkingSpots) assert.equal(pointInRing(base.ring, spot.x, spot.z), false);
  for (const edge of plan.pedestrianGraph.edges) {
    for (let i = 0; i < edge.points.length; i += 2) assert.equal(pointInRing(base.ring, edge.points[i], edge.points[i + 1]), false);
  }
});

test('the plan is the same on every build and builds for other seeds', () => {
  assert.equal(generateCityPlan(createSeededRandom('1')).digest, plan.digest);
  for (const seed of ['marazul', '7']) {
    const other = generateCityPlan(createSeededRandom(seed));
    const runways = other.specialAreas.filter((area) => area.kind === 'runway');
    assert.equal(runways[runways.length - 1].id, 'runway_punta_garza');
    assert.ok(Math.abs(other.heightAt(layout.runway.x0, layout.runway.z0) - Y) < 0.02);
  }
});

test('boat lanes keep clear of the causeway', () => {
  for (const lane of plan.boatLanes) {
    for (let i = 0; i < lane.points.length; i += 2) {
      assert.equal(pointInRing(base.ring, lane.points[i], lane.points[i + 1]), false);
      if (i > 0) assert.equal(pointInRing(base.ring, (lane.points[i] + lane.points[i - 2]) / 2, (lane.points[i + 1] + lane.points[i - 1]) / 2), false);
    }
  }
  assert.ok(plan.boatLanes.some((lane) => lane.roundAirBase));
});

test('the fence, the posts and everything placed stand on the pad', () => {
  assert.ok(layout.fence.panels.length > 200);
  for (const panel of layout.fence.panels) {
    assert.ok(isOnAirBasePad(panel.x, panel.z), `panel at ${panel.x}, ${panel.z}`);
    assert.ok(Math.abs(panel.stretch - 1) < 0.08);
    assert.ok(Math.abs(plan.heightAt(panel.x, panel.z) - Y) < 0.25);
  }
  for (const post of PUNTA_GARZA_AIR_BASE.posts) {
    const { x, z } = puntaGarzaToWorld(...post.at);
    assert.ok(isOnAirBasePad(x, z), post.id);
    assert.ok(Math.abs(plan.heightAt(x, z) - Y) < 0.3, post.id);
  }
  for (const item of [...layout.shelters, ...layout.stands, layout.tower, ...layout.masts, ...layout.patrolRoute, ...layout.roadBlock, layout.visitorSpot]) {
    assert.ok(isOnAirBasePad(item.x, item.z));
    assert.ok(Math.abs(plan.heightAt(item.x, item.z) - Y) < 0.02);
  }
  // Eight round the apron and one by the walkway at the west end of the Halcón line.
  assert.equal(layout.masts.length, 9);
  assert.equal(layout.shelters.length, 4);
});

// The port's crane rails fit set_port's quay_crane (legs at z = +-15.24, a 30.48 m gauge): the
// waterside rail 2.5 m in from the quay edge, on the wall's top, the landside one 32.98 m in, on
// the apron or the pavement of Ribera del Tamarindo, never on its lanes; the paved apron reaches
// 36 m in, and every length of rail sits on what is under it (not floating, not buried).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSeededRandom } from '../../../game/src/core/random/seededRandom.js';
import { generateCityPlan } from '../../../game/src/world/plan/cityPlanGenerator.js';
import { projectOnPolyline } from '../../../game/src/world/plan/planGeometry.js';
import { planWaterfrontPieces } from '../../../game/src/world/waterfront/waterfrontLayout.js';

const plan = generateCityPlan(createSeededRandom(1).fork('cityPlan'));
const quays = plan.specialAreas.filter((area) => area.kind === 'quay');

test('the port quay has a 36 m apron and rails 2.5 and 32.98 m in (30.48 m gauge)', () => {
  assert.ok(quays.length >= 1);
  for (const quay of quays) {
    assert.equal(quay.apronWidth, 36);
    assert.ok(Math.abs(quay.craneGauge - 30.48) < 1e-6);
    const [water, land] = quay.craneRails;
    let checked = 0;
    for (const [rail, want] of [[water, 2.5], [land, 32.98]]) {
      for (let i = 2; i + 3 < rail.length; i += 2) {
        const hit = projectOnPolyline(quay.edge, rail[i], rail[i + 1]);
        if (hit.along < 40 || hit.along > quay.length - 40) continue; // corners of the offset
        assert.ok(Math.abs(hit.distance - want) < 0.6, `rail ${want} m at ${hit.along | 0}: ${hit.distance.toFixed(2)}`);
        checked += 1;
      }
    }
    assert.ok(checked > 4);
  }
});

test('every length of crane rail sits on the ground under it, off the carriageway', () => {
  const rails = planWaterfrontPieces(plan).filter((piece) => piece.kind === 'rail');
  assert.ok(rails.length > 40);
  for (const piece of rails) {
    const x = (piece.ax + piece.bx) / 2;
    const z = (piece.az + piece.bz) / 2;
    assert.ok(plan.shoreDistanceAt(x, z) > 0, 'on land');
    const top = piece.y + 0.1;
    const ground = plan.heightAt(x, z);
    if (plan.shoreDistanceAt(x, z) > 6) assert.ok(top - ground > -0.02 && top - ground < 0.25, `rail top ${top.toFixed(2)} on ground ${ground.toFixed(2)}`);
    const road = plan.nearestRoad(x, z, 20);
    if (road) assert.ok(road.distance > road.segment.halfWidth, `rail on the lanes of ${road.segment.key}`);
  }
});

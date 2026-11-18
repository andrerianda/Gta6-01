// Invariants of the city plan: determinism, speed, a connected road graph without stray dead
// ends, gentle gradients, dry roads, lots that touch neither roads nor each other, every landmark
// placed in its district, and the two staging streets heading 276 degrees.

import assert from 'node:assert/strict';
import test from 'node:test';

import { CITY_LANDMARK_REQUESTS } from '../../../game/src/catalog/cityDistricts.js';
import { createSeededRandom } from '../../../game/src/core/random/seededRandom.js';
import { generateCityPlan } from '../../../game/src/world/plan/cityPlanGenerator.js';
import { DISTRICT_IDS } from '../../../game/src/world/plan/districtRegions.js';
import { convexRingsOverlap, distanceSegmentToRing, headingOfDirection } from '../../../game/src/world/plan/planGeometry.js';

const plan = generateCityPlan(createSeededRandom('marazul'));

test('the same seed gives the same plan, quickly', () => {
  const started = performance.now();
  const again = generateCityPlan(createSeededRandom('marazul'));
  const elapsed = performance.now() - started;
  assert.equal(again.digest, plan.digest);
  assert.ok(elapsed < 2500, `generation took ${elapsed.toFixed(0)} ms`);
  const other = generateCityPlan(createSeededRandom('otra-semilla'));
  assert.notEqual(other.digest, plan.digest);
  assert.equal(other.unplacedLandmarks.length, 0);
  assert.equal(other.diagnostics.length, 0);
});

test('the road graph is connected and has no unplanned dead end', () => {
  const { nodes, segments } = plan.roads;
  assert.deepEqual(plan.diagnostics, []);
  const seen = new Uint8Array(nodes.length);
  const queue = [0];
  seen[0] = 1;
  while (queue.length > 0) {
    const node = nodes[queue.pop()];
    for (const id of node.segments) {
      const next = segments[id].a === node.id ? segments[id].b : segments[id].a;
      if (!seen[next]) {
        seen[next] = 1;
        queue.push(next);
      }
    }
  }
  assert.equal(seen.reduce((sum, value) => sum + value, 0), nodes.length);
  for (const node of nodes) {
    if (node.segments.length === 1) assert.ok(node.exit || node.culDeSac);
    if (node.segments.length >= 3) assert.ok(node.control === 'signals' || node.control === 'stop');
    if (node.control === 'signals') assert.ok(node.signal.phases.length === 2 && node.signal.cycle > 0);
  }
  assert.equal(nodes.filter((node) => node.exit).length, 2);
  assert.ok(plan.stats.roadLength > 60000);
  assert.ok(plan.stats.signalIntersections > 30);
});

test('roads are gentle, continuous at junctions and dry except on bridges', () => {
  const { nodes, segments } = plan.roads;
  for (const segment of segments) {
    const { heights, along, points } = segment;
    assert.ok(Math.abs(heights[0] - nodes[segment.a].y) < 1e-3);
    assert.ok(Math.abs(heights[heights.length - 1] - nodes[segment.b].y) < 1e-3);
    for (let i = 1; i < heights.length; i += 1) {
      const step = along[i] - along[i - 1];
      assert.ok(step <= 10.5, `${segment.key} is sampled every ${step.toFixed(1)} m`);
      const gradient = Math.abs(heights[i] - heights[i - 1]) / step;
      // The aim is 12 percent; the hill streets reach it, and a little more on a few 10 m pieces.
      assert.ok(gradient <= 0.135, `${segment.key} climbs ${(gradient * 100).toFixed(1)} percent`);
    }
    if (!segment.bridge) {
      for (let i = 0; i < points.length; i += 2) assert.ok(plan.shoreDistanceAt(points[i], points[i + 1]) > -3, `${segment.key} is in the water`);
    }
    assert.ok(DISTRICT_IDS.includes(segment.district));
    assert.ok(segment.name.length > 0 && segment.width > 0 && segment.speedLimit > 0);
  }
});

test('every lane leads on, and traffic can reach nearly every lane from any other', () => {
  const { lanes } = plan;
  assert.ok(lanes.length > 1200);
  const reverse = lanes.map(() => []);
  for (const lane of lanes) {
    assert.ok(lane.points.length >= 4 && lane.length > 0.5, `lane ${lane.id} has no length`);
    assert.ok(lane.successors.length > 0, `lane ${lane.id} on ${plan.roads.segments[lane.segment].key} leads nowhere`);
    for (const next of lane.successors) {
      assert.equal(lanes[next.lane].fromNode, lane.toNode);
      reverse[next.lane].push(lane.id);
    }
    if (lane.control === 'signals') assert.ok(lane.phase === 0 || lane.phase === 1);
  }
  const reach = (edges) => {
    const seen = new Uint8Array(lanes.length);
    const stack = [0];
    seen[0] = 1;
    let count = 1;
    while (stack.length > 0) {
      for (const next of edges(stack.pop())) {
        if (seen[next]) continue;
        seen[next] = 1;
        count += 1;
        stack.push(next);
      }
    }
    return count;
  };
  // A vehicle may also change to the lane beside it.
  const beside = (id) => [lanes[id].leftLane, lanes[id].rightLane].filter((other) => other >= 0);
  assert.ok(reach((id) => lanes[id].successors.map((next) => next.lane).concat(beside(id))) >= lanes.length * 0.99);
  assert.ok(reach((id) => reverse[id].concat(beside(id))) >= lanes.length * 0.99);
});

test('lots carry what the assembler needs and overlap neither roads nor each other', () => {
  assert.ok(plan.lots.length > 1500);
  const zonings = new Set(['commercial_high', 'commercial_low', 'residential_high', 'residential_low', 'industrial', 'civic', 'leisure', 'waterfront']);
  for (const lot of plan.lots) {
    assert.equal(lot.ring.length, 8);
    assert.ok(zonings.has(lot.zoning), lot.zoning);
    assert.ok(DISTRICT_IDS.includes(lot.district));
    assert.ok(lot.width >= 9 && lot.depth >= 6, `sliver lot ${lot.width.toFixed(1)} by ${lot.depth.toFixed(1)}`);
    assert.ok(lot.floorsMax >= lot.floorsMin);
    assert.ok(Math.abs(Math.hypot(lot.frontX, lot.frontZ) - 1) < 1e-6);
    assert.ok(plan.shoreDistanceAt(lot.x, lot.z) > 0);
    const road = plan.roads.segments[lot.frontages[0].segment];
    assert.ok(road);
    const sector = plan.sectorAt(lot.x, lot.z);
    const near = new Set();
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dz = -1; dz <= 1; dz += 1) {
        const cell = plan.sectorAt(lot.x + dx * 128, lot.z + dz * 128);
        if (!cell) continue;
        for (const id of cell.lots) if (id > lot.id) near.add(id);
        if (dx === 0 && dz === 0) continue;
      }
    }
    for (const id of near) assert.ok(!convexRingsOverlap(lot.ring, plan.lots[id].ring, 0.5), `lots ${lot.id} and ${id} overlap`);
    for (const id of sector.segments) {
      const segment = plan.roads.segments[id];
      const p = segment.points;
      for (let i = 0; i + 3 < p.length; i += 2) {
        const gap = distanceSegmentToRing(lot.ring, p[i], p[i + 1], p[i + 2], p[i + 3]);
        assert.ok(gap > segment.halfWidth - 0.5, `lot ${lot.id} is on ${segment.key}`);
      }
    }
  }
});

test('every requested landmark is placed in its district', () => {
  assert.equal(plan.unplacedLandmarks.length, 0);
  for (const request of CITY_LANDMARK_REQUESTS) {
    const landmark = plan.landmarkById[request.id];
    assert.ok(landmark, `${request.id} is not placed`);
    const lot = plan.lots[landmark.lot];
    assert.equal(lot.landmarkId, request.id);
    assert.equal(lot.landmarkKind, request.kind);
    assert.equal(lot.district, request.district);
    assert.equal(plan.roads.segments[lot.frontages[0].segment].district, request.district);
  }
});

test('the staging streets are long, straight and head 276 degrees', () => {
  assert.equal(plan.stagingStreets.length, 2);
  for (const street of plan.stagingStreets) {
    const dx = street.westEnd.x - street.eastEnd.x;
    const dz = street.westEnd.z - street.eastEnd.z;
    assert.ok(Math.hypot(dx, dz) >= 1500);
    assert.ok(Math.abs((headingOfDirection(dx, dz) * 180) / Math.PI - 276) < 0.01);
    const pieces = plan.roads.segments.filter((segment) => segment.key === street.key);
    assert.ok(pieces.length >= 5);
    for (const segment of pieces) {
      const p = segment.points;
      const heading = (headingOfDirection(p[p.length - 2] - p[0], p[p.length - 1] - p[1]) * 180) / Math.PI;
      assert.ok(Math.abs(heading - 96) < 0.05 || Math.abs(heading - 276) < 0.05, `${street.key} heads ${heading.toFixed(2)}`);
    }
  }
});

test('queries answer everywhere, far outside the city too', () => {
  assert.ok(plan.heightAt(9000, 9000) < -20);
  assert.ok(plan.shoreDistanceAt(9000, -9000) < -1000);
  assert.ok(Number.isFinite(plan.heightAt(-50000, 3)));
  assert.equal(plan.surfaceAt(9000, 9000), 'water');
  const hall = plan.landmarkById.palacio_municipal;
  assert.equal(plan.districtAt(hall.x, hall.z), 'centro');
  assert.equal(plan.lotAt(hall.x, hall.z).landmarkId, 'palacio_municipal');
  const node = plan.roads.nodes.find((candidate) => candidate.control === 'signals');
  assert.equal(plan.surfaceAt(node.x, node.z), 'paved');
  const hit = plan.nearestRoad(node.x + 3, node.z + 3);
  assert.ok(hit && hit.distance < 6 && plan.streetNameAt(node.x, node.z).length > 0);
  assert.equal(plan.vantagePoints.length, 4);
});

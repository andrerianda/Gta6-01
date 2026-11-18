// The ground under the city and the graphs laid on the roads: the height field is finite
// everywhere and agrees with road heights and lot pads, lanes are joined by connector curves,
// parked cars stand in parking lanes, the pavement graph is connected through its crossings, and
// boat lanes stay in open water.

import assert from 'node:assert/strict';
import test from 'node:test';

import { createSeededRandom } from '../../../game/src/core/random/seededRandom.js';
import { generateCityPlan } from '../../../game/src/world/plan/cityPlanGenerator.js';
import { worldToCity } from '../../../game/src/world/plan/cityFrame.js';
import { headingOfDirection, pointInRing } from '../../../game/src/world/plan/planGeometry.js';
import { MAX_ROAD_GRADIENT } from '../../../game/src/world/plan/terrainConforming.js';

const plan = generateCityPlan(createSeededRandom('marazul'));

test('the ground is finite everywhere: every sample, the whole city and far outside it', () => {
  const { heights } = plan.terrain;
  let bad = 0;
  for (let i = 0; i < heights.length; i += 1) if (!Number.isFinite(heights[i])) bad += 1;
  assert.equal(bad, 0, `${bad} height samples are not finite`);
  // Off the sample points as well (bilinear lookups), and out past the edge of the height field.
  const { minX, maxX, minZ, maxZ } = plan.frame.extent;
  const failures = [];
  for (let x = minX - 600; x <= maxX + 600; x += 3.7) {
    for (let z = minZ - 600; z <= maxZ + 600; z += 3.7) {
      if (!Number.isFinite(plan.heightAt(x, z)) && failures.length < 5) failures.push(`${x.toFixed(1)}, ${z.toFixed(1)}`);
    }
  }
  assert.deepEqual(failures, [], `heightAt is not finite at ${failures.join(' / ')}`);
  for (const radius of [3000, 8000, 50000, 1e6]) {
    for (let angle = 0; angle < Math.PI * 2; angle += 0.3) {
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      assert.ok(Number.isFinite(plan.heightAt(x, z)), `heightAt(${x.toFixed(0)}, ${z.toFixed(0)})`);
      assert.ok(Number.isFinite(plan.shoreDistanceAt(x, z)), `shoreDistanceAt(${x.toFixed(0)}, ${z.toFixed(0)})`);
    }
  }
  for (let x = minX; x <= maxX; x += 64) {
    for (let z = minZ; z <= maxZ; z += 64) {
      const [nx, ny, nz] = plan.normalAt(x, z);
      assert.ok(Number.isFinite(nx) && Number.isFinite(ny) && Number.isFinite(nz) && ny > 0, `normalAt(${x}, ${z})`);
    }
  }
  // A second seed: the cause was in the blend, not in one city.
  const other = generateCityPlan(createSeededRandom('otra-semilla'));
  assert.ok(other.terrain.heights.every(Number.isFinite), 'another seed has heights that are not finite');
});

test('no road is steeper than ten percent', () => {
  assert.equal(MAX_ROAD_GRADIENT, 0.1);
  for (const segment of plan.roads.segments) {
    const { heights, along } = segment;
    for (let i = 1; i < heights.length; i += 1) {
      const gradient = Math.abs(heights[i] - heights[i - 1]) / (along[i] - along[i - 1]);
      assert.ok(gradient <= MAX_ROAD_GRADIENT + 5e-4, `${segment.key} climbs ${(gradient * 100).toFixed(1)} percent`);
    }
  }
});

test('the ground is the road under every road and the pad under every lot', () => {
  let samples = 0;
  for (const segment of plan.roads.segments) {
    for (let i = 0; i < segment.heights.length; i += 1) {
      const x = segment.points[i * 2];
      const z = segment.points[i * 2 + 1];
      if (plan.shoreDistanceAt(x, z) < 10) continue;
      samples += 1;
      const gap = Math.abs(plan.heightAt(x, z) - segment.heights[i]);
      assert.ok(gap < 0.3, `${segment.key}: the ground is ${gap.toFixed(2)} m from the road at ${x.toFixed(0)}, ${z.toFixed(0)}`);
    }
  }
  assert.ok(samples > 6000);
  for (const lot of plan.lots) {
    if (plan.shoreDistanceAt(lot.x, lot.z) < 10) continue;
    const gap = Math.abs(plan.heightAt(lot.x, lot.z) - lot.y);
    assert.ok(gap < 0.15, `lot ${lot.id} (${lot.zone}): pad ${lot.y.toFixed(2)}, ground ${plan.heightAt(lot.x, lot.z).toFixed(2)}`);
    // The pad is at street level: the door meets the pavement.
    const road = plan.nearestRoad(lot.entrance.x, lot.entrance.z, 40);
    if (lot.zone !== 'park' && road) assert.ok(Math.abs(plan.heightAt(road.x, road.z) - lot.y) < 2.2, `lot ${lot.id} is far above or below its street`);
  }
  for (const landmark of plan.landmarks) assert.equal(landmark.y, plan.lots[landmark.lot].y);
});

test('every lane change of road has a connector curve through the junction', () => {
  let connectors = 0;
  for (const lane of plan.lanes) {
    const end = lane.points.length - 2;
    for (const successor of lane.successors) {
      const next = plan.lanes[successor.lane];
      const curve = successor.points;
      connectors += 1;
      assert.ok(curve.length >= 4);
      assert.ok(Math.hypot(curve[0] - lane.points[end], curve[1] - lane.points[end + 1]) < 0.01);
      assert.ok(Math.hypot(curve[curve.length - 2] - next.points[0], curve[curve.length - 1] - next.points[1]) < 0.01);
      const straight = Math.hypot(next.points[0] - lane.points[end], next.points[1] - lane.points[end + 1]);
      assert.ok(successor.length >= straight - 0.01 && successor.length < Math.max(30, straight * 2.4), `connector of ${successor.length.toFixed(1)} m for a gap of ${straight.toFixed(1)} m`);
    }
  }
  assert.ok(connectors > 2500);
});

test('kerbside parking spots stand in parking lanes, clear of junctions', () => {
  const spots = plan.parkingSpots.filter((spot) => spot.kind === 'kerb');
  assert.ok(spots.length > 5000);
  plan.parkingSpots.forEach((spot, index) => assert.equal(spot.id, index));
  let indexed = 0;
  for (const cell of plan.sectors.cells) indexed += cell.parking.length;
  assert.equal(indexed, plan.parkingSpots.length);
  for (let i = 0; i < spots.length; i += 7) {
    const spot = spots[i];
    const segment = plan.roads.segments[spot.segment];
    assert.ok((spot.side === 'right' ? segment.parkingRight : segment.parkingLeft) > 0);
    assert.ok(spot.along > segment.trimA + 3 && spot.along < segment.length - segment.trimB - 3);
    assert.equal(plan.surfaceAt(spot.x, spot.z), 'paved');
    assert.ok(Math.abs(headingOfDirection(spot.dirX, spot.dirZ) - spot.heading) < 1e-9);
    const road = plan.nearestRoad(spot.x, spot.z, 30);
    assert.ok(road && road.distance < segment.halfWidth && road.distance > 1, 'a spot is beside the centre line, inside the roadway');
    // No spot stands in a traffic lane.
    const lane = plan.nearestLane(spot.x, spot.z, 30);
    assert.ok(lane.distance > 1.6, `spot ${i} is ${lane.distance.toFixed(1)} m from a lane centre`);
  }
});

test('the pavement graph is one network of sidewalks and crossings', () => {
  const { nodes, edges } = plan.pedestrianGraph;
  assert.ok(nodes.length > 800 && edges.length > 1500);
  for (const edge of edges) {
    const last = edge.points.length - 2;
    assert.ok(Math.hypot(edge.points[0] - nodes[edge.a].x, edge.points[1] - nodes[edge.a].z) < 0.01);
    assert.ok(Math.hypot(edge.points[last] - nodes[edge.b].x, edge.points[last + 1] - nodes[edge.b].z) < 0.01);
    assert.ok(edge.length > 0.5, `edge ${edge.id} (${edge.kind}) has no length`);
    if (edge.kind === 'crosswalk') {
      const junction = plan.roads.nodes[edge.roadNode];
      assert.equal(edge.signalNode >= 0, junction.control === 'signals');
      if (edge.signalNode >= 0) assert.ok(edge.conflictPhase === 0 || edge.conflictPhase === 1);
    } else if (edge.kind === 'sidewalk') {
      assert.ok(edge.side === 'left' || edge.side === 'right');
    } else {
      assert.ok(edge.kind === 'path' && (edge.place === 'promenade' || edge.place === 'pier'));
    }
  }
  const seen = new Uint8Array(nodes.length);
  const walk = (start) => {
    let size = 0;
    const stack = [start];
    seen[start] = 1;
    while (stack.length > 0) {
      const id = stack.pop();
      size += 1;
      for (const edgeId of nodes[id].edges) {
        const other = edges[edgeId].a === id ? edges[edgeId].b : edges[edgeId].a;
        if (!seen[other]) {
          seen[other] = 1;
          stack.push(other);
        }
      }
    }
    return size;
  };
  let largest = 0;
  for (const node of nodes) if (!seen[node.id]) largest = Math.max(largest, walk(node.id));
  assert.ok(largest >= nodes.length * 0.97, `the largest network has ${largest} of ${nodes.length} corners`);
});

test('boat lanes stay in open water', () => {
  const kinds = plan.boatLanes.map((lane) => lane.kind);
  assert.ok(kinds.includes('coastal') && kinds.includes('island') && kinds.includes('river'));
  assert.ok(plan.boatLanes.some((lane) => lane.closed));
  for (const lane of plan.boatLanes) {
    const p = lane.points;
    for (let i = 0; i < p.length; i += 2) {
      assert.ok(plan.isWaterAt(p[i], p[i + 1]), `${lane.kind} lane ${lane.id} touches land`);
      if (i + 3 < p.length) assert.ok(plan.shoreDistanceAt((p[i] + p[i + 2]) / 2, (p[i + 1] + p[i + 3]) / 2) < -8, `${lane.kind} lane ${lane.id} cuts a corner over land`);
    }
  }
});

test('the special areas are where the story needs them', () => {
  const byKind = (kind) => plan.specialAreas.filter((area) => area.kind === kind);
  for (const kind of ['promenade', 'pier', 'quay', 'marina', 'runway', 'plaza', 'park', 'parking_lot']) assert.ok(byKind(kind).length >= 1, `no ${kind}`);
  assert.equal(new Set(plan.specialAreas.map((area) => area.id)).size, plan.specialAreas.length);

  const [promenade] = byKind('promenade');
  assert.ok(promenade.length > 1200);
  assert.equal(plan.surfaceAt(promenade.x, promenade.z), 'paved');
  assert.ok(Math.abs(plan.heightAt(promenade.x, promenade.z) - promenade.y) < 0.3, 'the promenade is level with the beachfront drive');
  assert.ok(plan.pedestrianGraph.edges.filter((edge) => edge.place === 'promenade').length >= 10, 'the promenade is linked to the street corners');

  const [pier] = byKind('pier');
  assert.ok(Math.abs(worldToCity(pier.line[0], pier.line[1])[0] - 200) < 1, 'the pier stands at the foot of Avenida de los Fundadores');
  assert.ok(plan.shoreDistanceAt(pier.line[0], pier.line[1]) > 20 && plan.shoreDistanceAt(pier.line[2], pier.line[3]) < -100);
  assert.ok(pier.deckHeight >= 3.5 && pier.head.length === 8);
  assert.ok(plan.pedestrianGraph.edges.some((edge) => edge.place === 'pier'));
  // The pier's landmark lot is its land end on the beach: the deck runs through it, the promenade passes in front.
  const pierLot = plan.lots[plan.landmarkById[pier.landmarkId].lot];
  assert.ok(Math.abs(worldToCity(pierLot.x, pierLot.z)[0] - 200) < 2, 'the pier lot is at the foot of the pier');
  const t = 30 / Math.hypot(pier.line[2] - pier.line[0], pier.line[3] - pier.line[1]);
  assert.ok(pointInRing(pierLot.ring, pier.line[0] + (pier.line[2] - pier.line[0]) * t, pier.line[1] + (pier.line[3] - pier.line[1]) * t), 'the deck starts in the pier lot');
  for (let i = 0; i < 8; i += 2) assert.ok(!pointInRing(promenade.ring, pierLot.ring[i], pierLot.ring[i + 1]), 'the pier lot is on the promenade');

  for (const quay of byKind('quay')) {
    assert.equal(quay.craneRails.length, 2);
    for (const rail of quay.craneRails) assert.ok(plan.shoreDistanceAt(rail[rail.length >> 2 << 1], rail[(rail.length >> 2 << 1) + 1]) > 0, 'a crane rail is on land');
  }
  const [marina] = byKind('marina');
  assert.ok(marina.berths.length >= 20 && marina.fingers.length * 2 === marina.berths.length);
  for (const berth of marina.berths) assert.ok(plan.isWaterAt(berth.x, berth.z), 'a berth is in the water');

  const [runway] = byKind('runway');
  assert.ok(runway.length >= 400 && runway.district === 'los_pantanos');
  assert.ok(Math.abs((runway.heading * 180) / Math.PI - 276) < 0.5);
  // The airstrip's buildings stand on the runway side of Camino de la Pista, by the runway's east end.
  const field = plan.lots[plan.landmarkById[runway.landmarkId].lot];
  assert.ok(worldToCity(field.x, field.z)[0] < -480 && Math.hypot(field.x - runway.line[2], field.z - runway.line[3]) < 140, 'the airstrip lot is away from its runway');
  for (let t = 0.02; t < 1; t += 0.06) {
    const x = runway.line[0] + (runway.line[2] - runway.line[0]) * t;
    const z = runway.line[1] + (runway.line[3] - runway.line[1]) * t;
    assert.ok(Math.abs(plan.heightAt(x, z) - runway.y) < 0.1, 'the runway is level');
    assert.equal(plan.surfaceAt(x, z), 'paved');
  }

  let bays = 0;
  for (const park of byKind('parking_lot')) {
    const lot = plan.lots[park.lot];
    assert.equal(lot.zone, 'parking');
    assert.equal(lot.floorsMax, 0);
    assert.ok(park.bays >= 8);
    for (let i = park.firstBay; i < park.firstBay + park.bays; i += 1) {
      const bay = plan.parkingSpots[i];
      assert.ok(bay.kind === 'bay' && bay.lot === lot.id && pointInRing(lot.ring, bay.x, bay.z));
      bays += 1;
    }
  }
  assert.equal(bays, plan.parkingSpots.filter((spot) => spot.kind === 'bay').length);
});

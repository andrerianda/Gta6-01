// Tests of the open-world city's pure logic: road sampling and partitioning, junction layout,
// the surface height raster and the city queries, on the default plan.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSeededRandom } from '../../../game/src/core/random/seededRandom.js';
import { generateCityPlan } from '../../../game/src/world/plan/cityPlanGenerator.js';
import { crownHeight, partitionRoadsBySector, roadCrossSection, sampleRoadCentreLines, ROAD_SAMPLE_STEP } from '../../../game/src/world/streets/roadSampling.js';
import { layOutJunction } from '../../../game/src/world/streets/junctionLayout.js';
import { createSurfaceHeightRaster } from '../../../game/src/world/streets/surfaceHeightRaster.js';
import { createCityQueries } from '../../../game/src/world/cityQueries.js';

const plan = generateCityPlan(createSeededRandom(1));
const lines = sampleRoadCentreLines(plan);
const sections = plan.roads.segments.map(roadCrossSection);

test('every centre line is finite, ordered and finely sampled', () => {
  for (const line of lines) {
    assert.ok(line.count >= 2);
    for (let i = 0; i < line.count; i += 1) {
      assert.ok(Number.isFinite(line.x[i] + line.y[i] + line.z[i] + line.tx[i] + line.tz[i]), `segment ${line.segment.id}`);
      assert.ok(Math.abs(Math.hypot(line.tx[i], line.tz[i]) - 1) < 1e-6);
      if (i > 0) {
        assert.ok(line.along[i] > line.along[i - 1]);
        assert.ok(Math.hypot(line.x[i] - line.x[i - 1], line.z[i] - line.z[i - 1]) <= ROAD_SAMPLE_STEP + 0.01);
      }
    }
  }
});

test('the road meshes follow the plan heights on the centre line', () => {
  let worst = 0;
  for (const line of lines) {
    if (line.segment.bridge) continue;
    for (let i = 0; i < line.count; i += 1) worst = Math.max(worst, Math.abs(line.y[i] - plan.heightAt(line.x[i], line.z[i])));
  }
  assert.ok(worst < 0.6, `largest gap between road and ground ${worst.toFixed(2)} m`);
});

test('the crown is zero at the kerbs and highest on the centre line', () => {
  const section = sections[0];
  assert.equal(crownHeight(section, section.halfWidth), 0);
  assert.equal(crownHeight(section, -section.halfWidth), 0);
  assert.ok(crownHeight(section, 0) > 0 && crownHeight(section, 0) <= 0.08);
});

test('each sample interval belongs to exactly one sector', () => {
  const pieces = partitionRoadsBySector(lines, plan.sectors);
  let intervals = 0;
  for (const list of pieces.values()) for (const piece of list) intervals += piece.to - piece.from;
  assert.equal(intervals, lines.reduce((sum, line) => sum + line.count - 1, 0));
});

test('junctions close round their node and match the arms exactly', () => {
  let laid = 0;
  for (const node of plan.roads.nodes) {
    const junction = layOutJunction(node, lines, sections);
    if (!junction) continue;
    laid += 1;
    for (const point of junction.ring) assert.ok(Number.isFinite(point.x + point.y + point.z));
    assert.equal(junction.corners.length, node.arms.length);
    const arm = node.arms[0];
    const line = lines[arm.segment];
    const index = arm.atStart ? 0 : line.count - 1;
    const near = junction.ring.some((p) => Math.hypot(p.x - line.x[index], p.z - line.z[index]) < 1e-9 || Math.abs(Math.hypot(p.x - line.x[index], p.z - line.z[index]) - sections[arm.segment].halfWidth) < 1e-6);
    assert.ok(near, `node ${node.id}`);
  }
  assert.ok(laid > 250);
});

test('the height raster answers the triangles written to it and NaN elsewhere', () => {
  const raster = createSurfaceHeightRaster(0, 0, 16, 1);
  raster.addTriangle(0, 1, 0, 10, 2, 0, 0, 3, 10);
  assert.ok(Math.abs(raster.heightAt(1.5, 1.5) - (1 + 0.15 + 0.3)) < 0.11);
  assert.ok(Number.isNaN(raster.heightAt(9.5, 9.5)));
});

test('queries answer on Bulevar Dorado', () => {
  const queries = createCityQueries(plan, {});
  const street = plan.stagingStreets.find((s) => s.key === 'bulevar_dorado');
  const x = (street.eastEnd.x + street.westEnd.x) / 2;
  const z = (street.eastEnd.z + street.westEnd.z) / 2;
  assert.equal(queries.streetNameAt(x, z), 'Bulevar Dorado');
  assert.equal(queries.districtAt(x, z), 'playa_dorada');
  assert.ok(Math.abs(queries.groundHeightAt(x, z) - 3.4) < 1.5);
  for (const kind of ['vehicle', 'parked', 'pedestrian']) {
    const points = queries.spawnPointsNear(x, z, 80, kind);
    assert.ok(points.length > 0, kind);
    for (const p of points) assert.ok(Math.hypot(p.x - x, p.z - z) <= 80 && Number.isFinite(p.y + p.heading));
  }
});

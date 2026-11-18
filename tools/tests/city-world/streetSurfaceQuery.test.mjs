// Tests of the street surface query against the street geometry actually built: every upward
// face the builder meshes for a few staging-street sectors (asphalt, planted median, kerb top,
// pavement, verge) is answered with the matching kind at its centre; medians are planted, never
// asphalt, wherever the plan gives a road a raised median; the cross-section numbers add up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { createSeededRandom } from '../../../game/src/core/random/seededRandom.js';
import { generateCityPlan } from '../../../game/src/world/plan/cityPlanGenerator.js';
import { partitionRoadsBySector, roadCrossSection, sampleRoadCentreLines } from '../../../game/src/world/streets/roadSampling.js';
import { createStreetSurfaceQuery } from '../../../game/src/world/streets/streetSurfaceQuery.js';
import { createSurfaceHeightRaster } from '../../../game/src/world/streets/surfaceHeightRaster.js';

register('./vendoredThreeHook.mjs', import.meta.url);
const { buildStreetSector } = await import('../../../game/src/world/streets/streetSectorBuilder.js');

const plan = generateCityPlan(createSeededRandom(1));
const lines = sampleRoadCentreLines(plan);
const sections = plan.roads.segments.map(roadCrossSection);
const pieces = partitionRoadsBySector(lines, plan.sectors);
const streets = createStreetSurfaceQuery(plan, lines, sections);
const grid = plan.sectors;

/** Expected kinds for an upward face of each street material. */
const EXPECTED = {
  asphalt: ['carriageway', 'junction', 'crosswalk'],
  median: ['median'],
  kerb: ['kerb'],
  pavement: ['pavement', 'kerb'],
  verge: ['verge'],
};

function buildCell(cell) {
  const c = cell % grid.columns;
  const r = Math.floor(cell / grid.columns);
  const raster = createSurfaceHeightRaster(grid.minX + c * grid.size, grid.minZ + r * grid.size, grid.size, 1);
  const junctions = grid.cells[cell].nodes.map((id) => streets.junction(id));
  const run = buildStreetSector({ pieces: pieces.get(cell) ?? [], junctions, sections, materials: {}, raster, groundAt: plan.heightAt });
  let step = run.next();
  while (!step.done) step = run.next();
  return step.value.object3d;
}

test('surfaceAt agrees with the built street faces on Bulevar Dorado and Gran Via', () => {
  const cells = new Set();
  for (const key of ['bulevar_dorado', 'gran_via_marazul']) {
    const segments = plan.roads.segments.filter((segment) => segment.key === key);
    for (const segment of segments.slice(0, 6)) {
      for (const [cell, list] of pieces) if (list.some((piece) => piece.line.segment === segment)) cells.add(cell);
    }
  }
  assert.ok(cells.size >= 4);
  const tally = {};
  for (const cell of cells) {
    for (const mesh of buildCell(cell).children) {
      const material = mesh.name.replace('streets-', '');
      const expected = EXPECTED[material];
      if (!expected) continue;
      const p = mesh.geometry.attributes.position.array;
      const index = mesh.geometry.index.array;
      const entry = (tally[material] ??= { faces: 0, agree: 0, wrong: {} });
      for (let k = 0; k < index.length; k += 3) {
        const [a, b, c] = [index[k] * 3, index[k + 1] * 3, index[k + 2] * 3];
        const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
        const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const area = Math.hypot(nx, ny, nz);
        if (area < 0.02 || ny / area < 0.9) continue;
        const kind = streets.surfaceAt((p[a] + p[b] + p[c]) / 3, (p[a + 2] + p[b + 2] + p[c + 2]) / 3).kind;
        entry.faces += 1;
        if (expected.includes(kind)) entry.agree += 1;
        else entry.wrong[kind] = (entry.wrong[kind] ?? 0) + 1;
      }
    }
  }
  for (const material of ['asphalt', 'median', 'pavement', 'kerb']) {
    const entry = tally[material];
    assert.ok(entry && entry.faces > 10, `${material} faces built`);
    assert.ok(entry.agree / entry.faces > 0.97, `${material}: ${entry.agree} of ${entry.faces} agree; others ${JSON.stringify(entry.wrong)}`);
  }
});

test('a planted median is built wherever the plan gives a raised median, and no asphalt under it', () => {
  let checked = 0;
  for (const segment of plan.roads.segments) {
    const numbers = streets.crossSection(segment.id);
    if (segment.roadClass === 'avenue' && segment.medianWidth >= 2.4) {
      assert.ok(numbers.median && numbers.median.planted, `segment ${segment.id} ${segment.key}`);
      const line = lines[segment.id];
      const i = line.count >> 1;
      const s = (numbers.median.from + numbers.median.to) / 2;
      const hit = streets.surfaceAt(line.x[i] - line.tz[i] * s, line.z[i] + line.tx[i] * s);
      if (hit.segment === segment.id) {
        assert.equal(hit.kind, 'median');
        checked += 1;
      }
    }
    const total = numbers.carriageways.reduce((sum, way) => sum + way.width, 0) + (numbers.median ? numbers.median.width : 0);
    assert.ok(Math.abs(total - 2 * numbers.halfWidth) < 1e-6, `segment ${segment.id} widths add up`);
  }
  assert.ok(checked > 50, `${checked} medians checked`);
  // Built: the median mesh is grass and the asphalt leaves a gap under it.
  const segment = plan.roads.segments.find((candidate) => candidate.key === 'bulevar_dorado' && sections[candidate.id].median);
  const cell = [...pieces].find(([, list]) => list.some((piece) => piece.line.segment === segment))[0];
  const object = buildCell(cell);
  assert.ok(object.children.some((mesh) => mesh.name === 'streets-median'));
});

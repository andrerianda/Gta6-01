// Tests of the sector batches on real street sectors of the default plan: every sector's street
// meshes land in one batch per material, removing a sector frees its pieces, and the batches
// grow and compact as sectors stream in and out without losing a piece.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { createSeededRandom } from '../../../game/src/core/random/seededRandom.js';
import { generateCityPlan } from '../../../game/src/world/plan/cityPlanGenerator.js';
import { partitionRoadsBySector, roadCrossSection, sampleRoadCentreLines } from '../../../game/src/world/streets/roadSampling.js';
import { layOutJunction } from '../../../game/src/world/streets/junctionLayout.js';
import { createSurfaceHeightRaster } from '../../../game/src/world/streets/surfaceHeightRaster.js';

register('./vendoredThreeHook.mjs', import.meta.url);
const THREE = await import('three');
const { buildStreetSector } = await import('../../../game/src/world/streets/streetSectorBuilder.js');
const { createSectorMeshBatches } = await import('../../../game/src/world/streets/sectorMeshBatches.js');

const plan = generateCityPlan(createSeededRandom(1));
const grid = plan.sectors;
const lines = sampleRoadCentreLines(plan);
const sections = plan.roads.segments.map(roadCrossSection);
const piecesByCell = partitionRoadsBySector(lines, grid);
const material = (name) => new THREE.MeshStandardMaterial({ name });
const materials = Object.fromEntries(['asphalt', 'paving', 'kerb', 'median', 'concrete', 'verge', 'crosswalk'].map((n) => [n, material(n)]));

function buildCell(cell) {
  const column = cell % grid.columns;
  const row = Math.floor(cell / grid.columns);
  const raster = createSurfaceHeightRaster(grid.minX + column * grid.size, grid.minZ + row * grid.size, grid.size, 1);
  const junctions = grid.cells[cell].nodes.map((id) => layOutJunction(plan.roads.nodes[id], lines, sections));
  const job = buildStreetSector({ pieces: piecesByCell.get(cell) ?? [], junctions, sections, materials, raster, groundAt: plan.heightAt });
  let step = job.next();
  while (!step.done) step = job.next();
  return step.value;
}

test('sectors stream into one batch per material and give their pieces back', () => {
  const cells = [...piecesByCell.keys()].filter((cell) => (piecesByCell.get(cell) ?? []).length > 3).slice(0, 14);
  assert.ok(cells.length >= 10);
  const parent = new THREE.Group();
  const batches = createSectorMeshBatches(parent);
  const handles = new Map();
  let meshes = 0;
  const materialsSeen = new Set();
  for (const cell of cells) {
    const streets = buildCell(cell);
    streets.object3d.traverse((node) => { if (node.isMesh) { meshes += 1; materialsSeen.add(`${node.material.uuid}${node.castShadow}`); } });
    handles.set(cell, batches.add([streets.object3d]));
  }
  assert.equal(parent.children.length, materialsSeen.size, 'one batch per material and shadow setting');
  const pieces = () => batches.stats().reduce((sum, line) => sum + line.pieces, 0);
  assert.equal(pieces(), meshes);
  for (const line of batches.stats()) assert.ok(line.vertices <= line.capacity && line.vertices > 0);
  // Release half, stream them in again twice: nothing is lost, the room stays bounded.
  const half = cells.slice(0, 7);
  for (let round = 0; round < 2; round += 1) {
    for (const cell of half) batches.remove(handles.get(cell));
    for (const cell of half) handles.set(cell, batches.add([buildCell(cell).object3d]));
  }
  assert.equal(pieces(), meshes);
  for (const line of batches.stats()) assert.ok(line.capacity < line.vertices * 4 + 200000, `${line.name} room ${line.capacity} for ${line.vertices}`);
  for (const cell of cells) batches.remove(handles.get(cell));
  assert.equal(pieces(), 0);
  batches.dispose();
  assert.equal(parent.children.length, 0);
});

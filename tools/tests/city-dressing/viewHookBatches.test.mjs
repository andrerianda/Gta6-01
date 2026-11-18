// The city-wide near and far building batches follow the camera BEFORE the renderer projects
// the scene: after a teleport or a camera cut, the first frame must already hold the new
// sector's modelled level (a held showcase picture once showed the Bulevar with no buildings,
// because the batches were filled while projecting and drew one frame late). Two real sectors of
// the default city are built without assets (procedural facades), the camera jumps from one to
// the other, and only the scene's onBeforeRender runs, as WebGLRenderer.render calls it before
// it projects anything.
import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';

register('../city-world/vendoredThreeHook.mjs', import.meta.url);
const THREE = await import('three');
const { createSeededRandom, deriveSeed } = await import('../../../game/src/core/random/seededRandom.js');
const { generateCityPlan } = await import('../../../game/src/world/plan/cityPlanGenerator.js');
const { createCityDressing } = await import('../../../game/src/world/buildings/cityDressing.js');

const plan = generateCityPlan(createSeededRandom(deriveSeed(1, 'cityPlan')));
const grid = plan.sectors;

/** The sector input citySectors.js hands the dressing, for a grid cell. */
function sectorOf(cell) {
  const column = cell % grid.columns;
  const row = Math.floor(cell / grid.columns);
  const minX = grid.minX + column * grid.size;
  const minZ = grid.minZ + row * grid.size;
  const data = grid.cells[cell];
  return {
    id: cell,
    bounds: { minX, minZ, maxX: minX + grid.size, maxZ: minZ + grid.size },
    lots: data.lots.map((id) => plan.lots[id]),
    roads: data.segments.map((id) => plan.roads.segments[id]),
    intersections: data.nodes.map((id) => plan.roads.nodes[id]),
    specialAreas: [],
  };
}

/** Two built-up cells about 2 km apart. */
function pickCells() {
  const busy = [];
  for (let cell = 0; cell < grid.cells.length; cell += 1) if (grid.cells[cell].lots.length >= 6) busy.push(cell);
  const a = busy[Math.floor(busy.length / 3)];
  const centre = (cell) => [grid.minX + (cell % grid.columns + 0.5) * grid.size, grid.minZ + (Math.floor(cell / grid.columns) + 0.5) * grid.size];
  const [ax, az] = centre(a);
  const b = busy.find((cell) => { const [x, z] = centre(cell); return Math.hypot(x - ax, z - az) > 1500; });
  return { a, b, centre };
}

const piecesOf = (stats) => stats.reduce((sum, batch) => sum + batch.pieces, 0);

test('a camera jump moves the sectors between the near and far batches before projection', async () => {
  const dressing = createCityDressing({ plan, quality: { lodBias: 1 }, sliceMs: Infinity });
  const scene = new THREE.Scene();
  const layer = new THREE.Group();
  scene.add(layer);
  const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 3000);
  const { a, b, centre } = pickCells();
  assert.ok(a !== undefined && b !== undefined, 'two built-up cells');
  const parts = [];
  for (const cell of [a, b]) {
    const part = await dressing.buildSector(sectorOf(cell));
    layer.add(part.object3d);
    parts.push(part);
  }
  const look = (cell) => {
    const [x, z] = centre(cell);
    camera.position.set(x, 1.7, z);
    camera.lookAt(x + 10, 1.7, z);
    camera.updateMatrixWorld();
  };
  // The very first frame at sector a (a ?shot= picture): the systems update, then the renderer
  // calls the scene's onBeforeRender; no LOD has ever been projected.
  look(a);
  dressing.update();
  assert.notEqual(scene.onBeforeRender, THREE.Object3D.prototype.onBeforeRender, 'update() puts the hook on the scene');
  scene.onBeforeRender(null, scene, camera, null);
  const nearAtA = piecesOf(dressing.nearStats());
  const farAtA = piecesOf(dressing.farStats());
  assert.ok(nearAtA > 0, 'sector a shows its modelled level from the near batches');
  assert.ok(farAtA > 0, 'sector b shows its far level from the far batches');
  assert.ok(layer.getObjectByName('city_dressing_near') && layer.getObjectByName('city_dressing_far'), 'the batch roots hang in the layer');

  // Cut to sector b: only the pre-render hook runs (no LOD has been projected with this camera).
  look(b);
  scene.onBeforeRender(null, scene, camera, null);
  const nearAtB = dressing.nearStats();
  assert.ok(piecesOf(nearAtB) > 0, 'sector b is in the near batches on the first frame after the cut');
  assert.ok(piecesOf(dressing.farStats()) > 0, 'sector a went back to the far batches');
  // Every piece in the batches is one sector's level, never both levels of one sector.
  const nearPieces = parts.map((part) => part.stats.nearPieces);
  const farPieces = parts.map((part) => part.stats.farPieces);
  assert.equal(piecesOf(nearAtB), nearPieces[1], 'only sector b is near');
  assert.equal(piecesOf(dressing.farStats()), farPieces[0], 'only sector a is far');

  for (const part of parts) part.dispose();
  assert.equal(piecesOf(dressing.nearStats()) + piecesOf(dressing.farStats()), 0, 'disposed sectors leave the batches');
  dressing.dispose();
  assert.equal(scene.onBeforeRender, THREE.Object3D.prototype.onBeforeRender, 'the scene hook is removed');
});

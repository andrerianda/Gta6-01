// Tests of the scene cost census (MARAZUL.sceneCost): a BatchedMesh counts what its visible
// instances draw, not the vertex and index space it reserved (QA bug 12), and instances out of
// the view or hidden do not count; plain and instanced meshes keep their counts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

const vendoredThree = new URL('../../../game/vendor/three/three.module.min.js', import.meta.url).href;
register(`data:text/javascript,${encodeURIComponent(
  `export async function resolve(s, c, n) { return s === 'three' ? { url: ${JSON.stringify(vendoredThree)}, shortCircuit: true } : n(s, c); }`,
)}`);
const THREE = await import('three');
const { createSceneCostCensus } = await import('../../../game/src/core/diagnostics/sceneCostCensus.js');

function makeView() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.5, 2000);
  camera.position.set(0, 2, 10);
  camera.lookAt(0, 2, 0);
  camera.updateMatrixWorld();
  const world = new THREE.Group();
  scene.add(world);
  return { scene, camera, layers: { world } };
}

test('scene cost: a batched mesh counts its drawn ranges, not its reserved buffers', () => {
  const view = makeView();
  const box = new THREE.BoxGeometry(1, 1, 1); // 12 triangles
  const plane = new THREE.PlaneGeometry(1, 1); // 2 triangles
  const batch = new THREE.BatchedMesh(16, 20000, 60000, new THREE.MeshStandardMaterial());
  batch.name = 'batch';
  batch.castShadow = true;
  const boxId = batch.addGeometry(box);
  const planeId = batch.addGeometry(plane);
  const place = (geometryId, x, z) => {
    const id = batch.addInstance(geometryId);
    batch.setMatrixAt(id, new THREE.Matrix4().makeTranslation(x, 0, z));
    return id;
  };
  place(boxId, 0, 0);
  place(boxId, 2, 0);
  place(planeId, -2, 0);
  const hidden = place(boxId, 1, 1);
  batch.setVisibleAt(hidden, false);
  place(boxId, 0, 400); // behind the camera, and beyond the shadow reach
  view.layers.world.add(batch);

  const rows = createSceneCostCensus(view).take({ shadowDistance: 230 });
  const row = rows.find((r) => r.group === 'world/batch');
  assert.ok(row, 'the batch has a row');
  assert.equal(row.drawCalls, 1, 'one multi-draw call');
  assert.equal(row.triangles, 12 + 12 + 2, 'only the instances in view, by their geometry ranges');
  assert.equal(row.instances, 3);
  assert.equal(row.shadowCasters, 1);
  assert.equal(row.shadowTriangles, 26, 'hidden and far instances cast nothing');
});

test('scene cost: plain and instanced meshes keep their counts, an empty batch has no row', () => {
  const view = makeView();
  const plain = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  plain.name = 'plain';
  const instanced = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial(), 5);
  instanced.name = 'instanced';
  instanced.frustumCulled = false;
  const empty = new THREE.BatchedMesh(4, 100, 300, new THREE.MeshBasicMaterial());
  empty.name = 'empty';
  view.layers.world.add(plain, instanced, empty);

  const rows = createSceneCostCensus(view).take();
  const byGroup = Object.fromEntries(rows.map((r) => [r.group, r]));
  assert.equal(byGroup['world/plain'].triangles, 12);
  assert.equal(byGroup['world/instanced'].triangles, 10);
  assert.equal(byGroup['world/instanced'].instances, 5);
  assert.equal(byGroup['world/empty'], undefined);
});

test('scene cost: casters tagged near cast only within the near reach; far stand-ins are shadow only', () => {
  const view = makeView();
  const material = new THREE.MeshStandardMaterial();
  const box = new THREE.BoxGeometry(1, 1, 1); // 12 triangles
  // A group tagged 'near' (the tag is inherited): one box 30 m ahead, one 120 m ahead.
  const nearOnly = new THREE.Group();
  nearOnly.name = 'nearOnly';
  nearOnly.userData.shadowCascades = 'near';
  for (const z of [-20, -110]) {
    const mesh = new THREE.Mesh(box, material);
    mesh.castShadow = true;
    mesh.position.set(0, 0, z);
    nearOnly.add(mesh);
  }
  // A batched mesh tagged 'near' with the same two placements.
  const batch = new THREE.BatchedMesh(4, 100, 300, material);
  batch.name = 'nearBatch';
  batch.castShadow = true;
  batch.userData.shadowCascades = 'near';
  const boxId = batch.addGeometry(box);
  for (const z of [-20, -110]) batch.setMatrixAt(batch.addInstance(boxId), new THREE.Matrix4().makeTranslation(0, 0, z));
  // A far-cascade stand-in in view: no view draw, still a caster.
  const proxy = new THREE.Mesh(box, material);
  proxy.name = 'proxy';
  proxy.castShadow = true;
  proxy.userData.shadowCascades = 'far';
  proxy.position.set(0, 0, -50);
  view.layers.world.add(nearOnly, batch, proxy);
  view.scene.updateMatrixWorld(true);

  const rows = createSceneCostCensus(view).take({ shadowDistance: 230, nearShadowDistance: 62 });
  const byGroup = Object.fromEntries(rows.map((r) => [r.group, r]));
  assert.equal(byGroup['world/nearOnly'].drawCalls, 2, 'both boxes are in view');
  assert.equal(byGroup['world/nearOnly'].shadowCasters, 1, 'only the box within 62 m casts');
  assert.equal(byGroup['world/nearBatch'].triangles, 24);
  assert.equal(byGroup['world/nearBatch'].shadowTriangles, 12);
  assert.equal(byGroup['world/proxy'].drawCalls, 0, 'a shadow-only stand-in draws nothing in the view');
  assert.equal(byGroup['world/proxy'].shadowCasters, 1);

  const untagged = createSceneCostCensus(view);
  delete nearOnly.userData.shadowCascades;
  const plain = Object.fromEntries(untagged.take({ shadowDistance: 230 }).map((r) => [r.group, r]));
  assert.equal(plain['world/nearOnly'].shadowCasters, 2, 'without the tag both cast');
});

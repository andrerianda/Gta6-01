// The distant and far parked cars draw through the vehicle system's instanced batches: one draw
// call per model in view (whatever the number of cars), plus the shared far shape beyond
// FAR_PROXY_DISTANCE (one draw by day, two at night with its lamps); cars behind the camera are
// left out; the lamps of the model batches follow the night flag; nothing logs a console error.
import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';

register('../city-world/vendoredThreeHook.mjs', import.meta.url);
const THREE = await import('three');
const { FAR_PROXY_DISTANCE, NEAR_DETAIL_DISTANCE, createDistantTrafficBatches } = await import('../../../game/src/traffic/distantTrafficBatches.js');

// A stand-in vehicle asset: a body in paint, glass and head and tail lamps at every level.
function fakeAsset(id, length) {
  const model = new THREE.Group();
  const part = (name, w, h, d, y, z) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ name, color: 0xffffff }));
    mesh.position.set(0, y, z);
    model.add(mesh);
  };
  part('paint', 1.8, 0.9, length, 0.7, 0);
  part('glass', 1.6, 0.45, length * 0.45, 1.35, 0.2);
  part('lamp_head', 1.4, 0.12, 0.05, 0.75, -length / 2);
  part('lamp_tail', 1.4, 0.12, 0.05, 0.8, length / 2);
  return { id, lodCount: 3, instantiate: () => model.clone(), materials: new Map() };
}

const MODELS = ['family_sedan', 'sports_coupe', 'sport_motorcycle'];
const library = new Map(MODELS.map((id, i) => [id, fakeAsset(id, 4.6 - i)]));
const assets = { has: (id) => library.has(id), get: (id) => library.get(id) };

function viewCamera() {
  const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.5, 2000);
  camera.position.set(0, 2, 0);
  camera.lookAt(0, 2, -100);
  camera.updateMatrixWorld();
  return camera;
}

test('many cars of three models cost three draws plus the far shape', () => {
  const errors = [];
  const original = console.error;
  console.error = (...args) => errors.push(args.join(' '));
  try {
    const layer = new THREE.Group();
    const batches = createDistantTrafficBatches(assets, layer, 64);
    const colour = new THREE.Color('#c8281e');
    const frame = (night) => {
      batches.begin(viewCamera(), night);
      for (let i = 0; i < 60; i += 1) batches.add(MODELS[i % 3], (i % 5) * 3 - 6, 0, -NEAR_DETAIL_DISTANCE - 2 - i, 0, colour); // in view, < 120 m
      for (let i = 0; i < 30; i += 1) batches.add(MODELS[i % 3], 0, 0, -FAR_PROXY_DISTANCE - 20 - i * 5, Math.PI, colour); // far shape
      for (let i = 0; i < 12; i += 1) batches.add(MODELS[i % 3], 0, 0, 30 + i * 4, 0, colour); // behind the camera
      batches.end();
      return { ...batches.stats };
    };
    const day = frame(false);
    assert.equal(day.drawCalls, 3 + 1, `day draws ${day.drawCalls}`);
    assert.equal(day.farCars, 30);
    assert.equal(day.culled, 12, 'cars behind the camera are left out');
    assert.equal(day.cars, 60 + 30);
    const night = frame(true);
    assert.equal(night.drawCalls, 3 + 2, `night draws ${night.drawCalls}`);
    // Each model's batch carries the lamp flag per instance at night (bit 1), none by day.
    const meshes = [];
    layer.traverse((node) => node.isInstancedMesh && node.userData.looks && node.count > 0 && meshes.push(node));
    assert.equal(meshes.length, 3);
    for (const mesh of meshes) assert.equal(mesh.userData.looks.array[3], 1);
    batches.dispose();
  } finally {
    console.error = original;
  }
  assert.deepEqual(errors, []);
});

test('parked cars near the camera draw at the middle level, casting shadows', () => {
  const layer = new THREE.Group();
  const batches = createDistantTrafficBatches(assets, layer, 64);
  const colour = new THREE.Color('#2a6fb0');
  batches.begin(viewCamera(), false);
  for (let i = 0; i < 6; i += 1) batches.add(MODELS[i % 3], -4, 0, -8 - i * 6, 0, colour); // near: middle level
  for (let i = 0; i < 6; i += 1) batches.add(MODELS[i % 3], -4, 0, -NEAR_DETAIL_DISTANCE - 5 - i * 6, 0, colour); // far level
  batches.end();
  assert.equal(batches.stats.cars, 12);
  assert.equal(batches.stats.culled, 0);
  const meshes = [];
  layer.traverse((node) => node.isInstancedMesh && node.userData.looks && node.count > 0 && meshes.push(node));
  assert.equal(meshes.length, 6, 'one batch per model and level');
  assert.equal(meshes.filter((mesh) => mesh.castShadow).length, 3, 'the near level casts shadows');
  assert.equal(meshes.reduce((sum, mesh) => sum + mesh.count, 0), 12);
  batches.dispose();
});

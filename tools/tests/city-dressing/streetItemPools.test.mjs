// The city-wide street item pools: each item takes its level by its own distance, items moving
// between levels keep every pool dense and every remaining slot pointing at its own matrix, and
// only levels that end within the shadow-caster distance cast shadows.
import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';

register('../city-world/vendoredThreeHook.mjs', import.meta.url);
const THREE = await import('three');
const { createStreetItemPools, streetItemLevelAt, STREET_ITEM_LEVELS } = await import('../../../game/src/world/props/streetItemPools.js');

function fakeAssets() {
  const scene = new THREE.Group();
  for (const level of [0, 1, 2]) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    mesh.name = `lod${level}`;
    scene.add(mesh);
  }
  return { has: () => true, get: () => ({ scene }) };
}

function row(xs) {
  const matrices = new Float32Array(xs.length * 16);
  xs.forEach((x, i) => new THREE.Matrix4().makeTranslation(x, 0, 0).toArray(matrices, i * 16));
  return { source: { assetId: 'palm', object: null }, kind: 'plant', matrices, count: xs.length };
}

const poolCounts = (pools) => {
  const counts = {};
  for (const mesh of pools.object3d.children) counts[mesh.name] = mesh.count;
  return counts;
};

test('levels follow the distance with hysteresis', () => {
  const levels = STREET_ITEM_LEVELS.plant;
  assert.equal(streetItemLevelAt(10, -1, levels), 0);
  assert.equal(streetItemLevelAt(36, 0, levels), 0, 'hysteresis keeps level 0 just past 35 m');
  assert.equal(streetItemLevelAt(36, -1, levels), 1);
  assert.equal(streetItemLevelAt(300, -1, levels), 2);
  assert.equal(streetItemLevelAt(5000, -1, levels), -1);
});

test('items move between level pools and sectors leave cleanly', () => {
  const pools = createStreetItemPools(fakeAssets(), { shadowCasterDistance: 45 });
  const a = pools.addSector([row([5, 50, 200, 20, 60])]);
  const b = pools.addSector([row([10, 100, 300])]);
  pools.update(0, 0);
  assert.deepEqual(poolCounts(pools), { palm_all_lod0: 3, palm_all_lod1: 2, palm_all_lod2: 3 });
  const lod0 = pools.object3d.children.find((mesh) => mesh.name === 'palm_all_lod0');
  const lod1 = pools.object3d.children.find((mesh) => mesh.name === 'palm_all_lod1');
  assert.equal(lod0.castShadow, true, 'level 0 ends at 35 m, inside 45 m');
  assert.equal(lod1.castShadow, false, 'level 1 reaches 90 m, beyond 45 m');
  a.dispose();
  assert.deepEqual(poolCounts(pools), { palm_all_lod0: 1, palm_all_lod1: 0, palm_all_lod2: 2 });
  // The camera walks to x = 300: b's items re-sort, and every slot holds a live item's matrix.
  pools.update(300, 0);
  assert.deepEqual(poolCounts(pools), { palm_all_lod0: 1, palm_all_lod1: 0, palm_all_lod2: 2 });
  const xs = (name) => {
    const mesh = pools.object3d.children.find((each) => each.name === name);
    return Array.from({ length: mesh.count }, (_, i) => mesh.instanceMatrix.array[i * 16 + 12]).sort((p, q) => p - q);
  };
  assert.deepEqual(xs('palm_all_lod0'), [300]);
  assert.deepEqual(xs('palm_all_lod2'), [10, 100]);
  b.dispose();
  assert.deepEqual(pools.stats().instances, 0);
});

// The 3D debris pools: bursts stay within their pools, chunks fall and come to rest on the
// ground, expire after their life, and every recipe's chunks name real kinds.
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('../city-world/vendoredThreeHook.mjs', import.meta.url);
const THREE = await import('three');
const { createDebrisChunks, DEBRIS_KINDS } = await import('../../../game/src/effects/debrisChunks.js');
const { EFFECT_RECIPES } = await import('../../../game/src/effects/effectCatalogue.js');

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const SPEC = EFFECT_RECIPES.vehicle_explosion.chunks;

test('every recipe that throws chunks names real kinds with positive weights', () => {
  let recipes = 0;
  for (const [id, recipe] of Object.entries(EFFECT_RECIPES)) {
    if (!recipe.chunks) continue;
    recipes += 1;
    for (const [kind, weight] of Object.entries(recipe.chunks.kinds)) {
      assert.ok(DEBRIS_KINDS.includes(kind), `${id}: unknown kind ${kind}`);
      assert.ok(weight > 0, `${id}: ${kind} weight`);
    }
  }
  assert.ok(recipes >= 3);
});

test('a burst stays within the pools, and chunks land, rest on the ground and expire', () => {
  const parent = new THREE.Group();
  const debris = createDebrisChunks(parent, seeded(7), 8);
  assert.equal(parent.children.length, DEBRIS_KINDS.length);
  for (let i = 0; i < 4; i += 1) debris.burst(SPEC, 0, 1, 0, 1.5, 2);
  assert.ok(debris.count > 0 && debris.count <= DEBRIS_KINDS.length * 8, `count ${debris.count}`);
  const visible = parent.children.filter((mesh) => mesh.visible).length;
  assert.ok(visible >= 3, 'several kinds in flight');
  for (let step = 0; step < 300; step += 1) debris.update(1 / 60);
  // after 5 s every chunk has come down and lies on the ground at y = 2 (centre a few cm above)
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  for (const mesh of parent.children) {
    for (let i = 0; i < mesh.count; i += 1) {
      mesh.getMatrixAt(i, m);
      p.setFromMatrixPosition(m);
      if (m.determinant() === 0) continue;
      assert.ok(p.y >= 2 && p.y < 2.4, `${mesh.name} ${i} at y ${p.y}`);
    }
  }
  for (let step = 0; step < 480; step += 1) debris.update(1 / 60);
  assert.equal(debris.count, 0);
  assert.ok(parent.children.every((mesh) => !mesh.visible));
  debris.dispose();
  assert.equal(parent.children.length, 0);
});

// Owner (12:00, 18 Nov): "the traffic lights have no poles". Every signal lens drawn by the
// street item pools must stand on its body (pole, mast arm, housings) at the same place and the
// same level, at every camera distance, after the lights change, after a quality change and
// while a sector's lenses are switched before the pools have placed its bodies.
import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';

register('../city-world/vendoredThreeHook.mjs', import.meta.url);
const THREE = await import('three');
const { createStreetItemPools } = await import('../../../game/src/world/props/streetItemPools.js');
const { buildJunctionControls } = await import('../../../game/src/world/props/junctionControlDressing.js');

/** A stand-in set_traffic_control: each object's levels hold an atlas body (pole) and lenses. */
function signalAssets() {
  const scene = new THREE.Group();
  const atlas = new THREE.MeshStandardMaterial({ name: 'atlas' });
  const lenses = ['lamp_red', 'lamp_amber', 'lamp_green'].map((name) => new THREE.MeshStandardMaterial({ name, emissive: 0x000000 }));
  const walk = ['lamp_walk', 'lamp_stop'].map((name) => new THREE.MeshStandardMaterial({ name }));
  for (const [object, lamps, x] of [['traffic_signal_mast', lenses, -3.5], ['traffic_signal_post', lenses, 6.7], ['pedestrian_signal', walk, 2]]) {
    const node = new THREE.Group();
    node.name = object;
    node.position.set(x, 0, 1.2);
    for (const level of [0, 1, 2]) {
      const holder = new THREE.Group();
      holder.name = `${object}_lod${level}`;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 6).translate(0, 3, 0), atlas);
      holder.add(pole);
      lamps.forEach((material, k) => holder.add(new THREE.Mesh(new THREE.SphereGeometry(0.1).translate(0.3, 4 + k * 0.3, -0.2), material)));
      node.add(holder);
    }
    scene.add(node);
  }
  scene.updateMatrixWorld(true);
  return { has: (id) => id === 'set_traffic_control', get: () => ({ scene }) };
}

/** Lens and body instances in the batches, by place: every lens must have a body there. */
function lensesWithoutBody(pools) {
  const matrix = new THREE.Matrix4();
  const key = (e) => `${Math.round(e[12] * 100)},${Math.round(e[14] * 100)}`;
  const bodies = new Set();
  const lenses = [];
  for (const { mesh } of pools.batches()) {
    const isLens = mesh.material.name.startsWith('lamp_');
    mesh._instanceInfo.forEach((info, id) => {
      if (!info.active || !info.visible || !mesh.visible) return;
      mesh.getMatrixAt(id, matrix);
      if (isLens) lenses.push(key(matrix.elements));
      else bodies.add(key(matrix.elements));
    });
  }
  return { lenses: lenses.length, orphans: lenses.filter((each) => !bodies.has(each)) };
}

/** Signals spread along x (a junction every 60 m out to 600 m), as junctionControlLayout gives them. */
function signalItems() {
  const items = [];
  for (let n = 0; n < 10; n += 1) {
    const x = 30 + n * 60;
    items.push({ object: 'traffic_signal_mast', x, z: 8, rotationY: 0, nodeId: n, phase: 0, role: 'vehicle' });
    items.push({ object: 'traffic_signal_post', x: x + 10, z: -8, rotationY: Math.PI, nodeId: n, phase: 1, role: 'vehicle' });
    items.push({ object: 'pedestrian_signal', x: x + 4, z: 9, rotationY: Math.PI / 2, nodeId: n, phase: 1, role: 'walker' });
  }
  return items;
}

test('every lit or dark lens stands on its body at every distance, light and quality', () => {
  const assets = signalAssets();
  const pools = createStreetItemPools(assets, { shadowCasterDistance: 90 });
  pools.update(0, 0);
  const junction = buildJunctionControls(signalItems(), { assets, heightAt: () => 0.15 });
  assert.ok(junction.instances.length === 7 + 7 + 5, 'each object: a body and on/off groups per lens');
  const handle = pools.addSector(junction.instances);
  junction.attach(handle, 0);
  // The lights switch before the pools have placed the new sector's bodies (buildSector does this).
  junction.update((nodeId, phase) => (phase === 0 ? 'red' : 'green'));
  assert.deepEqual(lensesWithoutBody(pools).orphans, [], 'no lens before its body is placed');
  let checked = 0;
  for (const [x, quality] of [[0, null], [70, null], [150, { lodBias: 0.6, shadowCasterDistance: 40 }], [320, null], [480, { lodBias: 1.4, shadowCasterDistance: 120 }], [5, null]]) {
    if (quality) pools.setQuality(quality);
    pools.update(x, 0);
    junction.update((nodeId, phase) => ((nodeId + phase + Math.round(x)) % 3 === 0 ? 'red' : (nodeId % 2 ? 'yellow' : 'green')));
    const { lenses, orphans } = lensesWithoutBody(pools);
    assert.deepEqual(orphans, [], `camera at x = ${x}: lenses with no pole`);
    checked += lenses;
  }
  assert.ok(checked > 50, `lenses were drawn and checked (${checked})`);
  // A body beyond its draw distance takes its lenses with it.
  pools.update(5000, 0);
  assert.equal(lensesWithoutBody(pools).lenses, 0, 'nothing drawn far beyond the draw distance');
  handle.dispose();
  assert.equal(lensesWithoutBody(pools).lenses, 0);
});

test('a lens is drawn at its body\'s level, so the pole and the head swap level together', () => {
  const assets = signalAssets();
  const pools = createStreetItemPools(assets, {});
  pools.update(0, 0);
  const junction = buildJunctionControls([{ object: 'traffic_signal_post', x: 31, z: 0, rotationY: 0, nodeId: 0, phase: 0, role: 'vehicle' }], { assets, heightAt: () => 0 });
  const handle = pools.addSector(junction.instances);
  junction.attach(handle, 0);
  pools.update(0, 0);
  junction.update(() => 'red');
  // 31 m: the body is at level 1 (switch at 30 m); walking back to 29.5 m keeps it there (hysteresis).
  pools.update(0.5, 0);
  pools.update(2.5, 0);
  const counts = pools.poolCounts();
  const at = (level) => Object.entries(counts).filter(([key, count]) => key.endsWith(`_lod${level}`) && count > 0).map(([key]) => key);
  for (const key of [...at(0), ...at(1), ...at(2)]) {
    const level = key.slice(-1);
    assert.ok(counts[`set_traffic_control_traffic_signal_post_body_lod${level}`] > 0, `${key} drawn at level ${level} with its body`);
  }
  handle.dispose();
});

test('the pole colliders match the models (post 4.1 m, mast 6.8 m)', () => {
  const junction = buildJunctionControls([
    { object: 'traffic_signal_post', x: 0, z: 0, rotationY: 0, nodeId: 0, phase: 0, role: 'vehicle' },
    { object: 'traffic_signal_mast', x: 9, z: 0, rotationY: 0, nodeId: 0, phase: 0, role: 'vehicle' },
  ], { assets: signalAssets(), heightAt: () => 0 });
  const heights = junction.colliders.map((each) => each.halfHeight * 2).sort((a, b) => a - b);
  assert.deepEqual(heights.map((h) => Math.round(h * 10) / 10), [4.1, 6.8]);
});

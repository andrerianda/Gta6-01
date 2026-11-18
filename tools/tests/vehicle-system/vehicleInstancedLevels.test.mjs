// The middle and far cars as instanced batches (vehicleInstancedLevels.js): one draw per model
// and level, per-instance paint and lamp flags, cars outside the view left out; and the tail
// lamps' glow on their lenses instead of one big sprite (vehicleLightsAndDoors.js, QA bug 5).
import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';

register('../city-world/vendoredThreeHook.mjs', import.meta.url);
const THREE = await import('three');
const { INSTANCE_LAMP_FLAGS, createVehicleInstanceBatches } = await import('../../../game/src/vehicles/vehicleInstancedLevels.js');
const { createVehicleLamps, releaseVehicleLights, updateVehicleLamps } = await import('../../../game/src/vehicles/vehicleLightsAndDoors.js');

function levelNode(geometry, x, z) {
  const node = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  node.userData.merged = { geometry, map: null };
  node.position.set(x, 0, z);
  node.updateMatrixWorld(true);
  return node;
}

function camera() {
  const view = new THREE.PerspectiveCamera(55, 16 / 9, 0.5, 2000);
  view.position.set(0, 2, 0);
  view.lookAt(0, 2, -10); // looking down -Z
  view.updateMatrixWorld(true);
  return view;
}

test('instanced batches: one mesh per model and level, paint and flags per car, culled outside the view', () => {
  const parent = new THREE.Group();
  const batches = createVehicleInstanceBatches(parent);
  const sedan = new THREE.BoxGeometry(1.8, 1.4, 4.6);
  sedan.name = 'family_sedan_merged_lod1';
  const coupe = new THREE.BoxGeometry(1.9, 1.2, 4.4);
  coupe.name = 'sports_coupe_merged_lod2';
  batches.begin(camera());
  assert.ok(batches.add(levelNode(sedan, 0, -30), 1, null, '#ff0000', INSTANCE_LAMP_FLAGS.lamps));
  assert.ok(batches.add(levelNode(sedan, 4, -60), 1, null, '#0000ff', INSTANCE_LAMP_FLAGS.brake | INSTANCE_LAMP_FLAGS.lamps));
  assert.ok(batches.add(levelNode(coupe, -3, -120), 2, null, '#00ff00', 0));
  assert.equal(batches.add(levelNode(sedan, 0, 40), 1, null, '#ff0000', 0), false, 'behind the camera: left out');
  batches.end();
  assert.equal(batches.drawCount(), 2, 'two models, one draw each');
  assert.equal(batches.instanceCount(), 3);
  const meshes = parent.children.filter((node) => node.isInstancedMesh);
  const sedans = meshes.find((mesh) => mesh.name === 'family_sedan_merged_lod1_instances');
  assert.equal(sedans.count, 2);
  assert.equal(sedans.castShadow, true, 'the middle level casts sun shadows');
  assert.equal(meshes.find((mesh) => mesh.name.startsWith('sports_coupe')).castShadow, false, 'the far level does not');
  const looks = sedans.geometry.attributes.farInstance.array;
  assert.ok(looks[0] > 0.9 && looks[2] < 0.01, 'first car red');
  assert.ok(looks[4] < 0.01 && looks[6] > 0.9, 'second car blue');
  assert.equal(looks[7], INSTANCE_LAMP_FLAGS.brake | INSTANCE_LAMP_FLAGS.lamps);
  const matrix = new THREE.Matrix4();
  sedans.getMatrixAt(1, matrix);
  assert.equal(new THREE.Vector3().setFromMatrixPosition(matrix).z, -60, 'world matrix of the car');
  assert.equal(sedan.attributes.farInstance, undefined, 'the shared merged geometry stays clean');

  // Next frame with no cars: the batches hide; a crowd of one model grows its batch.
  batches.begin(camera());
  batches.end();
  assert.equal(batches.drawCount(), 0);
  assert.equal(sedans.visible, false);
  batches.begin(camera());
  for (let i = 0; i < 70; i += 1) batches.add(levelNode(sedan, (i % 7) - 3, -20 - i * 3), 1, null, '#ffffff', 0);
  batches.end();
  assert.equal(batches.instanceCount(), 70);
  assert.equal(parent.children.filter((node) => node.isInstancedMesh).length, 2, 'grown in place, still one mesh per model');
  batches.dispose();
  assert.equal(parent.children.length, 0);
});

test('tail lamps glow on their two lenses; no sprite at the middle of the tail or over the hood', () => {
  const added = [];
  const atmosphere = {
    addLight(description) {
      const light = { ...description, position: new THREE.Vector3(), direction: new THREE.Vector3(0, 0, -1) };
      added.push(light);
      return light;
    },
    removeLight(light) { added.splice(added.indexOf(light), 1); },
  };
  const root = new THREE.Group();
  root.updateMatrixWorld(true);
  const rig = {
    root, near: new THREE.Group(), asset: null,
    anchors: { anchor_light_tail_l: new THREE.Vector3(-0.7, 0.85, 2.2), anchor_light_tail_r: new THREE.Vector3(0.7, 0.85, 2.2) },
  };
  const lamps = createVehicleLamps(rig);
  const wish = { head: true, brake: false, reverse: false, hazard: false, near: true, important: false, groundY: 0, length: 4.6, dt: 0.016 };
  updateVehicleLamps(lamps, atmosphere, wish);
  assert.equal(lamps.headLight.glow, 0, 'the headlamp spot draws no sprite (it rose over the hood)');
  assert.equal(lamps.rearLight, null, 'no real rear light: it left a red wash on the road');
  assert.equal(lamps.lensGlows.length, 2);
  for (const glow of lamps.lensGlows) {
    assert.equal(glow.importance, 0, 'never a real light');
    assert.equal(glow.pool, false);
    assert.ok(glow.glowSize <= 0.15, 'a lens-sized glow');
  }
  assert.deepEqual(lamps.lensGlows.map((glow) => glow.position.x), [-0.7, 0.7], 'on the lenses, not the middle');
  const tail = lamps.lensGlows[0].glow;
  wish.brake = true;
  updateVehicleLamps(lamps, atmosphere, wish);
  assert.ok(lamps.lensGlows[0].glow > tail, 'brighter when braking');
  releaseVehicleLights(lamps, atmosphere);
  assert.equal(added.length, 0, 'every light given back');
});

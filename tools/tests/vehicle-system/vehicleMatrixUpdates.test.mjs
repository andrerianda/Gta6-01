// Which nodes of a vehicle rig recompute their matrices (vehicleMatrixUpdates.js): static parts stop
// auto-updating, movers and their ancestors and anchors keep it, hidden nodes skip their subtree
// in the scene's update and come back right when shown, and readers that refresh with
// updateWorldMatrix get this frame's answer even under a hidden level.
import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';

register('../city-world/vendoredThreeHook.mjs', import.meta.url);
const THREE = await import('three');
const { limitVehicleMatrixUpdates, movingVehicleNodesOf } = await import('../../../game/src/vehicles/vehicleMatrixUpdates.js');

function node(name, parent, mesh = false, x = 0, y = 0, z = 0) {
  const each = mesh ? new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1)) : new THREE.Group();
  each.name = name;
  each.position.set(x, y, z);
  parent?.add(each);
  return each;
}

/** A small stand-in rig with the shape createVehicleRig gives (bike: fork carrying the front wheel and grips). */
function stubRig() {
  const scene = new THREE.Scene();
  const root = node('vehicle_test', scene);
  const near = node('near', root);
  const lod0 = node('lod0', near, true);
  const panel = node('hood', lod0, true, 0, 0.8, -1);
  const fork = node('fork', lod0, false, 0, 0.6, -0.7);
  const wheelF = node('wheel_f', fork, false, 0, -0.3, 0);
  const rim = node('rim', wheelF, true);
  const grip = node('anchor_grip_l', fork, false, -0.3, 0.4, 0);
  const wheelR = node('wheel_r', lod0, false, 0, 0.3, 0.7);
  const door = node('door_fl', lod0, false, -0.8, 0.5, -0.2);
  const doorSkin = node('door_fl_skin', door, true);
  const steering = node('steering_wheel', lod0, true, -0.3, 1, 0);
  const stillNode = node('near_merged_still', lod0);
  const stillBody = node('near_merged_still_body', stillNode, true);
  const mid = node('merged_lod1', root, true);
  const far = node('merged_lod2', root, true);
  const shadowCaster = node('shadow_caster', root, true);
  mid.visible = false;
  far.visible = false;
  const rig = { root, near, mid, far, shadowCaster, fork, steeringWheel: steering, wheels: [wheelF, wheelR], nearMerge: { stillNode } };
  return { scene, rig, panel, rim, grip, door, doorSkin, stillBody, lod0, wheelF };
}

test('static parts stop auto-updating; movers, their ancestors and anchors keep it', () => {
  const { rig, panel, rim, grip, door, doorSkin, stillBody, lod0, wheelF } = stubRig();
  const moving = movingVehicleNodesOf(rig);
  for (const each of [rig.root, rig.near, lod0, rig.fork, wheelF, grip, door, rig.steeringWheel, rig.mid, rig.far, rig.nearMerge.stillNode]) {
    assert.ok(moving.has(each), `${each.name} moves`);
  }
  const counts = limitVehicleMatrixUpdates(rig);
  assert.equal(panel.matrixAutoUpdate, false);
  assert.equal(rim.matrixAutoUpdate, false);
  assert.equal(doorSkin.matrixAutoUpdate, false);
  assert.equal(stillBody.matrixAutoUpdate, false);
  assert.equal(rig.shadowCaster.matrixAutoUpdate, false);
  assert.equal(door.matrixAutoUpdate, true);
  assert.equal(grip.matrixAutoUpdate, true);
  assert.equal(counts.frozen, 5);
  // The frozen local matrix still holds the modelled place.
  assert.equal(panel.matrix.elements[13], 0.8);
});

test('a hidden near level is skipped by the scene and right again when shown', () => {
  const { scene, rig, panel } = stubRig();
  limitVehicleMatrixUpdates(rig);
  scene.updateMatrixWorld();
  rig.near.visible = false;
  rig.root.position.set(10, 0, 0);
  scene.updateMatrixWorld();
  assert.equal(panel.matrixWorld.elements[12], 0, 'skipped while hidden');
  assert.equal(rig.root.matrixWorld.elements[12], 10);
  rig.near.visible = true;
  rig.root.position.set(20, 0, 0);
  scene.updateMatrixWorld();
  assert.equal(panel.matrixWorld.elements[12], 20, 'recomputed once shown');
});

test('readers that refresh get this frame under a hidden level (grips, dents) and the hidden merged level', () => {
  const { scene, rig, grip, panel } = stubRig();
  limitVehicleMatrixUpdates(rig);
  scene.updateMatrixWorld();
  rig.near.visible = false;
  rig.root.position.set(5, 0, 3);
  rig.fork.rotation.y = Math.PI / 2;
  scene.updateMatrixWorld();
  grip.updateWorldMatrix(true, false);
  const at = new THREE.Vector3().setFromMatrixPosition(grip.matrixWorld);
  // fork at (0, 0.6, -0.7) turned a quarter: the grip's -0.3 x becomes +0.3 z.
  assert.ok(Math.abs(at.x - 5) < 1e-6 && Math.abs(at.z - (3 - 0.7 + 0.3)) < 1e-6, `grip at ${at.toArray()}`);
  rig.root.updateWorldMatrix(true, true);
  assert.equal(panel.matrixWorld.elements[12], 5, 'a forced refresh reaches frozen parts');
  rig.root.position.set(7, 0, 0);
  rig.root.updateWorldMatrix(false, false);
  rig.mid.position.y = -0.02;
  rig.mid.updateWorldMatrix(false, false);
  assert.equal(rig.mid.matrixWorld.elements[12], 7);
  assert.ok(Math.abs(rig.mid.matrixWorld.elements[13] + 0.02) < 1e-9);
});

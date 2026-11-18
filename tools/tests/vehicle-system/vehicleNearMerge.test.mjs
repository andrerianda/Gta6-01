// The near level in a handful of draws (vehicleNearMerge.js): static parts merged into one body
// mesh and each door into one mesh under its hinge, wheels and windows left alone, lamp state
// through the shared material, and the switch back to separate parts.
import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';

register('../city-world/vendoredThreeHook.mjs', import.meta.url);
const THREE = await import('three');
const { nearMergedParts, createNearMerge, setNearMerged, setNearMergedLook } = await import('../../../game/src/vehicles/vehicleNearMerge.js');

function box(name, material, x) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), material);
  mesh.name = name;
  mesh.position.set(x, 0.5, 0);
  return mesh;
}

function fakeCar() {
  const m = {
    atlas: new THREE.MeshStandardMaterial({ name: 'atlas', map: new THREE.Texture() }),
    paint: new THREE.MeshPhysicalMaterial({ name: 'paint', clearcoat: 1 }),
    glass: new THREE.MeshStandardMaterial({ name: 'glass' }),
    lamp_brake: new THREE.MeshStandardMaterial({ name: 'lamp_brake', emissive: 0xff0000 }),
  };
  const instantiate = () => {
    const root = new THREE.Group();
    const lod0 = new THREE.Group();
    lod0.name = 'lod0';
    root.add(lod0);
    lod0.add(box('lod0_1', m.paint, 0), box('lod0_2', m.atlas, 1), box('lod0_3', m.lamp_brake, 2));
    const hood = new THREE.Group();
    hood.name = 'hood';
    hood.add(box('hood_1', m.paint, 0), box('hood_2', m.atlas, 0.5));
    const door = new THREE.Group();
    door.name = 'door_fl';
    door.position.set(-0.9, 0, -0.5);
    door.add(box('door_fl_1', m.paint, 0), box('door_fl_2', m.glass, 0));
    lod0.add(hood, door, box('wheel_fl', m.atlas, -1), box('window_front', m.glass, 0.2));
    return root;
  };
  return { id: 'fake_near_car', lodCount: 3, materials: new Map(Object.entries(m)), instantiate };
}

function visibleDraws(root) {
  let draws = 0;
  root.traverseVisible((node) => { if (node.isMesh) draws += 1; });
  return draws;
}

test('near merge: static parts in one body draw, one per door, wheels and windows apart', () => {
  const asset = fakeCar();
  const parts = nearMergedParts(asset);
  assert.equal(parts.body.geometry.attributes.position.count, 5 * 24, 'body, atlas, lamp, hood x2');
  assert.deepEqual(Object.keys(parts.doors), ['door_fl']);
  assert.equal(parts.doors.door_fl.geometry.attributes.position.count, 2 * 24);
  assert.equal(nearMergedParts(asset), parts, 'built once per asset');
  // The door's merged geometry is in the hinge's space: its first vertex is near the origin.
  parts.doors.door_fl.geometry.computeBoundingBox();
  assert.ok(parts.doors.door_fl.geometry.boundingBox.min.x > -0.5);

  const near = asset.instantiate();
  const rig = { asset, near };
  rig.nearMerge = createNearMerge(rig, '#336699');
  setNearMerged(rig, false);
  const separate = visibleDraws(near);
  assert.equal(separate, 9);
  setNearMerged(rig, true);
  assert.equal(visibleDraws(near), 4, 'body + door + wheel + window');
  const door = near.getObjectByName('door_fl');
  assert.ok(door.getObjectByName('near_merged_door_fl'), 'the merged door swings with its hinge node');

  setNearMergedLook(rig, '#336699', { lit: { lamp_brake: true } });
  const material = near.getObjectByName('near_merged_body').material;
  assert.equal(material.userData.farLampsMore.x, 1, 'brake lamps lit through the material');
  assert.ok(material.isMeshPhysicalMaterial && material.clearcoat === 1, 'the paint keeps its clear coat');
  setNearMergedLook(rig, '#336699', { lit: { lamp_brake: false } });
  assert.notEqual(near.getObjectByName('near_merged_body').material, material);
  setNearMerged(rig, false);
  assert.equal(visibleDraws(near), separate);
});

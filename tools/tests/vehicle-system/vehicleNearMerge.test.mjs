// The near level in a handful of draws (vehicleNearMerge.js): static parts merged into one body
// mesh and each door into one mesh under its hinge, wheels and windows left alone, lamp state
// through the shared material, and the switch back to separate parts.
import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';

register('../city-world/vendoredThreeHook.mjs', import.meta.url);
const THREE = await import('three');
const {
  NEAR_MODE, nearMergedParts, nearModeOf, nearPartKind, createNearMerge, setNearMerged, setNearMergedLook, settleNearStill,
} = await import('../../../game/src/vehicles/vehicleNearMerge.js');
const { mergeVehicleParts } = await import('../../../game/src/vehicles/vehicleMergedLevels.js');

test('merging parts quantised differently (Draco: Float32 uv in one, normalised Uint16 uv and an extra uv1 in another)', () => {
  const a = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ name: 'atlas', map: new THREE.Texture() }));
  const b = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshPhysicalMaterial({ name: 'paint' }));
  const uv = b.geometry.attributes.uv;
  const packed = new Uint16Array(uv.count * 2);
  for (let i = 0; i < uv.count * 2; i += 1) packed[i] = Math.round(uv.array[i] * 65535);
  b.geometry.setAttribute('uv', new THREE.BufferAttribute(packed, 2, true));
  b.geometry.setAttribute('uv1', new THREE.BufferAttribute(new Uint16Array(uv.count * 2), 2, true));
  const space = new THREE.Group();
  space.add(a, b);
  space.updateMatrixWorld(true);
  const merged = mergeVehicleParts([a, b], space).geometry;
  assert.equal(merged.attributes.uv.array.constructor, Float32Array);
  assert.equal(merged.attributes.uv1, undefined, 'only the attributes the role shader uses');
  const n = a.geometry.attributes.position.count;
  for (let i = 0; i < n; i += 1) {
    assert.ok(Math.abs(merged.attributes.uv.getX(n + i) - a.geometry.attributes.uv.getX(i)) < 1e-4, 'normalised uv read back as 0..1');
  }
});

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
  assert.equal(parts.doors.door_fl.geometry.attributes.position.count, 24, 'the door pane is not in the opaque door mesh');
  assert.equal(parts.doorGlass.door_fl[0].materialName, 'glass');
  assert.equal(parts.glassClosed[0].part.geometry.attributes.position.count, 2 * 24, 'doors shut: body window + door pane');
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
  assert.equal(visibleDraws(near), 5, 'body + door + door pane + wheel + window');
  const door = near.getObjectByName('door_fl');
  assert.ok(door.getObjectByName('near_merged_door_fl'), 'the merged door swings with its hinge node');
  assert.equal(door.getObjectByName('near_merged_glass_glass').material.name, 'glass', 'the door pane swings too, in its glass');

  setNearMergedLook(rig, '#336699', { lit: { lamp_brake: true } });
  const material = near.getObjectByName('near_merged_body').material;
  assert.equal(material.userData.farLampsMore.x, 1, 'brake lamps lit through the material');
  assert.ok(material.isMeshPhysicalMaterial && material.clearcoat === 1, 'the paint keeps its clear coat');
  setNearMergedLook(rig, '#336699', { lit: { lamp_brake: false } });
  assert.notEqual(near.getObjectByName('near_merged_body').material, material);
  setNearMerged(rig, false);
  assert.equal(visibleDraws(near), separate);
});

test('near modes: doors shut fold into the body, a sleeping car is one mesh plus its glass', () => {
  const asset = fakeCar();
  const near = asset.instantiate();
  const rig = { asset, near };
  rig.nearMerge = createNearMerge(rig, '#336699');
  setNearMerged(rig, NEAR_MODE.CLOSED);
  assert.equal(visibleDraws(near), 3, 'body with doors + wheel + glass');
  setNearMerged(rig, NEAR_MODE.STILL);
  assert.equal(visibleDraws(near), 2, 'body, doors and wheels + glass');
  const glass = near.getObjectByName('near_merged_glass_glass');
  assert.equal(glass.material.name, 'glass', 'the windows keep their own glass material');
  settleNearStill(rig, -0.018);
  assert.equal(near.getObjectByName('near_merged_still').position.y, -0.018, 'seated on the road like the merged levels');
  setNearMerged(rig, NEAR_MODE.PARTS);
  assert.equal(visibleDraws(near), 9);

  const shut = { fl: { amount: 0, target: 0 } };
  assert.equal(nearModeOf(true, shut, true), NEAR_MODE.PARTS, 'player or damaged: separate parts');
  assert.equal(nearModeOf(false, shut, false), NEAR_MODE.CLOSED);
  assert.equal(nearModeOf(false, shut, true), NEAR_MODE.STILL);
  assert.equal(nearModeOf(false, { fl: { amount: 0, target: 1 } }, true), NEAR_MODE.OPEN, 'a door about to open swings on its hinge');
});

test('a motorcycle fork is running gear (it steers), its parts are not merged into the body', () => {
  const lod0 = new THREE.Group();
  const fork = new THREE.Group();
  fork.name = 'fork';
  const forkMesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1));
  forkMesh.name = 'fork_mesh';
  const wheel = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1));
  wheel.name = 'wheel_f';
  fork.add(forkMesh, wheel);
  const tank = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1));
  tank.name = 'lod0_1';
  lod0.add(fork, tank);
  assert.equal(nearPartKind(forkMesh, lod0), 'gear');
  assert.equal(nearPartKind(wheel, lod0), 'gear');
  assert.equal(nearPartKind(tank, lod0), 'static');
});

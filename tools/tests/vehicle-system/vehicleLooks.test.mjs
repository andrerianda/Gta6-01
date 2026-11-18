// The fleet's looks that run without a browser: the merged one-draw levels (attributes per
// source material, one shared material per paint and lamp state), the doors (which way each
// swings, eased to the asked amount, side names) and the contact shadows (one instanced draw,
// footprint scaled to the car).
import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';

register('../city-world/vendoredThreeHook.mjs', import.meta.url);
const THREE = await import('three');
const { mergedVehicleLevel, createMergedVehicleMesh, createVehicleShadowCaster, setMergedVehicleLook } = await import('../../../game/src/vehicles/vehicleMergedLevels.js');
const { createVehicleDoors, doorSideOf, poseVehicleDoors, createVehicleLamps, setVehicleLamp, sirenBitsOf } = await import('../../../game/src/vehicles/vehicleLightsAndDoors.js');
const { createVehicleContactShadows, contactShadowFootprint } = await import('../../../game/src/vehicles/vehicleContactShadows.js');

function fakeAsset() {
  const atlasMap = new THREE.Texture();
  const materials = {
    atlas: new THREE.MeshStandardMaterial({ name: 'atlas', map: atlasMap }),
    paint: new THREE.MeshPhysicalMaterial({ name: 'paint', color: 0x336699 }),
    glass: new THREE.MeshStandardMaterial({ name: 'glass', color: 0x445566 }),
    lamp_head: new THREE.MeshStandardMaterial({ name: 'lamp_head', color: 0xffffff, emissive: 0xffeecc }),
    lamp_siren_b: new THREE.MeshStandardMaterial({ name: 'lamp_siren_b', color: 0x1030ff }),
  };
  let made = 0;
  return {
    id: 'fake_car', lodCount: 3, materials: new Map(Object.entries(materials)),
    get made() { return made; },
    instantiate() {
      made += 1;
      const root = new THREE.Group();
      let x = 0;
      for (const material of Object.values(materials)) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), material);
        mesh.position.set(x, 0.5, 0);
        x += 1;
        root.add(mesh);
      }
      return root;
    },
  };
}

test('merged levels: one geometry per level, attributes per source material, shared materials', () => {
  const asset = fakeAsset();
  const merged = mergedVehicleLevel(asset, 2);
  assert.equal(mergedVehicleLevel(asset, 2), merged, 'built once per level');
  assert.equal(asset.made, 1);
  const geometry = merged.geometry;
  const boxVertices = new THREE.BoxGeometry(0.5, 0.5, 0.5).attributes.position.count;
  assert.equal(geometry.attributes.position.count, boxVertices * 5);
  assert.ok(merged.map, 'the atlas texture is kept');
  const mix = geometry.attributes.farMix;
  const at = (part, channel) => mix.array[(part * boxVertices) * 4 + channel];
  assert.equal(at(0, 0), 1, 'atlas samples the texture');
  assert.equal(at(1, 1), 1, 'paint takes the car colour');
  assert.equal(at(1, 3), 1, 'paint is glossy');
  assert.equal(at(3, 2), 1, 'head lamp glows with the lamps');
  assert.equal(at(4, 2), 3, 'siren b has its own code');
  const glass = geometry.attributes.color.array[(2 * boxVertices) * 3];
  assert.ok(glass < 0.1, 'glass is darkened');
  const a = createMergedVehicleMesh(asset, 2, '#C2261F', false);
  const b = createMergedVehicleMesh(asset, 2, '#c2261f', false);
  assert.equal(a.material, b.material, 'cars of one colour share a material');
  assert.equal(a.geometry, b.geometry);
  setMergedVehicleLook(a, asset, '#C2261F', true, 2);
  assert.notEqual(a.material, b.material);
  assert.equal(a.material.userData.farLamps.x, 1);
  assert.equal(a.material.userData.farLamps.z, 1);
  const caster = createVehicleShadowCaster(asset);
  assert.ok(caster.castShadow && caster.material.colorWrite === false && caster.material.depthWrite === false);
});

test('doors swing outwards about their hinge, eased to the amount asked', () => {
  const near = new THREE.Group();
  for (const name of ['door_fl', 'door_fr']) {
    const door = new THREE.Group();
    door.name = name;
    door.add(new THREE.Object3D());
    door.children[0].position.set(0, 0, 1);
    near.add(door);
  }
  const doors = createVehicleDoors({ near });
  assert.deepEqual(Object.keys(doors), ['fl', 'fr']);
  doors.fl.target = 1;
  doors.fr.target = 1;
  for (let i = 0; i < 30; i += 1) poseVehicleDoors(doors, 1 / 60);
  assert.equal(doors.fl.amount, 1);
  near.updateMatrixWorld(true);
  const tip = new THREE.Vector3();
  doors.fl.node.children[0].getWorldPosition(tip);
  assert.ok(tip.x < -0.8, `left door opens to -X (${tip.x})`);
  doors.fr.node.children[0].getWorldPosition(tip);
  assert.ok(tip.x > 0.8, `right door opens to +X (${tip.x})`);
  assert.equal(doorSideOf('driver'), 'fl');
  assert.equal(doorSideOf('passenger'), 'fr');
  assert.equal(doorSideOf('rr'), 'rr');
  assert.equal(doorSideOf('roof'), null);
});

test('siren halves are fleet lamp groups', () => {
  const near = new THREE.Group();
  near.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ name: 'lamp_siren_a' })));
  const lit = new THREE.MeshStandardMaterial({ name: 'lamp_siren_a', emissiveIntensity: 4 });
  const lamps = createVehicleLamps({ near, asset: { lampMaterial: (name, on) => (on ? lit : near.children[0].material) } });
  assert.equal(setVehicleLamp(lamps, 'lamp_siren_a', true), true);
  assert.equal(near.children[0].material, lit);
  assert.equal(sirenBitsOf(lamps), 1);
  assert.equal(setVehicleLamp(lamps, 'lamp_nonsense', true), false);
});

test('contact shadows: one instanced draw for every car, footprint scaled to the car', () => {
  const parent = new THREE.Group();
  const shadows = createVehicleContactShadows(parent, 4);
  assert.equal(parent.children.length, 1);
  const footprint = contactShadowFootprint({ dimensions: { length: 4.72, width: 1.82 } });
  const scale = new THREE.Vector3();
  footprint.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
  assert.ok(scale.x > 1.82 && scale.x < 2.6 && scale.z > 4.72 && scale.z < 5.8);
  const root = new THREE.Object3D();
  root.updateMatrixWorld();
  shadows.begin();
  for (let i = 0; i < 6; i += 1) shadows.add(root, footprint);
  shadows.end();
  assert.equal(shadows.mesh.count, 4, 'capped at the capacity');
  shadows.begin();
  shadows.end();
  assert.equal(shadows.mesh.count, 0);
  shadows.dispose();
  assert.equal(parent.children.length, 0);
});

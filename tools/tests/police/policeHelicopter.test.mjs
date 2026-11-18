// The police helicopter flies over the lead, aims its searchlight at the lead at night (beam cone
// visible, spot light on), stays dark by day, and leaves and is removed when it is no longer called
// for. Runs the real controller on a stand-in model with the node and material names of the
// registered police_helicopter.
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('../city-world/vendoredThreeHook.mjs', import.meta.url);
const THREE = await import('three');
const { createPoliceHelicopter } = await import('../../../game/src/police/policeHelicopter.js');

function standInModel() {
  const lamp = (name, lit) => {
    const material = new THREE.MeshStandardMaterial({ name });
    material.emissiveIntensity = lit ? 10 : 0;
    return material;
  };
  const materials = { lamp_searchlight: [lamp('lamp_searchlight', false), lamp('lamp_searchlight', true)] };
  return {
    createLOD() {
      const root = new THREE.Group();
      const box = new THREE.BoxGeometry(1, 1, 1);
      const rotor = new THREE.Mesh(box, new THREE.MeshStandardMaterial());
      rotor.name = 'rotor_main';
      const blur = new THREE.Mesh(box, new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.8 }));
      blur.name = 'rotor_main_blur';
      rotor.add(blur);
      const searchlight = new THREE.Mesh(box, materials.lamp_searchlight[0]);
      searchlight.name = 'searchlight';
      searchlight.position.set(0, -1, -2);
      const lens = new THREE.Object3D();
      lens.name = 'anchor_searchlight';
      lens.position.set(0, 0, -0.3);
      searchlight.add(lens);
      root.add(rotor, searchlight);
      return root;
    },
    lampMaterial(name, on) {
      if (!materials[name]) throw new Error(`no material ${name}`);
      return materials[name][on ? 1 : 0];
    },
  };
}

function fakeContext(nightFactor) {
  const scene = new THREE.Scene();
  const added = [];
  const atmosphere = {
    state: { nightFactor },
    addLight(description) {
      const light = { ...description, position: new THREE.Vector3(), direction: new THREE.Vector3(0, -1, 0) };
      added.push(light);
      return light;
    },
    removeLight(light) {
      const index = added.indexOf(light);
      if (index >= 0) added.splice(index, 1);
    },
  };
  const model = standInModel();
  const context = {
    assets: { has: (id) => id === 'police_helicopter', get: () => model },
    systems: { find: (name) => (name === 'openWorldCity' ? { groundHeightAt: () => 0 } : null) },
    view: { scene, layers: { dynamic: scene } },
    atmosphere,
    clock: { elapsed: 3 },
  };
  return { context, scene, lights: added };
}

function beamOf(scene) {
  let beam = null;
  scene.traverse((node) => { if (node.name === 'police_helicopter_beam') beam = node; });
  return beam;
}

test('at night the helicopter flies above the lead with its searchlight on the lead', () => {
  const { context, scene, lights } = fakeContext(1);
  const heli = createPoliceHelicopter(context);
  const lead = { x: 0, y: 0, z: 0, vx: 0, vz: -20, speed: 20, yaw: 0 };
  for (let i = 0; i < 600; i += 1) {
    lead.z += lead.vz / 60;
    heli.update(1 / 60, lead, true);
  }
  assert.equal(heli.active, true);
  const p = heli.root.position;
  assert.ok(p.y > 20, `flies high (y ${p.y.toFixed(1)})`);
  assert.ok(Math.hypot(p.x - lead.x, p.z - lead.z) < 60, 'keeps up with the chase');
  assert.ok(heli.sees(lead));
  const beam = beamOf(scene);
  assert.ok(beam && beam.visible && beam.material.opacity > 0.05, 'beam cone shown');
  // The cone's axis ends at the lead: apex at the lens, length along the beam.
  const axis = new THREE.Vector3(0, -1, 0).applyQuaternion(beam.quaternion).multiplyScalar(beam.scale.y);
  const end = beam.position.clone().add(axis);
  assert.ok(Math.hypot(end.x - lead.x, end.z - lead.z) < 4, `beam lands on the lead (${end.x.toFixed(1)}, ${end.z.toFixed(1)})`);
  const spot = lights.find((light) => light.kind === 'spot');
  assert.ok(spot && spot.intensity > 1000, 'real spot light on');
});

test('a placed helicopter aims at the lead on its very first frame (showcase stills)', () => {
  const { context, scene } = fakeContext(1);
  const heli = createPoliceHelicopter(context);
  const lead = { x: 30, y: 0, z: -10, vx: 0, vz: 0, speed: 0, yaw: 0 };
  assert.equal(heli.place(10, 20, 0, 0), true);
  heli.update(1 / 60, lead, true);
  const beam = beamOf(scene);
  const axis = new THREE.Vector3(0, -1, 0).applyQuaternion(beam.quaternion).multiplyScalar(beam.scale.y);
  const end = beam.position.clone().add(axis);
  assert.ok(Math.hypot(end.x - lead.x, end.z - lead.z) < 3, `beam on the lead (${end.x.toFixed(1)}, ${end.z.toFixed(1)})`);
});

test('by day the searchlight stays dark, and the helicopter leaves when no longer called', () => {
  const { context, scene, lights } = fakeContext(0);
  const heli = createPoliceHelicopter(context);
  const lead = { x: 0, y: 0, z: 0, vx: 0, vz: 0, speed: 0, yaw: 0 };
  heli.update(0.1, lead, true);
  assert.equal(heli.active, true);
  assert.equal(beamOf(scene).visible, false);
  assert.ok(!lights.some((light) => light.kind === 'spot' && light.intensity > 0));
  for (let i = 0; i < 200; i += 1) heli.update(0.1, lead, false);
  assert.equal(heli.active, false);
  assert.equal(heli.root, null);
  assert.equal(beamOf(scene), null);
});

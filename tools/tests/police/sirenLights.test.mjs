// The light bar's real lights stay coloured patches, never a wash: the pool lights are capped by the
// exposure and fade right by the camera, while the lenses keep their bright lit material.
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('../city-world/vendoredThreeHook.mjs', import.meta.url);
const THREE = await import('three');
const { createSirenLights, sirenPoolIntensity, updateSirenLights } = await import('../../../game/src/police/sirenLights.js');

function fakeCar() {
  const root = new THREE.Group();
  const lenses = ['lamp_siren_a', 'lamp_siren_b'].map((name) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.2), new THREE.MeshStandardMaterial({ name }));
    root.add(mesh);
    return mesh;
  });
  const lit = { lamp_siren_a: new THREE.MeshStandardMaterial({ name: 'lamp_siren_a' }), lamp_siren_b: new THREE.MeshStandardMaterial({ name: 'lamp_siren_b' }) };
  const asset = { lampMaterial: (name, on) => (on ? lit[name] : lenses[name === 'lamp_siren_a' ? 0 : 1].material) };
  return { rig: { near: root, far: null, asset, anchors: { anchor_siren: new THREE.Vector3(0, 1.5, 0) }, root }, lenses };
}

function fakeAtmosphere(exposure) {
  const lights = [];
  return {
    lights,
    state: { nightFactor: 0.6, exposure },
    addLight(description) {
      const light = { ...description, position: new THREE.Vector3(), direction: new THREE.Vector3(0, -1, 0) };
      lights.push(light);
      return light;
    },
    removeLight(light) { lights.splice(lights.indexOf(light), 1); },
  };
}

test('pool lights are capped by the exposure and stay far below a street lamp', () => {
  for (const night of [0, 0.6, 1]) {
    for (const exposure of [0.8, 1.4, 2.2]) {
      const far = sirenPoolIntensity(1.7, night, exposure, 40);
      assert.ok(far > 10 && far < 300, `night ${night} exposure ${exposure}: ${far.toFixed(0)} cd`);
    }
  }
  assert.ok(sirenPoolIntensity(1, 0.6, 2, 30) < sirenPoolIntensity(1, 0.6, 1, 30), 'a brighter exposure dims them');
});

test('right by the camera the pools fade to a fraction', () => {
  const close = sirenPoolIntensity(1, 0.6, 1.3, 3);
  const far = sirenPoolIntensity(1, 0.6, 1.3, 25);
  assert.ok(close < far * 0.2, `${close.toFixed(1)} vs ${far.toFixed(1)}`);
  assert.ok(close > 0, 'a hint of colour remains');
});

test('steady bars keep both lenses lit while the pools near the camera are dimmed', () => {
  const car = fakeCar();
  const atmosphere = fakeAtmosphere(1.3);
  const siren = createSirenLights(car.rig, 0);
  updateSirenLights(siren, 1 / 60, true, atmosphere, 3, true, 0.6);
  for (const lens of car.lenses) assert.ok(lens.material.emissiveIntensity >= 16, 'lit lens material');
  const pools = atmosphere.lights.filter((light) => light.importance === 2);
  assert.equal(pools.length, 2);
  for (const pool of pools) {
    assert.ok(pool.intensity > 0 && pool.intensity < 40, `pool ${pool.intensity.toFixed(1)} cd by the camera`);
    assert.ok(pool.range <= 9);
  }
  const red = pools.find((light) => light.color === 0xff2418);
  const blue = pools.find((light) => light.color !== 0xff2418);
  assert.ok(red.position.x < 0 && blue.position.x > 0, 'red on one side of the car, blue on the other');
  assert.ok(red.position.y < 1.5, 'low over the road');
  updateSirenLights(siren, 1 / 60, true, atmosphere, 400, true, 0.6);
  assert.equal(atmosphere.lights.length, 0, 'far from the camera the real lights are given back');
});

// Tests that the local light manager (game/src/render/lighting/localLightManager.js) reads each
// handle's intensity live every frame: city-dressing switches its street and building lamps by
// setting handle.intensity (registered with nightOnly false), effects and vehicles do the same.
// Run with: node --test "tools/tests/render/*.test.mjs"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

const vendoredThree = new URL('../../../game/vendor/three/three.module.min.js', import.meta.url).href;
register(`data:text/javascript,${encodeURIComponent(
  `export async function resolve(s, c, n) { return s === 'three' ? { url: ${JSON.stringify(vendoredThree)}, shortCircuit: true } : n(s, c); }`,
)}`);
const THREE = await import('three');
const { createLocalLightManager } = await import('../../../game/src/render/lighting/localLightManager.js');

const frameAt = (nightFactor, time = 1) => ({ nightFactor, time, exposure: 1, beamVisibility: 0, wetness: 0, viewportHeight: 800 });

function setUp() {
  const scene = new THREE.Scene();
  const manager = createLocalLightManager(scene, 'high');
  const camera = new THREE.PerspectiveCamera(60, 1.6, 0.1, 1000);
  camera.position.set(0, 1.7, 0);
  camera.lookAt(0, 1.7, -10);
  camera.updateMatrixWorld(true);
  // A dressing street lamp 8 m ahead, switched by its owner (nightOnly false).
  const lamp = manager.add({ kind: 'point', position: [0, 6, -8], intensity: 320, range: 24, nightOnly: false });
  return { manager, camera, lamp };
}

const realIntensityOf = (manager, lamp) => {
  const entry = manager.describeRealLights().find((row) => row.light === lamp);
  return entry ? entry.light.level * entry.weight : 0;
};

test('a handle switched off by its owner goes dark the same frame, even at night', () => {
  const { manager, camera, lamp } = setUp();
  for (let i = 0; i < 20; i += 1) manager.update(0.05, camera, frameAt(1, i * 0.05));
  assert.equal(lamp.level, 320);
  assert.ok(realIntensityOf(manager, lamp) > 300, 'the near lamp holds a real light at full weight');
  assert.ok(manager.glowCount >= 1);

  lamp.intensity = 0;
  manager.update(0.05, camera, frameAt(1, 2));
  assert.equal(lamp.level, 0);
  assert.equal(realIntensityOf(manager, lamp), 0);
  assert.equal(manager.glowCount, 0, 'no glow sprite for a lamp that is off');
});

test('every new intensity is read on the next frame, by day too (nightOnly false)', () => {
  const { manager, camera, lamp } = setUp();
  lamp.intensity = 0;
  manager.update(0.05, camera, frameAt(0));
  assert.equal(lamp.level, 0);
  for (const value of [40, 160, 320, 90]) {
    lamp.intensity = value;
    manager.update(0.05, camera, frameAt(0, value));
    assert.equal(lamp.level, value, `level follows intensity ${value}`);
  }
});

test('an owner-dimmed lamp (duskRamp) dims its glow with intensity / registered intensity', () => {
  const scene = new THREE.Scene();
  const manager = createLocalLightManager(scene, 'high');
  const camera = new THREE.PerspectiveCamera(60, 1.6, 0.1, 1000);
  camera.updateMatrixWorld(true);
  let glowColor = null;
  scene.traverse((node) => { glowColor = glowColor ?? node.geometry?.getAttribute?.('glowColor')?.array ?? null; });
  assert.ok(glowColor, 'the glow layer carries a glowColor attribute');
  const ramped = manager.add({ kind: 'point', position: [0, 6, -8], intensity: 300, nightOnly: false, duskRamp: true });
  const glowAt = (value) => {
    ramped.intensity = value;
    manager.update(0.05, camera, frameAt(1));
    return glowColor[0];
  };
  const full = glowAt(300);
  assert.ok(full > 0);
  assert.ok(Math.abs(glowAt(75) - full * 0.25) < full * 1e-3, 'a quarter of the intensity, a quarter of the glow');
  // Without the flag the glow is on fully whenever the lamp is (headlamp lenses, effects).
  manager.remove(ramped);
  const plain = manager.add({ kind: 'point', position: [0, 6, -8], intensity: 300, nightOnly: false });
  plain.intensity = 75;
  manager.update(0.05, camera, frameAt(1));
  assert.ok(Math.abs(glowColor[0] - full) < full * 1e-3);
});

test('a night-only lamp still follows its intensity once the night threshold is passed', () => {
  const scene = new THREE.Scene();
  const manager = createLocalLightManager(scene, 'high');
  const camera = new THREE.PerspectiveCamera(60, 1.6, 0.1, 1000);
  camera.updateMatrixWorld(true);
  const lamp = manager.add({ kind: 'point', position: [0, 6, -8], intensity: 300 });
  manager.update(0.05, camera, frameAt(0));
  assert.equal(lamp.level, 0, 'off by day');
  manager.update(0.05, camera, frameAt(1));
  assert.equal(lamp.level, 300);
  lamp.intensity = 120;
  manager.update(0.05, camera, frameAt(1));
  assert.equal(lamp.level, 120);
});

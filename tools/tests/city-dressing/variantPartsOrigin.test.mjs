// The owner's "palm on the asphalt": the palm files lay their variants side by side (royal_palm
// variant_b stands at x = 7 m in the file), and the instanced parts were measured from the scene
// root, so every variant_b palm was drawn 7 m from where the layout put it (and from its trunk
// collider), out on the lanes. objectParts must measure each object from its own node.
import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';

register('../city-world/vendoredThreeHook.mjs', import.meta.url);
const THREE = await import('three');
const { objectParts } = await import('../../../game/src/world/props/sectorStreetDressing.js');

/** A stand-in asset: variants a and b side by side, each with a 6 m trunk at its own origin. */
function sideBySidePalms() {
  const scene = new THREE.Group();
  for (const [name, x] of [['variant_a', 0], ['variant_b', 7]]) {
    const node = new THREE.Group();
    node.name = name;
    node.position.set(x, 0, 0.5);
    node.rotation.y = 0.3;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 6), new THREE.MeshBasicMaterial());
    trunk.name = `${name}_lod0`;
    trunk.position.y = 3;
    node.add(trunk);
    scene.add(node);
  }
  return { scene };
}

test('each variant is measured from its own node, so it stands where the layout puts it', () => {
  const asset = sideBySidePalms();
  for (const object of ['variant_a', 'variant_b']) {
    const [part] = objectParts(asset, { assetId: 'palms', object }, 0);
    part.geometry.computeBoundingBox();
    const centre = part.geometry.boundingBox.getCenter(new THREE.Vector3());
    assert.ok(Math.hypot(centre.x, centre.z) < 0.01, `${object} trunk centred at the origin, got ${centre.x.toFixed(2)}, ${centre.z.toFixed(2)}`);
    assert.ok(Math.abs(centre.y - 3) < 0.01, `${object} trunk keeps its height`);
  }
});

test('a set object is measured from its own node too', () => {
  const asset = sideBySidePalms();
  asset.scene.getObjectByName('variant_b').name = 'lamp_arm';
  asset.scene.getObjectByName('variant_b_lod0').name = 'lamp_arm_lod0';
  const [part] = objectParts(asset, { assetId: 'set', object: 'lamp_arm' }, 0);
  part.geometry.computeBoundingBox();
  const centre = part.geometry.boundingBox.getCenter(new THREE.Vector3());
  assert.ok(Math.hypot(centre.x, centre.z) < 0.01);
});

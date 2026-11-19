// The reticle (a dot that opens with the spread and flashes a hit marker) and the weapon in the
// hand (drawn larger, dark finishes lifted on shared copies, real size when carried).
import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';

register('../city-world/vendoredThreeHook.mjs', import.meta.url);
const THREE = await import('three');
const { createAimReticle, reticleOpenness } = await import('../../../game/src/combat/aimReticle.js');
const { HELD_SCALE, createWeaponModel } = await import('../../../game/src/combat/weaponModels.js');
const { createHeldWeaponModels } = await import('../../../game/src/combat/heldWeaponModels.js');
const { WEAPON_CATALOG } = await import('../../../game/src/catalog/weaponCatalog.js');

/** Just enough of a page for the reticle. */
function fakeDocument() {
  const element = (tag) => {
    const classes = new Set();
    const el = {
      tag, children: [], style: {}, attributes: {}, textContent: '', className: '',
      classList: {
        add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c),
        toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)),
      },
      appendChild(child) { el.children.push(child); return child; },
      setAttribute(k, v) { el.attributes[k] = v; },
      remove() { el.removed = true; },
    };
    return el;
  };
  return { head: element('head'), body: element('body'), createElement: element };
}

test('the shooting arm follows the camera direction, level within 15 degrees of level', async () => {
  const { armAimPitch, LEVEL_ARM_PITCH } = await import('../../../game/src/combat/aimingAndRecoil.js');
  const deg = Math.PI / 180;
  assert.equal(armAimPitch(-10 * deg), 0);
  assert.equal(armAimPitch(14 * deg), 0);
  assert.ok(Math.abs(LEVEL_ARM_PITCH - 15 * deg) < 1e-12);
  assert.ok(armAimPitch(-20 * deg) < 0 && armAimPitch(-20 * deg) > -20 * deg);
  assert.ok(Math.abs(armAimPitch(45 * deg) - 45 * deg) < 1e-9);
  assert.ok(Math.abs(armAimPitch(-60 * deg) + 60 * deg) < 1e-9);
  let last = 0;
  for (let d = 0; d <= 80; d += 1) { const p = armAimPitch(d * deg); assert.ok(p >= last - 1e-12); last = p; }
});

test('openness: 0 at the steady aimed spread, rising with movement and bloom, capped at 1', () => {
  assert.equal(reticleOpenness(0.014, 0.014), 0);
  assert.ok(reticleOpenness(0.014 * 1.8, 0.014) > 0.3);
  assert.equal(reticleOpenness(0.014 * 9, 0.014), 1);
  assert.equal(reticleOpenness(0, 0), 0);
});

test('the reticle is a dot with a ring and four hit strokes; it shows, opens and flashes', () => {
  const document = fakeDocument();
  const reticle = createAimReticle(document);
  const root = document.body.children[0];
  assert.equal(root.id, 'combat-reticle');
  assert.deepEqual(root.children.map((c) => c.className.split(' ')[0]), ['ring', 'dot', 'hm', 'hm', 'hm', 'hm']);
  reticle.update(0.016, true, 0);
  assert.ok(root.classList.contains('on'));
  assert.equal(root.children[0].style.opacity, '0.00');
  for (let i = 0; i < 30; i += 1) reticle.update(0.016, true, 1);
  assert.ok(reticle.openness > 0.95);
  assert.equal(root.children[0].style.opacity, '1.00');
  reticle.hit(false);
  assert.ok(root.classList.contains('hit'));
  reticle.update(0.2, true, 1);
  assert.ok(!root.classList.contains('hit'));
  reticle.hit(true);
  assert.ok(root.classList.contains('kill'));
  reticle.update(0.016, false, 0);
  assert.ok(!root.classList.contains('on'));
  reticle.dispose();
  assert.ok(root.removed);
});

/** A set with one pistol node (a mesh with the atlas, an anchor) like set_handguns. */
function fakeAssets(atlas) {
  return {
    has: () => true,
    instantiate() {
      const set = new THREE.Group();
      const gun = new THREE.Group(); gun.name = 'pistol'; gun.position.set(3, 0, 0);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.14, 0.19), atlas); mesh.name = 'pistol_lod0';
      const muzzle = new THREE.Object3D(); muzzle.name = 'anchor_muzzle__pistol'; muzzle.position.set(0, 0.058, -0.14);
      gun.add(mesh, muzzle); set.add(gun);
      return set;
    },
  };
}

test('a held pistol is drawn larger, with a lifted copy of the dark atlas shared by every pistol', () => {
  const atlas = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 1 }); atlas.name = 'atlas';
  const assets = fakeAssets(atlas);
  const a = createWeaponModel(assets, WEAPON_CATALOG.pistol);
  const b = createWeaponModel(assets, WEAPON_CATALOG.pistol);
  assert.equal(a.heldScale, HELD_SCALE.handgun);
  assert.ok(a.heldScale > 1.1 && a.heldScale <= 1.15);
  assert.deepEqual(a.object.position.toArray(), [0, 0, 0]);
  const material = a.object.children[0].material;
  assert.notEqual(material, atlas);
  assert.equal(material, b.object.children[0].material);
  assert.ok(material.color.r > 1.5 && material.metalness < 1);
  assert.equal(atlas.color.r, 1);
  assert.ok(Math.abs(a.muzzleAt.z + 0.14) < 1e-9);
  // In the hand at heldScale; holstered at real size.
  const held = createHeldWeaponModels({ assets }, WEAPON_CATALOG);
  const body = new THREE.Group();
  for (const name of ['anchor_hand_r', 'anchor_hip_r', 'anchor_back']) { const n = new THREE.Object3D(); n.name = name; body.add(n); }
  held.attachTo(body);
  held.show('pistol', null, null);
  assert.equal(held.inHand.object.scale.x, HELD_SCALE.handgun);
  held.show('assault_rifle', 'pistol', null);
  const pistol = body.getObjectByName('anchor_hip_r').children[0];
  assert.equal(pistol.scale.x, 1);
});

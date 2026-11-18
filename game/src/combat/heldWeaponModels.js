// The weapons on the lead's body: the one in hand rides the anchor_hand_r of the character model
// (barrel along the anchor's -Z, top towards the thumb), a handgun not in hand sits in the holster
// at anchor_hip_r and a long gun is slung at anchor_back. A weapon's model comes from the asset
// library when the artist's registry (assets/registry/weapons.js) has it, as `<weaponId>` or
// `weapon_<weaponId>`, with an optional node `muzzle`; until then a clearly temporary shape of
// boxes and cylinders stands in, built once per weapon and named `temporary-weapon-<id>`.
import * as THREE from 'three';

const LONG_GUNS = new Set(['smg', 'shotgun', 'rifle', 'sniper', 'heavy']);

/** Temporary shapes: [length, height, width] of the body, grip drop, muzzle point (local). */
const STAND_INS = Object.freeze({
  handgun: { body: [0.2, 0.045, 0.03], grip: 0.11, muzzle: [0, 0.03, -0.17] },
  smg: { body: [0.42, 0.07, 0.045], grip: 0.13, muzzle: [0, 0.03, -0.32] },
  shotgun: { body: [0.95, 0.06, 0.05], grip: 0.12, muzzle: [0, 0.03, -0.72] },
  rifle: { body: [0.88, 0.07, 0.045], grip: 0.13, muzzle: [0, 0.03, -0.64] },
  sniper: { body: [1.12, 0.07, 0.045], grip: 0.13, muzzle: [0, 0.03, -0.86] },
  heavy: { body: [1.1, 0.13, 0.13], grip: 0.14, muzzle: [0, 0.05, -0.7] },
  melee: { body: [0.04, 0.04, 0.8], grip: 0, muzzle: [0, 0, -0.75] },
  thrown: { body: [0.08, 0.08, 0.08], grip: 0, muzzle: [0, 0, -0.05] },
});

/**
 * Creates the held and holstered weapon models of one character instance.
 * @param {import('../core/systems/gameContext.js').GameContext} context
 * @param {Record<string, object>} catalog WEAPON_CATALOG.
 */
export function createHeldWeaponModels(context, catalog) {
  const metal = new THREE.MeshStandardMaterial({ color: 0x1d1f23, metalness: 0.65, roughness: 0.42 });
  const polymer = new THREE.MeshStandardMaterial({ color: 0x2b2a28, metalness: 0.1, roughness: 0.78 });
  const wood = new THREE.MeshStandardMaterial({ color: 0xa8774a, metalness: 0, roughness: 0.6 });
  /** @type {Map<string, THREE.Object3D>} */
  const models = new Map();
  const anchors = { hand: null, hip: null, back: null, owner: null };
  const muzzleWorld = new THREE.Vector3();
  let inHand = null, onHip = null, onBack = null;

  function standIn(weapon) {
    const kind = weapon.class === 'thrown' ? 'thrown' : weapon.class === 'melee' ? 'melee' : weapon.class;
    const shape = STAND_INS[kind] ?? STAND_INS.handgun;
    const group = new THREE.Group();
    group.name = `temporary-weapon-${weapon.id}`;
    group.userData.temporary = true;
    if (kind === 'melee') {
      const bat = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.017, weapon.id === 'baseball_bat' ? 0.84 : 0.6, 10), weapon.id === 'baseball_bat' ? wood : metal);
      bat.rotation.x = Math.PI / 2;
      bat.position.z = weapon.id === 'baseball_bat' ? -0.32 : -0.22;
      group.add(bat);
    } else if (kind === 'thrown') {
      group.add(new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), weapon.id === 'fire_bottle' ? wood : metal));
    } else {
      const [length, height, width] = shape.body;
      const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, length), metal);
      body.position.set(0, 0.03, -length * 0.5 + 0.06);
      group.add(body);
      const grip = new THREE.Mesh(new THREE.BoxGeometry(width * 0.9, shape.grip, 0.035), polymer);
      grip.position.set(0, -shape.grip * 0.35, 0.01);
      grip.rotation.x = -0.25;
      group.add(grip);
      if (kind !== 'handgun') {
        const stock = new THREE.Mesh(new THREE.BoxGeometry(width * 0.9, height * 1.3, 0.24), polymer);
        stock.position.set(0, 0.0, 0.17);
        group.add(stock);
      }
    }
    group.userData.muzzle = new THREE.Vector3().fromArray(shape.muzzle);
    return group;
  }

  function modelOf(weaponId) {
    if (models.has(weaponId)) return models.get(weaponId);
    const weapon = catalog[weaponId];
    let model = null;
    if (!weapon || weapon.class === 'unarmed') model = null;
    else {
      const assetId = [weaponId, `weapon_${weaponId}`].find((id) => context.assets && context.assets.has(id));
      if (assetId) {
        model = context.assets.instantiate(assetId, { lod: 0 });
        const muzzle = model.getObjectByName('muzzle') ?? model.getObjectByName('anchor_muzzle');
        model.userData.muzzleNode = muzzle ?? null;
        model.userData.muzzle = new THREE.Vector3(0, 0.03, -0.2);
      } else {
        model = standIn(weapon);
      }
      model.traverse((node) => { if (node.isMesh) { node.castShadow = true; node.frustumCulled = false; } });
    }
    models.set(weaponId, model);
    return model;
  }

  function place(model, anchor, slung) {
    if (!model) return;
    if (!anchor) { model.removeFromParent(); return; }
    if (model.parent !== anchor) anchor.add(model);
    // Slung: barrel up over the left shoulder, diagonally across the back, a little off the body.
    model.position.set(0, slung ? -0.1 : 0, slung ? -0.07 : 0);
    if (slung) model.rotation.set(Math.PI / 2, 0, 0.75);
    else model.rotation.set(0, 0, 0);
    model.visible = true;
  }

  return {
    /** Binds to a character instance (finds its anchors once). */
    attachTo(instance) {
      if (anchors.owner === instance) return;
      anchors.owner = instance;
      anchors.hand = instance ? instance.getObjectByName('anchor_hand_r') : null;
      anchors.hip = instance ? instance.getObjectByName('anchor_hip_r') : null;
      anchors.back = instance ? instance.getObjectByName('anchor_back') : null;
      inHand = onHip = onBack = null;
    },

    /**
     * Shows the weapon in hand and the ones carried.
     * @param {string | null} handId Weapon in hand (null or fists: empty hands).
     * @param {string | null} hipId Handgun to show holstered.
     * @param {string | null} backId Long gun to show slung.
     */
    show(handId, hipId, backId) {
      const hand = handId ? modelOf(handId) : null;
      const hip = hipId && hipId !== handId ? modelOf(hipId) : null;
      const back = backId && backId !== handId ? modelOf(backId) : null;
      if (hand !== inHand) { if (inHand && inHand !== hip && inHand !== back) inHand.removeFromParent(); place(hand, anchors.hand, false); inHand = hand; }
      if (hip !== onHip) { if (onHip && onHip !== hand) onHip.removeFromParent(); place(hip, anchors.hip, false); onHip = hip; }
      if (back !== onBack) { if (onBack && onBack !== hand) onBack.removeFromParent(); place(back, anchors.back, true); onBack = back; }
    },

    /** Hides every weapon (the lead is in a car or not drawn). */
    hideAll() {
      for (const model of [inHand, onHip, onBack]) if (model) model.removeFromParent();
      inHand = onHip = onBack = null;
    },

    /** World position of the muzzle of the weapon in hand (or the hand), or null. */
    muzzle() {
      if (inHand && inHand.parent) {
        const node = inHand.userData.muzzleNode;
        if (node) return node.getWorldPosition(muzzleWorld);
        return inHand.localToWorld(muzzleWorld.copy(inHand.userData.muzzle));
      }
      return anchors.hand ? anchors.hand.getWorldPosition(muzzleWorld) : null;
    },

    isLongGun: (weapon) => LONG_GUNS.has(weapon.class),
    isMelee: (weapon) => weapon.class === 'unarmed' || weapon.class === 'melee',
    get handAnchor() { return anchors.hand; },

    dispose() {
      this.hideAll();
      for (const model of models.values()) {
        if (!model || !model.userData.temporary) continue;
        model.traverse((node) => { if (node.isMesh) node.geometry.dispose(); });
      }
      metal.dispose(); polymer.dispose(); wood.dispose();
    },
  };
}

// The weapons on the lead's body: the one in hand rides the anchor_hand_r of the character model
// (weaponModels.js: the artist's model from set_handguns or set_long_guns, origin at the grip,
// barrel along the anchor's -Z), a handgun not in hand sits in the holster at anchor_hip_r
// (barrel down) and the last long gun carried is slung across the back at anchor_back. Each
// weapon's model is made once and kept.
import { createWeaponModel } from './weaponModels.js';

const LONG_GUNS = new Set(['smg', 'shotgun', 'rifle', 'sniper', 'heavy']);

/**
 * Creates the held and holstered weapon models of one character instance.
 * @param {import('../core/systems/gameContext.js').GameContext} context
 * @param {Record<string, object>} catalog WEAPON_CATALOG.
 */
export function createHeldWeaponModels(context, catalog) {
  /** @type {Map<string, ReturnType<typeof createWeaponModel> | null>} */
  const models = new Map();
  const anchors = { hand: null, hip: null, back: null, owner: null };
  let inHand = null, onHip = null, onBack = null;

  function modelOf(weaponId) {
    if (models.has(weaponId)) return models.get(weaponId);
    const weapon = catalog[weaponId];
    const model = !weapon || weapon.class === 'unarmed' ? null : createWeaponModel(context.assets ?? null, weapon);
    models.set(weaponId, model);
    return model;
  }

  function place(model, anchor, slung) {
    if (!model) return;
    const object = model.object;
    if (!anchor) { object.removeFromParent(); return; }
    if (object.parent !== anchor) anchor.add(object);
    // Slung: barrel up over the left shoulder, diagonally across the back, a little off the body.
    object.position.set(0, slung ? -0.1 : 0, slung ? -0.07 : 0);
    if (slung) object.rotation.set(Math.PI / 2, 0, 0.75);
    else object.rotation.set(0, 0, 0);
    object.visible = true;
  }

  const drop = (model, ...keep) => { if (model && !keep.includes(model)) model.object.removeFromParent(); };

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
      if (hand !== inHand) { drop(inHand, hip, back); place(hand, anchors.hand, false); inHand = hand; }
      if (hip !== onHip) { drop(onHip, hand); place(hip, anchors.hip, false); onHip = hip; }
      if (back !== onBack) { drop(onBack, hand); place(back, anchors.back, true); onBack = back; }
    },

    /** Hides every weapon (the lead is in a car or not drawn). */
    hideAll() {
      drop(inHand); drop(onHip); drop(onBack);
      inHand = onHip = onBack = null;
    },

    /** The model in hand ({object, muzzle, grip, hold}), or null. */
    get inHand() { return inHand; },

    /** World position of the muzzle of the weapon in hand (or the hand), or null. */
    muzzle(out) {
      if (inHand && inHand.object.parent) return inHand.muzzle.getWorldPosition(out);
      return anchors.hand ? anchors.hand.getWorldPosition(out) : null;
    },

    isLongGun: (weapon) => LONG_GUNS.has(weapon.class),
    isMelee: (weapon) => weapon.class === 'unarmed' || weapon.class === 'melee',
    get handAnchor() { return anchors.hand; },

    dispose() {
      this.hideAll();
      for (const model of models.values()) {
        if (model && model.temporary) model.object.traverse((node) => { if (node.isMesh) node.geometry.dispose(); });
      }
    },
  };
}

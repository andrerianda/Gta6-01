// Guns in crowd hands: an armed person's weapon is the combat system's model (combat.weaponModel)
// hung on the body's anchor_hand_r, held and aimed by the character run-time (holdWeapon,
// setWeaponGrip, aimAt) and fired through combat.fire from the model's muzzle. The recoil comes
// with WEAPON_FIRED (pedestrianCrowd.js). Models are kept for reuse, a few per weapon.
import { HAND_STANCES } from './crewIdle.js';

/**
 * Creates the crowd's gun handling.
 * @param {import('../core/systems/gameContext.js').GameContext} context
 */
export function createCrowdShooting(context) {
  const spare = new Map();
  let muzzle = null;
  const origin = { x: 0, y: 0, z: 0 }, towards = { x: 0, y: 0, z: 0 };
  const combat = () => context.systems.find('combat');

  /** Puts the person's weapon in their hand at the low ready; false when it cannot. */
  function draw(p) {
    if (p.gun) return true;
    const c = combat();
    if (!p.weaponId || !c || typeof c.weaponModel !== 'function' || typeof p.body.walker.holdWeapon !== 'function') return false;
    const body = p.body;
    if (body.hand === undefined) body.hand = body.instance.getObjectByName('anchor_hand_r') || null;
    if (!body.hand) return false;
    const list = spare.get(p.weaponId);
    const model = (list && list.pop()) || c.weaponModel(p.weaponId);
    if (!model || !model.hold) return false;
    body.hand.add(model.object);
    // A stance that takes the hands (a guard's clasp, hands behind the back) would keep the weapon
    // layer and the grip hands off: the gun's hands go to the low ready instead.
    if (HAND_STANCES.has(p.stance) && typeof body.walker.setStance === 'function') {
      body.walker.setStance('stand');
      p.stance = 'stand';
      p.idleStance = null;
    }
    body.walker.holdWeapon(model.hold);
    if (model.grip) body.walker.setWeaponGrip(model.grip.x, model.grip.y, model.grip.z);
    p.gun = model;
    return true;
  }

  /** Puts the weapon away (the model is kept for the next person). */
  function holster(p) {
    if (!p.gun) return;
    p.gun.object.removeFromParent();
    if (!spare.has(p.weaponId)) spare.set(p.weaponId, []);
    const list = spare.get(p.weaponId);
    if (list.length < 6) list.push(p.gun);
    p.body.walker.holdWeapon(null);
    p.gun = null;
  }

  /** The muzzle's world position (the hand's height when no gun is out). */
  function muzzleOf(p, out) {
    if (p.gun && p.gun.muzzle) {
      if (!muzzle) muzzle = p.gun.muzzle.position.clone();
      p.gun.muzzle.getWorldPosition(muzzle);
      out.x = muzzle.x; out.y = muzzle.y; out.z = muzzle.z;
    } else { out.x = p.x; out.y = p.entity.position.y + 1.4; out.z = p.z; }
    return out;
  }

  return {
    draw,
    holster,
    muzzleOf,
    /** Draws if needed and aims at a world point (call each frame); false without a gun. */
    aim(p, x, y, z) {
      if (!draw(p)) return false;
      p.body.walker.aimAt(x, y, z);
      return true;
    },
    /** Fires at a world point through combat.fire; returns its result or null. */
    fire(p, x, y, z, accuracy) {
      const c = combat();
      if (!p.gun || !c || typeof c.fire !== 'function') return null;
      muzzleOf(p, origin);
      towards.x = x - origin.x; towards.y = y - origin.y; towards.z = z - origin.z;
      return c.fire(p.entity, p.weaponId, origin, towards, { accuracy });
    },
  };
}

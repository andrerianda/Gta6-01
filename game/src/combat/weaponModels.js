// One weapon's model for anyone's hand: the artist's weapon from its set (set_handguns or
// set_long_guns, looked up by catalog id in WEAPON_SET_OBJECTS of assets/registry/weapons.js),
// cut out of an instance of the set at level 0 and moved to the origin so that it hangs on a
// character's anchor_hand_r as it is (origin at the grip, barrel along -Z, top +Y). It carries
// where its muzzle is (anchor_muzzle__<w>, or a melee weapon's tip), where the off hand closes
// (anchor_grip_off__<w>, in the weapon's own frame: what controller.setWeaponGrip takes) and
// which hold of the character run-time's aim layer suits it (controller.holdWeapon). When the
// set is not registered a clearly temporary shape of boxes stands in, named
// `temporary-weapon-<id>`. Police and gang programmers can use it for their shooters too.
import * as THREE from 'three';
import { WEAPON_SET_OBJECTS } from '../assets/registry/weapons.js';

/**
 * The character run-time's hold (WEAPON_HOLDS of characters/motion/aimPose.js) per weapon class.
 * Handguns use the one-handed hold: its arm reaches from the right shoulder with the chest bladed,
 * so seen over the right shoulder the pistol stands clear of the body (the two-handed hold keeps
 * it on the body's centre line, hidden behind the shoulder).
 */
export const CONTROLLER_HOLDS = Object.freeze({
  handgun: 'pistol', smg: 'smg', shotgun: 'shotgun', rifle: 'rifle', sniper: 'rifle', heavy: 'rifle',
});

/** Handguns are drawn a little larger than life so they read in the hand at 768x480. */
const HANDGUN_SCALE = 1.18;

/** Temporary shapes: [length, height, width] of the body and the muzzle point (local). */
const STAND_INS = Object.freeze({
  handgun: { body: [0.2, 0.045, 0.03], muzzle: [0, 0.03, -0.17] },
  smg: { body: [0.42, 0.07, 0.045], muzzle: [0, 0.03, -0.32] },
  shotgun: { body: [0.95, 0.06, 0.05], muzzle: [0, 0.03, -0.72] },
  rifle: { body: [0.88, 0.07, 0.045], muzzle: [0, 0.03, -0.64] },
  sniper: { body: [1.12, 0.07, 0.045], muzzle: [0, 0.03, -0.86] },
  heavy: { body: [1.1, 0.13, 0.13], muzzle: [0, 0.05, -0.7] },
  melee: { body: [0.8, 0.04, 0.04], muzzle: [0, 0, -0.75] },
  thrown: { body: [0.08, 0.08, 0.08], muzzle: [0, 0, -0.05] },
});

let standInMaterial = null;

/**
 * Makes the model of one weapon.
 * @param {{has: (id: string) => boolean, instantiate: (id: string, options?: object) => THREE.Object3D} | null} assets
 * @param {{id: string, class: string}} weapon A WEAPON_CATALOG entry (not fists).
 * @returns {{object: THREE.Object3D, muzzle: THREE.Object3D, grip: THREE.Vector3 | null,
 *   hold: string | null, temporary: boolean}}
 */
export function createWeaponModel(assets, weapon) {
  const spec = WEAPON_SET_OBJECTS[weapon.id];
  const hold = CONTROLLER_HOLDS[weapon.class] ?? null;
  let object = null;
  if (spec && assets && assets.has(spec.asset)) {
    const set = assets.instantiate(spec.asset, { lod: 0 });
    object = set.getObjectByName(spec.node);
    if (object) {
      object.removeFromParent();
      object.position.set(0, 0, 0);
      object.quaternion.identity();
      if (weapon.class === 'handgun') object.scale.setScalar(HANDGUN_SCALE);
    }
  }
  if (object) {
    object.name = `weapon-${weapon.id}`;
    const tipName = spec.anchors.muzzle ?? spec.anchors.tip;
    let muzzle = tipName ? object.getObjectByName(tipName) : null;
    if (!muzzle) { muzzle = new THREE.Object3D(); object.add(muzzle); }
    const gripNode = spec.anchors.gripOff ? object.getObjectByName(spec.anchors.gripOff) : null;
    const grip = gripNode ? gripNode.position.clone().multiply(object.scale) : null;
    object.traverse((node) => { if (node.isMesh) { node.castShadow = true; node.frustumCulled = false; } });
    return { object, muzzle, grip, hold, temporary: false };
  }
  return standIn(weapon, hold);
}

function standIn(weapon, hold) {
  standInMaterial ??= new THREE.MeshStandardMaterial({ color: 0x3a3c40, metalness: 0.5, roughness: 0.45 });
  const kind = STAND_INS[weapon.class] ? weapon.class : 'handgun';
  const shape = STAND_INS[kind];
  const object = new THREE.Group();
  object.name = `temporary-weapon-${weapon.id}`;
  const [length, height, width] = shape.body;
  const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, length), standInMaterial);
  body.position.set(0, 0.03, kind === 'melee' ? -0.3 : -length * 0.5 + 0.06);
  object.add(body);
  const muzzle = new THREE.Object3D();
  muzzle.position.fromArray(shape.muzzle);
  object.add(muzzle);
  return { object, muzzle, grip: null, hold, temporary: true };
}

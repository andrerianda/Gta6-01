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
import { WEAPON_HOLDS } from '../characters/motion/aimPose.js';

/**
 * The hold per weapon class when a catalog entry has no `stance` (older saves, tests). The
 * weapon's own stance (weaponCatalog.js, owner 09:15: every weapon its own stance) comes first.
 */
export const CONTROLLER_HOLDS = Object.freeze({
  handgun: 'pistol_two_hand', smg: 'smg', shotgun: 'shotgun', rifle: 'rifle', sniper: 'rifle', heavy: 'rifle',
});

/**
 * The character run-time's hold for a weapon: its stance's own `hold` once the run-time has
 * built it (a WEAPON_HOLDS key), else the stance's `baseHold`, else the class's; null when none
 * exists (melee and thrown weapons until their stances land: the arms swing free).
 * @param {{class: string, stance?: {hold?: string, baseHold?: string | null}}} weapon
 * @param {Record<string, unknown>} [holds] The run-time's WEAPON_HOLDS.
 * @returns {string | null}
 */
export function controllerHoldOf(weapon, holds = WEAPON_HOLDS) {
  const stance = weapon.stance;
  if (stance && stance.hold && holds[stance.hold]) return stance.hold;
  if (stance && stance.baseHold && holds[stance.baseHold]) return stance.baseHold;
  if (stance) return null;
  const hold = CONTROLLER_HOLDS[weapon.class];
  return hold && holds[hold] ? hold : null;
}

/** Holds seated at the wheel (drive-by): handguns one-handed out of the window. */
export const DRIVE_BY_HOLDS = Object.freeze({ handgun: 'pistol' });

/**
 * Scale of a weapon while it is in the hand (holstered and slung it is real size). Seen end-on
 * over the shoulder a true-size black pistol shrinks to the back of its slide behind the hand
 * (owner: "the gun is barely visible"), so handguns are drawn 15 % larger in the hand (the
 * owner's limit, 09:00), with the lifted finish below; long guns already read at real size.
 */
export const HELD_SCALE = Object.freeze({ handgun: 1.15, smg: 1.08 });

/**
 * Dark finishes lifted a little on our copies of a set's baked atlas so a black gun reads
 * against asphalt and tyres: base colour times `lift`, metalness times `metal` (a metallic flat
 * side mirrors the sky's dark lower half and goes black). Per weapon id, since one atlas serves a
 * whole set; the stainless revolver and the glass bottle stay as baked.
 */
const READABLE_FINISH = Object.freeze({
  metal: 0.6,
  lift: Object.freeze({ pistol: 1.8, smg: 1.6, pump_shotgun: 1.3, assault_rifle: 1.45, sniper_rifle: 1.45, rocket_launcher: 1.2 }),
});

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
 * @returns {{object: THREE.Object3D, muzzle: THREE.Object3D, muzzleAt: THREE.Vector3,
 *   grip: THREE.Vector3 | null, hold: string | null, heldScale: number, temporary: boolean}}
 *   muzzleAt and grip are in the weapon's own frame at real size (origin at the grip, -Z along
 *   the barrel, +Y the slide's top); in the hand the model is drawn at heldScale (HELD_SCALE).
 */
export function createWeaponModel(assets, weapon) {
  const spec = WEAPON_SET_OBJECTS[weapon.id];
  const hold = controllerHoldOf(weapon);
  let object = null;
  if (spec && assets && assets.has(spec.asset)) {
    const set = assets.instantiate(spec.asset, { lod: 0 });
    object = set.getObjectByName(spec.node);
    if (object) {
      object.removeFromParent();
      // Real size, in the palm: the owner's closer aim camera reads a true-scale pistol.
      object.position.set(0, 0, 0);
      object.quaternion.identity();
      object.scale.setScalar(1);
    }
  }
  if (object) {
    object.name = `weapon-${weapon.id}`;
    const tipName = spec.anchors.muzzle ?? spec.anchors.tip;
    let muzzle = tipName ? object.getObjectByName(tipName) : null;
    if (!muzzle) { muzzle = new THREE.Object3D(); object.add(muzzle); }
    const gripNode = spec.anchors.gripOff ? object.getObjectByName(spec.anchors.gripOff) : null;
    const grip = gripNode ? frameOf(gripNode, object) : null;
    const lift = READABLE_FINISH.lift[weapon.id] ?? 1;
    object.traverse((node) => { if (node.isMesh) { node.castShadow = true; node.frustumCulled = false; node.material = readable(node.material, lift); } });
    // The moving parts: the shotgun's pump (racked between shots), the magazine (the launcher's
    // loaded rocket, hidden once fired) and the launcher's exhaust (the back-blast).
    const pump = spec.pump ? object.getObjectByName(spec.pump) : null;
    const magazine = spec.magazine ? object.getObjectByName(spec.magazine) : null;
    const exhaust = spec.anchors.exhaust ? object.getObjectByName(spec.anchors.exhaust) : object.getObjectByName(`anchor_exhaust__${weapon.id}`);
    return {
      object, muzzle, muzzleAt: frameOf(muzzle, object), grip, hold, heldScale: HELD_SCALE[weapon.class] ?? 1, temporary: false,
      pump, pumpRestZ: pump ? pump.position.z : 0, magazine, exhaust: exhaust ?? null,
    };
  }
  return { ...standIn(weapon, hold), heldScale: HELD_SCALE[weapon.class] ?? 1, pump: null, pumpRestZ: 0, magazine: null, exhaust: null };
}

/** Our lifted copies of a set's atlas, one per source material and lift (shared by every gun). */
const lifted = new Map();
function readable(material, lift) {
  if (Array.isArray(material)) return material.map((each) => readable(each, lift));
  if (lift === 1 || !material || !material.isMeshStandardMaterial || material.transparent) return material;
  const key = `${material.uuid}:${lift}`;
  let copy = lifted.get(key);
  if (!copy) {
    copy = material.clone();
    copy.name = `${material.name || 'weapon'}-readable`;
    copy.color.multiplyScalar(lift);
    copy.metalness *= READABLE_FINISH.metal;
    lifted.set(key, copy);
  }
  return copy;
}

/** A node's position in the weapon's own frame (anchor_hand_r's frame once it is held). */
function frameOf(node, weapon) {
  const at = new THREE.Vector3();
  for (let each = node; each && each !== weapon; each = each.parent) {
    at.multiply(each.scale).applyQuaternion(each.quaternion).add(each.position);
  }
  return at;
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
  return { object, muzzle, muzzleAt: muzzle.position.clone(), grip: null, hold, temporary: true };
}

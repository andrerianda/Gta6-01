// What a gun leaves besides its muzzle flash and tracer (which combat sends), keyed on combat's
// WEAPON_FIRED {shooterId, weaponId, origin, direction}: a spent case thrown out of the ejection
// port and smoke wisps curling off a long gun's muzzle. For the gun in the lead's hand the port
// is the model's own anchor (anchor_eject__<weapon>, pointing the way the cases fly); for anyone
// else it is estimated along the barrel from the muzzle. Shots further than CASE_RANGE from the
// camera throw no case. (The rocket's back-blast is sent by combat, which knows the launcher's
// exhaust, as the recipe 'rocket_backblast'.) No allocation per shot after the first lookup of a
// weapon's anchor.

import * as THREE from 'three';
import { WEAPON_CATALOG } from '../catalog/weaponCatalog.js';

/** By weapon class: the case it throws, how far behind the muzzle its port is (m, at real
 * size), and how much smoke hangs at the muzzle after a shot (0: none). */
export const DISCHARGE_BY_CLASS = Object.freeze({
  handgun: { casing: 'pistol', back: 0.12, wisps: 0 },
  smg: { casing: 'steel', back: 0.2, wisps: 0.6 },
  rifle: { casing: 'rifle', back: 0.42, wisps: 1 },
  sniper: { casing: 'magnum', back: 0.55, wisps: 1.15 },
  shotgun: { casing: 'shell', back: 0.5, wisps: 1.3 },
});
/** Weapons that keep their cases (a revolver's stay in the cylinder). */
const KEEPS_CASES = new Set(['heavy_revolver']);
const CASE_RANGE = 35;

/**
 * Creates the discharge effects.
 * @param {{systems?: {find: Function}, view?: {camera: THREE.Camera}}} context The game context
 *   (the player system's figure and the camera; both optional).
 * @param {{spawn: Function, eject: Function}} director The effects director.
 */
export function createWeaponDischargeEffects(context, director) {
  // the lead's figure, whose gun in hand has the model's anchors
  const figureOf = (id) => {
    const player = context.systems?.find?.('player');
    return player?.entity && player.entity.id === id ? player.figure?.instance ?? null : null;
  };
  const camera = () => context.view?.camera ?? null;
  const port = new THREE.Vector3();
  const axis = new THREE.Vector3();
  const request = { effectId: '', position: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 0, z: 0 }, scale: 1 };
  /** Anchor names per weapon, and the anchors found on the last figure (null: none). */
  const names = new Map();
  const found = new Map();
  let foundOn = null;

  function ejectAnchorOf(figure, weaponId) {
    if (!figure) return null;
    if (foundOn !== figure) { found.clear(); foundOn = figure; }
    let name = names.get(weaponId);
    if (!name) { name = `anchor_eject__${weaponId}`; names.set(weaponId, name); }
    let node = found.get(name);
    // the gun in hand changes: look again when the anchor found is not on the figure any more
    if (node === undefined || (node && !isUnder(node, figure))) {
      node = figure.getObjectByName(name) ?? null;
      found.set(name, node);
    }
    return node && isShown(node) ? node : null;
  }

  function send(effectId, x, y, z, dx, dy, dz, scale) {
    request.effectId = effectId;
    request.position.x = x; request.position.y = y; request.position.z = z;
    request.direction.x = dx; request.direction.y = dy; request.direction.z = dz;
    request.scale = scale;
    director.spawn(request);
  }

  return {
    /** Handles one WEAPON_FIRED payload. */
    fired(payload) {
      const weapon = WEAPON_CATALOG[payload?.weaponId];
      const look = weapon && DISCHARGE_BY_CLASS[weapon.class];
      const o = payload.origin; const d = payload.direction;
      if (!look || !o || !d) return;
      const flat = Math.hypot(d.x, d.z) || 1;
      const ax = d.x / flat; const az = d.z / flat;
      if (look.wisps > 0) send('muzzle_wisps', o.x, o.y, o.z, d.x, d.y, d.z, look.wisps);
      if (!look.casing || KEEPS_CASES.has(weapon.id)) return;
      const eye = camera()?.matrixWorld?.elements;
      if (eye && Math.hypot(eye[12] - o.x, eye[13] - o.y, eye[14] - o.z) > CASE_RANGE) return;
      // out to the shooter's right and a little up, unless the model's port says otherwise
      let ex = -az; let ey = 0.35; let ez = ax;
      const node = ejectAnchorOf(figureOf(payload.shooterId), weapon.id);
      if (node) {
        node.getWorldPosition(port);
        // the anchor points the way the cases fly: its -Z, like the muzzle's
        node.getWorldDirection(axis).negate();
        if (Math.abs(axis.x * d.x + axis.y * d.y + axis.z * d.z) < 0.8) { ex = axis.x; ey = axis.y; ez = axis.z; }
      } else {
        port.set(o.x - d.x * look.back, o.y - d.y * look.back + 0.03, o.z - d.z * look.back);
      }
      const l = Math.hypot(ex, ey, ez) || 1;
      director.eject(look.casing, port.x, port.y, port.z, ex / l, ey / l, ez / l, ax, az);
    },
  };
}

function isUnder(node, root) {
  for (let n = node; n; n = n.parent) if (n === root) return true;
  return false;
}

function isShown(node) {
  for (let n = node; n; n = n.parent) if (!n.visible) return false;
  return true;
}

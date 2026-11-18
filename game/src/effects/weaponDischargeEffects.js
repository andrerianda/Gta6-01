// What a gun leaves besides its muzzle flash and tracer (which combat sends), keyed on combat's
// WEAPON_FIRED {shooterId, weaponId, origin, direction}: a spent case thrown out of the ejection
// port and smoke wisps curling off a long gun's muzzle. For the gun in the lead's hand the port
// is the model's own anchor (anchor_eject__<weapon>, pointing the way the cases fly); for anyone
// else it is estimated along the barrel from the muzzle. Shots further than CASE_RANGE from the
// camera throw no case. A pump or bolt gun keeps its case until the action is worked: the case
// flies at the back of the stroke (strokeEjectDelay: the timing of combat/pumpRack.js), or at the
// moment combat names with the command 'effects/eject' {shooterId, weaponId, origin?, direction?}
// (the WEAPON_FIRED payload; once combat calls it for a shooter, effects waits for its calls). (The rocket's back-blast is sent by combat as the recipe 'rocket_backblast'.) No
// allocation per shot after the first lookup of a weapon's anchor.

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
/** Cadences whose case leaves on the stroke of the action, not with the shot. */
const STROKE_CADENCES = new Set(['pump', 'bolt']);
const PENDING_SLOTS = 6;

/**
 * Seconds after the shot that a pump or bolt gun's case flies: the back of the stroke, as
 * combat/pumpRack.js moves the pump (a 0.1 s pause, then back over 45 % of the cycle).
 * @param {{cadence?: string, cycleSeconds?: number} | undefined} stance The weapon's stance.
 * @returns {number} 0 when the case flies with the shot.
 */
export function strokeEjectDelay(stance) {
  if (!stance || !STROKE_CADENCES.has(stance.cadence)) return 0;
  return 0.1 + 0.45 * Math.max(0.05, stance.cycleSeconds ?? 0.42);
}

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
  /** Shooters whose stroke combat announces itself ('effects/eject'). */
  const driven = new Set();
  /** Cases waiting for their stroke: fixed slots, due = Infinity when free. */
  const pending = Array.from({ length: PENDING_SLOTS }, () => ({ due: Infinity, shooterId: null, weapon: null, ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: -1 }));

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

  /** Throws the case of `weapon` fired by `shooterId` from muzzle o along d. */
  function throwCase(shooterId, weapon, ox, oy, oz, dx, dy, dz) {
    const look = DISCHARGE_BY_CLASS[weapon.class];
    const eye = camera()?.matrixWorld?.elements;
    if (eye && Math.hypot(eye[12] - ox, eye[13] - oy, eye[14] - oz) > CASE_RANGE) return;
    const flat = Math.hypot(dx, dz) || 1;
    const ax = dx / flat; const az = dz / flat;
    // out to the shooter's right and a little up, unless the model's port says otherwise
    let ex = -az; let ey = 0.35; let ez = ax;
    const node = ejectAnchorOf(figureOf(shooterId), weapon.id);
    if (node) {
      node.getWorldPosition(port);
      // the anchor points the way the cases fly: its -Z, like the muzzle's
      node.getWorldDirection(axis).negate();
      if (Math.abs(axis.x * dx + axis.y * dy + axis.z * dz) < 0.8) { ex = axis.x; ey = axis.y; ez = axis.z; }
    } else {
      port.set(ox - dx * look.back, oy - dy * look.back + 0.03, oz - dz * look.back);
    }
    const l = Math.hypot(ex, ey, ez) || 1;
    director.eject(look.casing, port.x, port.y, port.z, ex / l, ey / l, ez / l, ax, az);
  }

  /** The waiting slot of a shooter's weapon, or -1. */
  function pendingOf(shooterId, weapon) {
    for (let i = 0; i < PENDING_SLOTS; i += 1) {
      const slot = pending[i];
      if (slot.due !== Infinity && slot.shooterId === shooterId && slot.weapon === weapon) return i;
    }
    return -1;
  }

  function hold(shooterId, weapon, o, d, due) {
    let free = 0;
    for (let i = 0; i < PENDING_SLOTS; i += 1) {
      if (pending[i].due === Infinity) { free = i; break; }
      if (pending[i].due < pending[free].due) free = i;
    }
    const slot = pending[free];
    // a full list: the case due soonest flies now
    if (slot.due !== Infinity) throwCase(slot.shooterId, slot.weapon, slot.ox, slot.oy, slot.oz, slot.dx, slot.dy, slot.dz);
    slot.due = due; slot.shooterId = shooterId; slot.weapon = weapon;
    slot.ox = o.x; slot.oy = o.y; slot.oz = o.z; slot.dx = d.x; slot.dy = d.y; slot.dz = d.z;
  }

  const casedWeapon = (weaponId) => {
    const weapon = WEAPON_CATALOG[weaponId];
    const look = weapon && DISCHARGE_BY_CLASS[weapon.class];
    return look && look.casing && !KEEPS_CASES.has(weapon.id) ? weapon : null;
  };

  return {
    /** Handles one WEAPON_FIRED payload. */
    fired(payload) {
      const weapon = WEAPON_CATALOG[payload?.weaponId];
      const look = weapon && DISCHARGE_BY_CLASS[weapon.class];
      const o = payload?.origin; const d = payload?.direction;
      if (!look || !o || !d) return;
      if (look.wisps > 0) send('muzzle_wisps', o.x, o.y, o.z, d.x, d.y, d.z, look.wisps);
      if (!casedWeapon(weapon.id)) return;
      const delay = strokeEjectDelay(weapon.stance);
      if (delay > 0) {
        // when combat names this shooter's stroke itself, wait for its 'effects/eject' (a late
        // fallback in case the call does not come)
        hold(payload.shooterId, weapon, o, d, driven.has(payload.shooterId) ? delay * 3 : delay);
        return;
      }
      throwCase(payload.shooterId, weapon, o.x, o.y, o.z, d.x, d.y, d.z);
    },

    /** 'effects/eject': the action of a shooter's gun was worked now; its case flies. */
    eject(payload) {
      const weapon = casedWeapon(payload?.weaponId);
      if (!weapon) return false;
      driven.add(payload.shooterId);
      const i = pendingOf(payload.shooterId, weapon);
      const slot = i >= 0 ? pending[i] : null;
      if (slot) slot.due = Infinity;
      const o = payload.origin ?? (slot && { x: slot.ox, y: slot.oy, z: slot.oz });
      const d = payload.direction ?? (slot && { x: slot.dx, y: slot.dy, z: slot.dz });
      if (!o || !d) return false;
      throwCase(payload.shooterId, weapon, o.x, o.y, o.z, d.x, d.y, d.z);
      return true;
    },

    /** Per frame (not while the effects are frozen): cases whose stroke has come fly. */
    update(dt) {
      for (let i = 0; i < PENDING_SLOTS; i += 1) {
        const slot = pending[i];
        if (slot.due === Infinity) continue;
        slot.due -= dt;
        if (slot.due > 0) continue;
        slot.due = Infinity;
        throwCase(slot.shooterId, slot.weapon, slot.ox, slot.oy, slot.oz, slot.dx, slot.dy, slot.dz);
      }
    },

    /** Cases waiting for their stroke. */
    get waiting() {
      let n = 0;
      for (let i = 0; i < PENDING_SLOTS; i += 1) if (pending[i].due !== Infinity) n += 1;
      return n;
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

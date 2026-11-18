// The lead's hands: reads the on-foot and in-car actions, switches weapons (wheel, X and Z, the
// number keys weaponSlot1..8, Q to holster), reloads (R, or the trigger on an empty magazine),
// aims with the right mouse button through the screen centre, fires semi-automatic weapons per
// click and automatic ones while held, swings fists and bats, and at the wheel draws a drive-by
// weapon (catalog driveBy) and fires it at the reticle, held up over the seat. Each frame it puts the weapons on their anchors (heldWeaponModels.js) and poses the
// arms through the character run-time's aim layer on the lead's controller (player.figure.walker:
// holdWeapon at the low ready, aimAt the point under the reticle while aiming or just after a
// shot, play('fire') per shot, play('reload'), setWeaponGrip from the model's off-hand anchor);
// it asks the follow camera for the over-the-shoulder framing meanwhile and draws the reticle.
// Punches and bat swings, and the arms when the player gives no controller, use aimPose.js.
import * as THREE from 'three';
import { GAME_EVENTS } from '../core/events/gameEvents.js';
import { armAimPitch, createAimState, kickAfterShot, settleAim, spreadOf } from './aimingAndRecoil.js';
import { createAimPose } from './aimPose.js';
import { createAimReticle, reticleOpenness } from './aimReticle.js';
import { createHeldWeaponModels } from './heldWeaponModels.js';
import { DRIVE_BY_HOLDS } from './weaponModels.js';
import { createShotResult } from './hitDetection.js';

/** Weapons taken out of the car window when the one in hand cannot be, best first. */
const DRIVE_BY_CHOICE = ['smg', 'heavy_revolver', 'pistol'];
/** Seconds the weapon stays raised (and the camera in over the shoulder) after a hip-fired shot. */
const RAISED_AFTER_SHOT = 1.4;
/** The lead's shoulder above the feet (1.86 m lead; QA measured 1.51 m), and how far out the arm's aim point lies. */
const SHOULDER_HEIGHT = 1.5;
const ARM_TARGET_DISTANCE = 25;
const SLOT_ACTIONS = ['weaponSlot1', 'weaponSlot2', 'weaponSlot3', 'weaponSlot4', 'weaponSlot5', 'weaponSlot6', 'weaponSlot7', 'weaponSlot8'];

/**
 * Creates the lead's combat controller.
 * @param {import('../core/systems/gameContext.js').GameContext} context
 * @param {{inventory: object, firing: object, catalog: object, slots: object, rules: object, random: () => number}} parts
 */
export function createPlayerCombat(context, { inventory, firing, catalog, slots, rules, random }) {
  const held = createHeldWeaponModels(context, catalog);
  const reticle = context.page && context.page.document ? createAimReticle(context.page.document) : null;
  const aim = createAimState();
  const settled = { pitch: 0, yaw: 0 };
  const slotIds = Object.values(slots).sort((a, b) => a.index - b.index).map((slot) => slot.id);
  const aimPoint = new THREE.Vector3();
  const armTarget = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const origin = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const muzzleAt = new THREE.Vector3();
  const sight = createShotResult();
  const sightSkip = { shooterId: null, ignore: null };
  const ignoreCar = [null];
  const carMuzzle = new THREE.Vector3();
  const pose = { aiming: false, aimPoint, longGun: false, strike: 0, strikeKind: 'fist' };
  const how = { aiming: false, moving: 0, crouching: false, inVehicle: false, bloom: 0 };
  const status = { aiming: false, firing: false, recentShot: 0, strikeLeft: 0, strikeLength: 0, strikeDone: true, lastBackId: null, lastHipId: null };
  const arms = { walker: null, hold: null, raised: false, reloading: false };
  let figure = null, aimPoser = null, lastEquipped = '', lastMagazine = -1, lastReserve = -1;

  const lead = () => context.systems.find('player');
  const firearm = (weapon) => !held.isMelee(weapon) && weapon.class !== 'thrown';

  function announce(force) {
    const record = inventory.record, weapon = inventory.weapon;
    const ownerId = lead()?.entity?.id ?? null;
    const magazine = record ? record.magazine : 0, reserve = record ? record.reserve : 0;
    if (force || weapon.id !== lastEquipped) {
      lastEquipped = weapon.id;
      context.events.queue(GAME_EVENTS.WEAPON_EQUIPPED, { ownerId, weaponId: weapon.id, magazine: weapon.magazine === null ? null : magazine, reserve: weapon.magazine === null ? null : reserve });
    } else if (magazine === lastMagazine && reserve === lastReserve) return;
    lastMagazine = magazine; lastReserve = reserve;
    if (weapon.magazine !== null) context.events.queue(GAME_EVENTS.AMMO_CHANGED, { ownerId, weaponId: weapon.id, magazine, reserve });
  }

  /** The point at the screen centre: the first thing the camera's ray meets past the lead. */
  function findAimPoint(entity, from = entity.position) {
    const camera = context.view.camera;
    camera.getWorldDirection(forward);
    const p = from;
    const ahead = Math.max(0, (p.x - camera.position.x) * forward.x + (p.y + 1.4 - camera.position.y) * forward.y + (p.z - camera.position.z) * forward.z);
    origin.copy(camera.position).addScaledVector(forward, ahead + 0.5);
    sightSkip.shooterId = entity.id;
    firing.detector.cast(sight, origin.x, origin.y, origin.z, forward.x, forward.y, forward.z, 300, sightSkip);
    // Exactly under the centre reticle: the recoil kicks the camera itself (followCamera.addRecoil),
    // so the centre ray already rises with it.
    aimPoint.copy(origin).addScaledVector(forward, sight.hit ? sight.distance : 300);
    return aimPoint;
  }

  function bindFigure() {
    const parts = lead()?.figure ?? null;
    const walker = parts && parts.walker && typeof parts.walker.holdWeapon === 'function' ? parts.walker : null;
    // A new body (character switch) brings a new controller: start its hands afresh.
    if (walker !== arms.walker) { arms.walker = walker; arms.hold = null; arms.raised = false; arms.reloading = false; }
    const instance = parts?.instance ?? context.view.layers.dynamic.getObjectByName('player-lead');
    if (!instance || figure === instance) return;
    figure = instance;
    held.attachTo(instance);
    aimPoser = createAimPose(instance);
  }

  /**
   * Puts the weapon in the controller's hands, raised at the aim point while `raise` (on foot,
   * or seated in a car for a drive-by: the run-time aims over the seat).
   */
  function driveArms(weapon, raise, entity, from = entity.position) {
    const walker = arms.walker;
    const model = held.inHand;
    const seated = from !== entity.position;
    const hold = model && firearm(weapon) ? (seated ? DRIVE_BY_HOLDS[weapon.class] ?? model.hold : model.hold) : null;
    if (hold !== arms.hold) {
      walker.holdWeapon(hold);
      // The weapon's own anchors for the aim layer, in anchor_hand_r's frame (so times the scale
      // it is drawn at in the hand): the off hand's grip, and the muzzle, so the run-time can
      // lay the barrel on its sight line.
      const k = model ? model.heldScale ?? 1 : 1;
      if (hold && model.grip) walker.setWeaponGrip(model.grip.x * k, model.grip.y * k, model.grip.z * k);
      if (hold && model.muzzleAt && typeof walker.setWeaponMuzzle === 'function') walker.setWeaponMuzzle(model.muzzleAt.x * k, model.muzzleAt.y * k, model.muzzleAt.z * k);
      arms.hold = hold; arms.raised = false;
    }
    if (hold && raise && !seated) {
      // On foot the arm follows the camera's aim DIRECTION from the shoulder (owner, 09:00), not
      // the hit point under the reticle (on the pavement when the camera looks down): a point
      // far out along it, level within 15 degrees so the hand stays at shoulder height.
      // Bullets still fly from the muzzle to the hit point (shoot()).
      context.view.camera.getWorldDirection(forward);
      const flat = Math.hypot(forward.x, forward.z) || 1;
      const pitch = armAimPitch(Math.atan2(forward.y, flat));
      const reach = ARM_TARGET_DISTANCE * Math.cos(pitch) / flat;
      armTarget.set(from.x + forward.x * reach, from.y + SHOULDER_HEIGHT + Math.sin(pitch) * ARM_TARGET_DISTANCE, from.z + forward.z * reach);
      walker.aimAt(armTarget.x, armTarget.y, armTarget.z);
      arms.raised = true;
    } else if (hold && raise) {
      // Seated (drive-by): at the point under the reticle.
      findAimPoint(entity, from);
      walker.aimAt(aimPoint.x, aimPoint.y, aimPoint.z);
      arms.raised = true;
    } else if (arms.raised) {
      walker.lowerWeapon();
      arms.raised = false;
    }
    const reloading = inventory.reloading;
    if (hold && reloading && !arms.reloading) walker.play('reload', { duration: weapon.reloadSeconds || 1.6 });
    arms.reloading = reloading;
  }

  function readSwitching(input) {
    if (input.pressed('nextWeapon')) inventory.cycle(1);
    if (input.pressed('previousWeapon')) inventory.cycle(-1);
    for (let i = 0; i < SLOT_ACTIONS.length; i += 1) if (input.pressed(SLOT_ACTIONS[i])) inventory.selectSlot(slotIds[i]);
    if (input.pressed('holsterWeapon')) inventory.toggleHolster();
    if (input.pressed('reload')) inventory.startReload();
  }

  function shoot(entity, weapon, how) {
    if (!inventory.tryFire()) return;
    const muzzle = how.origin ?? held.muzzle(muzzleAt);
    if (muzzle) origin.copy(muzzle); else origin.set(entity.position.x, entity.position.y + 1.4, entity.position.z);
    const muzzleX = origin.x, muzzleY = origin.y, muzzleZ = origin.z;
    findAimPoint(entity, how.car ? how.car.position : entity.position);
    origin.set(muzzleX, muzzleY, muzzleZ);
    direction.subVectors(aimPoint, origin);
    if (direction.lengthSq() < 0.25) direction.copy(forward); else direction.normalize();
    const result = firing.fire(entity, weapon, origin, direction, { spread: spreadOf(weapon, { ...how, bloom: aim.bloom }, rules), ignore: how.ignore ?? null });
    kickAfterShot(aim, weapon, random());
    // The view kicks with the gun on every shot (followCamera springs it back in about 0.3 s).
    const camera = context.systems.find('followCamera');
    if (camera && typeof camera.addRecoil === 'function' && weapon.recoil > 0) camera.addRecoil(weapon.recoil * 0.55, (random() - 0.5) * weapon.recoil * 0.3);
    if (arms.walker && arms.hold) arms.walker.play('fire');
    if (reticle && result.hits > 0) reticle.hit(result.kills > 0);
    status.firing = true;
    status.recentShot = RAISED_AFTER_SHOT;
  }

  return {
    status,
    /** Per fixed step: switching, reloading, aiming, firing, strikes. */
    fixedUpdate(step) {
      const player = lead();
      const entity = player?.entity;
      const input = context.input;
      if (!entity) return;
      if (inventory.tick(step)) announce(false);
      settleAim(aim, step, settled);
      status.firing = false;
      if (status.recentShot > 0) status.recentShot = Math.max(0, status.recentShot - step);
      const inCar = player.mode === 'inVehicle';
      let weapon = inventory.weapon;
      if (inCar) {
        status.aiming = false;
        if (!weapon.driveBy) {
          if (input.pressed('driveByFire')) {
            const fallback = DRIVE_BY_CHOICE.find((id) => inventory.has(id));
            if (fallback) inventory.equip(fallback);
          }
          weapon = inventory.weapon;
        }
        const pull = weapon.automatic ? input.held('driveByFire') : input.pressed('driveByFire');
        const car = player.vehicle;
        if (pull && car && weapon.driveBy && weapon.class !== 'unarmed') {
          // From the gun the seated lead holds up (update() draws and aims it); before it is in
          // the hand, out of the window on the side the camera looks to (left of the heading is +side).
          ignoreCar[0] = car.id;
          if (!(held.inHand && held.inHand.object.parent && held.muzzle(carMuzzle))) {
            context.view.camera.getWorldDirection(forward);
            const h = car.heading ?? 0;
            const leftX = -Math.cos(h), leftZ = Math.sin(h);
            const side = forward.x * leftX + forward.z * leftZ >= 0 ? 1 : -1;
            carMuzzle.set(car.position.x + leftX * side * 1.05, car.position.y + 1.25, car.position.z + leftZ * side * 1.05);
          }
          shoot(entity, weapon, { aiming: true, moving: 0.5, inVehicle: true, ignore: ignoreCar, origin: carMuzzle, car });
        }
        announce(false);
        return;
      }
      readSwitching(input);
      weapon = inventory.weapon;
      const melee = held.isMelee(weapon);
      status.aiming = input.held('aim') && !melee;
      if (status.strikeLeft > 0) {
        status.strikeLeft = Math.max(0, status.strikeLeft - step);
        if (!status.strikeDone && status.strikeLeft <= status.strikeLength * 0.55) {
          status.strikeDone = true;
          origin.set(entity.position.x, entity.position.y + 1.35, entity.position.z);
          const h = (player.motion ? -player.motion.heading : 0);
          const facing = context.view.camera.getWorldDirection(forward);
          direction.set(facing.x, 0, facing.z);
          if (direction.lengthSq() < 1e-4) direction.set(-Math.sin(h), 0, -Math.cos(h));
          direction.normalize();
          const result = firing.fire(entity, weapon, origin, direction, { spread: 0 });
          if (reticle && result.hits > 0) reticle.hit(result.kills > 0);
        }
      } else if (melee && input.pressed('attack') && inventory.tryFire()) {
        status.strikeLength = status.strikeLeft = Math.min(0.6, 0.85 / weapon.fireRate);
        status.strikeDone = false;
      }
      if (!melee) {
        const pull = weapon.automatic ? input.held('attack') : input.pressed('attack');
        const speed = player.motion ? player.motion.groundSpeed ?? 0 : 0;
        if (pull) shoot(entity, weapon, { aiming: status.aiming, moving: Math.min(1, speed / 6), crouching: false });
      }
      announce(false);
    },

    /** Per frame, after the player posed the body: weapons on the body, arms, camera, reticle. */
    update(dt) {
      bindFigure();
      const player = lead();
      const entity = player?.entity;
      const onFoot = Boolean(player && player.mode === 'onFoot' && entity);
      const weapon = inventory.weapon;
      if (!figure) return;
      const framing = onFoot && firearm(weapon) && (status.aiming || status.recentShot > 0);
      // Drive-by: seated at the wheel, the gun is drawn and held up at the aim point while firing
      // and for a moment after (the run-time's aim layer works over the seat).
      const car = !onFoot && player && player.mode === 'inVehicle' ? player.vehicle : null;
      const driveBy = Boolean(car && entity && weapon.driveBy && firearm(weapon) && status.recentShot > 0);
      if (driveBy) {
        held.show(weapon.id, null, null);
        if (arms.walker) driveArms(weapon, true, entity, car.position);
      } else if (!onFoot) {
        held.hideAll();
        if (arms.walker && arms.hold) { arms.walker.holdWeapon(null); arms.hold = null; arms.raised = false; }
      } else {
        const handId = weapon.class === 'unarmed' ? null : weapon.id;
        if (weapon.class === 'handgun') status.lastHipId = weapon.id;
        if (held.isLongGun(weapon)) status.lastBackId = weapon.id;
        const hip = status.lastHipId ?? (inventory.has('pistol') ? 'pistol' : inventory.has('heavy_revolver') ? 'heavy_revolver' : null);
        held.show(handId, hip, status.lastBackId);
        if (arms.walker) driveArms(weapon, framing, entity);
        pose.aiming = !arms.walker && framing;
        pose.longGun = held.isLongGun(weapon);
        pose.strike = status.strikeLeft > 0 ? 1 - status.strikeLeft / status.strikeLength : 0;
        pose.strikeKind = weapon.id === 'fists' ? 'fist' : 'bat';
        if (pose.aiming || pose.strike > 0 || aimPoser?.weights.aim > 0.01) findAimPoint(entity);
        if (aimPoser) aimPoser.update(dt, pose);
      }
      const camera = context.systems.find('followCamera');
      if (camera && typeof camera.setAimFraming === 'function') camera.setAimFraming(framing);
      if (reticle) {
        const playing = context.state.is('playing');
        const show = playing && (framing || driveBy);
        const speed = player && player.motion ? player.motion.groundSpeed ?? 0 : 0;
        how.aiming = status.aiming || driveBy; how.moving = driveBy ? 0.5 : Math.min(1, speed / 6);
        how.inVehicle = driveBy; how.bloom = aim.bloom;
        reticle.update(dt, Boolean(show), reticleOpenness(spreadOf(weapon, how, rules), weapon.spread));
      }
    },

    announce,
    /** The lead's character controller when the player offers it (null: aimPose.js poses the arms). */
    get walker() { return arms.walker; },
    dispose() { held.dispose(); if (reticle) reticle.dispose(); },
  };
}

// The lead's hands: reads the on-foot and in-car actions, switches weapons (wheel, X and Z, the
// number keys weaponSlot1..8, Q to holster), reloads (R, or the trigger on an empty magazine),
// aims with the right mouse button through the screen centre, fires semi-automatic weapons per
// click and automatic ones while held, swings fists and bats, and at the wheel draws a drive-by
// weapon (catalog driveBy) and fires it at the reticle, held up over the seat. Each frame it puts the weapons on their anchors (heldWeaponModels.js) and poses the
// arms through the character run-time's aim layer on the lead's controller (player.figure.walker:
// holdWeapon at the low ready, aimAt the point under the reticle while aiming or just after a
// shot, play('fire') per shot, play('reload'), setWeaponGrip from the model's off-hand anchor);
// it asks the follow camera for the over-the-shoulder framing meanwhile and draws the reticle.
// Carried weapons take the run-time's carry holds by name (bat 'two_hand_bat', tire iron
// 'one_hand_club', grenade and bottle 'throw'): aimAt while the aim button is held, lowerWeapon
// otherwise; an attack plays 'swing' and the hit lands on its 'impact' event, a throw plays
// 'throw' and the projectile leaves on its 'release' event. Fists raise the boxing guard
// (setStance('guard')) while aiming or fighting and strike jab, cross, hook; the hit lands on the
// strike's impact. The arms when the player gives no controller use aimPose.js.
import * as THREE from 'three';
import { CARRY_HOLDS } from '../characters/motion/aimPose.js';
import { GAME_COMMANDS } from '../core/events/gameCommands.js';
import { GAME_EVENTS } from '../core/events/gameEvents.js';
import { armAimPitch, createAimState, kickAfterShot, settleAim, spreadOf } from './aimingAndRecoil.js';
import { createAimPose } from './aimPose.js';
import { createAimReticle, reticleOpenness } from './aimReticle.js';
import { createHeldWeaponModels } from './heldWeaponModels.js';
import { DRIVE_BY_HOLDS } from './weaponModels.js';
import { createShotResult } from './hitDetection.js';
import { createPumpRack } from './pumpRack.js';
import { createSniperScope } from './sniperScope.js';
import { createThrownProjectiles } from './thrownProjectiles.js';

/** Weapons taken out of the car window when the one in hand cannot be, best first. */
const DRIVE_BY_CHOICE = ['smg', 'heavy_revolver', 'pistol'];
/** Seconds the weapon stays raised (and the camera in over the shoulder) after a hip-fired shot. */
const RAISED_AFTER_SHOT = 1.4;
/** The lead's shoulder above the feet (1.86 m lead; QA measured 1.51 m), and how far out the arm's aim point lies. */
const SHOULDER_HEIGHT = 1.5;
const ARM_TARGET_DISTANCE = 25;
const SLOT_ACTIONS = ['weaponSlot1', 'weaponSlot2', 'weaponSlot3', 'weaponSlot4', 'weaponSlot5', 'weaponSlot6', 'weaponSlot7', 'weaponSlot8'];
/** Seconds of a carried hold's swing (bat, tire iron) and of a throw (the run-time's defaults). */
const SWING_SECONDS = Object.freeze({ two_hand_bat: 0.55, one_hand_club: 0.45 });
const THROW_SECONDS = 0.7;
/** The fists' strikes in turn (a combination within COMBO_GAP seconds), and how long the guard stays up after one. */
const FIST_STRIKES = ['jab', 'cross', 'hook'];
const COMBO_GAP = 0.9;
const GUARD_AFTER_STRIKE = 1.6;
/** A swing, strike or throw whose event never came (cancelled by a fall or a car) is forgotten after this. */
const ACTION_TIMEOUT = 1.5;

/** The run-time's carry hold of a melee or thrown weapon ('two_hand_bat', 'one_hand_club', 'throw'), or null. */
export function carryHoldOf(weapon) {
  const hold = weapon && weapon.stance ? weapon.stance.hold : null;
  return hold && CARRY_HOLDS[hold] ? hold : null;
}

/**
 * Creates the lead's combat controller.
 * @param {import('../core/systems/gameContext.js').GameContext} context
 * @param {{inventory: object, firing: object, catalog: object, slots: object, rules: object, random: () => number}} parts
 */
export function createPlayerCombat(context, { inventory, firing, catalog, slots, rules, random }) {
  const held = createHeldWeaponModels(context, catalog);
  const reticle = context.page && context.page.document ? createAimReticle(context.page.document) : null;
  const scope = context.page && context.page.document ? createSniperScope(context.page.document) : null;
  const projectiles = createThrownProjectiles(context, { firing, catalog });
  // At the back of the pump's (or bolt's) stroke the spent case flies (effects' 'effects/eject').
  const rack = createPumpRack({
    onBack(weapon) {
      const shooterId = lead()?.entity?.id;
      if (shooterId != null && context.commands.has('effects/eject')) context.commands.run('effects/eject', { shooterId, weaponId: weapon.id });
    },
  });
  const release = new THREE.Vector3();
  const exhaustAt = new THREE.Vector3();
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
  const arms = { walker: null, hold: null, raised: false, reloading: false, unsubscribe: null, guard: false };
  // The walker's swing, strike or throw under way: the weapon, its age, and the fists' combination.
  const act = { weapon: null, age: 0, guardLeft: 0, comboIndex: -1, sinceStrike: Infinity };
  let figure = null, aimPoser = null, lastEquipped = '', lastMagazine = -1, lastReserve = -1;

  const lead = () => context.systems.find('player');
  const firearm = (weapon) => !held.isMelee(weapon) && weapon.class !== 'thrown';
  const thrown = (weapon) => weapon.class === 'thrown';

  /** Where a throw leaves the hand: over the right shoulder, a little ahead (the preview's start too). */
  function releasePoint(entity, out) {
    const flat = Math.hypot(forward.x, forward.z) || 1;
    const fx = forward.x / flat, fz = forward.z / flat;
    return out.set(entity.position.x - fz * 0.28 + fx * 0.3, entity.position.y + 1.72, entity.position.z + fx * 0.28 + fz * 0.3);
  }

  /** The view's centre ray into `forward` (with the scope's breathing offset, the crosshair's ray). */
  function centreRay(camera) {
    return forward.set(0, 0, 0.5).unproject(camera).sub(camera.position).normalize();
  }

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
    centreRay(camera);
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

  /** Lands a melee hit (fists, bat, tire iron) in front of the lead, along the camera's flat view. */
  function meleeHit(entity, weapon) {
    origin.set(entity.position.x, entity.position.y + 1.35, entity.position.z);
    const facing = context.view.camera.getWorldDirection(forward);
    direction.set(facing.x, 0, facing.z);
    if (direction.lengthSq() < 1e-4) {
      const h = lead()?.motion ? -lead().motion.heading : 0;
      direction.set(-Math.sin(h), 0, -Math.cos(h));
    }
    direction.normalize();
    const result = firing.fire(entity, weapon, origin, direction, { spread: 0 });
    if (reticle && result.hits > 0) reticle.hit(result.kills > 0);
  }

  /** The walker's action events: a swing's or strike's impact lands the hit, a throw's release lets go. */
  function onAction(event) {
    const weapon = act.weapon;
    if (!weapon) return;
    const entity = lead()?.entity;
    if (event.stage === 'impact' && event.action !== 'throw' && entity) { act.weapon = null; meleeHit(entity, weapon); }
    else if (event.stage === 'release' && event.action === 'throw' && entity) {
      act.weapon = null;
      centreRay(context.view.camera);
      launch(entity, weapon);
      // The next one comes out of the pocket (the hand is empty meanwhile).
      if (inventory.weapon === weapon && inventory.record && inventory.record.magazine <= 0) inventory.startReload();
    } else if (event.stage === 'done' && (event.action === 'swing' || event.action === 'throw' || FIST_STRIKES.includes(event.action))) act.weapon = null;
  }

  /**
   * Starts the walker's swing, strike or throw for `weapon` (the round is already used).
   * @returns {boolean} False when the walker cannot (the caller lands it at once).
   */
  function startWalkerAction(weapon) {
    const walker = arms.walker;
    if (!walker || lead()?.mode !== 'onFoot') return false;
    if (weapon.id === 'fists') {
      act.comboIndex = act.sinceStrike < COMBO_GAP ? (act.comboIndex + 1) % FIST_STRIKES.length : 0;
      act.sinceStrike = 0; act.guardLeft = GUARD_AFTER_STRIKE;
      walker.play(FIST_STRIKES[act.comboIndex]);
    } else {
      const hold = carryHoldOf(weapon);
      if (!hold || arms.hold !== hold) return false;
      walker.play(hold === 'throw' ? 'throw' : 'swing', { duration: hold === 'throw' ? THROW_SECONDS : SWING_SECONDS[hold] ?? 0.5 });
    }
    act.weapon = weapon; act.age = 0;
    return true;
  }

  /** The boxing guard while the fists are out and the lead aims or has just struck. */
  function driveGuard(weapon, aimHeld, dt) {
    const walker = arms.walker;
    act.guardLeft = Math.max(0, act.guardLeft - dt);
    const want = Boolean(walker) && weapon.id === 'fists' && (aimHeld || act.guardLeft > 0);
    if (want && !arms.guard) { walker.setStance('guard'); arms.guard = true; }
    else if (!want && arms.guard) {
      if (walker && walker.stance === 'guard') walker.setStance('stand');
      arms.guard = false;
    }
  }

  function bindFigure() {
    const parts = lead()?.figure ?? null;
    const walker = parts && parts.walker && typeof parts.walker.holdWeapon === 'function' ? parts.walker : null;
    // A new body (character switch) brings a new controller: start its hands afresh.
    if (walker !== arms.walker) {
      if (arms.unsubscribe) arms.unsubscribe();
      arms.unsubscribe = walker && typeof walker.on === 'function' ? walker.on('action', onAction) : null;
      arms.walker = walker; arms.hold = null; arms.raised = false; arms.reloading = false; arms.guard = false; act.weapon = null;
    }
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
    const gun = firearm(weapon);
    // Melee and thrown weapons take their carry hold by name, on foot only (the run-time puts the
    // bat's support hand on the handle itself); fists take none (the guard is a stance).
    const hold = gun ? (model ? (seated ? DRIVE_BY_HOLDS[weapon.class] ?? model.hold : model.hold) : null) : (seated ? null : carryHoldOf(weapon));
    if (hold !== arms.hold) {
      walker.holdWeapon(hold);
      // The weapon's own anchors for the aim layer, in anchor_hand_r's frame (so times the scale
      // it is drawn at in the hand): the off hand's grip, and the muzzle, so the run-time can
      // lay the barrel on its sight line.
      const k = model ? model.heldScale ?? 1 : 1;
      if (hold && gun && model.grip) walker.setWeaponGrip(model.grip.x * k, model.grip.y * k, model.grip.z * k);
      if (hold && gun && model.muzzleAt && typeof walker.setWeaponMuzzle === 'function') walker.setWeaponMuzzle(model.muzzleAt.x * k, model.muzzleAt.y * k, model.muzzleAt.z * k);
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
    if (hold && gun && reloading && !arms.reloading) walker.play('reload', { duration: weapon.reloadSeconds || 1.6 });
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
    // A throw with the walker: the arm winds up and the projectile leaves on its 'release' event.
    if (weapon.projectile && !how.car) {
      if (!(thrown(weapon) && startWalkerAction(weapon))) launch(entity, weapon);
    } else {
      const result = firing.fire(entity, weapon, origin, direction, { spread: spreadOf(weapon, { ...how, bloom: aim.bloom }, rules), ignore: how.ignore ?? null });
      if (reticle && result.hits > 0) reticle.hit(result.kills > 0);
    }
    kickAfterShot(aim, weapon, random());
    // The hands kick by the stance's recoil (weaponCatalog stance.recoil: lift, recover, shake)
    // and the view a little with them (followCamera springs it back in about 0.3 s).
    const recoil = weapon.stance?.recoil ?? null;
    const lift = recoil ? recoil.lift : weapon.recoil;
    const camera = context.systems.find('followCamera');
    if (camera && typeof camera.addRecoil === 'function' && lift > 0) camera.addRecoil(lift * 0.22, (random() - 0.5) * lift * (0.3 + (recoil?.shake ?? 0)));
    if (arms.walker && arms.hold && !CARRY_HOLDS[arms.hold]) arms.walker.play('fire', recoil ?? undefined);
    rack.start(weapon, held.inHand, arms.hold ? arms.walker : null);
    status.firing = true;
    status.recentShot = RAISED_AFTER_SHOT;
  }

  /** A throw (from over the shoulder along the centre ray) or a rocket (from the muzzle, with its back-blast). */
  function launch(entity, weapon) {
    const model = held.inHand;
    const rocket = weapon.projectile.kind === 'rocket';
    if (!rocket) {
      releasePoint(entity, origin); direction.copy(forward);
      // The lead's throw swishes (other throwers get theirs through WEAPON_FIRED).
      if (context.commands.has(GAME_COMMANDS.AUDIO_PLAY)) context.commands.send(GAME_COMMANDS.AUDIO_PLAY, { soundId: 'throw_whoosh', position: { x: origin.x, y: origin.y, z: origin.z } });
    }
    const exhaust = rocket && model && model.exhaust && model.object.parent ? model.exhaust.getWorldPosition(exhaustAt) : null;
    projectiles.launch(entity, weapon, origin, direction, exhaust);
    if (rocket && model && model.magazine) model.magazine.visible = false;
    if (rocket) {
      context.events.queue(GAME_EVENTS.WEAPON_FIRED, {
        shooterId: entity.id, weaponId: weapon.id, origin: { x: origin.x, y: origin.y, z: origin.z },
        direction: { x: direction.x, y: direction.y, z: direction.z }, loudness: weapon.noiseRadius,
      });
    }
  }

  return {
    status,
    /** Per fixed step: switching, reloading, aiming, firing, strikes. */
    fixedUpdate(step) {
      const player = lead();
      const entity = player?.entity;
      const input = context.input;
      projectiles.fixedUpdate(step);
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
      act.sinceStrike += step;
      if (act.weapon && (act.age += step) > ACTION_TIMEOUT) act.weapon = null;
      if (status.strikeLeft > 0) {
        // Without the walker's events: the hit lands at 45 % of a timed strike (aimPose.js poses it).
        status.strikeLeft = Math.max(0, status.strikeLeft - step);
        if (!status.strikeDone && status.strikeLeft <= status.strikeLength * 0.55) {
          status.strikeDone = true;
          meleeHit(entity, weapon);
        }
      } else if (melee && !act.weapon && input.pressed('attack') && inventory.tryFire() && !startWalkerAction(weapon)) {
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
      const throwing = onFoot && thrown(weapon);
      const framing = onFoot && (firearm(weapon) || throwing) && (status.aiming || status.recentShot > 0);
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
        // A thrown weapon leaves the hand empty until the next one is taken out (its reload).
        const handId = weapon.class === 'unarmed' || (throwing && inventory.reloading) ? null : weapon.id;
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
        const inHand = held.inHand;
        rack.update(dt, arms.hold ? arms.walker : null);
        if (inHand && inHand.magazine && weapon.projectile?.kind === 'rocket') inHand.magazine.visible = (inventory.record?.magazine ?? 0) > 0;
      }
      const camera = context.systems.find('followCamera');
      if (camera && typeof camera.setAimFraming === 'function') camera.setAimFraming(framing);
      // The arc of a throw while one is aimed; the scope once the aim camera has come in.
      if (throwing && status.aiming && !inventory.reloading) {
        centreRay(context.view.camera);
        projectiles.preview(weapon, releasePoint(entity, release), forward, entity.id);
      } else projectiles.preview(null);
      const scoped = onFoot && weapon.scopeZoom && status.aiming && (camera?.aimBlend ?? 1) > 0.85 ? weapon : null;
      if (scope) scope.update(dt, context.view.camera, scoped, figure);
      if (reticle) {
        const playing = context.state.is('playing');
        const show = playing && (framing || driveBy) && !(scope && scope.amount > 0.2);
        const speed = player && player.motion ? player.motion.groundSpeed ?? 0 : 0;
        how.aiming = status.aiming || driveBy; how.moving = driveBy ? 0.5 : Math.min(1, speed / 6);
        how.inVehicle = driveBy; how.bloom = aim.bloom;
        reticle.update(dt, Boolean(show), reticleOpenness(spreadOf(weapon, how, rules), weapon.spread));
      }
    },

    announce,
    /** The lead's character controller when the player offers it (null: aimPose.js poses the arms). */
    get walker() { return arms.walker; },
    /** The flights in the air (thrownProjectiles.js). */
    get projectiles() { return projectiles; },
    dispose() { held.dispose(); projectiles.dispose(); if (reticle) reticle.dispose(); if (scope) scope.dispose(); },
  };
}

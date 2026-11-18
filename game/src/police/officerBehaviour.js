// Police officers on foot: each one a skinned person of the character run-time (police_officer_m and
// _f once they load, swat_officer for a tactical team; until then the dez_tolliver body repainted in
// the MPD uniform: navy jacket and trousers, sky-blue shirt, black boots), walked by the locomotion
// controller. An officer runs to the lead, stops at a few metres, draws and aims with both hands
// (two-bone IK on the arms over the running pose), and closes in to arrest a lead who has stopped;
// at three stars and above officers stop further out and shoot through combat.fire. Officers who
// came in a car go back to it when the lead drives away. Each officer is an entity tagged police
// and armed with data.health (the minimap blips them; the wanted level counts them as witnesses);
// hurt() applies DAMAGE_DEALT: a wound jolts the officer away from the shooter (play('hit')), a
// fatal one drops them the way the blow pushes (play('fall', {fromX, fromZ}): back, face down or on
// a side), tags them dead and removes them after a while. A moving car that runs an officer over
// throws them as a ragdoll (walker.ragdoll with the car's velocity and its body as a box); they get
// up unless it killed them, and a lead at the wheel is reported (assault on, or killing, an officer).
import { setPaint } from '../assets/index.js';
import { ENTITY_KINDS, ENTITY_TAGS } from '../core/entities/entityKinds.js';
import { GAME_COMMANDS } from '../core/events/gameCommands.js';
import { createLocomotionController } from '../characters/controller/locomotionController.js';
import { reachWithLimb } from '../characters/ik/limbPosing.js';
import { ARM_L, ARM_R } from '../characters/skeleton/humanSkeleton.js';
import { carStrikes, strikeDamage } from './crashRules.js';

/** The officer models of the character artist, used in turn once loaded. */
const OFFICER_MODELS = Object.freeze(['police_officer_m', 'police_officer_f', 'police_officer']);
/** The tactical team's model. */
const SWAT_MODELS = Object.freeze(['swat_officer']);
/** The body worn until then. */
const STAND_IN = 'dez_tolliver';
/** The uniform painted on the stand-in body (FACTION_MEMBERS.patrol_officer). */
const UNIFORM = Object.freeze({ paint_jacket: '#1B2A41', paint_top: '#8FB8D8', paint_bottom: '#1B2A41', paint_shoes: '#1A1A1C' });
/** What officers do. */
export const OFFICER_STATE = Object.freeze({ RUN: 'run', AIM: 'aim', ARREST: 'arrest', BOARD: 'board', DOWN: 'down', KNOCKED: 'knocked' });
/** How officers use their sidearm when lethal force is allowed. */
export const OFFICER_FIRE = Object.freeze({
  weaponId: 'pistol', aimDistance: 15, range: 32, firstShot: [0.6, 1.4], between: [0.55, 1.5], muzzleHeight: 1.42, muzzleAhead: 0.55,
});
const AIM_DISTANCE = 7;
const RUN_SPEED = 5.6;
const REMOVE_AFTER = 12;
const vehicleFilter = { kind: ENTITY_KINDS.VEHICLE };
const STILL = Object.freeze({ moveX: 0, moveZ: 0, facing: NaN });

/**
 * Creates the officers' squad.
 * @param {import('../core/systems/gameContext.js').GameContext} context
 * @returns {object} spawn, remove, hurt, update, list, removeAll.
 */
export function createOfficerSquad(context) {
  const city = context.systems.find('openWorldCity');
  const generator = context.random('policeOfficers');
  const next = typeof generator === 'function' ? generator : () => generator.next();
  const between = (range) => range[0] + next() * (range[1] - range[0]);
  const origin = { x: 0, y: 0, z: 0 };
  const direction = { x: 0, y: 0, z: 0 };
  const nearby = [];
  const carBox = { x: 0, y: 0, z: 0, hx: 0.95, hy: 0.7, hz: 2.3, yaw: 0 };
  const ground = city ? (x, z) => city.groundHeightAt(x, z) : undefined;
  const list = [];
  let seed = 11;

  /** The first loaded model of a list, taken in turn; null when none is loaded. */
  function pickModel(ids) {
    const loaded = ids.filter((id) => context.assets?.has?.(id));
    return loaded.length ? loaded[list.length % loaded.length] : null;
  }

  /**
   * Puts an officer on the street.
   * @param {number} x
   * @param {number} z
   * @param {number} yaw rotation.y
   * @param {number} unitId The unit they belong to.
   * @param {{swat?: boolean}} [options] swat: the tactical team's gear.
   */
  function spawn(x, z, yaw, unitId, options = {}) {
    const modelId = (options.swat && pickModel(SWAT_MODELS)) || pickModel(OFFICER_MODELS) || STAND_IN;
    const instance = context.assets.instantiate(modelId, { lod: 0 });
    if (modelId === STAND_IN) for (const name in UNIFORM) setPaint(instance, UNIFORM[name], name);
    instance.traverse((node) => {
      if (node.isMesh) {
        node.castShadow = true;
        node.frustumCulled = false;
      }
    });
    const y = city ? city.groundHeightAt(x, z) : 0;
    instance.position.set(x, y, z);
    instance.rotation.y = yaw;
    context.view.layers.dynamic.add(instance);
    seed += 7;
    const walker = createLocomotionController(instance, { seed, yaw });
    const position = instance.position.clone();
    const entity = context.entities.add({
      kind: ENTITY_KINDS.CHARACTER, owner: 'policeDispatch', position, heading: yaw, radius: 0.4,
      tags: [ENTITY_TAGS.POLICE, ENTITY_TAGS.ARMED], data: { unitId, state: OFFICER_STATE.RUN, aim: 0, health: 100, maxHealth: 100, factionId: 'mpd', modelId },
    });
    const officer = {
      entity, instance, walker, unitId, modelId, state: OFFICER_STATE.RUN, aim: 0, dead: false, deadSeconds: 0, removed: false,
      cooldown: between(OFFICER_FIRE.firstShot), input: { moveX: 0, moveZ: 0, facing: NaN, measuredSpeed: undefined }, home: null,
    };
    list.push(officer);
    return officer;
  }

  function remove(officer) {
    const index = list.indexOf(officer);
    if (index >= 0) list.splice(index, 1);
    officer.removed = true;
    officer.instance.removeFromParent();
    context.entities.remove(officer.entity);
  }

  /** Takes health; at 0 the officer is down for good (untagged police and armed, tagged dead). */
  function wound(officer, amount) {
    const data = officer.entity.data;
    data.health = Math.max(0, data.health - amount);
    if (data.health > 0) return false;
    officer.dead = true;
    officer.state = OFFICER_STATE.DOWN;
    data.state = OFFICER_STATE.DOWN;
    context.entities.removeTag(officer.entity, ENTITY_TAGS.POLICE);
    context.entities.removeTag(officer.entity, ENTITY_TAGS.ARMED);
    context.entities.addTag(officer.entity, ENTITY_TAGS.DEAD);
    return true;
  }

  /**
   * Applies DAMAGE_DEALT aimed at an officer.
   * @param {number} targetId The entity hit.
   * @param {number} amount Health lost.
   * @param {{x: number, z: number} | null} [from] Where the blow came from (the shooter), world.
   * @returns {boolean} True when the target was one of ours.
   */
  function hurt(targetId, amount, from = null) {
    for (let i = 0; i < list.length; i += 1) {
      const officer = list[i];
      if (officer.entity.id !== targetId) continue;
      if (officer.dead) return true;
      const at = officer.instance.position;
      const blow = from ? { fromX: from.x - at.x, fromZ: from.z - at.z } : undefined;
      const fatal = wound(officer, amount);
      if (officer.walker.ragdolling) return true;
      if (fatal) officer.walker.play('fall', blow);
      else officer.walker.play('hit', { ...blow, strength: Math.min(1.3, 0.5 + amount / 40) });
      return true;
    }
    return false;
  }

  /** A car running into the officer: thrown as a ragdoll, hurt, and the lead reported if driving. */
  function struck(officer, car) {
    const speed = car.data.speed ?? 0;
    const lethal = officer.entity.data.health - strikeDamage(Math.abs(speed)) <= 0;
    const fx = -Math.sin(car.heading);
    const fz = -Math.cos(car.heading);
    carBox.x = car.position.x;
    carBox.y = car.position.y + 0.7;
    carBox.z = car.position.z;
    carBox.yaw = car.heading;
    officer.walker.ragdoll({
      vx: fx * speed * 0.85, vy: 1.2 + Math.abs(speed) * 0.08, vz: fz * speed * 0.85, at: 0.3, spin: (next() - 0.5) * 3,
      ground, boxes: [carBox], getUp: !lethal,
    });
    officer.state = OFFICER_STATE.KNOCKED;
    officer.aim = 0;
    wound(officer, strikeDamage(Math.abs(speed)));
    if (car.tags.has(ENTITY_TAGS.PLAYER) && context.commands.has(GAME_COMMANDS.CRIME_REPORT)) {
      const at = officer.instance.position;
      context.commands.send(GAME_COMMANDS.CRIME_REPORT, {
        crimeId: lethal ? 'officer_down' : 'assault_on_officer', offenderId: car.id, victimId: officer.entity.id, position: { x: at.x, y: at.y, z: at.z },
      });
    }
  }

  /** The first moving car about to run this officer over, or null. */
  function strikingCar(officer) {
    const at = officer.instance.position;
    const count = context.entities.within(at.x, at.z, 4, vehicleFilter, nearby).length;
    let hit = null;
    for (let i = 0; i < count && !hit; i += 1) {
      const car = nearby[i];
      if (carStrikes(at.x - car.position.x, at.z - car.position.z, car.heading, car.data?.speed ?? 0)) hit = car;
    }
    nearby.length = 0;
    return hit;
  }

  function poseAim(officer, amount) {
    if (amount <= 0.01) return;
    const rig = officer.walker.rig;
    const p = rig.fk.position;
    const s = ARM_R.upper * 3;
    const tx = p[s] * 0.25;
    const ty = p[s + 1] - 0.04 - (1 - amount) * 0.55;
    const tz = p[s + 2] - 0.62 * amount - 0.12;
    reachWithLimb(rig.pose, rig.body, rig.fk, ARM_R, tx, ty, tz, 0.7, -0.7, 0.1);
    reachWithLimb(rig.pose, rig.body, rig.fk, ARM_L, tx - 0.05, ty - 0.03, tz + 0.07, -0.7, -0.7, 0.1);
    rig.applyPose();
  }

  /** One shot from the officer's sidearm at the lead's chest (or the car they drive). */
  function shoot(officer, lead, combat) {
    const at = officer.instance.position;
    const yaw = officer.walker.state.yaw;
    origin.x = at.x - Math.sin(yaw) * OFFICER_FIRE.muzzleAhead;
    origin.y = at.y + OFFICER_FIRE.muzzleHeight;
    origin.z = at.z - Math.cos(yaw) * OFFICER_FIRE.muzzleAhead;
    direction.x = lead.x - origin.x;
    direction.y = lead.y + (lead.inVehicle ? 0.8 : 1.25) - origin.y;
    direction.z = lead.z - origin.z;
    const length = Math.hypot(direction.x, direction.y, direction.z) || 1;
    direction.x /= length;
    direction.y /= length;
    direction.z /= length;
    combat.fire(officer.entity, OFFICER_FIRE.weaponId, origin, direction);
  }

  /** Down, thrown or getting up: the controller moves the body; the entity follows it. */
  function lieStill(officer, dt) {
    officer.walker.update(dt, STILL);
    officer.entity.position.copy(officer.instance.position);
    if (officer.dead) {
      officer.deadSeconds += dt;
      if (officer.deadSeconds > REMOVE_AFTER) remove(officer);
    }
  }

  /** True while a living officer is thrown, lying or getting up. */
  function knocked(officer) {
    const walker = officer.walker;
    return walker.ragdolling || walker.action === 'fall' || walker.action === 'getup' || walker.stance === 'fallen';
  }

  /**
   * Moves, turns, poses and fires every officer for this frame.
   * @param {number} dt
   * @param {{x: number, y: number, z: number, speed: number, inVehicle: boolean}} lead Where the lead is.
   * @param {(officer: object) => {x: number, z: number} | null} homeOf The car an officer returns to.
   * @param {boolean} arresting True when the rules allow an arrest now (one or two stars).
   * @param {boolean} shooting True when officers open fire (three stars and above).
   */
  function update(dt, lead, homeOf, arresting, shooting) {
    const combat = shooting ? context.systems.find('combat') : null;
    const aimDistance = shooting ? OFFICER_FIRE.aimDistance : AIM_DISTANCE;
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const officer = list[i];
      if (!officer.walker.ragdolling) {
        const car = strikingCar(officer);
        if (car) struck(officer, car);
      }
      if (officer.dead || knocked(officer)) {
        lieStill(officer, dt);
        continue;
      }
      const at = officer.instance.position;
      let tx = lead.x;
      let tz = lead.z;
      const leadDistance = Math.hypot(lead.x - at.x, lead.z - at.z);
      const home = homeOf(officer);
      if (home && lead.speed > 6 && leadDistance > 18) officer.state = OFFICER_STATE.BOARD;
      else if (arresting && lead.speed < 2 && leadDistance < AIM_DISTANCE + 4) officer.state = OFFICER_STATE.ARREST;
      else if (leadDistance < aimDistance) officer.state = OFFICER_STATE.AIM;
      else officer.state = OFFICER_STATE.RUN;
      if (officer.state === OFFICER_STATE.BOARD) {
        tx = home.x;
        tz = home.z;
      }
      const dx = tx - at.x;
      const dz = tz - at.z;
      const distance = Math.hypot(dx, dz) || 1;
      const stopAt = officer.state === OFFICER_STATE.ARREST ? 1.4 : officer.state === OFFICER_STATE.AIM ? distance : 0;
      const speed = distance > stopAt + 0.3 ? Math.min(RUN_SPEED, (distance - stopAt) * 2) : 0;
      officer.input.moveX = (dx / distance) * speed;
      officer.input.moveZ = (dz / distance) * speed;
      officer.input.facing = Math.atan2(-(lead.x - at.x), -(lead.z - at.z));
      officer.walker.update(dt, officer.input);
      at.x += officer.walker.state.vx * dt;
      at.z += officer.walker.state.vz * dt;
      if (city) at.y = city.groundHeightAt(at.x, at.z);
      const wantsAim = officer.state === OFFICER_STATE.AIM || officer.state === OFFICER_STATE.ARREST ? 1 : 0;
      officer.aim += (wantsAim - officer.aim) * Math.min(1, dt * 6);
      poseAim(officer, officer.aim);
      if (combat && typeof combat.fire === 'function' && officer.aim > 0.8 && leadDistance < OFFICER_FIRE.range) {
        officer.cooldown -= dt;
        if (officer.cooldown <= 0) {
          officer.cooldown = between(OFFICER_FIRE.between);
          shoot(officer, lead, combat);
        }
      }
      officer.entity.position.copy(at);
      officer.entity.heading = officer.walker.state.yaw;
      officer.entity.data.state = officer.state;
      officer.entity.data.aim = officer.aim;
    }
  }

  return {
    list,
    spawn,
    remove,
    hurt,
    update,
    removeAll() {
      for (let i = list.length - 1; i >= 0; i -= 1) remove(list[i]);
    },
  };
}

// Police officers on foot: each one a skinned person of the character run-time (police_officer_m and
// _f once they load; until then the dez_tolliver body repainted in the MPD uniform: navy
// jacket and trousers, sky-blue shirt, black boots), walked by the locomotion controller. An
// officer runs to the lead, stops at a few metres, draws and aims with both hands (two-bone IK on
// the arms over the running pose), and closes in to arrest a lead who has stopped; at three stars
// and above officers stop further out and shoot through combat.fire. Officers who came in a car go
// back to it when the lead drives away. Each officer is an entity tagged police and armed with
// data.health (the minimap blips them; the wanted level counts them as witnesses); hurt() applies
// DAMAGE_DEALT, and a downed officer falls, loses the police tag and is removed after a while.
import { setPaint } from '../assets/index.js';
import { ENTITY_KINDS, ENTITY_TAGS } from '../core/entities/entityKinds.js';
import { createLocomotionController } from '../characters/controller/locomotionController.js';
import { reachWithLimb } from '../characters/ik/limbPosing.js';
import { ARM_L, ARM_R } from '../characters/skeleton/humanSkeleton.js';

/** The officer models of the character artist, used in turn once loaded. */
const OFFICER_MODELS = Object.freeze(['police_officer_m', 'police_officer_f', 'police_officer']);
/** The body worn until then. */
const STAND_IN = 'dez_tolliver';
/** The uniform painted on the stand-in body (FACTION_MEMBERS.patrol_officer). */
const UNIFORM = Object.freeze({ paint_jacket: '#1B2A41', paint_top: '#8FB8D8', paint_bottom: '#1B2A41', paint_shoes: '#1A1A1C' });
/** What officers do. */
export const OFFICER_STATE = Object.freeze({ RUN: 'run', AIM: 'aim', ARREST: 'arrest', BOARD: 'board', DOWN: 'down' });
/** How officers use their sidearm when lethal force is allowed. */
export const OFFICER_FIRE = Object.freeze({
  weaponId: 'pistol', aimDistance: 15, range: 32, firstShot: [0.6, 1.4], between: [0.55, 1.5], muzzleHeight: 1.42, muzzleAhead: 0.55,
});
const AIM_DISTANCE = 7;
const RUN_SPEED = 5.6;
const FALL_SECONDS = 0.55;
const REMOVE_AFTER = 10;

/**
 * Creates the officers' squad.
 * @param {import('../core/systems/gameContext.js').GameContext} context
 * @returns {object} spawn, remove, hurt, update, list, removeAll.
 */
export function createOfficerSquad(context) {
  const city = context.systems.find('openWorldCity');
  const models = OFFICER_MODELS.filter((id) => context.assets?.has?.(id));
  const generator = context.random('policeOfficers');
  const next = typeof generator === 'function' ? generator : () => generator.next();
  const between = (range) => range[0] + next() * (range[1] - range[0]);
  const origin = { x: 0, y: 0, z: 0 };
  const direction = { x: 0, y: 0, z: 0 };
  const list = [];
  let seed = 11;

  function spawn(x, z, yaw, unitId) {
    const modelId = models.length ? models[list.length % models.length] : STAND_IN;
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
      tags: [ENTITY_TAGS.POLICE, ENTITY_TAGS.ARMED], data: { unitId, state: OFFICER_STATE.RUN, aim: 0, health: 100, maxHealth: 100, factionId: 'mpd' },
    });
    const officer = {
      entity, instance, walker, unitId, state: OFFICER_STATE.RUN, aim: 0, dead: false, deadSeconds: 0, removed: false,
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

  /**
   * Applies DAMAGE_DEALT aimed at an officer.
   * @param {number} targetId The entity hit.
   * @param {number} amount Health lost.
   * @returns {boolean} True when the target was one of ours.
   */
  function hurt(targetId, amount) {
    for (let i = 0; i < list.length; i += 1) {
      const officer = list[i];
      if (officer.entity.id !== targetId) continue;
      if (officer.dead) return true;
      const data = officer.entity.data;
      data.health = Math.max(0, data.health - amount);
      if (data.health <= 0) {
        officer.dead = true;
        officer.state = OFFICER_STATE.DOWN;
        data.state = OFFICER_STATE.DOWN;
        context.entities.removeTag(officer.entity, ENTITY_TAGS.POLICE);
        context.entities.removeTag(officer.entity, ENTITY_TAGS.ARMED);
        officer.instance.rotation.order = 'YXZ';
      }
      return true;
    }
    return false;
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

  function fall(officer, dt) {
    officer.deadSeconds += dt;
    const t = Math.min(1, officer.deadSeconds / FALL_SECONDS);
    officer.instance.rotation.x = -Math.PI / 2 * t * t;
    if (officer.deadSeconds > REMOVE_AFTER) remove(officer);
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
      if (officer.dead) {
        fall(officer, dt);
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

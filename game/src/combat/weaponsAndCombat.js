// Weapons and combat: fists, a bat and the tire iron, six firearms, thrown weapons and the rocket
// launcher of the weapon catalog. The lead carries an inventory (wheel, X/Z, number keys, Q to
// holster, R to reload), aims with the right mouse button through the screen centre, fires with
// the left (spread, bloom and recoil), punches and swings, and shoots out of a car window. Shots
// are traced with physics rays against the city and vehicles and against each person's body and
// head; hits become DAMAGE_DEALT for the target's owner, kills CHARACTER_KILLED (once per death),
// the lead's shots CRIME_COMMITTED, and every shot a muzzle flash, tracer and impact (EFFECT_SPAWN).
// The artist's weapon rides the lead's hand, posed by the character run-time's aim layer.
// Contract: docs/ARCHITECTURE.md, "combat".
//
// FOR POLICE AND GANG SHOOTERS
//   const combat = context.systems.find('combat');
//   combat.fire(shooterEntity, 'pistol', muzzle, towards, { accuracy: 0.6, walker });
//     muzzle {x,y,z} world; towards {x,y,z} any length (target point minus muzzle is fine);
//     accuracy 0..1 (1 = the weapon's aimed spread, 0.5 = twice as wide; default 0.67);
//     ignore: physics userRefs to shoot through (the shooter's car); walker: the shooter's
//     locomotion controller, which then plays its 'fire' recoil. Returns {hits, kills} or null.
//     Sends WEAPON_FIRED, effects, DAMAGE_DEALT, CHARACTER_KILLED; never a crime (only the lead's).
//   combat.weaponModel('pistol') -> {object, muzzle, grip, hold}: hang `object` on the shooter's
//     rig.node('anchor_hand_r'), then walker.holdWeapon(hold), walker.setWeaponGrip(grip) when
//     grip, walker.aimAt(target) and muzzle.getWorldPosition(v) for fire().
// Deaths: keep data.health on your people and apply DAMAGE_DEALT to it (tag 'dead' at 0).
//
// Public: `inventory`, `aiming`, `aimFraming`, `fire`, `weaponModel`, `serialise()` /
// `restore(data)`. Command PLAYER_GIVE_WEAPON {weaponId, ammo?}. Publishes WEAPON_FIRED,
// WEAPON_EQUIPPED, AMMO_CHANGED, DAMAGE_DEALT, CHARACTER_KILLED, CRIME_COMMITTED,
// EXPLOSION_DETONATED (through physics.explode).
import { GAME_COMMANDS } from '../core/events/gameCommands.js';

/**
 * Creates the weapons and combat system.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {import('../core/systems/gameSystemContract.js').GameSystem}
 */
export function createWeaponsAndCombatSystem(context) {
  let catalog = null;
  let firing = null;
  let lead = null;
  let makeModel = null;
  const aimedAt = { x: 0, y: 0, z: -1 };

  const system = {
    name: 'combat',
    dependsOn: ['physics'],
    /** The lead's weapons (weaponInventory.js). */
    inventory: null,
    /** True while the lead aims a weapon on foot (the player should face the camera's yaw). */
    get aiming() { return Boolean(lead && lead.status.aiming); },
    /** True while aiming or just after a shot: the camera's over-the-shoulder aim framing. */
    get aimFraming() { return Boolean(lead && (lead.status.aiming || lead.status.recentShot > 0)); },

    async init(progress) {
      const [{ createWeaponInventory }, { createWeaponFiring }, { createPlayerCombat }, { registerCombatShowcase }, { createWeaponModel }] = await Promise.all([
        import('./weaponInventory.js'), import('./weaponFiring.js'), import('./playerCombat.js'), import('./combatShowcase.js'), import('./weaponModels.js')]);
      const weapons = context.content.get('weaponCatalog');
      catalog = weapons.WEAPON_CATALOG;
      makeModel = createWeaponModel;
      const random = context.random('combat');
      const next = typeof random === 'function' ? random : () => random.next();
      system.inventory = createWeaponInventory(catalog, weapons.WEAPON_ORDER, weapons.WEAPON_WHEEL_SLOTS);
      // The lead starts with a bat and a pistol (missions may take them away and give them back).
      system.inventory.give('baseball_bat');
      system.inventory.give('pistol', 14 + 42);
      firing = createWeaponFiring(context, { rules: weapons.COMBAT_RULES, random: next });
      lead = createPlayerCombat(context, {
        inventory: system.inventory, firing, catalog, slots: weapons.WEAPON_WHEEL_SLOTS, rules: weapons.COMBAT_RULES, random: next,
      });
      context.commands.handle(GAME_COMMANDS.PLAYER_GIVE_WEAPON, ({ weaponId, ammo }) => {
        if (!system.inventory.give(weaponId, ammo)) return false;
        system.inventory.equip(weaponId);
        lead.announce(true);
        return true;
      });
      registerCombatShowcase(context);
      progress(1, 'weapons');
    },

    start() {
      lead.announce(true);
    },

    fixedUpdate(stepSeconds) {
      lead.fixedUpdate(stepSeconds);
    },

    update(deltaSeconds) {
      lead.update(deltaSeconds);
    },

    fire(shooter, weaponId, origin, towards, how = {}) {
      const weapon = catalog && catalog[weaponId];
      if (!weapon || !origin || !towards) return null;
      const length = Math.hypot(towards.x, towards.y, towards.z);
      if (!(length > 1e-6)) return null;
      aimedAt.x = towards.x / length; aimedAt.y = towards.y / length; aimedAt.z = towards.z / length;
      const accuracy = Math.min(1, Math.max(0.05, how.accuracy ?? 0.67));
      const spread = how.spread ?? weapon.spread / accuracy;
      if (how.walker && typeof how.walker.play === 'function') how.walker.play('fire');
      return firing.fire(shooter, weapon, origin, aimedAt, { spread, ignore: how.ignore ?? null });
    },

    weaponModel(weaponId) {
      const weapon = catalog && catalog[weaponId];
      return weapon && weapon.class !== 'unarmed' && makeModel ? makeModel(context.assets ?? null, weapon) : null;
    },

    serialise() { return system.inventory.serialise(); },
    restore(data) { system.inventory.restore(data); lead.announce(true); },

    dispose() { if (lead) lead.dispose(); },
  };
  return system;
}

// Weapons and combat: fists, a bat and the tire iron, six firearms, thrown weapons and the rocket
// launcher of the weapon catalog. The lead carries an inventory (wheel, X/Z, number keys, Q to
// holster, R to reload), aims with the right mouse button through the screen centre, fires with
// the left (spread, bloom and recoil), punches and swings, and shoots out of a car window. Shots
// are traced with physics rays against the city and vehicles and against each person's body and
// head; hits become DAMAGE_DEALT for the target's owner (the fleet for a vehicle), kills
// CHARACTER_KILLED, and the lead's shots and blows CRIME_COMMITTED for the wanted level. The weapon
// rides the lead's right hand with an aim pose of both arms; a reticle opens with the spread.
// Contract: docs/ARCHITECTURE.md, "combat".
//
// Public: `inventory` (the lead's), `aiming` (the lead is aiming: face the camera's yaw),
// `fire(shooter, weaponId, origin, direction, {spread?, ignore?})` for police and gang shooters,
// `serialise()` / `restore(data)`. Command PLAYER_GIVE_WEAPON {weaponId, ammo?}. Publishes
// WEAPON_FIRED, WEAPON_EQUIPPED, AMMO_CHANGED, DAMAGE_DEALT, CHARACTER_KILLED, CRIME_COMMITTED,
// EXPLOSION_DETONATED (through physics.explode); sends EFFECT_SPAWN when effects handle it.
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
      const [{ createWeaponInventory }, { createWeaponFiring }, { createPlayerCombat }, { registerCombatShowcase }] = await Promise.all([
        import('./weaponInventory.js'), import('./weaponFiring.js'), import('./playerCombat.js'), import('./combatShowcase.js')]);
      const weapons = context.content.get('weaponCatalog');
      catalog = weapons.WEAPON_CATALOG;
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

    fire(shooter, weaponId, origin, direction, how = {}) {
      const weapon = catalog[weaponId];
      if (!weapon) return null;
      return firing.fire(shooter, weapon, origin, direction, { spread: how.spread ?? weapon.spread * 1.5, ignore: how.ignore ?? null });
    },

    serialise() { return system.inventory.serialise(); },
    restore(data) { system.inventory.restore(data); lead.announce(true); },

    dispose() { if (lead) lead.dispose(); },
  };
  return system;
}

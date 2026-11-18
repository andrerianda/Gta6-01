// Weapons and combat: fists, melee weapons, firearms and explosives from the weapon catalog;
// the weapon wheel and ammunition, aiming and recoil, hit detection against characters, vehicles
// and the city, damage and death, and firing from vehicles.
// Second-wave entry module: this stub satisfies the lifecycle contract and does nothing yet.
// Its contract is docs/ARCHITECTURE.md, "combat".

/**
 * Creates the weapons and combat system.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {import('../core/systems/gameSystemContract.js').GameSystem}
 */
export function createWeaponsAndCombatSystem(context) {
  return {
    name: 'combat',
    dependsOn: ['physics'],
  };
}

// Player progression: reputation earned from missions, activities and mayhem, the ranks it
// reaches and what each unlocks (weapons, vehicles, contacts, districts), and the statistics
// page (distance driven, cars stolen, stars escaped).
// Second-wave entry module: this stub satisfies the lifecycle contract and does nothing yet.
// Its contract is docs/ARCHITECTURE.md, "progression".

/**
 * Creates the player progression system.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {import('../core/systems/gameSystemContract.js').GameSystem}
 */
export function createPlayerProgressionSystem(context) {
  return {
    name: 'progression',
    dependsOn: ['economy'],
  };
}

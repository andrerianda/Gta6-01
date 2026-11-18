// Gangs and factions: who holds which streets, how each faction feels about the player and
// about the others, the members who stand on their corners, and the turf fights that break out
// when the player or a rival crosses the line.
// Second-wave entry module: this stub satisfies the lifecycle contract and does nothing yet.
// Its contract is docs/ARCHITECTURE.md, "factions".

/**
 * Creates the gang territories system.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {import('../core/systems/gameSystemContract.js').GameSystem}
 */
export function createGangTerritoriesSystem(context) {
  return {
    name: 'factions',
    dependsOn: ['pedestrians'],
  };
}

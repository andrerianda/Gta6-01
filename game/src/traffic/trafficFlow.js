// Traffic: the ambient vehicles of the city. Spawns them out of sight around the player by
// district and hour, drives them along the lane graph (following, junctions and signals, lane
// changes, giving way to sirens, reacting to gunfire and collisions) and removes them behind.
// Second-wave entry module: this stub satisfies the lifecycle contract and does nothing yet.
// Its contract is docs/ARCHITECTURE.md, "traffic".

/**
 * Creates the traffic flow system.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {import('../core/systems/gameSystemContract.js').GameSystem}
 */
export function createTrafficFlowSystem(context) {
  return {
    name: 'traffic',
    dependsOn: ['openWorldCity', 'vehicles'],
  };
}

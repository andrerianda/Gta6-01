// Pedestrians: the crowd on the pavements. Spawns people by district archetype and hour, walks
// them along the pedestrian graph, gives them activities (talking, phoning, sitting, jogging)
// and reactions (dodging cars, fleeing gunfire, fighting back, calling the police as witnesses).
// Second-wave entry module: this stub satisfies the lifecycle contract and does nothing yet.
// Its contract is docs/ARCHITECTURE.md, "pedestrians".

/**
 * Creates the pedestrian crowd system.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {import('../core/systems/gameSystemContract.js').GameSystem}
 */
export function createPedestrianCrowdSystem(context) {
  return {
    name: 'pedestrians',
    dependsOn: ['openWorldCity', 'physics'],
  };
}

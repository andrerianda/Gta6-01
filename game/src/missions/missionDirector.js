// The mission director: runs the story. Offers missions from the storyMissions catalog at
// their givers, runs each as a sequence of objectives (go to, steal, chase, escape, deliver,
// eliminate, survive) with timers and failure conditions, pays out, and unlocks what follows.
// Second-wave entry module: this stub satisfies the lifecycle contract and does nothing yet.
// Its contract is docs/ARCHITECTURE.md, "missions".

/**
 * Creates the mission director system.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {import('../core/systems/gameSystemContract.js').GameSystem}
 */
export function createMissionDirectorSystem(context) {
  return {
    name: 'missions',
    dependsOn: ['player', 'vehicles', 'pedestrians', 'economy'],
  };
}

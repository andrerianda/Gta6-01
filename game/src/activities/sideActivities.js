// Side activities: what there is to do between missions. Street races, taxi and delivery
// jobs, vigilante work, stunt jumps, rampages, hidden collectibles, each started at its marker
// and scored with medals and cash.
// Second-wave entry module: this stub satisfies the lifecycle contract and does nothing yet.
// Its contract is docs/ARCHITECTURE.md, "sideActivities".

/**
 * Creates the side activities system.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {import('../core/systems/gameSystemContract.js').GameSystem}
 */
export function createSideActivitiesSystem(context) {
  return {
    name: 'sideActivities',
    dependsOn: ['missions'],
  };
}

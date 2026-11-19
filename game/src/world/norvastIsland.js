// The Norvast island: a streamed zone far out at sea (catalog/seaAndAirspaceChart.js), a faint
// shape in the haze from far away, loaded only while the world flag sea.open is set.
// STUB: the owner of this system replaces the body and adds its files under world/island/.

/**
 * Creates the Norvast island system.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {import('../core/systems/gameSystemContract.js').GameSystem}
 */
export function createNorvastIslandSystem(context) {
  void context;
  return { name: 'norvastIsland', dependsOn: ['openWorldCity'] };
}

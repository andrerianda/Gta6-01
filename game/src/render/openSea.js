// The open sea: the endless ocean beyond the city, its horizon haze, and the sky, clouds and
// curved horizon seen from high altitude (up to 25 km).
// STUB: the owner of this system replaces the body and adds its files under render/sea/.

/**
 * Creates the open sea system.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {import('../core/systems/gameSystemContract.js').GameSystem}
 */
export function createOpenSeaSystem(context) {
  void context;
  return { name: 'openSea', dependsOn: ['worldRenderPipeline'], runsWhen: 'always' };
}

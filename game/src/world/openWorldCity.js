// The open-world city: builds Marazul from the city plan (terrain, coast, roads, lots) and the
// asset library (building kits, street furniture, vegetation), streams it by square sectors
// around the focus, registers its colliders with the physics world and answers "where am I"
// (district, street, ground height) for every other system.
// Second-wave entry module: this stub satisfies the lifecycle contract and does nothing yet.
// Its contract is docs/ARCHITECTURE.md, "openWorldCity".

/**
 * Creates the open-world city system.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {import('../core/systems/gameSystemContract.js').GameSystem}
 */
export function createOpenWorldCitySystem(context) {
  return {
    name: 'openWorldCity',
    dependsOn: ['worldRenderPipeline', 'physics'],
    loadWeight: 6,
  };
}

// Base Aérea Punta Garza drawn in the world: runway, taxiway, apron, shelters, tower, fence, gate,
// lights, the parked aircraft and the patrol jeep (catalog/puntaGarzaAirBase.js is its plan).
// STUB: the owner of this system replaces the body and adds its files under world/airbase/.

/**
 * Creates the air base system.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {import('../core/systems/gameSystemContract.js').GameSystem}
 */
export function createAirBaseSystem(context) {
  void context;
  return { name: 'airBase', dependsOn: ['openWorldCity'] };
}

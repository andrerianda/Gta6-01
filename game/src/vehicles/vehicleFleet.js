// The vehicle fleet: every car, truck, motorcycle, boat and helicopter in the world. Spawns
// them from the vehicle catalog and the asset library, glues their models to the physics
// vehicle dynamics, and runs doors, seats, lights, damage, fire and wrecks, and entering and
// leaving. Traffic, police and the player drive vehicles through the controls it exposes.
// Second-wave entry module: this stub satisfies the lifecycle contract and does nothing yet.
// Its contract is docs/ARCHITECTURE.md, "vehicles".

/**
 * Creates the vehicle fleet system.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {import('../core/systems/gameSystemContract.js').GameSystem}
 */
export function createVehicleFleetSystem(context) {
  return {
    name: 'vehicles',
    dependsOn: ['openWorldCity', 'physics'],
    loadWeight: 2,
  };
}

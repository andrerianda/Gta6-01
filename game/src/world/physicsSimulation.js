// The physics simulation: owns the game's collision world (game/src/physics/), steps it at
// 60 Hz after every system has set its intents, and turns its contact queue into game events
// (collisions, knocked props, explosions). Systems add and remove bodies and colliders through it
// and ask it for ray casts, sweeps and ground heights.
// Second-wave entry module: this stub satisfies the lifecycle contract and does nothing yet.
// Its contract is docs/ARCHITECTURE.md, "physics".

/**
 * Creates the physics simulation system.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {import('../core/systems/gameSystemContract.js').GameSystem}
 */
export function createPhysicsSimulationSystem(context) {
  return {
    name: 'physics',
  };
}

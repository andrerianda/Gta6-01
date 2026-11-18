// World effects: the particles and marks that make actions readable. Muzzle flashes and
// tracers, bullet impacts and holes, tyre smoke and skid marks, sparks, fire and explosions,
// exhaust, spray off wet roads, and the mission markers and pickups' glow.
// Second-wave entry module: this stub satisfies the lifecycle contract and does nothing yet.
// Its contract is docs/ARCHITECTURE.md, "effects".

/**
 * Creates the world effects system.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {import('../core/systems/gameSystemContract.js').GameSystem}
 */
export function createWorldEffectsSystem(context) {
  return {
    name: 'effects',
    dependsOn: ['worldRenderPipeline'],
  };
}

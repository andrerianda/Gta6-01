// The minimap and the city map: the rotating radar in the corner of the HUD (roads, the
// player, police, mission and shop blips, the route to the waypoint) and the full-screen map of
// Marazul with districts, legend, zoom and waypoint setting.
// Second-wave entry module: this stub satisfies the lifecycle contract and does nothing yet.
// Its contract is docs/ARCHITECTURE.md, "minimap".

/**
 * Creates the minimap and city map system.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {import('../core/systems/gameSystemContract.js').GameSystem}
 */
export function createMinimapAndCityMapSystem(context) {
  return {
    name: 'minimap',
    runsWhen: 'always',
    dependsOn: ['openWorldCity'],
  };
}

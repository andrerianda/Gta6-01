// Radar and stealth: the radar emitters (the coastal tower of Cabo Lejano, the navy picket at sea
// with sweeping beams), the radar-signature model of each aircraft, and the Manta Sombra's one
// guided bomb with its green targeting screen.
// STUB: the owner of this system replaces the body and adds its files under flight/radar/.

/**
 * Creates the radar network system.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {import('../core/systems/gameSystemContract.js').GameSystem}
 */
export function createRadarNetworkSystem(context) {
  void context;
  return { name: 'radarNetwork', dependsOn: ['vehicles'] };
}

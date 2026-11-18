// The wanted level: turns crimes into heat and heat into stars. Crimes count when a witness or
// an officer sees them; the level rises through five stars, decays out of sight during the
// search, and clears by escaping, a respray, a bribe, being busted or being wasted.
// Second-wave entry module: this stub satisfies the lifecycle contract and does nothing yet.
// Its contract is docs/ARCHITECTURE.md, "wantedLevel".

/**
 * Creates the wanted level system.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {import('../core/systems/gameSystemContract.js').GameSystem}
 */
export function createWantedLevelSystem(context) {
  return {
    name: 'wantedLevel',
  };
}

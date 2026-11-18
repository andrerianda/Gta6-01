// The economy: the player's cash and where it goes. Weapon shops, clothes, food, respray
// garages and car dealers from the shop catalog; properties that are bought, give income each
// day and serve as safehouses; hospital bills and fines.
// Second-wave entry module: this stub satisfies the lifecycle contract and does nothing yet.
// Its contract is docs/ARCHITECTURE.md, "economy".

/**
 * Creates the money, shops and properties system.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {import('../core/systems/gameSystemContract.js').GameSystem}
 */
export function createMoneyShopsAndPropertiesSystem(context) {
  return {
    name: 'economy',
  };
}

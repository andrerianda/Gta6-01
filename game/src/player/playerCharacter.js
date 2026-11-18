// The player: the lead character on foot (walk, sprint, jump, climb, swim, take cover) and at
// the wheel (enter, steal, drive, bail out), health and armour, being wasted or busted and the
// respawn, and the switch between input contexts. It owns the entity tagged 'player'.
// Second-wave entry module: this stub satisfies the lifecycle contract and does nothing yet.
// Its contract is docs/ARCHITECTURE.md, "player".

/**
 * Creates the player character system.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {import('../core/systems/gameSystemContract.js').GameSystem}
 */
export function createPlayerCharacterSystem(context) {
  return {
    name: 'player',
    dependsOn: ['openWorldCity', 'vehicles', 'physics'],
  };
}

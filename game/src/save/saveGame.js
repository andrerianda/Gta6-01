// Saving and loading: gathers each system's part of the save (player, vehicles kept, missions,
// economy, progression, clock, settings stay apart), writes it to versioned storage slots,
// autosaves after missions and at safehouses, and restores a game on load.
// Second-wave entry module: this stub satisfies the lifecycle contract and does nothing yet.
// Its contract is docs/ARCHITECTURE.md, "saveGame".

/**
 * Creates the save game system.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {import('../core/systems/gameSystemContract.js').GameSystem}
 */
export function createSaveGameSystem(context) {
  return {
    name: 'saveGame',
    runsWhen: 'always',
  };
}

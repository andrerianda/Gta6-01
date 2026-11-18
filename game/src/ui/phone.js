// The phone: the player's handset while the world carries on. Contacts who give missions,
// text messages, a taxi and a mechanic to call, the camera, and quick saving.
// Second-wave entry module: this stub satisfies the lifecycle contract and does nothing yet.
// Its contract is docs/ARCHITECTURE.md, "phone".

/**
 * Creates the phone system.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {import('../core/systems/gameSystemContract.js').GameSystem}
 */
export function createPhoneSystem(context) {
  return {
    name: 'phone',
    runsWhen: 'always',
  };
}

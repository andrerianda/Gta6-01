// The head-up display: wanted stars, cash, health and armour, the weapon and its ammunition,
// the mission objective and timer, subtitles, the district and street name, the speedometer,
// notifications and key prompts. It only listens to events and draws into the HUD containers.
// Second-wave entry module: this stub satisfies the lifecycle contract and does nothing yet.
// Its contract is docs/ARCHITECTURE.md, "hud".

/**
 * Creates the head-up display system.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {import('../core/systems/gameSystemContract.js').GameSystem}
 */
export function createHeadUpDisplaySystem(context) {
  return {
    name: 'hud',
    runsWhen: 'always',
  };
}

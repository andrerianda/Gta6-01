// The cutscene player: scripted scenes between and inside missions. Places the story
// characters, cuts and moves the camera, speaks the dialogue as subtitles under the letterbox,
// and can be skipped.
// Second-wave entry module: this stub satisfies the lifecycle contract and does nothing yet.
// Its contract is docs/ARCHITECTURE.md, "cutscenes".

/**
 * Creates the cutscene player system.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {import('../core/systems/gameSystemContract.js').GameSystem}
 */
export function createCutscenePlayerSystem(context) {
  return {
    name: 'cutscenes',
    dependsOn: ['followCamera'],
  };
}

// The showcase director: registers the scenes of the automated screenshots (?shot=<name>) with
// the engine's showcase registry. Each scene, a file of its own beside this one, sets the real
// game up through its systems and plays the real rules forward to a picture: the skyline at
// golden hour, a police chase, a mission in progress, the city at night in the rain.
// Second-wave entry module: this stub satisfies the lifecycle contract and does nothing yet.
// Its contract is docs/ARCHITECTURE.md, "showcase".

/**
 * Creates the showcase director system.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {import('../core/systems/gameSystemContract.js').GameSystem}
 */
export function createShowcaseDirectorSystem(context) {
  return {
    name: 'showcase',
    runsWhen: 'always',
  };
}

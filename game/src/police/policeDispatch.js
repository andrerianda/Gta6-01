// Police dispatch: the response to the wanted level. Sends officers on foot, patrol cars,
// roadblocks, armoured units, boats and a helicopter according to the stars, and runs their
// behaviour: pursuit and ramming, searching the last known position, arrests and gunfights.
// Second-wave entry module: this stub satisfies the lifecycle contract and does nothing yet.
// Its contract is docs/ARCHITECTURE.md, "policeDispatch".

/**
 * Creates the police dispatch system.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {import('../core/systems/gameSystemContract.js').GameSystem}
 */
export function createPoliceDispatchSystem(context) {
  return {
    name: 'policeDispatch',
    dependsOn: ['wantedLevel', 'vehicles', 'pedestrians'],
  };
}

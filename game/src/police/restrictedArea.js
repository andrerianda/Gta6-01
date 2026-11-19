// The restricted area of Punta Garza: guards and ground crew in uniform, the challenge at the gate,
// trespass, wanted stars and the armed response, and officer access with crew who salute.
// STUB: the owner of this system replaces the body and adds its files under police/restricted/.

/**
 * Creates the restricted area system.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {import('../core/systems/gameSystemContract.js').GameSystem}
 */
export function createRestrictedAreaSystem(context) {
  void context;
  return { name: 'restrictedArea', dependsOn: ['pedestrians', 'policeDispatch'] };
}

// The air guard of Marazul: the sea boundary, the Halcón interceptor pair (scramble, intercept,
// formate on the wing, order by radio, warning shots, fire, lose the lead, give up at the border)
// and the air wanted state the HUD shows.
// STUB: the owner of this system replaces the body and adds its files under flight/defence/.

/**
 * Creates the air defence system.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {import('../core/systems/gameSystemContract.js').GameSystem}
 */
export function createAirDefenceSystem(context) {
  void context;
  return { name: 'airDefence', dependsOn: ['vehicles'] };
}

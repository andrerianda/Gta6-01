// Sound and radio: everything heard, synthesised with WebAudio. Engines by vehicle class,
// tyres, horns and sirens, gunshots and explosions, footsteps, the city's ambience by district
// and hour, rain and thunder, the interface, and the radio stations with their own music.
// Second-wave entry module: this stub satisfies the lifecycle contract and does nothing yet.
// Its contract is docs/ARCHITECTURE.md, "audio".

/**
 * Creates the sound and radio system.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {import('../core/systems/gameSystemContract.js').GameSystem}
 */
export function createSoundAndRadioSystem(context) {
  return {
    name: 'audio',
    runsWhen: 'always',
  };
}

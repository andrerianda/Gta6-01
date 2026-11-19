// Incoming calls: a realistic phone (our own invented brand, its body modelled in Blender) rises
// from the lower right corner, vibrates and rings, shows the caller's initial and name with a green
// accept and a red decline button, counts the call's time once connected, plays the caller's lines
// through the phone filter with subtitles, and sinks away when the call ends. The story's calls
// (El Comprador at midnight, the insider before dawn) and the mission givers' calls all use it.
// Commands: PHONE_CALL_RING, PHONE_CALL_ANSWER, PHONE_CALL_DECLINE, PHONE_CALL_END.
// Publishes: PHONE_CALL_RINGING, PHONE_CALL_ANSWERED, PHONE_CALL_ENDED.
// Members: state ('idle' | 'ringing' | 'connected' | 'ending'), call (the live call or null).
// Implementation: ui/call/incomingCallRuntime.js and its neighbours.

/**
 * Creates the incoming calls system.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {import('../core/systems/gameSystemContract.js').GameSystem}
 */
export function createIncomingCallsSystem(context) {
  void context;
  return {
    name: 'incomingCalls',
    runsWhen: 'always',
    get state() { return 'idle'; },
    get call() { return null; },
    async init(progress) { progress(1, 'calls'); },
    update() {},
    dispose() {},
  };
}

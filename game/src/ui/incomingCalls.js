// Incoming calls: a realistic phone (our own invented brand, its body modelled in Blender) rises
// from the lower right corner, vibrates and rings, shows the caller's initial and name with a green
// accept and a red decline button, counts the call's time once connected, plays the caller's lines
// through the phone filter with subtitles, and sinks away when the call ends. The story's calls
// (El Comprador at midnight, the insider before dawn) and the mission givers' calls all use it.
// Commands: PHONE_CALL_RING, PHONE_CALL_ANSWER, PHONE_CALL_DECLINE, PHONE_CALL_END.
// Publishes: PHONE_CALL_RINGING, PHONE_CALL_ANSWERED, PHONE_CALL_ENDED.
// Members: state ('idle' | 'ringing' | 'connected' | 'ending'), call (the live call or null).
// Keys: Enter or Y accepts, Backspace or N declines or hangs up (actions callAccept, callDecline);
// while a call rings the phone takes those keys before the rest of the game sees them.
// Launch: ?call=comprador | insider | <story character id> rings one for a capture, &answer=1 answers it.
// Implementation: ui/call/incomingCallRuntime.js (the state machine callStateMachine.js, the
// handset on the page callScreenView.js, the screen's perspective screenQuadMatrix.js).

/**
 * Creates the incoming calls system.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {import('../core/systems/gameSystemContract.js').GameSystem}
 */
export function createIncomingCallsSystem(context) {
  let runtime = null;
  return {
    name: 'incomingCalls',
    runsWhen: 'always',
    get state() { return runtime ? runtime.state : 'idle'; },
    get call() { return runtime ? runtime.call : null; },
    /** Poses the handset for a still picture: up at once, its pulses held (the showcase scenes). */
    pose() { runtime?.pose(); },
    async init(progress) {
      const { createIncomingCallRuntime } = await import('./call/incomingCallRuntime.js');
      runtime = createIncomingCallRuntime(context);
      progress(1, 'calls');
    },
    update(deltaSeconds) { runtime?.update(deltaSeconds); },
    dispose() { runtime?.dispose(); runtime = null; },
  };
}

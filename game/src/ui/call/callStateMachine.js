// The incoming call as a pure state machine: idle -> ringing -> connected -> ending -> idle. It
// knows nothing of the page or of sound; the runtime (incomingCallRuntime.js) gives it two
// functions and steps it every frame.
//
//   const machine = createCallStateMachine({ speak: (item) => seconds, emit: (type, payload) => {} });
//   machine.ring({ callId, callerId, callerName, lines: ['ic_01', 'ic_02'] })   // false while busy
//   machine.answer(); machine.decline(); machine.end('finished'); machine.update(dt);
//
// Once answered it plays `lines` (line ids) in order, or the single unvoiced `text`, by calling
// speak({ lineId } | { text }) and waiting the seconds that returns plus a short gap, then ends
// with reason 'finished'. A `scripted` call speaks nothing itself: its caller ends it. Without
// `autoAnswerSeconds` an unanswered call is 'missed' after MISSED_AFTER_SECONDS.
// emit types: 'ringing', 'answered', 'ended' ({ reason, seconds }), 'idle'.

export const CALL_STATE = Object.freeze({ IDLE: 'idle', RINGING: 'ringing', CONNECTED: 'connected', ENDING: 'ending' });
export const CALL_END_REASON = Object.freeze({ FINISHED: 'finished', HUNG_UP: 'hungUp', DECLINED: 'declined', MISSED: 'missed' });
export const MISSED_AFTER_SECONDS = 20;
export const ENDING_SECONDS = 1.2;
const FIRST_LINE_DELAY = 0.45;
const LINE_GAP = 0.35;

/**
 * Formats a call's length as mm:ss.
 * @param {number} seconds
 * @returns {string}
 */
export function formatCallTime(seconds) {
  const whole = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
}

/**
 * How long an unvoiced line stays up: its reading time.
 * @param {string} text
 * @returns {number} Seconds.
 */
export function readingSeconds(text) {
  const words = String(text ?? '').trim().split(/\s+/).filter(Boolean).length;
  return Math.min(12, Math.max(2.5, 1.2 + words * 0.36));
}

/**
 * Creates the state machine.
 * @param {Object} [hooks]
 * @param {(item: {lineId?: string, text?: string}, call: object) => number} [hooks.speak] Speaks
 *   one item and returns its seconds.
 * @param {(type: string, payload: object) => void} [hooks.emit]
 */
export function createCallStateMachine(hooks = {}) {
  const speak = hooks.speak ?? (() => 2);
  const emit = hooks.emit ?? (() => {});
  let state = CALL_STATE.IDLE;
  let call = null;
  let rung = 0;            // seconds ringing
  let wait = 0;            // seconds until the next line (or the end)
  let queue = [];
  let endingLeft = 0;
  let lastReason = null;

  const describe = () => ({ callId: call.callId, callerId: call.callerId, callerName: call.callerName });

  function finish(reason) {
    state = CALL_STATE.ENDING;
    endingLeft = ENDING_SECONDS;
    lastReason = reason;
    emit('ended', { ...describe(), reason, seconds: Math.floor(call.seconds) });
  }

  return {
    get state() { return state; },
    /** The live call (also while it ends), or null. */
    get call() { return call; },
    get ringSeconds() { return rung; },
    get reason() { return lastReason; },

    /**
     * Rings. Refused (false) while a call rings or is connected, or without a caller.
     * @param {{callId?: string, callerId?: string, callerName?: string, lines?: string[], text?: string,
     *   scripted?: boolean, autoAnswerSeconds?: number, canDecline?: boolean}} request
     */
    ring(request) {
      if (state === CALL_STATE.RINGING || state === CALL_STATE.CONNECTED) return false;
      if (!request || (!request.callerId && !request.callerName)) return false;
      if (state === CALL_STATE.ENDING) emit('idle', {});
      call = {
        callId: String(request.callId ?? request.callerId ?? 'call'),
        callerId: request.callerId ?? null,
        callerName: String(request.callerName ?? request.callerId ?? 'Unknown number'),
        lines: Array.isArray(request.lines) ? request.lines.slice() : [],
        text: typeof request.text === 'string' && request.text ? request.text : null,
        scripted: request.scripted === true,
        autoAnswerSeconds: Number.isFinite(request.autoAnswerSeconds) ? Math.max(0, request.autoAnswerSeconds) : null,
        canDecline: request.canDecline !== false,
        seconds: 0,
      };
      state = CALL_STATE.RINGING;
      rung = 0;
      lastReason = null;
      emit('ringing', describe());
      return true;
    },

    answer() {
      if (state !== CALL_STATE.RINGING) return false;
      state = CALL_STATE.CONNECTED;
      queue = call.scripted ? [] : [...call.lines.map((lineId) => ({ lineId })), ...(call.text ? [{ text: call.text }] : [])];
      wait = FIRST_LINE_DELAY;
      emit('answered', describe());
      return true;
    },

    /** Declines a ringing call, or hangs up a connected one; false when the call does not allow it. */
    decline() {
      if (!call || !call.canDecline) return false;
      if (state === CALL_STATE.RINGING) { finish(CALL_END_REASON.DECLINED); return true; }
      if (state === CALL_STATE.CONNECTED && !call.scripted) { finish(CALL_END_REASON.HUNG_UP); return true; }
      return false;
    },

    /**
     * Ends the call whatever it allows (a cinematic's hang-up, PHONE_CALL_END).
     * @param {string} [reason] Default 'finished' once connected, 'missed' while it rings.
     */
    end(reason) {
      if (state !== CALL_STATE.RINGING && state !== CALL_STATE.CONNECTED) return false;
      const known = Object.values(CALL_END_REASON).includes(reason);
      finish(known ? reason : state === CALL_STATE.CONNECTED ? CALL_END_REASON.FINISHED : CALL_END_REASON.MISSED);
      return true;
    },

    /** @param {number} deltaSeconds */
    update(deltaSeconds) {
      const dt = Math.max(0, deltaSeconds || 0);
      if (state === CALL_STATE.RINGING) {
        rung += dt;
        if (call.autoAnswerSeconds !== null) { if (rung >= call.autoAnswerSeconds) this.answer(); }
        else if (rung >= MISSED_AFTER_SECONDS) finish(CALL_END_REASON.MISSED);
      } else if (state === CALL_STATE.CONNECTED) {
        call.seconds += dt;
        if (call.scripted) return;
        wait -= dt;
        if (wait > 0) return;
        const item = queue.shift();
        if (!item) { finish(CALL_END_REASON.FINISHED); return; }
        const seconds = Number(speak(item, call));
        wait = (Number.isFinite(seconds) && seconds > 0 ? seconds : 2) + LINE_GAP;
      } else if (state === CALL_STATE.ENDING) {
        endingLeft -= dt;
        if (endingLeft > 0) return;
        state = CALL_STATE.IDLE;
        call = null;
        emit('idle', {});
      }
    },
  };
}

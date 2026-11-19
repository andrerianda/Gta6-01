// The insider's call, the last beat of the prologue: Maj. Quiroga rings Dez on the phone ("The
// gate opens at 05:40, Lieutenant. Do not be late." / "Understood."). A declined or missed call
// rings again after 8 s; when it has been heard the mission proper begins at the gate. Without
// the incoming-call system the two lines are simply spoken.
import { GAME_COMMANDS } from '../../../core/events/gameCommands.js';
import { GAME_EVENTS } from '../../../core/events/gameEvents.js';
import { FINAL_ARC_SPEAKERS } from '../../../catalog/finalArcScript.js';

const CALL_ID = 'insider';
const LINES = Object.freeze(['ic_01', 'ic_02']);
const RING_AGAIN_SECONDS = 8;

/**
 * @param {object} rt The mission runtime's `rt`.
 */
export function createInsiderCallStage(rt) {
  const { commands } = rt.context;
  let done = false;

  function speakAndGo() {
    rt.say(LINES).then(() => rt.next());
  }

  function ring() {
    if (done) return;
    const phone = rt.context.systems.find('incomingCalls');
    const ringing = phone && 'state' in phone && commands.has(GAME_COMMANDS.PHONE_CALL_RING)
      ? commands.run(GAME_COMMANDS.PHONE_CALL_RING, { callId: CALL_ID, callerId: 'mayor_quiroga', callerName: FINAL_ARC_SPEAKERS.mayor_quiroga?.name, lines: [...LINES] })
      : false;
    if (ringing === false || ringing === undefined) { done = true; speakAndGo(); return; }
    // Should the phone never report back, the story still goes on.
    rt.after(60, () => { if (!done) { done = true; rt.next(); } });
  }

  return {
    enter() {
      rt.objective('Answer the phone', null);
      rt.after(1.2, ring);
    },
    update() {},
    onEvent(topic, payload) {
      if (topic !== GAME_EVENTS.PHONE_CALL_ENDED || payload?.callId !== CALL_ID || done) return;
      if (payload.reason === 'finished' || payload.reason === 'hungUp') { done = true; rt.after(0.8, () => rt.next()); }
      else rt.after(RING_AGAIN_SECONDS, ring);
    },
    exit() { done = true; },
  };
}

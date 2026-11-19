// The incoming calls at run time: joins the pure state machine (callStateMachine.js) to the page
// (callScreenView.js), the commands and events of the contract, the keys, the story's sounds and
// the voice-over. Enter / Y accept and Backspace / N decline (or hang up); while a call rings or
// can be hung up those keys are taken in the window's capture phase, before the game's own input,
// so Enter does not also leave the vehicle or skip the cinematic.
import { GAME_COMMANDS } from '../../core/events/gameCommands.js';
import { GAME_EVENTS } from '../../core/events/gameEvents.js';
import { GAME_STATE } from '../../core/state/gameStates.js';
import { DEFAULT_CONTROL_BINDINGS } from '../../core/input/controlBindings.js';
import { CALL_STATE, createCallStateMachine, readingSeconds } from './callStateMachine.js';
import { createCallScreenView } from './callScreenView.js';

const UNKNOWN = 'Unknown number';
const BUZZ_PERIOD = 2.0;              // seconds: the handset buzzes and shakes for the first part
const BUZZ_SECONDS = 0.95;
const LAUNCH_RING_DELAY = 0.05;      // seconds of play before a `?call=` rings (captures are taken early)
const LIVE_STATES = [GAME_STATE.PLAYING, GAME_STATE.CUTSCENE, GAME_STATE.PHONE_OPEN];
/** The calls `?call=` can ring for a capture. */
const LAUNCH_CALLS = Object.freeze({
  comprador: { callId: 'midnight_call', callerId: 'el_comprador', callerName: UNKNOWN, lines: ['mc_01', 'mc_03', 'mc_04'] },
  insider: { callId: 'insider_call', callerId: 'mayor_quiroga', lines: ['ic_01', 'ic_02'] },
});

/** A handset number that is always the same for a caller (Marazul's invented 555 exchange). */
function numberOf(callerId) {
  let hash = 7;
  for (const letter of String(callerId)) hash = (hash * 31 + letter.charCodeAt(0)) % 100;
  return `Marazul 555 01${String(hash).padStart(2, '0')}`;
}

/**
 * Creates the runtime.
 * @param {import('../../core/systems/gameContext.js').GameContext} context
 */
export function createIncomingCallRuntime(context) {
  const { clock, commands, content, events, input, launch, page, state } = context;
  const document = page.document;
  const view = document.defaultView;
  const run = (name, payload) => (commands.has(name) ? commands.run(name, payload) : undefined);
  const script = content.find('finalArcScript') ?? {};
  const characters = content.find('storyCharacters')?.STORY_CHARACTERS ?? {};
  const bindings = DEFAULT_CONTROL_BINDINGS.cutscene;
  const acceptCodes = new Set([...(bindings.callAccept ?? ['Enter', 'KeyY']), 'NumpadEnter']);
  const declineCodes = new Set(bindings.callDecline ?? ['Backspace', 'KeyN']);
  const off = [];
  let speakingLeft = 0;
  /** Posed for a still (pose()): a spoken line's subtitle is held until the next, not timed out by the wall clock. */
  const posed = () => screen.root.classList.contains('is-posed');
  let ringOn = false;
  let buzzOn = false;
  let launchLeft = launch?.call ? LAUNCH_RING_DELAY : -1;

  const sound = (soundId, action) => run(GAME_COMMANDS.STORY_SOUND, { soundId, action });

  /** Speaks one item of the call; returns its seconds. */
  function speak(item, call) {
    if (item.lineId) {
      const line = script.FINAL_ARC_LINES?.[item.lineId] ?? null;
      const fromCaller = !line || line.speaker === call.callerId;
      const seconds = run(GAME_COMMANDS.STORY_LINE_SPEAK, { lineId: item.lineId, channel: fromCaller ? 'phone' : line.channel ?? 'face', ...(posed() ? { hold: true } : {}) });
      if (Number.isFinite(seconds) && seconds > 0) return seconds;
      if (!line) return 0.1;
      // No voice-over system: the plain subtitle for the line's reading time.
      const reading = readingSeconds(line.text);
      const speakerName = script.FINAL_ARC_SPEAKERS?.[line.speaker]?.name ?? characters[line.speaker]?.name ?? '';
      run(GAME_COMMANDS.UI_SHOW_SUBTITLE, { speakerName, text: line.text, seconds: reading });
      if (fromCaller) speakingLeft = reading - 0.3;
      return reading;
    }
    // A story call's line in the caller's voice, through the phone, with its subtitle.
    const voiced = context.systems?.find?.('voiceOver')?.speakText?.({ text: item.text, speakerId: call.callerId, speakerName: call.callerName, channel: 'phone' }) ?? 0;
    if (voiced > 0) { speakingLeft = voiced - 0.3; return voiced; }
    const reading = readingSeconds(item.text);
    run(GAME_COMMANDS.UI_SHOW_SUBTITLE, { speakerName: call.callerName, text: item.text, seconds: reading });
    speakingLeft = reading - 0.3;
    return reading;
  }

  function describe(call, reason) {
    const unknown = call.callerName === UNKNOWN;
    return {
      callerName: call.callerName, unknown, secondLine: unknown ? 'No caller ID' : numberOf(call.callerId ?? call.callerName),
      canDecline: call.canDecline, canHangUp: call.canDecline && !call.scripted, seconds: call.seconds, reason,
    };
  }

  const TOPICS = { ringing: GAME_EVENTS.PHONE_CALL_RINGING, answered: GAME_EVENTS.PHONE_CALL_ANSWERED, ended: GAME_EVENTS.PHONE_CALL_ENDED };
  const machine = createCallStateMachine({
    speak,
    emit(type, payload) {
      if (type === 'idle') { screen.show(CALL_STATE.IDLE, null); return; }
      const call = machine.call;
      screen.setClock(clock?.label?.() ?? '');
      if (type === 'answered') sound('phone_pickup', 'play');
      if (type === 'ended') {
        screen.root.classList.remove('is-instant');
        if (payload.reason === 'hungUp') run(GAME_COMMANDS.STORY_LINES_STOP, {});
        if (payload.reason !== 'missed') sound('phone_hangup', 'play');
        speakingLeft = 0;
      }
      screen.show(type === 'ringing' ? CALL_STATE.RINGING : type === 'answered' ? CALL_STATE.CONNECTED : CALL_STATE.ENDING, describe(call, payload.reason));
      events.emit(TOPICS[type], type === 'answered' ? { callId: payload.callId, callerId: payload.callerId } : payload);
    },
  });
  const screen = createCallScreenView(document, { onAccept: () => machine.answer(), onDecline: () => machine.decline() });

  /** The contract's ring: resolves the caller's name, then rings. */
  function ring(request = {}) {
    const callerId = request.callerId ?? null;
    const callerName = request.callerName ?? script.FINAL_ARC_SPEAKERS?.[callerId]?.name ?? characters[callerId]?.name ?? UNKNOWN;
    return machine.ring({ ...request, callerId, callerName });
  }

  function onKeyDown(event) {
    const live = LIVE_STATES.some((id) => state.is(id));
    if (!live || event.ctrlKey || event.altKey || event.metaKey) return;
    const ringing = machine.state === CALL_STATE.RINGING;
    const accepts = ringing && acceptCodes.has(event.code);
    const declines = declineCodes.has(event.code) && (ringing || (machine.state === CALL_STATE.CONNECTED && machine.call.canDecline && !machine.call.scripted));
    if (!accepts && !declines) return;
    // The phone wins the key: the game's input never sees it.
    event.stopImmediatePropagation();
    event.preventDefault();
    if (event.repeat) return;
    if (accepts) machine.answer();
    else machine.decline();
  }

  function ringLaunchCall() {
    const id = launch.call;
    const answer = /[?&]answer=1(&|$)/.test(view?.location?.search ?? '');
    const known = LAUNCH_CALLS[id] ?? (characters[id] ? { callId: `launch:${id}`, callerId: id, text: 'Call me back when you get this.' } : null);
    if (!known) return;
    // A capture is taken half a second after the game is ready: the handset is up at once.
    screen.root.classList.add('is-instant');
    ring({ ...known, ...(answer ? { autoAnswerSeconds: 1.5 } : {}) });
  }

  off.push(commands.handle(GAME_COMMANDS.PHONE_CALL_RING, (request) => ring(request ?? {})));
  off.push(commands.handle(GAME_COMMANDS.PHONE_CALL_ANSWER, () => machine.answer()));
  off.push(commands.handle(GAME_COMMANDS.PHONE_CALL_DECLINE, () => machine.decline()));
  off.push(commands.handle(GAME_COMMANDS.PHONE_CALL_END, (payload) => { machine.end(payload?.reason); }));
  off.push(events.on(GAME_EVENTS.STORY_LINE_SPOKEN, ({ channel, seconds }) => {
    if (channel === 'phone' && machine.state === CALL_STATE.CONNECTED) speakingLeft = Math.max(0.4, (seconds ?? 2) - 0.35);
  }));
  // Under a software renderer the engine holds its frames once the game is ready (captures), so a
  // `?call=` rings on GAME_READY itself, not from update.
  off.push(events.on(GAME_EVENTS.GAME_READY, () => {
    if (launchLeft < 0) return;
    launchLeft = -1;
    ringLaunchCall();
  }));
  view?.addEventListener('keydown', onKeyDown, true);

  return {
    get state() { return machine.state; },
    /** The live call: { callId, callerId, callerName, seconds }, or null. */
    get call() {
      const call = machine.call;
      return call ? { callId: call.callId, callerId: call.callerId, callerName: call.callerName, seconds: call.seconds } : null;
    },
    ring,
    /**
     * Poses the handset for a still picture (the showcase scenes): it is up at once when a call
     * comes, and its pulses stand at a fixed moment, so the same picture is taken every time.
     */
    pose() { screen.root.classList.add('is-instant', 'is-posed'); },
    /** @param {number} deltaSeconds */
    update(deltaSeconds) {
      const live = LIVE_STATES.some((id) => state.is(id));
      if (live && launchLeft >= 0) {
        launchLeft -= deltaSeconds;
        if (launchLeft < 0) ringLaunchCall();
      }
      if (machine.state === CALL_STATE.IDLE) { screen.update(deltaSeconds, false); return; }
      if (live) {
        // Automation and rebinding reach the call through the action map as well.
        if (input?.pressed?.('callAccept')) machine.answer();
        else if (input?.pressed?.('callDecline')) machine.decline();
        machine.update(deltaSeconds);
      }
      const call = machine.call;
      const wantRing = live && machine.state === CALL_STATE.RINGING;
      const wantBuzz = wantRing && machine.ringSeconds % BUZZ_PERIOD < BUZZ_SECONDS;
      if (wantRing !== ringOn) { ringOn = wantRing; sound('phone_ring', wantRing ? 'start' : 'stop'); }
      if (wantBuzz !== buzzOn) { buzzOn = wantBuzz; sound('phone_buzz', wantBuzz ? 'start' : 'stop'); screen.setBuzzing(wantBuzz); }
      if (!call) return;
      speakingLeft = Math.max(0, speakingLeft - deltaSeconds);
      screen.setClock(clock?.label?.() ?? '');
      if (machine.state === CALL_STATE.CONNECTED) screen.setSeconds(call.seconds);
      screen.update(deltaSeconds, speakingLeft > 0);
    },
    dispose() {
      view?.removeEventListener('keydown', onKeyDown, true);
      for (const stop of off.splice(0)) stop?.();
      if (ringOn) sound('phone_ring', 'stop');
      if (buzzOn) sound('phone_buzz', 'stop');
      screen.dispose();
    },
  };
}

// The incoming call's state machine: ring, answer, the lines in order, decline, missed, auto
// answer, scripted calls, canDecline, the timer and a second ring while busy.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CALL_STATE, ENDING_SECONDS, MISSED_AFTER_SECONDS, createCallStateMachine, formatCallTime, readingSeconds,
} from '../../../game/src/ui/call/callStateMachine.js';

function harness(lineSeconds = 2) {
  const log = [];
  const spoken = [];
  const machine = createCallStateMachine({
    speak: (item) => { spoken.push(item.lineId ?? item.text); return lineSeconds; },
    emit: (type, payload) => log.push({ type, ...payload }),
  });
  const run = (seconds, step = 0.1) => { for (let t = 0; t < seconds - 1e-9; t += step) machine.update(step); };
  return { machine, log, spoken, run };
}

test('ring, answer, the lines in order, then finished', () => {
  const { machine, log, spoken, run } = harness(2);
  assert.equal(machine.state, CALL_STATE.IDLE);
  assert.equal(machine.ring({ callId: 'insider_call', callerId: 'mayor_quiroga', callerName: 'Maj. Quiroga', lines: ['ic_01', 'ic_02'] }), true);
  assert.equal(machine.state, CALL_STATE.RINGING);
  assert.deepEqual(log[0], { type: 'ringing', callId: 'insider_call', callerId: 'mayor_quiroga', callerName: 'Maj. Quiroga' });
  run(1);
  assert.deepEqual(spoken, []);
  assert.equal(machine.answer(), true);
  assert.equal(machine.state, CALL_STATE.CONNECTED);
  run(1);
  assert.deepEqual(spoken, ['ic_01']);
  run(2.5);
  assert.deepEqual(spoken, ['ic_01', 'ic_02']);
  run(3);
  assert.equal(machine.state, CALL_STATE.ENDING);
  const ended = log.find((entry) => entry.type === 'ended');
  assert.equal(ended.reason, 'finished');
  assert.ok(ended.seconds >= 4 && ended.seconds <= 6, `seconds ${ended.seconds}`);
  run(ENDING_SECONDS + 0.2);
  assert.equal(machine.state, CALL_STATE.IDLE);
  assert.equal(machine.call, null);
  assert.equal(log.at(-1).type, 'idle');
});

test('decline ends a ringing call; answer after that does nothing', () => {
  const { machine, log } = harness();
  machine.ring({ callId: 'a', callerId: 'sol_arrieta' });
  assert.equal(machine.decline(), true);
  assert.equal(machine.state, CALL_STATE.ENDING);
  assert.equal(log.at(-1).reason, 'declined');
  assert.equal(log.at(-1).seconds, 0);
  assert.equal(machine.answer(), false);
});

test('an unanswered call is missed after twenty seconds', () => {
  const { machine, log, run } = harness();
  machine.ring({ callId: 'a', callerId: 'sol_arrieta' });
  run(MISSED_AFTER_SECONDS - 0.5);
  assert.equal(machine.state, CALL_STATE.RINGING);
  run(1);
  assert.equal(machine.state, CALL_STATE.ENDING);
  assert.equal(log.at(-1).reason, 'missed');
});

test('autoAnswerSeconds answers by itself and never misses', () => {
  const { machine, log, run } = harness();
  machine.ring({ callId: 'a', callerId: 'el_comprador', autoAnswerSeconds: 5, scripted: true });
  run(4.5);
  assert.equal(machine.state, CALL_STATE.RINGING);
  run(1);
  assert.equal(machine.state, CALL_STATE.CONNECTED);
  assert.ok(log.some((entry) => entry.type === 'answered'));
});

test('a scripted call speaks nothing and waits for its caller to end it', () => {
  const { machine, log, spoken, run } = harness();
  machine.ring({ callId: 'midnight_call', callerId: 'el_comprador', lines: ['mc_01'], scripted: true });
  machine.answer();
  run(30);
  assert.equal(machine.state, CALL_STATE.CONNECTED);
  assert.deepEqual(spoken, []);
  assert.equal(machine.decline(), false, 'the player cannot hang up on a cinematic');
  assert.equal(machine.end(), true);
  assert.equal(log.at(-1).reason, 'finished');
  assert.equal(log.at(-1).seconds, 30);
});

test('canDecline false refuses decline while ringing and connected', () => {
  const { machine } = harness();
  machine.ring({ callId: 'a', callerId: 'el_comprador', canDecline: false, lines: ['mc_01'] });
  assert.equal(machine.call.canDecline, false);
  assert.equal(machine.decline(), false);
  assert.equal(machine.state, CALL_STATE.RINGING);
  machine.answer();
  assert.equal(machine.decline(), false);
  assert.equal(machine.state, CALL_STATE.CONNECTED);
});

test('hanging up a connected call ends it with hungUp', () => {
  const { machine, log, run } = harness(4);
  machine.ring({ callId: 'a', callerId: 'sol_arrieta', text: 'Come to the port.' });
  machine.answer();
  run(1.5);
  assert.equal(machine.decline(), true);
  assert.equal(log.at(-1).reason, 'hungUp');
  assert.equal(log.at(-1).seconds, 1);
});

test('an unvoiced text is spoken once, after the answer', () => {
  const { machine, spoken, log, run } = harness(3);
  machine.ring({ callId: 'giver:m02', callerId: 'sol_arrieta', text: 'Come quietly.' });
  run(2);
  assert.deepEqual(spoken, []);
  machine.answer();
  run(5);
  assert.deepEqual(spoken, ['Come quietly.']);
  assert.equal(log.at(-1).reason, 'finished');
});

test('the timer counts only while connected', () => {
  const { machine, run } = harness(100);
  machine.ring({ callId: 'a', callerId: 'sol_arrieta', lines: ['x'] });
  run(3);
  assert.equal(machine.call.seconds, 0);
  machine.answer();
  run(65);
  assert.equal(formatCallTime(machine.call.seconds), '01:05');
  assert.equal(formatCallTime(0), '00:00');
  assert.equal(formatCallTime(599.9), '09:59');
});

test('a second ring while busy is refused; a ring while the last call ends is taken', () => {
  const { machine, log } = harness();
  assert.equal(machine.ring({ callId: 'a', callerId: 'sol_arrieta' }), true);
  assert.equal(machine.ring({ callId: 'b', callerId: 'hattie_tolliver' }), false);
  machine.answer();
  assert.equal(machine.ring({ callId: 'b', callerId: 'hattie_tolliver' }), false);
  assert.equal(machine.call.callId, 'a');
  machine.end('hungUp');
  assert.equal(machine.ring({ callId: 'b', callerId: 'hattie_tolliver' }), true);
  assert.equal(machine.call.callId, 'b');
  assert.deepEqual(log.slice(-2).map((entry) => entry.type), ['idle', 'ringing']);
  assert.equal(machine.ring({}), false);
  assert.equal(machine.ring(null), false);
});

test('end while ringing counts as missed; an unknown reason falls back', () => {
  const { machine, log } = harness();
  machine.ring({ callId: 'a', callerId: 'sol_arrieta' });
  machine.end('nonsense');
  assert.equal(log.at(-1).reason, 'missed');
  assert.equal(machine.end(), false);
});

test('reading time grows with the words and stays in bounds', () => {
  assert.equal(readingSeconds(''), 2.5);
  assert.ok(readingSeconds('one two three four five six seven eight nine ten') > 4);
  assert.equal(readingSeconds('word '.repeat(200)), 12);
});

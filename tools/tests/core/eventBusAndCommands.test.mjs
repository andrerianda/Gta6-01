// The event bus, the command queue and their catalogues.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCommandQueue } from '../../../game/src/core/events/commandQueue.js';
import { createEventBus } from '../../../game/src/core/events/eventBus.js';
import { GAME_COMMANDS, GAME_COMMAND_NAMES } from '../../../game/src/core/events/gameCommands.js';
import { GAME_EVENTS, GAME_EVENT_TOPICS, eventDomainOf } from '../../../game/src/core/events/gameEvents.js';

test('events reach every subscriber in subscription order with the payload', () => {
  const bus = createEventBus();
  const seen = [];
  bus.on('police/wantedLevelChanged', (payload, topic) => seen.push(['a', payload.level, topic]));
  bus.on('police/wantedLevelChanged', (payload) => seen.push(['b', payload.level]));
  const count = bus.emit('police/wantedLevelChanged', { level: 3 });
  assert.equal(count, 2);
  assert.deepEqual(seen, [['a', 3, 'police/wantedLevelChanged'], ['b', 3]]);
  assert.equal(bus.emit('nobody/listens', {}), 0);
});

test('unsubscribing works, also from inside a handler, and once() fires once', () => {
  const bus = createEventBus();
  let first = 0;
  let second = 0;
  let single = 0;
  const offFirst = bus.on('t', () => {
    first += 1;
    offFirst();
  });
  bus.on('t', () => { second += 1; });
  bus.once('t', () => { single += 1; });
  bus.emit('t');
  bus.emit('t');
  assert.deepEqual([first, second, single], [1, 2, 1]);
  assert.equal(bus.listenerCount('t'), 1);
});

test('queued events wait for flush and keep their order, including events queued by handlers', () => {
  const bus = createEventBus();
  const seen = [];
  bus.on('a', () => {
    seen.push('a');
    bus.queue('c');
  });
  bus.on('b', () => seen.push('b'));
  bus.on('c', () => seen.push('c'));
  bus.queue('a');
  bus.queue('b');
  assert.deepEqual(seen, []);
  assert.equal(bus.queuedCount, 2);
  assert.equal(bus.flush(), 3);
  assert.deepEqual(seen, ['a', 'b', 'c']);
  assert.equal(bus.queuedCount, 0);
});

test('a throwing handler is reported and does not stop the others', () => {
  const failures = [];
  const bus = createEventBus({ onHandlerError: (failure) => failures.push(failure) });
  let reached = false;
  bus.on('t', () => { throw new Error('boom'); });
  bus.on('t', () => { reached = true; });
  bus.emit('t');
  assert.ok(reached);
  assert.equal(failures.length, 1);
  assert.equal(failures[0].topic, 't');
  assert.equal(failures[0].error.message, 'boom');
});

test('a topic outside the catalogue is reported once', () => {
  const unknown = [];
  const bus = createEventBus({ knownTopics: GAME_EVENT_TOPICS, onUnknownTopic: (topic) => unknown.push(topic) });
  bus.emit(GAME_EVENTS.MONEY_CHANGED, { cash: 10, delta: 10, reason: 'test' });
  bus.emit('economy/moneyChagned', {});
  bus.on('economy/moneyChagned', () => {});
  assert.deepEqual(unknown, ['economy/moneyChagned']);
  assert.deepEqual(bus.recentTopics(), [GAME_EVENTS.MONEY_CHANGED, 'economy/moneyChagned']);
});

test('the event catalogue is well formed', () => {
  assert.ok(Object.isFrozen(GAME_EVENTS));
  assert.ok(GAME_EVENT_TOPICS.length >= 60);
  assert.equal(new Set(GAME_EVENT_TOPICS).size, GAME_EVENT_TOPICS.length, 'topics are unique');
  for (const [name, topic] of Object.entries(GAME_EVENTS)) {
    assert.match(name, /^[A-Z][A-Z0-9_]*$/);
    assert.match(topic, /^[a-z][A-Za-z]*\/[a-z][A-Za-z]*$/, topic);
  }
  assert.equal(eventDomainOf(GAME_EVENTS.WANTED_LEVEL_CHANGED), 'police');
  // The topics the brief names explicitly exist.
  for (const key of ['CRIME_WITNESSED', 'DAMAGE_DEALT', 'VEHICLE_ENTERED', 'VEHICLE_EXITED', 'WANTED_LEVEL_CHANGED',
    'MISSION_STARTED', 'MISSION_PASSED', 'MISSION_FAILED', 'MONEY_CHANGED', 'DISTRICT_ENTERED', 'CLOCK_HOUR_CHANGED',
    'SAVE_REQUESTED', 'GAME_STATE_CHANGED']) {
    assert.ok(GAME_EVENTS[key], key);
  }
});

test('commands: one handler each, queued until flush or run at once with a result', () => {
  const unhandled = [];
  const commands = createCommandQueue({ onUnhandled: (name) => unhandled.push(name) });
  const teleports = [];
  commands.handle(GAME_COMMANDS.PLAYER_TELEPORT, (payload) => teleports.push(payload.position.x));
  commands.handle(GAME_COMMANDS.ECONOMY_ADD_MONEY, ({ amount }) => 100 + amount);

  commands.send(GAME_COMMANDS.PLAYER_TELEPORT, { position: { x: 1 } });
  commands.send(GAME_COMMANDS.PLAYER_TELEPORT, { position: { x: 2 } });
  assert.deepEqual(teleports, []);
  assert.equal(commands.pendingCount, 2);
  assert.equal(commands.flush(), 2);
  assert.deepEqual(teleports, [1, 2]);

  assert.equal(commands.run(GAME_COMMANDS.ECONOMY_ADD_MONEY, { amount: 50 }), 150);
  assert.equal(commands.run(GAME_COMMANDS.WANTED_SET_LEVEL, { level: 2 }), undefined);
  commands.run(GAME_COMMANDS.WANTED_SET_LEVEL, { level: 3 });
  assert.deepEqual(unhandled, [GAME_COMMANDS.WANTED_SET_LEVEL], 'reported once');
});

test('commands: a real system replaces a stub handler; unregistering only removes its own', () => {
  const commands = createCommandQueue();
  const offStub = commands.handle('time/set', () => 'stub');
  commands.handle('time/set', () => 'real');
  offStub();
  assert.equal(commands.run('time/set'), 'real');
  assert.ok(commands.has('time/set'));
});

test('commands: a failing queued command is reported and the rest still run', () => {
  const failures = [];
  const commands = createCommandQueue({ onHandlerError: (failure) => failures.push(failure) });
  let ran = false;
  commands.handle('a', () => { throw new Error('bad'); });
  commands.handle('b', () => { ran = true; });
  commands.send('a');
  commands.send('b');
  commands.flush();
  assert.ok(ran);
  assert.equal(failures[0].command, 'a');
});

test('the command catalogue is well formed', () => {
  assert.ok(Object.isFrozen(GAME_COMMANDS));
  assert.equal(new Set(GAME_COMMAND_NAMES).size, GAME_COMMAND_NAMES.length);
  for (const name of GAME_COMMAND_NAMES) assert.match(name, /^[a-z][A-Za-z]*\/[a-z][A-Za-z]*$/, name);
});

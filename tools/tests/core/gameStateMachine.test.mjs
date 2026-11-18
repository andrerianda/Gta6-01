// The game state machine and its table.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createGameStateMachine } from '../../../game/src/core/state/gameStateMachine.js';
import { GAME_STATE, GAME_STATE_DEFINITIONS, GAME_STATE_NAMES } from '../../../game/src/core/state/gameStates.js';

function machineAtPlaying() {
  const changes = [];
  const refused = [];
  const state = createGameStateMachine({
    onChanged: (change) => changes.push(`${change.from}>${change.to}`),
    onRefused: (message) => refused.push(message),
  });
  state.enter(GAME_STATE.LOADING);
  state.enter(GAME_STATE.START_MENU);
  state.enter(GAME_STATE.PLAYING);
  return { state, changes, refused };
}

test('the table covers every state the game needs and only links to states that exist', () => {
  for (const name of ['booting', 'loading', 'startMenu', 'playing', 'paused', 'cutscene', 'mapOpen', 'phoneOpen',
    'busted', 'wasted', 'missionPassed', 'missionFailed']) {
    assert.ok(GAME_STATE_NAMES.includes(name), name);
  }
  for (const [name, definition] of Object.entries(GAME_STATE_DEFINITIONS)) {
    assert.ok(Object.isFrozen(definition), name);
    assert.ok(definition.timeScale > 0 && definition.timeScale <= 1, name);
    for (const next of definition.next) assert.ok(GAME_STATE_DEFINITIONS[next], `${name} -> ${next}`);
    assert.ok(!definition.next.includes(name), `${name} does not link to itself`);
  }
  assert.equal(GAME_STATE_DEFINITIONS.paused.simulates, false);
  assert.equal(GAME_STATE_DEFINITIONS.mapOpen.simulates, false);
  assert.equal(GAME_STATE_DEFINITIONS.phoneOpen.simulates, true);
  assert.equal(GAME_STATE_DEFINITIONS.playing.inputContext, null);
  assert.ok(GAME_STATE_DEFINITIONS.wasted.timeScale < 1);
});

test('the boot path and the announcements', () => {
  const { state, changes, refused } = machineAtPlaying();
  assert.deepEqual(changes, ['booting>loading', 'loading>startMenu', 'startMenu>playing']);
  assert.equal(state.current, GAME_STATE.PLAYING);
  assert.equal(state.previous, GAME_STATE.START_MENU);
  assert.ok(state.simulates);
  assert.ok(state.is(GAME_STATE.PAUSED, GAME_STATE.PLAYING));
  assert.equal(state.transitionCount, 3);
  assert.deepEqual(refused, []);
});

test('a transition the table does not allow is refused and changes nothing', () => {
  const { state, refused } = machineAtPlaying();
  state.enter(GAME_STATE.WASTED);
  assert.equal(state.enter(GAME_STATE.MAP_OPEN), false);
  assert.equal(state.current, GAME_STATE.WASTED);
  assert.equal(state.enter('flying'), false);
  assert.equal(refused.length, 2);
  assert.match(refused[0], /wasted.*mapOpen/);
  assert.match(refused[1], /no such state/);
  assert.equal(state.enter(GAME_STATE.WASTED), true, 'entering the current state is a no-op');
});

test('overlays return to what was underneath, also when stacked', () => {
  const { state } = machineAtPlaying();
  state.enter(GAME_STATE.PHONE_OPEN);
  assert.ok(state.simulates);
  state.enter(GAME_STATE.PAUSED);
  assert.ok(!state.simulates);
  assert.equal(state.back(), true);
  assert.equal(state.current, GAME_STATE.PHONE_OPEN);
  assert.equal(state.back(), true);
  assert.equal(state.current, GAME_STATE.PLAYING);
  assert.equal(state.back(), false, 'playing is not an overlay');

  state.enter(GAME_STATE.CUTSCENE);
  state.enter(GAME_STATE.PAUSED);
  state.back();
  assert.equal(state.current, GAME_STATE.CUTSCENE, 'pausing a cutscene resumes the cutscene');
});

test('entering a base state closes the overlays', () => {
  const { state } = machineAtPlaying();
  state.enter(GAME_STATE.PHONE_OPEN);
  state.enter(GAME_STATE.WASTED);
  assert.equal(state.back(), false);
  assert.equal(state.timeScale, GAME_STATE_DEFINITIONS.wasted.timeScale);
  state.enter(GAME_STATE.PLAYING);
  state.enter(GAME_STATE.MAP_OPEN);
  state.enter(GAME_STATE.PLAYING);
  assert.equal(state.back(), false);
});

test('listeners and the time in state', () => {
  const { state } = machineAtPlaying();
  const seen = [];
  const off = state.onChange((change) => seen.push(change));
  state.tick(0.5);
  state.tick(0.25);
  assert.equal(state.secondsInState, 0.75);
  state.enter(GAME_STATE.MISSION_PASSED, { missionId: 'first_light' });
  assert.equal(state.secondsInState, 0);
  assert.deepEqual(seen, [{ from: 'playing', to: 'missionPassed', payload: { missionId: 'first_light' } }]);
  off();
  state.enter(GAME_STATE.PLAYING);
  assert.equal(seen.length, 1);
});

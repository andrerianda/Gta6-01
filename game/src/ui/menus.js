// The menus: the start menu over the living city (Continue, New game, Load game, Settings,
// Controls) and the pause menu (Resume, Statistics, Settings, Controls, Save game, Load game).
// This system owns the commands that start, pause and resume the game and walks the screens in
// the menu states; the screens themselves are built by menuScreens.js. Escape pauses the game in
// play, except in the 'shop' input context, where it closes the shop instead.
// Commands: GAME_START {slot?, newGame?}, GAME_PAUSE, GAME_RESUME. Publishes NEW_GAME_STARTED.
// Sends AUDIO_PLAY 'ui_click' and 'ui_back'.
import { GAME_COMMANDS } from '../core/events/gameCommands.js';
import { GAME_EVENTS } from '../core/events/gameEvents.js';
import { GAME_STATE } from '../core/state/gameStates.js';
import { newGameStartHour } from '../core/time/gameClock.js';

/**
 * Creates the menus system.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {import('../core/systems/gameSystemContract.js').GameSystem}
 */
export function createMenusSystem(context) {
  const { commands, controls, events, input, state } = context;
  let screens = null;
  let stopListening = null;

  function startGame(payload) {
    if (!state.is(GAME_STATE.START_MENU)) return;
    // A new game opens at the catalogue's hour (18:15, into golden hour) on day 1, however long
    // the start menu ran; a loaded save sets its own time afterwards. A time fixed by the launch
    // options (?time=) freezes the clock and is kept.
    if (payload && payload.newGame && !context.clock.frozen) {
      const hours = newGameStartHour(context.content);
      if (commands.has(GAME_COMMANDS.TIME_SET)) commands.run(GAME_COMMANDS.TIME_SET, { hours, day: 1 });
      else context.clock.setTimeOfDay(hours, 1);
    }
    state.enter(GAME_STATE.PLAYING);
    events.emit(GAME_EVENTS.NEW_GAME_STARTED, { seed: context.seed, characterId: null });
  }
  const pauseGame = () => {
    if (state.is(GAME_STATE.PLAYING, GAME_STATE.CUTSCENE)) state.enter(GAME_STATE.PAUSED);
  };
  const resumeGame = () => {
    if (state.is(GAME_STATE.PAUSED)) state.back();
  };
  const lockMouse = () => {
    if (controls.device) controls.device.setPointerCapture(true, true);
  };

  return {
    name: 'menus',
    runsWhen: 'always',

    async init(progress) {
      const { createMenuScreens } = await import('./menuScreens.js');
      screens = createMenuScreens(context, {
        newGame: () => {
          commands.run(GAME_COMMANDS.GAME_START, { newGame: true });
          lockMouse();
        },
        // Start first, then load: the load overrides the new game's opening placement.
        continueGame: (slot) => {
          commands.run(GAME_COMMANDS.GAME_START, { slot });
          context.systems.find('saveGame')?.load(slot);
          lockMouse();
        },
        resume: () => {
          commands.run(GAME_COMMANDS.GAME_RESUME, {});
          lockMouse();
        },
      });
      commands.handle(GAME_COMMANDS.GAME_START, startGame);
      commands.handle(GAME_COMMANDS.GAME_PAUSE, pauseGame);
      commands.handle(GAME_COMMANDS.GAME_RESUME, resumeGame);
      stopListening = events.on(GAME_EVENTS.GAME_STATE_CHANGED, ({ to }) => {
        if (to === GAME_STATE.START_MENU) screens.open('start');
        else if (to === GAME_STATE.PAUSED) screens.open('pause');
      });
      screens.open('start');
      screens.open('pause');
      if (typeof progress === 'function') progress(1, 'menus');
    },

    update() {
      if (!screens) return;
      if (state.is(GAME_STATE.START_MENU)) {
        screens.refreshStartIfForeign();
        if (state.secondsInState >= 0.2) screens.handleInput('start', input);
      } else if (state.is(GAME_STATE.PAUSED)) {
        if (state.secondsInState >= 0.2 && screens.handleInput('pause', input) === 'resume') resumeGame();
      } else if (state.is(GAME_STATE.PLAYING) && input.pressed('pause') && input.context !== 'shop') {
        pauseGame();
      }
    },

    dispose() {
      if (typeof stopListening === 'function') stopListening();
      stopListening = null;
      screens = null;
    },
  };
}

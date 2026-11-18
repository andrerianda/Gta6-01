// The menus: the start menu over the living city (one click or Enter leads into play), the
// pause menu, and the controls shown on both. It owns the commands that start, pause and resume
// the game. Second wave: settings (graphics, audio, controls with rebinding), save slots,
// statistics, credits.
import { GAME_COMMANDS } from '../core/events/gameCommands.js';
import { GAME_EVENTS } from '../core/events/gameEvents.js';
import { GAME_STATE } from '../core/state/gameStates.js';

/**
 * Creates the menus system.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {import('../core/systems/gameSystemContract.js').GameSystem}
 */
export function createMenusSystem(context) {
  const { commands, controls, events, input, page, state } = context;

  function startGame() {
    if (!state.is(GAME_STATE.START_MENU)) return;
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

  function controlsList(document) {
    const list = document.createElement('dl');
    list.className = 'menu-controls';
    for (const [contextName, action] of SHOWN_CONTROLS) {
      const key = document.createElement('dt');
      key.textContent = controls.promptFor(action, contextName);
      const meaning = document.createElement('dd');
      meaning.textContent = controls.labels[action] ?? action;
      list.append(key, meaning);
    }
    return list;
  }

  function button(document, text, onClick) {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = 'menu-button';
    element.textContent = text;
    element.addEventListener('click', onClick);
    return element;
  }

  return {
    name: 'menus',
    runsWhen: 'always',

    init() {
      const document = page.document;
      const startMenu = page.element('start-menu');
      const title = document.createElement('h1');
      title.textContent = 'MARAZUL';
      const tagline = document.createElement('p');
      tagline.className = 'menu-tagline';
      tagline.textContent = 'An open city on a warm sea. Take what the tide leaves.';
      startMenu.replaceChildren(title, tagline, button(document, 'Play', () => {
        commands.run(GAME_COMMANDS.GAME_START, { newGame: true });
        lockMouse();
      }), controlsList(document));

      const pauseMenu = page.element('pause-menu');
      const paused = document.createElement('h2');
      paused.textContent = 'Paused';
      pauseMenu.replaceChildren(paused, button(document, 'Resume', () => {
        commands.run(GAME_COMMANDS.GAME_RESUME, {});
        lockMouse();
      }), controlsList(document));

      commands.handle(GAME_COMMANDS.GAME_START, startGame);
      commands.handle(GAME_COMMANDS.GAME_PAUSE, pauseGame);
      commands.handle(GAME_COMMANDS.GAME_RESUME, resumeGame);
    },

    update() {
      if (state.secondsInState < 0.2) return;
      if (state.is(GAME_STATE.START_MENU)) {
        if (input.pressed('menuAccept')) startGame();
      } else if (state.is(GAME_STATE.PAUSED)) {
        if (input.pressed('menuAccept') || input.pressed('pause')) resumeGame();
      } else if (state.is(GAME_STATE.PLAYING) && input.pressed('pause')) {
        pauseGame();
      }
    },
  };
}

/** The controls listed on the start and pause menus: [input context, action]. */
const SHOWN_CONTROLS = Object.freeze([
  ['onFoot', 'moveForward'], ['onFoot', 'moveLeft'], ['onFoot', 'moveBackward'], ['onFoot', 'moveRight'],
  ['onFoot', 'sprint'], ['onFoot', 'jump'], ['onFoot', 'enterVehicle'], ['onFoot', 'attack'],
  ['onFoot', 'aim'], ['inVehicle', 'handbrake'], ['inVehicle', 'horn'], ['onFoot', 'openMap'],
  ['onFoot', 'openPhone'], ['always', 'pause'],
]);

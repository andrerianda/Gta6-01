// The states of the game and what each one means for the engine, as one table: whether the world
// simulates, how fast, which input context is live, whether the mouse is captured, whether the
// HUD shows, and which states may follow.

/** The state names. */
export const GAME_STATE = Object.freeze({
  BOOTING: 'booting',                 // the page is starting the engine
  LOADING: 'loading',                 // assets and systems load behind the loading screen
  START_MENU: 'startMenu',            // the title menu over the living city
  PLAYING: 'playing',                 // the open world, on foot or in a vehicle
  PAUSED: 'paused',                   // the pause menu
  CUTSCENE: 'cutscene',               // a scripted camera with subtitles and the letterbox
  MAP_OPEN: 'mapOpen',                // the full-screen city map
  PHONE_OPEN: 'phoneOpen',            // the phone, while the world carries on
  BUSTED: 'busted',                   // arrested: slow motion, then the police station
  WASTED: 'wasted',                   // killed: slow motion, then the hospital
  MISSION_PASSED: 'missionPassed',    // the reward banner
  MISSION_FAILED: 'missionFailed',    // the failure banner with a retry
});

/**
 * @typedef {Object} GameStateDefinition
 * @property {boolean} simulates Whether systems that run 'simulating' tick and the clock moves.
 * @property {number} timeScale Simulated seconds per real second while in the state.
 * @property {string | null} inputContext The input context the state forces; null leaves the
 *   choice to the player system (on foot or in a vehicle).
 * @property {boolean} capturesPointer Whether the mouse is locked to the viewport for looking.
 * @property {boolean} showsHud Whether the HUD is visible.
 * @property {boolean} overlay An overlay sits on top of another state and returns to it.
 * @property {readonly string[]} next The states that may follow.
 */

const S = GAME_STATE;

/** What each state means. @type {Readonly<Record<string, Readonly<GameStateDefinition>>>} */
export const GAME_STATE_DEFINITIONS = Object.freeze({
  [S.BOOTING]: define({
    simulates: false, inputContext: 'menu', next: [S.LOADING],
  }),
  [S.LOADING]: define({
    simulates: false, inputContext: 'menu', next: [S.START_MENU, S.PLAYING],
  }),
  [S.START_MENU]: define({
    simulates: true, inputContext: 'menu', next: [S.PLAYING, S.LOADING],
  }),
  [S.PLAYING]: define({
    simulates: true, inputContext: null, capturesPointer: true, showsHud: true,
    next: [S.PAUSED, S.CUTSCENE, S.MAP_OPEN, S.PHONE_OPEN, S.BUSTED, S.WASTED, S.MISSION_PASSED,
      S.MISSION_FAILED, S.START_MENU, S.LOADING],
  }),
  [S.PAUSED]: define({
    simulates: false, inputContext: 'menu', overlay: true,
    next: [S.PLAYING, S.CUTSCENE, S.START_MENU, S.LOADING],
  }),
  [S.CUTSCENE]: define({
    simulates: true, inputContext: 'cutscene',
    next: [S.PLAYING, S.PAUSED, S.MISSION_PASSED, S.MISSION_FAILED, S.START_MENU],
  }),
  [S.MAP_OPEN]: define({
    simulates: false, inputContext: 'map', overlay: true, next: [S.PLAYING, S.PAUSED],
  }),
  [S.PHONE_OPEN]: define({
    simulates: true, inputContext: 'phone', overlay: true, showsHud: true,
    next: [S.PLAYING, S.PAUSED, S.CUTSCENE, S.BUSTED, S.WASTED, S.MISSION_PASSED, S.MISSION_FAILED],
  }),
  [S.BUSTED]: define({
    simulates: true, timeScale: 0.35, inputContext: 'cutscene', next: [S.PLAYING, S.LOADING, S.START_MENU],
  }),
  [S.WASTED]: define({
    simulates: true, timeScale: 0.25, inputContext: 'cutscene', next: [S.PLAYING, S.LOADING, S.START_MENU],
  }),
  [S.MISSION_PASSED]: define({
    simulates: true, timeScale: 0.6, inputContext: 'cutscene', showsHud: true,
    next: [S.PLAYING, S.CUTSCENE, S.PAUSED],
  }),
  [S.MISSION_FAILED]: define({
    simulates: true, timeScale: 0.35, inputContext: 'cutscene',
    next: [S.PLAYING, S.CUTSCENE, S.LOADING, S.START_MENU],
  }),
});

/** The list of state names. */
export const GAME_STATE_NAMES = Object.freeze(Object.values(GAME_STATE));

function define(fields) {
  return Object.freeze({
    simulates: fields.simulates,
    timeScale: fields.timeScale ?? 1,
    inputContext: fields.inputContext,
    capturesPointer: fields.capturesPointer ?? false,
    showsHud: fields.showsHud ?? false,
    overlay: fields.overlay ?? false,
    next: Object.freeze(fields.next),
  });
}

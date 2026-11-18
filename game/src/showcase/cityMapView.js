// The map picture, scene `city-map`: the game's own full-screen city map (M) opened in play, the
// whole of Marazul painted from the city plan with every district named, the sights, shops,
// safehouses and mission givers as icons, the legend beside it, the lead's arrow on Gran Via and
// the GPS route of a story mission's objective ("Meet Whitlock at police headquarters") and of a
// waypoint set out on the sea-front. Everything is the real game: the mission director starts
// the mission, the minimap system owns the map and its routes, the state machine opens it.
import { GAME_COMMANDS } from '../core/events/gameCommands.js';
import { GAME_STATE } from '../core/state/gameStates.js';
import { openScene, pavementPointNear, placeLead, pointInFrame, streetFrameOf } from './showcaseStaging.js';

/** The clock: late afternoon (the map is drawn the same at any hour; the world behind it is paused). */
const HOURS = 17.2;
/** Where the lead stands: along Gran Via Marazul in Centro, the middle of the city. */
const ALONG = 0.47;
/** The mission whose objective route shows: Meet Whitlock at police headquarters. */
const MISSION = Object.freeze({ missionId: 'm16_for_the_record', startIndex: 0 });
/** A waypoint on Bulevar Dorado, so a second route runs to the sea-front ([along the boulevard]). */
const WAYPOINT_ALONG = 0.62;
/** The lead's cash (shown on the HUD's minimap side when the map closes; the map has its own panel). */
const CASH = 152800;

/**
 * Registers the map scene.
 * @param {object} context The game context.
 * @returns {() => void} Removes the scene again.
 */
export function registerCityMapView(context) {
  return context.showcase.register({
    name: 'city-map',
    title: 'The city map of Marazul',
    description: 'The full-screen map opened in play: every district named, sights, shops and mission givers, the legend and the GPS routes to the objective and a waypoint.',
    async run(game, tools) {
      const { commands } = game;
      openScene(game, { hours: HOURS, traffic: 1, crowd: 1 });
      const frame = streetFrameOf(game, 'gran_via_marazul', ALONG);
      const spot = pavementPointNear(game, frame, frame.kerb + 2.6, 0, [frame.kerb + 1, frame.kerb + 8]);
      await placeLead(game, tools, spot, -frame.compass);
      if (commands.has(GAME_COMMANDS.MISSION_START)) commands.run(GAME_COMMANDS.MISSION_START, { ...MISSION, skipIntro: true });
      const cash = game.systems.find('economy')?.cash;
      if (Number.isFinite(cash) && cash < CASH && commands.has(GAME_COMMANDS.ECONOMY_ADD_MONEY)) {
        commands.run(GAME_COMMANDS.ECONOMY_ADD_MONEY, { amount: CASH - cash, reason: 'showcase' });
      }
      if (new URLSearchParams(globalThis.location?.search ?? '').get('waypoint') !== '0' && commands.has(GAME_COMMANDS.UI_SET_WAYPOINT)) {
        const boulevard = streetFrameOf(game, 'bulevar_dorado', WAYPOINT_ALONG);
        commands.run(GAME_COMMANDS.UI_SET_WAYPOINT, { position: { ...pointInFrame(boulevard, 0, 0), y: 0 } });
      }
      tools.advance(1.5);
      game.state.enter(GAME_STATE.MAP_OPEN);
      tools.advance(0.6);
    },
  });
}

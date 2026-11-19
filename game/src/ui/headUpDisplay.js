// The head-up display: wanted stars, cash, health and armour, the weapon and its ammunition,
// the mission objective and timer, subtitles, the district and street name, the speedometer,
// notifications and key prompts, the radio station banner, the incoming call card and the weapon
// wheel. It only listens to events and reads context state, draws into the HUD containers of
// game/index.html (styled by game/styles/hud.css) and never touches the 3D scene. Widgets:
// ui/headUpDisplayWidgets.js; event wiring: ui/headUpDisplayEvents.js.
import { GAME_COMMANDS } from '../core/events/gameCommands.js';
import { STREET_REACH_METRES, placeLineFor } from './hudFormatting.js';

/**
 * Creates the head-up display system.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {import('../core/systems/gameSystemContract.js').GameSystem}
 */
export function createHeadUpDisplaySystem(context) {
  const { commands, content, entities, page } = context;
  let hud = null;
  let connection = null;
  let connect = null;

  return {
    name: 'hud',
    runsWhen: 'always',
    /** The weapon wheel (Tab): isOpen, point(x, y) for scripts. */
    get weaponWheel() { return hud?.weaponWheel ?? null; },
    /**
     * Shows the district card (with its street line) again for `seconds`, for showcase stills
     * staged longer than the card stays; does nothing while it names no place yet.
     * @param {number} [seconds]
     * @returns {boolean} Whether the card is shown.
     */
    showLocationAgain(seconds = 6) {
      if (!hud?.location) return false;
      let name = hud.location.districtText;
      let street;
      // A still is staged before the game reports ready, when the card has not been worked out yet:
      // work it out here from the player's position, as the event wiring does once the game runs.
      const city = context.systems?.find?.('openWorldCity');
      const p = context.focus?.position;
      if (!name && p && typeof city?.nearestRoad === 'function' && typeof city.districtAt === 'function') {
        const place = placeLineFor(city.nearestRoad(p.x, p.z, STREET_REACH_METRES + 40), city.districtAt, p.x, p.z, STREET_REACH_METRES);
        name = content.find('cityDistricts')?.CITY_DISTRICTS?.[place.districtId]?.name ?? place.districtId ?? '';
        street = place.street;
      }
      if (!name) return false;
      hud.location.setDistrict(name, street, seconds);
      return true;
    },

    async init() {
      const [{ buildHeadUpDisplay }, events] = await Promise.all([import('./headUpDisplayWidgets.js'), import('./headUpDisplayEvents.js')]);
      const weapons = content.find('weaponCatalog');
      hud = buildHeadUpDisplay(page, { weapons: weapons?.WEAPON_CATALOG, wheelSlots: weapons?.WEAPON_WHEEL_SLOTS }, context);
      connect = events.connectHeadUpDisplay;
      commands.handle(GAME_COMMANDS.UI_NOTIFY, ({ text, kind, seconds }) => hud.notifications.post(text, kind, seconds));
      commands.handle(GAME_COMMANDS.UI_SHOW_SUBTITLE, ({ speakerName, text, seconds }) => hud.subtitles.show(speakerName, text, seconds));
    },

    start() {
      connection = connect(context, hud);
    },

    update(deltaSeconds) {
      const vehicleId = connection?.vehicleId ?? null;
      const speed = vehicleId === null ? 0 : entities.get(vehicleId)?.data?.speed ?? 0;
      hud.update(deltaSeconds, speed, connection?.speedUnit ?? 'kmh');
      connection?.tick(deltaSeconds);
    },

    dispose() {
      connection?.dispose();
    },
  };
}

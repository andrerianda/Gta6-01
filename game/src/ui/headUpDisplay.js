// The head-up display: wanted stars, cash, health and armour, the weapon and its ammunition,
// the mission objective and timer, subtitles, the district and street name, the speedometer,
// notifications and key prompts, the radio station banner, the incoming call card and the weapon
// wheel. It only listens to events and reads context state, draws into the HUD containers of
// game/index.html (styled by game/styles/hud.css) and never touches the 3D scene. Widgets:
// ui/headUpDisplayWidgets.js; event wiring: ui/headUpDisplayEvents.js.
import { GAME_COMMANDS } from '../core/events/gameCommands.js';

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

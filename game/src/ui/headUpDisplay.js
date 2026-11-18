// The head-up display: wanted stars, cash, health and armour, the weapon and its ammunition,
// the mission objective and timer, subtitles, the district and street name, the speedometer,
// notifications and key prompts. It only listens to events and reads context state, draws into
// the HUD containers of game/index.html (styled by game/styles/hud.css) and never touches the
// 3D scene. Widgets: ui/headUpDisplayWidgets.js and one file each beside it.
import { GAME_COMMANDS } from '../core/events/gameCommands.js';
import { GAME_EVENTS } from '../core/events/gameEvents.js';

/**
 * Creates the head-up display system.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {import('../core/systems/gameSystemContract.js').GameSystem}
 */
export function createHeadUpDisplaySystem(context) {
  const { commands, content, controls, entities, events, page, settings, systems } = context;
  const E = GAME_EVENTS;
  let hud = null;
  let playerId = null;            // the player character's entity id, from PLAYER_SPAWNED
  let vehicleId = null;           // the vehicle the player drives, or null on foot
  let speedUnit = 'kmh';
  const unsubscribe = [];
  const listen = (topic, handler) => unsubscribe.push(events.on(topic, handler));
  const isPlayers = (ownerId) => playerId === null || ownerId === playerId;
  const districtName = (id) => content.find('cityDistricts')?.CITY_DISTRICTS?.[id]?.name ?? id;

  return {
    name: 'hud',
    runsWhen: 'always',

    async init() {
      const { buildHeadUpDisplay } = await import('./headUpDisplayWidgets.js');
      hud = buildHeadUpDisplay(page, { weapons: content.find('weaponCatalog')?.WEAPON_CATALOG });
      speedUnit = settings.get('gameplay.speedUnit') ?? 'kmh';
      hud.subtitles.setEnabled(settings.get('gameplay.subtitles'));
      commands.handle(GAME_COMMANDS.UI_NOTIFY, ({ text, kind, seconds }) => hud.notifications.post(text, kind, seconds));
      commands.handle(GAME_COMMANDS.UI_SHOW_SUBTITLE, ({ speakerName, text, seconds }) => hud.subtitles.show(speakerName, text, seconds));
    },

    start() {
      const economy = systems.find('economy');
      if (Number.isFinite(economy?.cash)) hud.cash.set(economy.cash, 0, true);
      listen(E.WANTED_LEVEL_CHANGED, ({ level, previous }) => {
        hud.wantedStars.setLevel(level);
        if (level > previous) hud.wantedStars.setSearching(false);
      });
      listen(E.WANTED_SEARCH_STARTED, () => hud.wantedStars.setSearching(true));
      listen(E.POLICE_SPOTTED_PLAYER, () => hud.wantedStars.setSearching(false));
      listen(E.WANTED_CLEARED, () => hud.wantedStars.setLevel(0));
      listen(E.MONEY_CHANGED, ({ cash, delta }) => hud.cash.set(cash, delta));
      listen(E.SAVE_LOADED, () => {
        const cash = systems.find('economy')?.cash;
        if (Number.isFinite(cash)) hud.cash.set(cash, 0, true);
      });
      listen(E.PLAYER_SPAWNED, (event) => { playerId = event.playerId ?? null; });
      listen(E.PLAYER_HEALTH_CHANGED, ({ health, armour }) => hud.vitals.set(health, armour));
      listen(E.WEAPON_EQUIPPED, (event) => {
        if (isPlayers(event.ownerId)) hud.weapon.equip(event.weaponId, event.magazine, event.reserve);
      });
      listen(E.AMMO_CHANGED, (event) => {
        if (isPlayers(event.ownerId)) hud.weapon.setAmmunition(event.magazine, event.reserve);
      });
      listen(E.MISSION_STARTED, ({ title }) => hud.objective.start(title));
      listen(E.MISSION_OBJECTIVE_CHANGED, ({ text }) => hud.objective.setObjective(text));
      listen(E.MISSION_TIMER_CHANGED, ({ secondsLeft }) => hud.objective.setTimer(secondsLeft));
      listen(E.MISSION_PASSED, ({ title, cash }) => {
        hud.objective.clear();
        hud.objective.showResult('passed', title, { cash });
      });
      listen(E.MISSION_FAILED, ({ title, reason }) => {
        hud.objective.clear();
        hud.objective.showResult('failed', title, { reason });
      });
      listen(E.DIALOGUE_LINE_SPOKEN, ({ speakerName, text, seconds }) => hud.subtitles.show(speakerName, text, seconds));
      listen(E.DISTRICT_ENTERED, ({ districtId, name }) => hud.location.setDistrict(name ?? districtName(districtId)));
      listen(E.STREET_CHANGED, ({ street }) => hud.location.setStreet(street));
      listen(E.VEHICLE_ENTERED, (event) => {
        if (!event.isPlayer) return;
        vehicleId = event.vehicleId;
        hud.speedometer.setVisible(true);
      });
      listen(E.VEHICLE_EXITED, (event) => {
        if (!event.isPlayer) return;
        vehicleId = null;
        hud.speedometer.setVisible(false);
      });
      listen(E.NOTIFICATION_POSTED, ({ text, kind, seconds }) => hud.notifications.post(text, kind, seconds));
      listen(E.HELP_PROMPT_CHANGED, ({ action, text }) => hud.notifications.setHelp(action ? controls.promptFor(action) : null, text));
      listen(E.SETTINGS_CHANGED, ({ key, value }) => {
        if (key === 'gameplay.speedUnit') speedUnit = value;
        if (key === 'gameplay.subtitles') hud.subtitles.setEnabled(value);
      });
    },

    update(deltaSeconds) {
      const speed = vehicleId === null ? 0 : entities.get(vehicleId)?.data?.speed ?? 0;
      hud.update(deltaSeconds, speed, speedUnit);
    },

    dispose() {
      for (const off of unsubscribe.splice(0)) off();
    },
  };
}

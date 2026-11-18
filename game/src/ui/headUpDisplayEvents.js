// Connects the HUD widgets to the game's events: wanted level, cash, health, the weapon and its
// ammunition, missions, subtitles, district and street, vehicles, notifications and help
// prompts, the car radio's station and calls from mission givers. Keeps the little state the
// HUD needs between events (the player's entity id, the vehicle driven, the speed unit), and
// twice a second works out the street line of the location card itself: the nearest street only
// when the player is on it or within STREET_REACH_METRES of its edge, none on a beach, in a park
// or deep in a lot.
import { GAME_EVENTS } from '../core/events/gameEvents.js';
import { STREET_REACH_METRES, streetLineFor } from './hudFormatting.js';

const STREET_CHECK_SECONDS = 0.5;

/**
 * Starts listening.
 * @param {import('../core/systems/gameContext.js').GameContext} context
 * @param {ReturnType<import('./headUpDisplayWidgets.js').buildHeadUpDisplay>} hud
 * @returns {{readonly vehicleId: string|null, readonly speedUnit: string, tick: (deltaSeconds: number) => void,
 *   dispose: () => void}}
 */
export function connectHeadUpDisplay(context, hud) {
  const { content, controls, events, settings, systems } = context;
  let shownStreet;                // the street line on the card (null: district only; undefined: not yet)
  let streetSeconds = 0;
  /** The street line for where the player is now; undefined when the city cannot say (use the event). */
  const streetHere = () => {
    const city = systems.find('openWorldCity');
    if (typeof city?.nearestRoad !== 'function') return undefined;
    const p = context.focus.position;
    return streetLineFor(city.nearestRoad(p.x, p.z, STREET_REACH_METRES + 40), STREET_REACH_METRES);
  };
  const E = GAME_EVENTS;
  let playerId = null;            // the player character's entity id, from PLAYER_SPAWNED
  let vehicleId = null;           // the vehicle the player drives, or null on foot
  let speedUnit = settings.get('gameplay.speedUnit') ?? 'kmh';
  const unsubscribe = [];
  const listen = (topic, handler) => unsubscribe.push(events.on(topic, handler));
  const isPlayers = (ownerId) => playerId === null || ownerId === playerId;
  const districtName = (id, name) => content.find('cityDistricts')?.CITY_DISTRICTS?.[id]?.name ?? name ?? id;
  const characterName = (id) => content.find('storyCharacters')?.STORY_CHARACTERS?.[id]?.name ?? '';
  const readCash = () => {
    const cash = systems.find('economy')?.cash;
    if (Number.isFinite(cash)) hud.cash.set(cash, 0, true);
  };

  readCash();
  hud.subtitles.setEnabled(settings.get('gameplay.subtitles'));
  listen(E.WANTED_LEVEL_CHANGED, ({ level, previous }) => {
    hud.wantedStars.setLevel(level);
    if (level > previous) hud.wantedStars.setSearching(false);
  });
  listen(E.WANTED_SEARCH_STARTED, () => hud.wantedStars.setSearching(true));
  listen(E.POLICE_SPOTTED_PLAYER, () => hud.wantedStars.setSearching(false));
  listen(E.WANTED_CLEARED, () => hud.wantedStars.setLevel(0));
  listen(E.MONEY_CHANGED, ({ cash, delta }) => hud.cash.set(cash, delta));
  listen(E.SAVE_LOADED, readCash);
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
  listen(E.DISTRICT_ENTERED, ({ districtId, name }) => {
    const line = streetHere();
    if (line !== undefined) shownStreet = line;
    hud.location.setDistrict(districtName(districtId, name), line);
  });
  listen(E.STREET_CHANGED, ({ street }) => { if (streetHere() === undefined) hud.location.setStreet(street); });
  listen(E.VEHICLE_ENTERED, (event) => {
    if (!event.isPlayer) return;
    vehicleId = event.vehicleId;
    hud.setDriving(true);
  });
  listen(E.VEHICLE_EXITED, (event) => {
    if (!event.isPlayer) return;
    vehicleId = null;
    hud.setDriving(false);
  });
  listen(E.RADIO_STATION_CHANGED, ({ stationId, name }) => {
    if (vehicleId !== null || stationId !== 'radio_off') hud.radio.show(name ?? stationId, stationId === 'radio_off');
  });
  listen(E.PHONE_MESSAGE_RECEIVED, ({ contactId, missionId }) => {
    if (missionId) hud.call.show(characterName(contactId), controls?.promptFor?.('openPhone') ?? 'T');
  });
  listen(E.NOTIFICATION_POSTED, ({ text, kind, seconds }) => hud.notifications.post(text, kind, seconds));
  listen(E.HELP_PROMPT_CHANGED, ({ action, text }) => hud.notifications.setHelp(action ? controls.promptFor(action) : null, text));
  listen(E.SETTINGS_CHANGED, ({ key, value }) => {
    if (key === 'gameplay.speedUnit') speedUnit = value;
    if (key === 'gameplay.subtitles') hud.subtitles.setEnabled(value);
  });

  return {
    get vehicleId() { return vehicleId; },
    get speedUnit() { return speedUnit; },
    /** @param {number} deltaSeconds Updates the location card's street line while the world runs. */
    tick(deltaSeconds) {
      streetSeconds += deltaSeconds;
      if (streetSeconds < STREET_CHECK_SECONDS || !context.state.simulates) return;
      streetSeconds = 0;
      const line = streetHere();
      if (line === undefined || line === shownStreet) return;
      shownStreet = line;
      hud.location.setStreet(line);
    },
    dispose() { for (const off of unsubscribe.splice(0)) off(); },
  };
}

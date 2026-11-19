// Connects the HUD widgets to the game's events: wanted level, cash, health, the weapon and its
// ammunition, missions, subtitles, district and street, vehicles, notifications and help
// prompts, the car radio's station and calls from mission givers. Keeps the little state the
// HUD needs between events (the player's entity id, the vehicle driven, the speed unit), and
// twice a second works out the location card itself (hudFormatting.placeLineFor): the nearest
// street only when the player is on it or within STREET_REACH_METRES of its edge (none on a
// beach, in a park or deep in a lot), and the district that street belongs to in the road plan,
// so a street on a district boundary is named with its own district from either pavement.
import { GAME_EVENTS } from '../core/events/gameEvents.js';
import { STREET_REACH_METRES, placeLineFor } from './hudFormatting.js';
import { createNamedPlaces } from './namedPlaces.js';

const STREET_CHECK_SECONDS = 0.5;
/** Farther than this between two looks the player was put somewhere else (the fastest jet covers 500 m in half a second). */
const JUMP_METRES = 600;
/** In flight the place name is one small line that leaves quickly. */
const FLIGHT_BANNER_SECONDS = 3.5;

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
  let shownDistrict;              // the district id on the card (undefined: not yet)
  let streetSeconds = 0;
  let ready = false;              // the game has drawn its first frame (GAME_READY)
  let announced = null;           // the last DISTRICT_ENTERED, for its name
  let lastX = NaN;                // where the player was at the last look, to tell a jump across the map
  let lastZ = NaN;
  let flying = false;             // the lead flies an airplane: the clean flight screen (styles/hud.css, body[data-flying])
  let flightView = null;          // 'cockpit' | 'chase' | 'outside' while flying
  let eventFlightView = null;
  let namedPlaces = null;         // ui/namedPlaces.js over the city plan, once the plan is there
  const body = context.page?.document?.body ?? null;
  const pageView = context.page?.document?.defaultView ?? null;
  /**
   * {districtId, street, name?} for where the player is now; undefined when the city cannot say (use
   * the events). The air base, the aerodrome, the island and the sea carry their own names
   * (districtId 'place:<id>'), so the card never names a district the player is not in.
   */
  const placeHere = () => {
    const city = systems.find('openWorldCity');
    const p = context.focus.position;
    if (!namedPlaces && city?.plan) namedPlaces = createNamedPlaces(city.plan);
    const named = namedPlaces ? namedPlaces.placeAt(p.x, p.z) : null;
    const known = typeof city?.nearestRoad === 'function' && typeof city.districtAt === 'function';
    if (!named && !known) return undefined;
    const place = known ? placeLineFor(city.nearestRoad(p.x, p.z, STREET_REACH_METRES + 40), city.districtAt, p.x, p.z, STREET_REACH_METRES)
      : { districtId: null, street: null };
    if (!named) return place;
    return { districtId: `place:${named.id}`, street: named.kind === 'sea' || named.kind === 'island' ? null : place.street, name: named.name };
  };
  /** Shows a place: the full card for another district, the street line alone for another street. In flight: the name only, briefly. */
  const showPlace = ({ districtId, street, name: placeName }, name) => {
    if (districtId !== shownDistrict && districtId) {
      shownDistrict = districtId;
      shownStreet = flying ? null : street;
      hud.location.setDistrict(placeName ?? districtName(districtId, name), shownStreet, flying ? FLIGHT_BANNER_SECONDS : undefined);
    } else if (street !== shownStreet && !flying) {
      shownStreet = street;
      hud.location.setStreet(street);
    }
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
  /** A story mission's place in the story ({order, total}), or null for side jobs. */
  const storyNumberOf = (missionId) => {
    const order = content.find('storyMissions')?.STORY_MISSION_ORDER ?? [];
    const index = order.indexOf(missionId);
    return index >= 0 ? { order: index + 1, total: order.length } : null;
  };
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
  listen(E.MISSION_STARTED, ({ missionId, title }) => hud.objective.start(title, storyNumberOf(missionId)));
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
    if (ready && placeHere() === undefined) {
      shownDistrict = districtId;
      hud.location.setDistrict(districtName(districtId, name));
      return;
    }
    // The card is decided by the next look at the player's own, settled position (tick): while the
    // game boots, and for an instant after a jump across the map, the focus is not yet where the
    // player is put, and the card would name a district he is not in ("Centro" at the air base).
    announced = { districtId, name };
    if (shownDistrict === undefined) shownDistrict = null;
    streetSeconds = STREET_CHECK_SECONDS;
  });
  if (E.GAME_READY) listen(E.GAME_READY, () => { ready = true; });
  else ready = true;
  listen(E.STREET_CHANGED, ({ street }) => { if (placeHere() === undefined) hud.location.setStreet(street); });
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
  // The handset (ui/incomingCalls.js) shows the call itself; the card only says a call was missed.
  listen(E.PHONE_CALL_ENDED, ({ callerId, callerName, reason }) => {
    if (reason === 'missed' || reason === 'declined') hud.call.show(callerName || characterName(callerId),controls?.promptFor?.('openPhone') ?? 'T');
  });
  listen(E.NOTIFICATION_POSTED, ({ text, kind, seconds }) => hud.notifications.post(text, kind, seconds));
  listen(E.HELP_PROMPT_CHANGED, ({ action, text }) => hud.notifications.setHelp(action ? controls.promptFor(action) : null, text));
  listen(E.SETTINGS_CHANGED, ({ key, value }) => {
    if (key === 'gameplay.speedUnit') speedUnit = value;
    if (key === 'gameplay.subtitles') hud.subtitles.setEnabled(value);
  });

  if (E.FLIGHT_VIEW_CHANGED) listen(E.FLIGHT_VIEW_CHANGED, ({ view }) => { eventFlightView = view ?? null; });

  /** The vehicle the player controls: the player system's word, else the last VEHICLE_ENTERED. */
  const playerVehicleId = () => {
    const vehicle = systems.find('player')?.vehicle;
    if (vehicle === null || vehicle === undefined) return vehicleId;
    return typeof vehicle === 'object' ? vehicle.id ?? vehicleId : vehicle;
  };
  /** Follows the lead in and out of an airplane and the camera's view of it. */
  const followFlight = () => {
    const id = playerVehicleId();
    const now = id !== null && id !== undefined && Boolean(context.entities?.get?.(id)?.tags?.has?.('airplane'));
    if (now !== flying) {
      flying = now;
      hud.notifications.setFlying(flying);
      if (!flying) { flightView = null; if (body) delete body.dataset.flying; }
    }
    if (!flying) return;
    const view = systems.find('followCamera')?.flightView ?? eventFlightView ?? 'chase';
    if (view !== flightView) {
      flightView = view;
      if (body) body.dataset.flying = view;
    }
  };
  // The first key after boarding sends the key hint away; H asks for it again.
  const onKey = (event) => {
    if (!flying || event.repeat) return;
    if (event.code === 'KeyH') hud.notifications.recallHint();
    else hud.notifications.dismissHint();
  };
  if (typeof pageView?.addEventListener === 'function') pageView.addEventListener('keydown', onKey);
  unsubscribe.push(() => {
    if (typeof pageView?.removeEventListener === 'function') pageView.removeEventListener('keydown', onKey);
    if (body) delete body.dataset.flying;
  });

  return {
    get vehicleId() { return vehicleId; },
    get speedUnit() { return speedUnit; },
    /** True while the lead flies an airplane (the clean flight screen is up). */
    get flying() { return flying; },
    /** @param {number} deltaSeconds Updates the location card's district and street while the world runs. */
    tick(deltaSeconds) {
      followFlight();
      streetSeconds += deltaSeconds;
      if (streetSeconds < STREET_CHECK_SECONDS || !context.state.simulates) return;
      streetSeconds = 0;
      // Until the city has announced a district the card stays as the events left it.
      if (shownDistrict === undefined || !ready) return;
      // A jump across the map (a spawn, a scene, a retry): look again once the player has settled.
      const p = context.focus.position;
      const jumped = !(Math.hypot(p.x - lastX, p.z - lastZ) <= JUMP_METRES);
      lastX = p.x;
      lastZ = p.z;
      if (jumped) { streetSeconds = STREET_CHECK_SECONDS / 2; return; }
      const place = placeHere();
      if (place !== undefined) showPlace(place, announced && announced.districtId === place.districtId ? announced.name : undefined);
      else if (announced && announced.districtId !== shownDistrict) {
        shownDistrict = announced.districtId;
        hud.location.setDistrict(districtName(announced.districtId, announced.name));
      }
    },
    dispose() { for (const off of unsubscribe.splice(0)) off(); },
  };
}

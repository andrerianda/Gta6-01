// The catalogue of game events: every topic the systems of MARAZUL publish on the event bus, with
// the payload each carries. This file is the one place where topics are defined; a system that
// needs a new one adds it here, with its payload, next to its neighbours.
//
// Conventions: a topic is 'domain/whatHappened'. Payloads are plain objects and read-only for the
// receivers. Ids ending in Id are entity ids from the entity registry unless the name says
// otherwise (missionId, weaponId, districtId and the like are catalog ids). Positions are
// { x, y, z } in metres; the sender may reuse the object, so copy what you keep.

/** Every event topic by constant name. The comment after each line is its payload. */
export const GAME_EVENTS = Object.freeze({
  // ---- game flow -------------------------------------------------------------------------
  GAME_STATE_CHANGED: 'game/stateChanged',          // { from, to, payload } state names of gameStates.js
  LOADING_PROGRESS: 'game/loadingProgress',         // { fraction 0..1, label }
  GAME_READY: 'game/ready',                         // { seed } systems are up and the first frame is drawn
  NEW_GAME_STARTED: 'game/newGameStarted',          // { seed, characterId }
  SETTINGS_CHANGED: 'settings/changed',             // { key, value, previous }
  QUALITY_CHANGED: 'settings/qualityChanged',       // { tier, quality } the table row of qualityTiers.js
  VIEWPORT_RESIZED: 'render/viewportResized',       // { width, height, pixelRatio } CSS pixels
  RENDER_CONTEXT_LOST: 'render/contextLost',        // {}
  RENDER_CONTEXT_RESTORED: 'render/contextRestored', // {}
  INPUT_CONTEXT_CHANGED: 'input/contextChanged',    // { context, previous }
  INPUT_BINDING_CHANGED: 'input/bindingChanged',    // { context, action, codes }

  // ---- time and weather ------------------------------------------------------------------
  CLOCK_HOUR_CHANGED: 'time/hourChanged',           // { day, hour 0..23, weekday }
  CLOCK_DAY_CHANGED: 'time/dayChanged',             // { day, weekday } at midnight
  DAY_PHASE_CHANGED: 'time/dayPhaseChanged',        // { phase: 'dawn'|'day'|'dusk'|'night', previous }
  WEATHER_CHANGED: 'weather/changed',               // { weather, previous, seconds } atmosphere weather names
  THUNDER_STRUCK: 'weather/thunderStruck',          // { distance, azimuth, delay } for the audio

  // ---- the open world --------------------------------------------------------------------
  CITY_SECTOR_ACTIVATED: 'world/sectorActivated',   // { key, sectorX, sectorZ } streamed in
  CITY_SECTOR_DEACTIVATED: 'world/sectorDeactivated', // { key, sectorX, sectorZ } streamed out
  DISTRICT_ENTERED: 'world/districtEntered',        // { districtId, previousId, name } by the player
  STREET_CHANGED: 'world/streetChanged',            // { street, districtId } the street the player is on
  LANDMARK_REACHED: 'world/landmarkReached',        // { landmarkId, districtId, kind }
  PICKUP_COLLECTED: 'world/pickupCollected',        // { pickupId, kind, amount, collectorId, position }
  PROP_BROKEN: 'world/propBroken',                  // { propId, kind, position, causeId }
  ENTITY_ADDED: 'entity/added',                     // { entity } the registry's object
  ENTITY_REMOVED: 'entity/removed',                 // { entity }

  // ---- the player ------------------------------------------------------------------------
  PLAYER_SPAWNED: 'player/spawned',                 // { playerId, characterId, position, heading }
  PLAYER_CHARACTER_SWITCHED: 'player/characterSwitched', // { characterId, previousId }
  PLAYER_TELEPORTED: 'player/teleported',           // { position, heading } a cut: cameras and streaming jump
  PLAYER_HEALTH_CHANGED: 'player/healthChanged',    // { health, armour, delta, cause }
  PLAYER_WASTED: 'player/wasted',                   // { cause, killerId, position, hospitalBill }
  PLAYER_BUSTED: 'player/busted',                   // { position, fine, weaponsTaken }
  PLAYER_RESPAWNED: 'player/respawned',             // { position, after: 'wasted'|'busted'|'load' }

  // ---- vehicles --------------------------------------------------------------------------
  VEHICLE_SPAWNED: 'vehicle/spawned',               // { vehicleId, modelId, position, ownerSystem }
  VEHICLE_REMOVED: 'vehicle/removed',               // { vehicleId, modelId }
  VEHICLE_ENTERED: 'vehicle/entered',               // { vehicleId, modelId, occupantId, seat, isPlayer }
  VEHICLE_EXITED: 'vehicle/exited',                 // { vehicleId, modelId, occupantId, isPlayer, bailedOut }
  VEHICLE_STOLEN: 'vehicle/stolen',                 // { vehicleId, modelId, thiefId, driverId, position }
  VEHICLE_COLLIDED: 'vehicle/collided',             // { vehicleId, otherId, speed, energy, position, normal }
  VEHICLE_DAMAGED: 'vehicle/damaged',               // { vehicleId, amount, health, cause, attackerId, position }
  VEHICLE_DESTROYED: 'vehicle/destroyed',           // { vehicleId, modelId, cause, attackerId, position }
  VEHICLE_RESPRAYED: 'vehicle/resprayed',           // { vehicleId, colour, shopId }

  // ---- combat ----------------------------------------------------------------------------
  WEAPON_FIRED: 'combat/weaponFired',               // { shooterId, weaponId, origin, direction, loudness }
  WEAPON_EQUIPPED: 'combat/weaponEquipped',         // { ownerId, weaponId, magazine, reserve }
  AMMO_CHANGED: 'combat/ammoChanged',               // { ownerId, weaponId, magazine, reserve }
  DAMAGE_DEALT: 'combat/damageDealt',               // { targetId, attackerId, amount, kind, weaponId, position, fatal }
  CHARACTER_KILLED: 'combat/characterKilled',       // { victimId, killerId, weaponId, factionId, position }
  EXPLOSION_DETONATED: 'combat/explosionDetonated', // { position, radius, power, causeId, weaponId }

  // ---- crime and the police --------------------------------------------------------------
  CRIME_COMMITTED: 'crime/committed',               // { crimeId, offenderId, victimId, position }
  CRIME_WITNESSED: 'crime/witnessed',               // { crimeId, offenderId, witnessId, position, heat }
  WANTED_LEVEL_CHANGED: 'police/wantedLevelChanged', // { level 0..5, previous, heat }
  WANTED_SEARCH_STARTED: 'police/searchStarted',    // { lastKnownPosition, seconds } out of sight
  WANTED_CLEARED: 'police/wantedCleared',           // { reason: 'escaped'|'respray'|'bribe'|'busted'|'wasted' }
  POLICE_UNIT_DISPATCHED: 'police/unitDispatched',  // { unitId, unitKind, position, level }
  POLICE_SPOTTED_PLAYER: 'police/spottedPlayer',    // { unitId, position }

  // ---- pedestrians, traffic and gangs ----------------------------------------------------
  PEDESTRIANS_PANICKED: 'pedestrians/panicked',     // { position, radius, cause }
  PEDESTRIAN_KNOCKED_DOWN: 'pedestrians/knockedDown', // { pedestrianId, causeId, speed, position }
  TRAFFIC_BLOCKED: 'traffic/blocked',               // { position, vehicleId, seconds }
  FACTION_ATTITUDE_CHANGED: 'factions/attitudeChanged', // { factionId, attitude, previous }

  // ---- missions and story ----------------------------------------------------------------
  MISSION_AVAILABLE: 'mission/available',           // { missionId, giverId, position }
  MISSION_STARTED: 'mission/started',               // { missionId, title }
  MISSION_OBJECTIVE_CHANGED: 'mission/objectiveChanged', // { missionId, index, kind, text, target }
  MISSION_TIMER_CHANGED: 'mission/timerChanged',    // { missionId, secondsLeft }
  MISSION_PASSED: 'mission/passed',                 // { missionId, title, cash, reputation, unlocks }
  MISSION_FAILED: 'mission/failed',                 // { missionId, title, reason }
  CUTSCENE_STARTED: 'cutscene/started',             // { cutsceneId, missionId }
  CUTSCENE_ENDED: 'cutscene/ended',                 // { cutsceneId, missionId, skipped }
  DIALOGUE_LINE_SPOKEN: 'dialogue/lineSpoken',      // { speakerId, speakerName, text, seconds }

  // ---- side activities -------------------------------------------------------------------
  ACTIVITY_STARTED: 'activity/started',             // { activityId, name }
  ACTIVITY_FINISHED: 'activity/finished',           // { activityId, outcome, medal, cash, score }
  COLLECTIBLE_FOUND: 'activity/collectibleFound',   // { collectibleId, kind, found, total }
  STUNT_JUMP_LANDED: 'activity/stuntJumpLanded',    // { jumpId, distance, height, clean }

  // ---- economy and progression -----------------------------------------------------------
  MONEY_CHANGED: 'economy/moneyChanged',            // { cash, delta, reason }
  ITEM_PURCHASED: 'economy/itemPurchased',          // { shopId, itemId, kind, price }
  PROPERTY_PURCHASED: 'economy/propertyPurchased',  // { propertyId, price }
  PROPERTY_INCOME_PAID: 'economy/propertyIncomePaid', // { amount, day }
  REPUTATION_CHANGED: 'progression/reputationChanged', // { reputation, delta, reason }
  RANK_REACHED: 'progression/rankReached',          // { rankId, name, unlocks }
  STATISTIC_CHANGED: 'progression/statisticChanged', // { statistic, value, delta }
  CONTENT_UNLOCKED: 'progression/contentUnlocked',  // { kind, id, name }

  // ---- camera, interface, audio ----------------------------------------------------------
  CAMERA_CUT: 'camera/cut',                         // { reason } the picture jumps: settle the image
  CAMERA_MODE_CHANGED: 'camera/modeChanged',        // { mode, previous }
  FLIGHT_VIEW_CHANGED: 'camera/flightViewChanged',  // { view } 'cockpit' | 'chase' | 'outside' flying an aircraft, null on leaving it
  NOTIFICATION_POSTED: 'ui/notificationPosted',     // { text, kind, seconds } the HUD's message feed
  HELP_PROMPT_CHANGED: 'ui/helpPromptChanged',      // { action, text } or { action: null } to clear
  MAP_WAYPOINT_CHANGED: 'ui/mapWaypointChanged',    // { position } or { position: null }
  PHONE_MESSAGE_RECEIVED: 'phone/messageReceived',  // { contactId, text, missionId }
  RADIO_STATION_CHANGED: 'audio/radioStationChanged', // { stationId, name, previousId }

  // ---- saving ----------------------------------------------------------------------------
  SAVE_REQUESTED: 'save/requested',                 // { slot, reason: 'manual'|'autosave'|'mission'|'safehouse' }
  SAVE_COMPLETED: 'save/completed',                 // { slot, ok, bytes, reason }
  SAVE_LOADED: 'save/loaded',                       // { slot, version }
});

/** The set of every topic string, for the bus's spelling check. */
export const GAME_EVENT_TOPICS = Object.freeze(Object.values(GAME_EVENTS));

/**
 * The domain part of a topic ('police' for 'police/wantedLevelChanged').
 * @param {string} topic A topic string.
 * @returns {string}
 */
export function eventDomainOf(topic) {
  const slash = topic.indexOf('/');
  return slash === -1 ? topic : topic.slice(0, slash);
}

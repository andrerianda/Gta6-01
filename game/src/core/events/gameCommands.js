// The catalogue of game commands: every request one system of MARAZUL can address to another
// through the command queue, with its payload, its result and the system that handles it. Like
// the event catalogue, this is the one place where command names are defined.
//
// A command has exactly one handler. Send it with commands.send() (carried out at the next
// flush) or commands.run() (carried out now, returning the result). The debug object and the
// showcase scenes drive the game through these same commands.

/** Every command name by constant name. The comment after each line is: payload -> result (handler). */
export const GAME_COMMANDS = Object.freeze({
  // ---- game flow -------------------------------------------------------------------------
  GAME_START: 'game/start',                     // { slot?, newGame? } -> void (menus): leave the start menu and play
  GAME_PAUSE: 'game/pause',                     // {} -> void (menus)
  GAME_RESUME: 'game/resume',                   // {} -> void (menus)
  SAVE_WRITE: 'save/write',                     // { slot?, reason? } -> { ok, bytes } (saveGame)
  SAVE_LOAD: 'save/load',                       // { slot? } -> boolean (saveGame)

  // ---- time and weather ------------------------------------------------------------------
  TIME_SET: 'time/set',                         // { hours, day? } -> void (timeAndWeather): a cut, not a fade
  TIME_SKIP: 'time/skip',                       // { hours } -> void (timeAndWeather)
  WEATHER_SET: 'weather/set',                   // { weather, seconds? } -> void (timeAndWeather)

  // ---- the player ------------------------------------------------------------------------
  PLAYER_TELEPORT: 'player/teleport',           // { position, heading? } -> void (player)
  PLAYER_HEAL: 'player/heal',                   // { health?, armour? } -> void (player)
  PLAYER_SWITCH_CHARACTER: 'player/switchCharacter', // { characterId } -> boolean (player)
  PLAYER_ENTER_VEHICLE: 'player/enterVehicle',  // { vehicleId, seat? } -> boolean (player)
  PLAYER_GIVE_WEAPON: 'player/giveWeapon',      // { weaponId, ammo? } -> void (combat)

  // ---- vehicles, traffic, pedestrians ----------------------------------------------------
  VEHICLE_SPAWN: 'vehicle/spawn',               // { modelId, position, heading, colour?, parked? } -> vehicleId (vehicles)
  VEHICLE_REMOVE: 'vehicle/remove',             // { vehicleId } -> void (vehicles)
  VEHICLE_REPAIR: 'vehicle/repair',             // { vehicleId } -> void (vehicles)
  TRAFFIC_SET_DENSITY: 'traffic/setDensity',    // { scale } -> void (traffic): 0 clears the streets
  PEDESTRIAN_SPAWN: 'pedestrian/spawn',         // { archetypeId, position, heading? } -> pedestrianId (pedestrians)
  PEDESTRIANS_SET_DENSITY: 'pedestrian/setDensity', // { scale } -> void (pedestrians)

  // ---- crime and the police --------------------------------------------------------------
  CRIME_REPORT: 'crime/report',                 // { crimeId, offenderId, victimId?, position } -> void (wantedLevel)
  WANTED_SET_LEVEL: 'wanted/setLevel',          // { level 0..5 } -> void (wantedLevel)
  WANTED_CLEAR: 'wanted/clear',                 // { reason } -> void (wantedLevel)
  POLICE_SPAWN_UNIT: 'police/spawnUnit',        // { unitKind, position, heading? } -> unitId (policeDispatch)

  // ---- missions and activities -----------------------------------------------------------
  MISSION_START: 'mission/start',               // { missionId, skipIntro? } -> boolean (missions)
  MISSION_ABORT: 'mission/abort',               // { reason? } -> void (missions)
  MISSION_SKIP_TO_OBJECTIVE: 'mission/skipToObjective', // { index } -> void (missions): showcase scenes
  CUTSCENE_PLAY: 'cutscene/play',               // { cutsceneId, missionId?, lines? } -> void (cutscenes)
  CUTSCENE_SKIP: 'cutscene/skip',               // {} -> void (cutscenes)
  ACTIVITY_START: 'activity/start',             // { activityId } -> boolean (sideActivities)

  // ---- economy and progression -----------------------------------------------------------
  ECONOMY_ADD_MONEY: 'economy/addMoney',        // { amount, reason } -> cash (economy)
  ECONOMY_SPEND_MONEY: 'economy/spendMoney',    // { amount, reason } -> boolean (economy): false when short
  PROGRESSION_ADD_REPUTATION: 'progression/addReputation', // { amount, reason } -> reputation (progression)
  PROGRESSION_RECORD: 'progression/record',     // { statistic, amount? } -> void (progression)

  // ---- camera, effects, audio, interface -------------------------------------------------
  CAMERA_CUT_TO: 'camera/cutTo',                // { position, target, fieldOfView? } -> void (followCamera)
  CAMERA_RELEASE: 'camera/release',             // {} -> void (followCamera): back to following the player
  CAMERA_SHAKE: 'camera/shake',                 // { strength, seconds } -> void (followCamera)
  EFFECT_SPAWN: 'effects/spawn',                // { effectId, position, direction?, scale? } -> void (effects)
  AUDIO_PLAY: 'audio/play',                     // { soundId, position?, volume? } -> void (audio)
  RADIO_TUNE: 'audio/tuneRadio',                // { stationId } -> void (audio)
  UI_NOTIFY: 'ui/notify',                       // { text, kind?, seconds? } -> void (hud)
  UI_SHOW_SUBTITLE: 'ui/showSubtitle',          // { speakerName?, text, seconds? } -> void (hud)
  UI_SET_WAYPOINT: 'ui/setWaypoint',            // { position } or { position: null } -> void (minimap)
  SHOWCASE_RUN: 'showcase/run',                 // { name, seed? } -> Promise<summary> (the showcase director)
});

/** The list of every command name. */
export const GAME_COMMAND_NAMES = Object.freeze(Object.values(GAME_COMMANDS));

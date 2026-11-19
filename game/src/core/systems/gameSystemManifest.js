// The system manifest of MARAZUL: every game system, in update order. Each entry is the factory
// exported by a system's entry module; a specialist replaces the body of their entry module and
// adds files beside it, and nobody edits this list. docs/ARCHITECTURE.md describes each system.
//
// Update order, in short: the world and its clock, then whoever decides (player, traffic,
// pedestrians, gangs, police, combat), then what moves (vehicles, physics), then the rules that
// react (wanted level, effects, missions, economy), then the camera, the interface, audio, saving.
//
// The import lines below are the READING order (the game's main features first: the city, the
// lead, police and the wanted level, vehicles, traffic, crowds, missions, combat, the HUD); the
// array GAME_SYSTEM_FACTORIES further down is the UPDATE order, and only the array matters to the
// engine.
import { createOpenWorldCitySystem } from '../../world/openWorldCity.js';
import { createPlayerCharacterSystem } from '../../player/playerCharacter.js';
import { createPoliceDispatchSystem } from '../../police/policeDispatch.js';
import { createWantedLevelSystem } from '../../police/wantedLevel.js';
import { createVehicleFleetSystem } from '../../vehicles/vehicleFleet.js';
import { createTrafficFlowSystem } from '../../traffic/trafficFlow.js';
import { createPedestrianCrowdSystem } from '../../pedestrians/pedestrianCrowd.js';
import { createMissionDirectorSystem } from '../../missions/missionDirector.js';
import { createWeaponsAndCombatSystem } from '../../combat/weaponsAndCombat.js';
import { createHeadUpDisplaySystem } from '../../ui/headUpDisplay.js';
import { createMinimapAndCityMapSystem } from '../../ui/minimapAndCityMap.js';
import { createWorldRenderPipelineSystem } from '../../render/worldRenderPipeline.js';
import { createTimeAndWeatherSystem } from '../../world/timeAndWeather.js';
import { createGangTerritoriesSystem } from '../../pedestrians/gangTerritories.js';
import { createPhysicsSimulationSystem } from '../../world/physicsSimulation.js';
import { createWorldEffectsSystem } from '../../effects/worldEffects.js';
import { createCutscenePlayerSystem } from '../../missions/cutscenePlayer.js';
import { createSideActivitiesSystem } from '../../activities/sideActivities.js';
import { createMoneyShopsAndPropertiesSystem } from '../../economy/moneyShopsAndProperties.js';
import { createPlayerProgressionSystem } from '../../economy/playerProgression.js';
import { createFollowCameraSystem } from '../../player/followCamera.js';
import { createFlightDeckSystem } from '../../flight/flightDeck.js';
import { createPhoneSystem } from '../../ui/phone.js';
import { createMenusSystem } from '../../ui/menus.js';
import { createSoundAndRadioSystem } from '../../audio/soundAndRadio.js';
import { createSaveGameSystem } from '../../save/saveGame.js';
import { createShowcaseDirectorSystem } from '../../showcase/showcaseDirector.js';
import { createAirBaseSystem } from '../../world/airBase.js';
import { createRestrictedAreaSystem } from '../../police/restrictedArea.js';
import { createAirDefenceSystem } from '../../flight/airDefence.js';
import { createRadarNetworkSystem } from '../../flight/radarNetwork.js';
import { createOpenSeaSystem } from '../../render/openSea.js';
import { createNorvastIslandSystem } from '../../world/norvastIsland.js';
import { createPointOfNoReturnSystem } from '../../story/pointOfNoReturn.js';
import { createCinematicDirectorSystem } from '../../cinematics/cinematicDirector.js';
import { createIncomingCallsSystem } from '../../ui/incomingCalls.js';
import { createVoiceOverSystem } from '../../audio/voiceOver.js';

/**
 * The system factories in update order.
 * @type {ReadonlyArray<import('./gameSystemContract.js').GameSystemFactory>}
 */
export const GAME_SYSTEM_FACTORIES = Object.freeze([
  createWorldRenderPipelineSystem,       // worldRenderPipeline: the atmosphere and image pipeline
  createTimeAndWeatherSystem,            // timeAndWeather: the clock and the sky's weather
  createOpenSeaSystem,                   // openSea: the endless ocean, the sky and horizon from altitude
  createOpenWorldCitySystem,             // openWorldCity: terrain, roads, buildings, streaming
  createAirBaseSystem,                   // airBase: Base Aérea Punta Garza in the world
  createNorvastIslandSystem,             // norvastIsland: the streamed island zone far out at sea
  createPlayerCharacterSystem,           // player: on foot and at the wheel
  createTrafficFlowSystem,               // traffic: ambient vehicles on the lane graph
  createPedestrianCrowdSystem,           // pedestrians: the crowd on the pavements
  createGangTerritoriesSystem,           // factions: gangs, turf and attitudes
  createPoliceDispatchSystem,            // policeDispatch: officers, patrol cars, helicopters
  createRestrictedAreaSystem,            // restrictedArea: the guarded base, trespass and officer access
  createWeaponsAndCombatSystem,          // combat: weapons, aiming, damage
  createVehicleFleetSystem,              // vehicles: every car, bike, boat and helicopter
  createAirDefenceSystem,                // airDefence: the sea boundary and the Halcón interceptors
  createRadarNetworkSystem,              // radarNetwork: radar emitters, signatures, the guided bomb
  createPhysicsSimulationSystem,         // physics: the collision world and its 60 Hz step
  createWantedLevelSystem,               // wantedLevel: crimes, witnesses, heat and stars
  createWorldEffectsSystem,              // effects: particles, decals, tracers
  createMissionDirectorSystem,           // missions: the story and its objectives
  createCutscenePlayerSystem,            // cutscenes: scripted cameras and dialogue
  createPointOfNoReturnSystem,           // finalMission: mission 17, POINT OF NO RETURN
  createSideActivitiesSystem,            // sideActivities: races, jobs, collectibles, stunts
  createMoneyShopsAndPropertiesSystem,   // economy: cash, shops, properties
  createPlayerProgressionSystem,         // progression: reputation, ranks, statistics
  createFollowCameraSystem,              // followCamera: the camera on foot and behind the car
  createFlightDeckSystem,                // flightDeck: the flight HUD and the live cockpit instruments
  createCinematicDirectorSystem,         // cinematics: the story's scenes (after the follow camera: it holds the shot)
  createHeadUpDisplaySystem,             // hud: stars, cash, health, weapon, objective, subtitles
  createMinimapAndCityMapSystem,         // minimap: the radar and the full-screen map
  createPhoneSystem,                     // phone: contacts, messages, mission calls
  createIncomingCallsSystem,             // incomingCalls: the phone that rises from the lower right
  createMenusSystem,                     // menus: start menu, pause menu, settings
  createSoundAndRadioSystem,             // audio: synthesised sound, engines, the radio
  createVoiceOverSystem,                 // voiceOver: the story's voiced lines, their filters and subtitles
  createSaveGameSystem,                  // saveGame: saving, loading, autosave
  createShowcaseDirectorSystem,          // showcase: the scenes of the automated screenshots
]);

/** The system names in update order, as the factories declare them. */
export const GAME_SYSTEM_NAMES = Object.freeze([
  'worldRenderPipeline', 'timeAndWeather', 'openSea', 'openWorldCity', 'airBase', 'norvastIsland', 'player', 'traffic', 'pedestrians',
  'factions', 'policeDispatch', 'restrictedArea', 'combat', 'vehicles', 'airDefence', 'radarNetwork', 'physics', 'wantedLevel', 'effects',
  'missions', 'cutscenes', 'finalMission', 'sideActivities', 'economy', 'progression', 'followCamera', 'flightDeck', 'cinematics', 'hud',
  'minimap', 'phone', 'incomingCalls', 'menus', 'audio', 'voiceOver', 'saveGame', 'showcase',
]);

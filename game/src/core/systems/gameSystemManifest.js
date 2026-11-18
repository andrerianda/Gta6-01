// The system manifest of MARAZUL: every game system, in update order. Each entry is the factory
// exported by a system's entry module; a specialist replaces the body of their entry module and
// adds files beside it, and nobody edits this list. docs/ARCHITECTURE.md describes each system.
//
// Update order, in short: the world and its clock, then whoever decides (player, traffic,
// pedestrians, gangs, police, combat), then what moves (vehicles, physics), then the rules that
// react (wanted level, effects, missions, economy), then the camera, the interface, audio, saving.
import { createWorldRenderPipelineSystem } from '../../render/worldRenderPipeline.js';
import { createTimeAndWeatherSystem } from '../../world/timeAndWeather.js';
import { createOpenWorldCitySystem } from '../../world/openWorldCity.js';
import { createPlayerCharacterSystem } from '../../player/playerCharacter.js';
import { createTrafficFlowSystem } from '../../traffic/trafficFlow.js';
import { createPedestrianCrowdSystem } from '../../pedestrians/pedestrianCrowd.js';
import { createGangTerritoriesSystem } from '../../pedestrians/gangTerritories.js';
import { createPoliceDispatchSystem } from '../../police/policeDispatch.js';
import { createWeaponsAndCombatSystem } from '../../combat/weaponsAndCombat.js';
import { createVehicleFleetSystem } from '../../vehicles/vehicleFleet.js';
import { createPhysicsSimulationSystem } from '../../world/physicsSimulation.js';
import { createWantedLevelSystem } from '../../police/wantedLevel.js';
import { createWorldEffectsSystem } from '../../effects/worldEffects.js';
import { createMissionDirectorSystem } from '../../missions/missionDirector.js';
import { createCutscenePlayerSystem } from '../../missions/cutscenePlayer.js';
import { createSideActivitiesSystem } from '../../activities/sideActivities.js';
import { createMoneyShopsAndPropertiesSystem } from '../../economy/moneyShopsAndProperties.js';
import { createPlayerProgressionSystem } from '../../economy/playerProgression.js';
import { createFollowCameraSystem } from '../../player/followCamera.js';
import { createHeadUpDisplaySystem } from '../../ui/headUpDisplay.js';
import { createMinimapAndCityMapSystem } from '../../ui/minimapAndCityMap.js';
import { createPhoneSystem } from '../../ui/phone.js';
import { createMenusSystem } from '../../ui/menus.js';
import { createSoundAndRadioSystem } from '../../audio/soundAndRadio.js';
import { createSaveGameSystem } from '../../save/saveGame.js';
import { createShowcaseDirectorSystem } from '../../showcase/showcaseDirector.js';
import { createEngineDemonstrationSystem } from '../dev/engineDemonstration.js';

/**
 * The system factories in update order.
 * @type {ReadonlyArray<import('./gameSystemContract.js').GameSystemFactory>}
 */
export const GAME_SYSTEM_FACTORIES = Object.freeze([
  createWorldRenderPipelineSystem,       // worldRenderPipeline: the atmosphere and image pipeline
  createTimeAndWeatherSystem,            // timeAndWeather: the clock and the sky's weather
  createOpenWorldCitySystem,             // openWorldCity: terrain, roads, buildings, streaming
  createPlayerCharacterSystem,           // player: on foot and at the wheel
  createTrafficFlowSystem,               // traffic: ambient vehicles on the lane graph
  createPedestrianCrowdSystem,           // pedestrians: the crowd on the pavements
  createGangTerritoriesSystem,           // factions: gangs, turf and attitudes
  createPoliceDispatchSystem,            // policeDispatch: officers, patrol cars, helicopters
  createWeaponsAndCombatSystem,          // combat: weapons, aiming, damage
  createVehicleFleetSystem,              // vehicles: every car, bike, boat and helicopter
  createPhysicsSimulationSystem,         // physics: the collision world and its 60 Hz step
  createWantedLevelSystem,               // wantedLevel: crimes, witnesses, heat and stars
  createWorldEffectsSystem,              // effects: particles, decals, tracers
  createMissionDirectorSystem,           // missions: the story and its objectives
  createCutscenePlayerSystem,            // cutscenes: scripted cameras and dialogue
  createSideActivitiesSystem,            // sideActivities: races, jobs, collectibles, stunts
  createMoneyShopsAndPropertiesSystem,   // economy: cash, shops, properties
  createPlayerProgressionSystem,         // progression: reputation, ranks, statistics
  createFollowCameraSystem,              // followCamera: the camera on foot and behind the car
  createHeadUpDisplaySystem,             // hud: stars, cash, health, weapon, objective, subtitles
  createMinimapAndCityMapSystem,         // minimap: the radar and the full-screen map
  createPhoneSystem,                     // phone: contacts, messages, mission calls
  createMenusSystem,                     // menus: start menu, pause menu, settings
  createSoundAndRadioSystem,             // audio: synthesised sound, engines, the radio
  createSaveGameSystem,                  // saveGame: saving, loading, autosave
  createShowcaseDirectorSystem,          // showcase: the scenes of the automated screenshots
  createEngineDemonstrationSystem,       // TEMPORARY: deleted when the real systems arrive
]);

/** The system names in update order, as the factories declare them. */
export const GAME_SYSTEM_NAMES = Object.freeze([
  'worldRenderPipeline', 'timeAndWeather', 'openWorldCity', 'player', 'traffic', 'pedestrians',
  'factions', 'policeDispatch', 'combat', 'vehicles', 'physics', 'wantedLevel', 'effects',
  'missions', 'cutscenes', 'sideActivities', 'economy', 'progression', 'followCamera', 'hud',
  'minimap', 'phone', 'menus', 'audio', 'saveGame', 'showcase', 'engineDemonstration',
]);

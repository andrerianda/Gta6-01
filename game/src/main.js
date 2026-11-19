// MARAZUL: an original 3D open-world crime game for desktop browsers. This entry module names
// the game's systems (the manifest), the engine that runs them, and the content catalogs, then
// starts the game on the page. The systems come first because they are the table of contents of
// the game; the catalogs are plain data and close the list.
import { GAME_SYSTEM_FACTORIES } from './core/systems/gameSystemManifest.js';
import { createGameEngine } from './core/gameEngine.js';
import { createContentRegistry } from './core/content/contentRegistry.js';
import * as cityDistricts from './catalog/cityDistricts.js';
import * as storyMissions from './catalog/storyMissions.js';
import * as storyCharacters from './catalog/storyCharacters.js';
import * as vehicleCatalog from './catalog/vehicleCatalog.js';
import * as weaponCatalog from './catalog/weaponCatalog.js';
import * as wantedLevels from './catalog/wantedLevels.js';
import * as crimeCatalog from './catalog/crimeCatalog.js';
import * as pedestrianArchetypes from './catalog/pedestrianArchetypes.js';
import * as gangsAndFactions from './catalog/gangsAndFactions.js';
import * as sideActivities from './catalog/sideActivities.js';
import * as shopsAndProperties from './catalog/shopsAndProperties.js';
import * as radioStations from './catalog/radioStations.js';
import * as brandsAndSignage from './catalog/brandsAndSignage.js';
import * as playerControls from './catalog/playerControls.js';
import * as progressionRanks from './catalog/progressionRanks.js';
import * as finalArcScript from './catalog/finalArcScript.js';

/**
 * Starts MARAZUL, the open-world crime game: a living city on foot and by car, traffic and
 * pedestrians, a wanted level with police who respond, story missions and side activities.
 * @param {Window} [gameWindow] The window of game/index.html.
 * @returns {Promise<ReturnType<typeof createGameEngine>>} The running engine, once the first
 *   complete frame is on the canvas.
 */
export async function startMarazulOpenWorldCrimeGame(gameWindow = window) {
  const content = createContentRegistry({
    cityDistricts,
    storyMissions,
    storyCharacters,
    vehicleCatalog,
    weaponCatalog,
    wantedLevels,
    crimeCatalog,
    pedestrianArchetypes,
    gangsAndFactions,
    sideActivities,
    shopsAndProperties,
    radioStations,
    brandsAndSignage,
    playerControls,
    progressionRanks,
    finalArcScript,
  });
  const engine = createGameEngine({
    window: gameWindow,
    document: gameWindow.document,
    content,
    systemFactories: GAME_SYSTEM_FACTORIES,
  });
  await engine.start();
  return engine;
}

startMarazulOpenWorldCrimeGame().catch((error) => {
  // The engine could not even be built (no WebGL2, for instance): say so on the loading screen.
  const status = document.getElementById('loading-status');
  if (status) status.textContent = `MARAZUL could not start: ${error instanceof Error ? error.message : String(error)}`;
  console.error(error);
});

// MARAZUL: an original 3D open-world crime game for desktop browsers. This entry module names
// the game's systems (the manifest), the engine that runs them, and the content catalogs, then
// starts the game on the page. The systems come first because they are the table of contents of
// the game; the catalogs are plain data and close the list.
import { GAME_SYSTEM_FACTORIES } from './core/systems/gameSystemManifest.js';
import { createGameEngine } from './core/gameEngine.js';
import { createContentRegistry } from './core/content/contentRegistry.js';
import * as cityDistricts from './catalog/cityDistricts.js';
import * as storyCharacters from './catalog/storyCharacters.js';
import * as vehicleCatalog from './catalog/vehicleCatalog.js';
import * as pedestrianArchetypes from './catalog/pedestrianArchetypes.js';

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
    storyCharacters,
    vehicleCatalog,
    pedestrianArchetypes,
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

startMarazulOpenWorldCrimeGame();

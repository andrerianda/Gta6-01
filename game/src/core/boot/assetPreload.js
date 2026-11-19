// The asset preload of the boot: loads the models the first view needs through the asset library
// behind the loading screen, with real progress, and streams the rest in after the first frame.
// A model that fails to load costs only itself: the others still load and the failure is returned
// to be reported by name.
//
//   const { firstView, deferred } = splitBootAssetIds(assets.registry);
//   const { failed } = await preloadGameAssets({ assets, ids: firstView, onProgress: ({ fraction, id }) => ... });
//   ...first frame...   preloadGameAssets({ assets, ids: deferred });

/**
 * Models the first view never needs: craft that only missions, five stars or a showcase scene call
 * in, and responders and long guns that arrive minutes into play. Every user of these asks
 * assets.has() at the moment it needs the model (and falls back or waits), so they load after the
 * first frame instead of before it.
 */
export const DEFERRED_ASSET_IDS = Object.freeze([
  'speedboat',          // boat missions and the skyline picture (skylineCraft loads it itself)
  'police_boat',        // harbour units only (policeUnitKinds)
  'news_helicopter',    // showcase only (skylineCraft loads it itself)
  'police_helicopter',  // five stars (policeHelicopter checks has() when called in)
  'ambulance',          // after a casualty (ambulanceResponse checks has())
  'swat_van',           // four stars (vehicleSpawning falls back to a stand-in)
  'set_long_guns',      // rifles and shotguns are bought or found later (weaponModels checks has())
  'gaviota_t2',         // the trainer at the aerodrome (vehicles/aerodromeTrainer.js loads it when the lead comes near)
  'manta_sombra',       // the flight phase's aircraft: missions and the ?aircraft= launch flag load them
  'garza_negra',
  'halcon',
]);

/**
 * Loads models.
 * @param {Object} options
 * @param {{registry: Record<string, {kind: string}>, load: Function, has: (id: string) => boolean}} options.assets
 *   The asset library (game/src/assets/AssetLibrary.js).
 * @param {string[]} [options.ids] The ids to load (default: every model, choosePreloadAssetIds).
 * @param {(progress: {fraction: number, id: string}) => void} [options.onProgress] Progress for
 *   the loading screen.
 * @param {boolean} [options.includeDevelopmentAssets] Also load the probes of kind 'dev'.
 * @returns {Promise<{ids: string[], loaded: string[], failed: {id: string, error: Error}[]}>}
 */
export async function preloadGameAssets(options) {
  const assets = options.assets;
  const ids = options.ids ?? choosePreloadAssetIds(assets.registry, {
    includeDevelopmentAssets: options.includeDevelopmentAssets === true,
  });
  /** @type {{id: string, error: Error}[]} */
  const failed = [];
  if (ids.length === 0) {
    if (options.onProgress) options.onProgress({ fraction: 1, id: '' });
    return { ids, loaded: [], failed };
  }
  await withWholeFileFetch(options.fetchScope ?? globalThis, async () => {
    try {
      await assets.load(ids, { onProgress: options.onProgress });
    } catch {
      // At least one file failed. Whatever loaded is cached; go through the list one by one to
      // finish the rest and to learn which ones are broken.
      let done = 0;
      for (const id of ids) {
        try {
          await assets.load([id]);
        } catch (error) {
          failed.push({ id, error: error instanceof Error ? error : new Error(String(error)) });
        }
        done += 1;
        if (options.onProgress) options.onProgress({ fraction: done / ids.length, id });
      }
    }
  });
  return { ids, loaded: ids.filter((id) => assets.has(id)), failed };
}

/**
 * Runs a task while fetch() hands back whole files instead of streams. The asset library reads
 * a response through a stream reader to report progress inside a file; under the automated
 * browser about half of those requests are then reported as "request failed (ERR_ABORTED)"
 * although the model loaded, which fails every capture. Reading the body in one piece avoids
 * it; progress still advances once per model. Remove this when the library reads whole files.
 * @template T
 * @param {{fetch?: Function}} scope The object whose fetch is replaced for the duration
 *   (globalThis in the game).
 * @param {() => Promise<T>} task The loading to run.
 * @returns {Promise<T>}
 */
export async function withWholeFileFetch(scope, task) {
  const nativeFetch = scope.fetch;
  if (typeof nativeFetch !== 'function' || typeof Response !== 'function') return task();
  scope.fetch = async (resource, init) => {
    const response = await nativeFetch.call(scope, resource, init);
    if (!response.ok) return response;
    return new Response(await response.arrayBuffer(), { status: response.status, statusText: response.statusText });
  };
  try {
    return await task();
  } finally {
    scope.fetch = nativeFetch;
  }
}

/**
 * The ids the game loads: every registered asset except development probes.
 * @param {Record<string, {kind: string}>} registry The asset registry.
 * @param {{includeDevelopmentAssets?: boolean}} [options]
 * @returns {string[]} The ids in registry order.
 */
export function choosePreloadAssetIds(registry, options = {}) {
  return Object.keys(registry).filter(
    (id) => options.includeDevelopmentAssets === true || registry[id].kind !== 'dev',
  );
}

/**
 * Splits the game's models into those loaded before the first frame and those streamed in after.
 * @param {Record<string, {kind: string}>} registry The asset registry.
 * @param {{includeDevelopmentAssets?: boolean, everythingFirst?: boolean}} [options]
 *   everythingFirst loads every model before the first frame (showcase pictures, where a deferred
 *   model may be in frame).
 * @returns {{firstView: string[], deferred: string[]}} Both in registry order.
 */
export function splitBootAssetIds(registry, options = {}) {
  const all = choosePreloadAssetIds(registry, options);
  if (options.everythingFirst === true) return { firstView: all, deferred: [] };
  const later = new Set(DEFERRED_ASSET_IDS);
  return { firstView: all.filter((id) => !later.has(id)), deferred: all.filter((id) => later.has(id)) };
}

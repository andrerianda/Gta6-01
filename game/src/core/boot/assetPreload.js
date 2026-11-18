// The asset preload of the boot: loads every model of the asset registry through the asset
// library behind the loading screen, with real progress. A model that fails to load costs only
// itself: the others still load and the failure is returned to be reported by name.
//
//   const { failed } = await preloadGameAssets({ assets, onProgress: ({ fraction, id }) => ... });

/**
 * Loads the game's models.
 * @param {Object} options
 * @param {{registry: Record<string, {kind: string}>, load: Function, has: (id: string) => boolean}} options.assets
 *   The asset library (game/src/assets/AssetLibrary.js).
 * @param {(progress: {fraction: number, id: string}) => void} [options.onProgress] Progress for
 *   the loading screen.
 * @param {boolean} [options.includeDevelopmentAssets] Also load the probes of kind 'dev'.
 * @returns {Promise<{ids: string[], loaded: string[], failed: {id: string, error: Error}[]}>}
 */
export async function preloadGameAssets(options) {
  const assets = options.assets;
  const ids = choosePreloadAssetIds(assets.registry, {
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
 * The ids the boot loads: every registered asset except development probes.
 * @param {Record<string, {kind: string}>} registry The asset registry.
 * @param {{includeDevelopmentAssets?: boolean}} [options]
 * @returns {string[]} The ids in registry order.
 */
export function choosePreloadAssetIds(registry, options = {}) {
  return Object.keys(registry).filter(
    (id) => options.includeDevelopmentAssets === true || registry[id].kind !== 'dev',
  );
}

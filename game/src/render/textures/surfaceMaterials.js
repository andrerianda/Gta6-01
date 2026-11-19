// The surface library: turns the catalogue's painted maps (surfaces/surfaceCatalog.js) into
// three.js textures and physically based materials, cached by key and generated either at once
// or in slices of a few milliseconds per frame.
//
//   const surfaces = createSurfaceLibrary({ wetSurface: applyWetSurface });
//   const road = surfaces.getMaterial('asphaltOld');                  // generated now, cached
//   const walk = surfaces.requestMaterial('pavingSlabs', { seed: 3 }); // usable now, painted later:
//   function frame() { surfaces.step(4); ... }                        //   4 ms of painting per frame
//   createSurfaceLibrary({ worker: true })                            // or: painted in a worker,
//   await surfaces.whenIdle();                                        //   nothing on this thread
//   const lines = surfaces.getMaterial('markingDashedLine', { wear: 0.5 }); // a decal (alpha)
//
// UV convention: the textures carry repeat = 1 / tile size, so a mesh whose UVs are in METRES
// (u east or along the road, v the other way) shows every surface at its real scale. Pass
// { uvMetres: false } for a mesh with 0..1 UVs (a decal quad that shows one tile).
// A material uses base colour (sRGB), a tangent-space normal map and one packed map for ambient
// occlusion (R), roughness (G) and metalness (B); surfaces with lit windows add an emissive map
// whose intensity starts at 0 (scale material.emissiveIntensity by the atmosphere's nightFactor).

import * as THREE from 'three';
import { createSurfaceJob, resolveSurfaceRequest } from './surfaces/surfaceCatalog.js';
import { textureAnisotropyFor } from './textureQuality.js';

/**
 * Creates a surface library.
 * @param {Object} [options]
 * @param {(material: THREE.MeshStandardMaterial, wet: {porosity: number, puddles: boolean}) => any} [options.wetSurface]
 *   applyWetSurface from render/weather/wetSurface.js; when given, every opaque material gets
 *   wet in the rain as its catalogue entry says.
 * @param {boolean} [options.worker] Paint requestMaterial() surfaces in a module worker
 *   (surfaces/surfaceWorker.js) instead of in slices on this thread: no frame waits for a texture.
 */
export function createSurfaceLibrary(options = {}) {
  /** @type {Map<string, SurfaceTextureSet>} */
  const textureSets = new Map();
  /** @type {Map<string, THREE.MeshStandardMaterial>} */
  const materials = new Map();
  /** @type {{job: ReturnType<typeof createSurfaceJob>, set: SurfaceTextureSet}[]} */
  const queue = [];
  /** Requests sent to the painting worker, by id. @type {Map<number, SurfaceTextureSet>} */
  const waiting = new Map();
  const idleWaiters = [];
  let useWorker = Boolean(options.worker) && typeof Worker !== 'undefined';
  let worker = null;
  let nextRequestId = 1;

  /** Resolves whenIdle() promises once nothing is queued or with the worker. */
  function settleIdle() {
    if (queue.length > 0 || waiting.size > 0) return;
    while (idleWaiters.length > 0) idleWaiters.pop()();
  }

  /** Queues a set for the sliced painter on this thread. */
  function enqueue(set) {
    set.queued = true;
    queue.push({ job: createSurfaceJob(set.request.name, set.request.requestOptions), set });
  }

  /** Sends a set to the worker (started on first use); a worker that fails hands its work back. */
  function sendToWorker(set) {
    if (!worker) {
      worker = new Worker(new URL('./surfaces/surfaceWorker.js', import.meta.url), { type: 'module' });
      worker.onmessage = (event) => {
        const answered = waiting.get(event.data.id);
        if (!answered) return;
        waiting.delete(event.data.id);
        if (event.data.maps) uploadSurfaceMaps(answered, event.data.maps);
        else enqueue(answered);
        settleIdle();
      };
      worker.onerror = (event) => {
        event.preventDefault?.();
        useWorker = false;
        for (const lost of waiting.values()) enqueue(lost);
        waiting.clear();
      };
    }
    set.queued = true;
    const id = nextRequestId;
    nextRequestId += 1;
    waiting.set(id, set);
    worker.postMessage({ id, name: set.request.name, options: { ...set.request.requestOptions, size: set.request.size } });
  }

  /** The texture set of a request, created empty (placeholders) when new. */
  function textureSetFor(request, uvMetres) {
    const key = `${request.key}|${uvMetres ? 'm' : 'u'}`;
    let set = textureSets.get(key);
    if (!set) {
      set = createPlaceholderSet(request, uvMetres);
      textureSets.set(key, set);
    }
    return set;
  }

  /** Makes sure a set is painted now (finishing its queued job if it has one). */
  function paintNow(set) {
    if (set.ready) return;
    for (const [id, sent] of waiting) if (sent === set) waiting.delete(id);
    const index = queue.findIndex((entry) => entry.set === set);
    const job = index >= 0 ? queue.splice(index, 1)[0].job : createSurfaceJob(set.request.name, set.request.requestOptions);
    job.step(Infinity);
    uploadSurfaceMaps(set, job.maps);
  }

  function materialFor(name, surfaceOptions, immediate) {
    const { tint, uvMetres = true, wet = true, ...recipeOptions } = surfaceOptions;
    const request = resolveSurfaceRequest(name, recipeOptions);
    request.requestOptions = recipeOptions;
    const set = textureSetFor(request, uvMetres);
    const materialKey = `${request.key}|${uvMetres ? 'm' : 'u'}|${tint ?? ''}|${wet ? 'w' : ''}`;
    let material = materials.get(materialKey);
    if (!material) {
      material = createSurfaceMaterial(set, tint);
      if (wet && options.wetSurface && !set.decal) options.wetSurface(material, request.definition.wet);
      materials.set(materialKey, material);
    }
    if (immediate) paintNow(set);
    else if (!set.ready && !set.queued) {
      if (useWorker) sendToWorker(set);
      else enqueue(set);
    }
    return material;
  }

  return {
    /**
     * A material of a catalogue surface, painted before this returns (tens of milliseconds for a
     * new surface, nothing for a cached one).
     * @param {string} name A key of SURFACE_CATALOG.
     * @param {Object} [surfaceOptions] Recipe options (seed, size, tileMetres, age ...) plus
     *   `tint` (a colour multiplied over tintable surfaces), `uvMetres` (default true) and
     *   `wet` (default true).
     * @returns {THREE.MeshStandardMaterial}
     */
    getMaterial: (name, surfaceOptions = {}) => materialFor(name, surfaceOptions, true),

    /**
     * The same material at once, with flat placeholder maps, and its painting queued: call
     * step() every frame (or drain()) and the maps appear without a shader recompile.
     */
    requestMaterial: (name, surfaceOptions = {}) => materialFor(name, surfaceOptions, false),

    /**
     * The painted textures of a surface: { map, normalMap, ormMap, emissiveMap, tileMetres,
     * tileMetresY, averageColor, averageRoughness, ready }.
     * @returns {SurfaceTextureSet}
     */
    getTextures: (name, surfaceOptions = {}) => {
      const { uvMetres = true, ...recipeOptions } = surfaceOptions;
      const request = resolveSurfaceRequest(name, recipeOptions);
      request.requestOptions = recipeOptions;
      const set = textureSetFor(request, uvMetres);
      paintNow(set);
      return set;
    },

    /**
     * Paints queued surfaces for about `budgetMilliseconds` (one recipe step always runs).
     * @param {number} [budgetMilliseconds]
     * @returns {number} Surfaces still waiting (0 when everything requested is painted).
     */
    step: (budgetMilliseconds = 4) => {
      const start = performance.now();
      while (queue.length > 0) {
        const entry = queue[0];
        const left = budgetMilliseconds - (performance.now() - start);
        if (entry.job.step(Math.max(0, left))) {
          queue.shift();
          uploadSurfaceMaps(entry.set, entry.job.maps);
        }
        if (performance.now() - start >= budgetMilliseconds) break;
      }
      settleIdle();
      return queue.length + waiting.size;
    },

    /** Paints everything still queued or with the worker, now, on this thread. */
    drain: () => {
      for (const sent of [...waiting.values()]) paintNow(sent);
      while (queue.length > 0) {
        const entry = queue.shift();
        entry.job.step(Infinity);
        uploadSurfaceMaps(entry.set, entry.job.maps);
      }
      settleIdle();
    },

    /**
     * A promise that resolves when every requested surface is painted (the worker's answers
     * arrive on their own; the queue on this thread still needs step() calls).
     * @returns {Promise<void>}
     */
    whenIdle: () =>
      new Promise((resolve) => {
        idleWaiters.push(resolve);
        settleIdle();
      }),

    /** Surfaces waiting to be painted (queued here or with the worker). */
    get pending() {
      return queue.length + waiting.size;
    },

    /** Cached texture sets and materials (for the debug overlay). */
    get stats() {
      let bytes = 0;
      for (const set of textureSets.values()) if (set.ready) bytes += set.size * set.size * 4 * (set.emissiveMap ? 4 : 3) * 1.34;
      return { surfaces: textureSets.size, materials: materials.size, pending: queue.length, textureBytes: Math.round(bytes) };
    },

    /** Frees every texture and material and cancels queued work. */
    dispose: () => {
      for (const entry of queue) entry.job.cancel();
      queue.length = 0;
      waiting.clear();
      worker?.terminate();
      worker = null;
      for (const set of textureSets.values()) for (const texture of [set.map, set.normalMap, set.ormMap, set.emissiveMap]) texture?.dispose();
      for (const material of materials.values()) material.dispose();
      textureSets.clear();
      materials.clear();
    },
  };
}

/**
 * @typedef {Object} SurfaceTextureSet
 * @property {THREE.DataTexture} map Base colour, sRGB (alpha is coverage for decals).
 * @property {THREE.DataTexture} normalMap Tangent-space normals, linear.
 * @property {THREE.DataTexture} ormMap Occlusion, roughness, metalness in R, G, B, linear.
 * @property {THREE.DataTexture | null} emissiveMap Lit windows, sRGB, or null.
 * @property {number} tileMetres Real width of one tile.
 * @property {number} tileMetresY Real height of one tile.
 * @property {number} size Texels per edge.
 * @property {boolean} decal True when the colour map's alpha is coverage (road paint).
 * @property {boolean} ready False while the maps are still flat placeholders.
 * @property {[number, number, number] | null} averageColor Mean linear albedo once ready.
 * @property {number} averageRoughness
 */

/**
 * Wraps an RGBA8 pixel array as a tiling, mipmapped three.js texture.
 * @param {Uint8Array} pixels RGBA8, row 0 at v = 0.
 * @param {number} size Edge length in texels.
 * @param {Object} [options]
 * @param {boolean} [options.color] True for sRGB colour data (base colour, emissive).
 * @param {'ground' | 'wall' | 'roof' | 'sign' | 'decal'} [options.use] Sets the anisotropy.
 * @param {[number, number]} [options.repeat] Texture repeat (1 / tile size for UVs in metres).
 * @returns {THREE.DataTexture}
 */
export function createTilingDataTexture(pixels, size, options = {}) {
  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.colorSpace = options.color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = size > 1 ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  texture.generateMipmaps = size > 1;
  texture.anisotropy = size > 1 ? textureAnisotropyFor(options.use === 'roof' ? 'wall' : options.use ?? 'ground') : 1;
  if (options.repeat) texture.repeat.set(options.repeat[0], options.repeat[1]);
  texture.needsUpdate = true;
  return texture;
}

/** A set of 1 x 1 textures with the right defines, so the real maps can be swapped in later. */
function createPlaceholderSet(request, uvMetres) {
  const definition = request.definition;
  const tile = typeof request.tileMetres === 'number' ? [request.tileMetres, request.tileMetres] : request.tileMetres;
  const repeat = uvMetres ? [1 / tile[0], 1 / tile[1]] : [1, 1];
  const use = definition.decal ? 'decal' : definition.use;
  const flat = (bytes, color) => createTilingDataTexture(new Uint8Array(bytes), 1, { color, use, repeat });
  return {
    request,
    use,
    repeat,
    map: flat(definition.decal ? [128, 128, 128, 0] : [118, 116, 112, 255], true),
    normalMap: flat([128, 128, 255, 255], false),
    ormMap: flat([255, 215, 0, 255], false),
    emissiveMap: definition.emissive ? flat([0, 0, 0, 255], true) : null,
    tileMetres: tile[0],
    tileMetresY: tile[1],
    size: request.size,
    decal: Boolean(definition.decal),
    ready: false,
    queued: false,
    averageColor: null,
    averageRoughness: 0.85,
  };
}

/** Replaces a set's placeholder pixels with painted maps (same texture objects, new image). */
function uploadSurfaceMaps(set, maps) {
  const put = (texture, pixels) => {
    if (!texture || !pixels) return;
    texture.image = { data: pixels, width: maps.size, height: maps.size };
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = textureAnisotropyFor(set.use === 'roof' ? 'wall' : set.use);
    texture.needsUpdate = true;
  };
  put(set.map, maps.color);
  put(set.normalMap, maps.normal);
  put(set.ormMap, maps.orm);
  put(set.emissiveMap, maps.emissive);
  set.size = maps.size;
  set.averageColor = maps.averageColor;
  set.averageRoughness = maps.averageRoughness;
  set.ready = true;
  set.queued = false;
}

/** The physically based material of a texture set. */
function createSurfaceMaterial(set, tint) {
  const material = new THREE.MeshStandardMaterial({
    map: set.map,
    normalMap: set.normalMap,
    aoMap: set.ormMap,
    roughnessMap: set.ormMap,
    metalnessMap: set.ormMap,
    roughness: 1,
    metalness: 1,
    color: tint ?? 0xffffff,
  });
  material.name = `surface:${set.request.name}`;
  if (set.emissiveMap) {
    material.emissiveMap = set.emissiveMap;
    material.emissive.set(0xffffff);
    material.emissiveIntensity = 0;
  }
  if (set.decal) {
    // Road paint lies on the road: blended, never written to depth, pulled towards the camera.
    material.transparent = true;
    material.depthWrite = false;
    material.polygonOffset = true;
    material.polygonOffsetFactor = -2;
    material.polygonOffsetUnits = -4;
    material.aoMap = null;
  }
  material.userData.surface = { name: set.request.name, key: set.request.key, tileMetres: set.tileMetres, tileMetresY: set.tileMetresY };
  return material;
}

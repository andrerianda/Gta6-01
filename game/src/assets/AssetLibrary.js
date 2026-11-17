// The asset loader: fetches the .glb files named in the registry, reports progress for the
// loading screen, keeps each loaded asset once, and frees them on request.
//
//   const assets = new AssetLibrary({ renderer });
//   await assets.load(['street_lamp_a', 'royal_palm_a'], {
//     onProgress: ({ fraction }) => loadingBar.set(fraction),
//   });
//   scene.add(assets.instantiate('street_lamp_a'));
import { GLTFLoader } from '../../vendor/three/three-gltf-addons.min.js';
import { Asset } from './Asset.js';
import { ASSETS } from './registry/index.js';

/**
 * Progress of a load() call.
 * @typedef {object} LoadProgress
 * @property {number} fraction Overall progress from 0 to 1 (bytes of files in flight count).
 * @property {number} loaded How many assets are ready.
 * @property {number} total How many assets were asked for.
 * @property {string} id The asset that just made progress.
 */

export class AssetLibrary {
  /**
   * @param {object} [options]
   * @param {URL | string} [options.baseUrl] Where the .glb files live; by default the game's
   *   assets/ directory, found relative to this module.
   * @param {import('three').WebGLRenderer} [options.renderer] When given, textures use the
   *   renderer's anisotropic filtering (up to `anisotropy`) and warmUp() can upload them.
   * @param {number} [options.anisotropy] The largest anisotropy to ask for (default 8).
   * @param {number} [options.environmentIntensity] envMapIntensity of opaque materials (1).
   * @param {number} [options.glassEnvironmentIntensity] envMapIntensity of glass (1.5).
   * @param {number} [options.concurrency] How many files load at once (default 4).
   * @param {Record<string, import('./registry/index.js').AssetEntry>} [options.registry] The
   *   registry to load from (default: the game's ASSETS).
   */
  constructor(options = {}) {
    this.baseUrl = new URL(options.baseUrl ?? new URL('../../assets/', import.meta.url), import.meta.url);
    this.registry = options.registry ?? ASSETS;
    this.renderer = options.renderer ?? null;
    this.concurrency = options.concurrency ?? 4;
    this.materialOptions = {
      environmentIntensity: options.environmentIntensity ?? 1,
      glassEnvironmentIntensity: options.glassEnvironmentIntensity ?? 1.5,
      anisotropy: this.renderer
        ? Math.min(options.anisotropy ?? 8, this.renderer.capabilities.getMaxAnisotropy())
        : 0,
    };
    this.loader = new GLTFLoader();
    /** @type {Map<string, Asset>} */
    this.assets = new Map();
    /** @type {Map<string, Promise<Asset>>} */
    this.pending = new Map();
  }

  /**
   * @param {string} id An asset id.
   * @returns {boolean} True when the asset is loaded and ready.
   */
  has(id) {
    return this.assets.has(id);
  }

  /**
   * A loaded asset.
   * @param {string} id An asset id that load() has finished loading.
   * @returns {Asset} The asset.
   */
  get(id) {
    const asset = this.assets.get(id);
    if (!asset) throw new Error(`asset "${id}" is not loaded: await assets.load(["${id}"]) first`);
    return asset;
  }

  /**
   * A new instance of a loaded asset (shorthand for get(id).instantiate(options)).
   * @param {string} id An asset id that is loaded.
   * @param {{ lod?: number | 'all' }} [options] See Asset.instantiate().
   * @returns {import('three').Object3D} The instance root.
   */
  instantiate(id, options) {
    return this.get(id).instantiate(options);
  }

  /**
   * Loads assets (those already loaded or loading are not fetched again).
   * @param {string[]} ids The asset ids to load.
   * @param {{ onProgress?: (progress: LoadProgress) => void, signal?: AbortSignal }} [options]
   *   A progress callback for the loading screen and a signal to abandon the load.
   * @returns {Promise<Asset[]>} The assets, in the order asked for.
   */
  async load(ids, options = {}) {
    const total = ids.length;
    /** @type {Map<string, number>} */
    const partial = new Map();
    let loaded = 0;
    const report = (id) => {
      if (!options.onProgress) return;
      let inFlight = 0;
      for (const share of partial.values()) inFlight += share;
      options.onProgress({ fraction: total ? Math.min(1, (loaded + inFlight) / total) : 1, loaded, total, id });
    };
    const queue = [...new Set(ids)];
    const duplicates = total - queue.length;
    loaded += duplicates;
    const worker = async () => {
      for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
        await this.#loadOne(id, options.signal, (share) => {
          partial.set(id, share * 0.9);
          report(id);
        });
        partial.delete(id);
        loaded += 1;
        report(id);
      }
    };
    await Promise.all(Array.from({ length: Math.min(this.concurrency, queue.length) }, worker));
    return ids.map((id) => this.get(id));
  }

  /**
   * Loads every asset of the registry, or every asset of some kinds.
   * @param {{ kinds?: string[], onProgress?: (progress: LoadProgress) => void,
   *   signal?: AbortSignal }} [options] Kinds to load ("prop", "vehicle", ...; default: all).
   * @returns {Promise<Asset[]>} The assets.
   */
  loadAll(options = {}) {
    const ids = Object.keys(this.registry).filter(
      (id) => !options.kinds || options.kinds.includes(this.registry[id].kind));
    return this.load(ids, options);
  }

  #loadOne(id, signal, onShare) {
    if (this.assets.has(id)) return Promise.resolve(this.assets.get(id));
    if (!this.pending.has(id)) {
      const entry = this.registry[id];
      if (!entry) return Promise.reject(new Error(`unknown asset id "${id}": add it to game/src/assets/registry/`));
      const url = new URL(entry.file, this.baseUrl);
      const promise = this.#fetchBytes(url, signal, onShare)
        .then((bytes) => this.loader.parseAsync(bytes, ''))
        .then((gltf) => {
          const asset = new Asset(id, entry, gltf, this.materialOptions);
          this.assets.set(id, asset);
          return asset;
        })
        .catch((error) => {
          throw new Error(`asset "${id}" (${url.pathname}) failed to load: ${error.message}`);
        })
        .finally(() => this.pending.delete(id));
      this.pending.set(id, promise);
    }
    return this.pending.get(id);
  }

  async #fetchBytes(url, signal, onShare) {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const expected = Number(response.headers.get('Content-Length')) || 0;
    if (!response.body || !expected) return response.arrayBuffer();
    const reader = response.body.getReader();
    let bytes = new Uint8Array(expected);
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (received + value.length > bytes.length) {
        const grown = new Uint8Array(Math.max(bytes.length * 2, received + value.length));
        grown.set(bytes.subarray(0, received));
        bytes = grown;
      }
      bytes.set(value, received);
      received += value.length;
      onShare(Math.min(1, received / expected));
    }
    return bytes.buffer.slice(0, received);
  }

  /**
   * Uploads the textures of loaded assets to the GPU now, so the first frame that shows them
   * does not stall. Needs the renderer given to the constructor.
   * @param {string[]} [ids] The assets to warm up (default: all loaded).
   */
  warmUp(ids = [...this.assets.keys()]) {
    if (!this.renderer) return;
    const seen = new Set();
    for (const id of ids) {
      for (const material of this.get(id).allMaterials()) {
        for (const value of Object.values(material)) {
          if (value && value.isTexture && !seen.has(value)) {
            seen.add(value);
            this.renderer.initTexture(value);
          }
        }
      }
    }
  }

  /**
   * Sets how strongly every loaded and future asset reflects the scene environment.
   * @param {number} intensity envMapIntensity for opaque materials.
   * @param {number} [glassIntensity] envMapIntensity for glass (default 1.5 x intensity).
   */
  setEnvironmentIntensity(intensity, glassIntensity = intensity * 1.5) {
    this.materialOptions.environmentIntensity = intensity;
    this.materialOptions.glassEnvironmentIntensity = glassIntensity;
    for (const asset of this.assets.values()) {
      for (const material of asset.allMaterials()) {
        material.envMapIntensity = material.userData.role === 'glass' ? glassIntensity : intensity;
      }
    }
  }

  /**
   * Frees one asset's geometry, materials and textures. Remove its instances first.
   * @param {string} id The asset id.
   */
  dispose(id) {
    const asset = this.assets.get(id);
    if (!asset) return;
    asset.dispose();
    this.assets.delete(id);
  }

  /** Frees every loaded asset. */
  disposeAll() {
    for (const id of [...this.assets.keys()]) this.dispose(id);
  }
}

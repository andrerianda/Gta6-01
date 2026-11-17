// A cache of noise fields shared by all surface recipes. Painting a surface needs several
// noise fields; most recipes ask for the same few (fine grain, mottling, blotches, stones), so
// they are generated once per size and seed and then only read. Fields from the cache are
// shared: never write to them (copy first, or use them as the source of an operation).
// The cache is bounded and can be emptied when loading is over.
//
//   const mottling = getFractalNoiseField(512, { period: 3, octaves: 5, seed: 11 });
//   const stones = getCellularNoiseFields(512, { period: 40, seed: 5 });
//   clearNoiseFieldCache();                    // after the loading screen

import { createCellularNoiseFields } from './cellularNoise.js';
import { createFractalNoiseField } from './fractalNoise.js';

/** @type {Map<string, {value: any, bytes: number}>} Insertion order is the eviction order. */
const cache = new Map();
let cachedBytes = 0;
let byteLimit = 96 * 1024 * 1024;

/**
 * A cached fractal noise field (see createFractalNoiseField for the options). Read only.
 * @param {number} size
 * @param {Object} [options]
 * @returns {Float32Array}
 */
export function getFractalNoiseField(size, options = {}) {
  return remember(fractalKey(size, options), () => {
    const field = createFractalNoiseField(size, { ...options, target: undefined });
    return { value: field, bytes: field.byteLength };
  });
}

/**
 * Cached cellular noise fields (see createCellularNoiseFields for the options). Read only.
 * @param {number} size
 * @param {Object} [options]
 * @returns {{nearest: Float32Array, second: Float32Array, cell: Uint16Array, period: number}}
 */
export function getCellularNoiseFields(size, options = {}) {
  const key = `c|${size}|${options.period ?? 8}|${options.seed ?? 0}|${options.jitter ?? 1}`;
  return remember(key, () => {
    const fields = createCellularNoiseFields(size, { ...options, withCells: true });
    return { value: fields, bytes: fields.nearest.byteLength * 2 + fields.cell.byteLength };
  });
}

/** Whether a fractal field with these options is already cached (generation would be free). */
export function hasFractalNoiseField(size, options = {}) {
  return cache.has(fractalKey(size, options));
}

function fractalKey(size, options) {
  const period = options.period ?? 4;
  return `f|${size}|${period}|${options.periodY ?? period}|${options.octaves ?? 5}|${options.gain ?? 0.5}|${options.lacunarity ?? 2}|${options.seed ?? 0}|${options.shape ?? 'plain'}`;
}

/** Forgets every cached field (the arrays are freed once no surface job still holds them). */
export function clearNoiseFieldCache() {
  cache.clear();
  cachedBytes = 0;
}

/**
 * Sets how much memory the cache may hold before it drops its least recently used fields.
 * @param {number} bytes
 */
export function setNoiseFieldCacheLimit(bytes) {
  byteLimit = Math.max(0, bytes);
  evict();
}

/** The memory held by the cache and the number of fields in it. */
export function noiseFieldCacheUsage() {
  return { bytes: cachedBytes, fields: cache.size, limit: byteLimit };
}

function remember(key, create) {
  const hit = cache.get(key);
  if (hit) {
    // Re-insert so that the entry counts as recently used.
    cache.delete(key);
    cache.set(key, hit);
    return hit.value;
  }
  const entry = create();
  cache.set(key, entry);
  cachedBytes += entry.bytes;
  evict(key);
  return entry.value;
}

function evict(keep) {
  for (const [key, entry] of cache) {
    if (cachedBytes <= byteLimit) break;
    if (key === keep) continue;
    cache.delete(key);
    cachedBytes -= entry.bytes;
  }
}

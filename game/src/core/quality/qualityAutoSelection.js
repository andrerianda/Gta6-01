// Chooses the quality tier for a machine from the result of the first-run GPU benchmark
// (gpuBenchmark.js) and resolves which tier the game actually runs: an explicit request from the
// page's query string wins, then the player's setting, then the benchmarked choice.

/**
 * @typedef {Object} GpuBenchmarkResult
 * @property {number} millisecondsPerPass Time of one pass of the benchmark shader; 0 or NaN when
 *   the measurement failed.
 * @property {boolean} softwareRenderer True when WebGL runs on the CPU.
 * @property {number} [maxTextureSize] The GPU's largest texture edge.
 */

/**
 * Picks a tier from a benchmark result.
 * @param {GpuBenchmarkResult} result What gpuBenchmark.js measured.
 * @returns {'low' | 'medium' | 'high' | 'ultra'}
 */
export function chooseQualityTierFromBenchmark(result) {
  if (result.softwareRenderer) return 'low';
  const time = result.millisecondsPerPass;
  if (!Number.isFinite(time) || time <= 0) return 'medium';
  if (result.maxTextureSize !== undefined && result.maxTextureSize < 4096) return 'low';
  for (const [tier, limit] of BENCHMARK_TIER_LIMITS) {
    if (time <= limit) return tier;
  }
  return 'low';
}

/**
 * The slowest benchmark pass, in milliseconds, each tier accepts. The benchmark shades a 512
 * pixel square with about a hundred noise taps per pixel: a current mid-range desktop GPU takes
 * about a millisecond, an integrated one several.
 * @type {ReadonlyArray<readonly ['ultra' | 'high' | 'medium', number]>}
 */
export const BENCHMARK_TIER_LIMITS = Object.freeze([
  Object.freeze(['ultra', 0.9]),
  Object.freeze(['high', 2.6]),
  Object.freeze(['medium', 7]),
]);

/**
 * Resolves the tier to run.
 * @param {Object} choices
 * @param {string | null} [choices.requested] From the query string (?quality=); wins when valid.
 * @param {string} [choices.setting] The player's setting: 'auto' or a tier name.
 * @param {string} [choices.detected] The benchmarked tier; '' when there is none yet.
 * @param {boolean} [choices.softwareRenderer] On a software renderer 'auto' means 'low'.
 * @param {(name: unknown) => boolean} choices.isTierName The tier-name test of qualityTiers.js.
 * @returns {{tier: string, source: 'query' | 'setting' | 'benchmark' | 'software' | 'default'}}
 */
export function resolveQualityTier(choices) {
  if (choices.requested && choices.isTierName(choices.requested)) {
    return { tier: choices.requested, source: 'query' };
  }
  if (choices.setting && choices.setting !== 'auto' && choices.isTierName(choices.setting)) {
    return { tier: choices.setting, source: 'setting' };
  }
  if (choices.softwareRenderer) return { tier: 'low', source: 'software' };
  if (choices.detected && choices.isTierName(choices.detected)) {
    return { tier: choices.detected, source: 'benchmark' };
  }
  return { tier: 'high', source: 'default' };
}

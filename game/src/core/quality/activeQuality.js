// The quality tier in use: the one row of the settings table (qualityTiers.js) that every system
// reads through `context.quality.tier`, where it came from, and the current dynamic render
// scale. Changing the tier announces it, so systems adapt without a reload.
//
//   const maxCars = context.quality.tier.maxVehicles;
//   context.quality.set('ultra');          // the graphics menu; QUALITY_CHANGED follows
import { isQualityTierName, qualityTierOf } from './qualityTiers.js';

/**
 * Creates the active quality record.
 * @param {Object} options
 * @param {string} options.name The starting tier name.
 * @param {string} [options.source] Why this tier: 'query', 'setting', 'benchmark', 'software' or
 *   'default' (qualityAutoSelection.js).
 * @param {(change: {tier: string, quality: Readonly<import('./qualityTiers.js').QualityTier>, previous: string}) => void} [options.onChanged]
 *   Called after the tier changed.
 * @returns {{name: string, tier: Readonly<import('./qualityTiers.js').QualityTier>, source: string,
 *   renderScale: number, set: (name: string, source?: string) => boolean}}
 */
export function createActiveQuality(options) {
  const quality = {
    /** The tier's name: low, medium, high, ultra or cinematic. */
    name: qualityTierOf(options.name).name,
    /** The tier's row of the settings table. */
    tier: qualityTierOf(options.name),
    /** Where the choice came from. */
    source: options.source ?? 'default',
    /** The dynamic resolution scale in use, minRenderScale to 1 (the render pipeline writes it). */
    renderScale: 1,
    set,
  };

  /**
   * Switches to another tier.
   * @param {string} name A tier name.
   * @param {string} [source] Why; default 'setting'.
   * @returns {boolean} False when the name is not a tier or is already in use.
   */
  function set(name, source = 'setting') {
    if (!isQualityTierName(name) || name === quality.name) return false;
    const previous = quality.name;
    quality.name = name;
    quality.tier = qualityTierOf(name);
    quality.source = source;
    quality.renderScale = 1;
    if (options.onChanged) options.onChanged({ tier: name, quality: quality.tier, previous });
    return true;
  }

  return quality;
}

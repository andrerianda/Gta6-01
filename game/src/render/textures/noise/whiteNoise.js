// White noise: an independent random value per texel. On its own it is television snow; lightly
// blurred or thresholded it gives the finest grain of a surface (sand grains, the sparkle of
// aggregate, pores, dust), which no lattice noise reaches. Trivially tileable.
//
//   const grain = fillWhiteNoise(new Float32Array(512 * 512), seed);    // values in [0, 1)

/**
 * Fills a field with independent uniform random values.
 * @param {Float32Array} target Overwritten.
 * @param {number} seed Unsigned 32-bit seed.
 * @param {number} [low] Smallest value (default 0).
 * @param {number} [high] Largest value, exclusive (default 1).
 * @returns {Float32Array} The target.
 */
export function fillWhiteNoise(target, seed, low = 0, high = 1) {
  const scale = (high - low) / 4294967296;
  const offset = Math.imul(seed | 0, 0x9e3779b1);
  for (let i = 0; i < target.length; i += 1) {
    let h = Math.imul(i + offset, 0x27d4eb2f);
    h ^= h >>> 15;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    target[i] = low + (h >>> 0) * scale;
  }
  return target;
}

/**
 * Sprinkles sparse specks into a field: each texel becomes `value` with a given probability and
 * keeps its content otherwise. Pits, glints, grit.
 * @param {Float32Array} target
 * @param {number} seed
 * @param {number} probability Chance per texel, 0..1.
 * @param {number} [value]
 * @returns {Float32Array} The target.
 */
export function sprinkleSpecks(target, seed, probability, value = 1) {
  const threshold = probability * 4294967296;
  const offset = Math.imul(seed | 0, 0x9e3779b1);
  for (let i = 0; i < target.length; i += 1) {
    let h = Math.imul(i + offset, 0x27d4eb2f);
    h ^= h >>> 15;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    if (h >>> 0 < threshold) target[i] = value;
  }
  return target;
}

// Stateless randomness addressed by integer coordinates: the same cell and seed always give the
// same value, in any order and from any module. Use it wherever content is generated on demand
// (a streamed city block, a lattice of noise gradients, the variation of the n-th window of a
// facade) and a sequential generator would make the result depend on visiting order.

/**
 * Hashes a 2D integer cell and a seed to an unsigned 32-bit integer.
 * @param {number} x Integer cell coordinate (negative values are fine).
 * @param {number} y Integer cell coordinate.
 * @param {number} [seed] Unsigned 32-bit seed.
 * @returns {number}
 */
export function hashGridCell(x, y, seed = 0) {
  let h = Math.imul(x | 0, 0x27d4eb2f) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * Hashes a 3D integer cell and a seed to an unsigned 32-bit integer.
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {number} [seed]
 * @returns {number}
 */
export function hashGridCell3D(x, y, z, seed = 0) {
  let h =
    Math.imul(x | 0, 0x27d4eb2f) ^
    Math.imul(y | 0, 0x165667b1) ^
    Math.imul(z | 0, 0x1b873593) ^
    Math.imul(seed | 0, 0x9e3779b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * A float in [0, 1) that depends only on the cell and the seed.
 * @param {number} x
 * @param {number} y
 * @param {number} [seed]
 * @returns {number}
 */
export function randomAtCell(x, y, seed = 0) {
  return hashGridCell(x, y, seed) / 4294967296;
}

/**
 * A float in [0, 1) that depends only on the 3D cell and the seed.
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {number} [seed]
 * @returns {number}
 */
export function randomAtCell3D(x, y, z, seed = 0) {
  return hashGridCell3D(x, y, z, seed) / 4294967296;
}

/**
 * A float in [0, 1) for the n-th item of a sequence, without keeping a generator around.
 * `channel` selects independent values for the same index (0 for width, 1 for colour ...).
 * @param {number} index
 * @param {number} [seed]
 * @param {number} [channel]
 * @returns {number}
 */
export function randomAtIndex(index, seed = 0, channel = 0) {
  return hashGridCell(index, channel, seed) / 4294967296;
}

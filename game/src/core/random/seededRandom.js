// Seeded pseudo-random numbers for MARAZUL. Everything procedural in the game (city layout,
// textures, traffic, names) draws from generators made here, so the same seed always builds the
// same world. Nothing in this file touches Math.random or the clock.
//
//   const random = createSeededRandom('marazul');
//   const height = random.range(3, 12);            // float in [3, 12)
//   const floors = random.int(1, 6);               // integer in 1..6, both ends included
//   const facade = random.fork('facade');          // independent stream, stable for this label
//
// The core is the sfc32 generator (four 32-bit words, period about 2^128) seeded through a
// splitmix-style scrambler, which passes the usual statistical batteries and costs a few integer
// operations per number.

/**
 * @typedef {Object} SeededRandom
 * @property {number} seed The unsigned 32-bit seed this generator was created from.
 * @property {() => number} next A float in [0, 1).
 * @property {() => number} uint32 An unsigned 32-bit integer.
 * @property {(min: number, max: number) => number} range A float in [min, max).
 * @property {(min: number, max: number) => number} int An integer in [min, max], both included.
 * @property {(probability?: number) => boolean} chance True with the given probability (0..1).
 * @property {() => number} sign Either -1 or +1.
 * @property {() => number} angle An angle in [0, 2 pi) radians.
 * @property {(centre: number, spread: number) => number} jitter A float in centre +- spread.
 * @property {<T>(items: ArrayLike<T>) => T} pick One element, uniformly (undefined when empty).
 * @property {<T>(items: ArrayLike<T>, weights: ArrayLike<number> | ((item: T, index: number) => number)) => T} weightedPick
 *   One element with probability proportional to its weight.
 * @property {<T>(items: T[]) => T[]} shuffle Shuffles the array in place and returns it.
 * @property {<T>(items: ArrayLike<T>, count: number) => T[]} sample `count` distinct elements.
 * @property {(mean?: number, deviation?: number) => number} gaussian A normally distributed float.
 * @property {(radius?: number) => [number, number]} inDisc A point uniformly inside a disc.
 * @property {(label: string | number) => SeededRandom} fork An independent generator derived from
 *   this generator's seed and the label; it does not depend on how many numbers were drawn.
 */

/**
 * Creates a deterministic random number generator.
 * @param {number | string} [seed] An unsigned integer or any string; equal seeds give equal
 *   sequences on every machine.
 * @returns {SeededRandom}
 */
export function createSeededRandom(seed = 0) {
  const seedValue = normaliseSeed(seed);

  // Expand the single seed word into the four words of sfc32 state, then discard the first
  // outputs so that neighbouring seeds (1, 2, 3 ...) start from unrelated states.
  let a = hashUint32(seedValue ^ 0x9e3779b9);
  let b = hashUint32(a + 0x85ebca6b);
  let c = hashUint32(b + 0xc2b2ae35);
  let d = 1;

  const uint32 = () => {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return t >>> 0;
  };
  for (let i = 0; i < 12; i += 1) uint32();

  const next = () => uint32() / 4294967296;

  /** @type {SeededRandom} */
  const random = {
    seed: seedValue,
    next,
    uint32,

    range: (min, max) => min + (max - min) * next(),

    int: (min, max) => {
      const low = Math.ceil(Math.min(min, max));
      const high = Math.floor(Math.max(min, max));
      return low + Math.floor(next() * (high - low + 1));
    },

    chance: (probability = 0.5) => next() < probability,

    sign: () => (next() < 0.5 ? -1 : 1),

    angle: () => next() * 6.283185307179586,

    jitter: (centre, spread) => centre + (next() * 2 - 1) * spread,

    pick: (items) => (items.length === 0 ? undefined : items[Math.floor(next() * items.length)]),

    weightedPick: (items, weights) => {
      const count = items.length;
      if (count === 0) return undefined;
      const weightOf =
        typeof weights === 'function'
          ? (index) => Math.max(0, Number(weights(items[index], index)) || 0)
          : (index) => Math.max(0, Number(weights[index]) || 0);
      let total = 0;
      for (let i = 0; i < count; i += 1) total += weightOf(i);
      const roll = next();
      if (!(total > 0)) return items[Math.floor(roll * count)];
      let remaining = roll * total;
      let last = 0;
      for (let i = 0; i < count; i += 1) {
        const weight = weightOf(i);
        if (weight <= 0) continue;
        last = i;
        remaining -= weight;
        if (remaining < 0) return items[i];
      }
      return items[last];
    },

    shuffle: (items) => {
      for (let i = items.length - 1; i > 0; i -= 1) {
        const j = Math.floor(next() * (i + 1));
        const held = items[i];
        items[i] = items[j];
        items[j] = held;
      }
      return items;
    },

    sample: (items, count) => {
      const pool = Array.from(items);
      const wanted = Math.max(0, Math.min(pool.length, Math.floor(count)));
      for (let i = 0; i < wanted; i += 1) {
        const j = i + Math.floor(next() * (pool.length - i));
        const held = pool[i];
        pool[i] = pool[j];
        pool[j] = held;
      }
      pool.length = wanted;
      return pool;
    },

    gaussian: (mean = 0, deviation = 1) => {
      // Box-Muller; 1 - next() keeps the logarithm away from zero.
      const radius = Math.sqrt(-2 * Math.log(1 - next()));
      return mean + deviation * radius * Math.cos(6.283185307179586 * next());
    },

    inDisc: (radius = 1) => {
      const distance = Math.sqrt(next()) * radius;
      const turn = next() * 6.283185307179586;
      return [Math.cos(turn) * distance, Math.sin(turn) * distance];
    },

    fork: (label) => createSeededRandom(hashCombine(seedValue, normaliseSeed(label))),
  };
  return random;
}

/**
 * Turns a seed of either accepted kind into an unsigned 32-bit integer. Integers in range pass
 * through unchanged, so `createSeededRandom(7).seed === 7`; other numbers and strings are hashed.
 * @param {number | string} seed
 * @returns {number}
 */
export function normaliseSeed(seed) {
  if (typeof seed === 'number') {
    if (Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff) return seed;
    if (Number.isFinite(seed)) return hashString(String(seed));
    return 0;
  }
  return hashString(String(seed));
}

/**
 * Hashes a string to an unsigned 32-bit integer (FNV-1a over UTF-16 code units, then an
 * avalanche step so that similar strings give unrelated hashes).
 * @param {string} text
 * @returns {number}
 */
export function hashString(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    const unit = text.charCodeAt(i);
    hash = Math.imul(hash ^ (unit & 0xff), 0x01000193);
    hash = Math.imul(hash ^ (unit >>> 8), 0x01000193);
  }
  return hashUint32(hash ^ text.length);
}

/**
 * Scrambles a 32-bit integer so that every input bit affects every output bit (the MurmurHash3
 * finaliser). Use it to turn counters, identifiers or coordinates into random-looking integers.
 * @param {number} value Any number; only its low 32 bits are used.
 * @returns {number} An unsigned 32-bit integer.
 */
export function hashUint32(value) {
  let h = value | 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * Combines two 32-bit hashes into one; the order of the arguments matters.
 * @param {number} first
 * @param {number} second
 * @returns {number} An unsigned 32-bit integer.
 */
export function hashCombine(first, second) {
  const mixed = Math.imul((first | 0) ^ 0x2545f491, 0x9e3779b1) + (second | 0);
  return hashUint32(mixed ^ Math.imul(second | 0, 0x27d4eb2f));
}

/**
 * Derives a seed from a base seed and any number of labels, without creating a generator:
 * `deriveSeed(worldSeed, 'block', 12, 4)`.
 * @param {number | string} seed
 * @param {...(number | string)} labels
 * @returns {number} An unsigned 32-bit integer.
 */
export function deriveSeed(seed, ...labels) {
  let derived = normaliseSeed(seed);
  for (const label of labels) derived = hashCombine(derived, normaliseSeed(label));
  return derived;
}

/**
 * Maps an unsigned 32-bit integer to a float in [0, 1).
 * @param {number} hash
 * @returns {number}
 */
export function unitFloatFromHash(hash) {
  return (hash >>> 0) / 4294967296;
}

// The painter a surface recipe works with: a set of tiling fields for one square texture tile
// (linear albedo in three channels, height in metres, roughness, metalness, and optionally
// emissive colour and alpha), plus the noise, scratch-field and colour operations recipes need
// and the final packing into byte maps. A recipe is a generator function that paints into a
// painter and yields between its steps, so that generation can be sliced across frames:
//
//   function* paintRedTiles(p, options) {
//     p.fill(0xa5482f);
//     p.shadeSigned(p.fractal(4, 5), 0.2);          // mottled colour
//     addField(p.height, p.fractal(32, 3), 0.0004); // 0.4 mm of surface grain
//     p.roughness.fill(0.7);
//     yield;
//     return yield* p.finish();
//   }
//
// Fields returned by p.fractal() and p.cells() come from the shared noise cache and are read
// only; p.field() and p.copy() give scratch fields the recipe may write and should release.

import { deriveSeed, createSeededRandom } from '../../../core/random/seededRandom.js';
import { parseColor } from '../colorMath.js';
import { cavityOfField } from '../fields/fieldFilters.js';
import { shiftField } from '../fields/fieldOperations.js';
import { getCellularNoiseFields, getFractalNoiseField } from '../noise/noiseFieldCache.js';
import { packColorMap, packNormalMap, packOrmMap } from './surfaceMapPacking.js';

/**
 * @typedef {Object} SurfaceMaps The finished maps of one surface tile, as plain data.
 * @property {number} size Edge length in texels.
 * @property {number} tileMetres The real-world size one tile covers.
 * @property {Uint8Array} color RGBA8, sRGB base colour (alpha is coverage for cut-out surfaces).
 * @property {Uint8Array} normal RGBA8 tangent-space normal map (row 0 is v = 0, green along +v).
 * @property {Uint8Array} orm RGBA8 linear: R ambient occlusion, G roughness, B metalness.
 * @property {Uint8Array | null} emissive RGBA8 sRGB emissive colour, or null.
 * @property {Float32Array | null} height The height field in metres when asked for, else null.
 * @property {[number, number, number]} averageColor Mean linear albedo.
 * @property {number} averageRoughness
 * @property {number} averageMetalness
 * @property {boolean} hasAlpha Whether the colour map's alpha channel carries coverage.
 */

/** Scratch fields waiting to be reused, by length. */
const pool = new Map();

/**
 * Creates a painter for one surface tile.
 * @param {number} size Edge length in texels (a power of two).
 * @param {number} tileMetres The real-world size the tile covers; with it heights in metres
 *   turn into physically right normals.
 * @param {number | string} [seed] Decides every random choice and noise field of the recipe.
 */
export function createSurfacePainter(size, tileMetres, seed = 1) {
  const count = size * size;
  const baseSeed = deriveSeed(seed, 'surface');
  const held = [];
  const acquire = (clear) => {
    const spare = pool.get(count);
    const field = spare && spare.length > 0 ? spare.pop() : new Float32Array(count);
    if (clear) field.fill(0);
    held.push(field);
    return field;
  };

  const painter = {
    size,
    tileMetres,
    /** Metres per texel. */
    texel: tileMetres / size,
    /** Texels per metre: multiply real sizes by it to get stamp sizes. */
    texelsPerMetre: size / tileMetres,
    seed: baseSeed,
    /** A seeded generator for the recipe's own choices. */
    random: createSeededRandom(baseSeed),
    /** Linear albedo channels. */
    r: acquire(true),
    g: acquire(true),
    b: acquire(true),
    /** Height in metres above the mean surface. */
    height: acquire(true),
    /** Roughness 0..1 (recipes usually start with roughness.fill(value)). */
    roughness: acquire(true),
    /** Metalness: a number for the whole tile, or a field once metalnessField() was called. */
    metalness: 0,
    /** Extra occlusion to multiply into the derived one (1 = open), or null. */
    occlusion: null,
    /** Emissive colour channels (linear), or null until emissiveFields() was called. */
    emissive: null,
    /** Coverage 0..1, or null for an opaque surface. */
    alpha: null,

    /** A zero-filled scratch field. */
    field: () => acquire(true),
    /** A scratch copy of a field (use it to modify a shared noise field). */
    copy: (source) => {
      const field = acquire(false);
      field.set(source);
      return field;
    },
    /** A scratch copy of a field moved by whole texels with wrap-around (a free decorrelated copy). */
    shifted: (source, shiftX, shiftY) => shiftField(source, shiftX, shiftY, acquire(false)),
    /** Returns scratch fields to the pool. */
    release: (...fields) => {
      for (const field of fields) {
        const index = held.indexOf(field);
        if (index < 0) continue;
        held.splice(index, 1);
        recycle(field);
      }
    },

    /**
     * A shared fractal noise field (read only). `period` is lattice cells per tile, so the
     * feature size is tileMetres / period.
     * @param {number} period
     * @param {number} [octaves]
     * @param {{gain?: number, shape?: 'plain' | 'billow' | 'ridged', label?: number | string, periodY?: number}} [options]
     *   `label` selects an independent field with the same parameters; `periodY` stretches
     *   the noise (cells per tile along y).
     * @returns {Float32Array}
     */
    fractal: (period, octaves = 5, options = {}) =>
      getFractalNoiseField(size, {
        period,
        periodY: options.periodY,
        octaves,
        gain: options.gain,
        shape: options.shape,
        seed: options.label === undefined ? baseSeed : deriveSeed(baseSeed, options.label),
      }),

    /**
     * Shared cellular noise fields (read only): { nearest, second, cell, period }.
     * @param {number} period Feature points per tile edge.
     * @param {{jitter?: number, label?: number | string}} [options]
     */
    cells: (period, options = {}) =>
      getCellularNoiseFields(size, {
        period,
        jitter: options.jitter,
        seed: options.label === undefined ? baseSeed : deriveSeed(baseSeed, options.label),
      }),

    /** Sets the whole albedo to one colour. */
    fill: (color) => {
      const [r, g, b] = parseColor(color);
      painter.r.fill(r);
      painter.g.fill(g);
      painter.b.fill(b);
      return painter;
    },

    /**
     * Sets the albedo to a ramp between two colours driven by a field: `from` where the field is
     * at or below `low`, `to` at or above `high`.
     */
    ramp: (field, from, to, low = 0, high = 1) => {
      const a = parseColor(from);
      const c = parseColor(to);
      const inverse = high === low ? 0 : 1 / (high - low);
      const { r, g, b } = painter;
      for (let i = 0; i < count; i += 1) {
        let t = (field[i] - low) * inverse;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        r[i] = a[0] + (c[0] - a[0]) * t;
        g[i] = a[1] + (c[1] - a[1]) * t;
        b[i] = a[2] + (c[2] - a[2]) * t;
      }
      return painter;
    },

    /** Paints a colour over the albedo through a mask: albedo = lerp(albedo, color, mask * amount). */
    paint: (color, mask, amount = 1) => {
      const [cr, cg, cb] = parseColor(color);
      const { r, g, b } = painter;
      for (let i = 0; i < count; i += 1) {
        const t = mask[i] * amount;
        if (t <= 0) continue;
        r[i] += (cr - r[i]) * t;
        g[i] += (cg - g[i]) * t;
        b[i] += (cb - b[i]) * t;
      }
      return painter;
    },

    /** Multiplies the albedo by lerp(low, high, field) for a field in 0..1. */
    shade: (field, low, high) => {
      const span = high - low;
      const { r, g, b } = painter;
      for (let i = 0; i < count; i += 1) {
        const factor = low + span * field[i];
        r[i] *= factor;
        g[i] *= factor;
        b[i] *= factor;
      }
      return painter;
    },

    /** Multiplies the albedo by 1 + field * amount for a signed field (plain fractal noise). */
    shadeSigned: (field, amount) => {
      const { r, g, b } = painter;
      for (let i = 0; i < count; i += 1) {
        const factor = 1 + field[i] * amount;
        r[i] *= factor;
        g[i] *= factor;
        b[i] *= factor;
      }
      return painter;
    },

    /**
     * Multiplies the albedo by a tint that runs from `low` to `high` with a field in 0..1
     * (colours here are multipliers: parseColor(0xffffff) leaves the albedo unchanged).
     */
    tint: (field, low, high) => {
      const a = parseColor(low);
      const c = parseColor(high);
      const { r, g, b } = painter;
      for (let i = 0; i < count; i += 1) {
        const t = field[i];
        r[i] *= a[0] + (c[0] - a[0]) * t;
        g[i] *= a[1] + (c[1] - a[1]) * t;
        b[i] *= a[2] + (c[2] - a[2]) * t;
      }
      return painter;
    },

    /** Turns metalness into a field (filled with the current number) and returns it. */
    metalnessField: () => {
      if (typeof painter.metalness === 'number') {
        const value = painter.metalness;
        painter.metalness = acquire(true);
        if (value !== 0) painter.metalness.fill(value);
      }
      return painter.metalness;
    },

    /** Creates the emissive channels (black) and returns them as { r, g, b }. */
    emissiveFields: () => {
      if (!painter.emissive) painter.emissive = { r: acquire(true), g: acquire(true), b: acquire(true) };
      return painter.emissive;
    },

    /** Creates the alpha field (opaque) and returns it. */
    alphaField: () => {
      if (!painter.alpha) {
        painter.alpha = acquire(false);
        painter.alpha.fill(1);
      }
      return painter.alpha;
    },

    /**
     * Packs the painted fields into byte maps and frees the painter's fields. A generator: use
     * `return yield* p.finish(options)` at the end of a recipe.
     * @param {Object} [options]
     * @param {number} [options.normalStrength] Multiplier of the physical slopes (default 1).
     * @param {number} [options.occlusionRadius] Texels over which cavities are measured (default 5).
     * @param {number} [options.occlusionDepth] Depth in metres that counts as fully occluded
     *   (default 2 mm); 0 switches derived occlusion off.
     * @param {number} [options.occlusionStrength] How dark full occlusion is (default 0.75).
     * @param {number} [options.cavityShade] How much occlusion also darkens the albedo, since
     *   ambient occlusion only affects ambient light (default 0.35).
     * @param {boolean} [options.keepHeight] Return the height field too.
     * @returns {Generator<void, SurfaceMaps, void>}
     */
    *finish(options = {}) {
      const depth = options.occlusionDepth ?? 0.002;
      let occlusion = null;
      if (depth > 0) {
        occlusion = acquire(false);
        cavityOfField(painter.height, options.occlusionRadius ?? 5, depth, occlusion);
        const strength = options.occlusionStrength ?? 0.75;
        const shade = options.cavityShade ?? 0.35;
        const extra = painter.occlusion;
        const { r, g, b } = painter;
        for (let i = 0; i < count; i += 1) {
          const cavity = occlusion[i];
          const albedoFactor = 1 - cavity * shade;
          r[i] *= albedoFactor;
          g[i] *= albedoFactor;
          b[i] *= albedoFactor;
          occlusion[i] = (1 - cavity * strength) * (extra ? extra[i] : 1);
        }
      } else if (painter.occlusion) {
        occlusion = painter.occlusion;
      }
      yield;
      const color = packColorMap(painter.r, painter.g, painter.b, painter.alpha, options);
      yield;
      const normal = packNormalMap(painter.height, size, painter.texel, options.normalStrength ?? 1);
      yield;
      const orm = packOrmMap(occlusion, painter.roughness, painter.metalness, options);
      let emissive = null;
      if (painter.emissive) {
        emissive = packColorMap(painter.emissive.r, painter.emissive.g, painter.emissive.b, null, { floor: 0, ceiling: 1 }).pixels;
      }
      /** @type {SurfaceMaps} */
      const maps = {
        size,
        tileMetres,
        color: color.pixels,
        normal,
        orm: orm.pixels,
        emissive,
        height: options.keepHeight ? Float32Array.from(painter.height) : null,
        averageColor: color.average,
        averageRoughness: orm.averageRoughness,
        averageMetalness: orm.averageMetalness,
        hasAlpha: painter.alpha !== null,
      };
      painter.dispose();
      return maps;
    },

    /** Returns every field of the painter to the pool (finish() does this itself). */
    dispose: () => {
      for (const field of held) recycle(field);
      held.length = 0;
    },
  };
  return painter;
}

function recycle(field) {
  let spare = pool.get(field.length);
  if (!spare) {
    spare = [];
    pool.set(field.length, spare);
  }
  if (spare.length < 24) spare.push(field);
}

/** Frees the pooled scratch fields (call when texture generation is over). */
export function clearSurfacePainterPool() {
  pool.clear();
}

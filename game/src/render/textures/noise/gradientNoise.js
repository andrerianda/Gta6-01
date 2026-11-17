// Gradient (Perlin-style) noise on the CPU for texture painting. The workhorse is
// addTileableGradientNoise(), which adds one octave of seamlessly tiling 2D noise to a whole
// square Float32Array field in a single pass: the lattice gradients are hashed once and the
// per-column and per-row interpolation weights are tabulated, so the inner loop is a handful of
// multiplications per texel (about a millisecond per octave for a 512 square). Point-wise 2D and
// 3D versions exist for code that needs single samples. Nothing here touches Math.random.
//
//   const field = new Float32Array(512 * 512);
//   addTileableGradientNoise(field, 512, 8, seed, 1);      // 8 lattice cells per tile, about -1..1

import { hashGridCell, hashGridCell3D } from '../../../core/random/coordinateHash.js';

/** How an octave is shaped before it is added: plain, |n| (billowy) or 1 - |n| (ridged). */
export const NOISE_SHAPE = Object.freeze({ plain: 0, billow: 1, ridged: 2 });

/**
 * Adds one octave of tiling 2D gradient noise to a square field.
 * @param {Float32Array} target Field of size * size values, row by row; changed in place.
 * @param {number} size Edge length of the field in texels.
 * @param {number} period Lattice cells per tile (an integer of at least 1): the noise repeats
 *   exactly at the field's edges.
 * @param {number} seed Unsigned 32-bit seed.
 * @param {number} [weight] Multiplier of the added values.
 * @param {number} [shape] One of NOISE_SHAPE: plain values lie in about -1..1 (most within
 *   +-0.6); billow and ridged values lie in 0..1.
 * @returns {Float32Array} The target.
 */
export function addTileableGradientNoise(target, size, period, seed, weight = 1, shape = 0) {
  const cells = Math.max(1, Math.round(period));
  const gradientX = new Float32Array(cells * cells);
  const gradientY = new Float32Array(cells * cells);
  for (let cy = 0; cy < cells; cy += 1) {
    for (let cx = 0; cx < cells; cx += 1) {
      // 1.4142 scales the unit gradients so that the noise spans about -1..1.
      const angle = (hashGridCell(cx, cy, seed) / 4294967296) * 6.283185307179586;
      gradientX[cy * cells + cx] = Math.cos(angle) * 1.4142;
      gradientY[cy * cells + cx] = Math.sin(angle) * 1.4142;
    }
  }
  // Per-column tables: the two lattice columns, the offset within the cell and its fade weight.
  const column0 = new Int32Array(size);
  const column1 = new Int32Array(size);
  const offset = new Float32Array(size);
  const fade = new Float32Array(size);
  const scale = cells / size;
  for (let x = 0; x < size; x += 1) {
    const position = (x + 0.5) * scale;
    const cell = Math.floor(position);
    const f = position - cell;
    column0[x] = cell % cells;
    column1[x] = (cell + 1) % cells;
    offset[x] = f;
    fade[x] = f * f * f * (f * (f * 6 - 15) + 10);
  }
  for (let y = 0; y < size; y += 1) {
    const row0 = column0[y] * cells;
    const row1 = column1[y] * cells;
    const fy = offset[y];
    const fy1 = fy - 1;
    const sy = fade[y];
    let index = y * size;
    for (let x = 0; x < size; x += 1, index += 1) {
      const c0 = column0[x];
      const c1 = column1[x];
      const fx = offset[x];
      const fx1 = fx - 1;
      const n00 = gradientX[row0 + c0] * fx + gradientY[row0 + c0] * fy;
      const n10 = gradientX[row0 + c1] * fx1 + gradientY[row0 + c1] * fy;
      const n01 = gradientX[row1 + c0] * fx + gradientY[row1 + c0] * fy1;
      const n11 = gradientX[row1 + c1] * fx1 + gradientY[row1 + c1] * fy1;
      const sx = fade[x];
      const top = n00 + (n10 - n00) * sx;
      let value = top + (n01 + (n11 - n01) * sx - top) * sy;
      if (shape !== 0) {
        value = value < 0 ? -value : value;
        if (shape === 2) value = 1 - (value > 1 ? 1 : value);
      }
      target[index] += value * weight;
    }
  }
  return target;
}

/**
 * One sample of tiling 2D gradient noise, in about -1..1.
 * @param {number} x Position in lattice cells.
 * @param {number} y
 * @param {number} period Lattice cells after which the noise repeats (integer >= 1) in both axes.
 * @param {number} [seed]
 * @returns {number}
 */
export function tileableGradientNoise2D(x, y, period, seed = 0) {
  const cells = Math.max(1, Math.round(period));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const cx0 = ((x0 % cells) + cells) % cells;
  const cy0 = ((y0 % cells) + cells) % cells;
  const cx1 = (cx0 + 1) % cells;
  const cy1 = (cy0 + 1) % cells;
  const sx = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const sy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const n00 = cornerDot2D(cx0, cy0, fx, fy, seed);
  const n10 = cornerDot2D(cx1, cy0, fx - 1, fy, seed);
  const n01 = cornerDot2D(cx0, cy1, fx, fy - 1, seed);
  const n11 = cornerDot2D(cx1, cy1, fx - 1, fy - 1, seed);
  const top = n00 + (n10 - n00) * sx;
  return top + (n01 + (n11 - n01) * sx - top) * sy;
}

function cornerDot2D(cx, cy, dx, dy, seed) {
  const angle = (hashGridCell(cx, cy, seed) / 4294967296) * 6.283185307179586;
  return (Math.cos(angle) * dx + Math.sin(angle) * dy) * 1.4142;
}

/**
 * One sample of 3D gradient noise, in about -1..1. With a period it tiles in all three axes
 * (use the third axis as time for looping animation or as a seed-like slice).
 * @param {number} x Position in lattice cells.
 * @param {number} y
 * @param {number} z
 * @param {number} [seed]
 * @param {number} [period] Lattice cells after which the noise repeats; 0 for no repeat.
 * @returns {number}
 */
export function gradientNoise3D(x, y, z, seed = 0, period = 0) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const fx = x - x0;
  const fy = y - y0;
  const fz = z - z0;
  const sx = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const sy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const sz = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
  let result = 0;
  for (let corner = 0; corner < 8; corner += 1) {
    const ox = corner & 1;
    const oy = (corner >> 1) & 1;
    const oz = corner >> 2;
    let cx = x0 + ox;
    let cy = y0 + oy;
    let cz = z0 + oz;
    if (period > 0) {
      cx = ((cx % period) + period) % period;
      cy = ((cy % period) + period) % period;
      cz = ((cz % period) + period) % period;
    }
    const gradient = GRADIENTS_3D[hashGridCell3D(cx, cy, cz, seed) % 12];
    const dot = gradient[0] * (fx - ox) + gradient[1] * (fy - oy) + gradient[2] * (fz - oz);
    result += dot * (ox ? sx : 1 - sx) * (oy ? sy : 1 - sy) * (oz ? sz : 1 - sz);
  }
  return result;
}

/** The twelve edge directions of a cube: Perlin's improved-noise gradient set. */
const GRADIENTS_3D = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
  [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
];

/**
 * Fills a square field with a slice of tiling 3D gradient noise at a fixed depth: successive
 * depths give smoothly changing fields (frames of a looping animation when `period` also
 * divides the depth range).
 * @param {Float32Array} target Field of size * size values; overwritten.
 * @param {number} size
 * @param {number} period Lattice cells per tile.
 * @param {number} depth Position along the third axis, in lattice cells.
 * @param {number} [seed]
 * @returns {Float32Array}
 */
export function fillGradientNoiseSlice(target, size, period, depth, seed = 0) {
  const scale = period / size;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      target[y * size + x] = gradientNoise3D((x + 0.5) * scale, (y + 0.5) * scale, depth, seed, period);
    }
  }
  return target;
}

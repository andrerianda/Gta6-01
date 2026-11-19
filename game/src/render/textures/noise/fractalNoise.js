// Fractal sums of tiling gradient noise: the cloudy, ridged and billowy fields that surfaces are
// painted from. Every field is a square Float32Array that repeats seamlessly at its edges.
//
//   const mottling = createFractalNoiseField(512, { period: 3, octaves: 5, seed });        // about -1..1
//   const veins = createFractalNoiseField(512, { period: 6, octaves: 4, seed, shape: 'ridged' }); // 0..1

import { addTileableGradientNoise, NOISE_SHAPE } from './gradientNoise.js';

/**
 * Creates a fractal noise field.
 * @param {number} size Edge length in texels.
 * @param {Object} [options]
 * @param {number} [options.period] Lattice cells per tile of the first octave (integer, default 4).
 * @param {number} [options.periodY] Cells per tile along y when the noise should be stretched
 *   (period 2 with periodY 40 gives horizontal streaks; default: the same as period).
 * @param {number} [options.octaves] Octaves to sum (default 5); octaves finer than two texels
 *   per cell are skipped.
 * @param {number} [options.gain] Amplitude ratio between octaves (default 0.5; higher is rougher).
 * @param {number} [options.lacunarity] Frequency ratio between octaves (an integer, default 2).
 * @param {number} [options.seed] Unsigned 32-bit seed.
 * @param {'plain' | 'billow' | 'ridged'} [options.shape] `plain` gives signed values with a
 *   standard deviation of about 0.33 (nearly all within -1..1) whatever the octave count;
 *   `billow` (sum of |n|, puffy with creases) and `ridged` (sum of 1 - |n|, sharp crests) give
 *   values in 0..1.
 * @param {Float32Array} [options.target] A field to add to instead of a new one.
 * @returns {Float32Array}
 */
export function createFractalNoiseField(size, options = {}) {
  const job = createFractalNoiseJob(size, options);
  while (job.step());
  return job.target;
}

/**
 * The same field built one octave per call, for callers that slice heavy work across frames.
 * @param {number} size
 * @param {Object} [options] The options of createFractalNoiseField.
 * @returns {{target: Float32Array, step: () => boolean}} `step` adds the next octave and
 *   returns true while more remain.
 */
export function createFractalNoiseJob(size, options = {}) {
  const target = options.target ?? new Float32Array(size * size);
  const shape = NOISE_SHAPE[options.shape ?? 'plain'] ?? 0;
  const gain = options.gain ?? 0.5;
  const lacunarity = Math.max(2, Math.round(options.lacunarity ?? 2));
  const seed = options.seed ?? 0;

  const plan = [];
  let sum = 0;
  let sumOfSquares = 0;
  let period = Math.max(1, Math.round(options.period ?? 4));
  let periodY = Math.max(1, Math.round(options.periodY ?? period));
  let amplitude = 1;
  for (let octave = 0; octave < (options.octaves ?? 5) && Math.max(period, periodY) * 2 <= size; octave += 1) {
    plan.push({ period, periodY, amplitude, seed: (seed + Math.imul(octave + 1, 0x9e3779b1)) >>> 0 });
    sum += amplitude;
    sumOfSquares += amplitude * amplitude;
    amplitude *= gain;
    period *= lacunarity;
    periodY *= lacunarity;
  }
  // Plain octaves are independent with a deviation of about 0.33 each; dividing by the root of
  // the summed squares keeps that deviation for the total. Shaped octaves are simply averaged.
  const normalisation = shape === 0 ? 1 / Math.sqrt(sumOfSquares || 1) : 1 / (sum || 1);
  let next = 0;
  return {
    target,
    step: () => {
      if (next >= plan.length) return false;
      const octave = plan[next];
      addTileableGradientNoise(target, size, octave.period, octave.seed, octave.amplitude * normalisation, shape, octave.periodY);
      next += 1;
      return next < plan.length;
    },
  };
}

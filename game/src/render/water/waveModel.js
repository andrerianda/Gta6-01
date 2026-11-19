// The shape of MARAZUL's water: a small set of directional trochoidal (Gerstner) waves, evaluated
// identically by the water shader on the GPU and by this module on the CPU, so that boats float on
// the surface the player sees. Pure arithmetic, no three.js.
//
//   const waves = createWaveSet('sea');
//   const height = sampleWaveHeight(waves, x, z, timeSeconds, 1);    // metres above the rest level
//
// The shader receives the same numbers through packWaveUniforms().

const GRAVITY = 9.81;
const TWO_PI = Math.PI * 2;

/** How many waves a set holds; the shader loops over exactly this many. */
export const WAVE_COUNT = 6;

/**
 * @typedef {Object} WaveSet
 * @property {string} kind The preset name.
 * @property {Float32Array} directionX Unit travel direction of each wave, X part.
 * @property {Float32Array} directionZ Unit travel direction of each wave, Z part.
 * @property {Float32Array} wavenumber 2 pi over the wavelength, per metre.
 * @property {Float32Array} amplitude Metres.
 * @property {Float32Array} frequency Angular frequency in radians per second (deep-water dispersion).
 * @property {Float32Array} steepness Horizontal pinch of the crests, 0 (sine) to 1 (sharp).
 * @property {Float32Array} phase Phase offset in radians.
 */

/**
 * Wave presets: wavelength (m), amplitude (m), direction offset from the wind (rad), steepness.
 * The sea is a long swell with chop on top; the river and marina are sheltered; a pool barely moves.
 */
const WAVE_PRESETS = Object.freeze({
  sea: [
    [71, 0.36, -0.2, 0.55], [43, 0.24, 0.32, 0.6], [26, 0.15, -0.55, 0.62],
    [15.5, 0.085, 0.72, 0.6], [9.2, 0.05, -0.95, 0.5], [5.4, 0.028, 0.15, 0.45],
  ],
  marina: [
    [19, 0.04, -0.3, 0.3], [11, 0.03, 0.5, 0.35], [6.7, 0.02, -0.9, 0.35],
    [4.1, 0.012, 1.1, 0.3], [2.6, 0.008, -1.5, 0.25], [1.7, 0.005, 0.2, 0.2],
  ],
  river: [
    [14, 0.025, 0.1, 0.25], [8.3, 0.02, -0.4, 0.3], [5.1, 0.014, 0.6, 0.3],
    [3.2, 0.009, -0.8, 0.25], [2.1, 0.006, 1.2, 0.2], [1.3, 0.004, -0.2, 0.2],
  ],
  pool: [
    [3.1, 0.006, 0.0, 0.1], [2.2, 0.005, 1.3, 0.1], [1.6, 0.004, -1.1, 0.1],
    [1.1, 0.003, 2.4, 0.1], [0.8, 0.002, -2.2, 0.1], [0.55, 0.0015, 0.7, 0.1],
  ],
});

/**
 * Creates the wave parameters of a body of water.
 * @param {'sea' | 'marina' | 'river' | 'pool'} [kind] The preset.
 * @param {number} [windAzimuth] Compass direction the waves travel toward, radians (0 north,
 *   clockwise); the default sends the swell onto the western beaches' shore from the Gulf.
 * @returns {WaveSet}
 */
export function createWaveSet(kind = 'sea', windAzimuth = 1.25) {
  const preset = WAVE_PRESETS[kind];
  if (!preset) throw new Error(`unknown wave preset: ${kind}`);
  const set = {
    kind,
    directionX: new Float32Array(WAVE_COUNT),
    directionZ: new Float32Array(WAVE_COUNT),
    wavenumber: new Float32Array(WAVE_COUNT),
    amplitude: new Float32Array(WAVE_COUNT),
    frequency: new Float32Array(WAVE_COUNT),
    steepness: new Float32Array(WAVE_COUNT),
    phase: new Float32Array(WAVE_COUNT),
  };
  for (let i = 0; i < WAVE_COUNT; i += 1) {
    const [wavelength, amplitude, offset, steepness] = preset[i];
    const azimuth = windAzimuth + offset;
    const k = TWO_PI / wavelength;
    set.directionX[i] = Math.sin(azimuth);
    set.directionZ[i] = -Math.cos(azimuth);
    set.wavenumber[i] = k;
    set.amplitude[i] = amplitude;
    set.frequency[i] = Math.sqrt(GRAVITY * k);
    set.steepness[i] = steepness;
    set.phase[i] = i * 1.7;
  }
  return set;
}

/**
 * The height of the water surface above its rest level at a world position.
 * @param {WaveSet} waves The body's wave set.
 * @param {number} x World X in metres.
 * @param {number} z World Z in metres.
 * @param {number} time Seconds on the water clock.
 * @param {number} [scale] Multiplier on all amplitudes (weather raises the sea).
 * @returns {number} Metres; add the body's rest level (0 for the sea).
 */
export function sampleWaveHeight(waves, x, z, time, scale = 1) {
  // Trochoidal waves also move the surface sideways, so the point that ends up above (x, z)
  // started a little away from it. Two fixed-point steps find that origin closely enough.
  let originX = x;
  let originZ = z;
  for (let step = 0; step < 2; step += 1) {
    let offsetX = 0;
    let offsetZ = 0;
    for (let i = 0; i < WAVE_COUNT; i += 1) {
      const theta = wavePhaseAt(waves, i, originX, originZ, time);
      const pinch = waves.steepness[i] * waves.amplitude[i] * scale * Math.cos(theta);
      offsetX += waves.directionX[i] * pinch;
      offsetZ += waves.directionZ[i] * pinch;
    }
    originX = x - offsetX;
    originZ = z - offsetZ;
  }
  let height = 0;
  for (let i = 0; i < WAVE_COUNT; i += 1) {
    height += waves.amplitude[i] * scale * Math.sin(wavePhaseAt(waves, i, originX, originZ, time));
  }
  return height;
}

/**
 * The height and the upward normal of the water surface at a world position, for buoyancy that
 * tilts hulls. Uses the plain height field (no sideways pinch), which is accurate for the slopes.
 * @param {WaveSet} waves The body's wave set.
 * @param {number} x World X in metres.
 * @param {number} z World Z in metres.
 * @param {number} time Seconds on the water clock.
 * @param {number} scale Multiplier on all amplitudes.
 * @param {{height: number, normalX: number, normalY: number, normalZ: number}} out Receives the result.
 * @returns {{height: number, normalX: number, normalY: number, normalZ: number}} `out`.
 */
export function sampleWaveSurface(waves, x, z, time, scale, out) {
  let slopeX = 0;
  let slopeZ = 0;
  for (let i = 0; i < WAVE_COUNT; i += 1) {
    const theta = wavePhaseAt(waves, i, x, z, time);
    const slope = waves.amplitude[i] * scale * waves.wavenumber[i] * Math.cos(theta);
    slopeX += waves.directionX[i] * slope;
    slopeZ += waves.directionZ[i] * slope;
  }
  const inverseLength = 1 / Math.hypot(slopeX, 1, slopeZ);
  out.height = sampleWaveHeight(waves, x, z, time, scale);
  out.normalX = -slopeX * inverseLength;
  out.normalY = inverseLength;
  out.normalZ = -slopeZ * inverseLength;
  return out;
}

/**
 * Packs a wave set into the two vec4 arrays the water shader declares:
 * `waveA[i] = (directionX, directionZ, wavenumber, amplitude)` and
 * `waveB[i] = (frequency, steepness, phase, 0)`.
 * @param {WaveSet} waves The wave set.
 * @param {Float32Array} waveA Length 4 * WAVE_COUNT.
 * @param {Float32Array} waveB Length 4 * WAVE_COUNT.
 */
export function packWaveUniforms(waves, waveA, waveB) {
  for (let i = 0; i < WAVE_COUNT; i += 1) {
    waveA[i * 4] = waves.directionX[i];
    waveA[i * 4 + 1] = waves.directionZ[i];
    waveA[i * 4 + 2] = waves.wavenumber[i];
    waveA[i * 4 + 3] = waves.amplitude[i];
    waveB[i * 4] = waves.frequency[i];
    waveB[i * 4 + 1] = waves.steepness[i];
    waveB[i * 4 + 2] = waves.phase[i];
    waveB[i * 4 + 3] = 0;
  }
}

function wavePhaseAt(waves, index, x, z, time) {
  return (
    waves.wavenumber[index] * (waves.directionX[index] * x + waves.directionZ[index] * z) -
    waves.frequency[index] * time +
    waves.phase[index]
  );
}

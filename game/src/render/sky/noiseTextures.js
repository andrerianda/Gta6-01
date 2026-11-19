// Tiling noise made on the CPU at start-up, shared by the clouds, the water, the rain ripples and
// the heat shimmer, so that shaders read one small texture instead of computing octaves of noise
// per pixel. No file is loaded: every texel is computed here.
//
//   const noise = createTilingNoiseTexture();   // RGBA8, repeats seamlessly, mip-mapped
//   R: soft cloud-like fractal noise     G: billowy cellular noise (bright cell centres)
//   B: finer fractal noise               A: fine-grained value noise

import * as THREE from 'three';

/**
 * Builds the shared tiling noise texture.
 * @param {number} [size] Edge length in texels (a power of two).
 * @returns {THREE.DataTexture} Linear data, repeat wrapping, trilinear filtering.
 */
export function createTilingNoiseTexture(size = 256) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const v = y / size;
      const soft = fractalNoise(u, v, 4, 5, 11);
      const cells = 1 - (0.62 * cellNoise(u, v, 5, 23) + 0.26 * cellNoise(u, v, 11, 37) + 0.12 * cellNoise(u, v, 23, 41));
      const fine = fractalNoise(u, v, 16, 4, 53);
      const grain = fractalNoise(u, v, 64, 2, 71);
      const index = (y * size + x) * 4;
      data[index] = toByte(soft);
      data[index + 1] = toByte(cells);
      data[index + 2] = toByte(fine);
      data[index + 3] = toByte(grain);
    }
  }
  return finishDataTexture(new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType));
}

/**
 * Builds a tiling normal map of small water ripples: RG hold the X and Z slope of one height
 * field, BA the slope of a second, differently shaped one, each stored as slope * 0.5 + 0.5.
 * @param {number} [size] Edge length in texels (a power of two).
 * @returns {THREE.DataTexture}
 */
export function createRippleNormalTexture(size = 256) {
  const heightA = new Float32Array(size * size);
  const heightB = new Float32Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const v = y / size;
      heightA[y * size + x] = fractalNoise(u, v, 6, 5, 101) + 0.35 * (1 - cellNoise(u, v, 9, 131));
      heightB[y * size + x] = fractalNoise(u, v, 10, 4, 211) + 0.25 * (1 - cellNoise(u, v, 17, 157));
    }
  }
  const data = new Uint8Array(size * size * 4);
  const slopeScale = size / 16;
  for (let y = 0; y < size; y += 1) {
    const up = ((y + 1) % size) * size;
    const down = ((y - 1 + size) % size) * size;
    for (let x = 0; x < size; x += 1) {
      const right = (x + 1) % size;
      const left = (x - 1 + size) % size;
      const row = y * size;
      const index = (row + x) * 4;
      data[index] = toByte(0.5 + 0.5 * clampSigned((heightA[row + right] - heightA[row + left]) * slopeScale));
      data[index + 1] = toByte(0.5 + 0.5 * clampSigned((heightA[up + x] - heightA[down + x]) * slopeScale));
      data[index + 2] = toByte(0.5 + 0.5 * clampSigned((heightB[row + right] - heightB[row + left]) * slopeScale));
      data[index + 3] = toByte(0.5 + 0.5 * clampSigned((heightB[up + x] - heightB[down + x]) * slopeScale));
    }
  }
  return finishDataTexture(new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType));
}

function finishDataTexture(texture) {
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Tiling fractal gradient noise in 0..1.
 * @param {number} u Horizontal coordinate, one tile per unit.
 * @param {number} v Vertical coordinate.
 * @param {number} period Lattice cells per tile for the first octave.
 * @param {number} octaves How many octaves to sum, each at double frequency and half weight.
 * @param {number} seed Decorrelates different noise fields.
 * @returns {number}
 */
export function fractalNoise(u, v, period, octaves, seed) {
  let sum = 0;
  let weight = 0.5;
  let total = 0;
  let cells = period;
  for (let octave = 0; octave < octaves; octave += 1) {
    sum += weight * gradientNoise(u * cells, v * cells, cells, seed + octave * 17);
    total += weight;
    weight *= 0.5;
    cells *= 2;
  }
  return clamp01(0.5 + (sum / total) * 0.9);
}

/** Tiling gradient (Perlin-style) noise in about -0.7..0.7 on a lattice that wraps at `period`. */
function gradientNoise(x, y, period, seed) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const sy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const n00 = cornerDot(x0, y0, fx, fy, period, seed);
  const n10 = cornerDot(x0 + 1, y0, fx - 1, fy, period, seed);
  const n01 = cornerDot(x0, y0 + 1, fx, fy - 1, period, seed);
  const n11 = cornerDot(x0 + 1, y0 + 1, fx - 1, fy - 1, period, seed);
  const top = n00 + (n10 - n00) * sx;
  const bottom = n01 + (n11 - n01) * sx;
  return top + (bottom - top) * sy;
}

function cornerDot(ix, iy, dx, dy, period, seed) {
  const angle = latticeHash(wrap(ix, period), wrap(iy, period), seed) * Math.PI * 2;
  return Math.cos(angle) * dx + Math.sin(angle) * dy;
}

/** Tiling cellular noise: the distance to the nearest feature point, 0 at a point to about 1. */
function cellNoise(u, v, period, seed) {
  const x = u * period;
  const y = v * period;
  const cellX = Math.floor(x);
  const cellY = Math.floor(y);
  let nearest = 9;
  for (let oy = -1; oy <= 1; oy += 1) {
    for (let ox = -1; ox <= 1; ox += 1) {
      const cx = cellX + ox;
      const cy = cellY + oy;
      const wx = wrap(cx, period);
      const wy = wrap(cy, period);
      const px = cx + latticeHash(wx, wy, seed);
      const py = cy + latticeHash(wx, wy, seed + 59);
      const dx = px - x;
      const dy = py - y;
      const distance = dx * dx + dy * dy;
      if (distance < nearest) nearest = distance;
    }
  }
  return Math.min(1, Math.sqrt(nearest));
}

/** A float in [0, 1) from two lattice coordinates and a seed (integer hash, no trigonometry). */
function latticeHash(ix, iy, seed) {
  let h = Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1) ^ Math.imul(seed, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function wrap(value, period) {
  const wrapped = value % period;
  return wrapped < 0 ? wrapped + period : wrapped;
}

function toByte(unit) {
  return Math.max(0, Math.min(255, Math.round(unit * 255)));
}

function clamp01(value) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function clampSigned(value) {
  return value < -1 ? -1 : value > 1 ? 1 : value;
}

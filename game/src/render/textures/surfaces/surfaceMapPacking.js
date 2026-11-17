// Packs painted fields into the byte maps a physically based material reads: an sRGB base
// colour map, a tangent-space normal map derived from a height field, and one linear map that
// carries ambient occlusion (red), roughness (green) and metalness (blue), the layout three.js
// reads when the same texture is used as aoMap, roughnessMap and metalnessMap. Plain typed
// arrays in and out; no three.js, no canvas.
//
//   const normal = packNormalMap(height, 512, texelMetres);       // height in metres
//   const orm = packOrmMap(occlusion, roughness, 0);

import { SRGB_BYTE_TABLE, SRGB_TABLE_SIZE } from '../colorMath.js';

/**
 * Encodes three linear colour channels as an RGBA8 sRGB map.
 * @param {Float32Array} red Linear albedo, one value per texel.
 * @param {Float32Array} green
 * @param {Float32Array} blue
 * @param {Float32Array | null} [alpha] Coverage 0..1, or null for opaque.
 * @param {Object} [limits]
 * @param {number} [limits.floor] Darkest linear value written (default 0.02: nothing is pure black).
 * @param {number} [limits.ceiling] Brightest linear value written (default 0.9: nor pure white).
 * @param {Uint8Array} [out]
 * @returns {{pixels: Uint8Array, average: [number, number, number]}} The map and its mean
 *   linear colour.
 */
export function packColorMap(red, green, blue, alpha = null, limits = {}, out = new Uint8Array(red.length * 4)) {
  const floor = limits.floor ?? 0.02;
  const ceiling = limits.ceiling ?? 0.9;
  const top = SRGB_TABLE_SIZE - 1;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  for (let i = 0, o = 0; i < red.length; i += 1, o += 4) {
    let r = red[i];
    let g = green[i];
    let b = blue[i];
    r = r < floor ? floor : r > ceiling ? ceiling : r;
    g = g < floor ? floor : g > ceiling ? ceiling : g;
    b = b < floor ? floor : b > ceiling ? ceiling : b;
    sumR += r;
    sumG += g;
    sumB += b;
    out[o] = SRGB_BYTE_TABLE[(r * top + 0.5) | 0];
    out[o + 1] = SRGB_BYTE_TABLE[(g * top + 0.5) | 0];
    out[o + 2] = SRGB_BYTE_TABLE[(b * top + 0.5) | 0];
    if (alpha) {
      const a = alpha[i];
      out[o + 3] = a <= 0 ? 0 : a >= 1 ? 255 : (a * 255 + 0.5) | 0;
    } else {
      out[o + 3] = 255;
    }
  }
  const count = red.length || 1;
  return { pixels: out, average: [sumR / count, sumG / count, sumB / count] };
}

/**
 * Derives a tangent-space normal map from a tiling height field. The slopes are physical: with
 * heights and texel size in metres a 45 degree flank comes out as a 45 degree normal. Row 0 of
 * the field is the bottom row of the texture (v = 0), the layout of a data texture, and green
 * points along +v (the OpenGL convention three.js expects).
 * @param {Float32Array} height
 * @param {number} size Edge length in texels.
 * @param {number} texelSize Width of a texel in the unit of the heights.
 * @param {number} [strength] Multiplier of the slopes (1 is physical).
 * @param {Uint8Array} [out]
 * @returns {Uint8Array} RGBA8, alpha 255.
 */
export function packNormalMap(height, size, texelSize, strength = 1, out = new Uint8Array(size * size * 4)) {
  const scale = strength / (2 * texelSize);
  for (let y = 0; y < size; y += 1) {
    const row = y * size;
    const up = (y + 1 === size ? 0 : y + 1) * size;
    const down = (y === 0 ? size - 1 : y - 1) * size;
    for (let x = 0; x < size; x += 1) {
      const right = x + 1 === size ? 0 : x + 1;
      const left = x === 0 ? size - 1 : x - 1;
      const nx = (height[row + left] - height[row + right]) * scale;
      const ny = (height[down + x] - height[up + x]) * scale;
      const inverse = 127.5 / Math.sqrt(nx * nx + ny * ny + 1);
      const o = (row + x) * 4;
      out[o] = (nx * inverse + 128) | 0;
      out[o + 1] = (ny * inverse + 128) | 0;
      out[o + 2] = (inverse + 128) | 0;
      out[o + 3] = 255;
    }
  }
  return out;
}

/**
 * Packs ambient occlusion, roughness and metalness into one RGBA8 map (R, G, B).
 * @param {Float32Array | null} occlusion 1 open, toward 0 occluded; null for none.
 * @param {Float32Array | number} roughness
 * @param {Float32Array | number} metalness
 * @param {Object} [limits]
 * @param {number} [limits.minRoughness] Smoothest value written (default 0.03).
 * @param {Uint8Array} [out]
 * @returns {{pixels: Uint8Array, averageRoughness: number, averageMetalness: number}}
 */
export function packOrmMap(occlusion, roughness, metalness, limits = {}, out = undefined) {
  const count = typeof roughness === 'number' ? (occlusion ? occlusion.length : metalness.length) : roughness.length;
  const pixels = out ?? new Uint8Array(count * 4);
  const minRoughness = limits.minRoughness ?? 0.03;
  const roughnessIsField = typeof roughness !== 'number';
  const metalnessIsField = typeof metalness !== 'number';
  let roughnessSum = 0;
  let metalnessSum = 0;
  for (let i = 0, o = 0; i < count; i += 1, o += 4) {
    const ao = occlusion ? occlusion[i] : 1;
    let rough = roughnessIsField ? roughness[i] : roughness;
    let metal = metalnessIsField ? metalness[i] : metalness;
    rough = rough < minRoughness ? minRoughness : rough > 1 ? 1 : rough;
    metal = metal < 0 ? 0 : metal > 1 ? 1 : metal;
    roughnessSum += rough;
    metalnessSum += metal;
    pixels[o] = ao <= 0 ? 0 : ao >= 1 ? 255 : (ao * 255 + 0.5) | 0;
    pixels[o + 1] = (rough * 255 + 0.5) | 0;
    pixels[o + 2] = (metal * 255 + 0.5) | 0;
    pixels[o + 3] = 255;
  }
  return { pixels, averageRoughness: roughnessSum / (count || 1), averageMetalness: metalnessSum / (count || 1) };
}

/**
 * Reads the mean albedo, roughness and metalness back out of packed maps (for tests and for
 * placeholder materials shown while a surface is still being generated).
 * @param {Uint8Array} colorPixels RGBA8 sRGB.
 * @param {Uint8Array} ormPixels RGBA8 linear.
 * @returns {{albedo: [number, number, number], occlusion: number, roughness: number, metalness: number}}
 */
export function measurePackedMaps(colorPixels, ormPixels) {
  const decode = new Float32Array(256);
  for (let i = 0; i < 256; i += 1) {
    const v = i / 255;
    decode[i] = v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }
  const sums = [0, 0, 0, 0, 0, 0];
  const count = colorPixels.length / 4;
  for (let o = 0; o < colorPixels.length; o += 4) {
    sums[0] += decode[colorPixels[o]];
    sums[1] += decode[colorPixels[o + 1]];
    sums[2] += decode[colorPixels[o + 2]];
    sums[3] += ormPixels[o];
    sums[4] += ormPixels[o + 1];
    sums[5] += ormPixels[o + 2];
  }
  return {
    albedo: [sums[0] / count, sums[1] / count, sums[2] / count],
    occlusion: sums[3] / count / 255,
    roughness: sums[4] / count / 255,
    metalness: sums[5] / count / 255,
  };
}

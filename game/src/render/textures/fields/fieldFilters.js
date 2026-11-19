// Neighbourhood filters on tiling scalar fields: blur, slope and curvature. The blur is a
// repeated box blur computed with running sums, so its cost does not grow with the radius;
// three passes are close to a Gaussian. Fields are square Float32Arrays (see fieldOperations.js).
//
//   blurField(mask, 6);                                   // soften a mask by about 6 texels
//   const slope = slopeOfField(height, texelMetres);      // rise over run, per texel
//   const curvature = curvatureOfField(height);           // positive on bumps, negative in dents

import { fieldSize } from './fieldOperations.js';

/**
 * Blurs a field in place with wrap-around.
 * @param {Float32Array} target
 * @param {number} radius Box radius in texels; the visible softening after two passes is about
 *   1.4 times this.
 * @param {number} [passes] Box passes (1 is boxy, 2 the default, 3 near Gaussian).
 * @param {Float32Array} [scratch] A spare field of the same size to avoid an allocation.
 * @returns {Float32Array} The target.
 */
export function blurField(target, radius, passes = 2, scratch = undefined) {
  const size = fieldSize(target);
  const r = Math.min(Math.floor((size - 1) / 2), Math.round(radius));
  if (r <= 0) return target;
  const temp = scratch ?? new Float32Array(target.length);
  const padded = new Float32Array(size + 2 * r + 1);
  const sums = new Float32Array(size);
  const inverse = 1 / (2 * r + 1);
  for (let pass = 0; pass < passes; pass += 1) {
    // Horizontal: target -> temp.
    for (let y = 0; y < size; y += 1) {
      const row = y * size;
      // The row with r texels of wrap on the left and r + 1 on the right.
      padded.set(target.subarray(row + size - r, row + size), 0);
      padded.set(target.subarray(row, row + size), r);
      padded.set(target.subarray(row, row + r + 1), r + size);
      let sum = 0;
      for (let k = 0; k <= 2 * r; k += 1) sum += padded[k];
      for (let x = 0; x < size; x += 1) {
        temp[row + x] = sum * inverse;
        sum += padded[x + 2 * r + 1] - padded[x];
      }
    }
    // Vertical: temp -> target, one running sum per column.
    sums.fill(0);
    for (let k = -r; k <= r; k += 1) {
      const row = ((k + size) % size) * size;
      for (let x = 0; x < size; x += 1) sums[x] += temp[row + x];
    }
    for (let y = 0; y < size; y += 1) {
      const row = y * size;
      const enter = ((y + r + 1) % size) * size;
      const leave = ((y - r + size) % size) * size;
      for (let x = 0; x < size; x += 1) {
        target[row + x] = sums[x] * inverse;
        sums[x] += temp[enter + x] - temp[leave + x];
      }
    }
  }
  return target;
}

/**
 * The steepness of a height field: the length of its gradient (rise over run).
 * @param {Float32Array} height Heights in the same unit as `texelSize`.
 * @param {number} [texelSize] The width of one texel (metres when heights are metres).
 * @param {Float32Array} [target]
 * @returns {Float32Array}
 */
export function slopeOfField(height, texelSize = 1, target = new Float32Array(height.length)) {
  const size = fieldSize(height);
  const scale = 1 / (2 * texelSize);
  for (let y = 0; y < size; y += 1) {
    const row = y * size;
    const up = ((y + 1) % size) * size;
    const down = ((y - 1 + size) % size) * size;
    for (let x = 0; x < size; x += 1) {
      const right = x + 1 === size ? 0 : x + 1;
      const left = x === 0 ? size - 1 : x - 1;
      const dx = (height[row + right] - height[row + left]) * scale;
      const dy = (height[up + x] - height[down + x]) * scale;
      target[row + x] = Math.sqrt(dx * dx + dy * dy);
    }
  }
  return target;
}

/**
 * The curvature of a height field: how far each texel stands above (positive) or below
 * (negative) the mean of its four neighbours. Edges and peaks wear and catch light; dents
 * collect dirt.
 * @param {Float32Array} height
 * @param {Float32Array} [target]
 * @returns {Float32Array} In the unit of the heights.
 */
export function curvatureOfField(height, target = new Float32Array(height.length)) {
  const size = fieldSize(height);
  for (let y = 0; y < size; y += 1) {
    const row = y * size;
    const up = ((y + 1) % size) * size;
    const down = ((y - 1 + size) % size) * size;
    for (let x = 0; x < size; x += 1) {
      const right = x + 1 === size ? 0 : x + 1;
      const left = x === 0 ? size - 1 : x - 1;
      target[row + x] = height[row + x] - (height[row + right] + height[row + left] + height[up + x] + height[down + x]) * 0.25;
    }
  }
  return target;
}

/**
 * How far each texel lies below the local average of its surroundings, as a 0..1 cavity mask:
 * 0 on open ground and on bumps, toward 1 in pits and joints. The base of ambient occlusion,
 * dirt in crevices and roughness in hollows.
 * @param {Float32Array} height
 * @param {number} radius Blur radius in texels that defines "surroundings".
 * @param {number} depth The depth (in the unit of the heights) that counts as fully in a cavity.
 * @param {Float32Array} [target]
 * @returns {Float32Array}
 */
export function cavityOfField(height, radius, depth, target = new Float32Array(height.length)) {
  target.set(height);
  blurField(target, radius, 2);
  const inverse = depth > 0 ? 1 / depth : 0;
  for (let i = 0; i < target.length; i += 1) {
    const below = (target[i] - height[i]) * inverse;
    target[i] = below < 0 ? 0 : below > 1 ? 1 : below;
  }
  return target;
}

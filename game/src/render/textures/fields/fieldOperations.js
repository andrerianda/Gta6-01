// Arithmetic on scalar fields. A field is a square Float32Array of size * size values, row by
// row, that tiles at its edges; it stands for a height, a mask, a roughness or one colour
// channel while a texture is being painted. Operations change their first argument in place
// and return it, so they chain without allocating; loops are plain typed-array loops without
// per-texel callbacks.
//
//   const mask = levelsField(copyField(noise), 0.1, 0.4);        // soft threshold to 0..1
//   mixFields(height, patchHeight, mask);                         // height = lerp(height, patch, mask)

/**
 * Creates a field filled with one value.
 * @param {number} size Edge length in texels.
 * @param {number} [value]
 * @returns {Float32Array}
 */
export function createField(size, value = 0) {
  const field = new Float32Array(size * size);
  if (value !== 0) field.fill(value);
  return field;
}

/** The edge length of a square field. @param {ArrayLike<number>} field @returns {number} */
export function fieldSize(field) {
  return Math.round(Math.sqrt(field.length));
}

/**
 * Copies a field, into `target` when given.
 * @param {Float32Array} source
 * @param {Float32Array} [target]
 * @returns {Float32Array}
 */
export function copyField(source, target = new Float32Array(source.length)) {
  target.set(source);
  return target;
}

/** target = target * scale + bias. @returns {Float32Array} */
export function scaleField(target, scale, bias = 0) {
  for (let i = 0; i < target.length; i += 1) target[i] = target[i] * scale + bias;
  return target;
}

/** target += source * scale. @returns {Float32Array} */
export function addField(target, source, scale = 1) {
  for (let i = 0; i < target.length; i += 1) target[i] += source[i] * scale;
  return target;
}

/** target *= source. @returns {Float32Array} */
export function multiplyField(target, source) {
  for (let i = 0; i < target.length; i += 1) target[i] *= source[i];
  return target;
}

/** target *= lerp(low, high, source): a field scaled by a mask-controlled factor. @returns {Float32Array} */
export function modulateField(target, source, low, high) {
  const span = high - low;
  for (let i = 0; i < target.length; i += 1) target[i] *= low + span * source[i];
  return target;
}

/** target = max(target, source * scale). @returns {Float32Array} */
export function maxField(target, source, scale = 1) {
  for (let i = 0; i < target.length; i += 1) {
    const value = source[i] * scale;
    if (value > target[i]) target[i] = value;
  }
  return target;
}

/** target = min(target, source * scale). @returns {Float32Array} */
export function minField(target, source, scale = 1) {
  for (let i = 0; i < target.length; i += 1) {
    const value = source[i] * scale;
    if (value < target[i]) target[i] = value;
  }
  return target;
}

/**
 * target = lerp(target, other, mask * amount), where `other` is a field or a number.
 * @param {Float32Array} target
 * @param {Float32Array | number} other
 * @param {Float32Array} mask Values in 0..1.
 * @param {number} [amount]
 * @returns {Float32Array}
 */
export function mixFields(target, other, mask, amount = 1) {
  if (typeof other === 'number') {
    for (let i = 0; i < target.length; i += 1) target[i] += (other - target[i]) * mask[i] * amount;
  } else {
    for (let i = 0; i < target.length; i += 1) target[i] += (other[i] - target[i]) * mask[i] * amount;
  }
  return target;
}

/** Clamps every value to [min, max]. @returns {Float32Array} */
export function clampField(target, min = 0, max = 1) {
  for (let i = 0; i < target.length; i += 1) {
    const value = target[i];
    target[i] = value < min ? min : value > max ? max : value;
  }
  return target;
}

/** target = 1 - target. @returns {Float32Array} */
export function invertField(target) {
  for (let i = 0; i < target.length; i += 1) target[i] = 1 - target[i];
  return target;
}

/** target = |target|. @returns {Float32Array} */
export function absField(target) {
  for (let i = 0; i < target.length; i += 1) if (target[i] < 0) target[i] = -target[i];
  return target;
}

/** target = max(0, target) ^ exponent. @returns {Float32Array} */
export function powerField(target, exponent) {
  for (let i = 0; i < target.length; i += 1) target[i] = target[i] > 0 ? target[i] ** exponent : 0;
  return target;
}

/**
 * Levels: maps [inLow, inHigh] linearly to [outLow, outHigh] with clamping, the way an image
 * editor's levels tool does; with `smooth` the ramp is a smoothstep. With inLow > inHigh the
 * ramp falls. This is also the way to make a mask from a threshold: levelsField(f, 0.48, 0.52).
 * @param {Float32Array} target
 * @param {number} inLow
 * @param {number} inHigh
 * @param {number} [outLow]
 * @param {number} [outHigh]
 * @param {boolean} [smooth]
 * @returns {Float32Array}
 */
export function levelsField(target, inLow, inHigh, outLow = 0, outHigh = 1, smooth = true) {
  const inverse = inHigh === inLow ? 0 : 1 / (inHigh - inLow);
  const span = outHigh - outLow;
  for (let i = 0; i < target.length; i += 1) {
    let t = (target[i] - inLow) * inverse;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    if (smooth) t = t * t * (3 - 2 * t);
    target[i] = outLow + span * t;
  }
  return target;
}

/**
 * The minimum, maximum and mean of a field.
 * @param {ArrayLike<number>} field
 * @returns {{min: number, max: number, mean: number}}
 */
export function fieldRange(field) {
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  for (let i = 0; i < field.length; i += 1) {
    const value = field[i];
    if (value < min) min = value;
    if (value > max) max = value;
    sum += value;
  }
  return { min, max, mean: field.length > 0 ? sum / field.length : 0 };
}

/** Stretches a field so that its values span exactly 0..1. @returns {Float32Array} */
export function normaliseField(target) {
  const { min, max } = fieldRange(target);
  const scale = max > min ? 1 / (max - min) : 0;
  for (let i = 0; i < target.length; i += 1) target[i] = (target[i] - min) * scale;
  return target;
}

/**
 * Blends a source into the target with an image-editor blend mode.
 * @param {Float32Array} target Values in 0..1.
 * @param {Float32Array} source Values in 0..1.
 * @param {'multiply' | 'screen' | 'overlay' | 'add' | 'subtract' | 'darken' | 'lighten' | 'normal'} mode
 * @param {number} [opacity]
 * @returns {Float32Array}
 */
export function blendFields(target, source, mode, opacity = 1) {
  for (let i = 0; i < target.length; i += 1) {
    const a = target[i];
    const b = source[i];
    let blended;
    switch (mode) {
      case 'multiply': blended = a * b; break;
      case 'screen': blended = 1 - (1 - a) * (1 - b); break;
      case 'overlay': blended = a < 0.5 ? 2 * a * b : 1 - 2 * (1 - a) * (1 - b); break;
      case 'add': blended = a + b; break;
      case 'subtract': blended = a - b; break;
      case 'darken': blended = a < b ? a : b; break;
      case 'lighten': blended = a > b ? a : b; break;
      default: blended = b;
    }
    target[i] = a + (blended - a) * opacity;
  }
  return target;
}

/**
 * Copies a field moved by a whole number of texels with wrap-around: a free way to get a
 * decorrelated copy of a cached noise field.
 * @param {Float32Array} source
 * @param {number} shiftX Texels to the right.
 * @param {number} shiftY Texels down.
 * @param {Float32Array} [target] Must not be the source.
 * @returns {Float32Array}
 */
export function shiftField(source, shiftX, shiftY, target = new Float32Array(source.length)) {
  const size = fieldSize(source);
  const dx = ((Math.round(shiftX) % size) + size) % size;
  const dy = ((Math.round(shiftY) % size) + size) % size;
  for (let y = 0; y < size; y += 1) {
    const from = ((y - dy + size) % size) * size;
    const to = y * size;
    target.set(source.subarray(from, from + size - dx), to + dx);
    if (dx > 0) target.set(source.subarray(from + size - dx, from + size), to);
  }
  return target;
}

/**
 * Copies a field mirrored or transposed: another free decorrelated copy that still tiles.
 * @param {Float32Array} source
 * @param {'flipX' | 'flipY' | 'transpose'} how
 * @param {Float32Array} [target] Must not be the source.
 * @returns {Float32Array}
 */
export function reorientField(source, how, target = new Float32Array(source.length)) {
  const size = fieldSize(source);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const from = how === 'flipX' ? y * size + (size - 1 - x) : how === 'flipY' ? (size - 1 - y) * size + x : x * size + y;
      target[y * size + x] = source[from];
    }
  }
  return target;
}

/**
 * One bilinear sample of a tiling field.
 * @param {Float32Array} field
 * @param {number} size
 * @param {number} x Texel coordinates (texel centres at integers); any real number.
 * @param {number} y
 * @returns {number}
 */
export function sampleField(field, size, x, y) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const xa = ((x0 % size) + size) % size;
  const ya = ((y0 % size) + size) % size;
  const xb = xa + 1 === size ? 0 : xa + 1;
  const yb = ya + 1 === size ? 0 : ya + 1;
  const top = field[ya * size + xa] + (field[ya * size + xb] - field[ya * size + xa]) * fx;
  const bottom = field[yb * size + xa] + (field[yb * size + xb] - field[yb * size + xa]) * fx;
  return top + (bottom - top) * fy;
}

/**
 * Resamples a tiling field to another size (bilinear).
 * @param {Float32Array} source
 * @param {number} newSize
 * @returns {Float32Array}
 */
export function resampleField(source, newSize) {
  const size = fieldSize(source);
  if (size === newSize) return copyField(source);
  const target = new Float32Array(newSize * newSize);
  const scale = size / newSize;
  for (let y = 0; y < newSize; y += 1) {
    for (let x = 0; x < newSize; x += 1) {
      target[y * newSize + x] = sampleField(source, size, (x + 0.5) * scale - 0.5, (y + 0.5) * scale - 0.5);
    }
  }
  return target;
}

/**
 * Domain warping: reads `source` at positions pushed around by two other fields, which bends
 * straight features into organic ones and still tiles.
 * @param {Float32Array} source
 * @param {Float32Array} warpX Signed offsets along x (for instance a plain fractal field).
 * @param {Float32Array} warpY Signed offsets along y.
 * @param {number} strength Texels of displacement per unit of the warp fields.
 * @param {Float32Array} [target] Must not be the source.
 * @returns {Float32Array}
 */
export function warpField(source, warpX, warpY, strength, target = new Float32Array(source.length)) {
  const size = fieldSize(source);
  const mask = size - 1;
  const powerOfTwo = (size & mask) === 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = y * size + x;
      const sx = x + warpX[index] * strength;
      const sy = y + warpY[index] * strength;
      if (powerOfTwo) {
        const x0 = Math.floor(sx);
        const y0 = Math.floor(sy);
        const fx = sx - x0;
        const fy = sy - y0;
        const xa = x0 & mask;
        const xb = (x0 + 1) & mask;
        const ra = (y0 & mask) * size;
        const rb = ((y0 + 1) & mask) * size;
        const top = source[ra + xa] + (source[ra + xb] - source[ra + xa]) * fx;
        const bottom = source[rb + xa] + (source[rb + xb] - source[rb + xa]) * fx;
        target[index] = top + (bottom - top) * fy;
      } else {
        target[index] = sampleField(source, size, sx, sy);
      }
    }
  }
  return target;
}

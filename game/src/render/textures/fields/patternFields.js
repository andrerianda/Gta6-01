// Regular and drawn patterns for tiling scalar fields: grids of tiles with joints (paving slabs,
// bricks, planks, ceramic tiles, curtain-wall bays), and soft stamps (discs, boxes, strokes,
// wandering cracks) that wrap around the edges of the field. Together with noise these are the
// shapes surfaces are built from. All coordinates are texels; fields are square Float32Arrays.
//
//   const bricks = createTilePattern(512, { columns: 8, rows: 24, stagger: 0.5, jointTexels: 3, bevelTexels: 2 });
//   // bricks.profile: 0 in the mortar, 1 on the brick face; bricks.cell: which brick each texel is in
//   const tone = cellRandomField(bricks.cell, bricks.cellCount, seed);   // one random value per brick

import { hashGridCell } from '../../../core/random/coordinateHash.js';

/**
 * Lays out a grid of rectangular tiles separated by joints.
 * @param {number} size Edge length of the fields in texels.
 * @param {Object} options
 * @param {number} options.columns Tiles across one tile of the texture.
 * @param {number} options.rows Courses down one tile of the texture.
 * @param {number} [options.stagger] Shift of each course against the one below, in tile widths
 *   (0 stacked, 0.5 running bond).
 * @param {boolean} [options.randomStagger] Give every course its own random shift (planks).
 * @param {number} [options.jointTexels] Width of the joint in texels (default 2).
 * @param {number} [options.bevelTexels] Width over which the face rises out of the joint (default 2).
 * @param {number} [options.seed] Seed of the random stagger.
 * @returns {{profile: Float32Array, distance: Float32Array, cell: Uint16Array, cellCount: number,
 *   columns: number, rows: number}} `profile` is 0 in the joint and 1 on the face; `distance` is
 *   the distance in texels to the nearest tile edge; `cell` numbers the tiles row by row.
 */
export function createTilePattern(size, options) {
  const columns = Math.max(1, Math.round(options.columns));
  const rows = Math.max(1, Math.round(options.rows));
  const stagger = options.stagger ?? 0;
  const jointHalf = (options.jointTexels ?? 2) / 2;
  const bevel = Math.max(1e-3, options.bevelTexels ?? 2);
  const seed = options.seed ?? 0;
  const profile = new Float32Array(size * size);
  const distance = new Float32Array(size * size);
  const cell = new Uint16Array(size * size);
  const tileWidth = size / columns;
  const tileHeight = size / rows;
  for (let y = 0; y < size; y += 1) {
    const v = (y + 0.5) / tileHeight;
    const row = Math.min(rows - 1, Math.floor(v));
    const fv = v - row;
    const edgeV = (fv < 0.5 ? fv : 1 - fv) * tileHeight;
    const shift = options.randomStagger ? hashGridCell(row, 17, seed) / 4294967296 : (row * stagger) % 1;
    let index = y * size;
    for (let x = 0; x < size; x += 1, index += 1) {
      const u = (x + 0.5) / tileWidth + shift;
      const whole = Math.floor(u);
      const fu = u - whole;
      const edgeU = (fu < 0.5 ? fu : 1 - fu) * tileWidth;
      const edge = edgeU < edgeV ? edgeU : edgeV;
      distance[index] = edge;
      let t = (edge - jointHalf) / bevel;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      profile[index] = t * t * (3 - 2 * t);
      cell[index] = row * columns + (whole % columns);
    }
  }
  return { profile, distance, cell, cellCount: columns * rows, columns, rows };
}

/**
 * A field holding one random value per cell of a cell-index map (from createTilePattern or
 * cellular noise): per-brick tone, per-slab tilt, per-stone colour.
 * @param {Uint16Array} cell Cell index of every texel.
 * @param {number} cellCount Number of distinct cells.
 * @param {number} seed
 * @param {Float32Array} [target]
 * @returns {Float32Array} Values in [0, 1).
 */
export function cellRandomField(cell, cellCount, seed, target = new Float32Array(cell.length)) {
  const table = new Float32Array(cellCount);
  for (let i = 0; i < cellCount; i += 1) table[i] = hashGridCell(i, 91, seed) / 4294967296;
  for (let i = 0; i < cell.length; i += 1) target[i] = table[cell[i]];
  return target;
}

/** How a stamp combines with what is already in the field. */
function combine(field, index, coverage, value, mode) {
  if (mode === 'max') {
    const candidate = coverage * value;
    if (candidate > field[index]) field[index] = candidate;
  } else if (mode === 'add') {
    field[index] += coverage * value;
  } else {
    field[index] += (value - field[index]) * coverage;
  }
}

/**
 * Stamps a soft ellipse or rounded box into a field, wrapping at the edges.
 * @param {Float32Array} field
 * @param {number} size
 * @param {Object} shape
 * @param {number} shape.x Centre in texels.
 * @param {number} shape.y
 * @param {number} shape.halfWidth Half extent along the shape's own x axis, in texels.
 * @param {number} [shape.halfHeight] Half extent along its y axis (default: the same, a disc).
 * @param {number} [shape.angle] Rotation in radians.
 * @param {'ellipse' | 'box'} [shape.kind]
 * @param {number} [shape.soft] Width of the soft edge in texels (default 1.5).
 * @param {number} [shape.value] Value at full coverage (default 1).
 * @param {'max' | 'add' | 'blend'} [shape.mode] `max` unions masks, `add` accumulates, `blend`
 *   moves the field toward the value (default `max`).
 * @returns {Float32Array} The field.
 */
export function stampShape(field, size, shape) {
  const halfWidth = shape.halfWidth;
  const halfHeight = shape.halfHeight ?? halfWidth;
  const soft = Math.max(0.01, shape.soft ?? 1.5);
  const value = shape.value ?? 1;
  const mode = shape.mode ?? 'max';
  const cos = Math.cos(shape.angle ?? 0);
  const sin = Math.sin(shape.angle ?? 0);
  const box = shape.kind === 'box';
  const reach = Math.ceil(Math.hypot(halfWidth, halfHeight) + soft + 1);
  const x0 = Math.floor(shape.x - reach);
  const x1 = Math.ceil(shape.x + reach);
  const y0 = Math.floor(shape.y - reach);
  const y1 = Math.ceil(shape.y + reach);
  for (let y = y0; y <= y1; y += 1) {
    const row = (((y % size) + size) % size) * size;
    for (let x = x0; x <= x1; x += 1) {
      const dx = x + 0.5 - shape.x;
      const dy = y + 0.5 - shape.y;
      const lx = dx * cos + dy * sin;
      const ly = -dx * sin + dy * cos;
      let outside;
      if (box) {
        const ox = Math.abs(lx) - halfWidth;
        const oy = Math.abs(ly) - halfHeight;
        outside = ox > oy ? ox : oy;
      } else {
        // Distance to the ellipse, approximated by scaling the radial distance.
        const radial = Math.sqrt((lx * lx) / (halfWidth * halfWidth) + (ly * ly) / (halfHeight * halfHeight));
        outside = (radial - 1) * (halfWidth < halfHeight ? halfWidth : halfHeight);
      }
      if (outside >= 0) continue;
      let coverage = -outside / soft;
      if (coverage > 1) coverage = 1;
      else coverage = coverage * coverage * (3 - 2 * coverage);
      combine(field, row + (((x % size) + size) % size), coverage, value, mode);
    }
  }
  return field;
}

/**
 * Stamps a soft stroke from A to B into a field, wrapping at the edges.
 * @param {Float32Array} field
 * @param {number} size
 * @param {number} ax Texels.
 * @param {number} ay
 * @param {number} bx
 * @param {number} by
 * @param {number} halfWidth Half the width of the stroke at full value, in texels.
 * @param {number} [value]
 * @param {number} [soft] Width of the soft edge in texels.
 * @param {'max' | 'add' | 'blend'} [mode]
 * @returns {Float32Array} The field.
 */
export function stampStroke(field, size, ax, ay, bx, by, halfWidth, value = 1, soft = 1, mode = 'max') {
  const reach = halfWidth + soft;
  const x0 = Math.floor(Math.min(ax, bx) - reach);
  const x1 = Math.ceil(Math.max(ax, bx) + reach);
  const y0 = Math.floor(Math.min(ay, by) - reach);
  const y1 = Math.ceil(Math.max(ay, by) + reach);
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  for (let y = y0; y <= y1; y += 1) {
    const row = (((y % size) + size) % size) * size;
    for (let x = x0; x <= x1; x += 1) {
      const px = x + 0.5 - ax;
      const py = y + 0.5 - ay;
      let t = lengthSquared > 0 ? (px * dx + py * dy) / lengthSquared : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ox = px - dx * t;
      const oy = py - dy * t;
      const distance = Math.sqrt(ox * ox + oy * oy);
      if (distance >= reach) continue;
      const coverage = distance <= halfWidth ? 1 : 1 - (distance - halfWidth) / soft;
      combine(field, row + (((x % size) + size) % size), coverage, value, mode);
    }
  }
  return field;
}

/**
 * Draws a wandering crack: a random walk of short strokes that may branch, the way cracks run
 * through asphalt, concrete and plaster.
 * @param {Float32Array} field Mask to draw into (union).
 * @param {number} size
 * @param {import('../../../core/random/seededRandom.js').SeededRandom} random
 * @param {Object} [options]
 * @param {number} [options.x] Start in texels (default random).
 * @param {number} [options.y]
 * @param {number} [options.angle] Initial heading in radians (default random).
 * @param {number} [options.length] Length in texels (default half the field).
 * @param {number} [options.step] Length of each stroke in texels (default 6).
 * @param {number} [options.wander] How sharply the crack turns per stroke, in radians (default 0.5).
 * @param {number} [options.halfWidth] Half width in texels (default 0.6).
 * @param {number} [options.branching] Chance per stroke of a side branch (default 0.04).
 * @param {number} [options.value] Mask value (default 1).
 * @returns {Float32Array} The field.
 */
export function drawCrack(field, size, random, options = {}) {
  let x = options.x ?? random.range(0, size);
  let y = options.y ?? random.range(0, size);
  let heading = options.angle ?? random.angle();
  const step = options.step ?? 6;
  const wander = options.wander ?? 0.5;
  const halfWidth = options.halfWidth ?? 0.6;
  const branching = options.branching ?? 0.04;
  const value = options.value ?? 1;
  const length = options.length ?? size / 2;
  const mainHeading = heading;
  for (let travelled = 0; travelled < length; travelled += step) {
    // Turn at random but drift back toward the main direction, so the crack keeps going somewhere.
    heading += random.range(-wander, wander) + (mainHeading - heading) * 0.15;
    const nx = x + Math.cos(heading) * step;
    const ny = y + Math.sin(heading) * step;
    // The crack thins toward its end.
    const thin = 0.45 + 0.55 * Math.min(1, (length - travelled) / (length * 0.4));
    stampStroke(field, size, x, y, nx, ny, halfWidth * thin, value, 0.8, 'max');
    if (branching > 0 && length > step * 6 && random.chance(branching)) {
      drawCrack(field, size, random, {
        x: nx,
        y: ny,
        angle: heading + random.sign() * random.range(0.5, 1.2),
        length: (length - travelled) * random.range(0.25, 0.6),
        step,
        wander,
        halfWidth: halfWidth * 0.7,
        branching: branching * 0.5,
        value,
      });
    }
    x = nx;
    y = ny;
  }
  return field;
}

/**
 * Scatters soft blots over a field: stains, patches of moss, worn spots.
 * @param {Float32Array} field
 * @param {number} size
 * @param {import('../../../core/random/seededRandom.js').SeededRandom} random
 * @param {Object} options
 * @param {number} options.count
 * @param {number} options.minRadius Texels.
 * @param {number} options.maxRadius Texels.
 * @param {number} [options.stretch] Largest ratio between the two radii of a blot (default 1.6).
 * @param {number} [options.soft] Soft edge as a fraction of the radius (default 0.6).
 * @param {number} [options.value]
 * @param {'max' | 'add' | 'blend'} [options.mode]
 * @returns {Float32Array} The field.
 */
export function scatterBlots(field, size, random, options) {
  for (let i = 0; i < options.count; i += 1) {
    const radius = random.range(options.minRadius, options.maxRadius);
    stampShape(field, size, {
      x: random.range(0, size),
      y: random.range(0, size),
      halfWidth: radius,
      halfHeight: radius / random.range(1, options.stretch ?? 1.6),
      angle: random.angle(),
      soft: radius * (options.soft ?? 0.6),
      value: options.value ?? 1,
      mode: options.mode ?? 'max',
    });
  }
  return field;
}

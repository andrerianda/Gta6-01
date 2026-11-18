// The ground of Marazul as a height field: a regular grid of heights with bilinear lookup,
// built from the coastline shapes. Every cell first learns its signed distance to the nearest
// shore (exact near the water, propagated further away) and what kind of shore that is; the
// height is then a shore profile (a beach climbs slowly, a quay is a wall, a marsh barely
// leaves the water) plus the hills of Las Lomas and a little relief. Roads and lots are pressed
// into the field afterwards by terrainConforming.js.
//
//   const terrain = createTerrainHeightField(coast, random.fork('terrain'));
//   const y = terrain.heightAt(x, z);              // any x, z: the sea floor far outside
//   const inland = terrain.shoreDistanceAt(x, z);  // metres from the water, negative in it

import { CITY_FRAME } from './cityFrame.js';
import { smoothStep } from './planGeometry.js';

const CELL_SIZE = 4;
const BAND = 40;
const FAR = 1e6;

/**
 * The summit of Las Lomas in city coordinates, where the lookout and the radio mast stand.
 * @type {Readonly<{e: number, n: number, height: number}>}
 */
export const LOMAS_SUMMIT = Object.freeze({ e: 1130, n: 560, height: 45 });

/**
 * Builds the height field of the natural ground (before roads and lots are pressed into it).
 * @param {import('./coastlineShapes.js').CoastlineShapes} coast
 * @param {import('../../core/random/seededRandom.js').SeededRandom} random
 * @returns {TerrainHeightField}
 */
export function createTerrainHeightField(coast, random) {
  const { minX, maxX, minZ, maxZ } = CITY_FRAME.extent;
  const columns = Math.round((maxX - minX) / CELL_SIZE) + 1;
  const rows = Math.round((maxZ - minZ) / CELL_SIZE) + 1;
  const count = columns * rows;
  const shore = collectShoreSegments(coast);
  const land = rasteriseLand(coast.landRings, minX, minZ, columns, rows);
  const distance = new Float32Array(count);
  const shoreCoordinate = new Float32Array(count);
  for (let i = 0; i < count; i += 1) distance[i] = land[i] ? FAR : -FAR;
  splatExactDistances(shore, land, distance, shoreCoordinate, minX, minZ, columns, rows);
  propagateDistances(distance, shoreCoordinate, columns, rows);
  const heights = new Float32Array(count);
  shapeHeights(heights, distance, shoreCoordinate, shore, createReliefNoise(random), minX, minZ, columns, rows);
  return createFieldQueries({ minX, minZ, columns, rows, heights, distance, shoreCoordinate, shore });
}

/**
 * @typedef {Object} TerrainHeightField
 * @property {number} minX World x of column 0.
 * @property {number} minZ World z of row 0.
 * @property {number} cellSize Metres between samples (4).
 * @property {number} columns Samples along x.
 * @property {number} rows Samples along z.
 * @property {Float32Array} heights Row-major heights, `rows * columns` values; index = row * columns + column.
 * @property {Float32Array} shoreDistance Signed distance to the nearest shore per sample: positive on land.
 * @property {(x: number, z: number) => number} heightAt The ground height at any point of the
 *   plane: bilinear inside the grid, falling away to the sea floor outside it. Bridge decks and
 *   piers are not part of it (see groundHeightAt in the queries).
 * @property {(x: number, z: number, out?: number[]) => number[]} normalAt The unit surface normal [x, y, z].
 * @property {(x: number, z: number) => number} shoreDistanceAt Metres to the nearest shore:
 *   positive inland, negative in the water; far outside the grid it keeps growing negative.
 * @property {(x: number, z: number) => boolean} isWaterAt Whether the ground is under the sea level.
 * @property {(x: number, z: number) => string} shoreKindAt The kind of the nearest shore
 *   ('beach', 'quay', 'seawall', 'rocky', 'marsh', 'riverbank', 'channel').
 * @property {(x: number, z: number) => number} naturalSandAt 1 on beach sand, 0 elsewhere, by the shore alone.
 */

// Every shore as segments with the parameters of the shore profile at both ends.
function collectShoreSegments(coast) {
  const kinds = coast.shoreKinds;
  const vertexBank = [];
  const vertexRise = [];
  const vertexNear = [];
  const vertexSlope = [];
  const vertexKind = [];
  const segments = [];
  for (const { ring, kinds: ringKinds } of coast.landRings) {
    const n = ring.length / 2;
    const first = vertexKind.length;
    // Blend the profile over a few vertices where one kind of shore meets another.
    for (let i = 0; i <= n; i += 1) {
      let bank = 0;
      let rise = 0;
      let near = 0;
      let slope = 0;
      for (let k = -2; k <= 2; k += 1) {
        const kind = kinds[ringKinds[(((i + k) % n) + n) % n]];
        bank += kind.bank;
        rise += kind.rise;
        near += kind.near;
        slope += kind.slope;
      }
      vertexBank.push(bank / 5);
      vertexRise.push(rise / 5);
      vertexNear.push(near / 5);
      vertexSlope.push(slope / 5);
      vertexKind.push(ringKinds[i % n]);
    }
    for (let i = 0; i < n; i += 1) {
      const j = (i + 1) % n;
      segments.push({ ax: ring[i * 2], az: ring[i * 2 + 1], bx: ring[j * 2], bz: ring[j * 2 + 1], vertex: first + i, widthA: 0, widthB: 0, carve: false });
    }
  }
  for (const carve of coast.carves) {
    const n = carve.points.length / 2;
    const kind = kinds[carve.shoreKind];
    const first = vertexKind.length;
    for (let i = 0; i < n; i += 1) {
      vertexBank.push(kind.bank);
      vertexRise.push(kind.rise);
      vertexNear.push(kind.near);
      vertexSlope.push(kind.slope);
      vertexKind.push(carve.shoreKind);
    }
    for (let i = 0; i < n - 1; i += 1) {
      segments.push({
        ax: carve.points[i * 2], az: carve.points[i * 2 + 1], bx: carve.points[i * 2 + 2], bz: carve.points[i * 2 + 3],
        vertex: first + i, widthA: carve.halfWidths[i], widthB: carve.halfWidths[i + 1], carve: true,
      });
    }
  }
  // One spare entry, so that "the next vertex" exists for the very last one.
  vertexBank.push(vertexBank[vertexBank.length - 1]);
  vertexRise.push(vertexRise[vertexRise.length - 1]);
  vertexNear.push(vertexNear[vertexNear.length - 1]);
  vertexSlope.push(vertexSlope[vertexSlope.length - 1]);
  vertexKind.push(vertexKind[vertexKind.length - 1]);
  return {
    segments,
    bank: Float32Array.from(vertexBank),
    rise: Float32Array.from(vertexRise),
    near: Float32Array.from(vertexNear),
    slope: Float32Array.from(vertexSlope),
    kind: Uint8Array.from(vertexKind),
    kindNames: kinds.map((kind) => kind.name),
    sand: kinds.map((kind) => kind.sand),
  };
}

// Marks the samples that lie inside a land ring (scan lines, even-odd).
function rasteriseLand(landRings, minX, minZ, columns, rows) {
  const land = new Uint8Array(columns * rows);
  for (const { ring } of landRings) {
    const crossings = new Array(rows);
    const n = ring.length / 2;
    for (let i = 0; i < n; i += 1) {
      const j = (i + 1) % n;
      const az = ring[i * 2 + 1];
      const bz = ring[j * 2 + 1];
      if (az === bz) continue;
      const ax = ring[i * 2];
      const bx = ring[j * 2];
      const low = Math.min(az, bz);
      const high = Math.max(az, bz);
      const firstRow = Math.max(0, Math.ceil((low - minZ) / CELL_SIZE));
      const lastRow = Math.min(rows - 1, Math.ceil((high - minZ) / CELL_SIZE) - 1);
      for (let row = firstRow; row <= lastRow; row += 1) {
        const z = minZ + row * CELL_SIZE;
        const x = ax + ((bx - ax) * (z - az)) / (bz - az);
        (crossings[row] ??= []).push(x);
      }
    }
    for (let row = 0; row < rows; row += 1) {
      const list = crossings[row];
      if (!list) continue;
      list.sort((a, b) => a - b);
      for (let k = 0; k + 1 < list.length; k += 2) {
        const from = Math.max(0, Math.ceil((list[k] - minX) / CELL_SIZE));
        const to = Math.min(columns - 1, Math.floor((list[k + 1] - minX) / CELL_SIZE));
        const base = row * columns;
        for (let column = from; column <= to; column += 1) land[base + column] = 1;
      }
    }
  }
  return land;
}

// Writes the exact signed distance to the shore into every sample within BAND of it, and carves
// the river and the channels out of the land.
function splatExactDistances(shore, land, distance, shoreCoordinate, minX, minZ, columns, rows) {
  for (const segment of shore.segments) {
    const { ax, az, bx, bz, vertex, widthA, widthB, carve } = segment;
    const reach = BAND + Math.max(widthA, widthB);
    const c0 = Math.max(0, Math.floor((Math.min(ax, bx) - reach - minX) / CELL_SIZE));
    const c1 = Math.min(columns - 1, Math.ceil((Math.max(ax, bx) + reach - minX) / CELL_SIZE));
    const r0 = Math.max(0, Math.floor((Math.min(az, bz) - reach - minZ) / CELL_SIZE));
    const r1 = Math.min(rows - 1, Math.ceil((Math.max(az, bz) + reach - minZ) / CELL_SIZE));
    const dx = bx - ax;
    const dz = bz - az;
    const inverse = 1 / (dx * dx + dz * dz || 1);
    for (let row = r0; row <= r1; row += 1) {
      const pz = minZ + row * CELL_SIZE - az;
      const base = row * columns;
      for (let column = c0; column <= c1; column += 1) {
        const px = minX + column * CELL_SIZE - ax;
        let t = (px * dx + pz * dz) * inverse;
        if (t < 0) t = 0;
        else if (t > 1) t = 1;
        const ox = px - dx * t;
        const oz = pz - dz * t;
        const d = Math.sqrt(ox * ox + oz * oz);
        const index = base + column;
        if (carve) {
          const signed = d - (widthA + (widthB - widthA) * t);
          if (signed < distance[index]) {
            distance[index] = signed;
            shoreCoordinate[index] = vertex + t;
          }
        } else if (d < Math.abs(distance[index])) {
          distance[index] = land[index] ? d : -d;
          shoreCoordinate[index] = vertex + t;
        }
      }
    }
  }
}

// Carries the distance (and the shore it belongs to) from the exact band to every other sample
// with a two-pass chamfer transform.
function propagateDistances(distance, shoreCoordinate, columns, rows) {
  const straight = CELL_SIZE;
  const diagonal = CELL_SIZE * Math.SQRT2;
  const count = columns * rows;
  // Work on magnitudes (the sign of every sample is already right) and put the signs back last.
  const magnitude = new Float32Array(count);
  for (let i = 0; i < count; i += 1) magnitude[i] = Math.abs(distance[i]);
  // The outermost ring of samples is skipped: it only ever lies in open sea.
  for (let row = 1; row < rows - 1; row += 1) {
    const base = row * columns;
    for (let index = base + 1; index < base + columns - 1; index += 1) {
      let best = magnitude[index];
      if (best <= BAND) continue;
      let from = -1;
      let candidate = magnitude[index - 1] + straight;
      if (candidate < best) { best = candidate; from = index - 1; }
      candidate = magnitude[index - columns] + straight;
      if (candidate < best) { best = candidate; from = index - columns; }
      candidate = magnitude[index - columns - 1] + diagonal;
      if (candidate < best) { best = candidate; from = index - columns - 1; }
      candidate = magnitude[index - columns + 1] + diagonal;
      if (candidate < best) { best = candidate; from = index - columns + 1; }
      if (from >= 0) {
        magnitude[index] = best;
        shoreCoordinate[index] = shoreCoordinate[from];
      }
    }
  }
  for (let row = rows - 2; row > 0; row -= 1) {
    const base = row * columns;
    for (let index = base + columns - 2; index > base; index -= 1) {
      let best = magnitude[index];
      if (best <= BAND) continue;
      let from = -1;
      let candidate = magnitude[index + 1] + straight;
      if (candidate < best) { best = candidate; from = index + 1; }
      candidate = magnitude[index + columns] + straight;
      if (candidate < best) { best = candidate; from = index + columns; }
      candidate = magnitude[index + columns + 1] + diagonal;
      if (candidate < best) { best = candidate; from = index + columns + 1; }
      candidate = magnitude[index + columns - 1] + diagonal;
      if (candidate < best) { best = candidate; from = index + columns - 1; }
      if (from >= 0) {
        magnitude[index] = best;
        shoreCoordinate[index] = shoreCoordinate[from];
      }
    }
  }
  // The skipped outer ring takes its values from the samples just inside it.
  for (let column = 0; column < columns; column += 1) {
    magnitude[column] = magnitude[column + columns] + straight;
    magnitude[count - 1 - column] = magnitude[count - 1 - column - columns] + straight;
  }
  for (let row = 0; row < rows; row += 1) {
    magnitude[row * columns] = magnitude[row * columns + 1] + straight;
    magnitude[row * columns + columns - 1] = magnitude[row * columns + columns - 2] + straight;
  }
  for (let i = 0; i < count; i += 1) distance[i] = distance[i] < 0 ? -magnitude[i] : magnitude[i];
}

// Smooth value noise on a small wrapped lattice of seeded values.
function createReliefNoise(random) {
  const size = 64;
  const lattice = new Float32Array(size * size);
  for (let i = 0; i < lattice.length; i += 1) lattice[i] = random.range(-1, 1);
  return (x, z, wavelength) => {
    const fx = x / wavelength + 4096;
    const fz = z / wavelength + 4096;
    const ix = Math.floor(fx);
    const iz = Math.floor(fz);
    let tx = fx - ix;
    let tz = fz - iz;
    tx = tx * tx * (3 - 2 * tx);
    tz = tz * tz * (3 - 2 * tz);
    const x0 = ix & (size - 1);
    const x1 = (ix + 1) & (size - 1);
    const z0 = (iz & (size - 1)) * size;
    const z1 = ((iz + 1) & (size - 1)) * size;
    const top = lattice[z0 + x0] + (lattice[z0 + x1] - lattice[z0 + x0]) * tx;
    const bottom = lattice[z1 + x0] + (lattice[z1 + x1] - lattice[z1 + x0]) * tx;
    return top + (bottom - top) * tz;
  };
}

/**
 * How much of the wetlands a point of the plain belongs to: 1 in Los Pantanos (north-west of the
 * highway and on the west bank of the river), 0 in the city.
 * @param {number} e City coordinates.
 * @param {number} n
 * @returns {number}
 */
export function wetlandFactor(e, n) {
  const highwayEast = Math.min(420 + Math.max(0, n - 660), 900);
  const north = smoothStep(700, 790, n) * (1 - smoothStep(-140, -20, e - highwayEast));
  const west = 1 - smoothStep(-1300, -1270, e);
  return Math.max(north, west);
}

/**
 * The height the hills of Las Lomas add at a point, before the coast flattens them.
 * @param {number} e City coordinates.
 * @param {number} n
 * @returns {number} Metres.
 */
export function hillHeight(e, n) {
  if (e < 250 || n < -420) return 0;
  // The main dome and a lower shoulder to its north-east.
  let de = (e - 1130) / 265;
  let dn = (n - 560) / 245;
  let falloff = (de * de + dn * dn) * 0.5;
  let height = falloff < 10 ? 41 * Math.exp(-falloff) : 0;
  de = (e - 1340) / 170;
  dn = (n - 900) / 170;
  falloff = (de * de + dn * dn) * 0.5;
  if (falloff < 10) height += 15 * Math.exp(-falloff);
  return height;
}

function shapeHeights(heights, distance, shoreCoordinate, shore, noise, minX, minZ, columns, rows) {
  const { eastX, eastZ, northX, northZ, seaFloorHeight } = CITY_FRAME;
  const { bank, rise, near, slope } = shore;
  for (let row = 0; row < rows; row += 1) {
    const z = minZ + row * CELL_SIZE;
    const base = row * columns;
    for (let column = 0; column < columns; column += 1) {
      const index = base + column;
      const d = distance[index];
      const coordinate = shoreCoordinate[index];
      const vertex = coordinate | 0;
      const t = coordinate - vertex;
      if (d < 0) {
        const depth = near[vertex] + (near[vertex + 1] - near[vertex]) * t + (slope[vertex] + (slope[vertex + 1] - slope[vertex]) * t) * -d;
        heights[index] = Math.max(seaFloorHeight, -depth);
        continue;
      }
      const x = minX + column * CELL_SIZE;
      const e = x * eastX + z * eastZ;
      const n = x * northX + z * northZ;
      const relief = noise(x, z, 310);
      const wet = wetlandFactor(e, n);
      const plain = 3.2 + relief * 0.5 + (0.9 + relief * 0.25 - 3.2 - relief * 0.5) * wet;
      const shoreBank = bank[vertex] + (bank[vertex + 1] - bank[vertex]) * t;
      const shoreRise = rise[vertex] + (rise[vertex + 1] - rise[vertex]) * t;
      let climb = d / shoreRise;
      climb = climb >= 1 ? 1 : climb * climb * (3 - 2 * climb);
      let height = shoreBank + (Math.max(plain, shoreBank) - shoreBank) * climb;
      const hill = hillHeight(e, n);
      if (hill > 0.05) {
        height += hill * smoothStep(0, 170, d) * (1 + noise(x, z, 140) * 0.05);
      }
      heights[index] = height;
    }
  }
}

function createFieldQueries(field) {
  const { minX, minZ, columns, rows, heights, distance, shoreCoordinate, shore } = field;
  const maxColumn = columns - 1;
  const maxRow = rows - 1;
  const { seaFloorHeight } = CITY_FRAME;

  const sample = (grid, x, z) => {
    let fx = (x - minX) / CELL_SIZE;
    let fz = (z - minZ) / CELL_SIZE;
    if (fx < 0) fx = 0;
    else if (fx > maxColumn) fx = maxColumn;
    if (fz < 0) fz = 0;
    else if (fz > maxRow) fz = maxRow;
    let column = fx | 0;
    let row = fz | 0;
    if (column >= maxColumn) column = maxColumn - 1;
    if (row >= maxRow) row = maxRow - 1;
    const tx = fx - column;
    const tz = fz - row;
    const index = row * columns + column;
    const top = grid[index] + (grid[index + 1] - grid[index]) * tx;
    const bottom = grid[index + columns] + (grid[index + columns + 1] - grid[index + columns]) * tx;
    return top + (bottom - top) * tz;
  };

  // How far a point lies outside the grid (0 inside it).
  const outside = (x, z) => {
    const ox = x < minX ? minX - x : x > minX + maxColumn * CELL_SIZE ? x - (minX + maxColumn * CELL_SIZE) : 0;
    const oz = z < minZ ? minZ - z : z > minZ + maxRow * CELL_SIZE ? z - (minZ + maxRow * CELL_SIZE) : 0;
    return ox === 0 && oz === 0 ? 0 : Math.hypot(ox, oz);
  };

  const heightAt = (x, z) => {
    const height = sample(heights, x, z);
    const beyond = outside(x, z);
    return beyond > 0 ? Math.max(seaFloorHeight, Math.min(height, 0) - beyond * 0.03) : height;
  };

  const nearestIndex = (x, z) => {
    const column = Math.max(0, Math.min(maxColumn, Math.round((x - minX) / CELL_SIZE)));
    const row = Math.max(0, Math.min(maxRow, Math.round((z - minZ) / CELL_SIZE)));
    return row * columns + column;
  };

  return {
    minX,
    minZ,
    cellSize: CELL_SIZE,
    columns,
    rows,
    heights,
    shoreDistance: distance,
    heightAt,
    normalAt(x, z, out = [0, 1, 0]) {
      const step = CELL_SIZE * 0.5;
      const gx = (heightAt(x + step, z) - heightAt(x - step, z)) / (2 * step);
      const gz = (heightAt(x, z + step) - heightAt(x, z - step)) / (2 * step);
      const inverse = 1 / Math.hypot(gx, 1, gz);
      out[0] = -gx * inverse;
      out[1] = inverse;
      out[2] = -gz * inverse;
      return out;
    },
    shoreDistanceAt: (x, z) => sample(distance, x, z) - outside(x, z),
    isWaterAt: (x, z) => heightAt(x, z) < 0,
    shoreKindAt: (x, z) => shore.kindNames[shore.kind[shoreCoordinate[nearestIndex(x, z)] | 0]],
    naturalSandAt(x, z) {
      const index = nearestIndex(x, z);
      const d = distance[index];
      return shore.sand[shore.kind[shoreCoordinate[index] | 0]] > 0 && d >= -2 && d < 96 ? 1 : 0;
    },
  };
}

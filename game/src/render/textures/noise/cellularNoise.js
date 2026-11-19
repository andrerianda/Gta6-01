// Cellular (Worley) noise on the CPU: for every texel, the distance to the nearest and second
// nearest of a set of jittered feature points, and which point is nearest. Stones, gravel,
// terrazzo chips, cracked mud, flakes and blotches are painted from it. The fields tile
// seamlessly. The fill works cell by cell, so the nine candidate points of a cell are fetched
// once for all of its texels.
//
//   const { nearest, second, cell } = createCellularNoiseFields(512, { period: 24, seed });
//   // nearest: 0 at a feature point; second - nearest: 0 on the borders between cells

import { hashGridCell } from '../../../core/random/coordinateHash.js';

/**
 * Creates the cellular noise fields.
 * @param {number} size Edge length in texels.
 * @param {Object} [options]
 * @param {number} [options.period] Feature points per tile edge (integer, default 8).
 * @param {number} [options.seed] Unsigned 32-bit seed.
 * @param {number} [options.jitter] 0 puts the points on a regular grid, 1 (default) anywhere in
 *   their cells.
 * @param {boolean} [options.withCells] Also return which point is nearest (default true).
 * @returns {{nearest: Float32Array, second: Float32Array, cell: Uint16Array | null, period: number}}
 *   Distances are in lattice cells (the mean spacing of the points is 1); `cell` is the index
 *   cy * period + cx of the nearest point, for per-stone colour or height.
 */
export function createCellularNoiseFields(size, options = {}) {
  const period = Math.max(1, Math.min(255, Math.round(options.period ?? 8)));
  const seed = options.seed ?? 0;
  const jitter = options.jitter ?? 1;
  const nearest = new Float32Array(size * size);
  const second = new Float32Array(size * size);
  const cell = options.withCells === false ? null : new Uint16Array(size * size);

  // Feature point of every lattice cell.
  const pointX = new Float32Array(period * period);
  const pointY = new Float32Array(period * period);
  for (let cy = 0; cy < period; cy += 1) {
    for (let cx = 0; cx < period; cx += 1) {
      const hash = hashGridCell(cx, cy, seed);
      pointX[cy * period + cx] = cx + 0.5 + ((hash & 0xffff) / 65536 - 0.5) * jitter;
      pointY[cy * period + cx] = cy + 0.5 + ((hash >>> 16) / 65536 - 0.5) * jitter;
    }
  }

  const candidateX = new Float32Array(9);
  const candidateY = new Float32Array(9);
  const candidateId = new Int32Array(9);
  const scale = period / size;
  for (let cy = 0; cy < period; cy += 1) {
    const yStart = Math.ceil(cy / scale - 0.5);
    const yEnd = Math.min(size, Math.ceil((cy + 1) / scale - 0.5));
    for (let cx = 0; cx < period; cx += 1) {
      const xStart = Math.ceil(cx / scale - 0.5);
      const xEnd = Math.min(size, Math.ceil((cx + 1) / scale - 0.5));
      // The nine points around this cell, moved by whole periods where the lattice wraps.
      let count = 0;
      for (let oy = -1; oy <= 1; oy += 1) {
        for (let ox = -1; ox <= 1; ox += 1) {
          const nx = cx + ox;
          const ny = cy + oy;
          const wx = ((nx % period) + period) % period;
          const wy = ((ny % period) + period) % period;
          const id = wy * period + wx;
          candidateX[count] = pointX[id] + (nx - wx);
          candidateY[count] = pointY[id] + (ny - wy);
          candidateId[count] = id;
          count += 1;
        }
      }
      for (let y = Math.max(0, yStart); y < yEnd; y += 1) {
        const py = (y + 0.5) * scale;
        let index = y * size + Math.max(0, xStart);
        for (let x = Math.max(0, xStart); x < xEnd; x += 1, index += 1) {
          const px = (x + 0.5) * scale;
          let first = 1e9;
          let next = 1e9;
          let id = 0;
          for (let k = 0; k < 9; k += 1) {
            const dx = candidateX[k] - px;
            const dy = candidateY[k] - py;
            const squared = dx * dx + dy * dy;
            if (squared < first) {
              next = first;
              first = squared;
              id = candidateId[k];
            } else if (squared < next) {
              next = squared;
            }
          }
          nearest[index] = Math.sqrt(first);
          second[index] = Math.sqrt(next);
          if (cell) cell[index] = id;
        }
      }
    }
  }
  return { nearest, second, cell, period };
}

/**
 * One sample of tiling cellular noise.
 * @param {number} x Position in lattice cells.
 * @param {number} y
 * @param {number} period Feature points per tile edge.
 * @param {number} [seed]
 * @returns {{nearest: number, second: number, cell: number}}
 */
export function cellularNoise2D(x, y, period, seed = 0) {
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  let first = 1e9;
  let next = 1e9;
  let id = 0;
  for (let oy = -1; oy <= 1; oy += 1) {
    for (let ox = -1; ox <= 1; ox += 1) {
      const nx = cx + ox;
      const ny = cy + oy;
      const wx = ((nx % period) + period) % period;
      const wy = ((ny % period) + period) % period;
      const hash = hashGridCell(wx, wy, seed);
      const dx = nx + 0.5 + ((hash & 0xffff) / 65536 - 0.5) - x;
      const dy = ny + 0.5 + ((hash >>> 16) / 65536 - 0.5) - y;
      const squared = dx * dx + dy * dy;
      if (squared < first) {
        next = first;
        first = squared;
        id = wy * period + wx;
      } else if (squared < next) {
        next = squared;
      }
    }
  }
  return { nearest: Math.sqrt(first), second: Math.sqrt(next), cell: id };
}

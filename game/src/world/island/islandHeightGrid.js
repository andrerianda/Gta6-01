// The Norvast island's heights baked on a 4 m grid in the island's own frame: the terrain meshes
// are cut from it, and the collision ground reads it (bilinear, so feet and wheels stand on what
// is drawn). Baking runs in slices (a generator for the job queue). No three.js: Node-testable.
import { NORVAST_ISLAND_SHAPE, islandHeightLocal } from './norvastIslandShape.js';

/** Grid step in metres. */
export const ISLAND_GRID_STEP = 4;

/**
 * Creates the (still empty) height grid of the island.
 * @returns {{ready: boolean, step: number, cols: number, rows: number, minU: number, minV: number,
 *   heights: Float32Array, bake: (rowsPerSlice?: number) => Generator<void, void, void>,
 *   at: (col: number, row: number) => number, heightLocal: (u: number, v: number) => number,
 *   normalLocal: (u: number, v: number, out: {x: number, y: number, z: number}) => {x: number, y: number, z: number}}}
 */
export function createIslandHeightGrid() {
  const { minU, maxU, minV, maxV } = NORVAST_ISLAND_SHAPE.bounds;
  const step = ISLAND_GRID_STEP;
  const cols = Math.round((maxU - minU) / step) + 1;
  const rows = Math.round((maxV - minV) / step) + 1;
  const heights = new Float32Array(cols * rows);

  const grid = {
    ready: false,
    step, cols, rows, minU, minV, heights,

    /** Fills the grid, a few rows per slice. */
    *bake(rowsPerSlice = 6) {
      for (let row = 0; row < rows; row += 1) {
        const v = minV + row * step;
        for (let col = 0; col < cols; col += 1) heights[row * cols + col] = islandHeightLocal(minU + col * step, v);
        if (row % rowsPerSlice === rowsPerSlice - 1) yield;
      }
      grid.ready = true;
    },

    /** The height at a grid point (clamped to the grid). */
    at(col, row) {
      const c = col < 0 ? 0 : col >= cols ? cols - 1 : col;
      const r = row < 0 ? 0 : row >= rows ? rows - 1 : row;
      return heights[r * cols + c];
    },

    /** The height at a place in the island frame: the grid once baked, the function before. */
    heightLocal(u, v) {
      const fu = (u - minU) / step, fv = (v - minV) / step;
      if (!(fu >= 0 && fv >= 0 && fu <= cols - 1 && fv <= rows - 1)) return islandHeightLocal(u, v);
      if (!grid.ready) return islandHeightLocal(u, v);
      const col = Math.min(cols - 2, Math.floor(fu)), row = Math.min(rows - 2, Math.floor(fv));
      const tu = fu - col, tv = fv - row;
      const index = row * cols + col;
      const a = heights[index], b = heights[index + 1], c = heights[index + cols], d = heights[index + cols + 1];
      // The cell's two triangles as the mesh cuts them (the diagonal runs from b to c).
      return tu + tv <= 1 ? a + (b - a) * tu + (c - a) * tv : d + (c - d) * (1 - tu) + (b - d) * (1 - tv);
    },

    /** The unit normal of the ground at a place in the island frame (x along u, z along v). */
    normalLocal(u, v, out) {
      const reach = step;
      const slopeU = (grid.heightLocal(u + reach, v) - grid.heightLocal(u - reach, v)) / (2 * reach);
      const slopeV = (grid.heightLocal(u, v + reach) - grid.heightLocal(u, v - reach)) / (2 * reach);
      const inverse = 1 / Math.sqrt(slopeU * slopeU + 1 + slopeV * slopeV);
      out.x = -slopeU * inverse;
      out.y = inverse;
      out.z = -slopeV * inverse;
      return out;
    },
  };
  return grid;
}

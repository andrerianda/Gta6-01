// The walking and driving surface of one built sector as a 1 m height raster: every road,
// junction, pavement, median and bridge deck triangle is rasterised into it as the sector is
// meshed, so ground queries answer the height people and cars actually see (the kerb step, the
// crown, the deck over the water) without casting a ray. NaN where nothing was built.

/**
 * Creates a raster over a square of the world.
 * @param {number} minX World X of the west edge.
 * @param {number} minZ World Z of the north edge.
 * @param {number} size Edge length in metres.
 * @param {number} [cellSize] Metres per cell; default 1.
 * @returns {{minX: number, minZ: number, size: number, cellSize: number, heights: Float32Array,
 *   addTriangle: (ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number) => void,
 *   heightAt: (x: number, z: number) => number}}
 */
export function createSurfaceHeightRaster(minX, minZ, size, cellSize = 1) {
  const cells = Math.round(size / cellSize);
  const heights = new Float32Array(cells * cells).fill(NaN);

  /** Writes the plane of a triangle into every cell whose centre lies inside it (highest wins). */
  function addTriangle(ax, ay, az, bx, by, bz, cx, cy, cz) {
    const area = (bx - ax) * (cz - az) - (cx - ax) * (bz - az);
    if (Math.abs(area) < 1e-9) return;
    const c0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - minX) / cellSize));
    const c1 = Math.min(cells - 1, Math.floor((Math.max(ax, bx, cx) - minX) / cellSize));
    const r0 = Math.max(0, Math.floor((Math.min(az, bz, cz) - minZ) / cellSize));
    const r1 = Math.min(cells - 1, Math.floor((Math.max(az, bz, cz) - minZ) / cellSize));
    for (let r = r0; r <= r1; r += 1) {
      const pz = minZ + (r + 0.5) * cellSize;
      for (let c = c0; c <= c1; c += 1) {
        const px = minX + (c + 0.5) * cellSize;
        const w1 = ((px - ax) * (cz - az) - (cx - ax) * (pz - az)) / area;
        const w2 = ((bx - ax) * (pz - az) - (px - ax) * (bz - az)) / area;
        const w0 = 1 - w1 - w2;
        if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;
        const y = w0 * ay + w1 * by + w2 * cy;
        const index = r * cells + c;
        const previous = heights[index];
        if (!(previous >= y)) heights[index] = y;
      }
    }
  }

  return {
    minX, minZ, size, cellSize, heights,
    addTriangle,
    /** The rasterised surface height at a point, or NaN where nothing was built. */
    heightAt(x, z) {
      const c = Math.floor((x - minX) / cellSize);
      const r = Math.floor((z - minZ) / cellSize);
      if (c < 0 || r < 0 || c >= cells || r >= cells) return NaN;
      return heights[r * cells + c];
    },
  };
}

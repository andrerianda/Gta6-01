// A square of the city's pavement obstacle circles round the focus, bucketed into a grid of
// small cells, so each walker's look round costs a few cells instead of a scan of every circle
// the dressing holds (tens of thousands). Rebuilt from the dressing's obstaclesNear when the
// focus has moved on or every few seconds (sectors stream in and out); the nearest circles go
// first into a person's list.

/** Cell size, metres. */
export const OBSTACLE_CELL = 4;

/**
 * Creates an empty obstacle grid.
 * @returns {{ count: number, rebuild: Function, covers: Function, query: Function }}
 */
export function createObstacleGrid() {
  let xs = new Float32Array(1024), zs = new Float32Array(1024), rs = new Float32Array(1024);
  /** Cell key -> circle indices. */
  const cells = new Map();
  const spare = [];
  // The nearest candidates of a query: index and squared gap.
  const pickIndex = new Int32Array(64), pickGap = new Float32Array(64);
  let minX = 0, minZ = 0, maxX = -1, maxZ = -1;

  const keyOf = (cx, cz) => cx * 73856093 + cz * 19349663;

  const grid = {
    /** Circles held. */
    count: 0,
    /**
     * Holds the circles ({x, z, radius}) of a square of half size `half` round cx, cz.
     * @param {Array<{x: number, z: number, radius: number}>} circles
     */
    rebuild(circles, cx, cz, half) {
      for (const list of cells.values()) { list.length = 0; spare.push(list); }
      cells.clear();
      if (circles.length > xs.length) {
        const size = 1 << Math.ceil(Math.log2(circles.length));
        xs = new Float32Array(size); zs = new Float32Array(size); rs = new Float32Array(size);
      }
      minX = cx - half; maxX = cx + half; minZ = cz - half; maxZ = cz + half;
      grid.count = 0;
      for (const c of circles) {
        if (c.x < minX || c.x > maxX || c.z < minZ || c.z > maxZ) continue;
        const i = grid.count;
        xs[i] = c.x; zs[i] = c.z; rs[i] = c.radius;
        grid.count += 1;
        const key = keyOf(Math.floor(c.x / OBSTACLE_CELL), Math.floor(c.z / OBSTACLE_CELL));
        let list = cells.get(key);
        if (!list) { list = spare.pop() || []; cells.set(key, list); }
        list.push(i);
      }
    },
    /** Whether a circle of `radius` round x, z lies inside the square held. */
    covers(x, z, radius) {
      return x - radius >= minX && x + radius <= maxX && z - radius >= minZ && z + radius <= maxZ;
    },
    /**
     * Calls push(x, z, radius) for the circles whose edge comes within `radius` of x, z, the
     * nearest first, at most `limit` of them; returns how many.
     */
    query(x, z, radius, limit, push) {
      let found = 0;
      const c0 = Math.floor((x - radius - 1) / OBSTACLE_CELL), c1 = Math.floor((x + radius + 1) / OBSTACLE_CELL);
      const r0 = Math.floor((z - radius - 1) / OBSTACLE_CELL), r1 = Math.floor((z + radius + 1) / OBSTACLE_CELL);
      for (let cx = c0; cx <= c1; cx += 1) {
        for (let cz = r0; cz <= r1; cz += 1) {
          const list = cells.get(keyOf(cx, cz));
          if (!list) continue;
          for (let k = 0; k < list.length; k += 1) {
            const i = list[k];
            const gap = Math.hypot(xs[i] - x, zs[i] - z) - rs[i];
            if (gap > radius) continue;
            // Keep the candidates sorted by gap (insertion; a handful at most).
            let at = Math.min(found, pickIndex.length - 1);
            if (found === pickIndex.length && gap >= pickGap[at]) continue;
            while (at > 0 && pickGap[at - 1] > gap) { pickIndex[at] = pickIndex[at - 1]; pickGap[at] = pickGap[at - 1]; at -= 1; }
            pickIndex[at] = i; pickGap[at] = gap;
            if (found < pickIndex.length) found += 1;
          }
        }
      }
      const count = Math.min(found, limit);
      for (let k = 0; k < count; k += 1) { const i = pickIndex[k]; push(xs[i], zs[i], rs[i]); }
      return count;
    },
  };
  return grid;
}

// Obstacle index: the walkers' obstacle circles of every built sector (trunks, pits, poles,
// signals, shelters, clutter, crane legs), found by sector and then by a 16 m cell grid inside
// it, so a query looks at a few dozen circles instead of every circle in the city (~29k).
// Nothing is allocated per query.
//
//   const index = createObstacleIndex();
//   const handle = index.add(circles);      // {x, z, radius, kind}[] of one sector
//   index.near(x, z, radius, out);          // out filled with the circles within radius
//   handle.dispose();

/** Cell size of the grid inside a sector (metres). */
export const OBSTACLE_CELL = 16;

/**
 * Creates an empty index.
 * @returns {{add: (circles: {x: number, z: number, radius: number}[]) => {dispose: () => void},
 *   near: (x: number, z: number, radius: number, out?: object[]) => object[], count: () => number}}
 */
export function createObstacleIndex() {
  const sets = new Set();

  function build(circles) {
    let minX = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxZ = -Infinity;
    let reach = 0;
    for (const circle of circles) {
      if (circle.x < minX) minX = circle.x;
      if (circle.z < minZ) minZ = circle.z;
      if (circle.x > maxX) maxX = circle.x;
      if (circle.z > maxZ) maxZ = circle.z;
      if (circle.radius > reach) reach = circle.radius;
    }
    const columns = Math.max(1, Math.floor((maxX - minX) / OBSTACLE_CELL) + 1);
    const rows = Math.max(1, Math.floor((maxZ - minZ) / OBSTACLE_CELL) + 1);
    const cells = Array.from({ length: columns * rows }, () => []);
    for (const circle of circles) {
      const column = Math.floor((circle.x - minX) / OBSTACLE_CELL);
      const row = Math.floor((circle.z - minZ) / OBSTACLE_CELL);
      cells[row * columns + column].push(circle);
    }
    return { minX, minZ, maxX, maxZ, reach, columns, rows, cells, count: circles.length };
  }

  return {
    add(circles) {
      const set = circles.length ? build(circles) : null;
      if (set) sets.add(set);
      return { dispose: () => { if (set) sets.delete(set); } };
    },
    near(x, z, radius = 30, out = []) {
      out.length = 0;
      for (const set of sets) {
        const margin = radius + set.reach;
        if (x < set.minX - margin || x > set.maxX + margin || z < set.minZ - margin || z > set.maxZ + margin) continue;
        const c0 = Math.max(0, Math.floor((x - margin - set.minX) / OBSTACLE_CELL));
        const c1 = Math.min(set.columns - 1, Math.floor((x + margin - set.minX) / OBSTACLE_CELL));
        const r0 = Math.max(0, Math.floor((z - margin - set.minZ) / OBSTACLE_CELL));
        const r1 = Math.min(set.rows - 1, Math.floor((z + margin - set.minZ) / OBSTACLE_CELL));
        for (let row = r0; row <= r1; row += 1) {
          for (let column = c0; column <= c1; column += 1) {
            for (const circle of set.cells[row * set.columns + column]) {
              const limit = radius + circle.radius;
              if ((circle.x - x) ** 2 + (circle.z - z) ** 2 <= limit * limit) out.push(circle);
            }
          }
        }
      }
      return out;
    },
    count() {
      let total = 0;
      for (const set of sets) total += set.count;
      return total;
    },
  };
}

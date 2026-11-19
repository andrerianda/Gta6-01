// The driving lanes of the city plan, for the crowd: whether a point stands on a road's
// carriageway (between its kerbs, plan.roads.segments with their halfWidth), so people who stop
// to talk, gawk, phone or wait are never left standing in the traffic lane. Crossings are the
// routes' crosswalk edges and are judged by the caller (people walk over them on the walk
// phase). A coarse grid of cells holds the pieces of centre line near each cell; pure, no
// allocation per query.

/** Grid cell size, metres. */
const CELL = 16;
/** Metres inside the kerb a point must be to count as in the lane (the gutter is forgiven). */
export const KERB_MARGIN = 0.35;

/**
 * Builds the carriageway test for a plan's road segments.
 * @param {{points: number[], halfWidth: number}[]} segments plan.roads.segments (flat x, z points).
 */
export function createCarriageway(segments = []) {
  /** Cell key -> flat list of pieces [x0, z0, x1, z1, halfWidth, ...]. */
  const cells = new Map();
  const keyOf = (cx, cz) => cx * 73856093 + cz * 19349663;
  for (const segment of segments) {
    const p = segment.points, half = segment.halfWidth;
    if (!p || p.length < 4 || !(half > KERB_MARGIN)) continue;
    for (let i = 0; i + 3 < p.length; i += 2) {
      const x0 = p[i], z0 = p[i + 1], x1 = p[i + 2], z1 = p[i + 3];
      const minX = Math.floor((Math.min(x0, x1) - half) / CELL), maxX = Math.floor((Math.max(x0, x1) + half) / CELL);
      const minZ = Math.floor((Math.min(z0, z1) - half) / CELL), maxZ = Math.floor((Math.max(z0, z1) + half) / CELL);
      for (let cx = minX; cx <= maxX; cx += 1) {
        for (let cz = minZ; cz <= maxZ; cz += 1) {
          const key = keyOf(cx, cz);
          let list = cells.get(key);
          if (!list) { list = []; cells.set(key, list); }
          list.push(x0, z0, x1, z1, half);
        }
      }
    }
  }

  return {
    /**
     * True when x, z is on a carriageway, more than KERB_MARGIN inside its kerb.
     * @param {number} x
     * @param {number} z
     */
    contains(x, z) {
      const list = cells.get(keyOf(Math.floor(x / CELL), Math.floor(z / CELL)));
      if (!list) return false;
      for (let i = 0; i < list.length; i += 5) {
        const x0 = list[i], z0 = list[i + 1], dx = list[i + 2] - x0, dz = list[i + 3] - z0;
        const inside = list[i + 4] - KERB_MARGIN;
        const lengthSq = dx * dx + dz * dz;
        const t = lengthSq > 0 ? Math.max(0, Math.min(1, ((x - x0) * dx + (z - z0) * dz) / lengthSq)) : 0;
        const ox = x - (x0 + dx * t), oz = z - (z0 + dz * t);
        if (ox * ox + oz * oz < inside * inside) return true;
      }
      return false;
    },
  };
}

// "Where am I" for every system: ground height (the built street surface where a sector is
// streamed in, the plan's height field elsewhere), district, nearest road and lane, street name,
// and spawn points for cars, parked cars and people near a position. Reads the city plan and the
// height rasters of the built sectors; allocates nothing per call except the spawn lists.
//
//   const queries = createCityQueries(plan, { surfaceHeightAt });
//   queries.groundHeightAt(x, z);                       // what a foot or a tyre stands on
//   queries.spawnPointsNear(x, z, 120, 'vehicle');      // [{x, y, z, heading, lane}]

/**
 * Creates the query functions.
 * @param {Object} plan The city plan (game/src/world/plan/).
 * @param {{surfaceHeightAt?: (x: number, z: number) => number}} [built] The built surface: a
 *   height or NaN where no sector raster covers the point.
 */
export function createCityQueries(plan, built = {}) {
  const grid = plan.sectors;
  const surfaceHeightAt = built.surfaceHeightAt ?? (() => NaN);
  const lanesBySegment = plan.roads.segments.map(() => []);
  for (const lane of plan.lanes) lanesBySegment[lane.segment].push(lane);
  /** Pavement edges by sector cell (of their middle point). */
  const edgesByCell = new Map();
  for (const edge of plan.pedestrianGraph.edges) {
    const p = edge.points;
    const middle = (p.length >> 2) * 2;
    const cell = cellIndex(p[middle], p[middle + 1]);
    if (cell < 0) continue;
    if (!edgesByCell.has(cell)) edgesByCell.set(cell, []);
    edgesByCell.get(cell).push(edge);
  }

  function cellIndex(x, z) {
    const c = Math.floor((x - grid.minX) / grid.size);
    const r = Math.floor((z - grid.minZ) / grid.size);
    return c < 0 || r < 0 || c >= grid.columns || r >= grid.rows ? -1 : r * grid.columns + c;
  }

  function groundHeightAt(x, z) {
    const surface = surfaceHeightAt(x, z);
    return surface === surface ? surface : plan.heightAt(x, z);
  }

  /** Calls visit(cellIndex) for every sector cell within radius of a point. */
  function forCellsNear(x, z, radius, visit) {
    const c0 = Math.max(0, Math.floor((x - radius - grid.minX) / grid.size));
    const c1 = Math.min(grid.columns - 1, Math.floor((x + radius - grid.minX) / grid.size));
    const r0 = Math.max(0, Math.floor((z - radius - grid.minZ) / grid.size));
    const r1 = Math.min(grid.rows - 1, Math.floor((z + radius - grid.minZ) / grid.size));
    for (let r = r0; r <= r1; r += 1) for (let c = c0; c <= c1; c += 1) visit(r * grid.columns + c);
  }

  /** Pushes the points of a polyline within reach, with the heading of travel along it. */
  function pushPolylinePoints(points, x, z, radiusSquared, out, extra, limit) {
    for (let i = 0; i + 3 < points.length && out.length < limit; i += 2) {
      const px = points[i];
      const pz = points[i + 1];
      const dx = px - x;
      const dz = pz - z;
      if (dx * dx + dz * dz > radiusSquared) continue;
      const tx = points[i + 2] - px;
      const tz = points[i + 3] - pz;
      out.push({ x: px, y: groundHeightAt(px, pz), z: pz, heading: Math.atan2(-tx, -tz), ...extra });
    }
  }

  return {
    groundHeightAt,
    /** The plan's continuous ground (road level under streets, no kerbs or decks). */
    terrainHeightAt: plan.heightAt,
    districtAt: plan.districtAt,
    nearestRoad: plan.nearestRoad,
    nearestLane: plan.nearestLane,
    streetNameAt: plan.streetNameAt,
    surfaceAt: plan.surfaceAt,
    isWaterAt: plan.isWaterAt,

    /**
     * Places near a point where something can appear: 'vehicle' (on traffic lanes, facing the
     * direction of travel), 'parked' (kerbside spaces and car-park bays) or 'pedestrian' (on
     * pavements, crossings and paths). Headings follow three.js (0 faces north, left positive).
     * @param {number} x
     * @param {number} z
     * @param {number} radius Metres.
     * @param {'vehicle'|'parked'|'pedestrian'} [kind]
     * @param {number} [limit] Most points returned; default 256.
     * @returns {{x: number, y: number, z: number, heading: number, lane?: Object, spot?: Object, edge?: Object}[]}
     */
    spawnPointsNear(x, z, radius, kind = 'vehicle', limit = 256) {
      const out = [];
      const radiusSquared = radius * radius;
      const seen = new Set();
      forCellsNear(x, z, radius, (cell) => {
        if (out.length >= limit) return;
        const sector = grid.cells[cell];
        if (kind === 'parked') {
          for (const id of sector.parking) {
            const spot = plan.parkingSpots[id];
            const dx = spot.x - x;
            const dz = spot.z - z;
            if (dx * dx + dz * dz > radiusSquared || out.length >= limit) continue;
            out.push({ x: spot.x, y: groundHeightAt(spot.x, spot.z), z: spot.z, heading: Math.atan2(-spot.dirX, -spot.dirZ), spot });
          }
        } else if (kind === 'pedestrian') {
          for (const edge of edgesByCell.get(cell) ?? []) pushPolylinePoints(edge.points, x, z, radiusSquared, out, { edge }, limit);
        } else {
          for (const id of sector.segments) {
            if (seen.has(id)) continue;
            seen.add(id);
            for (const lane of lanesBySegment[id]) pushPolylinePoints(lane.points, x, z, radiusSquared, out, { lane }, limit);
          }
        }
      });
      return out;
    },
  };
}

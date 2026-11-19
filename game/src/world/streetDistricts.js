// Which district a place belongs to, as the road plan built it. The plan draws the nine districts
// as polygons (plan.districtAt) and gives every street segment one district (the polygon's at the
// segment's middle) and every lot its street's district. Where a district boundary runs along or
// through a street, the polygon alone names two districts for one street: Calle Iguana (Barrio
// Hierro) has its south pavement and part of its carriageway inside La Marisma's polygon, so the
// location card read "La Marisma" in the middle of a Barrio Hierro street. This lookup answers
// what the plan built: a lot's district inside a lot, the street's district on its carriageway
// and pavements (to the building line), the polygon's elsewhere. Only cells beside such boundary
// streets ask the road plan (a few microseconds); everywhere else it is the polygon test.
//
//   const districtAt = createStreetDistrictLookup(plan);
//   districtAt(x, z);   // 'barrio_hierro' on both pavements of Calle Iguana

/** Cell size of the boundary-street mask, metres. */
export const STREET_DISTRICT_CELL = 16;
/** Beyond the back of the pavement a point still belongs to the street (doorsteps, building line). */
export const STREET_DISTRICT_MARGIN = 1.5;
/** Spacing of the samples along a street when the mask is built, metres. */
const SAMPLE_STEP = 4;

/**
 * How far from its centre line a segment's street reaches: half the carriageway, the wider
 * pavement and the margin.
 * @param {{halfWidth?: number, width?: number, sidewalkLeft?: number, sidewalkRight?: number}} segment
 * @returns {number} Metres.
 */
export function streetReachOf(segment) {
  const half = segment.halfWidth ?? (segment.width ?? 0) / 2;
  return half + Math.max(segment.sidewalkLeft ?? 0, segment.sidewalkRight ?? 0) + STREET_DISTRICT_MARGIN;
}

/**
 * Builds the district lookup over a city plan.
 * @param {{districtAt: (x: number, z: number) => string, sectors: {minX: number, minZ: number, size: number, columns: number, rows: number},
 *   roads: {segments: {points: number[], district?: string|null}[]}, lotAt?: (x: number, z: number) => ?{district?: string},
 *   nearestRoad?: (x: number, z: number, maxDistance?: number) => ?{segment: object, distance: number}}} plan
 * @returns {(x: number, z: number) => string|null} districtAt
 */
export function createStreetDistrictLookup(plan) {
  const regionAt = plan.districtAt;
  const grid = plan.sectors;
  const columns = Math.ceil((grid.columns * grid.size) / STREET_DISTRICT_CELL);
  const rows = Math.ceil((grid.rows * grid.size) / STREET_DISTRICT_CELL);
  const mask = new Uint8Array(columns * rows);
  const lotAt = typeof plan.lotAt === 'function' ? plan.lotAt : null;
  const nearestRoad = typeof plan.nearestRoad === 'function' ? plan.nearestRoad : null;
  let maxReach = 0;

  const cellOf = (x, z) => {
    const c = Math.floor((x - grid.minX) / STREET_DISTRICT_CELL);
    const r = Math.floor((z - grid.minZ) / STREET_DISTRICT_CELL);
    return c < 0 || r < 0 || c >= columns || r >= rows ? -1 : r * columns + c;
  };

  /** Calls visit(x, z, nx, nz) every SAMPLE_STEP metres along a flat polyline (n: unit normal). */
  const alongPolyline = (points, visit) => {
    for (let i = 0; i + 3 < points.length; i += 2) {
      const ax = points[i];
      const az = points[i + 1];
      const dx = points[i + 2] - ax;
      const dz = points[i + 3] - az;
      const length = Math.hypot(dx, dz);
      if (!(length > 1e-6)) continue;
      const steps = Math.max(1, Math.ceil(length / SAMPLE_STEP));
      for (let s = 0; s <= steps; s += 1) {
        if (visit(ax + (dx * s) / steps, az + (dz * s) / steps, -dz / length, dx / length)) return true;
      }
    }
    return false;
  };

  // A street whose carriageway or pavements leave its own district's polygon anywhere.
  const crossesBoundary = (segment, reach) => alongPolyline(segment.points, (x, z, nx, nz) => {
    for (let k = -2; k <= 2; k += 1) {
      const o = (reach * k) / 2;
      if (regionAt(x + nx * o, z + nz * o) !== segment.district) return true;
    }
    return false;
  });

  const markAround = (x, z, radius) => {
    const c0 = Math.max(0, Math.floor((x - radius - grid.minX) / STREET_DISTRICT_CELL));
    const c1 = Math.min(columns - 1, Math.floor((x + radius - grid.minX) / STREET_DISTRICT_CELL));
    const r0 = Math.max(0, Math.floor((z - radius - grid.minZ) / STREET_DISTRICT_CELL));
    const r1 = Math.min(rows - 1, Math.floor((z + radius - grid.minZ) / STREET_DISTRICT_CELL));
    for (let r = r0; r <= r1; r += 1) for (let c = c0; c <= c1; c += 1) mask[r * columns + c] = 1;
  };

  if (nearestRoad) {
    for (const segment of plan.roads?.segments ?? []) {
      const points = segment.points;
      if (!segment.district || !points || typeof points[0] !== 'number') continue;
      const reach = streetReachOf(segment);
      if (!crossesBoundary(segment, reach)) continue;
      maxReach = Math.max(maxReach, reach);
      alongPolyline(points, (x, z) => markAround(x, z, reach + 1));
    }
  }

  return function districtAt(x, z) {
    const lot = lotAt ? lotAt(x, z) : null;
    if (lot && lot.district) return lot.district;
    const cell = cellOf(x, z);
    if (cell >= 0 && mask[cell] === 1) {
      const road = nearestRoad(x, z, maxReach);
      if (road && road.segment.district && road.distance <= streetReachOf(road.segment)) return road.segment.district;
    }
    return regionAt(x, z);
  };
}

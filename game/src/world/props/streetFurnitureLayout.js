// Street furniture layout: where the lamps stand along every road (as plain data). Positions
// are measured from each segment's start, so a lamp is the same whichever sector asks, and a
// sector keeps only the items inside its bounds. No three.js: Node tests it.

/** Lamp object, spacing (metres) and placement per streetscape. */
export const LAMP_RULES = Object.freeze({
  highway: { object: 'lamp_avenue', spacing: 48, median: true },
  bridge: { object: 'lamp_arm', spacing: 32, sides: true },
  palm_median: { object: 'lamp_arm', spacing: 30, sides: true },
  palms: { object: 'lamp_arm', spacing: 30, sides: true },
  tree_median: { object: 'lamp_arm', spacing: 30, sides: true },
  trees: { object: 'lamp_arm', spacing: 32, sides: true },
  plain: { object: 'lamp_arm', spacing: 34, sides: true, staggered: true },
  old_town: { object: 'lamp_arm', spacing: 26, sides: true, staggered: true },
  hillside: { object: 'lamp_arm', spacing: 38, sides: true, staggered: true },
  industrial: { object: 'utility_pole', spacing: 40, sides: true, staggered: true },
  rural: { object: 'utility_pole', spacing: 46, sides: true, staggered: true },
  track: null,
});

/**
 * Tests whether a point lies in a sector's bounds (any of the usual shapes; no bounds = yes).
 * @param {object | number[] | undefined} bounds {minX, minZ, maxX, maxZ}, {min: {x, z}, max: {x, z}}
 *   or [minX, minZ, maxX, maxZ].
 * @param {number} x World x.
 * @param {number} z World z.
 * @returns {boolean}
 */
export function insideBounds(bounds, x, z) {
  if (!bounds) return true;
  const box = normaliseBounds(bounds);
  return x >= box.minX && x < box.maxX && z >= box.minZ && z < box.maxZ;
}

/**
 * Bounds in one shape.
 * @param {object | number[]} bounds Any of the shapes insideBounds takes.
 * @returns {{minX: number, minZ: number, maxX: number, maxZ: number}}
 */
export function normaliseBounds(bounds) {
  if (Array.isArray(bounds)) return { minX: bounds[0], minZ: bounds[1], maxX: bounds[2], maxZ: bounds[3] };
  if (bounds.min && bounds.max) return { minX: bounds.min.x, minZ: bounds.min.z ?? bounds.min.y, maxX: bounds.max.x, maxZ: bounds.max.z ?? bounds.max.y };
  return { minX: bounds.minX ?? bounds.x ?? 0, minZ: bounds.minZ ?? bounds.z ?? 0, maxX: bounds.maxX ?? (bounds.x + bounds.size), maxZ: bounds.maxZ ?? (bounds.z + bounds.size) };
}

/**
 * Walks a segment's centre line and calls back at regular distances.
 * @param {{points: ArrayLike<number>}} segment A plan segment (flat x, z points).
 * @param {number} start First distance from the segment start.
 * @param {number} end Last distance.
 * @param {number} spacing Metres between calls.
 * @param {(x: number, z: number, dx: number, dz: number, along: number, index: number) => void} visit
 *   Called with the point, the unit direction and the distance.
 */
export function walkSegment(segment, start, end, spacing, visit) {
  const p = segment.points;
  let travelled = 0;
  let next = start;
  let index = 0;
  for (let i = 0; i + 3 < p.length; i += 2) {
    const ax = p[i]; const az = p[i + 1];
    const bx = p[i + 2]; const bz = p[i + 3];
    const length = Math.hypot(bx - ax, bz - az);
    if (length < 1e-6) continue;
    const dx = (bx - ax) / length;
    const dz = (bz - az) / length;
    while (next <= travelled + length && next <= end) {
      const t = next - travelled;
      visit(ax + dx * t, az + dz * t, dx, dz, next, index);
      index += 1;
      next += spacing;
    }
    travelled += length;
  }
}

/**
 * Lamps along one segment.
 * @param {object} segment A plan segment (points, streetscape, halfWidth, medianWidth,
 *   sidewalkLeft, sidewalkRight, trimA, trimB, length, bridge).
 * @param {{bounds?: object, density?: number}} [options] Keep only items in the bounds; density
 *   (quality propDensity) stretches the spacing.
 * @returns {{object: string, x: number, z: number, rotationY: number, segment: number}[]} Each
 *   lamp: its set object, its foot and a rotation that turns its arm (-Z) over the road.
 */
export function layOutStreetLamps(segment, options = {}) {
  const rule = LAMP_RULES[segment.bridge ? 'bridge' : segment.streetscape] ?? LAMP_RULES.plain;
  if (!rule || segment.paved === false) return [];
  const density = Math.max(0.3, options.density ?? 1);
  const spacing = rule.spacing / density;
  const start = (segment.trimA ?? 0) + spacing * 0.35;
  const end = (segment.length ?? Infinity) - (segment.trimB ?? 0) - 4;
  const items = [];
  walkSegment(segment, start, end, spacing, (x, z, dx, dz, along, index) => {
    const leftX = dz;
    const leftZ = -dx;
    if (rule.median && (segment.medianWidth ?? 0) >= 1.5) {
      if (insideBounds(options.bounds, x, z)) items.push({ object: rule.object, x, z, rotationY: Math.atan2(leftX, leftZ), segment: segment.id });
      return;
    }
    for (const side of [-1, 1]) {
      if (rule.staggered && (index % 2 === 0) !== (side > 0)) continue;
      const sidewalk = side > 0 ? segment.sidewalkLeft : segment.sidewalkRight;
      // The pole stands fully on the pavement: its face 0.6 m or more behind the kerb.
      const offset = (segment.halfWidth ?? 4) + Math.max(0.95, Math.min(1.3, (sidewalk ?? 0) * 0.3));
      const px = x + leftX * offset * side;
      const pz = z + leftZ * offset * side;
      if (!insideBounds(options.bounds, px, pz)) continue;
      // The arm reaches along the object's -Z: turn -Z towards the road centre (-side * left).
      const towardX = -leftX * side;
      const towardZ = -leftZ * side;
      items.push({ object: rule.object, x: px, z: pz, rotationY: Math.atan2(-towardX, -towardZ), segment: segment.id });
    }
  });
  return items;
}

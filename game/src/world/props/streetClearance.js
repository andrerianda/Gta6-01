// Street clearance: answers whether a trunk, pole or sign of a given radius may stand at a point,
// from the same cross-section the street builder uses (streets/roadSampling.js roadCrossSection):
// never on a carriageway (lanes, parking, shoulders, the junction areas past the trims), at least
// `kerbMargin` metres inside the kerb, and on a median only where a median is built, clear of its
// kerbs. Pure; a spatial hash of the plan's road pieces makes a query a few dozen projections.
//
//   const clearance = createStreetClearance(plan);
//   clearance.isClear(x, z, 0.3)   // false on asphalt, true on pavement, verge or planted median
import { roadCrossSection } from '../streets/roadSampling.js';

const CELL = 32;

/**
 * Builds the clearance test of a plan.
 * @param {{roads: {segments: object[], nodes?: object[]}}} plan The city plan.
 * @param {{kerbMargin?: number}} [options] Metres a trunk keeps from a kerb face (default 0.6).
 * @returns {{isClear: (x: number, z: number, radius?: number) => boolean,
 *   carriagewayAt: (x: number, z: number, radius?: number) => object | null}}
 */
export function createStreetClearance(plan, options = {}) {
  const kerbMargin = options.kerbMargin ?? 0.6;
  const cells = new Map();
  const segments = plan.roads?.segments ?? [];
  for (const segment of segments) {
    const points = segment.points ?? [];
    if (points.length < 4) continue;
    const section = roadCrossSection(segment);
    const reach = section.halfWidth + 2;
    let along = 0;
    for (let i = 0; i + 3 < points.length; i += 2) {
      const ax = points[i]; const az = points[i + 1];
      const bx = points[i + 2]; const bz = points[i + 3];
      const length = Math.hypot(bx - ax, bz - az);
      if (length < 1e-6) continue;
      const piece = { segment, section, ax, az, ux: (bx - ax) / length, uz: (bz - az) / length, length, along, last: i + 4 >= points.length };
      along += length;
      const minX = Math.floor((Math.min(ax, bx) - reach) / CELL);
      const maxX = Math.floor((Math.max(ax, bx) + reach) / CELL);
      const minZ = Math.floor((Math.min(az, bz) - reach) / CELL);
      const maxZ = Math.floor((Math.max(az, bz) + reach) / CELL);
      for (let cx = minX; cx <= maxX; cx += 1) {
        for (let cz = minZ; cz <= maxZ; cz += 1) {
          const key = cx * 100003 + cz;
          let list = cells.get(key);
          if (!list) cells.set(key, (list = []));
          list.push(piece);
        }
      }
    }
  }
  const junctions = (plan.roads?.nodes ?? []).filter((node) => (node.arms?.length ?? node.segments?.length ?? 0) >= 3);
  const junctionCells = new Map();
  for (const node of junctions) {
    // The core of the junction box: within the shortest arm trim of the centre. (Its arms'
    // trim zones are asphalt across the road's width, tested above; the corner pavements stay.)
    const core = { x: node.x, z: node.z, id: node.id, radius: Math.min(...(node.arms ?? []).map((arm) => arm.trim ?? 0), node.radius ?? Infinity) };
    const reach = core.radius + 2;
    for (let cx = Math.floor((node.x - reach) / CELL); cx <= Math.floor((node.x + reach) / CELL); cx += 1) {
      for (let cz = Math.floor((node.z - reach) / CELL); cz <= Math.floor((node.z + reach) / CELL); cz += 1) {
        const key = cx * 100003 + cz;
        if (!junctionCells.has(key)) junctionCells.set(key, []);
        junctionCells.get(key).push(core);
      }
    }
  }

  /** The carriageway (segment and lateral offset) a disc of `radius` at x, z touches, or null. */
  function carriagewayAt(x, z, radius = 0.3) {
    const pieces = cells.get(Math.floor(x / CELL) * 100003 + Math.floor(z / CELL));
    if (pieces) {
      for (const piece of pieces) {
        const px = x - piece.ax;
        const pz = z - piece.az;
        const t = px * piece.ux + pz * piece.uz;
        if (t < -0.01 || (t > piece.length + 0.01 && !piece.last) || t > piece.length + 2) continue;
        // s: metres right of the centre line, right = (-uz, ux), as the street builder offsets.
        const s = -px * piece.uz + pz * piece.ux;
        const { section, segment } = piece;
        if (Math.abs(s) >= section.halfWidth + radius + kerbMargin) continue;
        const along = piece.along + t;
        const inJunction = along < (segment.trimA ?? 0) || along > (segment.length ?? Infinity) - (segment.trimB ?? 0);
        const median = section.median;
        if (!inJunction && median && s - radius - kerbMargin >= median[0] && s + radius + kerbMargin <= median[1]) continue;
        return { segment: segment.id, s, along, inJunction };
      }
    }
    // The junction areas: the core of the box is asphalt or crosswalk.
    const nodes = junctionCells.get(Math.floor(x / CELL) * 100003 + Math.floor(z / CELL));
    if (nodes) {
      for (const node of nodes) {
        if (Math.hypot(x - node.x, z - node.z) < node.radius + radius) return { node: node.id, inJunction: true };
      }
    }
    return null;
  }

  return {
    carriagewayAt,
    isClear: (x, z, radius = 0.3) => carriagewayAt(x, z, radius) === null,
  };
}

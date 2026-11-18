// The one source of truth for what lies at any point of Marazul's streets, from the very numbers
// and layouts the street builder meshes (roadCrossSection, KERB_TOP_WIDTH, layOutJunction, the
// sampled centre lines): carriageway, planted median, kerb, pavement, verge, zebra crossing,
// junction surface, or ordinary ground. The city dressing places trees, lamps and props with it
// (pavements, verges and medians only), traffic and pedestrians can ask it too. Pure: no three.js.
//
//   const streets = createStreetSurfaceQuery(plan, lines, sections);
//   const hit = streets.surfaceAt(x, z);          // { kind, segment, node, along, offset, side, ... }
//   const numbers = streets.crossSection(segmentId); // carriageways, median, kerbs, pavements, verges
//
// Offsets are metres right of the segment's centre line looking from its first point to its last
// (right of direction (dx, dz) is (-dz, dx)); negative is left. A segment's centre line is the
// plan's (segment.points), so the cross-section is not symmetric where parking or a median sits
// off centre: always use the numbers, never halfWidth / 2.

import { KERB_HEIGHT, KERB_TOP_WIDTH } from './roadSampling.js';
import { layOutJunction } from './junctionLayout.js';

/** Every kind surfaceAt answers. */
export const STREET_SURFACE_KINDS = Object.freeze(['carriageway', 'median', 'kerb', 'pavement', 'verge', 'crosswalk', 'junction', 'ground']);

const HASH_CELL = 32;

/**
 * The cross-section numbers of one segment exactly as the street builder builds it.
 * @param {Object} segment A plan segment.
 * @param {import('./roadSampling.js').RoadCrossSection} section Its roadCrossSection.
 * @returns {{segment: number, halfWidth: number, carriageways: {from: number, to: number, width: number}[],
 *   median: ?{from: number, to: number, width: number, planted: boolean, raised: boolean},
 *   left: SideNumbers, right: SideNumbers, kerbHeight: number, bridge: boolean, paved: boolean,
 *   lanesForward: number, lanesBackward: number, laneWidth: number, streetscape: string}}
 *   left/right = { kerb: ?{from, to}, pavement: ?{from, to}, verge: ?{from, to}, outer } as signed offsets.
 */
export function streetCrossSectionOf(segment, section) {
  const hw = section.halfWidth;
  const median = section.median ? { from: section.median[0], to: section.median[1], width: section.median[1] - section.median[0], planted: true, raised: true } : null;
  const carriageways = median
    ? [{ from: -hw, to: median.from, width: median.from + hw }, { from: median.to, to: hw, width: hw - median.to }]
    : [{ from: -hw, to: hw, width: 2 * hw }];
  const side = (sign, raised, outer) => {
    const span = (a, b) => (sign < 0 ? { from: -b, to: -a } : { from: a, to: b });
    if (raised) return { kerb: span(hw, hw + KERB_TOP_WIDTH), pavement: span(hw + KERB_TOP_WIDTH, outer), verge: null, outer: sign * outer };
    return { kerb: null, pavement: null, verge: outer > hw ? span(hw, outer) : null, outer: sign * outer };
  };
  return {
    segment: segment.id,
    halfWidth: hw,
    carriageways,
    median,
    left: side(-1, section.kerbLeft, section.outerLeft),
    right: side(1, section.kerbRight, section.outerRight),
    kerbHeight: KERB_HEIGHT,
    bridge: section.bridge,
    paved: section.paved,
    lanesForward: segment.lanesForward,
    lanesBackward: segment.lanesBackward,
    laneWidth: segment.laneWidth,
    streetscape: segment.streetscape,
  };
}

/**
 * Builds the query over a whole plan.
 * @param {Object} plan
 * @param {import('./roadSampling.js').RoadCentreLine[]} lines By segment id (sampleRoadCentreLines).
 * @param {import('./roadSampling.js').RoadCrossSection[]} sections By segment id.
 */
export function createStreetSurfaceQuery(plan, lines, sections) {
  const nodes = plan.roads.nodes;
  const cells = new Map();
  const add = (x0, z0, x1, z1, entry) => {
    for (let cz = Math.floor(z0 / HASH_CELL); cz <= Math.floor(z1 / HASH_CELL); cz += 1) {
      for (let cx = Math.floor(x0 / HASH_CELL); cx <= Math.floor(x1 / HASH_CELL); cx += 1) {
        const key = cx * 100003 + cz;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(entry);
      }
    }
  };
  for (const line of lines) {
    const section = sections[line.segment.id];
    const reach = Math.max(section.outerLeft, section.outerRight) + 1;
    for (let i = 0; i < line.count - 1; i += 1) {
      add(Math.min(line.x[i], line.x[i + 1]) - reach, Math.min(line.z[i], line.z[i + 1]) - reach,
        Math.max(line.x[i], line.x[i + 1]) + reach, Math.max(line.z[i], line.z[i + 1]) + reach, { line, i });
    }
  }
  const junctions = new Array(nodes.length);
  for (const node of nodes) {
    const reach = (node.radius || 0) + 12;
    add(node.x - reach, node.z - reach, node.x + reach, node.z + reach, { node });
  }
  const crossSections = new Array(lines.length);
  const junctionOf = (node) => (junctions[node.id] === undefined ? (junctions[node.id] = layOutJunction(node, lines, sections)) : junctions[node.id]);

  /**
   * What the street is at a point. The result object is reused by the next call unless `out` is given.
   * @param {number} x
   * @param {number} z
   * @param {Object} [out]
   * @returns {{kind: string, segment: number, node: number, along: number, offset: number,
   *   side: -1 | 0 | 1, raised: boolean, planted: boolean, bridge: boolean}}
   *   segment/node are -1 when not on one; along and offset are on the segment; side is the
   *   kerb side (-1 left, 1 right, 0 carriageway or median); raised = on a kerb-height surface.
   */
  function surfaceAt(x, z, out = shared) {
    out.kind = 'ground';
    out.segment = -1;
    out.node = -1;
    out.along = 0;
    out.offset = 0;
    out.side = 0;
    out.raised = false;
    out.planted = false;
    out.bridge = false;
    const entries = cells.get(Math.floor(x / HASH_CELL) * 100003 + Math.floor(z / HASH_CELL));
    if (!entries) return out;
    // Junctions first: their surface, crossings and pavement corners own the space between arms.
    for (const entry of entries) {
      if (!entry.node) continue;
      const junction = junctionOf(entry.node);
      if (!junction) continue;
      if (insideRing(junction.ring, x, z)) {
        out.node = entry.node.id;
        out.kind = onCrosswalk(entry.node, x, z) ? 'crosswalk' : 'junction';
        return out;
      }
      for (const corner of junction.corners) {
        corner.area ??= corner.kerb.concat(corner.outer.slice().reverse());
        if (insideRing(corner.area, x, z)) {
          out.node = entry.node.id;
          out.kind = corner.raised ? (distanceToPolyline(corner.kerb, x, z) <= KERB_TOP_WIDTH + 0.01 ? 'kerb' : 'pavement') : 'verge';
          out.raised = corner.raised;
          return out;
        }
      }
    }
    let best = null;
    let bestOffset = Infinity;
    let bestAlong = 0;
    for (const entry of entries) {
      if (!entry.line) continue;
      const { line, i } = entry;
      const ax = line.x[i];
      const az = line.z[i];
      const cx = line.x[i + 1] - ax;
      const cz = line.z[i + 1] - az;
      const length2 = cx * cx + cz * cz || 1;
      let t = ((x - ax) * cx + (z - az) * cz) / length2;
      // Beyond the line's trimmed ends is the junction's; between samples a sliver of slack.
      if (t < (i === 0 ? 0 : -0.05) || t > (i === line.count - 2 ? 1 : 1.05)) continue;
      t = Math.min(1, Math.max(0, t));
      let rx = -(line.tz[i] + (line.tz[i + 1] - line.tz[i]) * t);
      let rz = line.tx[i] + (line.tx[i + 1] - line.tx[i]) * t;
      const r = Math.hypot(rx, rz) || 1;
      rx /= r;
      rz /= r;
      const offset = (x - ax - cx * t) * rx + (z - az - cz * t) * rz;
      const section = sections[line.segment.id];
      if (offset < -section.outerLeft || offset > section.outerRight) continue;
      if (Math.abs(offset) < Math.abs(bestOffset)) {
        best = line;
        bestOffset = offset;
        bestAlong = line.along[i] + (line.along[i + 1] - line.along[i]) * t;
      }
    }
    if (!best) return out;
    const section = sections[best.segment.id];
    out.segment = best.segment.id;
    out.along = bestAlong;
    out.offset = bestOffset;
    out.bridge = section.bridge;
    const hw = section.halfWidth;
    if (bestOffset >= -hw && bestOffset <= hw) {
      if (section.median && bestOffset >= section.median[0] && bestOffset <= section.median[1]) {
        out.kind = 'median';
        out.planted = true;
        out.raised = true;
      } else {
        out.kind = 'carriageway';
      }
      return out;
    }
    out.side = bestOffset < 0 ? -1 : 1;
    const raised = out.side < 0 ? section.kerbLeft : section.kerbRight;
    out.raised = raised;
    out.kind = raised ? (Math.abs(bestOffset) - hw <= KERB_TOP_WIDTH ? 'kerb' : 'pavement') : 'verge';
    return out;
  }
  const shared = {};

  return {
    surfaceAt,
    /** The cross-section numbers of a segment (cached). */
    crossSection(segmentId) {
      const line = lines[segmentId];
      if (!line) return null;
      return (crossSections[segmentId] ??= streetCrossSectionOf(line.segment, sections[segmentId]));
    },
    /** The junction layout of a node (ring, corners) as built, or null. */
    junction(nodeId) {
      return nodes[nodeId] ? junctionOf(nodes[nodeId]) : null;
    },
  };
}

/** Whether a node's painted crossing covers x, z. */
function onCrosswalk(node, x, z) {
  for (const crossing of node.crosswalks || []) {
    const arm = node.arms[crossing.arm];
    if (!arm) continue;
    const length = Math.hypot(crossing.bx - crossing.ax, crossing.bz - crossing.az) || 1;
    const px = x - (crossing.ax + crossing.bx) / 2;
    const pz = z - (crossing.az + crossing.bz) / 2;
    const across = (px * (crossing.bx - crossing.ax) + pz * (crossing.bz - crossing.az)) / length;
    const along = px * arm.dx + pz * arm.dz;
    if (Math.abs(across) <= length / 2 && Math.abs(along) <= (crossing.width || 3) / 2) return true;
  }
  return false;
}

/** Distance from x, z to a polyline of {x, z} points. */
function distanceToPolyline(points, x, z) {
  let best = Infinity;
  for (let i = 0; i + 1 < points.length; i += 1) {
    const a = points[i];
    const dx = points[i + 1].x - a.x;
    const dz = points[i + 1].z - a.z;
    const t = Math.min(1, Math.max(0, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(x - a.x - dx * t, z - a.z - dz * t));
  }
  return best;
}

/** Even-odd point-in-polygon over {x, z} points. */
function insideRing(ring, x, z) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i];
    const b = ring[j];
    if ((a.z > z) !== (b.z > z) && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

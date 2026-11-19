// Road centre lines ready for meshing: every segment of the city plan resampled to short steps
// between its junction trims, with the road's height and direction at each sample, and the
// cross-section (kerbs, median, pavements, verges) in metres right of the centre line. Pure
// data, no three.js, so the street geometry can be checked in Node.
//
//   const lines = sampleRoadCentreLines(plan);       // one per segment, same order
//   const section = roadCrossSection(segment);       // { halfWidth, outerLeft, median, ... }
//   const y = line.y[i] + crownHeight(section, s);   // the surface s metres right of sample i

/** Longest step between two samples of a centre line, in metres. */
export const ROAD_SAMPLE_STEP = 8;
/** Height of a kerb: pavement and median tops stand this far above the gutter. */
export const KERB_HEIGHT = 0.15;
/** Width of the kerb stone's top, measured from the kerb face. */
export const KERB_TOP_WIDTH = 0.25;

/**
 * @typedef {Object} RoadCentreLine
 * @property {Object} segment The plan's segment.
 * @property {number} count Samples, at least two.
 * @property {Float64Array} x World X of each sample.
 * @property {Float64Array} z World Z.
 * @property {Float64Array} y Road surface height at the kerb line (the crown adds to it).
 * @property {Float64Array} along Metres from the segment's first point.
 * @property {Float64Array} tx Unit direction of the segment at the sample (X).
 * @property {Float64Array} tz Unit direction (Z). Right of it is (-tz, tx).
 */

/**
 * Samples every segment of a plan between its trims.
 * @param {{roads: {nodes: Object[], segments: Object[]}}} plan
 * @returns {RoadCentreLine[]} One per segment, indexed by segment id.
 */
export function sampleRoadCentreLines(plan) {
  const { nodes, segments } = plan.roads;
  return segments.map((segment) => sampleRoadCentreLine(segment, nodes));
}

/**
 * Samples one segment between its trims: the original points plus subdivisions, so no step is
 * longer than ROAD_SAMPLE_STEP. At a node where only two segments meet, both end on the
 * bisector of the bend, so their meshes join without a wedge.
 * @param {Object} segment
 * @param {Object[]} nodes
 * @returns {RoadCentreLine}
 */
export function sampleRoadCentreLine(segment, nodes) {
  const p = segment.points;
  const n = p.length / 2;
  const cumulative = new Float64Array(n);
  for (let i = 1; i < n; i += 1) cumulative[i] = cumulative[i - 1] + Math.hypot(p[2 * i] - p[2 * i - 2], p[2 * i + 1] - p[2 * i - 1]);
  const length = cumulative[n - 1];
  const start = Math.min(segment.trimA || 0, length * 0.49);
  const end = Math.max(start + 0.01, length - Math.min(segment.trimB || 0, length * 0.49));
  const alongs = [start];
  for (let i = 1; i < n; i += 1) {
    const a0 = cumulative[i - 1];
    const a1 = cumulative[i];
    const pieces = Math.max(1, Math.ceil((a1 - a0) / ROAD_SAMPLE_STEP));
    for (let k = 1; k <= pieces; k += 1) {
      const a = a0 + ((a1 - a0) * k) / pieces;
      if (a > start + 0.25 && a < end - 0.25) alongs.push(a);
    }
  }
  alongs.push(end);

  const count = alongs.length;
  const line = {
    segment, count,
    x: new Float64Array(count), z: new Float64Array(count), y: new Float64Array(count),
    along: new Float64Array(alongs), tx: new Float64Array(count), tz: new Float64Array(count),
  };
  const heights = segment.heights;
  let k = 0;
  for (let i = 0; i < count; i += 1) {
    const a = alongs[i];
    while (k < n - 2 && cumulative[k + 1] < a) k += 1;
    const span = cumulative[k + 1] - cumulative[k] || 1;
    const t = Math.min(1, Math.max(0, (a - cumulative[k]) / span));
    line.x[i] = p[2 * k] + (p[2 * k + 2] - p[2 * k]) * t;
    line.z[i] = p[2 * k + 1] + (p[2 * k + 3] - p[2 * k + 1]) * t;
    line.y[i] = heights ? heights[k] + (heights[k + 1] - heights[k]) * t : 0;
    const dx = p[2 * k + 2] - p[2 * k];
    const dz = p[2 * k + 3] - p[2 * k + 1];
    const d = Math.hypot(dx, dz) || 1;
    line.tx[i] = dx / d;
    line.tz[i] = dz / d;
  }
  // Interior samples take the direction between their neighbours (smooth bends).
  for (let i = 1; i < count - 1; i += 1) {
    const dx = line.x[i + 1] - line.x[i - 1];
    const dz = line.z[i + 1] - line.z[i - 1];
    const d = Math.hypot(dx, dz);
    if (d > 1e-6) {
      line.tx[i] = dx / d;
      line.tz[i] = dz / d;
    }
  }
  bisectBend(line, 0, nodes[segment.a], segment, true);
  bisectBend(line, count - 1, nodes[segment.b], segment, false);
  return line;
}

/** At a node joining exactly two segments, turns the end sample to the bisector of the bend. */
function bisectBend(line, index, node, segment, atStart) {
  if (!node || !node.arms || node.arms.length !== 2) return;
  const own = node.arms.find((arm) => arm.segment === segment.id && arm.atStart === atStart);
  const other = node.arms.find((arm) => arm !== own);
  if (!own || !other) return;
  // Leaving the node along this segment, arriving from the other one.
  let dx = own.dx - other.dx;
  let dz = own.dz - other.dz;
  const d = Math.hypot(dx, dz);
  if (d < 1e-6) return;
  dx /= d;
  dz /= d;
  line.tx[index] = atStart ? dx : -dx;
  line.tz[index] = atStart ? dz : -dz;
}

/**
 * @typedef {Object} RoadCrossSection
 * @property {number} halfWidth Centre line to each kerb face.
 * @property {number} outerLeft Metres left of the centre line to the back of the left pavement
 *   or verge (positive number).
 * @property {number} outerRight
 * @property {boolean} kerbLeft A raised pavement on the left (else a verge at road level).
 * @property {boolean} kerbRight
 * @property {?[number, number]} median Signed offsets [from, to] of a raised planted median.
 * @property {number} crown Height of the crown over the gutter.
 * @property {boolean} paved
 * @property {boolean} bridge
 * @property {number[]} lateral Offsets of the road surface's long edges, left kerb to right kerb.
 */

/**
 * The cross-section of a segment as the mesher needs it.
 * @param {Object} segment A plan segment (it carries its road specification).
 * @returns {RoadCrossSection}
 */
export function roadCrossSection(segment) {
  const halfWidth = segment.halfWidth;
  let median = null;
  if (segment.medianWidth >= 2.4 && segment.roadClass === 'avenue') {
    const from = -halfWidth + segment.shoulder + segment.parkingLeft + segment.lanesBackward * segment.laneWidth;
    median = [from, from + segment.medianWidth];
  }
  const lateral = [-halfWidth, -halfWidth * 0.5, 0, halfWidth * 0.5, halfWidth];
  if (median) lateral.splice(2, 1, median[0], median[1]);
  lateral.sort((a, b) => a - b);
  return {
    halfWidth,
    outerLeft: segment.corridorLeft,
    outerRight: segment.corridorRight,
    kerbLeft: segment.sidewalkLeft > 0 && segment.paved !== false,
    kerbRight: segment.sidewalkRight > 0 && segment.paved !== false,
    median,
    crown: Math.min(0.08, 0.008 * halfWidth),
    paved: segment.paved !== false,
    bridge: Boolean(segment.bridge),
    lateral,
  };
}

/**
 * Height of the road surface over the gutter, s metres right of the centre line (a parabola
 * that is zero at both kerbs).
 * @param {RoadCrossSection} section
 * @param {number} s
 * @returns {number}
 */
export function crownHeight(section, s) {
  const r = s / section.halfWidth;
  return r >= 1 || r <= -1 ? 0 : section.crown * (1 - r * r);
}

/**
 * Splits the sample intervals of every centre line among the plan's 128 m sectors: an interval
 * belongs to the sector holding its midpoint, so neighbouring sectors share end samples exactly.
 * @param {RoadCentreLine[]} lines
 * @param {{minX: number, minZ: number, size: number, columns: number, rows: number}} grid
 * @returns {Map<number, {line: RoadCentreLine, from: number, to: number}[]>} Pieces by cell index
 *   (row * columns + column); `from` and `to` are sample indices, to > from.
 */
export function partitionRoadsBySector(lines, grid) {
  const pieces = new Map();
  for (const line of lines) {
    let currentCell = -1;
    let piece = null;
    for (let i = 0; i < line.count - 1; i += 1) {
      const mx = (line.x[i] + line.x[i + 1]) / 2;
      const mz = (line.z[i] + line.z[i + 1]) / 2;
      const c = Math.min(grid.columns - 1, Math.max(0, Math.floor((mx - grid.minX) / grid.size)));
      const r = Math.min(grid.rows - 1, Math.max(0, Math.floor((mz - grid.minZ) / grid.size)));
      const cell = r * grid.columns + c;
      if (cell !== currentCell || !piece) {
        piece = { line, from: i, to: i + 1 };
        currentCell = cell;
        if (!pieces.has(cell)) pieces.set(cell, []);
        pieces.get(cell).push(piece);
      } else {
        piece.to = i + 1;
      }
    }
  }
  return pieces;
}

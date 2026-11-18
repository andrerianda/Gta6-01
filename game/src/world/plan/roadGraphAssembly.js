// Turns road strokes into the road graph. Every place where two strokes cross, or where the end
// of one meets another, becomes an intersection node; the pieces of stroke between nodes become
// road segments that carry the stroke's cross-section, name and heights. Short stubs left over
// where a stroke was drawn a little past the road it joins are removed.
//
//   const graph = assembleRoadGraph(set.strokes, terrain);
//   graph.nodes[i]      // {id, x, y, z, segments: [segment ids], exit, culDeSac, ...}
//   graph.segments[i]   // {id, a, b, points, heights, along, length, roadClass, name, ...}

import { cumulativeLengths, slicePolyline } from './planGeometry.js';
import { ROAD_PROFILES } from './roadSpecifications.js';

const CELL = 20;
const SNAP_DISTANCE = 9;
const MERGE_DISTANCE = 6;
const STUB_LENGTH = 34;
const BRIDGE_DECK = 6;

/**
 * Cuts strokes into a graph of intersections and road segments.
 * @param {import('./roadStrokes.js').RoadStroke[]} strokes
 * @param {import('./terrainHeightField.js').TerrainHeightField} terrain
 * @returns {{nodes: RoadNode[], segments: RoadSegment[], diagnostics: string[]}}
 */
export function assembleRoadGraph(strokes, terrain) {
  const along = strokes.map((stroke) => cumulativeLengths(stroke.points));
  const cuts = strokes.map(() => []);
  const cells = hashPieces(strokes);
  findCrossings(strokes, along, cells, cuts);
  snapEnds(strokes, along, cells, cuts);

  const nodeIndex = createNodeIndex();
  const pieces = [];
  strokes.forEach((stroke, s) => {
    const total = along[s][along[s].length - 1];
    const list = cuts[s];
    if (!list.some((cut) => cut.along < 0.5)) list.push({ along: 0, x: stroke.points[0], z: stroke.points[1] });
    if (!list.some((cut) => cut.along > total - 0.5)) {
      list.push({ along: total, x: stroke.points[stroke.points.length - 2], z: stroke.points[stroke.points.length - 1] });
    }
    // A loop with a single junction is cut once more, so that no segment starts and ends at the same node.
    if (stroke.closed) list.push({ along: total / 2, ...pointAt(stroke.points, along[s], total / 2) });
    list.sort((p, q) => p.along - q.along);
    let previous = null;
    for (const cut of list) {
      cut.node = nodeIndex.find(cut.x, cut.z);
      if (previous && cut.node !== previous.node && cut.along - previous.along > 1) {
        pieces.push({ stroke, from: previous, to: cut, atStart: previous.along < 0.5, atEnd: cut.along > total - 0.5, removed: false });
      }
      if (!previous || cut.node !== previous.node) previous = cut;
    }
  });

  const diagnostics = [];
  const rawNodes = nodeIndex.nodes;
  trimStubs(pieces, rawNodes, diagnostics);
  return buildGraph(pieces, rawNodes, terrain, diagnostics);
}

/**
 * @typedef {Object} RoadNode
 * @property {number} id Index in `nodes`.
 * @property {number} x
 * @property {number} y Height of the road surface at the node.
 * @property {number} z
 * @property {number[]} segments Ids of the segments that meet here.
 * @property {boolean} exit A map exit: the road leaves the city here and traffic is recycled.
 * @property {boolean} culDeSac A dead end with a turning circle.
 * @property {RoadArm[]} arms Filled by designIntersections: the segments in order round the node.
 * @property {'signals'|'stop'|'none'|'cul_de_sac'|'exit'} control Filled by designIntersections.
 * @property {number} radius Filled by designIntersections: the extent of the junction area.
 * @property {?Object} signal Filled by designIntersections for signal junctions.
 */
/**
 * @typedef {Object} RoadSegment
 * @property {number} id Index in `segments`.
 * @property {number} a Node id at the first point.
 * @property {number} b Node id at the last point.
 * @property {string} key Road key shared by all the segments of one road.
 * @property {string} name Street name.
 * @property {string} profile Key of ROAD_PROFILES; its fields are copied onto the segment
 *   (roadClass, lanesForward, lanesBackward, oneWay, laneWidth, medianWidth, parkingLeft/Right,
 *   sidewalkLeft/Right, speedLimit, priority, streetscape, halfWidth, corridorLeft/Right).
 * @property {number} width Kerb to kerb.
 * @property {number[]} points Flat world polyline [x, z, ...], sampled at most every 10 m.
 * @property {number[]} along Distance from the first point at each point.
 * @property {Float32Array} heights Road surface height at each point (bridge decks included).
 * @property {number} length
 * @property {boolean} bridge Whether the segment runs over water.
 * @property {?string} district Filled by the generator.
 * @property {number} trimA Metres of the segment inside the junction at `a` (designIntersections).
 * @property {number} trimB
 */

function cellKey(cx, cz) {
  return (cx + 4096) * 8192 + (cz + 4096);
}

function hashPieces(strokes) {
  const cells = new Map();
  strokes.forEach((stroke, s) => {
    const p = stroke.points;
    for (let i = 0; i + 3 < p.length; i += 2) {
      const key = cellKey(Math.floor((p[i] + p[i + 2]) / 2 / CELL), Math.floor((p[i + 1] + p[i + 3]) / 2 / CELL));
      let cell = cells.get(key);
      if (!cell) cells.set(key, (cell = []));
      cell.push(s, i);
    }
  });
  return cells;
}

function findCrossings(strokes, along, cells, cuts) {
  strokes.forEach((stroke, s) => {
    const p = stroke.points;
    for (let i = 0; i + 3 < p.length; i += 2) {
      const ax = p[i];
      const az = p[i + 1];
      const rx = p[i + 2] - ax;
      const rz = p[i + 3] - az;
      const lengthR = Math.hypot(rx, rz);
      if (lengthR < 1e-6) continue;
      const cx0 = Math.floor((ax + rx / 2) / CELL);
      const cz0 = Math.floor((az + rz / 2) / CELL);
      for (let gx = cx0 - 1; gx <= cx0 + 1; gx += 1) {
        for (let gz = cz0 - 1; gz <= cz0 + 1; gz += 1) {
          const cell = cells.get(cellKey(gx, gz));
          if (!cell) continue;
          for (let k = 0; k < cell.length; k += 2) {
            const t = cell[k];
            if (t <= s) continue;
            const q = strokes[t].points;
            const j = cell[k + 1];
            const sx = q[j + 2] - q[j];
            const sz = q[j + 3] - q[j + 1];
            const lengthS = Math.hypot(sx, sz);
            const cross = rx * sz - rz * sx;
            if (Math.abs(cross) < 0.02 * lengthR * lengthS) continue;
            const fr = ((q[j] - ax) * sz - (q[j + 1] - az) * sx) / cross;
            const fs = ((q[j] - ax) * rz - (q[j + 1] - az) * rx) / cross;
            const slackR = 0.4 / lengthR;
            const slackS = 0.4 / lengthS;
            if (fr < -slackR || fr > 1 + slackR || fs < -slackS || fs > 1 + slackS) continue;
            const x = ax + rx * fr;
            const z = az + rz * fr;
            cuts[s].push({ along: along[s][i / 2] + lengthR * Math.min(1, Math.max(0, fr)), x, z });
            cuts[t].push({ along: along[t][j / 2] + lengthS * Math.min(1, Math.max(0, fs)), x, z });
          }
        }
      }
    }
  });
}

// The end of a stroke that stops on (or just short of) another stroke joins it there.
function snapEnds(strokes, along, cells, cuts) {
  strokes.forEach((stroke, s) => {
    if (stroke.closed) return;
    const p = stroke.points;
    const total = along[s][along[s].length - 1];
    for (const end of [0, 1]) {
      const ex = end === 0 ? p[0] : p[p.length - 2];
      const ez = end === 0 ? p[1] : p[p.length - 1];
      const cx0 = Math.floor(ex / CELL);
      const cz0 = Math.floor(ez / CELL);
      let best = null;
      let bestDistance = SNAP_DISTANCE * SNAP_DISTANCE;
      for (let gx = cx0 - 1; gx <= cx0 + 1; gx += 1) {
        for (let gz = cz0 - 1; gz <= cz0 + 1; gz += 1) {
          const cell = cells.get(cellKey(gx, gz));
          if (!cell) continue;
          for (let k = 0; k < cell.length; k += 2) {
            const t = cell[k];
            if (t === s) continue;
            const q = strokes[t].points;
            const j = cell[k + 1];
            const sx = q[j + 2] - q[j];
            const sz = q[j + 3] - q[j + 1];
            const lengthSquared = sx * sx + sz * sz;
            if (lengthSquared < 1e-9) continue;
            const f = Math.min(1, Math.max(0, ((ex - q[j]) * sx + (ez - q[j + 1]) * sz) / lengthSquared));
            const x = q[j] + sx * f;
            const z = q[j + 1] + sz * f;
            const distance = (x - ex) * (x - ex) + (z - ez) * (z - ez);
            if (distance < bestDistance) {
              bestDistance = distance;
              best = { t, along: along[t][j / 2] + Math.sqrt(lengthSquared) * f, x, z };
            }
          }
        }
      }
      if (!best) continue;
      cuts[best.t].push({ along: best.along, x: best.x, z: best.z });
      cuts[s].push({ along: end === 0 ? 0 : total, x: best.x, z: best.z });
    }
  });
}

function pointAt(points, along, distance) {
  let i = 0;
  while (i < along.length - 2 && along[i + 1] < distance) i += 1;
  const span = along[i + 1] - along[i] || 1;
  const f = (distance - along[i]) / span;
  return { x: points[i * 2] + (points[i * 2 + 2] - points[i * 2]) * f, z: points[i * 2 + 1] + (points[i * 2 + 3] - points[i * 2 + 1]) * f };
}

// Nodes by position: cuts closer than the merge distance share one node.
function createNodeIndex() {
  const nodes = [];
  const cells = new Map();
  const size = MERGE_DISTANCE * 2;
  return {
    nodes,
    find(x, z) {
      const cx0 = Math.floor(x / size);
      const cz0 = Math.floor(z / size);
      for (let gx = cx0 - 1; gx <= cx0 + 1; gx += 1) {
        for (let gz = cz0 - 1; gz <= cz0 + 1; gz += 1) {
          const cell = cells.get(cellKey(gx, gz));
          if (!cell) continue;
          for (const node of cell) {
            if ((node.x - x) * (node.x - x) + (node.z - z) * (node.z - z) <= MERGE_DISTANCE * MERGE_DISTANCE) return node;
          }
        }
      }
      const node = { x, z, pieces: [] };
      nodes.push(node);
      const key = cellKey(cx0, cz0);
      let cell = cells.get(key);
      if (!cell) cells.set(key, (cell = []));
      cell.push(node);
      return node;
    },
  };
}

function trimStubs(pieces, nodes, diagnostics) {
  for (const piece of pieces) {
    piece.from.node.pieces.push(piece);
    piece.to.node.pieces.push(piece);
  }
  for (let pass = 0; pass < 2; pass += 1) {
    for (const node of nodes) {
      const live = node.pieces.filter((piece) => !piece.removed);
      if (live.length !== 1) continue;
      const piece = live[0];
      const stroke = piece.stroke;
      const isStart = piece.from.node === node;
      const exit = isStart ? piece.atStart && stroke.exitStart : piece.atEnd && stroke.exitEnd;
      const deadEnd = isStart ? piece.atStart && stroke.deadEndStart : piece.atEnd && stroke.deadEndEnd;
      node.exit = exit;
      node.culDeSac = !exit;
      if (exit || deadEnd) continue;
      if (piece.to.along - piece.from.along < STUB_LENGTH) piece.removed = true;
      else if (pass === 1) diagnostics.push(`unplanned dead end of ${stroke.key} near ${Math.round(node.x)}, ${Math.round(node.z)}`);
    }
  }
}

function buildGraph(pieces, rawNodes, terrain, diagnostics) {
  const nodes = [];
  for (const raw of rawNodes) {
    const live = raw.pieces.filter((piece) => !piece.removed);
    if (live.length === 0) continue;
    raw.id = nodes.length;
    nodes.push({
      id: raw.id, x: raw.x, y: surfaceHeight(terrain, raw.x, raw.z), z: raw.z, segments: [],
      exit: live.length === 1 && raw.exit === true, culDeSac: live.length === 1 && raw.exit !== true,
      arms: [], control: 'none', radius: 0, signal: null,
    });
  }
  const segments = [];
  for (const piece of pieces) {
    if (piece.removed) continue;
    const { stroke } = piece;
    const a = nodes[piece.from.node.id];
    const b = nodes[piece.to.node.id];
    const sliced = slicePolyline(stroke.points, piece.from.along, piece.to.along);
    const points = [a.x, a.z];
    for (let i = 2; i < sliced.length - 2; i += 2) {
      const dx = sliced[i] - points[points.length - 2];
      const dz = sliced[i + 1] - points[points.length - 1];
      const toEnd = Math.hypot(sliced[i] - b.x, sliced[i + 1] - b.z);
      if (dx * dx + dz * dz > 1 && toEnd > 1) points.push(sliced[i], sliced[i + 1]);
    }
    points.push(b.x, b.z);
    const distances = cumulativeLengths(points);
    const spec = ROAD_PROFILES[stroke.profile];
    const segment = {
      id: segments.length, a: a.id, b: b.id, key: stroke.key, name: stroke.name, ...spec, width: spec.halfWidth * 2,
      points, along: distances, heights: new Float32Array(points.length / 2), length: distances[distances.length - 1],
      bridge: false, district: null, trimA: 0, trimB: 0,
    };
    layHeights(segment, a, b, terrain);
    a.segments.push(segment.id);
    b.segments.push(segment.id);
    segments.push(segment);
    if (segment.length < 12) diagnostics.push(`very short segment of ${stroke.key} near ${Math.round(a.x)}, ${Math.round(a.z)}`);
  }
  // Settle each junction between its arms, so that no road kinks where it meets another on a slope.
  for (let pass = 0; pass < 3; pass += 1) {
    for (const node of nodes) {
      if (node.segments.length < 2) continue;
      let sum = 0;
      for (const id of node.segments) {
        const segment = segments[id];
        sum += segment.a === node.id ? segment.heights[1] : segment.heights[segment.heights.length - 2];
      }
      node.y = (node.y + sum / node.segments.length) / 2;
    }
    for (const segment of segments) smoothHeights(segment, nodes[segment.a].y, nodes[segment.b].y, 3);
  }
  return { nodes, segments, diagnostics };
}

// The height of a road at a point: the ground, kept above the tide, or a bridge deck over water.
function surfaceHeight(terrain, x, z) {
  const ground = terrain.heightAt(x, z);
  return terrain.shoreDistanceAt(x, z) < -1 ? Math.max(ground, BRIDGE_DECK) : Math.max(ground, 1);
}

function layHeights(segment, a, b, terrain) {
  const { points, heights } = segment;
  const count = heights.length;
  let overWater = 0;
  for (let i = 0; i < count; i += 1) {
    heights[i] = surfaceHeight(terrain, points[i * 2], points[i * 2 + 1]);
    if (terrain.shoreDistanceAt(points[i * 2], points[i * 2 + 1]) < -3) overWater += 1;
  }
  segment.bridge = overWater >= 2;
  smoothHeights(segment, a.y, b.y, 10);
}

// Smooths the profile so that a road neither follows every bump nor steps onto a bridge.
function smoothHeights(segment, startHeight, endHeight, passes) {
  const { heights } = segment;
  const count = heights.length;
  heights[0] = startHeight;
  heights[count - 1] = endHeight;
  for (let pass = 0; pass < passes; pass += 1) {
    let previous = heights[0];
    for (let i = 1; i < count - 1; i += 1) {
      const current = heights[i];
      heights[i] = (previous + 2 * current + heights[i + 1]) / 4;
      previous = current;
    }
  }
}

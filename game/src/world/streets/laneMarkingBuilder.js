// Builds the road paint of one sector as decals a hair above the asphalt: lane lines (dashes are
// geometry, so one paint material serves every line, yellow by vertex colour), stop bars and
// lane arrows on every approach that must stop, and zebra crossings across the arms of the
// junctions (node.crosswalks). Paint follows the carriageway mesh exactly: the same centre-line
// samples, the same piecewise-linear crown, and inside a junction the same triangle fan. A
// sector costs one draw for the lines and at most two for arrows.
//
//   const paint = yield* buildLaneMarkings({ pieces, nodes, junctions, lines, sections, lanesByKey, materials });
//   paint = { object3d, geometries }

import * as THREE from 'three';
import { crownHeight } from './roadSampling.js';
import { approachOf, arrowTurnOf, forEachDash, laneLinesOf, meshCrownAt, STOP_BAR_WIDTH } from './laneMarkingLayout.js';

/** Paint lies this far above the surface it is painted on (plus the material's polygon offset). */
const LIFT = 0.012;
/** Width across of one tile of the paint material (markingSolidLine): v runs 0..PAINT_V across a stroke. */
const PAINT_V = 0.3;
const ARROW_WIDTH = 1.6;
const ARROW_LENGTH = 4;
/** Approaches shorter than this get a stop bar but no arrows. */
const ARROW_MIN_APPROACH = 22;
const WHITE = [1, 1, 1];
const YELLOW = [1, 0.56, 0.05];

/**
 * Creates the paint materials from the surface library (the line paint takes vertex colours).
 * They are requested, not painted here: the library's worker (or its queue) paints them while
 * the city loads and the maps fill in place.
 * @param {ReturnType<import('../../render/textures/surfaceMaterials.js').createSurfaceLibrary>} surfaces
 */
export function createLaneMarkingMaterials(surfaces) {
  const paint = surfaces.requestMaterial('markingSolidLine', { lineWidth: 0.27, wear: 0.3 });
  paint.vertexColors = true;
  paint.needsUpdate = true;
  return {
    paint,
    arrowStraight: surfaces.requestMaterial('markingArrow', { turn: 'straight', wear: 0.3 }),
    arrowLeft: surfaces.requestMaterial('markingArrow', { turn: 'left', wear: 0.3 }),
  };
}

/** The surface-library paintings the marking materials need (painted while the city loads). */
export const LANE_MARKING_PAINTINGS = [['markingSolidLine', { lineWidth: 0.27, wear: 0.3 }], ['markingArrow', { turn: 'straight', wear: 0.3 }], ['markingArrow', { turn: 'left', wear: 0.3 }]];

/**
 * Builds a sector's road paint.
 * @param {Object} options
 * @param {{line: import('./roadSampling.js').RoadCentreLine, from: number, to: number}[]} options.pieces
 * @param {Object[]} options.nodes The plan nodes of the sector.
 * @param {Array<?ReturnType<import('./junctionLayout.js').layOutJunction>>} options.junctions Their layouts, same order.
 * @param {Object[]} options.planNodes Every plan node, by id.
 * @param {Map<string, Object>} options.lanesByKey Plan lanes by `${segment}:${direction}:${index}`.
 * @param {import('./roadSampling.js').RoadCrossSection[]} options.sections By segment id.
 * @param {ReturnType<typeof createLaneMarkingMaterials>} options.materials
 * @returns {Generator<void, {object3d: THREE.Group, geometries: THREE.BufferGeometry[]}, void>}
 */
export function* buildLaneMarkings({ pieces, nodes, junctions, planNodes, lanesByKey, sections, materials }) {
  const paint = createDecalBuffer();
  const straight = createDecalBuffer();
  const turning = createDecalBuffer();
  let work = 0;
  for (const piece of pieces) {
    const { line, from, to } = piece;
    const segment = line.segment;
    const section = sections[segment.id];
    for (const mark of laneLinesOf(segment, section)) {
      const color = mark.color === 'yellow' ? YELLOW : WHITE;
      const s0 = mark.s - mark.width / 2;
      const s1 = mark.s + mark.width / 2;
      for (let i = from; i < to; i += 1) {
        forEachDash(line.along[i], line.along[i + 1], mark.dash, mark.period, (a0, a1) => {
          paintQuad(paint, line, section, a0, a1, s0, s1, color, 'along');
        });
      }
    }
    if (to === line.count - 1) paintApproach(line, section, approachOf(segment, planNodes[segment.b], true));
    if (from === 0) paintApproach(line, section, approachOf(segment, planNodes[segment.a], false));
    work += 1;
    if (work % 6 === 0) yield;
  }
  for (let n = 0; n < nodes.length; n += 1) {
    if (junctions[n]) paintCrosswalks(paint, nodes[n], junctions[n]);
  }

  function paintApproach(line, section, approach) {
    if (!approach) return;
    const start = line.along[0];
    const end = line.along[line.count - 1];
    if (end - start < 3) return;
    const forward = approach.direction;
    // The bar sits a metre back from where the junction surface begins.
    const near = forward > 0 ? end - 1 : start + 1;
    const far = near - forward * STOP_BAR_WIDTH;
    paintQuad(paint, line, section, Math.min(near, far), Math.max(near, far), approach.from, approach.to, WHITE, 'across');
    if (!approach.signals || end - start < ARROW_MIN_APPROACH) return;
    const tip = near - forward * 3.2;
    const tail = tip - forward * ARROW_LENGTH;
    for (const lane of approach.lanes) {
      const turn = arrowTurnOf(lanesByKey.get(`${line.segment.id}:${forward}:${lane.index}`));
      paintArrow(turn === 'straight' ? straight : turning, line, section, tail, tip, lane.s, forward, turn === 'right');
    }
  }

  const group = new THREE.Group();
  group.name = 'roadPaint';
  const geometries = [];
  for (const [buffer, material, name] of [[paint, materials.paint, 'roadPaintLines'], [straight, materials.arrowStraight, 'roadPaintArrows'], [turning, materials.arrowLeft, 'roadPaintTurnArrows']]) {
    const mesh = buffer.toMesh(material, name);
    if (mesh) {
      group.add(mesh);
      geometries.push(mesh.geometry);
    }
  }
  return { object3d: group, geometries };
}

/** A position on the carriageway mesh: `along` metres along the line, s right of it. */
function surfacePoint(line, section, along, s, out) {
  let i = 0;
  const last = line.count - 2;
  while (i < last && line.along[i + 1] < along) i += 1;
  const span = line.along[i + 1] - line.along[i] || 1;
  const t = Math.min(1, Math.max(0, (along - line.along[i]) / span));
  const ax = line.x[i] - line.tz[i] * s;
  const az = line.z[i] + line.tx[i] * s;
  const bx = line.x[i + 1] - line.tz[i + 1] * s;
  const bz = line.z[i + 1] + line.tx[i + 1] * s;
  out.x = ax + (bx - ax) * t;
  out.z = az + (bz - az) * t;
  out.y = line.y[i] + (line.y[i + 1] - line.y[i]) * t + meshCrownAt(section, s, crownHeight) + LIFT;
  return out;
}

const corner = { x: 0, y: 0, z: 0 };

/**
 * A painted rectangle between two distances along a line and two offsets across it. 'along'
 * strokes run with the road (u = metres along, v across the stroke); 'across' strokes (stop
 * bars) run over it (u = metres across, v along).
 */
function paintQuad(buffer, line, section, a0, a1, s0, s1, color, kind) {
  const ids = [];
  for (const [a, s] of [[a0, s0], [a0, s1], [a1, s1], [a1, s0]]) {
    surfacePoint(line, section, a, s, corner);
    const u = kind === 'along' ? a : s;
    const v = kind === 'along' ? ((s - s0) / (s1 - s0)) * PAINT_V : ((a - a0) / (a1 - a0)) * PAINT_V;
    ids.push(buffer.vertex(corner.x, corner.y, corner.z, u, v, color));
  }
  buffer.quad(ids[0], ids[1], ids[2], ids[3]);
}

/** A lane arrow from `tail` to `tip` (distances along the line), centred s right of it. */
function paintArrow(buffer, line, section, tail, tip, s, forward, mirror) {
  const ids = [];
  const half = ARROW_WIDTH / 2;
  for (const [a, offset] of [[tail, -half], [tail, half], [tip, half], [tip, -half]]) {
    // u runs to the right of travel, v towards the tip; travelling against the segment, the
    // right of travel is the segment's left.
    surfacePoint(line, section, a, s + offset * forward, corner);
    const u = mirror ? half - offset : offset + half;
    const v = Math.abs(a - tail);
    ids.push(buffer.vertex(corner.x, corner.y, corner.z, u, v, WHITE));
  }
  buffer.quad(ids[0], ids[1], ids[2], ids[3]);
}

/** Zebra stripes across every arm of a junction that has a crossing. */
function paintCrosswalks(buffer, node, junction) {
  for (const crossing of node.crosswalks || []) {
    const arm = node.arms[crossing.arm];
    if (!arm) continue;
    const length = Math.hypot(crossing.bx - crossing.ax, crossing.bz - crossing.az);
    if (length < 2) continue;
    const wx = (crossing.bx - crossing.ax) / length;
    const wz = (crossing.bz - crossing.az) / length;
    const depth = (crossing.width || 3) / 2;
    const usable = length - 0.7;
    const count = Math.floor((usable + 0.5) / 1);
    const first = (length - (count * 1 - 0.5)) / 2 + 0.25;
    for (let k = 0; k < count; k += 1) {
      const t = first + k;
      const cx = crossing.ax + wx * t;
      const cz = crossing.az + wz * t;
      const ids = [];
      let inside = true;
      for (const [across, alongArm] of [[-0.25, -depth], [0.25, -depth], [0.25, depth], [-0.25, depth]]) {
        const x = cx + wx * across + arm.dx * alongArm;
        const z = cz + wz * across + arm.dz * alongArm;
        const y = fanHeightAt(junction, x, z);
        if (!Number.isFinite(y)) {
          inside = false;
          break;
        }
        ids.push(buffer.vertex(x, y + LIFT, z, alongArm + depth, ((across + 0.25) / 0.5) * PAINT_V, WHITE));
      }
      if (inside) buffer.quad(ids[0], ids[1], ids[2], ids[3]);
    }
  }
}

/** Height of a junction's triangle fan (centre to ring) at x, z, or NaN outside it. */
export function fanHeightAt(junction, x, z) {
  const { ring, centre } = junction;
  for (let k = 0; k < ring.length; k += 1) {
    const a = ring[k];
    const b = ring[(k + 1) % ring.length];
    const area = (a.x - centre.x) * (b.z - centre.z) - (b.x - centre.x) * (a.z - centre.z);
    if (Math.abs(area) < 1e-9) continue;
    const w1 = ((x - centre.x) * (b.z - centre.z) - (b.x - centre.x) * (z - centre.z)) / area;
    const w2 = ((a.x - centre.x) * (z - centre.z) - (x - centre.x) * (a.z - centre.z)) / area;
    const w0 = 1 - w1 - w2;
    if (w0 >= -1e-6 && w1 >= -1e-6 && w2 >= -1e-6) return w0 * centre.y + w1 * a.y + w2 * b.y;
  }
  return NaN;
}

/** Triangles of one paint material, with colours, all facing up. */
function createDecalBuffer() {
  const positions = [];
  const uvs = [];
  const colors = [];
  const indices = [];
  return {
    vertex(x, y, z, u, v, color) {
      positions.push(x, y, z);
      uvs.push(u, v);
      colors.push(color[0], color[1], color[2]);
      return positions.length / 3 - 1;
    },
    quad(a, b, c, d) {
      const ax = positions[a * 3];
      const az = positions[a * 3 + 2];
      const up = (positions[b * 3 + 2] - az) * (positions[c * 3] - ax) - (positions[b * 3] - ax) * (positions[c * 3 + 2] - az);
      if (up >= 0) indices.push(a, b, c, a, c, d);
      else indices.push(a, c, b, a, d, c);
    },
    toMesh(material, name) {
      if (indices.length === 0) return null;
      const geometry = new THREE.BufferGeometry();
      const count = positions.length / 3;
      const normals = new Float32Array(count * 3);
      for (let i = 1; i < normals.length; i += 3) normals[i] = 1;
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geometry.setIndex(count > 65535 ? new THREE.Uint32BufferAttribute(indices, 1) : new THREE.Uint16BufferAttribute(indices, 1));
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = name;
      mesh.receiveShadow = true;
      mesh.renderOrder = 1;
      return mesh;
    },
  };
}

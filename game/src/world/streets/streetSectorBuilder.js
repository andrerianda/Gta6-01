// Builds the streets of one sector: road surfaces with their crown, kerbs, pavements or verges,
// planted medians, bridge decks with parapets, junction surfaces and pavement corners. Each
// material becomes one mesh (a few draw calls per sector); every walking and driving triangle is
// written to the sector's height raster, and the raised parts (pavements, medians, decks,
// parapets) become convex static colliders for the physics world.
//
//   const streets = yield* buildStreetSector({ pieces, junctions, sections, materials, raster });
//   group.add(streets.object3d);  physics.addStaticColliders(streets.colliders, ...);

import * as THREE from 'three';
import { crownHeight, KERB_HEIGHT, KERB_TOP_WIDTH } from './roadSampling.js';
import { createSurfaceGeometryBuffer } from './surfaceGeometryBuffer.js';

const SKIRT_DEPTH = 0.7;
const DECK_DEPTH = 1.1;
const PARAPET_HEIGHT = 0.95;
const PARAPET_WIDTH = 0.3;
const COLLIDER_DEPTH = 0.4;

/**
 * Builds one sector's streets.
 * @param {Object} options
 * @param {{line: import('./roadSampling.js').RoadCentreLine, from: number, to: number}[]} options.pieces
 * @param {ReturnType<import('./junctionLayout.js').layOutJunction>[]} options.junctions
 * @param {import('./roadSampling.js').RoadCrossSection[]} options.sections By segment id.
 * @param {Record<string, THREE.Material>} options.materials asphalt, dirtRoad, kerb, pavement,
 *   verge, median, concrete.
 * @param {ReturnType<import('./surfaceHeightRaster.js').createSurfaceHeightRaster>} options.raster
 * @param {(x: number, z: number) => number} [options.groundAt] Terrain height, for bridge piers.
 * @returns {{object3d: THREE.Group, colliders: Object[], geometries: THREE.BufferGeometry[]}}
 */
export function* buildStreetSector({ pieces, junctions, sections, materials, raster, groundAt }) {
  const buffers = {};
  const bufferFor = (name) => (buffers[name] ??= createSurfaceGeometryBuffer({ kerbDistance: name === 'asphalt' }));
  const colliders = [];

  // A generator: it yields after every road piece and junction so a job can slice the work.
  for (const piece of pieces) {
    buildRoadPiece(piece, sections[piece.line.segment.id], bufferFor, colliders, raster, groundAt);
    yield;
  }
  for (const junction of junctions) {
    if (junction) buildJunction(junction, bufferFor, colliders, raster);
    yield;
  }

  const object3d = new THREE.Group();
  object3d.name = 'streets';
  const geometries = [];
  for (const [name, buffer] of Object.entries(buffers)) {
    const geometry = buffer.toGeometry();
    if (!geometry) continue;
    geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, materials[name] ?? materials.concrete);
    mesh.name = `streets-${name}`;
    mesh.receiveShadow = true;
    mesh.castShadow = name === 'concrete';
    mesh.matrixAutoUpdate = false;
    object3d.add(mesh);
  }
  return { object3d, colliders, geometries };
}

/** A convex collider from two cross-section edges (each two points, inner then outer) of a strip. */
function slabCollider(colliders, a0, a1, b0, b1, top, bottom, surface) {
  const v = [];
  for (const p of [a0, a1, b1, b0]) v.push(p.x, p.y + top, p.z, p.x, p.y - bottom, p.z);
  colliders.push({ shape: 'hull', vertices: new Float64Array(v), surface });
}

function rasterQuad(raster, p0, p1, p2, p3, lift) {
  raster.addTriangle(p0.x, p0.y + lift, p0.z, p1.x, p1.y + lift, p1.z, p2.x, p2.y + lift, p2.z);
  raster.addTriangle(p0.x, p0.y + lift, p0.z, p2.x, p2.y + lift, p2.z, p3.x, p3.y + lift, p3.z);
}

/**
 * Distance in metres from offset `s` across the carriageway (right of the centre line) to the
 * nearest kerb: the road's edges and a raised median's sides, where rain water runs and stands.
 * @param {{halfWidth: number, median: ?number[]}} section A road cross-section (roadCrossSection).
 * @param {number} s
 */
export function kerbDistanceAcross(section, s) {
  let distance = Math.max(0, section.halfWidth - Math.abs(s));
  if (section.median) {
    const [m0, m1] = section.median;
    distance = Math.min(distance, s <= m0 ? m0 - s : s >= m1 ? s - m1 : 0);
  }
  return distance;
}

function buildRoadPiece({ line, from, to }, section, bufferFor, colliders, raster, groundAt) {
  const point = (i, s, lift = 0) => ({ x: line.x[i] - line.tz[i] * s, y: line.y[i] + lift, z: line.z[i] + line.tx[i] * s });

  // The carriageway, kerb to kerb, with its crown.
  const road = bufferFor(section.paved ? 'asphalt' : 'dirtRoad');
  const lateral = section.lateral;
  const kerbs = lateral.map((s) => kerbDistanceAcross(section, s));
  let previousRow = null;
  for (let i = from; i <= to; i += 1) {
    const row = lateral.map((s, k) => {
      const p = point(i, s, crownHeight(section, s));
      return road.addVertex(p.x, p.y, p.z, line.along[i], s, kerbs[k]);
    });
    if (previousRow) {
      // No asphalt under a raised median: its planted top is the surface there.
      const under = section.median ? lateral.indexOf(section.median[0]) : -1;
      for (let k = 0; k < lateral.length - 1; k += 1) if (k !== under) road.addQuadUp(previousRow[k], row[k], row[k + 1], previousRow[k + 1]);
      for (let k = 0; k < lateral.length - 1; k += 1) {
        if (k === under) continue;
        const a = point(i - 1, lateral[k], crownHeight(section, lateral[k]));
        const b = point(i, lateral[k], crownHeight(section, lateral[k]));
        const c = point(i, lateral[k + 1], crownHeight(section, lateral[k + 1]));
        const d = point(i - 1, lateral[k + 1], crownHeight(section, lateral[k + 1]));
        rasterQuad(raster, a, b, c, d, 0);
      }
    }
    previousRow = row;
  }

  // Both sides: a raised pavement behind a kerb, or a verge at road level.
  for (const side of [-1, 1]) {
    const outer = side < 0 ? section.outerLeft : section.outerRight;
    const raised = side < 0 ? section.kerbLeft : section.kerbRight;
    const hw = section.halfWidth;
    if (raised) {
      strip(bufferFor('kerb'), line, from, to, side * hw, side * hw, -0.03, KERB_HEIGHT, 'wall', -side);
      strip(bufferFor('kerb'), line, from, to, side * hw, side * (hw + KERB_TOP_WIDTH), KERB_HEIGHT, KERB_HEIGHT, 'top');
      strip(bufferFor('pavement'), line, from, to, side * (hw + KERB_TOP_WIDTH), side * outer, KERB_HEIGHT, KERB_HEIGHT, 'top');
    } else {
      strip(bufferFor(section.bridge ? 'concrete' : 'verge'), line, from, to, side * hw, side * outer, 0.01, 0.01, 'top');
    }
    const lift = raised ? KERB_HEIGHT : 0.01;
    if (!section.bridge) strip(bufferFor(raised ? 'pavement' : 'verge'), line, from, to, side * outer, side * outer, lift, -SKIRT_DEPTH, 'wall', side);
    for (let i = from + 1; i <= to; i += 1) {
      const a0 = point(i - 1, side * hw);
      const a1 = point(i - 1, side * outer);
      const b0 = point(i, side * hw);
      const b1 = point(i, side * outer);
      rasterQuad(raster, a0, b0, b1, a1, lift);
      if (raised) slabCollider(colliders, a0, a1, b0, b1, KERB_HEIGHT, COLLIDER_DEPTH, 'concrete');
    }
    if (section.bridge) {
      const parapetIn = side * (outer - PARAPET_WIDTH);
      const top = lift + PARAPET_HEIGHT;
      strip(bufferFor('concrete'), line, from, to, parapetIn, parapetIn, lift, top, 'wall', -side);
      strip(bufferFor('concrete'), line, from, to, parapetIn, side * outer, top, top, 'top');
      strip(bufferFor('concrete'), line, from, to, side * outer, side * outer, -DECK_DEPTH, top, 'wall', side);
      for (let i = from + 1; i <= to; i += 1) {
        slabCollider(colliders, point(i - 1, parapetIn), point(i - 1, side * outer), point(i, parapetIn), point(i, side * outer), top, 0, 'concrete');
      }
    }
  }

  if (section.median) {
    const [m0, m1] = section.median;
    strip(bufferFor('kerb'), line, from, to, m0, m0, 0, KERB_HEIGHT, 'wall', -1);
    strip(bufferFor('kerb'), line, from, to, m1, m1, 0, KERB_HEIGHT, 'wall', 1);
    strip(bufferFor('median'), line, from, to, m0, m1, KERB_HEIGHT, KERB_HEIGHT, 'top');
    for (let i = from + 1; i <= to; i += 1) {
      const a0 = point(i - 1, m0);
      const a1 = point(i - 1, m1);
      const b0 = point(i, m0);
      const b1 = point(i, m1);
      rasterQuad(raster, a0, b0, b1, a1, KERB_HEIGHT);
      slabCollider(colliders, a0, a1, b0, b1, KERB_HEIGHT, COLLIDER_DEPTH, 'grass');
    }
    // Noses where the median stops at a junction.
    for (const i of [from, to]) {
      if ((i === 0 && line.segment.trimA > 0) || (i === line.count - 1 && line.segment.trimB > 0)) {
        const buffer = bufferFor('kerb');
        const a = point(i, m0, 0);
        const b = point(i, m1, 0);
        const v0 = buffer.addVertex(a.x, a.y, a.z, 0, 0);
        const v1 = buffer.addVertex(b.x, b.y, b.z, m1 - m0, 0);
        const v2 = buffer.addVertex(b.x, b.y + KERB_HEIGHT, b.z, m1 - m0, KERB_HEIGHT);
        const v3 = buffer.addVertex(a.x, a.y + KERB_HEIGHT, a.z, 0, KERB_HEIGHT);
        const sign = i === 0 ? -1 : 1;
        buffer.addQuadFacing(v0, v1, v2, v3, line.tx[i] * sign, line.tz[i] * sign);
      }
    }
  }

  if (section.bridge) {
    const left = -section.outerLeft;
    const right = section.outerRight;
    strip(bufferFor('concrete'), line, from, to, left, right, -DECK_DEPTH, -DECK_DEPTH, 'bottom');
    for (let i = from + 1; i <= to; i += 1) {
      slabCollider(colliders, point(i - 1, left), point(i - 1, right), point(i, left), point(i, right), 0, DECK_DEPTH, 'concrete');
    }
    // Piers every PIER_SPACING metres, down to the ground or the sea floor.
    for (let i = from; i <= to; i += 1) {
      const along = line.along[i];
      if (i > 0 && Math.floor(line.along[i - 1] / PIER_SPACING) === Math.floor(along / PIER_SPACING)) continue;
      if (!groundAt) break;
      const ground = groundAt(line.x[i], line.z[i]);
      const top = line.y[i] - DECK_DEPTH;
      if (top - ground < 1) continue;
      addPier(bufferFor('concrete'), line, i, Math.min(left, -2) * 0.85, Math.max(right, 2) * 0.85, ground - 0.5, top);
    }
  }
}

const PIER_SPACING = 36;
/** A pier is a cap beam under the deck on two or three square columns. */
const PIER_CAP_DEPTH = 1.3;
const PIER_CAP_ALONG = 1.9;
const PIER_COLUMN = 1.25;

/** A pier under sample i: a cap beam across the deck from s0 to s1, columns down to the bottom. */
function addPier(buffer, line, i, s0, s1, bottom, top) {
  const capBottom = Math.max(bottom + 0.5, top - PIER_CAP_DEPTH);
  addPierBox(buffer, line, i, s0, s1, PIER_CAP_ALONG / 2, capBottom, top, true);
  const columns = s1 - s0 > 14 ? 3 : 2;
  const inset = PIER_COLUMN / 2 + 0.7;
  for (let c = 0; c < columns; c += 1) {
    const s = s0 + inset + ((s1 - s0 - 2 * inset) * c) / (columns - 1);
    addPierBox(buffer, line, i, s - PIER_COLUMN / 2, s + PIER_COLUMN / 2, PIER_COLUMN / 2, bottom, capBottom, false);
  }
}

/** An upright box at sample i, across from s0 to s1 and h either way along; with its underside. */
function addPierBox(buffer, line, i, s0, s1, h, bottom, top, underside) {
  const tx = line.tx[i];
  const tz = line.tz[i];
  const rx = -tz;
  const rz = tx;
  const corners = [[s0, -h], [s1, -h], [s1, h], [s0, h]].map(([s, a]) => ({ x: line.x[i] + rx * s + tx * a, z: line.z[i] + rz * s + tz * a }));
  for (let k = 0; k < 4; k += 1) {
    const p = corners[k];
    const q = corners[(k + 1) % 4];
    const width = Math.hypot(q.x - p.x, q.z - p.z);
    const mx = (p.x + q.x) / 2 - line.x[i] - rx * (s0 + s1) / 2;
    const mz = (p.z + q.z) / 2 - line.z[i] - rz * (s0 + s1) / 2;
    buffer.addQuadFacing(
      buffer.addVertex(p.x, bottom, p.z, 0, bottom),
      buffer.addVertex(q.x, bottom, q.z, width, bottom),
      buffer.addVertex(q.x, top, q.z, width, top),
      buffer.addVertex(p.x, top, p.z, 0, top),
      mx, mz,
    );
  }
  if (!underside) return;
  const v = corners.map((p) => buffer.addVertex(p.x, bottom, p.z, p.x, p.z));
  buffer.addQuadUp(v[0], v[1], v[2], v[3]);
  // Turn both triangles to face down.
  const n = buffer.indices.length;
  for (const k of [n - 6, n - 3]) {
    const t = buffer.indices[k + 1];
    buffer.indices[k + 1] = buffer.indices[k + 2];
    buffer.indices[k + 2] = t;
  }
}

/**
 * A strip along the samples between two lateral offsets and two lifts. 'top' and 'bottom' strips
 * are horizontal (s0 to s1 at lift0); 'wall' strips stand at s0 from lift0 to lift1 and face to
 * the right of the line when `facing` is 1, to the left when -1.
 */
function strip(buffer, line, from, to, s0, s1, lift0, lift1, kind, facing = 1) {
  let previous = null;
  for (let i = from; i <= to; i += 1) {
    const rx = -line.tz[i];
    const rz = line.tx[i];
    const x0 = line.x[i] + rx * s0;
    const z0 = line.z[i] + rz * s0;
    const x1 = line.x[i] + rx * s1;
    const z1 = line.z[i] + rz * s1;
    const y = line.y[i];
    const u = line.along[i];
    const row = kind === 'wall'
      ? [buffer.addVertex(x0, y + lift0, z0, u, lift0), buffer.addVertex(x0, y + lift1, z0, u, lift1)]
      : [buffer.addVertex(x0, y + lift0, z0, u, s0), buffer.addVertex(x1, y + lift1, z1, u, s1)];
    if (previous) {
      if (kind === 'wall') buffer.addQuadFacing(previous[0], row[0], row[1], previous[1], rx * facing, rz * facing);
      else if (kind === 'top') buffer.addQuadUp(previous[0], row[0], row[1], previous[1]);
      else {
        buffer.addQuadUp(previous[0], row[0], row[1], previous[1]);
        const n = buffer.indices.length;
        for (const k of [n - 6, n - 3]) {
          const t = buffer.indices[k + 1];
          buffer.indices[k + 1] = buffer.indices[k + 2];
          buffer.indices[k + 2] = t;
        }
      }
    }
    previous = row;
  }
}

function buildJunction(junction, bufferFor, colliders, raster) {
  const { ring, centre, corners } = junction;
  const asphalt = bufferFor('asphalt');
  const c = asphalt.addVertex(centre.x, centre.y, centre.z, centre.x, centre.z);
  const indices = ring.map((p) => asphalt.addVertex(p.x, p.y, p.z, p.x, p.z));
  for (let k = 0; k < ring.length; k += 1) {
    const a = ring[k];
    const b = ring[(k + 1) % ring.length];
    asphalt.addTriangleUp(c, indices[k], indices[(k + 1) % ring.length]);
    raster.addTriangle(centre.x, centre.y, centre.z, a.x, a.y, a.z, b.x, b.y, b.z);
  }

  for (const corner of corners) {
    const { kerb, outer, raised } = corner;
    const lift = raised ? KERB_HEIGHT : 0.01;
    const inner = kerb.map((p, k) => {
      if (!raised) return p;
      const dx = outer[k].x - p.x;
      const dz = outer[k].z - p.z;
      const d = Math.hypot(dx, dz) || 1;
      const w = Math.min(KERB_TOP_WIDTH, d * 0.5);
      return { x: p.x + (dx / d) * w, y: p.y, z: p.z + (dz / d) * w };
    });
    let arc = 0;
    for (let k = 1; k < kerb.length; k += 1) {
      const step = Math.hypot(kerb[k].x - kerb[k - 1].x, kerb[k].z - kerb[k - 1].z);
      const p0 = kerb[k - 1];
      const p1 = kerb[k];
      const o0 = outer[k - 1];
      const o1 = outer[k];
      const top = bufferFor(raised ? 'pavement' : 'verge');
      const i0 = inner[k - 1];
      const i1 = inner[k];
      const w0 = Math.hypot(o0.x - p0.x, o0.z - p0.z);
      const w1 = Math.hypot(o1.x - p1.x, o1.z - p1.z);
      top.addQuadUp(
        top.addVertex(i0.x, i0.y + lift, i0.z, arc, 0),
        top.addVertex(i1.x, i1.y + lift, i1.z, arc + step, 0),
        top.addVertex(o1.x, o1.y + lift, o1.z, arc + step, w1),
        top.addVertex(o0.x, o0.y + lift, o0.z, arc, w0),
      );
      rasterQuad(raster, p0, p1, o1, o0, lift);
      // The skirt behind the corner, facing away from the junction.
      const skirt = bufferFor(raised ? 'pavement' : 'verge');
      const ox = (o0.x + o1.x) / 2 - centre.x;
      const oz = (o0.z + o1.z) / 2 - centre.z;
      skirt.addQuadFacing(
        skirt.addVertex(o0.x, o0.y + lift, o0.z, arc, lift),
        skirt.addVertex(o1.x, o1.y + lift, o1.z, arc + step, lift),
        skirt.addVertex(o1.x, o1.y - SKIRT_DEPTH, o1.z, arc + step, -SKIRT_DEPTH),
        skirt.addVertex(o0.x, o0.y - SKIRT_DEPTH, o0.z, arc, -SKIRT_DEPTH),
        ox, oz,
      );
      if (raised) {
        const kerbBuffer = bufferFor('kerb');
        kerbBuffer.addQuadUp(
          kerbBuffer.addVertex(p0.x, p0.y + lift, p0.z, arc, 0),
          kerbBuffer.addVertex(p1.x, p1.y + lift, p1.z, arc + step, 0),
          kerbBuffer.addVertex(i1.x, i1.y + lift, i1.z, arc + step, KERB_TOP_WIDTH),
          kerbBuffer.addVertex(i0.x, i0.y + lift, i0.z, arc, KERB_TOP_WIDTH),
        );
        kerbBuffer.addQuadFacing(
          kerbBuffer.addVertex(p0.x, p0.y - 0.03, p0.z, arc, 0),
          kerbBuffer.addVertex(p1.x, p1.y - 0.03, p1.z, arc + step, 0),
          kerbBuffer.addVertex(p1.x, p1.y + lift, p1.z, arc + step, lift),
          kerbBuffer.addVertex(p0.x, p0.y + lift, p0.z, arc, lift),
          -ox, -oz,
        );
        slabCollider(colliders, p0, o0, p1, o1, KERB_HEIGHT, COLLIDER_DEPTH, 'concrete');
      }
      arc += step;
    }
  }
}

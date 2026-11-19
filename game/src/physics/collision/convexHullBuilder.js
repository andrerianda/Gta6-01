// Builds the convex hull of a point cloud as a ConvexPoly: the form in which hull collision
// proxies of the Blender assets (col_hull_*), building prisms and ramps enter the physics. An
// incremental hull over welded points, then coplanar triangles are merged into faces so that the
// separating-axis test sees each plane and each real edge once. Runs when a shape is created,
// never during a step.
import { ConvexPoly, setBoxPoly } from './ConvexPoly.js';

const IDENTITY = new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);

/**
 * Builds the convex hull of a set of points.
 * @param {ArrayLike<number>} points Positions, three numbers each (duplicates are fine).
 * @param {{offsetX?: number, offsetY?: number, offsetZ?: number, scale?: number}} [options] A
 *   translation added to and a uniform scale applied to every point first.
 * @returns {ConvexPoly} The hull, with arrays cut to size. Flat or tiny clouds give their
 *   bounding box (at least 2 cm thick) instead.
 */
export function buildConvexHullPoly(points, options = {}) {
  const scale = options.scale ?? 1;
  const offsetX = options.offsetX ?? 0;
  const offsetY = options.offsetY ?? 0;
  const offsetZ = options.offsetZ ?? 0;
  const welded = weldPoints(points, scale, offsetX, offsetY, offsetZ);
  const count = welded.length / 3;
  const bounds = boundsOf(welded);
  const extent = Math.max(bounds[3] - bounds[0], bounds[4] - bounds[1], bounds[5] - bounds[2], 1e-6);
  const epsilon = extent * 1e-6;
  const seed = count >= 4 ? findSeedTetrahedron(welded, count, extent) : null;
  if (!seed) return boundingBoxPoly(bounds);

  /** @type {{a: number, b: number, c: number, nx: number, ny: number, nz: number, d: number, alive: boolean}[]} */
  const faces = [];
  const edgeOwner = new Map();
  const interiorX = (welded[seed[0] * 3] + welded[seed[1] * 3] + welded[seed[2] * 3] + welded[seed[3] * 3]) / 4;
  const interiorY = (welded[seed[0] * 3 + 1] + welded[seed[1] * 3 + 1] + welded[seed[2] * 3 + 1] + welded[seed[3] * 3 + 1]) / 4;
  const interiorZ = (welded[seed[0] * 3 + 2] + welded[seed[1] * 3 + 2] + welded[seed[2] * 3 + 2] + welded[seed[3] * 3 + 2]) / 4;

  const addFace = (a, b, c) => {
    const ax = welded[a * 3];
    const ay = welded[a * 3 + 1];
    const az = welded[a * 3 + 2];
    const ux = welded[b * 3] - ax;
    const uy = welded[b * 3 + 1] - ay;
    const uz = welded[b * 3 + 2] - az;
    const vx = welded[c * 3] - ax;
    const vy = welded[c * 3 + 1] - ay;
    const vz = welded[c * 3 + 2] - az;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const length = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    nx /= length;
    ny /= length;
    nz /= length;
    const index = faces.length;
    faces.push({ a, b, c, nx, ny, nz, d: nx * ax + ny * ay + nz * az, alive: true });
    edgeOwner.set(a * count + b, index);
    edgeOwner.set(b * count + c, index);
    edgeOwner.set(c * count + a, index);
  };
  const addOutwardFace = (a, b, c) => {
    const nx = (welded[b * 3 + 1] - welded[a * 3 + 1]) * (welded[c * 3 + 2] - welded[a * 3 + 2])
      - (welded[b * 3 + 2] - welded[a * 3 + 2]) * (welded[c * 3 + 1] - welded[a * 3 + 1]);
    const ny = (welded[b * 3 + 2] - welded[a * 3 + 2]) * (welded[c * 3] - welded[a * 3])
      - (welded[b * 3] - welded[a * 3]) * (welded[c * 3 + 2] - welded[a * 3 + 2]);
    const nz = (welded[b * 3] - welded[a * 3]) * (welded[c * 3 + 1] - welded[a * 3 + 1])
      - (welded[b * 3 + 1] - welded[a * 3 + 1]) * (welded[c * 3] - welded[a * 3]);
    const side = nx * (interiorX - welded[a * 3]) + ny * (interiorY - welded[a * 3 + 1]) + nz * (interiorZ - welded[a * 3 + 2]);
    if (side > 0) addFace(a, c, b);
    else addFace(a, b, c);
  };
  addOutwardFace(seed[0], seed[1], seed[2]);
  addOutwardFace(seed[0], seed[1], seed[3]);
  addOutwardFace(seed[0], seed[2], seed[3]);
  addOutwardFace(seed[1], seed[2], seed[3]);

  const visible = [];
  const horizon = [];
  for (let p = 0; p < count; p += 1) {
    if (p === seed[0] || p === seed[1] || p === seed[2] || p === seed[3]) continue;
    const px = welded[p * 3];
    const py = welded[p * 3 + 1];
    const pz = welded[p * 3 + 2];
    visible.length = 0;
    for (let f = 0; f < faces.length; f += 1) {
      const face = faces[f];
      if (face.alive && face.nx * px + face.ny * py + face.nz * pz - face.d > epsilon * 10) visible.push(f);
    }
    if (visible.length === 0) continue;
    horizon.length = 0;
    for (const f of visible) faces[f].alive = false;
    for (const f of visible) {
      const face = faces[f];
      collectHorizon(face.a, face.b, count, edgeOwner, faces, horizon);
      collectHorizon(face.b, face.c, count, edgeOwner, faces, horizon);
      collectHorizon(face.c, face.a, count, edgeOwner, faces, horizon);
    }
    for (let i = 0; i < horizon.length; i += 2) addFace(horizon[i], horizon[i + 1], p);
  }
  return polyFromTriangles(welded, count, faces.filter((face) => face.alive), extent);
}

function collectHorizon(a, b, count, edgeOwner, faces, horizon) {
  const twin = edgeOwner.get(b * count + a);
  if (twin !== undefined && faces[twin].alive) horizon.push(a, b);
}

function weldPoints(points, scale, offsetX, offsetY, offsetZ) {
  const seen = new Set();
  const welded = [];
  for (let i = 0; i + 2 < points.length; i += 3) {
    const x = points[i] * scale + offsetX;
    const y = points[i + 1] * scale + offsetY;
    const z = points[i + 2] * scale + offsetZ;
    const key = `${Math.round(x * 5000)},${Math.round(y * 5000)},${Math.round(z * 5000)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    welded.push(x, y, z);
  }
  return welded;
}

function boundsOf(points) {
  const bounds = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let i = 0; i < points.length; i += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      if (points[i + axis] < bounds[axis]) bounds[axis] = points[i + axis];
      if (points[i + axis] > bounds[axis + 3]) bounds[axis + 3] = points[i + axis];
    }
  }
  if (points.length === 0) return [0, 0, 0, 0, 0, 0];
  return bounds;
}

function boundingBoxPoly(bounds) {
  const poly = new ConvexPoly(8, 6, 12);
  setBoxPoly(poly, (bounds[0] + bounds[3]) / 2, (bounds[1] + bounds[4]) / 2, (bounds[2] + bounds[5]) / 2, IDENTITY,
    Math.max((bounds[3] - bounds[0]) / 2, 0.01), Math.max((bounds[4] - bounds[1]) / 2, 0.01),
    Math.max((bounds[5] - bounds[2]) / 2, 0.01));
  return poly;
}

function findSeedTetrahedron(points, count, extent) {
  let first = 0;
  for (let i = 1; i < count; i += 1) if (points[i * 3] < points[first * 3]) first = i;
  let second = -1;
  let best = extent * extent * 1e-8;
  for (let i = 0; i < count; i += 1) {
    const distance = squaredDistance(points, i, first);
    if (distance > best) {
      best = distance;
      second = i;
    }
  }
  if (second < 0) return null;
  const ax = points[first * 3];
  const ay = points[first * 3 + 1];
  const az = points[first * 3 + 2];
  const ux = points[second * 3] - ax;
  const uy = points[second * 3 + 1] - ay;
  const uz = points[second * 3 + 2] - az;
  let third = -1;
  best = extent * extent * extent * extent * 1e-8;
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0; i < count; i += 1) {
    const vx = points[i * 3] - ax;
    const vy = points[i * 3 + 1] - ay;
    const vz = points[i * 3 + 2] - az;
    const cx = uy * vz - uz * vy;
    const cy = uz * vx - ux * vz;
    const cz = ux * vy - uy * vx;
    const area = cx * cx + cy * cy + cz * cz;
    if (area > best) {
      best = area;
      third = i;
      nx = cx;
      ny = cy;
      nz = cz;
    }
  }
  if (third < 0) return null;
  const length = Math.sqrt(nx * nx + ny * ny + nz * nz);
  nx /= length;
  ny /= length;
  nz /= length;
  let fourth = -1;
  best = extent * 1e-4;
  for (let i = 0; i < count; i += 1) {
    const height = Math.abs(nx * (points[i * 3] - ax) + ny * (points[i * 3 + 1] - ay) + nz * (points[i * 3 + 2] - az));
    if (height > best) {
      best = height;
      fourth = i;
    }
  }
  if (fourth < 0) return null;
  return [first, second, third, fourth];
}

function squaredDistance(points, i, j) {
  const dx = points[i * 3] - points[j * 3];
  const dy = points[i * 3 + 1] - points[j * 3 + 1];
  const dz = points[i * 3 + 2] - points[j * 3 + 2];
  return dx * dx + dy * dy + dz * dz;
}

/** Turns the hull's triangles into vertices, merged face planes and real edges. */
function polyFromTriangles(points, count, triangles, extent) {
  // Group coplanar triangles into planes.
  const planes = [];
  const planeOf = new Array(triangles.length);
  const planeTolerance = Math.max(extent * 2e-4, 1e-5);
  for (let t = 0; t < triangles.length; t += 1) {
    const tri = triangles[t];
    let found = -1;
    for (let p = 0; p < planes.length; p += 1) {
      const plane = planes[p];
      if (plane.nx * tri.nx + plane.ny * tri.ny + plane.nz * tri.nz > 0.99995 && Math.abs(plane.d - tri.d) < planeTolerance) {
        found = p;
        break;
      }
    }
    if (found < 0) {
      found = planes.length;
      planes.push({ nx: tri.nx, ny: tri.ny, nz: tri.nz, d: tri.d });
    }
    planeOf[t] = found;
  }
  // Used vertices, renumbered.
  const remap = new Map();
  const use = (index) => {
    if (!remap.has(index)) remap.set(index, remap.size);
    return remap.get(index);
  };
  // Real edges: shared by two triangles of different planes.
  const edgePlane = new Map();
  const edges = [];
  for (let t = 0; t < triangles.length; t += 1) {
    const tri = triangles[t];
    const corners = [use(tri.a), use(tri.b), use(tri.c)];
    for (let e = 0; e < 3; e += 1) {
      const a = corners[e];
      const b = corners[(e + 1) % 3];
      const key = a < b ? a * 65536 + b : b * 65536 + a;
      const other = edgePlane.get(key);
      if (other === undefined) edgePlane.set(key, planeOf[t]);
      else if (other !== planeOf[t]) edges.push(Math.min(a, b), Math.max(a, b));
    }
  }
  // Faces: one of each parallel pair first, so the unique set leads.
  const leading = [];
  const trailing = [];
  for (const plane of planes) {
    const opposite = leading.some((other) => other.nx * plane.nx + other.ny * plane.ny + other.nz * plane.nz < -0.99995);
    (opposite ? trailing : leading).push(plane);
  }
  const ordered = leading.concat(trailing);
  // Distinct edge directions.
  const vertexCount = remap.size;
  const verts = new Float64Array(vertexCount * 3);
  for (const [index, slot] of remap) {
    verts[slot * 3] = points[index * 3];
    verts[slot * 3 + 1] = points[index * 3 + 1];
    verts[slot * 3 + 2] = points[index * 3 + 2];
  }
  const dirs = [];
  for (let e = 0; e < edges.length; e += 2) {
    let dx = verts[edges[e + 1] * 3] - verts[edges[e] * 3];
    let dy = verts[edges[e + 1] * 3 + 1] - verts[edges[e] * 3 + 1];
    let dz = verts[edges[e + 1] * 3 + 2] - verts[edges[e] * 3 + 2];
    const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (length < 1e-9) continue;
    dx /= length;
    dy /= length;
    dz /= length;
    let known = false;
    for (let d = 0; d < dirs.length; d += 3) {
      if (Math.abs(dirs[d] * dx + dirs[d + 1] * dy + dirs[d + 2] * dz) > 0.99995) {
        known = true;
        break;
      }
    }
    if (!known) dirs.push(dx, dy, dz);
  }
  const poly = new ConvexPoly(vertexCount, ordered.length, Math.max(edges.length / 2, dirs.length / 3));
  poly.vertexCount = vertexCount;
  poly.verts.set(verts);
  poly.faceCount = ordered.length;
  poly.uniqueFaceCount = leading.length;
  for (let f = 0; f < ordered.length; f += 1) {
    poly.faceNormals[f * 3] = ordered[f].nx;
    poly.faceNormals[f * 3 + 1] = ordered[f].ny;
    poly.faceNormals[f * 3 + 2] = ordered[f].nz;
    poly.faceOffsets[f] = ordered[f].d;
  }
  poly.edgeCount = edges.length / 2;
  poly.edges.set(edges);
  poly.edgeDirCount = dirs.length / 3;
  poly.edgeDirs.set(dirs);
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (let i = 0; i < vertexCount; i += 1) {
    cx += verts[i * 3];
    cy += verts[i * 3 + 1];
    cz += verts[i * 3 + 2];
  }
  poly.cx = cx / vertexCount;
  poly.cy = cy / vertexCount;
  poly.cz = cz / vertexCount;
  poly.radius = 0;
  return poly;
}

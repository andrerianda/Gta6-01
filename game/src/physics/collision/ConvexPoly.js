// A convex collision piece: a convex polytope core (its vertices, face planes and edges) plus a
// rounding radius. A box is a polytope with radius 0; a sphere is one vertex with a radius; a
// capsule is one edge with a radius. Every narrow-phase routine (separating axes, manifolds, ray
// and sphere casts) works on this one form, so every shape pair is handled by the same code.
// The setters below fill a piece in place without allocating, for scratch pieces that are
// rebuilt for each test; bodies keep one local piece and one world piece per shape.

const BOX_EDGES = new Uint16Array([0, 1, 2, 3, 4, 5, 6, 7, 0, 2, 1, 3, 4, 6, 5, 7, 0, 4, 1, 5, 2, 6, 3, 7]);

/** How many sides the polytope that stands in for a cylinder has. */
export const CYLINDER_SIDES = 12;

const RING_COS = new Float64Array(CYLINDER_SIDES);
const RING_SIN = new Float64Array(CYLINDER_SIDES);
const FACE_COS = new Float64Array(CYLINDER_SIDES);
const FACE_SIN = new Float64Array(CYLINDER_SIDES);
for (let i = 0; i < CYLINDER_SIDES; i += 1) {
  const angle = (i / CYLINDER_SIDES) * Math.PI * 2;
  const faceAngle = ((i + 0.5) / CYLINDER_SIDES) * Math.PI * 2;
  RING_COS[i] = Math.cos(angle);
  RING_SIN[i] = Math.sin(angle);
  FACE_COS[i] = Math.cos(faceAngle);
  FACE_SIN[i] = Math.sin(faceAngle);
}
const RING_APOTHEM = Math.sqrt(Math.cos(Math.PI / CYLINDER_SIDES));
const RING_CORNER = 1 / RING_APOTHEM;

export class ConvexPoly {
  /**
   * @param {number} [maxVertices] Initial vertex capacity.
   * @param {number} [maxFaces] Initial face capacity.
   * @param {number} [maxEdges] Initial edge capacity.
   */
  constructor(maxVertices = 24, maxFaces = 14, maxEdges = 36) {
    /** How many vertices the core has. */
    this.vertexCount = 0;
    /** Vertex positions, three numbers each. */
    this.verts = new Float64Array(maxVertices * 3);
    /** How many face planes the core has. */
    this.faceCount = 0;
    /** Outward unit normals of the faces, three numbers each. */
    this.faceNormals = new Float64Array(maxFaces * 3);
    /** Plane offsets: a point p is on face i when normal_i . p equals faceOffsets[i]. */
    this.faceOffsets = new Float64Array(maxFaces);
    /** The first this many faces have pairwise non-parallel normals: the separating-axis set. */
    this.uniqueFaceCount = 0;
    /** How many edges the core has. */
    this.edgeCount = 0;
    /** Vertex index pairs of the edges. */
    this.edges = new Uint16Array(maxEdges * 2);
    /** How many distinct edge directions the core has. */
    this.edgeDirCount = 0;
    /** Distinct unit edge directions, three numbers each. */
    this.edgeDirs = new Float64Array(maxEdges * 3);
    /** The rounding radius around the core. */
    this.radius = 0;
    /** A point inside the core (its centre). */
    this.cx = 0;
    this.cy = 0;
    this.cz = 0;
  }

  /**
   * Makes room for a shape of the given size (contents are not kept).
   * @param {number} vertices Vertex count.
   * @param {number} faces Face count.
   * @param {number} edges Edge count.
   */
  reserve(vertices, faces, edges) {
    if (this.verts.length < vertices * 3) this.verts = new Float64Array(vertices * 3);
    if (this.faceOffsets.length < faces) {
      this.faceNormals = new Float64Array(faces * 3);
      this.faceOffsets = new Float64Array(faces);
    }
    if (this.edges.length < edges * 2) {
      this.edges = new Uint16Array(edges * 2);
      this.edgeDirs = new Float64Array(edges * 3);
    }
  }

  /**
   * A copy with arrays cut to size, for shapes that are kept.
   * @returns {ConvexPoly}
   */
  clone() {
    const copy = new ConvexPoly(this.vertexCount, this.faceCount, Math.max(this.edgeCount, this.edgeDirCount));
    copyPoly(this, copy);
    return copy;
  }
}

/**
 * Copies one piece into another.
 * @param {ConvexPoly} from The source.
 * @param {ConvexPoly} to The destination.
 * @returns {ConvexPoly} `to`.
 */
export function copyPoly(from, to) {
  to.reserve(from.vertexCount, from.faceCount, Math.max(from.edgeCount, from.edgeDirCount));
  to.vertexCount = from.vertexCount;
  to.faceCount = from.faceCount;
  to.uniqueFaceCount = from.uniqueFaceCount;
  to.edgeCount = from.edgeCount;
  to.edgeDirCount = from.edgeDirCount;
  to.radius = from.radius;
  to.cx = from.cx;
  to.cy = from.cy;
  to.cz = from.cz;
  for (let i = 0; i < from.vertexCount * 3; i += 1) to.verts[i] = from.verts[i];
  for (let i = 0; i < from.faceCount * 3; i += 1) to.faceNormals[i] = from.faceNormals[i];
  for (let i = 0; i < from.faceCount; i += 1) to.faceOffsets[i] = from.faceOffsets[i];
  for (let i = 0; i < from.edgeCount * 2; i += 1) to.edges[i] = from.edges[i];
  for (let i = 0; i < from.edgeDirCount * 3; i += 1) to.edgeDirs[i] = from.edgeDirs[i];
  return to;
}

/**
 * Fills a piece with an oriented box.
 * @param {ConvexPoly} poly The piece to fill.
 * @param {number} cx Centre X.
 * @param {number} cy Centre Y.
 * @param {number} cz Centre Z.
 * @param {ArrayLike<number>} r The box's rotation matrix (row order), read from `rOffset`.
 * @param {number} hx Half size along the box's X.
 * @param {number} hy Half size along the box's Y.
 * @param {number} hz Half size along the box's Z.
 * @param {number} [rOffset] Where the matrix starts in `r`.
 * @returns {ConvexPoly} `poly`.
 */
export function setBoxPoly(poly, cx, cy, cz, r, hx, hy, hz, rOffset = 0) {
  const xx = r[rOffset];
  const yx = r[rOffset + 1];
  const zx = r[rOffset + 2];
  const xy = r[rOffset + 3];
  const yy = r[rOffset + 4];
  const zy = r[rOffset + 5];
  const xz = r[rOffset + 6];
  const yz = r[rOffset + 7];
  const zz = r[rOffset + 8];
  const verts = poly.verts;
  for (let i = 0; i < 8; i += 1) {
    const sx = i & 1 ? hx : -hx;
    const sy = i & 2 ? hy : -hy;
    const sz = i & 4 ? hz : -hz;
    verts[i * 3] = cx + xx * sx + yx * sy + zx * sz;
    verts[i * 3 + 1] = cy + xy * sx + yy * sy + zy * sz;
    verts[i * 3 + 2] = cz + xz * sx + yz * sy + zz * sz;
  }
  const normals = poly.faceNormals;
  const offsets = poly.faceOffsets;
  const dirs = poly.edgeDirs;
  normals[0] = dirs[0] = xx;
  normals[1] = dirs[1] = xy;
  normals[2] = dirs[2] = xz;
  normals[3] = dirs[3] = yx;
  normals[4] = dirs[4] = yy;
  normals[5] = dirs[5] = yz;
  normals[6] = dirs[6] = zx;
  normals[7] = dirs[7] = zy;
  normals[8] = dirs[8] = zz;
  const centreX = xx * cx + xy * cy + xz * cz;
  const centreY = yx * cx + yy * cy + yz * cz;
  const centreZ = zx * cx + zy * cy + zz * cz;
  offsets[0] = centreX + hx;
  offsets[1] = centreY + hy;
  offsets[2] = centreZ + hz;
  for (let i = 0; i < 9; i += 1) normals[9 + i] = -normals[i];
  offsets[3] = hx - centreX;
  offsets[4] = hy - centreY;
  offsets[5] = hz - centreZ;
  for (let i = 0; i < 24; i += 1) poly.edges[i] = BOX_EDGES[i];
  poly.vertexCount = 8;
  poly.faceCount = 6;
  poly.uniqueFaceCount = 3;
  poly.edgeCount = 12;
  poly.edgeDirCount = 3;
  poly.radius = 0;
  poly.cx = cx;
  poly.cy = cy;
  poly.cz = cz;
  return poly;
}

/**
 * Fills a piece with a capsule: the segment A-B swollen by a radius.
 * @param {ConvexPoly} poly The piece to fill.
 * @returns {ConvexPoly} `poly`.
 */
export function setCapsulePoly(poly, ax, ay, az, bx, by, bz, radius) {
  const verts = poly.verts;
  verts[0] = ax;
  verts[1] = ay;
  verts[2] = az;
  verts[3] = bx;
  verts[4] = by;
  verts[5] = bz;
  poly.vertexCount = 2;
  poly.faceCount = 0;
  poly.uniqueFaceCount = 0;
  poly.edgeCount = 1;
  poly.edges[0] = 0;
  poly.edges[1] = 1;
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (length > 1e-9) {
    poly.edgeDirCount = 1;
    poly.edgeDirs[0] = dx / length;
    poly.edgeDirs[1] = dy / length;
    poly.edgeDirs[2] = dz / length;
  } else {
    poly.edgeDirCount = 0;
  }
  poly.radius = radius;
  poly.cx = (ax + bx) * 0.5;
  poly.cy = (ay + by) * 0.5;
  poly.cz = (az + bz) * 0.5;
  return poly;
}

/**
 * Fills a piece with a sphere.
 * @param {ConvexPoly} poly The piece to fill.
 * @returns {ConvexPoly} `poly`.
 */
export function setSpherePoly(poly, x, y, z, radius) {
  poly.verts[0] = x;
  poly.verts[1] = y;
  poly.verts[2] = z;
  poly.vertexCount = 1;
  poly.faceCount = 0;
  poly.uniqueFaceCount = 0;
  poly.edgeCount = 1;
  poly.edges[0] = 0;
  poly.edges[1] = 0;
  poly.edgeDirCount = 0;
  poly.radius = radius;
  poly.cx = x;
  poly.cy = y;
  poly.cz = z;
  return poly;
}

/**
 * Fills a piece with a triangle (a flat polytope whose front is its counter-clockwise side).
 * @param {ConvexPoly} poly The piece to fill.
 * @returns {boolean} False for a degenerate triangle, which is left unusable.
 */
export function setTrianglePoly(poly, ax, ay, az, bx, by, bz, cx, cy, cz) {
  const e0x = bx - ax;
  const e0y = by - ay;
  const e0z = bz - az;
  const e1x = cx - bx;
  const e1y = cy - by;
  const e1z = cz - bz;
  const e2x = ax - cx;
  const e2y = ay - cy;
  const e2z = az - cz;
  let nx = e0y * e1z - e0z * e1y;
  let ny = e0z * e1x - e0x * e1z;
  let nz = e0x * e1y - e0y * e1x;
  const area = Math.sqrt(nx * nx + ny * ny + nz * nz);
  if (area < 1e-10) return false;
  nx /= area;
  ny /= area;
  nz /= area;
  const verts = poly.verts;
  verts[0] = ax;
  verts[1] = ay;
  verts[2] = az;
  verts[3] = bx;
  verts[4] = by;
  verts[5] = bz;
  verts[6] = cx;
  verts[7] = cy;
  verts[8] = cz;
  const normals = poly.faceNormals;
  const offsets = poly.faceOffsets;
  const dirs = poly.edgeDirs;
  normals[0] = nx;
  normals[1] = ny;
  normals[2] = nz;
  offsets[0] = nx * ax + ny * ay + nz * az;
  writeSide(normals, offsets, dirs, 1, e0x, e0y, e0z, nx, ny, nz, ax, ay, az);
  writeSide(normals, offsets, dirs, 2, e1x, e1y, e1z, nx, ny, nz, bx, by, bz);
  writeSide(normals, offsets, dirs, 3, e2x, e2y, e2z, nx, ny, nz, cx, cy, cz);
  normals[12] = -nx;
  normals[13] = -ny;
  normals[14] = -nz;
  offsets[4] = -offsets[0];
  poly.edges[0] = 0;
  poly.edges[1] = 1;
  poly.edges[2] = 1;
  poly.edges[3] = 2;
  poly.edges[4] = 2;
  poly.edges[5] = 0;
  poly.vertexCount = 3;
  poly.faceCount = 5;
  poly.uniqueFaceCount = 4;
  poly.edgeCount = 3;
  poly.edgeDirCount = 3;
  poly.radius = 0;
  poly.cx = (ax + bx + cx) / 3;
  poly.cy = (ay + by + cy) / 3;
  poly.cz = (az + bz + cz) / 3;
  return true;
}

function writeSide(normals, offsets, dirs, index, ex, ey, ez, nx, ny, nz, px, py, pz) {
  const length = Math.sqrt(ex * ex + ey * ey + ez * ez) || 1;
  const dx = ex / length;
  const dy = ey / length;
  const dz = ez / length;
  dirs[(index - 1) * 3] = dx;
  dirs[(index - 1) * 3 + 1] = dy;
  dirs[(index - 1) * 3 + 2] = dz;
  // The in-plane outward normal of the edge: edge direction cross triangle normal.
  const sx = dy * nz - dz * ny;
  const sy = dz * nx - dx * nz;
  const sz = dx * ny - dy * nx;
  normals[index * 3] = sx;
  normals[index * 3 + 1] = sy;
  normals[index * 3 + 2] = sz;
  offsets[index] = sx * px + sy * py + sz * pz;
}

/**
 * Fills a piece with a cylinder, as a prism of CYLINDER_SIDES sides around the rotation's Y axis.
 * @param {ConvexPoly} poly The piece to fill.
 * @param {number} cx Centre X.
 * @param {number} cy Centre Y.
 * @param {number} cz Centre Z.
 * @param {ArrayLike<number>} r The rotation matrix (row order), read from `rOffset`.
 * @param {number} radius The cylinder's radius.
 * @param {number} halfHeight Half its length along its axis.
 * @param {number} [rOffset] Where the matrix starts in `r`.
 * @returns {ConvexPoly} `poly`.
 */
export function setCylinderPoly(poly, cx, cy, cz, r, radius, halfHeight, rOffset = 0) {
  const n = CYLINDER_SIDES;
  const half = n / 2;
  poly.reserve(n * 2, n + 2, n * 3);
  const xx = r[rOffset];
  const yx = r[rOffset + 1];
  const zx = r[rOffset + 2];
  const xy = r[rOffset + 3];
  const yy = r[rOffset + 4];
  const zy = r[rOffset + 5];
  const xz = r[rOffset + 6];
  const yz = r[rOffset + 7];
  const zz = r[rOffset + 8];
  const verts = poly.verts;
  const normals = poly.faceNormals;
  const offsets = poly.faceOffsets;
  const dirs = poly.edgeDirs;
  const edges = poly.edges;
  const corner = radius * RING_CORNER;
  const apothem = radius * RING_APOTHEM;
  const centreDotAxis = yx * cx + yy * cy + yz * cz;
  for (let i = 0; i < n; i += 1) {
    const ux = xx * RING_COS[i] + zx * RING_SIN[i];
    const uy = xy * RING_COS[i] + zy * RING_SIN[i];
    const uz = xz * RING_COS[i] + zz * RING_SIN[i];
    const top = i * 3;
    const bottom = (i + n) * 3;
    verts[top] = cx + ux * corner + yx * halfHeight;
    verts[top + 1] = cy + uy * corner + yy * halfHeight;
    verts[top + 2] = cz + uz * corner + yz * halfHeight;
    verts[bottom] = cx + ux * corner - yx * halfHeight;
    verts[bottom + 1] = cy + uy * corner - yy * halfHeight;
    verts[bottom + 2] = cz + uz * corner - yz * halfHeight;
    const next = (i + 1) % n;
    edges[i * 2] = i;
    edges[i * 2 + 1] = next;
    edges[(n + i) * 2] = n + i;
    edges[(n + i) * 2 + 1] = n + next;
    edges[(2 * n + i) * 2] = i;
    edges[(2 * n + i) * 2 + 1] = n + i;
    // Side faces: the first half of the ring, the cap, then the opposite sides and cap.
    const fx = xx * FACE_COS[i] + zx * FACE_SIN[i];
    const fy = xy * FACE_COS[i] + zy * FACE_SIN[i];
    const fz = xz * FACE_COS[i] + zz * FACE_SIN[i];
    const face = i < half ? i : i + 1;
    normals[face * 3] = fx;
    normals[face * 3 + 1] = fy;
    normals[face * 3 + 2] = fz;
    offsets[face] = fx * cx + fy * cy + fz * cz + apothem;
    if (i < half) {
      // Ring edge i runs along the tangent of side face i.
      dirs[i * 3] = fy * yz - fz * yy;
      dirs[i * 3 + 1] = fz * yx - fx * yz;
      dirs[i * 3 + 2] = fx * yy - fy * yx;
    }
  }
  normals[half * 3] = yx;
  normals[half * 3 + 1] = yy;
  normals[half * 3 + 2] = yz;
  offsets[half] = centreDotAxis + halfHeight;
  normals[(n + 1) * 3] = -yx;
  normals[(n + 1) * 3 + 1] = -yy;
  normals[(n + 1) * 3 + 2] = -yz;
  offsets[n + 1] = halfHeight - centreDotAxis;
  dirs[half * 3] = yx;
  dirs[half * 3 + 1] = yy;
  dirs[half * 3 + 2] = yz;
  poly.vertexCount = n * 2;
  poly.faceCount = n + 2;
  poly.uniqueFaceCount = half + 1;
  poly.edgeCount = n * 3;
  poly.edgeDirCount = half + 1;
  poly.radius = 0;
  poly.cx = cx;
  poly.cy = cy;
  poly.cz = cz;
  return poly;
}

/**
 * Fills a world piece from a local piece and a rigid transform.
 * @param {ConvexPoly} local The piece in local space.
 * @param {number} px Translation X.
 * @param {number} py Translation Y.
 * @param {number} pz Translation Z.
 * @param {ArrayLike<number>} r The rotation matrix (row order), read from `rOffset`.
 * @param {ConvexPoly} world Receives the transformed piece.
 * @param {number} [rOffset] Where the matrix starts in `r`.
 * @returns {ConvexPoly} `world`.
 */
export function transformPoly(local, px, py, pz, r, world, rOffset = 0) {
  world.reserve(local.vertexCount, local.faceCount, Math.max(local.edgeCount, local.edgeDirCount));
  const r0 = r[rOffset];
  const r1 = r[rOffset + 1];
  const r2 = r[rOffset + 2];
  const r3 = r[rOffset + 3];
  const r4 = r[rOffset + 4];
  const r5 = r[rOffset + 5];
  const r6 = r[rOffset + 6];
  const r7 = r[rOffset + 7];
  const r8 = r[rOffset + 8];
  const lv = local.verts;
  const wv = world.verts;
  for (let i = 0, end = local.vertexCount * 3; i < end; i += 3) {
    const x = lv[i];
    const y = lv[i + 1];
    const z = lv[i + 2];
    wv[i] = px + r0 * x + r1 * y + r2 * z;
    wv[i + 1] = py + r3 * x + r4 * y + r5 * z;
    wv[i + 2] = pz + r6 * x + r7 * y + r8 * z;
  }
  const ln = local.faceNormals;
  const wn = world.faceNormals;
  const lo = local.faceOffsets;
  const wo = world.faceOffsets;
  for (let i = 0, f = 0, end = local.faceCount * 3; i < end; i += 3, f += 1) {
    const x = ln[i];
    const y = ln[i + 1];
    const z = ln[i + 2];
    const nx = r0 * x + r1 * y + r2 * z;
    const ny = r3 * x + r4 * y + r5 * z;
    const nz = r6 * x + r7 * y + r8 * z;
    wn[i] = nx;
    wn[i + 1] = ny;
    wn[i + 2] = nz;
    wo[f] = lo[f] + nx * px + ny * py + nz * pz;
  }
  const ld = local.edgeDirs;
  const wd = world.edgeDirs;
  for (let i = 0, end = local.edgeDirCount * 3; i < end; i += 3) {
    const x = ld[i];
    const y = ld[i + 1];
    const z = ld[i + 2];
    wd[i] = r0 * x + r1 * y + r2 * z;
    wd[i + 1] = r3 * x + r4 * y + r5 * z;
    wd[i + 2] = r6 * x + r7 * y + r8 * z;
  }
  const le = local.edges;
  const we = world.edges;
  for (let i = 0, end = local.edgeCount * 2; i < end; i += 1) we[i] = le[i];
  world.vertexCount = local.vertexCount;
  world.faceCount = local.faceCount;
  world.uniqueFaceCount = local.uniqueFaceCount;
  world.edgeCount = local.edgeCount;
  world.edgeDirCount = local.edgeDirCount;
  world.radius = local.radius;
  world.cx = px + r0 * local.cx + r1 * local.cy + r2 * local.cz;
  world.cy = py + r3 * local.cx + r4 * local.cy + r5 * local.cz;
  world.cz = pz + r6 * local.cx + r7 * local.cy + r8 * local.cz;
  return world;
}

/**
 * The axis-aligned bounds of a piece, radius included.
 * @param {ConvexPoly} poly The piece.
 * @param {Float64Array} out Receives minX, minY, minZ, maxX, maxY, maxZ from `offset`.
 * @param {number} [offset] Where to write in `out`.
 */
export function boundsOfPoly(poly, out, offset = 0) {
  const verts = poly.verts;
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let i = 0, end = poly.vertexCount * 3; i < end; i += 3) {
    const x = verts[i];
    const y = verts[i + 1];
    const z = verts[i + 2];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  const radius = poly.radius;
  out[offset] = minX - radius;
  out[offset + 1] = minY - radius;
  out[offset + 2] = minZ - radius;
  out[offset + 3] = maxX + radius;
  out[offset + 4] = maxY + radius;
  out[offset + 5] = maxZ + radius;
}

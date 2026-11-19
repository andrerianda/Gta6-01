// Exact ray tests against each collision shape: oriented box, sphere, cylinder, capsule, convex
// piece and triangle. Every function takes the ray as an origin, a unit direction and a maximum
// distance, and writes the hit distance and surface normal into a RayShapeHit. A ray that starts
// inside a solid shape does not hit it.

/**
 * The result of a ray test against one shape.
 * @typedef {object} RayShapeHit
 * @property {number} t Distance along the ray.
 * @property {number} nx The surface normal at the hit, a unit vector.
 * @property {number} ny
 * @property {number} nz
 */

/**
 * Tests a ray against an oriented box.
 * @param {number} ox Ray origin.
 * @param {number} oy
 * @param {number} oz
 * @param {number} dx Ray direction (unit).
 * @param {number} dy
 * @param {number} dz
 * @param {number} maxT The furthest distance that counts.
 * @param {number} cx Box centre.
 * @param {number} cy
 * @param {number} cz
 * @param {ArrayLike<number>} r Box rotation matrix (row order), read from `rOffset`.
 * @param {number} rOffset Where the matrix starts in `r`.
 * @param {number} hx Half sizes.
 * @param {number} hy
 * @param {number} hz
 * @param {RayShapeHit} out Receives the hit.
 * @returns {boolean} True on a hit within `maxT`.
 */
export function rayAgainstBox(ox, oy, oz, dx, dy, dz, maxT, cx, cy, cz, r, rOffset, hx, hy, hz, out) {
  const px = ox - cx;
  const py = oy - cy;
  const pz = oz - cz;
  let tEnter = -Infinity;
  let tExit = Infinity;
  let axis = -1;
  let sign = 0;
  for (let i = 0; i < 3; i += 1) {
    const ax = r[rOffset + i];
    const ay = r[rOffset + 3 + i];
    const az = r[rOffset + 6 + i];
    const half = i === 0 ? hx : i === 1 ? hy : hz;
    const origin = px * ax + py * ay + pz * az;
    const direction = dx * ax + dy * ay + dz * az;
    if (direction > -1e-12 && direction < 1e-12) {
      if (origin > half || origin < -half) return false;
      continue;
    }
    const inverse = 1 / direction;
    let t0 = (-half - origin) * inverse;
    let t1 = (half - origin) * inverse;
    let entrySign = -1;
    if (t0 > t1) {
      const swap = t0;
      t0 = t1;
      t1 = swap;
      entrySign = 1;
    }
    if (t0 > tEnter) {
      tEnter = t0;
      axis = i;
      sign = entrySign;
    }
    if (t1 < tExit) tExit = t1;
    if (tEnter > tExit) return false;
  }
  if (tEnter < 0 || tEnter > maxT || axis < 0) return false;
  out.t = tEnter;
  out.nx = r[rOffset + axis] * sign;
  out.ny = r[rOffset + 3 + axis] * sign;
  out.nz = r[rOffset + 6 + axis] * sign;
  return true;
}

/**
 * Tests a ray against a sphere.
 * @returns {boolean} True on a hit within `maxT`.
 */
export function rayAgainstSphere(ox, oy, oz, dx, dy, dz, maxT, cx, cy, cz, radius, out) {
  const px = ox - cx;
  const py = oy - cy;
  const pz = oz - cz;
  const b = px * dx + py * dy + pz * dz;
  const c = px * px + py * py + pz * pz - radius * radius;
  if (c <= 0) return false;
  const discriminant = b * b - c;
  if (discriminant < 0) return false;
  const t = -b - Math.sqrt(discriminant);
  if (t < 0 || t > maxT) return false;
  const inverse = 1 / radius;
  out.t = t;
  out.nx = (px + dx * t) * inverse;
  out.ny = (py + dy * t) * inverse;
  out.nz = (pz + dz * t) * inverse;
  return true;
}

/**
 * Tests a ray against a cylinder whose axis is the Y axis of its rotation.
 * @returns {boolean} True on a hit within `maxT`.
 */
export function rayAgainstCylinder(ox, oy, oz, dx, dy, dz, maxT, cx, cy, cz, r, rOffset, radius, halfHeight, out) {
  const px = ox - cx;
  const py = oy - cy;
  const pz = oz - cz;
  const ax = r[rOffset + 1];
  const ay = r[rOffset + 4];
  const az = r[rOffset + 7];
  const originAxial = px * ax + py * ay + pz * az;
  const directionAxial = dx * ax + dy * ay + dz * az;
  // The ray with its axial part removed.
  const qx = px - ax * originAxial;
  const qy = py - ay * originAxial;
  const qz = pz - az * originAxial;
  const ex = dx - ax * directionAxial;
  const ey = dy - ay * directionAxial;
  const ez = dz - az * directionAxial;
  const a = ex * ex + ey * ey + ez * ez;
  const b = qx * ex + qy * ey + qz * ez;
  const c = qx * qx + qy * qy + qz * qz - radius * radius;
  let sideEnter = -Infinity;
  let sideExit = Infinity;
  if (a < 1e-12) {
    if (c > 0) return false;
  } else {
    const discriminant = b * b - a * c;
    if (discriminant < 0) return false;
    const root = Math.sqrt(discriminant);
    sideEnter = (-b - root) / a;
    sideExit = (-b + root) / a;
  }
  let capEnter = -Infinity;
  let capExit = Infinity;
  let capSign = 0;
  if (directionAxial > -1e-12 && directionAxial < 1e-12) {
    if (originAxial > halfHeight || originAxial < -halfHeight) return false;
  } else {
    const inverse = 1 / directionAxial;
    capEnter = (-halfHeight - originAxial) * inverse;
    capExit = (halfHeight - originAxial) * inverse;
    capSign = -1;
    if (capEnter > capExit) {
      const swap = capEnter;
      capEnter = capExit;
      capExit = swap;
      capSign = 1;
    }
  }
  const tEnter = sideEnter > capEnter ? sideEnter : capEnter;
  const tExit = sideExit < capExit ? sideExit : capExit;
  if (tEnter > tExit || tEnter < 0 || tEnter > maxT) return false;
  out.t = tEnter;
  if (sideEnter > capEnter) {
    const inverse = 1 / radius;
    out.nx = (qx + ex * tEnter) * inverse;
    out.ny = (qy + ey * tEnter) * inverse;
    out.nz = (qz + ez * tEnter) * inverse;
  } else {
    out.nx = ax * capSign;
    out.ny = ay * capSign;
    out.nz = az * capSign;
  }
  return true;
}

/**
 * Tests a ray against a capsule: the segment A-B swollen by a radius.
 * @returns {boolean} True on a hit within `maxT`.
 */
export function rayAgainstCapsule(ox, oy, oz, dx, dy, dz, maxT, ax, ay, az, bx, by, bz, radius, out) {
  const bax = bx - ax;
  const bay = by - ay;
  const baz = bz - az;
  const oax = ox - ax;
  const oay = oy - ay;
  const oaz = oz - az;
  const baba = bax * bax + bay * bay + baz * baz;
  const bard = bax * dx + bay * dy + baz * dz;
  const baoa = bax * oax + bay * oay + baz * oaz;
  const rdoa = dx * oax + dy * oay + dz * oaz;
  const oaoa = oax * oax + oay * oay + oaz * oaz;
  let best = Infinity;
  if (baba > 1e-12) {
    const a = baba - bard * bard;
    const b = baba * rdoa - baoa * bard;
    const c = baba * oaoa - baoa * baoa - radius * radius * baba;
    const h = b * b - a * c;
    if (a > 1e-12 && h >= 0) {
      const t = (-b - Math.sqrt(h)) / a;
      const y = baoa + t * bard;
      if (t >= 0 && y > 0 && y < baba) {
        best = t;
        const along = y / baba;
        const inverse = 1 / radius;
        out.nx = (oax + dx * t - bax * along) * inverse;
        out.ny = (oay + dy * t - bay * along) * inverse;
        out.nz = (oaz + dz * t - baz * along) * inverse;
      }
    }
  }
  for (let end = 0; end < 2; end += 1) {
    const px = end === 0 ? oax : ox - bx;
    const py = end === 0 ? oay : oy - by;
    const pz = end === 0 ? oaz : oz - bz;
    const b = px * dx + py * dy + pz * dz;
    const c = px * px + py * py + pz * pz - radius * radius;
    if (c <= 0) return false;
    const h = b * b - c;
    if (h < 0) continue;
    const t = -b - Math.sqrt(h);
    if (t >= 0 && t < best) {
      best = t;
      const inverse = 1 / radius;
      out.nx = (px + dx * t) * inverse;
      out.ny = (py + dy * t) * inverse;
      out.nz = (pz + dz * t) * inverse;
    }
  }
  if (best > maxT) return false;
  out.t = best;
  return true;
}

/**
 * Tests a ray against a convex piece: a polytope, a sphere (one vertex) or a capsule (one edge).
 * @param {import('./ConvexPoly.js').ConvexPoly} poly The piece, in the ray's space.
 * @returns {boolean} True on a hit within `maxT`.
 */
export function rayAgainstPoly(ox, oy, oz, dx, dy, dz, maxT, poly, out) {
  const verts = poly.verts;
  if (poly.faceCount === 0) {
    if (poly.vertexCount === 1) {
      return rayAgainstSphere(ox, oy, oz, dx, dy, dz, maxT, verts[0], verts[1], verts[2], poly.radius, out);
    }
    return rayAgainstCapsule(ox, oy, oz, dx, dy, dz, maxT, verts[0], verts[1], verts[2], verts[3], verts[4], verts[5],
      poly.radius, out);
  }
  const normals = poly.faceNormals;
  const offsets = poly.faceOffsets;
  let tEnter = -Infinity;
  let tExit = Infinity;
  let face = -1;
  for (let i = 0, f = 0, end = poly.faceCount * 3; i < end; i += 3, f += 1) {
    const nx = normals[i];
    const ny = normals[i + 1];
    const nz = normals[i + 2];
    const distance = nx * ox + ny * oy + nz * oz - offsets[f];
    const approach = nx * dx + ny * dy + nz * dz;
    if (approach > -1e-12 && approach < 1e-12) {
      if (distance > 0) return false;
      continue;
    }
    const t = -distance / approach;
    if (approach < 0) {
      if (t > tEnter) {
        tEnter = t;
        face = i;
      }
    } else if (t < tExit) {
      tExit = t;
    }
    if (tEnter > tExit) return false;
  }
  if (face < 0 || tEnter < 0 || tEnter > maxT) return false;
  out.t = tEnter;
  out.nx = normals[face];
  out.ny = normals[face + 1];
  out.nz = normals[face + 2];
  return true;
}

/**
 * Tests a ray against a triangle, from either side.
 * @returns {boolean} True on a hit within `maxT`; the normal faces the ray's origin.
 */
export function rayAgainstTriangle(ox, oy, oz, dx, dy, dz, maxT, ax, ay, az, bx, by, bz, cx, cy, cz, out) {
  const e1x = bx - ax;
  const e1y = by - ay;
  const e1z = bz - az;
  const e2x = cx - ax;
  const e2y = cy - ay;
  const e2z = cz - az;
  const px = dy * e2z - dz * e2y;
  const py = dz * e2x - dx * e2z;
  const pz = dx * e2y - dy * e2x;
  const determinant = e1x * px + e1y * py + e1z * pz;
  if (determinant > -1e-12 && determinant < 1e-12) return false;
  const inverse = 1 / determinant;
  const sx = ox - ax;
  const sy = oy - ay;
  const sz = oz - az;
  const u = (sx * px + sy * py + sz * pz) * inverse;
  if (u < -1e-7 || u > 1 + 1e-7) return false;
  const qx = sy * e1z - sz * e1y;
  const qy = sz * e1x - sx * e1z;
  const qz = sx * e1y - sy * e1x;
  const v = (dx * qx + dy * qy + dz * qz) * inverse;
  if (v < -1e-7 || u + v > 1 + 1e-7) return false;
  const t = (e2x * qx + e2y * qy + e2z * qz) * inverse;
  if (t < 0 || t > maxT) return false;
  let nx = e1y * e2z - e1z * e2y;
  let ny = e1z * e2x - e1x * e2z;
  let nz = e1x * e2y - e1y * e2x;
  const length = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
  const facing = nx * dx + ny * dy + nz * dz > 0 ? -1 / length : 1 / length;
  out.t = t;
  out.nx = nx * facing;
  out.ny = ny * facing;
  out.nz = nz * facing;
  return true;
}

/**
 * Creates an empty result object for the ray tests.
 * @returns {RayShapeHit}
 */
export function createRayShapeHit() {
  return { t: 0, nx: 0, ny: 1, nz: 0 };
}

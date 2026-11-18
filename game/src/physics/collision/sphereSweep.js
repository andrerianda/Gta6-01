// A sphere swept along a straight line against a convex piece, exact for round corners: the
// sphere's centre is tested as a ray against the piece's faces pushed out by the radius, against
// a capsule around every edge, and the sweep reports contact at distance 0 when the sphere
// already touches the piece. Used for thrown objects, camera probes and the sphere cast query.
import { rayAgainstCapsule, rayAgainstSphere, createRayShapeHit } from './rayShapes.js';
import { ConvexPoly, setSpherePoly } from './ConvexPoly.js';
import { createSeparatingAxis, findSeparatingAxis } from './separatingAxis.js';

const probe = new ConvexPoly(1, 0, 1);
const axis = createSeparatingAxis();
const edgeHit = createRayShapeHit();

/**
 * Sweeps a sphere against a convex piece.
 * @param {number} ox Start of the sphere's centre.
 * @param {number} oy
 * @param {number} oz
 * @param {number} dx Direction of travel (unit).
 * @param {number} dy
 * @param {number} dz
 * @param {number} maxT How far the sphere travels.
 * @param {number} radius The sphere's radius.
 * @param {import('./ConvexPoly.js').ConvexPoly} poly The piece.
 * @param {import('./rayShapes.js').RayShapeHit} out Receives the distance travelled before
 *   touching and the contact normal (from the piece towards the sphere).
 * @returns {boolean} True when the sphere touches the piece within `maxT`.
 */
export function sweepSphereAgainstPoly(ox, oy, oz, dx, dy, dz, maxT, radius, poly, out) {
  const reach = radius + poly.radius;
  // Already touching at the start?
  setSpherePoly(probe, ox, oy, oz, 0);
  probe.radius = 1e-9;
  if (findSeparatingAxis(probe, poly, reach, axis) && axis.separation <= reach) {
    out.t = 0;
    out.nx = -axis.nx;
    out.ny = -axis.ny;
    out.nz = -axis.nz;
    return true;
  }
  const verts = poly.verts;
  const normals = poly.faceNormals;
  const offsets = poly.faceOffsets;
  let best = maxT;
  let found = false;
  // Faces: the centre meets the face plane pushed out by the reach, above the face itself.
  for (let i = 0, f = 0, end = poly.faceCount * 3; i < end; i += 3, f += 1) {
    const nx = normals[i];
    const ny = normals[i + 1];
    const nz = normals[i + 2];
    const approach = nx * dx + ny * dy + nz * dz;
    if (approach >= -1e-12) continue;
    const t = (offsets[f] + reach - (nx * ox + ny * oy + nz * oz)) / approach;
    if (t < 0 || t >= best) continue;
    const qx = ox + dx * t - nx * reach;
    const qy = oy + dy * t - ny * reach;
    const qz = oz + dz * t - nz * reach;
    let inside = true;
    for (let j = 0, g = 0; j < end; j += 3, g += 1) {
      if (g !== f && normals[j] * qx + normals[j + 1] * qy + normals[j + 2] * qz - offsets[g] > 1e-6) {
        inside = false;
        break;
      }
    }
    if (!inside) continue;
    best = t;
    found = true;
    out.nx = nx;
    out.ny = ny;
    out.nz = nz;
  }
  // Edges and corners: a capsule of the reach around every edge (a sphere for a lone vertex).
  const edges = poly.edges;
  for (let e = 0, end = poly.edgeCount * 2; e < end; e += 2) {
    const a = edges[e] * 3;
    const b = edges[e + 1] * 3;
    const hit = a === b
      ? rayAgainstSphere(ox, oy, oz, dx, dy, dz, best, verts[a], verts[a + 1], verts[a + 2], reach, edgeHit)
      : rayAgainstCapsule(ox, oy, oz, dx, dy, dz, best, verts[a], verts[a + 1], verts[a + 2],
        verts[b], verts[b + 1], verts[b + 2], reach, edgeHit);
    if (hit && edgeHit.t < best) {
      best = edgeHit.t;
      found = true;
      out.nx = edgeHit.nx;
      out.ny = edgeHit.ny;
      out.nz = edgeHit.nz;
    }
  }
  if (!found) return false;
  out.t = best;
  return true;
}

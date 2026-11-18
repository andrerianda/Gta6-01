// Access to the triangles of a placed triangle-mesh collider in world space: which triangles are
// near a world box, and one of them as a convex piece, so that contacts, sweeps and overlap tests
// treat a mesh as a handful of flat convex pieces and need no code of their own.
import { setTrianglePoly } from './ConvexPoly.js';

/**
 * Finds the triangles of a mesh collider whose bounds touch a world-space box.
 * @param {import('./StaticColliderSet.js').StaticColliderSet} set The collider set.
 * @param {number} index The index of a MESH collider.
 * @param {number} minX The box, in world space.
 * @param {number} minY
 * @param {number} minZ
 * @param {number} maxX
 * @param {number} maxY
 * @param {number} maxZ
 * @returns {number} How many triangle numbers were written to `meshTriangleIds`.
 */
export function gatherMeshTriangles(set, index, minX, minY, minZ, maxX, maxY, maxZ) {
  const mesh = /** @type {import('./TriangleMesh.js').TriangleMesh} */ (set.shape[index]);
  const p = index * 3;
  const r = index * 9;
  const m = set.rotation;
  const cx = (minX + maxX) * 0.5 - set.position[p];
  const cy = (minY + maxY) * 0.5 - set.position[p + 1];
  const cz = (minZ + maxZ) * 0.5 - set.position[p + 2];
  const ex = (maxX - minX) * 0.5;
  const ey = (maxY - minY) * 0.5;
  const ez = (maxZ - minZ) * 0.5;
  // The box in the mesh's own space: its centre rotated back, its half size grown to cover it.
  const lx = m[r] * cx + m[r + 3] * cy + m[r + 6] * cz;
  const ly = m[r + 1] * cx + m[r + 4] * cy + m[r + 7] * cz;
  const lz = m[r + 2] * cx + m[r + 5] * cy + m[r + 8] * cz;
  const hx = Math.abs(m[r]) * ex + Math.abs(m[r + 3]) * ey + Math.abs(m[r + 6]) * ez;
  const hy = Math.abs(m[r + 1]) * ex + Math.abs(m[r + 4]) * ey + Math.abs(m[r + 7]) * ez;
  const hz = Math.abs(m[r + 2]) * ex + Math.abs(m[r + 5]) * ey + Math.abs(m[r + 8]) * ez;
  return mesh.queryBox(lx - hx, ly - hy, lz - hz, lx + hx, ly + hy, lz + hz, meshTriangleIds);
}

/** The triangle numbers the last gatherMeshTriangles() call found. */
export const meshTriangleIds = new Int32Array(192);

/**
 * Fills a convex piece with one triangle of a mesh collider, in world space.
 * @param {import('./StaticColliderSet.js').StaticColliderSet} set The collider set.
 * @param {number} index The index of a MESH collider.
 * @param {number} triangle A triangle number from `meshTriangleIds`.
 * @param {import('./ConvexPoly.js').ConvexPoly} poly The piece to fill.
 * @returns {boolean} False for a degenerate triangle.
 */
export function setWorldTriangle(set, index, triangle, poly) {
  const mesh = /** @type {import('./TriangleMesh.js').TriangleMesh} */ (set.shape[index]);
  const corners = mesh.corners;
  const base = triangle * 9;
  const p = index * 3;
  const r = index * 9;
  const m = set.rotation;
  const px = set.position[p];
  const py = set.position[p + 1];
  const pz = set.position[p + 2];
  for (let corner = 0; corner < 3; corner += 1) {
    const x = corners[base + corner * 3];
    const y = corners[base + corner * 3 + 1];
    const z = corners[base + corner * 3 + 2];
    worldCorners[corner * 3] = px + m[r] * x + m[r + 1] * y + m[r + 2] * z;
    worldCorners[corner * 3 + 1] = py + m[r + 3] * x + m[r + 4] * y + m[r + 5] * z;
    worldCorners[corner * 3 + 2] = pz + m[r + 6] * x + m[r + 7] * y + m[r + 8] * z;
  }
  return setTrianglePoly(poly, worldCorners[0], worldCorners[1], worldCorners[2], worldCorners[3], worldCorners[4],
    worldCorners[5], worldCorners[6], worldCorners[7], worldCorners[8]);
}

const worldCorners = new Float64Array(9);

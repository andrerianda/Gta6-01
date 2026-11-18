// A growing buffer of triangles for one material of one sector (all the asphalt, all the kerb
// stone ...), turned into a single BufferGeometry when the sector is complete, so a sector costs
// a handful of draw calls. Horizontal pieces are wound to face up and walls to face a given way,
// whatever order their points come in. UVs are in metres (the surface library's convention).
// A buffer made with { kerbDistance: true } also keeps, per vertex, how near the nearest kerb is
// (attribute KERB_NEARNESS_ATTRIBUTE = 1 - distance / KERB_REACH, 0 from KERB_REACH metres on and
// wherever no kerb is near, so a mesh without the attribute reads as "no kerb"), which the
// asphalt reads for the standing water along the gutters (streets/kerbPuddles.js).

import * as THREE from 'three';

/** The vertex attribute that holds the nearness of the nearest kerb, 1 at it, 0 far. */
export const KERB_NEARNESS_ATTRIBUTE = 'kerbNearness';
/** Kerbs farther than this (metres) count as not near. */
export const KERB_REACH = 4;

/**
 * Creates an empty buffer.
 * @param {{kerbDistance?: boolean}} [options] kerbDistance: keep the per-vertex kerb nearness
 *   (addVertex's sixth argument is the distance to the nearest kerb in metres; none: far).
 * @returns {{positions: number[], uvs: number[], indices: number[], vertexCount: number,
 *   addVertex: (x: number, y: number, z: number, u: number, v: number, kerb?: number) => number,
 *   addTriangleUp: (a: number, b: number, c: number) => void,
 *   addQuadUp: (a: number, b: number, c: number, d: number) => void,
 *   addQuadFacing: (a: number, b: number, c: number, d: number, nx: number, nz: number) => void,
 *   toGeometry: () => ?THREE.BufferGeometry}}
 */
export function createSurfaceGeometryBuffer(options = {}) {
  const positions = [];
  const uvs = [];
  const indices = [];
  const kerbs = options.kerbDistance ? [] : null;

  function addVertex(x, y, z, u, v, kerb = Infinity) {
    positions.push(x, y, z);
    uvs.push(u, v);
    if (kerbs) kerbs.push(Math.max(0, 1 - kerb / KERB_REACH));
    return positions.length / 3 - 1;
  }

  /** The Y component of the normal of triangle a, b, c (counter-clockwise front). */
  function normalY(a, b, c) {
    const ax = positions[a * 3];
    const az = positions[a * 3 + 2];
    const ux = positions[b * 3] - ax;
    const uz = positions[b * 3 + 2] - az;
    const vx = positions[c * 3] - ax;
    const vz = positions[c * 3 + 2] - az;
    return uz * vx - ux * vz;
  }

  function addTriangleUp(a, b, c) {
    if (normalY(a, b, c) >= 0) indices.push(a, b, c);
    else indices.push(a, c, b);
  }

  return {
    positions,
    uvs,
    indices,
    get vertexCount() {
      return positions.length / 3;
    },
    addVertex,
    addTriangleUp,
    /** Two triangles over a, b, c, d (in order round the quad), facing up. */
    addQuadUp(a, b, c, d) {
      addTriangleUp(a, b, c);
      addTriangleUp(a, c, d);
    },
    /** A wall quad a, b, c, d (in order round it) whose front faces the horizontal (nx, nz). */
    addQuadFacing(a, b, c, d, nx, nz) {
      const ux = positions[b * 3] - positions[a * 3];
      const uy = positions[b * 3 + 1] - positions[a * 3 + 1];
      const uz = positions[b * 3 + 2] - positions[a * 3 + 2];
      const vx = positions[c * 3] - positions[a * 3];
      const vy = positions[c * 3 + 1] - positions[a * 3 + 1];
      const vz = positions[c * 3 + 2] - positions[a * 3 + 2];
      const facing = (uy * vz - uz * vy) * nx + (ux * vy - uy * vx) * nz;
      if (facing >= 0) indices.push(a, b, c, a, c, d);
      else indices.push(a, c, b, a, d, c);
    },
    /** The finished geometry with normals, or null when nothing was added. */
    toGeometry() {
      if (indices.length === 0) return null;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      if (kerbs) geometry.setAttribute(KERB_NEARNESS_ATTRIBUTE, new THREE.Float32BufferAttribute(kerbs, 1));
      geometry.setIndex(positions.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(indices, 1) : new THREE.Uint16BufferAttribute(indices, 1));
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      geometry.computeBoundingBox();
      return geometry;
    },
  };
}

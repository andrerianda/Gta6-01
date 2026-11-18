// A growing buffer of triangles for one material of one sector (all the asphalt, all the kerb
// stone ...), turned into a single BufferGeometry when the sector is complete, so a sector costs
// a handful of draw calls. Horizontal pieces are wound to face up and walls to face a given way,
// whatever order their points come in. UVs are in metres (the surface library's convention).

import * as THREE from 'three';

/**
 * Creates an empty buffer.
 * @returns {{positions: number[], uvs: number[], indices: number[], vertexCount: number,
 *   addVertex: (x: number, y: number, z: number, u: number, v: number) => number,
 *   addTriangleUp: (a: number, b: number, c: number) => void,
 *   addQuadUp: (a: number, b: number, c: number, d: number) => void,
 *   addQuadFacing: (a: number, b: number, c: number, d: number, nx: number, nz: number) => void,
 *   toGeometry: () => ?THREE.BufferGeometry}}
 */
export function createSurfaceGeometryBuffer() {
  const positions = [];
  const uvs = [];
  const indices = [];

  function addVertex(x, y, z, u, v) {
    positions.push(x, y, z);
    uvs.push(u, v);
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
      geometry.setIndex(positions.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(indices, 1) : new THREE.Uint16BufferAttribute(indices, 1));
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      geometry.computeBoundingBox();
      return geometry;
    },
  };
}

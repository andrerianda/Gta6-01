// A static triangle mesh collider (the col_mesh_* proxies of the Blender assets, and any ground
// that is not the height field): the triangles in the mesh's own space with a bounding-box tree
// over them, so that a ray or a box query touches only the few triangles near it. One mesh is
// built once and shared by every placed copy.
import { rayAgainstTriangle, createRayShapeHit } from './rayShapes.js';

const LEAF_SIZE = 4;
const stack = new Int32Array(96);
const triangleHit = createRayShapeHit();

export class TriangleMesh {
  /**
   * @param {ArrayLike<number>} vertices Positions, three numbers each.
   * @param {ArrayLike<number> | null} [indices] Triangle corner indices; without them every
   *   three vertices are one triangle.
   * @param {{scale?: number}} [options] A uniform scale applied to the vertices.
   */
  constructor(vertices, indices = null, options = {}) {
    const scale = options.scale ?? 1;
    const triangleCount = Math.floor((indices ? indices.length : vertices.length / 3) / 3);
    /** How many triangles the mesh has. */
    this.triangleCount = triangleCount;
    /** Corner positions, nine numbers per triangle, in tree order. */
    this.corners = new Float32Array(triangleCount * 9);
    for (let t = 0; t < triangleCount; t += 1) {
      for (let corner = 0; corner < 3; corner += 1) {
        const vertex = indices ? indices[t * 3 + corner] : t * 3 + corner;
        this.corners[t * 9 + corner * 3] = vertices[vertex * 3] * scale;
        this.corners[t * 9 + corner * 3 + 1] = vertices[vertex * 3 + 1] * scale;
        this.corners[t * 9 + corner * 3 + 2] = vertices[vertex * 3 + 2] * scale;
      }
    }
    const maxNodes = Math.max(1, triangleCount * 2);
    /** Node bounds: minX, minY, minZ, maxX, maxY, maxZ per node. */
    this.nodeBounds = new Float32Array(maxNodes * 6);
    /** Per node: the index of its second child, or -1 for a leaf (the first child is next). */
    this.nodeRight = new Int32Array(maxNodes);
    /** Per leaf: its first triangle. */
    this.nodeStart = new Int32Array(maxNodes);
    /** Per leaf: how many triangles it holds. */
    this.nodeCount = new Int32Array(maxNodes);
    /** How many nodes the tree has. */
    this.nodeTotal = 0;
    /** The bounds of the whole mesh in its own space. */
    this.bounds = new Float64Array(6);
    if (triangleCount > 0) {
      this.#build(0, triangleCount);
      for (let i = 0; i < 6; i += 1) this.bounds[i] = this.nodeBounds[i];
    }
  }

  #build(start, count) {
    const node = this.nodeTotal;
    this.nodeTotal += 1;
    const corners = this.corners;
    const bounds = this.nodeBounds;
    const base = node * 6;
    bounds[base] = bounds[base + 1] = bounds[base + 2] = Infinity;
    bounds[base + 3] = bounds[base + 4] = bounds[base + 5] = -Infinity;
    for (let i = start * 9, end = (start + count) * 9; i < end; i += 3) {
      for (let axis = 0; axis < 3; axis += 1) {
        const value = corners[i + axis];
        // Float32 rounding must never shrink the box.
        if (value < bounds[base + axis]) bounds[base + axis] = value - 1e-4;
        if (value > bounds[base + 3 + axis]) bounds[base + 3 + axis] = value + 1e-4;
      }
    }
    if (count <= LEAF_SIZE) {
      this.nodeRight[node] = -1;
      this.nodeStart[node] = start;
      this.nodeCount[node] = count;
      return node;
    }
    // Split at the middle of the longest side, by triangle centre.
    let axis = 0;
    let longest = bounds[base + 3] - bounds[base];
    for (let i = 1; i < 3; i += 1) {
      if (bounds[base + 3 + i] - bounds[base + i] > longest) {
        longest = bounds[base + 3 + i] - bounds[base + i];
        axis = i;
      }
    }
    const middle = (bounds[base + axis] + bounds[base + 3 + axis]) * 0.5;
    let low = start;
    let high = start + count - 1;
    while (low <= high) {
      const centre = (corners[low * 9 + axis] + corners[low * 9 + 3 + axis] + corners[low * 9 + 6 + axis]) / 3;
      if (centre < middle) {
        low += 1;
      } else {
        for (let k = 0; k < 9; k += 1) {
          const swap = corners[low * 9 + k];
          corners[low * 9 + k] = corners[high * 9 + k];
          corners[high * 9 + k] = swap;
        }
        high -= 1;
      }
    }
    let leftCount = low - start;
    if (leftCount === 0 || leftCount === count) leftCount = count >> 1;
    this.#build(start, leftCount);
    this.nodeRight[node] = this.#build(start + leftCount, count - leftCount);
    return node;
  }

  /**
   * Casts a ray in the mesh's own space.
   * @param {number} ox Ray origin.
   * @param {number} oy
   * @param {number} oz
   * @param {number} dx Ray direction (unit).
   * @param {number} dy
   * @param {number} dz
   * @param {number} maxT The furthest distance that counts.
   * @param {import('./rayShapes.js').RayShapeHit} out Receives the nearest hit.
   * @returns {boolean} True on a hit.
   */
  raycast(ox, oy, oz, dx, dy, dz, maxT, out) {
    if (this.triangleCount === 0) return false;
    const bounds = this.nodeBounds;
    const corners = this.corners;
    const inverseX = 1 / (dx === 0 ? 1e-30 : dx);
    const inverseY = 1 / (dy === 0 ? 1e-30 : dy);
    const inverseZ = 1 / (dz === 0 ? 1e-30 : dz);
    let best = maxT;
    let found = false;
    let top = 0;
    stack[top++] = 0;
    while (top > 0) {
      const node = stack[--top];
      const base = node * 6;
      let t0 = (bounds[base] - ox) * inverseX;
      let t1 = (bounds[base + 3] - ox) * inverseX;
      let near = t0 < t1 ? t0 : t1;
      let far = t0 < t1 ? t1 : t0;
      t0 = (bounds[base + 1] - oy) * inverseY;
      t1 = (bounds[base + 4] - oy) * inverseY;
      near = Math.max(near, t0 < t1 ? t0 : t1);
      far = Math.min(far, t0 < t1 ? t1 : t0);
      t0 = (bounds[base + 2] - oz) * inverseZ;
      t1 = (bounds[base + 5] - oz) * inverseZ;
      near = Math.max(near, t0 < t1 ? t0 : t1);
      far = Math.min(far, t0 < t1 ? t1 : t0);
      if (near > far || far < 0 || near > best) continue;
      const right = this.nodeRight[node];
      if (right >= 0) {
        if (top + 2 > stack.length) continue;
        stack[top++] = right;
        stack[top++] = node + 1;
        continue;
      }
      for (let t = this.nodeStart[node], end = t + this.nodeCount[node]; t < end; t += 1) {
        const c = t * 9;
        if (rayAgainstTriangle(ox, oy, oz, dx, dy, dz, best, corners[c], corners[c + 1], corners[c + 2],
          corners[c + 3], corners[c + 4], corners[c + 5], corners[c + 6], corners[c + 7], corners[c + 8], triangleHit)) {
          best = triangleHit.t;
          found = true;
          out.t = triangleHit.t;
          out.nx = triangleHit.nx;
          out.ny = triangleHit.ny;
          out.nz = triangleHit.nz;
        }
      }
    }
    return found;
  }

  /**
   * Finds the triangles whose bounds touch a box, in the mesh's own space.
   * @param {number} minX The box.
   * @param {number} minY
   * @param {number} minZ
   * @param {number} maxX
   * @param {number} maxY
   * @param {number} maxZ
   * @param {Int32Array} out Receives triangle numbers (multiply by 9 to index `corners`).
   * @returns {number} How many triangles were written (at most out.length).
   */
  queryBox(minX, minY, minZ, maxX, maxY, maxZ, out) {
    if (this.triangleCount === 0) return 0;
    const bounds = this.nodeBounds;
    let count = 0;
    let top = 0;
    stack[top++] = 0;
    while (top > 0) {
      const node = stack[--top];
      const base = node * 6;
      if (bounds[base] > maxX || bounds[base + 3] < minX || bounds[base + 1] > maxY || bounds[base + 4] < minY
        || bounds[base + 2] > maxZ || bounds[base + 5] < minZ) continue;
      const right = this.nodeRight[node];
      if (right >= 0) {
        if (top + 2 > stack.length) continue;
        stack[top++] = right;
        stack[top++] = node + 1;
        continue;
      }
      for (let t = this.nodeStart[node], end = t + this.nodeCount[node]; t < end && count < out.length; t += 1) {
        count += 1;
        out[count - 1] = t;
      }
    }
    return count;
  }
}

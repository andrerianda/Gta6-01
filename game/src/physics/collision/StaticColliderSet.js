// The static colliders of the world and their broad phase: buildings, walls, poles, curbs, ramps,
// standing props and trigger volumes, kept as plain numbers in typed arrays (a city sector holds
// thousands) and indexed by a spatial hash over the ground plane. Colliders are added and removed
// by handle or by group (a sector id), which is how the city streams them in and out.
import {
  ConvexPoly, boundsOfPoly, setBoxPoly, setCapsulePoly, setCylinderPoly, setSpherePoly, transformPoly,
} from './ConvexPoly.js';
import {
  createRayShapeHit, rayAgainstBox, rayAgainstCapsule, rayAgainstCylinder, rayAgainstPoly, rayAgainstSphere,
} from './rayShapes.js';

/** The shapes a static collider can have. */
export const COLLIDER_TYPE = Object.freeze({ BOX: 1, CYLINDER: 2, SPHERE: 3, CAPSULE: 4, HULL: 5, MESH: 6 });

const INDEX_RANGE = 4194304;
const LARGE_CELL_COUNT = 144;
const shapeHit = createRayShapeHit();

/** A growable list of collider indices that queries fill. */
export class IndexList {
  /** @param {number} [capacity] Initial capacity. */
  constructor(capacity = 64) {
    /** The indices; only the first `count` are valid. */
    this.items = new Int32Array(capacity);
    /** How many indices the list holds. */
    this.count = 0;
  }

  /** @param {number} value The index to append. */
  push(value) {
    if (this.count === this.items.length) {
      const grown = new Int32Array(this.items.length * 2);
      grown.set(this.items);
      this.items = grown;
    }
    this.items[this.count] = value;
    this.count += 1;
  }
}

export class StaticColliderSet {
  /**
   * @param {number} [cellSize] Side of a hash cell in metres.
   * @param {number} [capacity] Initial collider capacity (it grows).
   */
  constructor(cellSize = 16, capacity = 1024) {
    this.cellSize = cellSize;
    this.inverseCellSize = 1 / cellSize;
    /** How many colliders are alive. */
    this.count = 0;
    /** One past the highest index ever used. */
    this.highWater = 0;
    /** @type {Map<number, number[]>} Collider indices by cell key. */
    this.cells = new Map();
    /** Indices of colliders too large for the hash; every query tests them. */
    this.large = [];
    /** @type {Map<number, number[]>} Collider indices by group id. */
    this.groups = new Map();
    this.free = [];
    this.queryId = 0;
    this.#allocate(capacity);
  }

  #allocate(capacity) {
    const grow = (Type, per, old) => {
      const next = new Type(capacity * per);
      if (old) next.set(old);
      return next;
    };
    /** COLLIDER_TYPE per collider; 0 marks a free slot. */
    this.type = grow(Uint8Array, 1, this.type);
    /** LAYER bit per collider. */
    this.layer = grow(Int32Array, 1, this.layer);
    /** SURFACE id per collider. */
    this.surface = grow(Uint8Array, 1, this.surface);
    /** Group id per collider (0 for none). */
    this.group = grow(Int32Array, 1, this.group);
    this.generation = grow(Int32Array, 1, this.generation);
    this.stamp = grow(Int32Array, 1, this.stamp);
    /** Centre, three numbers per collider. */
    this.position = grow(Float64Array, 3, this.position);
    /** Rotation matrix in row order, nine numbers per collider. */
    this.rotation = grow(Float64Array, 9, this.rotation);
    /** Box half sizes; (radius, half height) of a cylinder; (radius, half core length) of a capsule. */
    this.half = grow(Float64Array, 3, this.half);
    /** World bounds: minX, minY, minZ, maxX, maxY, maxZ per collider. */
    this.bounds = grow(Float64Array, 6, this.bounds);
    /** @type {unknown[]} The hull (a local ConvexPoly) or mesh (a TriangleMesh) of a collider. */
    this.shape = this.shape ?? [];
    /** @type {unknown[]} The game's reference for each collider. */
    this.userRef = this.userRef ?? [];
    /** @type {unknown[]} The physics object that owns a collider (a standing prop, a trigger). */
    this.owner = this.owner ?? [];
    this.capacity = capacity;
  }

  /**
   * Adds a collider.
   * @param {number} type A COLLIDER_TYPE.
   * @param {number} layer Its LAYER bit.
   * @param {number} surface Its SURFACE id.
   * @param {number} px Centre X.
   * @param {number} py Centre Y.
   * @param {number} pz Centre Z.
   * @param {ArrayLike<number>} rotation Rotation matrix, nine numbers in row order.
   * @param {number} hx Half size X (or radius).
   * @param {number} hy Half size Y (or half height).
   * @param {number} hz Half size Z.
   * @param {unknown} [shape] The local ConvexPoly of a hull, or the TriangleMesh of a mesh.
   * @param {unknown} [userRef] The game's reference.
   * @param {number} [group] A group id, for removing a whole sector at once.
   * @returns {number} The collider's handle.
   */
  add(type, layer, surface, px, py, pz, rotation, hx, hy, hz, shape = null, userRef = null, group = 0) {
    let index = this.free.length > 0 ? this.free.pop() : this.highWater++;
    if (index >= this.capacity) this.#allocate(this.capacity * 2);
    this.type[index] = type;
    this.layer[index] = layer;
    this.surface[index] = surface;
    this.group[index] = group;
    this.position[index * 3] = px;
    this.position[index * 3 + 1] = py;
    this.position[index * 3 + 2] = pz;
    for (let i = 0; i < 9; i += 1) this.rotation[index * 9 + i] = rotation[i];
    this.half[index * 3] = hx;
    this.half[index * 3 + 1] = hy;
    this.half[index * 3 + 2] = hz;
    this.shape[index] = shape;
    this.userRef[index] = userRef;
    this.owner[index] = null;
    this.#computeBounds(index);
    this.#insert(index);
    if (group !== 0) {
      let members = this.groups.get(group);
      if (!members) {
        members = [];
        this.groups.set(group, members);
      }
      members.push(index);
    }
    this.count += 1;
    return this.generation[index] * INDEX_RANGE + index;
  }

  /**
   * The index of a live collider.
   * @param {number} handle A handle returned by add().
   * @returns {number} The index into the arrays, or -1 when the collider is gone.
   */
  indexOf(handle) {
    const index = handle % INDEX_RANGE;
    if (!(index >= 0) || index >= this.highWater || this.type[index] === 0) return -1;
    return this.generation[index] === Math.floor(handle / INDEX_RANGE) ? index : -1;
  }

  /**
   * @param {number} index A collider index.
   * @returns {number} Its handle.
   */
  handleOf(index) {
    return this.generation[index] * INDEX_RANGE + index;
  }

  /**
   * Removes a collider. Removing one that is already gone does nothing.
   * @param {number} handle The collider's handle.
   * @returns {boolean} True when a collider was removed.
   */
  remove(handle) {
    const index = this.indexOf(handle);
    if (index < 0) return false;
    const group = this.group[index];
    if (group !== 0) {
      const members = this.groups.get(group);
      if (members) {
        const at = members.indexOf(index);
        if (at >= 0) {
          members[at] = members[members.length - 1];
          members.pop();
        }
        if (members.length === 0) this.groups.delete(group);
      }
    }
    this.#release(index);
    return true;
  }

  /**
   * Removes every collider of a group.
   * @param {number} group The group id given to add().
   * @returns {number} How many colliders were removed.
   */
  removeGroup(group) {
    const members = this.groups.get(group);
    if (!members) return 0;
    this.groups.delete(group);
    for (const index of members) this.#release(index);
    return members.length;
  }

  #release(index) {
    this.#extract(index);
    this.type[index] = 0;
    this.shape[index] = null;
    this.userRef[index] = null;
    this.owner[index] = null;
    this.generation[index] += 1;
    this.free.push(index);
    this.count -= 1;
  }

  #computeBounds(index) {
    const type = this.type[index];
    const p = index * 3;
    const r = index * 9;
    const b = index * 6;
    const px = this.position[p];
    const py = this.position[p + 1];
    const pz = this.position[p + 2];
    const rotation = this.rotation;
    let ex;
    let ey;
    let ez;
    if (type === COLLIDER_TYPE.SPHERE) {
      ex = ey = ez = this.half[p];
    } else if (type === COLLIDER_TYPE.CAPSULE) {
      const radius = this.half[p];
      const length = this.half[p + 1];
      ex = Math.abs(rotation[r + 1]) * length + radius;
      ey = Math.abs(rotation[r + 4]) * length + radius;
      ez = Math.abs(rotation[r + 7]) * length + radius;
    } else if (type === COLLIDER_TYPE.HULL) {
      transformPoly(this.shape[index], px, py, pz, rotation, hullScratch, r);
      boundsOfPoly(hullScratch, this.bounds, b);
      return;
    } else {
      let hx = this.half[p];
      let hy = this.half[p + 1];
      let hz = this.half[p + 2];
      let cx = 0;
      let cy = 0;
      let cz = 0;
      if (type === COLLIDER_TYPE.CYLINDER) {
        hz = hx;
      } else if (type === COLLIDER_TYPE.MESH) {
        const mesh = /** @type {import('./TriangleMesh.js').TriangleMesh} */ (this.shape[index]);
        hx = (mesh.bounds[3] - mesh.bounds[0]) * 0.5;
        hy = (mesh.bounds[4] - mesh.bounds[1]) * 0.5;
        hz = (mesh.bounds[5] - mesh.bounds[2]) * 0.5;
        cx = (mesh.bounds[3] + mesh.bounds[0]) * 0.5;
        cy = (mesh.bounds[4] + mesh.bounds[1]) * 0.5;
        cz = (mesh.bounds[5] + mesh.bounds[2]) * 0.5;
      }
      ex = Math.abs(rotation[r]) * hx + Math.abs(rotation[r + 1]) * hy + Math.abs(rotation[r + 2]) * hz;
      ey = Math.abs(rotation[r + 3]) * hx + Math.abs(rotation[r + 4]) * hy + Math.abs(rotation[r + 5]) * hz;
      ez = Math.abs(rotation[r + 6]) * hx + Math.abs(rotation[r + 7]) * hy + Math.abs(rotation[r + 8]) * hz;
      const ox = rotation[r] * cx + rotation[r + 1] * cy + rotation[r + 2] * cz;
      const oy = rotation[r + 3] * cx + rotation[r + 4] * cy + rotation[r + 5] * cz;
      const oz = rotation[r + 6] * cx + rotation[r + 7] * cy + rotation[r + 8] * cz;
      this.bounds[b] = px + ox - ex;
      this.bounds[b + 1] = py + oy - ey;
      this.bounds[b + 2] = pz + oz - ez;
      this.bounds[b + 3] = px + ox + ex;
      this.bounds[b + 4] = py + oy + ey;
      this.bounds[b + 5] = pz + oz + ez;
      return;
    }
    this.bounds[b] = px - ex;
    this.bounds[b + 1] = py - ey;
    this.bounds[b + 2] = pz - ez;
    this.bounds[b + 3] = px + ex;
    this.bounds[b + 4] = py + ey;
    this.bounds[b + 5] = pz + ez;
  }

  #cellRange(index) {
    const b = index * 6;
    const inverse = this.inverseCellSize;
    cellRange[0] = Math.floor(this.bounds[b] * inverse);
    cellRange[1] = Math.floor(this.bounds[b + 2] * inverse);
    cellRange[2] = Math.floor(this.bounds[b + 3] * inverse);
    cellRange[3] = Math.floor(this.bounds[b + 5] * inverse);
    return (cellRange[2] - cellRange[0] + 1) * (cellRange[3] - cellRange[1] + 1) > LARGE_CELL_COUNT;
  }

  #insert(index) {
    if (this.#cellRange(index)) {
      this.large.push(index);
      return;
    }
    for (let ix = cellRange[0]; ix <= cellRange[2]; ix += 1) {
      for (let iz = cellRange[1]; iz <= cellRange[3]; iz += 1) {
        const key = (ix + 32768) * 65536 + (iz + 32768);
        const cell = this.cells.get(key);
        if (cell) cell.push(index);
        else this.cells.set(key, [index]);
      }
    }
  }

  #extract(index) {
    if (this.#cellRange(index)) {
      const at = this.large.indexOf(index);
      if (at >= 0) {
        this.large[at] = this.large[this.large.length - 1];
        this.large.pop();
      }
      return;
    }
    for (let ix = cellRange[0]; ix <= cellRange[2]; ix += 1) {
      for (let iz = cellRange[1]; iz <= cellRange[3]; iz += 1) {
        const key = (ix + 32768) * 65536 + (iz + 32768);
        const cell = this.cells.get(key);
        if (!cell) continue;
        const at = cell.indexOf(index);
        if (at >= 0) {
          cell[at] = cell[cell.length - 1];
          cell.pop();
        }
        if (cell.length === 0) this.cells.delete(key);
      }
    }
  }

  /**
   * Collects the colliders whose bounds touch a box.
   * @param {number} minX The box.
   * @param {number} minY
   * @param {number} minZ
   * @param {number} maxX
   * @param {number} maxY
   * @param {number} maxZ
   * @param {number} mask LAYER bits to accept.
   * @param {IndexList} result Receives collider indices (appended after its current count).
   * @returns {number} How many colliders were appended.
   */
  query(minX, minY, minZ, maxX, maxY, maxZ, mask, result) {
    const before = result.count;
    const bounds = this.bounds;
    const layer = this.layer;
    const stamp = this.stamp;
    const id = ++this.queryId;
    const inverse = this.inverseCellSize;
    const x0 = Math.floor(minX * inverse);
    const z0 = Math.floor(minZ * inverse);
    const x1 = Math.floor(maxX * inverse);
    const z1 = Math.floor(maxZ * inverse);
    for (let ix = x0; ix <= x1; ix += 1) {
      for (let iz = z0; iz <= z1; iz += 1) {
        const cell = this.cells.get((ix + 32768) * 65536 + (iz + 32768));
        if (!cell) continue;
        for (let k = 0; k < cell.length; k += 1) {
          const index = cell[k];
          if (stamp[index] === id) continue;
          stamp[index] = id;
          if ((layer[index] & mask) === 0) continue;
          const b = index * 6;
          if (bounds[b] > maxX || bounds[b + 3] < minX || bounds[b + 1] > maxY || bounds[b + 4] < minY
            || bounds[b + 2] > maxZ || bounds[b + 5] < minZ) continue;
          result.push(index);
        }
      }
    }
    for (let k = 0; k < this.large.length; k += 1) {
      const index = this.large[k];
      if ((layer[index] & mask) === 0) continue;
      const b = index * 6;
      if (bounds[b] > maxX || bounds[b + 3] < minX || bounds[b + 1] > maxY || bounds[b + 4] < minY
        || bounds[b + 2] > maxZ || bounds[b + 5] < minZ) continue;
      result.push(index);
    }
    return result.count - before;
  }

  /**
   * Fills a convex piece with a collider's world shape (not for meshes).
   * @param {number} index The collider index.
   * @param {import('./ConvexPoly.js').ConvexPoly} poly The piece to fill.
   * @returns {import('./ConvexPoly.js').ConvexPoly} `poly`.
   */
  expand(index, poly) {
    const p = index * 3;
    const r = index * 9;
    const position = this.position;
    const half = this.half;
    const rotation = this.rotation;
    switch (this.type[index]) {
      case COLLIDER_TYPE.BOX:
        return setBoxPoly(poly, position[p], position[p + 1], position[p + 2], rotation, half[p], half[p + 1], half[p + 2], r);
      case COLLIDER_TYPE.CYLINDER:
        return setCylinderPoly(poly, position[p], position[p + 1], position[p + 2], rotation, half[p], half[p + 1], r);
      case COLLIDER_TYPE.SPHERE:
        return setSpherePoly(poly, position[p], position[p + 1], position[p + 2], half[p]);
      case COLLIDER_TYPE.CAPSULE: {
        const length = half[p + 1];
        const ax = rotation[r + 1] * length;
        const ay = rotation[r + 4] * length;
        const az = rotation[r + 7] * length;
        return setCapsulePoly(poly, position[p] - ax, position[p + 1] - ay, position[p + 2] - az,
          position[p] + ax, position[p + 1] + ay, position[p + 2] + az, half[p]);
      }
      default:
        return transformPoly(this.shape[index], position[p], position[p + 1], position[p + 2], rotation, poly, r);
    }
  }

  /**
   * Tests a ray against one collider.
   * @param {number} index The collider index.
   * @param {import('./rayShapes.js').RayShapeHit} out Receives the hit.
   * @returns {boolean} True on a hit within `maxT`.
   */
  raycastOne(index, ox, oy, oz, dx, dy, dz, maxT, out) {
    const p = index * 3;
    const r = index * 9;
    const position = this.position;
    const half = this.half;
    const rotation = this.rotation;
    const cx = position[p];
    const cy = position[p + 1];
    const cz = position[p + 2];
    switch (this.type[index]) {
      case COLLIDER_TYPE.BOX:
        return rayAgainstBox(ox, oy, oz, dx, dy, dz, maxT, cx, cy, cz, rotation, r, half[p], half[p + 1], half[p + 2], out);
      case COLLIDER_TYPE.CYLINDER:
        return rayAgainstCylinder(ox, oy, oz, dx, dy, dz, maxT, cx, cy, cz, rotation, r, half[p], half[p + 1], out);
      case COLLIDER_TYPE.SPHERE:
        return rayAgainstSphere(ox, oy, oz, dx, dy, dz, maxT, cx, cy, cz, half[p], out);
      case COLLIDER_TYPE.CAPSULE: {
        const length = half[p + 1];
        const ax = rotation[r + 1] * length;
        const ay = rotation[r + 4] * length;
        const az = rotation[r + 7] * length;
        return rayAgainstCapsule(ox, oy, oz, dx, dy, dz, maxT, cx - ax, cy - ay, cz - az, cx + ax, cy + ay, cz + az, half[p], out);
      }
      default: {
        // Hulls and meshes are tested in their own space.
        const qx = ox - cx;
        const qy = oy - cy;
        const qz = oz - cz;
        const lox = rotation[r] * qx + rotation[r + 3] * qy + rotation[r + 6] * qz;
        const loy = rotation[r + 1] * qx + rotation[r + 4] * qy + rotation[r + 7] * qz;
        const loz = rotation[r + 2] * qx + rotation[r + 5] * qy + rotation[r + 8] * qz;
        const ldx = rotation[r] * dx + rotation[r + 3] * dy + rotation[r + 6] * dz;
        const ldy = rotation[r + 1] * dx + rotation[r + 4] * dy + rotation[r + 7] * dz;
        const ldz = rotation[r + 2] * dx + rotation[r + 5] * dy + rotation[r + 8] * dz;
        const shape = this.shape[index];
        const hit = this.type[index] === COLLIDER_TYPE.HULL
          ? rayAgainstPoly(lox, loy, loz, ldx, ldy, ldz, maxT, shape, out)
          : shape.raycast(lox, loy, loz, ldx, ldy, ldz, maxT, out);
        if (!hit) return false;
        const nx = out.nx;
        const ny = out.ny;
        const nz = out.nz;
        out.nx = rotation[r] * nx + rotation[r + 1] * ny + rotation[r + 2] * nz;
        out.ny = rotation[r + 3] * nx + rotation[r + 4] * ny + rotation[r + 5] * nz;
        out.nz = rotation[r + 6] * nx + rotation[r + 7] * ny + rotation[r + 8] * nz;
        return true;
      }
    }
  }

  /**
   * Casts a ray through the hash and finds the nearest collider it hits.
   * @param {number} ox Ray origin.
   * @param {number} oy
   * @param {number} oz
   * @param {number} dx Ray direction (unit).
   * @param {number} dy
   * @param {number} dz
   * @param {number} maxT The furthest distance that counts.
   * @param {number} mask LAYER bits to accept.
   * @param {ArrayLike<unknown> | null} ignore Handles or user references to skip.
   * @param {import('./rayShapes.js').RayShapeHit & {index: number}} out Receives the hit and the
   *   collider index.
   * @returns {boolean} True on a hit.
   */
  raycast(ox, oy, oz, dx, dy, dz, maxT, mask, ignore, out) {
    const id = ++this.queryId;
    let best = maxT;
    let found = false;
    for (let k = 0; k < this.large.length; k += 1) {
      const index = this.large[k];
      if (this.#rayCandidate(index, ox, oy, oz, dx, dy, dz, best, mask, ignore)) {
        best = shapeHit.t;
        found = true;
        copyHit(out, index);
      }
    }
    const size = this.cellSize;
    const inverse = this.inverseCellSize;
    let ix = Math.floor(ox * inverse);
    let iz = Math.floor(oz * inverse);
    const stepX = dx > 0 ? 1 : -1;
    const stepZ = dz > 0 ? 1 : -1;
    const deltaX = dx !== 0 ? Math.abs(size / dx) : Infinity;
    const deltaZ = dz !== 0 ? Math.abs(size / dz) : Infinity;
    let nextX = dx !== 0 ? ((dx > 0 ? ix + 1 : ix) * size - ox) / dx : Infinity;
    let nextZ = dz !== 0 ? ((dz > 0 ? iz + 1 : iz) * size - oz) / dz : Infinity;
    for (let guard = 0; guard < 4096; guard += 1) {
      const cell = this.cells.get((ix + 32768) * 65536 + (iz + 32768));
      if (cell) {
        for (let k = 0; k < cell.length; k += 1) {
          const index = cell[k];
          if (this.stamp[index] === id) continue;
          this.stamp[index] = id;
          if (this.#rayCandidate(index, ox, oy, oz, dx, dy, dz, best, mask, ignore)) {
            best = shapeHit.t;
            found = true;
            copyHit(out, index);
          }
        }
      }
      const leave = nextX < nextZ ? nextX : nextZ;
      if (leave >= best) break;
      if (nextX < nextZ) {
        ix += stepX;
        nextX += deltaX;
      } else {
        iz += stepZ;
        nextZ += deltaZ;
      }
    }
    return found;
  }

  #rayCandidate(index, ox, oy, oz, dx, dy, dz, maxT, mask, ignore) {
    if ((this.layer[index] & mask) === 0) return false;
    // Slab test against the collider's bounds first.
    const b = index * 6;
    const bounds = this.bounds;
    let near = 0;
    let far = maxT;
    for (let axis = 0; axis < 3; axis += 1) {
      const origin = axis === 0 ? ox : axis === 1 ? oy : oz;
      const direction = axis === 0 ? dx : axis === 1 ? dy : dz;
      if (direction > -1e-12 && direction < 1e-12) {
        if (origin < bounds[b + axis] || origin > bounds[b + 3 + axis]) return false;
        continue;
      }
      const inverse = 1 / direction;
      const t0 = (bounds[b + axis] - origin) * inverse;
      const t1 = (bounds[b + 3 + axis] - origin) * inverse;
      if (t0 < t1) {
        if (t0 > near) near = t0;
        if (t1 < far) far = t1;
      } else {
        if (t1 > near) near = t1;
        if (t0 < far) far = t0;
      }
      if (near > far) return false;
    }
    if (ignore && isIgnored(ignore, this.handleOf(index), this.userRef[index])) return false;
    return this.raycastOne(index, ox, oy, oz, dx, dy, dz, maxT, shapeHit);
  }

  /**
   * Whether a point is inside a collider (for trigger volumes; meshes contain nothing).
   * @param {number} index The collider index.
   * @param {number} x The point.
   * @param {number} y
   * @param {number} z
   * @returns {boolean}
   */
  containsPoint(index, x, y, z) {
    const p = index * 3;
    const r = index * 9;
    const rotation = this.rotation;
    const half = this.half;
    const qx = x - this.position[p];
    const qy = y - this.position[p + 1];
    const qz = z - this.position[p + 2];
    const lx = rotation[r] * qx + rotation[r + 3] * qy + rotation[r + 6] * qz;
    const ly = rotation[r + 1] * qx + rotation[r + 4] * qy + rotation[r + 7] * qz;
    const lz = rotation[r + 2] * qx + rotation[r + 5] * qy + rotation[r + 8] * qz;
    switch (this.type[index]) {
      case COLLIDER_TYPE.BOX:
        return Math.abs(lx) <= half[p] && Math.abs(ly) <= half[p + 1] && Math.abs(lz) <= half[p + 2];
      case COLLIDER_TYPE.CYLINDER:
        return Math.abs(ly) <= half[p + 1] && lx * lx + lz * lz <= half[p] * half[p];
      case COLLIDER_TYPE.SPHERE:
        return lx * lx + ly * ly + lz * lz <= half[p] * half[p];
      case COLLIDER_TYPE.CAPSULE: {
        const along = ly < -half[p + 1] ? -half[p + 1] : ly > half[p + 1] ? half[p + 1] : ly;
        return lx * lx + (ly - along) * (ly - along) + lz * lz <= half[p] * half[p];
      }
      case COLLIDER_TYPE.HULL: {
        const hull = /** @type {import('./ConvexPoly.js').ConvexPoly} */ (this.shape[index]);
        for (let f = 0; f < hull.faceCount; f += 1) {
          if (hull.faceNormals[f * 3] * lx + hull.faceNormals[f * 3 + 1] * ly + hull.faceNormals[f * 3 + 2] * lz
            > hull.faceOffsets[f]) return false;
        }
        return true;
      }
      default:
        return false;
    }
  }
}

/**
 * Whether an ignore list names a thing.
 * @param {ArrayLike<unknown>} ignore The list: handles, bodies, characters or user references.
 * @param {unknown} first One identity of the thing.
 * @param {unknown} [second] Another identity of the same thing.
 * @returns {boolean}
 */
export function isIgnored(ignore, first, second = undefined) {
  for (let i = 0; i < ignore.length; i += 1) {
    const entry = ignore[i];
    if (entry === first || (second !== null && second !== undefined && entry === second)) return true;
  }
  return false;
}

function copyHit(out, index) {
  out.t = shapeHit.t;
  out.nx = shapeHit.nx;
  out.ny = shapeHit.ny;
  out.nz = shapeHit.nz;
  out.index = index;
}

const cellRange = new Int32Array(4);
const hullScratch = new ConvexPoly(64, 48, 96);

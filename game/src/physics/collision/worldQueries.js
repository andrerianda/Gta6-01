// The queries of the physics world: ray cast, sphere cast, capsule cast, sphere and capsule
// overlap, the support under a point and line of sight. Each one looks at the terrain, the static
// colliders (through their spatial hash), the moving bodies and the character capsules (on
// LAYER.CHARACTER, reported as HIT_KIND.CHARACTER), filtered by a layer mask and an ignore list
// (static handles, bodies, character controllers or the game's user references). Nothing
// allocates per call.
import { LAYER } from '../collisionLayers.js';
import { ConvexPoly, setCapsulePoly, setSpherePoly } from './ConvexPoly.js';
import { gatherMeshTriangles, meshTriangleIds, setWorldTriangle } from './meshTriangles.js';
import { createRayShapeHit, rayAgainstPoly } from './rayShapes.js';
import { createSeparatingAxis, findSeparatingAxis } from './separatingAxis.js';
import { sweepSphereAgainstPoly } from './sphereSweep.js';
import { COLLIDER_TYPE, IndexList, isIgnored } from './StaticColliderSet.js';

/**
 * Casts a ray through the world and finds the nearest thing it hits.
 * @param {import('../PhysicsWorld.js').PhysicsWorld} world The world.
 * @param {number} ox Ray origin.
 * @param {number} oy
 * @param {number} oz
 * @param {number} dx Ray direction (unit).
 * @param {number} dy
 * @param {number} dz
 * @param {number} maxT The furthest distance that counts.
 * @param {number} mask LAYER bits to accept.
 * @param {ArrayLike<unknown> | null} ignore Static handles, bodies or user references to skip.
 * @param {QueryHit} out Receives the hit.
 * @returns {boolean} True on a hit.
 */
export function castRay(world, ox, oy, oz, dx, dy, dz, maxT, mask, ignore, out) {
  resetHit(out);
  let best = maxT;
  if ((mask & LAYER.GROUND) !== 0 && world.ground.raycast(ox, oy, oz, dx, dy, dz, best, shapeHit)) {
    best = shapeHit.t;
    setGroundHit(world, out, ox + dx * best, oz + dz * best);
  }
  const set = world.statics;
  if (set.count > 0 && set.raycast(ox, oy, oz, dx, dy, dz, best, mask, ignore, staticHit)) {
    best = staticHit.t;
    setStaticHit(set, out, staticHit.index, staticHit.nx, staticHit.ny, staticHit.nz);
  }
  if ((mask & BODY_LAYERS) !== 0) {
    const bodies = world.bodies;
    for (let i = 0; i < bodies.length; i += 1) {
      const body = bodies[i];
      if ((body.layer & mask) === 0 || !rayTouchesBounds(body.bounds, ox, oy, oz, dx, dy, dz, best, 0)) continue;
      if (ignore !== null && isIgnored(ignore, body, body.userRef)) continue;
      body.refreshPieces();
      for (let k = 0; k < body.worldPieces.length; k += 1) {
        const piece = body.worldPieces[k];
        const found = piece.radius > 0
          ? sweepSphereAgainstPoly(ox, oy, oz, dx, dy, dz, best, 0, piece, shapeHit)
          : rayAgainstPoly(ox, oy, oz, dx, dy, dz, best, piece, shapeHit);
        if (!found) continue;
        best = shapeHit.t;
        setBodyHit(out, body, shapeHit.nx, shapeHit.ny, shapeHit.nz);
      }
    }
  }
  if ((mask & LAYER.CHARACTER) !== 0) best = castAtCharacters(world, ox, oy, oz, dx, dy, dz, best, 0, ignore, out);
  if (!out.hit) return false;
  out.distance = best;
  out.x = ox + dx * best;
  out.y = oy + dy * best;
  out.z = oz + dz * best;
  return true;
}

/**
 * The result of a ray or shape cast.
 * @typedef {object} QueryHit
 * @property {boolean} hit True when something was hit.
 * @property {number} kind A HIT_KIND: what was hit.
 * @property {number} distance How far the ray or the shape travelled before touching.
 * @property {number} x The point of contact.
 * @property {number} y
 * @property {number} z
 * @property {number} nx The surface normal there, a unit vector pointing back at the caster.
 * @property {number} ny
 * @property {number} nz
 * @property {import('../dynamics/RigidBody.js').RigidBody | null} body The body hit, if one.
 * @property {import('../characters/CharacterController.js').CharacterController | null} character The
 *   character capsule hit, if one (kind CHARACTER).
 * @property {number} handle The handle of the static collider hit, or -1.
 * @property {number} index The index of that static collider in the set, or -1.
 * @property {unknown} userRef The game's reference of the collider or body hit.
 * @property {number} surface SURFACE id of what was hit.
 * @property {number} layer LAYER bit of what was hit.
 */

/** What a query hit. */
export const HIT_KIND = Object.freeze({ NONE: 0, GROUND: 1, STATIC: 2, BODY: 3, CHARACTER: 4 });

/**
 * Creates an empty hit for the casts to fill. `character` is the CharacterController hit (kind
 * CHARACTER), or null.
 * @returns {QueryHit}
 */
export function createQueryHit() {
  return {
    hit: false, kind: 0, distance: 0, x: 0, y: 0, z: 0, nx: 0, ny: 1, nz: 0, body: null, character: null, handle: -1,
    index: -1, userRef: null, surface: 0, layer: 0,
  };
}

/**
 * The things an overlap query found.
 * @typedef {object} OverlapList
 * @property {number} count How many things were found (never more than the capacity).
 * @property {Uint8Array} kinds A HIT_KIND per entry.
 * @property {Int32Array} indices The static collider index per entry, or -1.
 * @property {(import('../dynamics/RigidBody.js').RigidBody | null)[]} bodies The body per entry, or null.
 */

/**
 * Creates a list for the overlap queries to fill.
 * @param {number} [capacity] The most entries it can hold.
 * @returns {OverlapList}
 */
export function createOverlapList(capacity = 32) {
  return { count: 0, kinds: new Uint8Array(capacity), indices: new Int32Array(capacity), bodies: new Array(capacity).fill(null) };
}

/**
 * Sweeps a sphere through the world.
 * @param {import('../PhysicsWorld.js').PhysicsWorld} world The world.
 * @param {number} ox Start of the sphere's centre.
 * @param {number} oy
 * @param {number} oz
 * @param {number} dx Direction of travel (unit).
 * @param {number} dy
 * @param {number} dz
 * @param {number} maxT How far the sphere travels.
 * @param {number} radius The sphere's radius.
 * @param {number} mask LAYER bits to accept.
 * @param {ArrayLike<unknown> | null} ignore Static handles, bodies or user references to skip.
 * @param {QueryHit} out Receives the hit; `distance` is how far the centre travelled.
 * @returns {boolean} True when the sphere touches something within `maxT`.
 */
export function castSphere(world, ox, oy, oz, dx, dy, dz, maxT, radius, mask, ignore, out) {
  resetHit(out);
  let best = maxT;
  if ((mask & LAYER.GROUND) !== 0) {
    const ground = world.ground;
    if (oy - radius <= ground.heightAt(ox, oz)) {
      best = 0;
      setGroundHit(world, out, ox, oz);
    } else if (ground.raycast(ox, oy - radius, oz, dx, dy, dz, best, shapeHit)) {
      best = shapeHit.t;
      setGroundHit(world, out, ox + dx * best, oz + dz * best);
    }
  }
  const ex = ox + dx * maxT;
  const ey = oy + dy * maxT;
  const ez = oz + dz * maxT;
  const minX = Math.min(ox, ex) - radius;
  const minY = Math.min(oy, ey) - radius;
  const minZ = Math.min(oz, ez) - radius;
  const maxX = Math.max(ox, ex) + radius;
  const maxY = Math.max(oy, ey) + radius;
  const maxZ = Math.max(oz, ez) + radius;
  const set = world.statics;
  if (set.count > 0) {
    candidates.count = 0;
    set.query(minX, minY, minZ, maxX, maxY, maxZ, mask, candidates);
    for (let n = 0; n < candidates.count; n += 1) {
      const index = candidates.items[n];
      if (ignore !== null && isIgnored(ignore, set.handleOf(index), set.userRef[index])) continue;
      if (set.type[index] === COLLIDER_TYPE.MESH) {
        const triangles = gatherMeshTriangles(set, index, minX, minY, minZ, maxX, maxY, maxZ);
        for (let t = 0; t < triangles; t += 1) {
          if (!setWorldTriangle(set, index, meshTriangleIds[t], scratchPoly)) continue;
          if (!sweepSphereAgainstPoly(ox, oy, oz, dx, dy, dz, best, radius, scratchPoly, shapeHit)) continue;
          best = shapeHit.t;
          setStaticHit(set, out, index, shapeHit.nx, shapeHit.ny, shapeHit.nz);
        }
      } else if (sweepSphereAgainstPoly(ox, oy, oz, dx, dy, dz, best, radius, set.expand(index, scratchPoly), shapeHit)) {
        best = shapeHit.t;
        setStaticHit(set, out, index, shapeHit.nx, shapeHit.ny, shapeHit.nz);
      }
    }
  }
  if ((mask & BODY_LAYERS) !== 0) {
    const bodies = world.bodies;
    for (let i = 0; i < bodies.length; i += 1) {
      const body = bodies[i];
      if ((body.layer & mask) === 0 || !rayTouchesBounds(body.bounds, ox, oy, oz, dx, dy, dz, best, radius)) continue;
      if (ignore !== null && isIgnored(ignore, body, body.userRef)) continue;
      body.refreshPieces();
      for (let k = 0; k < body.worldPieces.length; k += 1) {
        if (!sweepSphereAgainstPoly(ox, oy, oz, dx, dy, dz, best, radius, body.worldPieces[k], shapeHit)) continue;
        best = shapeHit.t;
        setBodyHit(out, body, shapeHit.nx, shapeHit.ny, shapeHit.nz);
      }
    }
  }
  if ((mask & LAYER.CHARACTER) !== 0) best = castAtCharacters(world, ox, oy, oz, dx, dy, dz, best, radius, ignore, out);
  if (!out.hit) return false;
  out.distance = best;
  out.x = ox + dx * best - out.nx * radius;
  out.y = oy + dy * best - out.ny * radius;
  out.z = oz + dz * best - out.nz * radius;
  return true;
}

/**
 * Sweeps a capsule through the world without turning it (conservative advancement: the capsule
 * moves up to the nearest thing along each separating axis until it touches).
 * @param {import('../PhysicsWorld.js').PhysicsWorld} world The world.
 * @param {number} ax One end of the capsule's core segment at the start.
 * @param {number} ay
 * @param {number} az
 * @param {number} bx The other end.
 * @param {number} by
 * @param {number} bz
 * @param {number} radius The capsule's radius.
 * @param {number} dx Direction of travel (unit).
 * @param {number} dy
 * @param {number} dz
 * @param {number} maxT How far it travels.
 * @param {number} mask LAYER bits to accept.
 * @param {ArrayLike<unknown> | null} ignore Static handles, bodies or user references to skip.
 * @param {QueryHit} out Receives the hit: the distance travelled and the normal to slide along
 *   (the point is the capsule's middle moved onto the surface, an approximation).
 * @returns {boolean} True when the capsule touches something within `maxT`.
 */
export function castCapsule(world, ax, ay, az, bx, by, bz, radius, dx, dy, dz, maxT, mask, ignore, out) {
  resetHit(out);
  const mx = dx * maxT;
  const my = dy * maxT;
  const mz = dz * maxT;
  const minX = Math.min(ax, bx) - radius + Math.min(mx, 0);
  const minY = Math.min(ay, by) - radius + Math.min(my, 0);
  const minZ = Math.min(az, bz) - radius + Math.min(mz, 0);
  const maxX = Math.max(ax, bx) + radius + Math.max(mx, 0);
  const maxY = Math.max(ay, by) + radius + Math.max(my, 0);
  const maxZ = Math.max(az, bz) + radius + Math.max(mz, 0);
  gatherPieces(world, minX, minY, minZ, maxX, maxY, maxZ, mask, ignore);
  const useGround = (mask & LAYER.GROUND) !== 0;
  const ground = world.ground;
  const lowX = ay <= by ? ax : bx;
  const lowY = (ay <= by ? ay : by) - radius;
  const lowZ = ay <= by ? az : bz;
  // The terrain first: walk the capsule's lowest point along the path and find where it sinks in.
  // Gliding along the ground is not a hit, so a character can be swept while it stands.
  let groundT = -1;
  if (useGround) {
    let previous = lowY - ground.heightAt(lowX, lowZ);
    if (previous < -CAST_SKIN) {
      ground.normalAt(lowX, lowZ, groundNormal);
      if (dx * groundNormal.x + dy * groundNormal.y + dz * groundNormal.z < -1e-4) groundT = 0;
    }
    const stride = radius > 0.1 ? Math.min(radius, 0.5) : 0.1;
    for (let last = 0, s = stride; groundT < 0 && last < maxT; s += stride) {
      const at = s < maxT ? s : maxT;
      const gap = lowY + dy * at - ground.heightAt(lowX + dx * at, lowZ + dz * at);
      if (gap < -CAST_SKIN && previous >= -CAST_SKIN) {
        let low = last;
        let high = at;
        for (let k = 0; k < 8; k += 1) {
          const middle = (low + high) * 0.5;
          if (lowY + dy * middle - ground.heightAt(lowX + dx * middle, lowZ + dz * middle) < -CAST_SKIN) high = middle;
          else low = middle;
        }
        groundT = low;
      }
      previous = gap;
      last = at;
    }
    if (groundT >= 0) maxT = groundT;
  }
  let t = 0;
  for (let iteration = 0; iteration < CAST_ITERATIONS && maxT > 0; iteration += 1) {
    let step = maxT - t;
    let nearest = -1;
    setCapsulePoly(probe, ax + dx * t, ay + dy * t, az + dz * t, bx + dx * t, by + dy * t, bz + dz * t, radius);
    for (let c = 0; c < pieceCount; c += 1) {
      const piece = pieces[c];
      const reach = radius + piece.radius;
      if (!findSeparatingAxis(probe, piece, reach + maxT - t, axis)) continue;
      const approach = dx * axis.nx + dy * axis.ny + dz * axis.nz;
      if (approach <= 1e-6) continue;
      const gap = axis.separation - reach;
      if (gap <= CAST_SKIN) {
        nearest = c;
        step = 0;
        setPieceHit(world, out, c, -axis.nx, -axis.ny, -axis.nz);
        break;
      }
      const reachable = (gap - CAST_SKIN * 0.5) / approach;
      if (reachable < step) {
        step = reachable;
        nearest = c;
        hitNormal.x = -axis.nx;
        hitNormal.y = -axis.ny;
        hitNormal.z = -axis.nz;
      }
    }
    if (out.hit) break;
    t += step;
    if (t >= maxT - 1e-9) break;
    // Out of iterations while still closing in: report the nearest thing rather than let the
    // caller move through it.
    if (iteration === CAST_ITERATIONS - 1 && nearest >= 0) setPieceHit(world, out, nearest, hitNormal.x, hitNormal.y, hitNormal.z);
  }
  releasePieces();
  if (!out.hit && groundT >= 0) {
    t = groundT;
    setGroundHit(world, out, lowX + dx * t, lowZ + dz * t);
  }
  if (!out.hit) return false;
  out.distance = t;
  out.x = (ax + bx) * 0.5 + dx * t - out.nx * radius;
  out.y = (ay + by) * 0.5 + dy * t - out.ny * radius;
  out.z = (az + bz) * 0.5 + dz * t - out.nz * radius;
  return true;
}

/**
 * Finds what a sphere overlaps.
 * @param {import('../PhysicsWorld.js').PhysicsWorld} world The world.
 * @param {number} x The sphere's centre.
 * @param {number} y
 * @param {number} z
 * @param {number} radius Its radius.
 * @param {number} mask LAYER bits to accept.
 * @param {ArrayLike<unknown> | null} ignore Static handles, bodies or user references to skip.
 * @param {OverlapList} results Receives what was found.
 * @returns {number} How many things the sphere overlaps.
 */
export function overlapSphere(world, x, y, z, radius, mask, ignore, results) {
  setSpherePoly(probe, x, y, z, radius);
  return overlapProbe(world, x - radius, y - radius, z - radius, x + radius, y + radius, z + radius, x, y - radius, z,
    mask, ignore, results);
}

/**
 * Finds what a capsule overlaps.
 * @param {import('../PhysicsWorld.js').PhysicsWorld} world The world.
 * @param {number} ax One end of the capsule's core segment.
 * @param {number} ay
 * @param {number} az
 * @param {number} bx The other end.
 * @param {number} by
 * @param {number} bz
 * @param {number} radius Its radius.
 * @param {number} mask LAYER bits to accept.
 * @param {ArrayLike<unknown> | null} ignore Static handles, bodies or user references to skip.
 * @param {OverlapList} results Receives what was found.
 * @returns {number} How many things the capsule overlaps.
 */
export function overlapCapsule(world, ax, ay, az, bx, by, bz, radius, mask, ignore, results) {
  setCapsulePoly(probe, ax, ay, az, bx, by, bz, radius);
  const low = ay <= by;
  return overlapProbe(world, Math.min(ax, bx) - radius, Math.min(ay, by) - radius, Math.min(az, bz) - radius,
    Math.max(ax, bx) + radius, Math.max(ay, by) + radius, Math.max(az, bz) + radius,
    low ? ax : bx, (low ? ay : by) - radius, low ? az : bz, mask, ignore, results);
}

/**
 * Finds what holds up a point: the nearest terrain, static collider or body straight below it.
 * @param {import('../PhysicsWorld.js').PhysicsWorld} world The world.
 * @param {number} x The point.
 * @param {number} y
 * @param {number} z
 * @param {number} maxDrop How far below the point to look.
 * @param {number} mask LAYER bits to accept.
 * @param {ArrayLike<unknown> | null} ignore Static handles, bodies or user references to skip.
 * @param {QueryHit} out Receives the support; a point under the terrain reports it at distance 0.
 * @returns {boolean} True when something is below the point within `maxDrop`.
 */
export function findSupportBelow(world, x, y, z, maxDrop, mask, ignore, out) {
  castRay(world, x, y, z, 0, -1, 0, maxDrop, mask & ~LAYER.GROUND, ignore, out);
  if ((mask & LAYER.GROUND) === 0) return out.hit;
  const height = world.ground.heightAt(x, z);
  const drop = y > height ? y - height : 0;
  if (drop > maxDrop || (out.hit && out.distance <= drop)) return out.hit;
  setGroundHit(world, out, x, z);
  out.distance = drop;
  out.x = x;
  out.y = height;
  out.z = z;
  return true;
}

/**
 * Whether one point can see another.
 * @param {import('../PhysicsWorld.js').PhysicsWorld} world The world.
 * @param {number} ax The eye.
 * @param {number} ay
 * @param {number} az
 * @param {number} bx The target.
 * @param {number} by
 * @param {number} bz
 * @param {number} mask LAYER bits that block sight (MASK.SIGHT usually).
 * @param {ArrayLike<unknown> | null} ignore Static handles, bodies or user references to skip.
 * @returns {boolean} True when nothing is in the way.
 */
export function hasLineOfSight(world, ax, ay, az, bx, by, bz, mask, ignore) {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (length < 1e-6) return true;
  return !castRay(world, ax, ay, az, dx / length, dy / length, dz / length, length, mask, ignore, sightHit);
}

const BODY_LAYERS = LAYER.VEHICLE | LAYER.CHARACTER | LAYER.PROP | LAYER.DEBRIS;
const CAST_ITERATIONS = 32;
const CAST_SKIN = 0.004;
const shapeHit = createRayShapeHit();
const staticHit = { t: 0, nx: 0, ny: 1, nz: 0, index: -1 };
const sightHit = createQueryHit();
const axis = createSeparatingAxis();
const candidates = new IndexList(64);
const scratchPoly = new ConvexPoly(64, 48, 96);
const probe = new ConvexPoly(24, 14, 36);
const groundNormal = { x: 0, y: 1, z: 0 };
const hitNormal = { x: 0, y: 1, z: 0 };

// The convex pieces a capsule cast or an overlap looks at: static colliders are copied into
// pooled pieces, body pieces are used where they are.
/** @type {ConvexPoly[]} */
const pieces = [];
/** @type {ConvexPoly[]} */
const piecePool = [];
/** @type {(import('../dynamics/RigidBody.js').RigidBody | null)[]} */
const pieceBodies = [];
let pieceStatics = new Int32Array(64);
let pieceCount = 0;
let pooledCount = 0;

function pooledPiece() {
  if (pooledCount === piecePool.length) piecePool.push(new ConvexPoly(64, 48, 96));
  pooledCount += 1;
  return piecePool[pooledCount - 1];
}

function addPiece(piece, staticIndex, body) {
  if (pieceCount === pieceStatics.length) {
    const grown = new Int32Array(pieceStatics.length * 2);
    grown.set(pieceStatics);
    pieceStatics = grown;
  }
  pieces[pieceCount] = piece;
  pieceBodies[pieceCount] = body;
  pieceStatics[pieceCount] = staticIndex;
  pieceCount += 1;
}

function gatherPieces(world, minX, minY, minZ, maxX, maxY, maxZ, mask, ignore) {
  pieceCount = 0;
  pooledCount = 0;
  const set = world.statics;
  if (set.count > 0) {
    candidates.count = 0;
    set.query(minX, minY, minZ, maxX, maxY, maxZ, mask, candidates);
    for (let n = 0; n < candidates.count; n += 1) {
      const index = candidates.items[n];
      if (ignore !== null && isIgnored(ignore, set.handleOf(index), set.userRef[index])) continue;
      if (set.type[index] === COLLIDER_TYPE.MESH) {
        const triangles = gatherMeshTriangles(set, index, minX, minY, minZ, maxX, maxY, maxZ);
        for (let t = 0; t < triangles; t += 1) {
          const piece = pooledPiece();
          if (setWorldTriangle(set, index, meshTriangleIds[t], piece)) addPiece(piece, index, null);
          else pooledCount -= 1;
        }
      } else {
        addPiece(set.expand(index, pooledPiece()), index, null);
      }
    }
  }
  if ((mask & BODY_LAYERS) === 0) return;
  const bodies = world.bodies;
  for (let i = 0; i < bodies.length; i += 1) {
    const body = bodies[i];
    const b = body.bounds;
    if ((body.layer & mask) === 0 || b[0] > maxX || b[3] < minX || b[1] > maxY || b[4] < minY || b[2] > maxZ || b[5] < minZ) continue;
    if (ignore !== null && isIgnored(ignore, body, body.userRef)) continue;
    body.refreshPieces();
    for (let k = 0; k < body.worldPieces.length; k += 1) addPiece(body.worldPieces[k], -1, body);
  }
  if ((mask & LAYER.CHARACTER) === 0) return;
  const characters = world.characters;
  for (let i = 0; i < characters.length; i += 1) {
    const character = characters[i];
    if (!character.active) continue;
    const b = character.refreshPieces();
    if (b[0] > maxX || b[3] < minX || b[1] > maxY || b[4] < minY || b[2] > maxZ || b[5] < minZ) continue;
    if (ignore !== null && isIgnored(ignore, character, character.userRef)) continue;
    addPiece(character.worldPieces[0], -1, character);
  }
}

/** Ray (radius 0) or sphere cast against the character capsules; returns the new nearest distance. */
function castAtCharacters(world, ox, oy, oz, dx, dy, dz, best, radius, ignore, out) {
  const characters = world.characters;
  for (let i = 0; i < characters.length; i += 1) {
    const character = characters[i];
    if (!character.active) continue;
    const bounds = character.refreshPieces();
    if (!rayTouchesBounds(bounds, ox, oy, oz, dx, dy, dz, best, radius)) continue;
    if (ignore !== null && isIgnored(ignore, character, character.userRef)) continue;
    if (!sweepSphereAgainstPoly(ox, oy, oz, dx, dy, dz, best, radius, character.worldPieces[0], shapeHit)) continue;
    best = shapeHit.t;
    setCharacterHit(out, character, shapeHit.nx, shapeHit.ny, shapeHit.nz);
  }
  return best;
}

function releasePieces() {
  for (let c = 0; c < pieceCount; c += 1) pieceBodies[c] = null;
}

function overlapProbe(world, minX, minY, minZ, maxX, maxY, maxZ, lowX, lowY, lowZ, mask, ignore, results) {
  results.count = 0;
  let found = 0;
  const capacity = results.kinds.length;
  if ((mask & LAYER.GROUND) !== 0 && lowY <= world.ground.heightAt(lowX, lowZ)) {
    found += 1;
    if (results.count < capacity) {
      results.kinds[results.count] = HIT_KIND.GROUND;
      results.indices[results.count] = -1;
      results.bodies[results.count] = null;
      results.count += 1;
    }
  }
  gatherPieces(world, minX, minY, minZ, maxX, maxY, maxZ, mask, ignore);
  let lastStatic = -1;
  let lastBody = null;
  for (let c = 0; c < pieceCount; c += 1) {
    const piece = pieces[c];
    const body = pieceBodies[c];
    const index = pieceStatics[c];
    // One entry per collider or body, however many of its pieces touch.
    if ((body !== null && body === lastBody) || (body === null && index === lastStatic)) continue;
    const reach = probe.radius + piece.radius;
    if (!findSeparatingAxis(probe, piece, reach, axis) || axis.separation > reach) continue;
    if (body !== null) lastBody = body;
    else lastStatic = index;
    found += 1;
    if (results.count === capacity) continue;
    results.kinds[results.count] = body === null ? HIT_KIND.STATIC : body.isCharacter === true ? HIT_KIND.CHARACTER : HIT_KIND.BODY;
    results.indices[results.count] = index;
    results.bodies[results.count] = body;
    results.count += 1;
  }
  releasePieces();
  return found;
}

function resetHit(out) {
  out.hit = false;
  out.kind = HIT_KIND.NONE;
  out.body = null;
  out.character = null;
  out.handle = -1;
  out.index = -1;
  out.userRef = null;
  out.surface = 0;
  out.layer = 0;
  out.distance = 0;
}

function setGroundHit(world, out, x, z) {
  world.ground.normalAt(x, z, groundNormal);
  out.hit = true;
  out.kind = HIT_KIND.GROUND;
  out.nx = groundNormal.x;
  out.ny = groundNormal.y;
  out.nz = groundNormal.z;
  out.body = null;
  out.character = null;
  out.handle = -1;
  out.index = -1;
  out.userRef = null;
  out.surface = world.ground.surfaceAt(x, z);
  out.layer = LAYER.GROUND;
}

function setStaticHit(set, out, index, nx, ny, nz) {
  out.hit = true;
  out.kind = HIT_KIND.STATIC;
  out.nx = nx;
  out.ny = ny;
  out.nz = nz;
  out.body = null;
  out.character = null;
  out.handle = set.handleOf(index);
  out.index = index;
  out.userRef = set.userRef[index];
  out.surface = set.surface[index];
  out.layer = set.layer[index];
}

function setBodyHit(out, body, nx, ny, nz) {
  out.hit = true;
  out.kind = HIT_KIND.BODY;
  out.nx = nx;
  out.ny = ny;
  out.nz = nz;
  out.body = body;
  out.character = null;
  out.handle = -1;
  out.index = -1;
  out.userRef = body.userRef;
  out.surface = 6;
  out.layer = body.layer;
}

function setCharacterHit(out, character, nx, ny, nz) {
  out.hit = true;
  out.kind = HIT_KIND.CHARACTER;
  out.nx = nx;
  out.ny = ny;
  out.nz = nz;
  out.body = null;
  out.character = character;
  out.handle = -1;
  out.index = -1;
  out.userRef = character.userRef;
  // There is no flesh surface: report a dull, soft one.
  out.surface = 4;
  out.layer = LAYER.CHARACTER;
}

function setPieceHit(world, out, c, nx, ny, nz) {
  const owner = pieceBodies[c];
  if (owner !== null && owner.isCharacter === true) setCharacterHit(out, owner, nx, ny, nz);
  else if (owner !== null) setBodyHit(out, owner, nx, ny, nz);
  else setStaticHit(world.statics, out, pieceStatics[c], nx, ny, nz);
}

/** Slab test of a ray against bounds grown by a radius. */
function rayTouchesBounds(bounds, ox, oy, oz, dx, dy, dz, maxT, grow) {
  let near = 0;
  let far = maxT;
  for (let axisIndex = 0; axisIndex < 3; axisIndex += 1) {
    const origin = axisIndex === 0 ? ox : axisIndex === 1 ? oy : oz;
    const direction = axisIndex === 0 ? dx : axisIndex === 1 ? dy : dz;
    const low = bounds[axisIndex] - grow;
    const high = bounds[axisIndex + 3] + grow;
    if (direction > -1e-12 && direction < 1e-12) {
      if (origin < low || origin > high) return false;
      continue;
    }
    const inverse = 1 / direction;
    const t0 = (low - origin) * inverse;
    const t1 = (high - origin) * inverse;
    if (t0 < t1) {
      if (t0 > near) near = t0;
      if (t1 < far) far = t1;
    } else {
      if (t1 > near) near = t1;
      if (t0 < far) far = t0;
    }
    if (near > far) return false;
  }
  return true;
}

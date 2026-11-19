// Finds the contact points of a rigid body for one step and hands them to the contact solver:
// its pieces against the terrain (vertex by vertex against the height field), against the static
// colliders near it (convex pieces, and the triangles of mesh colliders), and against the pieces
// of another body. Normals always point from the first body to the second, or to the world.
import { SURFACE_FRICTION, SURFACE_RESTITUTION } from '../surfaceTypes.js';
import { GROUND_CONTACT } from '../dynamics/contactSolver.js';
import { ConvexPoly } from './ConvexPoly.js';
import { ContactManifold, collideConvexPieces } from './contactManifold.js';
import { gatherMeshTriangles, meshTriangleIds, setWorldTriangle } from './meshTriangles.js';
import { COLLIDER_TYPE } from './StaticColliderSet.js';

const MAX_GROUND_POINTS = 8;
const STEEPEST_GROUND = 1.8;

/**
 * Adds the contacts of a body with the terrain.
 * @param {import('../dynamics/RigidBody.js').RigidBody} body The body.
 * @param {import('./GroundSurface.js').GroundSurface} ground The terrain.
 * @param {number} margin Vertices closer to the ground than this give a contact already.
 * @param {import('../dynamics/contactSolver.js').ContactSolver} solver Receives the contacts.
 * @returns {number} How many contact points were added.
 */
export function collectGroundContacts(body, ground, margin, solver) {
  const centreHeight = ground.heightAt(body.position.x, body.position.z);
  const reach = centreHeight + body.boundRadius * STEEPEST_GROUND + margin;
  if (body.bounds[1] > reach) return 0;
  body.refreshPieces();
  let added = 0;
  for (let i = 0; i < body.worldPieces.length; i += 1) {
    if (body.pieceBounds[i * 6 + 1] > reach) continue;
    const poly = body.worldPieces[i];
    const verts = poly.verts;
    const radius = poly.radius;
    let points = 0;
    for (let k = 0, end = poly.vertexCount * 3; k < end && points < MAX_GROUND_POINTS; k += 3) {
      const x = verts[k];
      const y = verts[k + 1] - radius;
      const z = verts[k + 2];
      const gap = y - ground.heightAt(x, z);
      if (gap > margin) continue;
      ground.normalAt(x, z, groundNormal);
      const surface = ground.surfaceAt(x, z);
      solver.add(body, null, x, y, z, -groundNormal.x, -groundNormal.y, -groundNormal.z, -gap * groundNormal.y,
        Math.sqrt(body.friction * SURFACE_FRICTION[surface]), (body.restitution + SURFACE_RESTITUTION[surface]) * 0.5,
        GROUND_CONTACT);
      points += 1;
    }
    added += points;
  }
  return added;
}

/**
 * Adds the contacts of a body with the static colliders listed in its `nearStatics`.
 * @param {import('../dynamics/RigidBody.js').RigidBody} body The body.
 * @param {import('./StaticColliderSet.js').StaticColliderSet} set The static colliders.
 * @param {number} margin Pieces closer than this give contacts already.
 * @param {import('../dynamics/contactSolver.js').ContactSolver} solver Receives the contacts.
 * @returns {number} How many contact points were added.
 */
export function collectStaticContacts(body, set, margin, solver) {
  const near = body.nearStatics;
  if (near.count === 0) return 0;
  body.refreshPieces();
  const bounds = set.bounds;
  const pieceBounds = body.pieceBounds;
  let added = 0;
  for (let n = 0; n < near.count; n += 1) {
    const index = near.items[n];
    const b = index * 6;
    const surface = set.surface[index];
    const friction = Math.sqrt(body.friction * SURFACE_FRICTION[surface]);
    const restitution = (body.restitution + SURFACE_RESTITUTION[surface]) * 0.5;
    const isMesh = set.type[index] === COLLIDER_TYPE.MESH;
    let expanded = false;
    for (let i = 0; i < body.worldPieces.length; i += 1) {
      const p = i * 6;
      if (pieceBounds[p] - margin > bounds[b + 3] || pieceBounds[p + 3] + margin < bounds[b]
        || pieceBounds[p + 1] - margin > bounds[b + 4] || pieceBounds[p + 4] + margin < bounds[b + 1]
        || pieceBounds[p + 2] - margin > bounds[b + 5] || pieceBounds[p + 5] + margin < bounds[b + 2]) continue;
      const piece = body.worldPieces[i];
      if (isMesh) {
        const triangles = gatherMeshTriangles(set, index, pieceBounds[p] - margin, pieceBounds[p + 1] - margin,
          pieceBounds[p + 2] - margin, pieceBounds[p + 3] + margin, pieceBounds[p + 4] + margin, pieceBounds[p + 5] + margin);
        for (let t = 0; t < triangles; t += 1) {
          if (!setWorldTriangle(set, index, meshTriangleIds[t], trianglePoly)) continue;
          added += addManifold(body, null, piece, trianglePoly, margin, solver, friction, restitution, index);
        }
      } else {
        if (!expanded) {
          set.expand(index, staticPoly);
          expanded = true;
        }
        added += addManifold(body, null, piece, staticPoly, margin, solver, friction, restitution, index);
      }
    }
  }
  return added;
}

/**
 * Adds the contacts between two bodies.
 * @param {import('../dynamics/RigidBody.js').RigidBody} a The first body.
 * @param {import('../dynamics/RigidBody.js').RigidBody} b The second body.
 * @param {number} margin Pieces closer than this give contacts already.
 * @param {import('../dynamics/contactSolver.js').ContactSolver} solver Receives the contacts.
 * @returns {number} The deepest overlap found (negative while apart), or -Infinity with no contact.
 */
export function collectBodyContacts(a, b, margin, solver) {
  a.refreshPieces();
  b.refreshPieces();
  const friction = Math.sqrt(a.friction * b.friction);
  const restitution = Math.max(a.restitution, b.restitution);
  const boundsA = a.pieceBounds;
  const boundsB = b.pieceBounds;
  let deepest = -Infinity;
  for (let i = 0; i < a.worldPieces.length; i += 1) {
    const p = i * 6;
    for (let j = 0; j < b.worldPieces.length; j += 1) {
      const q = j * 6;
      if (boundsA[p] - margin > boundsB[q + 3] || boundsA[p + 3] + margin < boundsB[q]
        || boundsA[p + 1] - margin > boundsB[q + 4] || boundsA[p + 4] + margin < boundsB[q + 1]
        || boundsA[p + 2] - margin > boundsB[q + 5] || boundsA[p + 5] + margin < boundsB[q + 2]) continue;
      if (addManifold(a, b, a.worldPieces[i], b.worldPieces[j], margin, solver, friction, restitution, -1) > 0) {
        for (let k = 0; k < manifold.count; k += 1) if (manifold.depths[k] > deepest) deepest = manifold.depths[k];
      }
    }
  }
  return deepest;
}

function addManifold(a, b, polyA, polyB, margin, solver, friction, restitution, staticIndex) {
  if (!collideConvexPieces(polyA, polyB, margin, manifold)) return 0;
  const points = manifold.points;
  for (let k = 0; k < manifold.count; k += 1) {
    solver.add(a, b, points[k * 3], points[k * 3 + 1], points[k * 3 + 2], manifold.nx, manifold.ny, manifold.nz,
      manifold.depths[k], friction, restitution, staticIndex);
  }
  return manifold.count;
}

const groundNormal = { x: 0, y: 1, z: 0 };
const manifold = new ContactManifold();
const staticPoly = new ConvexPoly(64, 48, 96);
const trianglePoly = new ConvexPoly(24, 14, 36);

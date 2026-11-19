// Turns collider descriptions into physics shapes. A description is plain data: the collision
// proxies an Asset of the asset library exposes (boxes, cylinders and spheres as a local
// transform and a full size in metres; convex hulls and triangle meshes as vertex arrays), or the
// city's own primitives (oriented boxes, footprint prisms, ramps, poles). The same descriptions
// become static colliders placed in the world or the convex pieces of a moving body.
import { quaternionFromHeading, matrixFromQuaternion } from '../math/vectorMath.js';
import { LAYER } from '../collisionLayers.js';
import { surfaceIdOf } from '../surfaceTypes.js';
import { ConvexPoly, setBoxPoly, setCapsulePoly, setCylinderPoly, setSpherePoly } from './ConvexPoly.js';
import { buildConvexHullPoly } from './convexHullBuilder.js';
import { COLLIDER_TYPE } from './StaticColliderSet.js';
import { TriangleMesh } from './TriangleMesh.js';

/**
 * A collision proxy as plain data, in the space of the thing it belongs to (an asset, a body).
 * The ColliderInfo objects of the asset library fit as they are.
 * @typedef {object} ColliderDescription
 * @property {'box' | 'cyl' | 'cylinder' | 'sphere' | 'capsule' | 'hull' | 'mesh'} shape The shape.
 * @property {{x: number, y: number, z: number}} [position] Centre (boxes, cylinders, spheres).
 * @property {{x: number, y: number, z: number, w: number}} [quaternion] Orientation.
 * @property {{x: number, y: number, z: number}} [size] Full width, height and depth in metres.
 * @property {number} [radius] Radius of a cylinder, sphere or capsule (default size.x / 2).
 * @property {number} [height] Length of a cylinder or capsule along its local Y (default size.y).
 * @property {ArrayLike<number>} [vertices] Hull or mesh positions, three numbers each, in the
 *   same space as the other proxies (position and quaternion are not applied to them).
 * @property {ArrayLike<number> | null} [indices] Mesh triangle indices.
 * @property {{attributes: {position: {array: ArrayLike<number>}}, index?: {array: ArrayLike<number>} | null}} [geometry]
 *   A buffer geometry to read vertices and indices from instead (as ColliderInfo has).
 * @property {number | string} [surface] SURFACE id or name of this proxy.
 */

/**
 * Where a set of descriptions is placed in the world.
 * @typedef {object} ColliderPlacement
 * @property {number} [x] World position of the origin of the descriptions' space.
 * @property {number} [y]
 * @property {number} [z]
 * @property {number} [heading] Compass heading (0 = -Z, clockwise), when there is no quaternion.
 * @property {{x: number, y: number, z: number, w: number}} [quaternion] Full orientation.
 * @property {number} [scale] Uniform scale (default 1).
 */

/**
 * What every static collider can carry.
 * @typedef {object} ColliderOptions
 * @property {number} [layer] LAYER bit (default LAYER.STATIC).
 * @property {number | string} [surface] SURFACE id or name (default concrete).
 * @property {unknown} [userRef] The game's reference, returned by queries and events.
 * @property {number} [group] Group id (a sector), for removeStaticGroup().
 */

const SLENDER_RATIO = 3;
const IDENTITY_QUATERNION = { x: 0, y: 0, z: 0, w: 1 };
const ZERO = { x: 0, y: 0, z: 0 };
const placementRotation = new Float64Array(9);
const localRotation = new Float64Array(9);
const worldRotation = new Float64Array(9);
const scratchQuaternion = { x: 0, y: 0, z: 0, w: 1 };
const scratchPoly = new ConvexPoly(24, 14, 36);
const hullCache = new WeakMap();
const meshCache = new WeakMap();

/**
 * Adds the static colliders of a set of descriptions placed in the world.
 * @param {import('./StaticColliderSet.js').StaticColliderSet} set The collider set.
 * @param {ColliderDescription[]} descriptions The proxies, in their own space.
 * @param {ColliderPlacement} [placement] Where that space sits in the world.
 * @param {ColliderOptions} [options] Layer, surface, user reference and group for all of them.
 * @param {number[]} [handles] Receives the new handles (appended).
 * @returns {number[]} The handles, one per description.
 */
export function addStaticDescriptions(set, descriptions, placement = {}, options = {}, handles = []) {
  const px = placement.x ?? 0;
  const py = placement.y ?? 0;
  const pz = placement.z ?? 0;
  const scale = placement.scale ?? 1;
  matrixFromQuaternion(placement.quaternion ?? quaternionFromHeading(placement.heading ?? 0, scratchQuaternion), placementRotation);
  const layer = options.layer ?? LAYER.STATIC;
  const group = options.group ?? 0;
  const userRef = options.userRef ?? null;
  const m = placementRotation;
  for (const description of descriptions) {
    const surface = surfaceIdOf(description.surface ?? options.surface ?? 1);
    const position = description.position ?? ZERO;
    const lx = position.x * scale;
    const ly = position.y * scale;
    const lz = position.z * scale;
    const cx = px + m[0] * lx + m[1] * ly + m[2] * lz;
    const cy = py + m[3] * lx + m[4] * ly + m[5] * lz;
    const cz = pz + m[6] * lx + m[7] * ly + m[8] * lz;
    matrixFromQuaternion(description.quaternion ?? IDENTITY_QUATERNION, localRotation);
    multiplyMatrices(m, localRotation, worldRotation);
    const size = description.size ?? ZERO;
    const shape = description.shape;
    if (shape === 'box') {
      handles.push(set.add(COLLIDER_TYPE.BOX, layer, surface, cx, cy, cz, worldRotation,
        size.x * 0.5 * scale, size.y * 0.5 * scale, size.z * 0.5 * scale, null, userRef, group));
    } else if (shape === 'cyl' || shape === 'cylinder' || shape === 'capsule') {
      const radius = (description.radius ?? size.x * 0.5) * scale;
      const height = (description.height ?? size.y) * scale;
      if (shape === 'capsule' || height > radius * 2 * SLENDER_RATIO) {
        handles.push(set.add(COLLIDER_TYPE.CAPSULE, layer, surface, cx, cy, cz, worldRotation,
          radius, Math.max(height * 0.5 - radius, 0), 0, null, userRef, group));
      } else {
        handles.push(set.add(COLLIDER_TYPE.CYLINDER, layer, surface, cx, cy, cz, worldRotation,
          radius, height * 0.5, 0, null, userRef, group));
      }
    } else if (shape === 'sphere') {
      handles.push(set.add(COLLIDER_TYPE.SPHERE, layer, surface, cx, cy, cz, worldRotation,
        (description.radius ?? size.x * 0.5) * scale, 0, 0, null, userRef, group));
    } else if (shape === 'hull') {
      handles.push(set.add(COLLIDER_TYPE.HULL, layer, surface, px, py, pz, m, 0, 0, 0,
        sharedHull(description, scale), userRef, group));
    } else if (shape === 'mesh') {
      handles.push(set.add(COLLIDER_TYPE.MESH, layer, surface, px, py, pz, m, 0, 0, 0,
        sharedMesh(description, scale), userRef, group));
    } else {
      throw new Error(`unknown collider shape: ${shape}`);
    }
  }
  return handles;
}

/**
 * Builds the convex pieces of a moving body from collider descriptions.
 * @param {ColliderDescription[]} descriptions The proxies, in the body's model space.
 * @param {number} [originX] The body's centre of mass in that space; pieces are made relative to it.
 * @param {number} [originY]
 * @param {number} [originZ]
 * @param {number} [scale] Uniform scale.
 * @returns {ConvexPoly[]} One piece per description (a triangle mesh becomes its convex hull).
 */
export function buildBodyPieces(descriptions, originX = 0, originY = 0, originZ = 0, scale = 1) {
  const pieces = [];
  for (const description of descriptions) {
    const position = description.position ?? ZERO;
    const cx = position.x * scale - originX;
    const cy = position.y * scale - originY;
    const cz = position.z * scale - originZ;
    matrixFromQuaternion(description.quaternion ?? IDENTITY_QUATERNION, localRotation);
    const size = description.size ?? ZERO;
    const shape = description.shape;
    if (shape === 'box') {
      pieces.push(setBoxPoly(scratchPoly, cx, cy, cz, localRotation, size.x * 0.5 * scale, size.y * 0.5 * scale,
        size.z * 0.5 * scale).clone());
    } else if (shape === 'cyl' || shape === 'cylinder' || shape === 'capsule') {
      const radius = (description.radius ?? size.x * 0.5) * scale;
      const height = (description.height ?? size.y) * scale;
      if (shape === 'capsule' || height > radius * 2 * SLENDER_RATIO) {
        const reach = Math.max(height * 0.5 - radius, 0);
        const ax = localRotation[1] * reach;
        const ay = localRotation[4] * reach;
        const az = localRotation[7] * reach;
        pieces.push(setCapsulePoly(scratchPoly, cx - ax, cy - ay, cz - az, cx + ax, cy + ay, cz + az, radius).clone());
      } else {
        pieces.push(setCylinderPoly(scratchPoly, cx, cy, cz, localRotation, radius, height * 0.5).clone());
      }
    } else if (shape === 'sphere') {
      pieces.push(setSpherePoly(scratchPoly, cx, cy, cz, (description.radius ?? size.x * 0.5) * scale).clone());
    } else if (shape === 'hull' || shape === 'mesh') {
      pieces.push(buildConvexHullPoly(verticesOf(description), {
        scale, offsetX: -originX, offsetY: -originY, offsetZ: -originZ,
      }));
    } else {
      throw new Error(`unknown collider shape: ${shape}`);
    }
  }
  return pieces;
}

/**
 * Describes a convex prism: a footprint polygon on the ground plane pulled up between two heights
 * (a building that is not a rectangle).
 * @param {ArrayLike<number>} footprint The convex footprint as x0, z0, x1, z1, ...
 * @param {number} yBottom The height of its base.
 * @param {number} yTop The height of its top.
 * @returns {ColliderDescription} A hull description.
 */
export function describePrism(footprint, yBottom, yTop) {
  const vertices = [];
  for (let i = 0; i + 1 < footprint.length; i += 2) {
    vertices.push(footprint[i], yBottom, footprint[i + 1], footprint[i], yTop, footprint[i + 1]);
  }
  return { shape: 'hull', vertices: new Float64Array(vertices) };
}

/**
 * Describes a ramp (a wedge): a rectangle on the ground that rises along its length to a height.
 * In its own space the low edge is at z = +length / 2 and the high edge at z = -length / 2, so a
 * ramp placed with a heading rises in the direction of that heading.
 * @param {number} width Size across the ramp (X).
 * @param {number} length Size along the ramp (Z).
 * @param {number} height Height of the high edge.
 * @returns {ColliderDescription} A hull description.
 */
export function describeRamp(width, length, height) {
  const w = width * 0.5;
  const l = length * 0.5;
  return {
    shape: 'hull',
    vertices: new Float64Array([-w, 0, l, w, 0, l, -w, 0, -l, w, 0, -l, -w, height, -l, w, height, -l]),
  };
}

/**
 * The vertex positions of a hull or mesh description.
 * @param {ColliderDescription} description The description.
 * @returns {ArrayLike<number>} Three numbers per vertex.
 */
export function verticesOf(description) {
  const vertices = description.vertices ?? description.geometry?.attributes?.position?.array;
  if (!vertices) throw new Error(`collider "${description.shape}" has no vertices`);
  return vertices;
}

function indicesOf(description) {
  return description.indices ?? description.geometry?.index?.array ?? null;
}

function sharedHull(description, scale) {
  const vertices = verticesOf(description);
  let byScale = hullCache.get(vertices);
  if (!byScale) {
    byScale = new Map();
    hullCache.set(vertices, byScale);
  }
  let hull = byScale.get(scale);
  if (!hull) {
    hull = buildConvexHullPoly(vertices, { scale });
    byScale.set(scale, hull);
  }
  return hull;
}

function sharedMesh(description, scale) {
  const vertices = verticesOf(description);
  let byScale = meshCache.get(vertices);
  if (!byScale) {
    byScale = new Map();
    meshCache.set(vertices, byScale);
  }
  let mesh = byScale.get(scale);
  if (!mesh) {
    mesh = new TriangleMesh(vertices, indicesOf(description), { scale });
    byScale.set(scale, mesh);
  }
  return mesh;
}

function multiplyMatrices(a, b, out) {
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      out[row * 3 + column] = a[row * 3] * b[column] + a[row * 3 + 1] * b[3 + column] + a[row * 3 + 2] * b[6 + column];
    }
  }
  return out;
}

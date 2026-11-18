// A rigid body: position and orientation of its centre of mass, linear and angular velocity,
// mass and inertia, and the convex pieces that collide for it. Vehicles, boats, helicopters,
// knocked-over props and debris are all rigid bodies; what differs is the forces their owners
// apply before each step.
import {
  integrateQuaternion, matrixFromQuaternion, quaternionFromHeading, rotateVectorByQuaternion, worldInverseInertia,
} from '../math/vectorMath.js';
import { ConvexPoly, boundsOfPoly, transformPoly } from '../collision/ConvexPoly.js';
import { IndexList } from '../collision/StaticColliderSet.js';
import { LAYER, MASK } from '../collisionLayers.js';

/**
 * What a rigid body is made from.
 * @typedef {object} RigidBodyOptions
 * @property {number} [mass] Kilograms (default 100).
 * @property {{x: number, y: number, z: number}} [inertia] Moments of inertia about the local
 *   axes; by default those of a solid box the size of the pieces' bounds.
 * @property {ConvexPoly[]} [pieces] Collision pieces in the body's space (origin at the centre of
 *   mass), as buildBodyPieces() makes them.
 * @property {number} [x] World position of the centre of mass.
 * @property {number} [y]
 * @property {number} [z]
 * @property {number} [heading] Compass heading (0 = -Z, clockwise).
 * @property {{x: number, y: number, z: number, w: number}} [quaternion] Full orientation instead.
 * @property {number} [layer] LAYER bit (default LAYER.PROP).
 * @property {number} [collidesWith] LAYER bits this body collides with (default everything solid).
 * @property {number} [friction] Sliding friction (default 0.5).
 * @property {number} [restitution] Bounce, 0 to 1 (default 0.2).
 * @property {number} [linearDamping] Share of linear velocity lost per second (default 0.02).
 * @property {number} [angularDamping] Share of angular velocity lost per second (default 0.05).
 * @property {{x: number, y: number, z: number}} [modelOffset] Where the model's origin is, in the
 *   body's space (the centre of mass is the body's origin).
 * @property {unknown} [userRef] The game's reference, returned by queries and events.
 */

let nextBodyId = 1;

export class RigidBody {
  /** @param {RigidBodyOptions} [options] */
  constructor(options = {}) {
    /** A number unique to this body, in creation order. */
    this.id = nextBodyId++;
    /** World position of the centre of mass. */
    this.position = { x: options.x ?? 0, y: options.y ?? 0, z: options.z ?? 0 };
    /** Orientation. */
    this.quaternion = { x: 0, y: 0, z: 0, w: 1 };
    if (options.quaternion) {
      this.quaternion.x = options.quaternion.x;
      this.quaternion.y = options.quaternion.y;
      this.quaternion.z = options.quaternion.z;
      this.quaternion.w = options.quaternion.w;
    } else if (options.heading !== undefined) {
      quaternionFromHeading(options.heading, this.quaternion);
    }
    /** Velocity of the centre of mass, metres per second. */
    this.linearVelocity = { x: 0, y: 0, z: 0 };
    /** Angular velocity in world axes, radians per second. */
    this.angularVelocity = { x: 0, y: 0, z: 0 };
    /** Position and orientation at the start of the last step, for interpolated drawing. */
    this.previousPosition = { x: this.position.x, y: this.position.y, z: this.position.z };
    this.previousQuaternion = { x: this.quaternion.x, y: this.quaternion.y, z: this.quaternion.z, w: this.quaternion.w };
    /** Rotation matrix (row order); its columns are the body's right, up and back axes. */
    this.rotation = new Float64Array(9);
    /** Kilograms. */
    this.mass = options.mass ?? 100;
    this.inverseMass = 1 / this.mass;
    /** Inverse moments of inertia about the local axes. */
    this.inverseInertia = { x: 0, y: 0, z: 0 };
    this.inverseInertiaWorld = new Float64Array(9);
    /** @type {ConvexPoly[]} Collision pieces in the body's space. */
    this.pieces = options.pieces ?? [];
    /** @type {ConvexPoly[]} The same pieces in world space (see refreshPieces). */
    this.worldPieces = this.pieces.map((piece) => new ConvexPoly(piece.vertexCount, piece.faceCount,
      Math.max(piece.edgeCount, piece.edgeDirCount)));
    /** World bounds of each piece, six numbers each. */
    this.pieceBounds = new Float64Array(Math.max(1, this.pieces.length) * 6);
    this.piecesDirty = true;
    /** World bounds of the whole body: minX, minY, minZ, maxX, maxY, maxZ. */
    this.bounds = new Float64Array(6);
    /** Centre and half size of the pieces' bounds in the body's space. */
    this.localCentre = { x: 0, y: 0, z: 0 };
    this.localHalf = { x: 0.1, y: 0.1, z: 0.1 };
    /** Radius of a sphere around the centre of mass that holds every piece. */
    this.boundRadius = 0.1;
    this.#measurePieces();
    const inertia = options.inertia ?? this.#boxInertia();
    this.setInertia(inertia.x, inertia.y, inertia.z);
    /** LAYER bit of this body. */
    this.layer = options.layer ?? LAYER.PROP;
    /** LAYER bits this body collides with. */
    this.collidesWith = options.collidesWith ?? (MASK.SOLID | LAYER.DEBRIS);
    this.friction = options.friction ?? 0.5;
    this.restitution = options.restitution ?? 0.2;
    this.linearDamping = options.linearDamping ?? 0.02;
    this.angularDamping = options.angularDamping ?? 0.05;
    /** Multiplies gravity for this body (0 for none). */
    this.gravityScale = 1;
    /** True while the body rests and is skipped by the simulation. */
    this.asleep = false;
    /** Set false to keep the body simulated even at rest. */
    this.canSleep = true;
    this.sleepTimer = 0;
    /** True for a body moved by its owner, not by forces: others bounce off it, it never yields. */
    this.kinematic = false;
    /** The model's origin in the body's space. */
    this.modelOffset = { x: options.modelOffset?.x ?? 0, y: options.modelOffset?.y ?? 0, z: options.modelOffset?.z ?? 0 };
    /** The game's reference. */
    this.userRef = options.userRef ?? null;
    /** The physics object built on this body (a Vehicle, a Boat, a prop), if any. */
    this.owner = null;
    /** How many contacts the body had in the last substep. */
    this.contactCount = 0;
    /** Static colliders near the body, refreshed once per step. */
    this.nearStatics = new IndexList(32);
    // Position-correction velocities of the contact solver (never kept between steps).
    this.pushX = 0;
    this.pushY = 0;
    this.pushZ = 0;
    this.turnX = 0;
    this.turnY = 0;
    this.turnZ = 0;
    this.updateDerived();
  }

  #measurePieces() {
    if (this.pieces.length === 0) return;
    const bounds = new Float64Array(6);
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;
    let radius = 0;
    for (const piece of this.pieces) {
      boundsOfPoly(piece, bounds);
      minX = Math.min(minX, bounds[0]);
      minY = Math.min(minY, bounds[1]);
      minZ = Math.min(minZ, bounds[2]);
      maxX = Math.max(maxX, bounds[3]);
      maxY = Math.max(maxY, bounds[4]);
      maxZ = Math.max(maxZ, bounds[5]);
      for (let i = 0; i < piece.vertexCount * 3; i += 3) {
        radius = Math.max(radius, Math.hypot(piece.verts[i], piece.verts[i + 1], piece.verts[i + 2]) + piece.radius);
      }
    }
    this.localCentre.x = (minX + maxX) * 0.5;
    this.localCentre.y = (minY + maxY) * 0.5;
    this.localCentre.z = (minZ + maxZ) * 0.5;
    this.localHalf.x = (maxX - minX) * 0.5;
    this.localHalf.y = (maxY - minY) * 0.5;
    this.localHalf.z = (maxZ - minZ) * 0.5;
    this.boundRadius = radius;
  }

  #boxInertia() {
    const w = Math.max(this.localHalf.x * 2, 0.05);
    const h = Math.max(this.localHalf.y * 2, 0.05);
    const d = Math.max(this.localHalf.z * 2, 0.05);
    const k = this.mass / 12;
    return { x: k * (h * h + d * d), y: k * (w * w + d * d), z: k * (w * w + h * h) };
  }

  /**
   * Sets the mass, scaling the inertia with it.
   * @param {number} mass Kilograms.
   */
  setMass(mass) {
    const ratio = mass / this.mass;
    this.mass = mass;
    this.inverseMass = 1 / mass;
    this.inverseInertia.x /= ratio;
    this.inverseInertia.y /= ratio;
    this.inverseInertia.z /= ratio;
    this.updateDerived();
  }

  /**
   * Sets the moments of inertia about the body's local axes.
   * @param {number} ix About local X (pitch).
   * @param {number} iy About local Y (yaw).
   * @param {number} iz About local Z (roll).
   */
  setInertia(ix, iy, iz) {
    this.inverseInertia.x = 1 / ix;
    this.inverseInertia.y = 1 / iy;
    this.inverseInertia.z = 1 / iz;
  }

  /**
   * Moves the body to a pose and forgets the previous one (no interpolation across the jump).
   * @param {number} x World position of the centre of mass.
   * @param {number} y
   * @param {number} z
   * @param {{x: number, y: number, z: number, w: number}} [quaternion] Orientation, if it changes.
   */
  setPose(x, y, z, quaternion) {
    this.position.x = x;
    this.position.y = y;
    this.position.z = z;
    if (quaternion) {
      this.quaternion.x = quaternion.x;
      this.quaternion.y = quaternion.y;
      this.quaternion.z = quaternion.z;
      this.quaternion.w = quaternion.w;
    }
    this.storePrevious();
    this.updateDerived();
  }

  /** Remembers the current pose as the previous one. */
  storePrevious() {
    this.previousPosition.x = this.position.x;
    this.previousPosition.y = this.position.y;
    this.previousPosition.z = this.position.z;
    this.previousQuaternion.x = this.quaternion.x;
    this.previousQuaternion.y = this.quaternion.y;
    this.previousQuaternion.z = this.quaternion.z;
    this.previousQuaternion.w = this.quaternion.w;
  }

  /** Recomputes what follows from the pose: rotation matrix, world inertia and bounds. */
  updateDerived() {
    const r = matrixFromQuaternion(this.quaternion, this.rotation);
    worldInverseInertia(r, this.inverseInertia.x, this.inverseInertia.y, this.inverseInertia.z, this.inverseInertiaWorld);
    const c = this.localCentre;
    const h = this.localHalf;
    const cx = this.position.x + r[0] * c.x + r[1] * c.y + r[2] * c.z;
    const cy = this.position.y + r[3] * c.x + r[4] * c.y + r[5] * c.z;
    const cz = this.position.z + r[6] * c.x + r[7] * c.y + r[8] * c.z;
    const ex = Math.abs(r[0]) * h.x + Math.abs(r[1]) * h.y + Math.abs(r[2]) * h.z;
    const ey = Math.abs(r[3]) * h.x + Math.abs(r[4]) * h.y + Math.abs(r[5]) * h.z;
    const ez = Math.abs(r[6]) * h.x + Math.abs(r[7]) * h.y + Math.abs(r[8]) * h.z;
    const bounds = this.bounds;
    bounds[0] = cx - ex;
    bounds[1] = cy - ey;
    bounds[2] = cz - ez;
    bounds[3] = cx + ex;
    bounds[4] = cy + ey;
    bounds[5] = cz + ez;
    this.piecesDirty = true;
  }

  /** Brings the world-space pieces and their bounds up to date with the pose. */
  refreshPieces() {
    if (!this.piecesDirty) return;
    this.piecesDirty = false;
    for (let i = 0; i < this.pieces.length; i += 1) {
      transformPoly(this.pieces[i], this.position.x, this.position.y, this.position.z, this.rotation, this.worldPieces[i]);
      boundsOfPoly(this.worldPieces[i], this.pieceBounds, i * 6);
    }
  }

  /** Wakes the body. */
  wake() {
    this.asleep = false;
    this.sleepTimer = 0;
  }

  /** Puts the body to rest. */
  sleep() {
    this.asleep = true;
    this.linearVelocity.x = this.linearVelocity.y = this.linearVelocity.z = 0;
    this.angularVelocity.x = this.angularVelocity.y = this.angularVelocity.z = 0;
  }

  /** True when forces and contacts can move the body. */
  get movable() {
    return !this.asleep && !this.kinematic;
  }

  /**
   * Applies an impulse at a world point.
   * @param {number} ix Impulse in newton seconds.
   * @param {number} iy
   * @param {number} iz
   * @param {number} px The world point it acts on.
   * @param {number} py
   * @param {number} pz
   */
  applyImpulse(ix, iy, iz, px, py, pz) {
    const v = this.linearVelocity;
    const w = this.angularVelocity;
    const m = this.inverseMass;
    v.x += ix * m;
    v.y += iy * m;
    v.z += iz * m;
    const rx = px - this.position.x;
    const ry = py - this.position.y;
    const rz = pz - this.position.z;
    const tx = ry * iz - rz * iy;
    const ty = rz * ix - rx * iz;
    const tz = rx * iy - ry * ix;
    const k = this.inverseInertiaWorld;
    w.x += k[0] * tx + k[1] * ty + k[2] * tz;
    w.y += k[3] * tx + k[4] * ty + k[5] * tz;
    w.z += k[6] * tx + k[7] * ty + k[8] * tz;
  }

  /**
   * Applies an impulse through the centre of mass.
   * @param {number} ix Impulse in newton seconds.
   * @param {number} iy
   * @param {number} iz
   */
  applyCentralImpulse(ix, iy, iz) {
    const m = this.inverseMass;
    this.linearVelocity.x += ix * m;
    this.linearVelocity.y += iy * m;
    this.linearVelocity.z += iz * m;
  }

  /**
   * Applies a pure turning impulse.
   * @param {number} tx Angular impulse in newton metre seconds, world axes.
   * @param {number} ty
   * @param {number} tz
   */
  applyAngularImpulse(tx, ty, tz) {
    const k = this.inverseInertiaWorld;
    const w = this.angularVelocity;
    w.x += k[0] * tx + k[1] * ty + k[2] * tz;
    w.y += k[3] * tx + k[4] * ty + k[5] * tz;
    w.z += k[6] * tx + k[7] * ty + k[8] * tz;
  }

  /**
   * The velocity of the body's material at a world point.
   * @param {number} px The point.
   * @param {number} py
   * @param {number} pz
   * @param {{x: number, y: number, z: number}} out Receives the velocity.
   * @returns {{x: number, y: number, z: number}} `out`.
   */
  velocityAt(px, py, pz, out) {
    const w = this.angularVelocity;
    const rx = px - this.position.x;
    const ry = py - this.position.y;
    const rz = pz - this.position.z;
    out.x = this.linearVelocity.x + w.y * rz - w.z * ry;
    out.y = this.linearVelocity.y + w.z * rx - w.x * rz;
    out.z = this.linearVelocity.z + w.x * ry - w.y * rx;
    return out;
  }

  /**
   * How much mass the body shows to an impulse along a direction at a world point.
   * @param {number} px The point.
   * @param {number} py
   * @param {number} pz
   * @param {number} nx The direction (unit).
   * @param {number} ny
   * @param {number} nz
   * @returns {number} Kilograms.
   */
  effectiveMassAt(px, py, pz, nx, ny, nz) {
    const rx = px - this.position.x;
    const ry = py - this.position.y;
    const rz = pz - this.position.z;
    const tx = ry * nz - rz * ny;
    const ty = rz * nx - rx * nz;
    const tz = rx * ny - ry * nx;
    const k = this.inverseInertiaWorld;
    const ax = k[0] * tx + k[1] * ty + k[2] * tz;
    const ay = k[3] * tx + k[4] * ty + k[5] * tz;
    const az = k[6] * tx + k[7] * ty + k[8] * tz;
    return 1 / (this.inverseMass + tx * ax + ty * ay + tz * az);
  }

  /**
   * Converts a point of the body's space to world space.
   * @param {number} x Local point.
   * @param {number} y
   * @param {number} z
   * @param {{x: number, y: number, z: number}} out Receives the world point.
   * @returns {{x: number, y: number, z: number}} `out`.
   */
  localToWorld(x, y, z, out) {
    const r = this.rotation;
    out.x = this.position.x + r[0] * x + r[1] * y + r[2] * z;
    out.y = this.position.y + r[3] * x + r[4] * y + r[5] * z;
    out.z = this.position.z + r[6] * x + r[7] * y + r[8] * z;
    return out;
  }

  /**
   * Advances the pose by the velocities (plus the solver's correction) over a time step.
   * @param {number} dt Seconds.
   */
  integratePose(dt) {
    const p = this.position;
    const v = this.linearVelocity;
    const w = this.angularVelocity;
    p.x += (v.x + this.pushX) * dt;
    p.y += (v.y + this.pushY) * dt;
    p.z += (v.z + this.pushZ) * dt;
    integrateQuaternion(this.quaternion, w.x + this.turnX, w.y + this.turnY, w.z + this.turnZ, dt);
    this.pushX = this.pushY = this.pushZ = 0;
    this.turnX = this.turnY = this.turnZ = 0;
    this.updateDerived();
  }

  /**
   * The world position of the model's origin (the point the drawn model is placed at).
   * @param {{x: number, y: number, z: number}} out Receives the position.
   * @returns {{x: number, y: number, z: number}} `out`.
   */
  modelPosition(out) {
    return this.localToWorld(this.modelOffset.x, this.modelOffset.y, this.modelOffset.z, out);
  }

  /**
   * The pose to draw the model at, blended between the last two steps.
   * @param {number} alpha 0 for the previous step, 1 for the current one.
   * @param {{x: number, y: number, z: number}} outPosition Receives the model origin.
   * @param {{x: number, y: number, z: number, w: number}} outQuaternion Receives the orientation.
   */
  interpolatedPose(alpha, outPosition, outQuaternion) {
    const a = this.previousQuaternion;
    const b = this.quaternion;
    const sign = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w < 0 ? -1 : 1;
    let x = a.x + (b.x * sign - a.x) * alpha;
    let y = a.y + (b.y * sign - a.y) * alpha;
    let z = a.z + (b.z * sign - a.z) * alpha;
    let w = a.w + (b.w * sign - a.w) * alpha;
    const inverse = 1 / Math.sqrt(x * x + y * y + z * z + w * w);
    x *= inverse;
    y *= inverse;
    z *= inverse;
    w *= inverse;
    outQuaternion.x = x;
    outQuaternion.y = y;
    outQuaternion.z = z;
    outQuaternion.w = w;
    const o = this.modelOffset;
    rotateVectorByQuaternion(outQuaternion, o.x, o.y, o.z, outPosition);
    const p0 = this.previousPosition;
    const p1 = this.position;
    outPosition.x += p0.x + (p1.x - p0.x) * alpha;
    outPosition.y += p0.y + (p1.y - p0.y) * alpha;
    outPosition.z += p0.z + (p1.z - p0.z) * alpha;
  }
}

// The contact solver: sequential impulses over the contact points of a step. Each point stops its
// two bodies approaching along the normal (with bounce above a small speed), applies friction in
// the contact plane, and corrects overlap with a separate push that never turns into velocity.
// A point that is still a little apart (negative depth) only limits the approach to what closes
// the gap in this step, which is what stops fast bodies tunnelling through thin walls.

const STRIDE = 24;
const P = 0;
const N = 3;
const DEPTH = 6;
const FRICTION = 7;
const RESTITUTION = 8;
const MASS_N = 9;
const BIAS = 10;
const LAMBDA_N = 11;
const T1 = 12;
const T2 = 15;
const MASS_T1 = 18;
const MASS_T2 = 19;
const LAMBDA_T1 = 20;
const LAMBDA_T2 = 21;
const CLOSING = 22;
const LAMBDA_P = 23;

const BOUNCE_SPEED = 1;
const TOUCH_DEPTH = -0.01;
const SLOP = 0.008;
const CORRECTION = 0.25;
const MAX_CORRECTION_SPEED = 3;

/** A contact with the terrain has this in `staticIndex`. */
export const GROUND_CONTACT = -2;

export class ContactSolver {
  /** @param {number} [capacity] Initial number of contact points (it grows). */
  constructor(capacity = 512) {
    /** How many contact points this step has. */
    this.count = 0;
    this.capacity = capacity;
    this.data = new Float64Array(capacity * STRIDE);
    /** @type {(import('./RigidBody.js').RigidBody | null)[]} The first body of each point. */
    this.bodyA = new Array(capacity).fill(null);
    /** @type {(import('./RigidBody.js').RigidBody | null)[]} The second body, null for the world. */
    this.bodyB = new Array(capacity).fill(null);
    /** Static collider index of each point, -1 for none, GROUND_CONTACT for the terrain. */
    this.staticIndex = new Int32Array(capacity);
    this.flags = new Uint8Array(capacity);
    this.velocityIterations = 8;
    this.positionIterations = 3;
  }

  /** Forgets the contact points of the last step. */
  begin() {
    for (let i = 0; i < this.count; i += 1) {
      this.bodyA[i] = null;
      this.bodyB[i] = null;
    }
    this.count = 0;
  }

  /**
   * Adds a contact point.
   * @param {import('./RigidBody.js').RigidBody} a The first body.
   * @param {import('./RigidBody.js').RigidBody | null} b The second body, or null for the fixed world.
   * @param {number} px The point.
   * @param {number} py
   * @param {number} pz
   * @param {number} nx The normal, a unit vector from A to B.
   * @param {number} ny
   * @param {number} nz
   * @param {number} depth Overlap along the normal; negative while the bodies are still apart.
   * @param {number} friction Combined friction.
   * @param {number} restitution Combined bounce.
   * @param {number} [staticIndex] The static collider index, or GROUND_CONTACT.
   * @returns {number} The point's index.
   */
  add(a, b, px, py, pz, nx, ny, nz, depth, friction, restitution, staticIndex = -1) {
    if (this.count === this.capacity) this.#grow();
    const i = this.count;
    this.count += 1;
    const o = i * STRIDE;
    const d = this.data;
    d[o + P] = px;
    d[o + P + 1] = py;
    d[o + P + 2] = pz;
    d[o + N] = nx;
    d[o + N + 1] = ny;
    d[o + N + 2] = nz;
    d[o + DEPTH] = depth;
    d[o + FRICTION] = friction;
    d[o + RESTITUTION] = restitution;
    this.bodyA[i] = a;
    this.bodyB[i] = b;
    this.staticIndex[i] = staticIndex;
    a.contactCount += 1;
    if (b !== null) b.contactCount += 1;
    return i;
  }

  #grow() {
    const capacity = this.capacity * 2;
    const data = new Float64Array(capacity * STRIDE);
    data.set(this.data);
    this.data = data;
    const staticIndex = new Int32Array(capacity);
    staticIndex.set(this.staticIndex);
    this.staticIndex = staticIndex;
    this.flags = new Uint8Array(capacity);
    for (let i = this.capacity; i < capacity; i += 1) {
      this.bodyA.push(null);
      this.bodyB.push(null);
    }
    this.capacity = capacity;
  }

  /** @param {number} i A point index. @returns {number} The normal impulse the solver applied. */
  normalImpulse(i) {
    return this.data[i * STRIDE + LAMBDA_N];
  }

  /** @param {number} i A point index. @returns {number} The closing speed before the solve (positive when approaching). */
  closingSpeed(i) {
    return this.data[i * STRIDE + CLOSING];
  }

  /** @param {number} i A point index. @returns {number} Where the point's numbers start in `data` (point, then normal). */
  offsetOf(i) {
    return i * STRIDE;
  }

  /**
   * Solves the contact points: changes the bodies' velocities and their correction pushes.
   * @param {number} dt The step in seconds.
   */
  solve(dt) {
    const d = this.data;
    const count = this.count;
    const inverseDt = 1 / dt;
    for (let i = 0; i < count; i += 1) {
      const o = i * STRIDE;
      const a = this.bodyA[i];
      const b = this.bodyB[i];
      const moveA = a.movable;
      const moveB = b !== null && b.movable;
      this.flags[i] = (moveA ? 1 : 0) | (moveB ? 2 : 0);
      const px = d[o + P];
      const py = d[o + P + 1];
      const pz = d[o + P + 2];
      const nx = d[o + N];
      const ny = d[o + N + 1];
      const nz = d[o + N + 2];
      // Two directions across the normal for friction.
      let tx;
      let ty;
      let tz;
      if (nx > -0.6 && nx < 0.6) {
        tx = 0;
        ty = nz;
        tz = -ny;
      } else {
        tx = -nz;
        ty = 0;
        tz = nx;
      }
      const inverse = 1 / Math.sqrt(tx * tx + ty * ty + tz * tz);
      tx *= inverse;
      ty *= inverse;
      tz *= inverse;
      const ux = ny * tz - nz * ty;
      const uy = nz * tx - nx * tz;
      const uz = nx * ty - ny * tx;
      d[o + T1] = tx;
      d[o + T1 + 1] = ty;
      d[o + T1 + 2] = tz;
      d[o + T2] = ux;
      d[o + T2 + 1] = uy;
      d[o + T2 + 2] = uz;
      d[o + MASS_N] = pairMass(a, b, moveA, moveB, px, py, pz, nx, ny, nz);
      d[o + MASS_T1] = pairMass(a, b, moveA, moveB, px, py, pz, tx, ty, tz);
      d[o + MASS_T2] = pairMass(a, b, moveA, moveB, px, py, pz, ux, uy, uz);
      relativeVelocity(a, b, px, py, pz);
      const vn = rvx * nx + rvy * ny + rvz * nz;
      d[o + CLOSING] = -vn;
      const depth = d[o + DEPTH];
      if (depth > TOUCH_DEPTH && vn < -BOUNCE_SPEED) d[o + BIAS] = -d[o + RESTITUTION] * vn;
      else d[o + BIAS] = depth < 0 ? depth * inverseDt : 0;
      d[o + LAMBDA_N] = 0;
      d[o + LAMBDA_T1] = 0;
      d[o + LAMBDA_T2] = 0;
      d[o + LAMBDA_P] = 0;
    }

    for (let iteration = 0; iteration < this.velocityIterations; iteration += 1) {
      for (let i = 0; i < count; i += 1) {
        const flags = this.flags[i];
        if (flags === 0) continue;
        const o = i * STRIDE;
        const a = this.bodyA[i];
        const b = this.bodyB[i];
        const moveA = (flags & 1) !== 0;
        const moveB = (flags & 2) !== 0;
        const px = d[o + P];
        const py = d[o + P + 1];
        const pz = d[o + P + 2];
        const nx = d[o + N];
        const ny = d[o + N + 1];
        const nz = d[o + N + 2];
        relativeVelocity(a, b, px, py, pz);
        let change = (d[o + BIAS] - (rvx * nx + rvy * ny + rvz * nz)) * d[o + MASS_N];
        let total = d[o + LAMBDA_N] + change;
        if (total < 0) total = 0;
        change = total - d[o + LAMBDA_N];
        d[o + LAMBDA_N] = total;
        if (change !== 0) {
          if (moveA) a.applyImpulse(-change * nx, -change * ny, -change * nz, px, py, pz);
          if (moveB) b.applyImpulse(change * nx, change * ny, change * nz, px, py, pz);
        }
        const limit = d[o + FRICTION] * total;
        for (let axis = 0; axis < 2; axis += 1) {
          const t = o + (axis === 0 ? T1 : T2);
          const lambdaAt = o + (axis === 0 ? LAMBDA_T1 : LAMBDA_T2);
          const tx = d[t];
          const ty = d[t + 1];
          const tz = d[t + 2];
          relativeVelocity(a, b, px, py, pz);
          let slide = -(rvx * tx + rvy * ty + rvz * tz) * d[o + (axis === 0 ? MASS_T1 : MASS_T2)];
          let held = d[lambdaAt] + slide;
          if (held > limit) held = limit;
          else if (held < -limit) held = -limit;
          slide = held - d[lambdaAt];
          d[lambdaAt] = held;
          if (slide !== 0) {
            if (moveA) a.applyImpulse(-slide * tx, -slide * ty, -slide * tz, px, py, pz);
            if (moveB) b.applyImpulse(slide * tx, slide * ty, slide * tz, px, py, pz);
          }
        }
      }
    }

    for (let iteration = 0; iteration < this.positionIterations; iteration += 1) {
      for (let i = 0; i < count; i += 1) {
        const flags = this.flags[i];
        const o = i * STRIDE;
        const depth = d[o + DEPTH];
        if (flags === 0 || depth <= SLOP) continue;
        const a = this.bodyA[i];
        const b = this.bodyB[i];
        const px = d[o + P];
        const py = d[o + P + 1];
        const pz = d[o + P + 2];
        const nx = d[o + N];
        const ny = d[o + N + 1];
        const nz = d[o + N + 2];
        let target = (depth - SLOP) * CORRECTION * inverseDt;
        if (target > MAX_CORRECTION_SPEED) target = MAX_CORRECTION_SPEED;
        let speed = 0;
        if ((flags & 1) !== 0) speed -= pushSpeed(a, px, py, pz, nx, ny, nz);
        if ((flags & 2) !== 0) speed += pushSpeed(b, px, py, pz, nx, ny, nz);
        let change = (target - speed) * d[o + MASS_N];
        let total = d[o + LAMBDA_P] + change;
        if (total < 0) total = 0;
        change = total - d[o + LAMBDA_P];
        d[o + LAMBDA_P] = total;
        if (change === 0) continue;
        if ((flags & 1) !== 0) applyPush(a, -change * nx, -change * ny, -change * nz, px, py, pz);
        if ((flags & 2) !== 0) applyPush(b, change * nx, change * ny, change * nz, px, py, pz);
      }
    }
  }
}

let rvx = 0;
let rvy = 0;
let rvz = 0;

/** Velocity of B's material minus A's at a point, into rvx, rvy, rvz. */
function relativeVelocity(a, b, px, py, pz) {
  let v = a.linearVelocity;
  let w = a.angularVelocity;
  let rx = px - a.position.x;
  let ry = py - a.position.y;
  let rz = pz - a.position.z;
  rvx = -(v.x + w.y * rz - w.z * ry);
  rvy = -(v.y + w.z * rx - w.x * rz);
  rvz = -(v.z + w.x * ry - w.y * rx);
  if (b === null) return;
  v = b.linearVelocity;
  w = b.angularVelocity;
  rx = px - b.position.x;
  ry = py - b.position.y;
  rz = pz - b.position.z;
  rvx += v.x + w.y * rz - w.z * ry;
  rvy += v.y + w.z * rx - w.x * rz;
  rvz += v.z + w.x * ry - w.y * rx;
}

/** The mass a pair shows to an impulse along a direction at a point (0 when neither can move). */
function pairMass(a, b, moveA, moveB, px, py, pz, dx, dy, dz) {
  let k = 0;
  if (moveA) k += 1 / a.effectiveMassAt(px, py, pz, dx, dy, dz);
  if (moveB) k += 1 / b.effectiveMassAt(px, py, pz, dx, dy, dz);
  return k > 0 ? 1 / k : 0;
}

/** The correction speed of a body's material at a point, along a direction. */
function pushSpeed(body, px, py, pz, nx, ny, nz) {
  const rx = px - body.position.x;
  const ry = py - body.position.y;
  const rz = pz - body.position.z;
  return (body.pushX + body.turnY * rz - body.turnZ * ry) * nx
    + (body.pushY + body.turnZ * rx - body.turnX * rz) * ny
    + (body.pushZ + body.turnX * ry - body.turnY * rx) * nz;
}

/** Applies a correction impulse to a body: it moves the pose this step and leaves the velocity alone. */
function applyPush(body, jx, jy, jz, px, py, pz) {
  const m = body.inverseMass;
  body.pushX += jx * m;
  body.pushY += jy * m;
  body.pushZ += jz * m;
  const rx = px - body.position.x;
  const ry = py - body.position.y;
  const rz = pz - body.position.z;
  const tx = ry * jz - rz * jy;
  const ty = rz * jx - rx * jz;
  const tz = rx * jy - ry * jx;
  const k = body.inverseInertiaWorld;
  body.turnX += k[0] * tx + k[1] * ty + k[2] * tz;
  body.turnY += k[3] * tx + k[4] * ty + k[5] * tz;
  body.turnZ += k[6] * tx + k[7] * ty + k[8] * tz;
}

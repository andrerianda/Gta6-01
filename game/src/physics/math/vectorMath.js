// Scalar vector, quaternion and 3x3 matrix arithmetic for the physics library. Vectors are any
// object with x, y, z (a THREE.Vector3 fits), quaternions any object with x, y, z, w, and
// matrices are Float64Array(9) in row order, so world = M * local reads
// wx = m[0] * lx + m[1] * ly + m[2] * lz. Nothing here allocates: results go into `out`.

/**
 * Rotates the vector (x, y, z) by a unit quaternion.
 * @param {{x: number, y: number, z: number, w: number}} q The rotation.
 * @param {number} x Vector X.
 * @param {number} y Vector Y.
 * @param {number} z Vector Z.
 * @param {{x: number, y: number, z: number}} out Receives the rotated vector.
 * @returns {{x: number, y: number, z: number}} `out`.
 */
export function rotateVectorByQuaternion(q, x, y, z, out) {
  const qx = q.x;
  const qy = q.y;
  const qz = q.z;
  const qw = q.w;
  const tx = 2 * (qy * z - qz * y);
  const ty = 2 * (qz * x - qx * z);
  const tz = 2 * (qx * y - qy * x);
  out.x = x + qw * tx + (qy * tz - qz * ty);
  out.y = y + qw * ty + (qz * tx - qx * tz);
  out.z = z + qw * tz + (qx * ty - qy * tx);
  return out;
}

/**
 * Rotates the vector (x, y, z) by the inverse of a unit quaternion (world to local).
 * @param {{x: number, y: number, z: number, w: number}} q The rotation to undo.
 * @param {number} x Vector X.
 * @param {number} y Vector Y.
 * @param {number} z Vector Z.
 * @param {{x: number, y: number, z: number}} out Receives the rotated vector.
 * @returns {{x: number, y: number, z: number}} `out`.
 */
export function rotateVectorByInverseQuaternion(q, x, y, z, out) {
  const qx = -q.x;
  const qy = -q.y;
  const qz = -q.z;
  const qw = q.w;
  const tx = 2 * (qy * z - qz * y);
  const ty = 2 * (qz * x - qx * z);
  const tz = 2 * (qx * y - qy * x);
  out.x = x + qw * tx + (qy * tz - qz * ty);
  out.y = y + qw * ty + (qz * tx - qx * tz);
  out.z = z + qw * tz + (qx * ty - qy * tx);
  return out;
}

/**
 * Creates a vector object.
 * @param {number} [x] X.
 * @param {number} [y] Y.
 * @param {number} [z] Z.
 * @returns {{x: number, y: number, z: number}}
 */
export function createVector(x = 0, y = 0, z = 0) {
  return { x, y, z };
}

/**
 * Creates a quaternion object (the identity by default).
 * @param {number} [x] X.
 * @param {number} [y] Y.
 * @param {number} [z] Z.
 * @param {number} [w] W.
 * @returns {{x: number, y: number, z: number, w: number}}
 */
export function createQuaternion(x = 0, y = 0, z = 0, w = 1) {
  return { x, y, z, w };
}

/**
 * Multiplies two quaternions: the result rotates by b first, then by a.
 * @param {{x: number, y: number, z: number, w: number}} a The outer rotation.
 * @param {{x: number, y: number, z: number, w: number}} b The inner rotation.
 * @param {{x: number, y: number, z: number, w: number}} out Receives a * b (may be a or b).
 * @returns {{x: number, y: number, z: number, w: number}} `out`.
 */
export function multiplyQuaternions(a, b, out) {
  const ax = a.x;
  const ay = a.y;
  const az = a.z;
  const aw = a.w;
  const bx = b.x;
  const by = b.y;
  const bz = b.z;
  const bw = b.w;
  out.x = aw * bx + ax * bw + ay * bz - az * by;
  out.y = aw * by - ax * bz + ay * bw + az * bx;
  out.z = aw * bz + ax * by - ay * bx + az * bw;
  out.w = aw * bw - ax * bx - ay * by - az * bz;
  return out;
}

/**
 * Sets a quaternion from a unit axis and an angle.
 * @param {number} ax Axis X.
 * @param {number} ay Axis Y.
 * @param {number} az Axis Z.
 * @param {number} angle Radians, right-handed about the axis.
 * @param {{x: number, y: number, z: number, w: number}} out Receives the quaternion.
 * @returns {{x: number, y: number, z: number, w: number}} `out`.
 */
export function quaternionFromAxisAngle(ax, ay, az, angle, out) {
  const s = Math.sin(angle * 0.5);
  out.x = ax * s;
  out.y = ay * s;
  out.z = az * s;
  out.w = Math.cos(angle * 0.5);
  return out;
}

/**
 * Sets a quaternion that faces a compass heading: 0 looks along -Z (north), a quarter turn looks
 * along +X (east). Pitch and roll are zero.
 * @param {number} heading Radians, clockwise seen from above.
 * @param {{x: number, y: number, z: number, w: number}} out Receives the quaternion.
 * @returns {{x: number, y: number, z: number, w: number}} `out`.
 */
export function quaternionFromHeading(heading, out) {
  out.x = 0;
  out.y = -Math.sin(heading * 0.5);
  out.z = 0;
  out.w = Math.cos(heading * 0.5);
  return out;
}

/**
 * The compass heading a rotation faces: the direction of its local -Z, flattened onto the ground.
 * @param {{x: number, y: number, z: number, w: number}} q The rotation.
 * @returns {number} Radians, 0 north (-Z), clockwise.
 */
export function headingOfQuaternion(q) {
  const forwardX = -2 * (q.x * q.z + q.w * q.y);
  const forwardZ = -(1 - 2 * (q.x * q.x + q.y * q.y));
  return Math.atan2(forwardX, -forwardZ);
}

/**
 * Advances a rotation by an angular velocity given in world axes, and renormalises it.
 * @param {{x: number, y: number, z: number, w: number}} q The rotation, changed in place.
 * @param {number} wx Angular velocity X, radians per second.
 * @param {number} wy Angular velocity Y.
 * @param {number} wz Angular velocity Z.
 * @param {number} dt Seconds.
 * @returns {{x: number, y: number, z: number, w: number}} `q`.
 */
export function integrateQuaternion(q, wx, wy, wz, dt) {
  const hx = wx * dt * 0.5;
  const hy = wy * dt * 0.5;
  const hz = wz * dt * 0.5;
  const qx = q.x;
  const qy = q.y;
  const qz = q.z;
  const qw = q.w;
  const nx = qx + hx * qw + hy * qz - hz * qy;
  const ny = qy + hy * qw + hz * qx - hx * qz;
  const nz = qz + hz * qw + hx * qy - hy * qx;
  const nw = qw - hx * qx - hy * qy - hz * qz;
  const inverseLength = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz + nw * nw);
  q.x = nx * inverseLength;
  q.y = ny * inverseLength;
  q.z = nz * inverseLength;
  q.w = nw * inverseLength;
  return q;
}

/**
 * Writes the rotation matrix of a unit quaternion. Its columns are the local axes in world space:
 * local X is (m[0], m[3], m[6]), local Y is (m[1], m[4], m[7]), local Z is (m[2], m[5], m[8]).
 * @param {{x: number, y: number, z: number, w: number}} q The rotation.
 * @param {Float64Array} m Receives the nine elements in row order.
 * @returns {Float64Array} `m`.
 */
export function matrixFromQuaternion(q, m) {
  const x = q.x;
  const y = q.y;
  const z = q.z;
  const w = q.w;
  m[0] = 1 - 2 * (y * y + z * z);
  m[1] = 2 * (x * y - w * z);
  m[2] = 2 * (x * z + w * y);
  m[3] = 2 * (x * y + w * z);
  m[4] = 1 - 2 * (x * x + z * z);
  m[5] = 2 * (y * z - w * x);
  m[6] = 2 * (x * z - w * y);
  m[7] = 2 * (y * z + w * x);
  m[8] = 1 - 2 * (x * x + y * y);
  return m;
}

/**
 * Sets a quaternion from a rotation matrix (row order, orthonormal).
 * @param {ArrayLike<number>} m The nine elements.
 * @param {{x: number, y: number, z: number, w: number}} out Receives the quaternion.
 * @returns {{x: number, y: number, z: number, w: number}} `out`.
 */
export function quaternionFromMatrix(m, out) {
  const trace = m[0] + m[4] + m[8];
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    out.w = 0.25 / s;
    out.x = (m[7] - m[5]) * s;
    out.y = (m[2] - m[6]) * s;
    out.z = (m[3] - m[1]) * s;
  } else if (m[0] > m[4] && m[0] > m[8]) {
    const s = 2 * Math.sqrt(1 + m[0] - m[4] - m[8]);
    out.w = (m[7] - m[5]) / s;
    out.x = 0.25 * s;
    out.y = (m[1] + m[3]) / s;
    out.z = (m[2] + m[6]) / s;
  } else if (m[4] > m[8]) {
    const s = 2 * Math.sqrt(1 + m[4] - m[0] - m[8]);
    out.w = (m[2] - m[6]) / s;
    out.x = (m[1] + m[3]) / s;
    out.y = 0.25 * s;
    out.z = (m[5] + m[7]) / s;
  } else {
    const s = 2 * Math.sqrt(1 + m[8] - m[0] - m[4]);
    out.w = (m[3] - m[1]) / s;
    out.x = (m[2] + m[6]) / s;
    out.y = (m[5] + m[7]) / s;
    out.z = 0.25 * s;
  }
  return out;
}

/**
 * Builds the world inverse inertia tensor R * diag(inverse) * R^T of a body.
 * @param {Float64Array} r The body's rotation matrix.
 * @param {number} ix Inverse inertia about local X.
 * @param {number} iy Inverse inertia about local Y.
 * @param {number} iz Inverse inertia about local Z.
 * @param {Float64Array} out Receives the nine elements (symmetric).
 * @returns {Float64Array} `out`.
 */
export function worldInverseInertia(r, ix, iy, iz, out) {
  const a0 = r[0] * ix;
  const a1 = r[1] * iy;
  const a2 = r[2] * iz;
  const a3 = r[3] * ix;
  const a4 = r[4] * iy;
  const a5 = r[5] * iz;
  const a6 = r[6] * ix;
  const a7 = r[7] * iy;
  const a8 = r[8] * iz;
  out[0] = a0 * r[0] + a1 * r[1] + a2 * r[2];
  out[1] = a0 * r[3] + a1 * r[4] + a2 * r[5];
  out[2] = a0 * r[6] + a1 * r[7] + a2 * r[8];
  out[3] = out[1];
  out[4] = a3 * r[3] + a4 * r[4] + a5 * r[5];
  out[5] = a3 * r[6] + a4 * r[7] + a5 * r[8];
  out[6] = out[2];
  out[7] = out[5];
  out[8] = a6 * r[6] + a7 * r[7] + a8 * r[8];
  return out;
}

/**
 * The closest point of a segment to a point, as the parameter along the segment.
 * @returns {number} 0 at (ax, ay, az), 1 at (bx, by, bz).
 */
export function closestSegmentParameter(px, py, pz, ax, ay, az, bx, by, bz) {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const lengthSquared = dx * dx + dy * dy + dz * dz;
  if (lengthSquared < 1e-18) return 0;
  const t = ((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / lengthSquared;
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/**
 * The closest points of two segments, as the parameters along each.
 * @param {{s: number, t: number}} out Receives the parameter on segment A-B (s) and on C-D (t).
 * @returns {{s: number, t: number}} `out`.
 */
export function closestSegmentParameters(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, out) {
  const d1x = bx - ax;
  const d1y = by - ay;
  const d1z = bz - az;
  const d2x = dx - cx;
  const d2y = dy - cy;
  const d2z = dz - cz;
  const rx = ax - cx;
  const ry = ay - cy;
  const rz = az - cz;
  const a = d1x * d1x + d1y * d1y + d1z * d1z;
  const e = d2x * d2x + d2y * d2y + d2z * d2z;
  const f = d2x * rx + d2y * ry + d2z * rz;
  let s = 0;
  let t = 0;
  if (a < 1e-18 && e < 1e-18) {
    out.s = 0;
    out.t = 0;
    return out;
  }
  if (a < 1e-18) {
    t = clamp01(f / e);
  } else {
    const c = d1x * rx + d1y * ry + d1z * rz;
    if (e < 1e-18) {
      s = clamp01(-c / a);
    } else {
      const b = d1x * d2x + d1y * d2y + d1z * d2z;
      const denominator = a * e - b * b;
      s = denominator > 1e-12 * a * e ? clamp01((b * f - c * e) / denominator) : 0.5;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp01(-c / a);
      } else if (t > 1) {
        t = 1;
        s = clamp01((b - c) / a);
      }
    }
  }
  out.s = s;
  out.t = t;
  return out;
}

/**
 * Clamps a number to the range 0 to 1.
 * @param {number} value The number.
 * @returns {number}
 */
export function clamp01(value) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * Clamps a number to a range.
 * @param {number} value The number.
 * @param {number} low The lower bound.
 * @param {number} high The upper bound.
 * @returns {number}
 */
export function clamp(value, low, high) {
  return value < low ? low : value > high ? high : value;
}

/**
 * Wraps an angle into the range -pi to pi.
 * @param {number} angle Radians.
 * @returns {number}
 */
export function wrapAngle(angle) {
  let wrapped = angle % (Math.PI * 2);
  if (wrapped > Math.PI) wrapped -= Math.PI * 2;
  else if (wrapped < -Math.PI) wrapped += Math.PI * 2;
  return wrapped;
}

/**
 * Hermite smooth step between two edges.
 * @param {number} edge0 Where the result is 0.
 * @param {number} edge1 Where the result is 1.
 * @param {number} value The input.
 * @returns {number} 0 to 1.
 */
export function smoothStep(edge0, edge1, value) {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

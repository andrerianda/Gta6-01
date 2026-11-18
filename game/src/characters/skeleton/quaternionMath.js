// Quaternion and vector arithmetic on flat number arrays, for the character run-time. Poses of
// sixty people are computed every frame, so nothing here allocates: every function reads and
// writes Float32Array (or plain array) slots at an offset. A quaternion is (x, y, z, w) and
// rotates a vector v as q v q*; character space is +X right, +Y up, -Z forward.

/**
 * Writes the product a * b (apply b first, then a). `out` may alias `a` or `b`.
 * @param {Float32Array | number[]} out Target array.
 * @param {number} o Offset of the result in `out`.
 * @param {ArrayLike<number>} a Left quaternion's array.
 * @param {number} ao Its offset.
 * @param {ArrayLike<number>} b Right quaternion's array.
 * @param {number} bo Its offset.
 */
export function quatMultiply(out, o, a, ao, b, bo) {
  const ax = a[ao], ay = a[ao + 1], az = a[ao + 2], aw = a[ao + 3];
  const bx = b[bo], by = b[bo + 1], bz = b[bo + 2], bw = b[bo + 3];
  out[o] = aw * bx + ax * bw + ay * bz - az * by;
  out[o + 1] = aw * by - ax * bz + ay * bw + az * bx;
  out[o + 2] = aw * bz + ax * by - ay * bx + az * bw;
  out[o + 3] = aw * bw - ax * bx - ay * by - az * bz;
}

/**
 * Writes conj(a) * b: b seen from the frame of a.
 * @param {Float32Array | number[]} out
 * @param {number} o
 * @param {ArrayLike<number>} a
 * @param {number} ao
 * @param {ArrayLike<number>} b
 * @param {number} bo
 */
export function quatMultiplyConjLeft(out, o, a, ao, b, bo) {
  const ax = -a[ao], ay = -a[ao + 1], az = -a[ao + 2], aw = a[ao + 3];
  const bx = b[bo], by = b[bo + 1], bz = b[bo + 2], bw = b[bo + 3];
  out[o] = aw * bx + ax * bw + ay * bz - az * by;
  out[o + 1] = aw * by - ax * bz + ay * bw + az * bx;
  out[o + 2] = aw * bz + ax * by - ay * bx + az * bw;
  out[o + 3] = aw * bw - ax * bx - ay * by - az * bz;
}

/**
 * Writes a * conj(b).
 * @param {Float32Array | number[]} out
 * @param {number} o
 * @param {ArrayLike<number>} a
 * @param {number} ao
 * @param {ArrayLike<number>} b
 * @param {number} bo
 */
export function quatMultiplyConjRight(out, o, a, ao, b, bo) {
  const ax = a[ao], ay = a[ao + 1], az = a[ao + 2], aw = a[ao + 3];
  const bx = -b[bo], by = -b[bo + 1], bz = -b[bo + 2], bw = b[bo + 3];
  out[o] = aw * bx + ax * bw + ay * bz - az * by;
  out[o + 1] = aw * by - ax * bz + ay * bw + az * bx;
  out[o + 2] = aw * bz + ax * by - ay * bx + az * bw;
  out[o + 3] = aw * bw - ax * bx - ay * by - az * bz;
}

/** Writes the identity rotation. */
export function quatIdentity(out, o) {
  out[o] = 0;
  out[o + 1] = 0;
  out[o + 2] = 0;
  out[o + 3] = 1;
}

/** Copies a quaternion. */
export function quatCopy(out, o, a, ao) {
  out[o] = a[ao];
  out[o + 1] = a[ao + 1];
  out[o + 2] = a[ao + 2];
  out[o + 3] = a[ao + 3];
}

/**
 * Writes the rotation by `angle` radians about a unit axis.
 * @param {Float32Array | number[]} out
 * @param {number} o
 * @param {number} ax Unit axis.
 * @param {number} ay
 * @param {number} az
 * @param {number} angle Radians, right-handed.
 */
export function quatFromAxisAngle(out, o, ax, ay, az, angle) {
  const half = angle * 0.5;
  const s = Math.sin(half);
  out[o] = ax * s;
  out[o + 1] = ay * s;
  out[o + 2] = az * s;
  out[o + 3] = Math.cos(half);
}

/**
 * Writes Ry(yaw) * Rx(pitch) * Rz(roll): roll first, then pitch, then yaw. In character space a
 * positive yaw turns to the left, a positive pitch tips an upright bone backwards (and lifts the
 * toes of a foot), a positive roll tips an upright bone to the left.
 * @param {Float32Array | number[]} out
 * @param {number} o
 * @param {number} yaw Radians about +Y.
 * @param {number} pitch Radians about +X.
 * @param {number} roll Radians about +Z.
 */
export function quatFromYawPitchRoll(out, o, yaw, pitch, roll) {
  const cy = Math.cos(yaw * 0.5), sy = Math.sin(yaw * 0.5);
  const cx = Math.cos(pitch * 0.5), sx = Math.sin(pitch * 0.5);
  const cz = Math.cos(roll * 0.5), sz = Math.sin(roll * 0.5);
  out[o] = cy * sx * cz + sy * cx * sz;
  out[o + 1] = sy * cx * cz - cy * sx * sz;
  out[o + 2] = cy * cx * sz - sy * sx * cz;
  out[o + 3] = cy * cx * cz + sy * sx * sz;
}

/**
 * Writes the rotation whose matrix has the given orthonormal columns (the images of X, Y, Z).
 * @param {Float32Array | number[]} out
 * @param {number} o
 */
export function quatFromBasis(out, o, xx, xy, xz, yx, yy, yz, zx, zy, zz) {
  const trace = xx + yy + zz;
  let x, y, z, w;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    w = 0.25 / s;
    x = (yz - zy) * s;
    y = (zx - xz) * s;
    z = (xy - yx) * s;
  } else if (xx > yy && xx > zz) {
    const s = 2 * Math.sqrt(1 + xx - yy - zz);
    w = (yz - zy) / s;
    x = 0.25 * s;
    y = (yx + xy) / s;
    z = (zx + xz) / s;
  } else if (yy > zz) {
    const s = 2 * Math.sqrt(1 + yy - xx - zz);
    w = (zx - xz) / s;
    x = (yx + xy) / s;
    y = 0.25 * s;
    z = (zy + yz) / s;
  } else {
    const s = 2 * Math.sqrt(1 + zz - xx - yy);
    w = (xy - yx) / s;
    x = (zx + xz) / s;
    y = (zy + yz) / s;
    z = 0.25 * s;
  }
  out[o] = x;
  out[o + 1] = y;
  out[o + 2] = z;
  out[o + 3] = w;
}

/**
 * Writes the shortest rotation that turns unit vector f into unit vector t.
 * @param {Float32Array | number[]} out
 * @param {number} o
 */
export function quatFromDirections(out, o, fx, fy, fz, tx, ty, tz) {
  const d = fx * tx + fy * ty + fz * tz;
  if (d < -0.999999) {
    // Opposite: turn half a circle about any axis perpendicular to f.
    let px = 0, py = -fz, pz = fy;
    if (Math.abs(fx) < 0.6) {
      px = 0; py = -fz; pz = fy;
    } else {
      px = -fy; py = fx; pz = 0;
    }
    const n = 1 / Math.hypot(px, py, pz);
    out[o] = px * n;
    out[o + 1] = py * n;
    out[o + 2] = pz * n;
    out[o + 3] = 0;
    return;
  }
  const x = fy * tz - fz * ty, y = fz * tx - fx * tz, z = fx * ty - fy * tx, w = 1 + d;
  const n = 1 / Math.sqrt(x * x + y * y + z * z + w * w);
  out[o] = x * n;
  out[o + 1] = y * n;
  out[o + 2] = z * n;
  out[o + 3] = w * n;
}

/**
 * Rotates the vector (x, y, z) by a quaternion and writes it at out[o..o+2].
 * @param {Float32Array | number[]} out
 * @param {number} o
 * @param {ArrayLike<number>} q
 * @param {number} qo
 */
export function quatRotate(out, o, q, qo, x, y, z) {
  const qx = q[qo], qy = q[qo + 1], qz = q[qo + 2], qw = q[qo + 3];
  const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
  out[o] = x + qw * tx + qy * tz - qz * ty;
  out[o + 1] = y + qw * ty + qz * tx - qx * tz;
  out[o + 2] = z + qw * tz + qx * ty - qy * tx;
}

/**
 * Rotates the vector (x, y, z) by the inverse of a unit quaternion.
 * @param {Float32Array | number[]} out
 * @param {number} o
 * @param {ArrayLike<number>} q
 * @param {number} qo
 */
export function quatRotateInverse(out, o, q, qo, x, y, z) {
  const qx = -q[qo], qy = -q[qo + 1], qz = -q[qo + 2], qw = q[qo + 3];
  const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
  out[o] = x + qw * tx + qy * tz - qz * ty;
  out[o + 1] = y + qw * ty + qz * tx - qx * tz;
  out[o + 2] = z + qw * tz + qx * ty - qy * tx;
}

/**
 * Normalised linear interpolation along the shorter way: cheap, and right for the small steps
 * between animation poses. `out` may alias `a` or `b`.
 * @param {Float32Array | number[]} out
 * @param {number} o
 * @param {ArrayLike<number>} a
 * @param {number} ao
 * @param {ArrayLike<number>} b
 * @param {number} bo
 * @param {number} t 0 gives a, 1 gives b.
 */
export function quatNlerp(out, o, a, ao, b, bo, t) {
  const ax = a[ao], ay = a[ao + 1], az = a[ao + 2], aw = a[ao + 3];
  let bx = b[bo], by = b[bo + 1], bz = b[bo + 2], bw = b[bo + 3];
  if (ax * bx + ay * by + az * bz + aw * bw < 0) {
    bx = -bx; by = -by; bz = -bz; bw = -bw;
  }
  const x = ax + (bx - ax) * t, y = ay + (by - ay) * t, z = az + (bz - az) * t, w = aw + (bw - aw) * t;
  const n = 1 / Math.sqrt(x * x + y * y + z * z + w * w);
  out[o] = x * n;
  out[o + 1] = y * n;
  out[o + 2] = z * n;
  out[o + 3] = w * n;
}

/** Normalises a quaternion in place (identity when it is degenerate). */
export function quatNormalize(out, o) {
  const x = out[o], y = out[o + 1], z = out[o + 2], w = out[o + 3];
  const lengthSquared = x * x + y * y + z * z + w * w;
  if (lengthSquared < 1e-12) {
    quatIdentity(out, o);
    return;
  }
  const n = 1 / Math.sqrt(lengthSquared);
  out[o] = x * n;
  out[o + 1] = y * n;
  out[o + 2] = z * n;
  out[o + 3] = w * n;
}

/**
 * Writes the rotation vector (axis times angle, radians) of a unit quaternion, along the
 * shorter way: the form in which a pose difference can be decayed smoothly.
 * @param {Float32Array | number[]} out Receives three numbers.
 * @param {number} o
 * @param {ArrayLike<number>} q
 * @param {number} qo
 */
export function quatToRotationVector(out, o, q, qo) {
  let x = q[qo], y = q[qo + 1], z = q[qo + 2], w = q[qo + 3];
  if (w < 0) {
    x = -x; y = -y; z = -z; w = -w;
  }
  const s = Math.sqrt(x * x + y * y + z * z);
  const k = s < 1e-6 ? 2 : (2 * Math.atan2(s, w)) / s;
  out[o] = x * k;
  out[o + 1] = y * k;
  out[o + 2] = z * k;
}

/**
 * Writes the unit quaternion of a rotation vector (axis times angle).
 * @param {Float32Array | number[]} out
 * @param {number} o
 */
export function quatFromRotationVector(out, o, x, y, z) {
  const angle = Math.sqrt(x * x + y * y + z * z);
  if (angle < 1e-6) {
    out[o] = x * 0.5;
    out[o + 1] = y * 0.5;
    out[o + 2] = z * 0.5;
    out[o + 3] = 1;
    return;
  }
  const s = Math.sin(angle * 0.5) / angle;
  out[o] = x * s;
  out[o + 1] = y * s;
  out[o + 2] = z * s;
  out[o + 3] = Math.cos(angle * 0.5);
}

/**
 * Smooth minimum of two numbers: follows the smaller one and rounds the corner where they cross.
 * @param {number} a
 * @param {number} b
 * @param {number} k Corner size, in the unit of a and b.
 * @returns {number}
 */
export function smoothMin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

/**
 * Smoothstep: 0 below edge0, 1 above edge1, an S curve between.
 * @param {number} edge0
 * @param {number} edge1
 * @param {number} x
 * @returns {number}
 */
export function smoothStep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

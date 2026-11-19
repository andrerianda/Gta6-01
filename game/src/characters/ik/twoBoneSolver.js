// Two-bone inverse kinematics, the geometry only: given where the end of an arm or a leg should
// be (relative to its first joint), which way the middle joint should point (the pole) and the
// two bone lengths, find the directions of both bones and the hinge axis of the middle joint.
// The reach has soft limits: a target just beyond the limb's length eases the limb straight
// instead of snapping it, and a target too close keeps the joint from folding flat.

/** Offsets into the solver's result. */
export const SOLVED = Object.freeze({ UPPER: 0, LOWER: 3, HINGE: 6, MIDDLE: 9, END: 12, STRETCH: 15 });

/**
 * Creates the storage for one solve: upper direction, lower direction, hinge axis, middle joint
 * position, end position (all relative to the first joint) and how much of the asked distance
 * was reached (1 when the target was within reach).
 * @returns {Float32Array}
 */
export function createTwoBoneResult() {
  return new Float32Array(16);
}

/**
 * Solves a two-bone chain.
 * @param {Float32Array} out A result from createTwoBoneResult().
 * @param {number} tx Target relative to the first joint.
 * @param {number} ty
 * @param {number} tz
 * @param {number} px Pole: roughly where the middle joint should point (need not be unit length).
 * @param {number} py
 * @param {number} pz
 * @param {number} upperLength Length of the first bone.
 * @param {number} lowerLength Length of the second bone.
 * @param {number} [softness] Fraction of the full length over which the reach eases out (0.07).
 * @param {number} [minFold] Smallest distance to the target as a fraction of the full length (0.24).
 * @returns {Float32Array} `out`.
 */
export function solveTwoBone(out, tx, ty, tz, px, py, pz, upperLength, lowerLength, softness = 0.07, minFold = 0.24) {
  const full = upperLength + lowerLength;
  let distance = Math.hypot(tx, ty, tz);
  let dx, dy, dz;
  if (distance < 1e-6) {
    // No direction to speak of: fold towards the pole's opposite.
    const n = 1 / Math.max(1e-6, Math.hypot(px, py, pz));
    dx = -px * n; dy = -py * n; dz = -pz * n;
    if (!(dx * dx + dy * dy + dz * dz > 0.5)) {
      dx = 0; dy = -1; dz = 0;
    }
    distance = 0;
  } else {
    dx = tx / distance; dy = ty / distance; dz = tz / distance;
  }
  const asked = distance;
  // Soft limits: ease into the fully straight limb, never fold beyond the least distance.
  const limit = full * 0.9995, knee = full * (1 - softness);
  if (distance > knee) {
    const span = limit - knee;
    distance = knee + span * (1 - Math.exp(-(distance - knee) / span));
  }
  const least = Math.max(Math.abs(upperLength - lowerLength) + 1e-4, full * minFold);
  if (distance < least) distance = least;

  // The pole, made perpendicular to the line to the target.
  const along = px * dx + py * dy + pz * dz;
  let qx = px - dx * along, qy = py - dy * along, qz = pz - dz * along;
  let qn = Math.hypot(qx, qy, qz);
  if (qn < 1e-5) {
    // A pole along the limb says nothing: pick any perpendicular, preferring up or forward.
    if (Math.abs(dy) < 0.9) {
      qx = -dx * dy; qy = 1 - dy * dy; qz = -dz * dy;
    } else {
      qx = dx * dz; qy = dy * dz; qz = dz * dz - 1;
    }
    qn = Math.hypot(qx, qy, qz);
  }
  qx /= qn; qy /= qn; qz /= qn;

  // The middle joint lies on the circle where the two bone spheres meet.
  const a = (upperLength * upperLength - lowerLength * lowerLength + distance * distance) / (2 * distance);
  const h = Math.sqrt(Math.max(0, upperLength * upperLength - a * a));
  const mx = dx * a + qx * h, my = dy * a + qy * h, mz = dz * a + qz * h;
  const ex = dx * distance, ey = dy * distance, ez = dz * distance;
  const ux = mx / upperLength, uy = my / upperLength, uz = mz / upperLength;
  const lx = (ex - mx) / lowerLength, ly = (ey - my) / lowerLength, lz = (ez - mz) / lowerLength;
  // The hinge: pole x line. It equals upper x lower when the limb is bent and stays defined when straight.
  const hx = qy * dz - qz * dy, hy = qz * dx - qx * dz, hz = qx * dy - qy * dx;

  out[0] = ux; out[1] = uy; out[2] = uz;
  out[3] = lx; out[4] = ly; out[5] = lz;
  out[6] = hx; out[7] = hy; out[8] = hz;
  out[9] = mx; out[10] = my; out[11] = mz;
  out[12] = ex; out[13] = ey; out[14] = ez;
  out[15] = asked > 1e-6 ? distance / asked : 1;
  return out;
}

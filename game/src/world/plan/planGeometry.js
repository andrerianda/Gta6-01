// Plane geometry for the city plan, on flat coordinate arrays. A polyline or a ring is one array
// [x0, z0, x1, z1, ...] in world metres (+X east, +Z south); a ring is closed implicitly and is
// wound counter-clockwise when seen from above (north up on a map), so its inside lies to the
// left of every edge and ringSignedArea() is positive.
//
//   const lot = rectangleRing(x, z, frontX, frontZ, halfWidth, halfDepth);
//   if (pointInRing(lot, px, pz)) ...

/**
 * The area of a ring: positive when it runs counter-clockwise seen from above.
 * @param {ArrayLike<number>} ring Flat [x, z, ...] coordinates.
 * @returns {number} Square metres, signed.
 */
export function ringSignedArea(ring) {
  let sum = 0;
  const count = ring.length;
  for (let i = 0; i < count; i += 2) {
    const j = i + 2 < count ? i + 2 : 0;
    sum += ring[j] * ring[i + 1] - ring[i] * ring[j + 1];
  }
  return sum / 2;
}

/**
 * Reverses a ring in place when it runs clockwise, so that it ends counter-clockwise.
 * @param {number[]} ring
 * @returns {number[]} The same array.
 */
export function ensureCounterClockwise(ring) {
  if (ringSignedArea(ring) < 0) reversePoints(ring);
  return ring;
}

/**
 * Reverses the order of the points of a flat coordinate array in place.
 * @param {number[]} points
 * @returns {number[]}
 */
export function reversePoints(points) {
  for (let i = 0, j = points.length - 2; i < j; i += 2, j -= 2) {
    const x = points[i];
    const z = points[i + 1];
    points[i] = points[j];
    points[i + 1] = points[j + 1];
    points[j] = x;
    points[j + 1] = z;
  }
  return points;
}

/**
 * The centroid of a ring (area weighted; the vertex average for a degenerate ring).
 * @param {ArrayLike<number>} ring
 * @returns {[number, number]}
 */
export function ringCentroid(ring) {
  let area = 0;
  let cx = 0;
  let cz = 0;
  const count = ring.length;
  for (let i = 0; i < count; i += 2) {
    const j = i + 2 < count ? i + 2 : 0;
    const cross = ring[j] * ring[i + 1] - ring[i] * ring[j + 1];
    area += cross;
    cx += (ring[i] + ring[j]) * cross;
    cz += (ring[i + 1] + ring[j + 1]) * cross;
  }
  if (Math.abs(area) < 1e-9) {
    let sx = 0;
    let sz = 0;
    for (let i = 0; i < count; i += 2) {
      sx += ring[i];
      sz += ring[i + 1];
    }
    return [sx / (count / 2), sz / (count / 2)];
  }
  return [cx / (3 * area), cz / (3 * area)];
}

/**
 * The axis-aligned bounds of a flat coordinate array.
 * @param {ArrayLike<number>} points
 * @returns {{minX: number, minZ: number, maxX: number, maxZ: number}}
 */
export function boundsOfPoints(points) {
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < points.length; i += 2) {
    if (points[i] < minX) minX = points[i];
    if (points[i] > maxX) maxX = points[i];
    if (points[i + 1] < minZ) minZ = points[i + 1];
    if (points[i + 1] > maxZ) maxZ = points[i + 1];
  }
  return { minX, minZ, maxX, maxZ };
}

/**
 * Whether a point lies inside a ring (even-odd rule; either winding).
 * @param {ArrayLike<number>} ring
 * @param {number} x
 * @param {number} z
 * @returns {boolean}
 */
export function pointInRing(ring, x, z) {
  let inside = false;
  const count = ring.length;
  for (let i = 0, j = count - 2; i < count; j = i, i += 2) {
    const zi = ring[i + 1];
    const zj = ring[j + 1];
    if (zi > z !== zj > z && x < ((ring[j] - ring[i]) * (z - zi)) / (zj - zi) + ring[i]) inside = !inside;
  }
  return inside;
}

/**
 * The squared distance from a point to a segment.
 * @returns {number}
 */
export function distanceSquaredToSegment(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const lengthSquared = dx * dx + dz * dz;
  let t = lengthSquared > 0 ? ((px - ax) * dx + (pz - az) * dz) / lengthSquared : 0;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const ox = ax + dx * t - px;
  const oz = az + dz * t - pz;
  return ox * ox + oz * oz;
}

/**
 * The distance from a point to the outline of a ring (always positive).
 * @param {ArrayLike<number>} ring
 * @param {number} x
 * @param {number} z
 * @returns {number}
 */
export function distanceToRing(ring, x, z) {
  let best = Infinity;
  const count = ring.length;
  for (let i = 0; i < count; i += 2) {
    const j = i + 2 < count ? i + 2 : 0;
    const d = distanceSquaredToSegment(x, z, ring[i], ring[i + 1], ring[j], ring[j + 1]);
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

/**
 * The total length of a polyline.
 * @param {ArrayLike<number>} points
 * @returns {number}
 */
export function polylineLength(points) {
  let length = 0;
  for (let i = 2; i < points.length; i += 2) {
    length += Math.hypot(points[i] - points[i - 2], points[i + 1] - points[i - 1]);
  }
  return length;
}

/**
 * The distance travelled along a polyline at each of its points.
 * @param {ArrayLike<number>} points
 * @returns {number[]} One value per point; the first is 0.
 */
export function cumulativeLengths(points) {
  const lengths = [0];
  let length = 0;
  for (let i = 2; i < points.length; i += 2) {
    length += Math.hypot(points[i] - points[i - 2], points[i + 1] - points[i - 1]);
    lengths.push(length);
  }
  return lengths;
}

/**
 * The point at a distance along a polyline, with the direction of travel there.
 * @param {ArrayLike<number>} points
 * @param {number} distance Metres from the first point (clamped to the polyline).
 * @returns {{x: number, z: number, dx: number, dz: number, index: number}} `index` is the point
 *   that starts the piece the result lies on.
 */
export function pointAlongPolyline(points, distance) {
  const last = points.length - 2;
  let remaining = Math.max(0, distance);
  for (let i = 0; i < last; i += 2) {
    const dx = points[i + 2] - points[i];
    const dz = points[i + 3] - points[i + 1];
    const length = Math.hypot(dx, dz);
    if (remaining <= length || i === last - 2) {
      const t = length > 0 ? Math.min(1, remaining / length) : 0;
      const inverse = length > 0 ? 1 / length : 0;
      return { x: points[i] + dx * t, z: points[i + 1] + dz * t, dx: dx * inverse, dz: dz * inverse, index: i / 2 };
    }
    remaining -= length;
  }
  return { x: points[0], z: points[1], dx: 1, dz: 0, index: 0 };
}

/**
 * The closest point of a polyline to a point.
 * @param {ArrayLike<number>} points
 * @param {number} x
 * @param {number} z
 * @returns {{distance: number, along: number, x: number, z: number, index: number, t: number}}
 *   `along` is the distance travelled from the first point; `index` and `t` name the piece.
 */
export function projectOnPolyline(points, x, z) {
  let best = Infinity;
  let bestIndex = 0;
  let bestT = 0;
  let bestAlong = 0;
  let travelled = 0;
  for (let i = 0; i < points.length - 2; i += 2) {
    const ax = points[i];
    const az = points[i + 1];
    const dx = points[i + 2] - ax;
    const dz = points[i + 3] - az;
    const lengthSquared = dx * dx + dz * dz;
    let t = lengthSquared > 0 ? ((x - ax) * dx + (z - az) * dz) / lengthSquared : 0;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    const ox = ax + dx * t - x;
    const oz = az + dz * t - z;
    const d = ox * ox + oz * oz;
    const length = Math.sqrt(lengthSquared);
    if (d < best) {
      best = d;
      bestIndex = i / 2;
      bestT = t;
      bestAlong = travelled + length * t;
    }
    travelled += length;
  }
  const i = bestIndex * 2;
  return {
    distance: Math.sqrt(best),
    along: bestAlong,
    x: points[i] + (points[i + 2] - points[i]) * bestT,
    z: points[i + 1] + (points[i + 3] - points[i + 1]) * bestT,
    index: bestIndex,
    t: bestT,
  };
}

/**
 * Samples a polyline again so that no piece is longer than `maxStep`, keeping every original
 * corner (straight pieces are divided evenly).
 * @param {ArrayLike<number>} points
 * @param {number} maxStep
 * @returns {number[]}
 */
export function resamplePolyline(points, maxStep) {
  const out = [points[0], points[1]];
  for (let i = 2; i < points.length; i += 2) {
    const ax = points[i - 2];
    const az = points[i - 1];
    const dx = points[i] - ax;
    const dz = points[i + 1] - az;
    const pieces = Math.max(1, Math.ceil(Math.hypot(dx, dz) / maxStep - 1e-6));
    for (let k = 1; k <= pieces; k += 1) out.push(ax + (dx * k) / pieces, az + (dz * k) / pieces);
  }
  return out;
}

/**
 * The part of a polyline between two distances along it.
 * @param {ArrayLike<number>} points
 * @param {number} from Metres from the start.
 * @param {number} to Metres from the start, greater than `from`.
 * @returns {number[]}
 */
export function slicePolyline(points, from, to) {
  const out = [];
  let travelled = 0;
  const first = pointAlongPolyline(points, from);
  out.push(first.x, first.z);
  for (let i = 2; i < points.length; i += 2) {
    travelled += Math.hypot(points[i] - points[i - 2], points[i + 1] - points[i - 1]);
    if (travelled > from + 1e-6 && travelled < to - 1e-6) out.push(points[i], points[i + 1]);
  }
  const last = pointAlongPolyline(points, to);
  out.push(last.x, last.z);
  return out;
}

/**
 * Moves a polyline sideways. Positive distances go to the right of the direction of travel
 * (seen from above), negative ones to the left; corners are mitred with a limit.
 * @param {ArrayLike<number>} points
 * @param {number} distance
 * @returns {number[]}
 */
export function offsetPolyline(points, distance) {
  const count = points.length / 2;
  const out = new Array(points.length);
  for (let i = 0; i < count; i += 1) {
    const prev = i > 0 ? i - 1 : 0;
    const next = i < count - 1 ? i + 1 : count - 1;
    let ax = points[i * 2] - points[prev * 2];
    let az = points[i * 2 + 1] - points[prev * 2 + 1];
    let bx = points[next * 2] - points[i * 2];
    let bz = points[next * 2 + 1] - points[i * 2 + 1];
    const al = Math.hypot(ax, az);
    const bl = Math.hypot(bx, bz);
    if (al > 0) {
      ax /= al;
      az /= al;
    } else {
      ax = bx / (bl || 1);
      az = bz / (bl || 1);
    }
    if (bl > 0) {
      bx /= bl;
      bz /= bl;
    } else {
      bx = ax;
      bz = az;
    }
    // The right-hand normal of a direction (dx, dz) is (-dz, dx).
    let nx = -(az + bz);
    let nz = ax + bx;
    const nl = Math.hypot(nx, nz);
    if (nl < 1e-9) {
      nx = -az;
      nz = ax;
    } else {
      nx /= nl;
      nz /= nl;
    }
    const cosHalf = Math.max(0.5, nx * -az + nz * ax);
    out[i * 2] = points[i * 2] + (nx * distance) / cosHalf;
    out[i * 2 + 1] = points[i * 2 + 1] + (nz * distance) / cosHalf;
  }
  return out;
}

/**
 * Where two segments cross.
 * @returns {{t: number, u: number, x: number, z: number} | null} The fractions along AB and CD
 *   and the point, or null when the segments are parallel or do not meet (within `slack`, a
 *   fraction of each segment allowed beyond its ends).
 */
export function segmentIntersection(ax, az, bx, bz, cx, cz, dx, dz, slack = 0) {
  const rx = bx - ax;
  const rz = bz - az;
  const sx = dx - cx;
  const sz = dz - cz;
  const denominator = rx * sz - rz * sx;
  if (Math.abs(denominator) < 1e-9) return null;
  const t = ((cx - ax) * sz - (cz - az) * sx) / denominator;
  const u = ((cx - ax) * rz - (cz - az) * rx) / denominator;
  if (t < -slack || t > 1 + slack || u < -slack || u > 1 + slack) return null;
  return { t, u, x: ax + rx * t, z: az + rz * t };
}

/**
 * Where two infinite lines cross: the line through A along (ux, uz) and the one through C along
 * (vx, vz).
 * @returns {[number, number] | null} The point, or null for parallel lines.
 */
export function lineIntersection(ax, az, ux, uz, cx, cz, vx, vz) {
  const denominator = ux * vz - uz * vx;
  if (Math.abs(denominator) < 1e-9) return null;
  const t = ((cx - ax) * vz - (cz - az) * vx) / denominator;
  return [ax + ux * t, az + uz * t];
}

/**
 * A smooth curve through control points (centripetal Catmull-Rom), sampled about every `step`
 * metres. The curve passes through every control point.
 * @param {ArrayLike<number>} control Flat control points.
 * @param {number} step
 * @param {boolean} [closed] Whether the curve returns to its first point (the result then
 *   repeats the first point at its end).
 * @returns {number[]}
 */
export function smoothCurve(control, step, closed = false) {
  const count = control.length / 2;
  if (count < 3) return resamplePolyline(control, step);
  const out = [];
  const point = (i) => {
    const k = closed ? ((i % count) + count) % count : Math.max(0, Math.min(count - 1, i));
    return k * 2;
  };
  const pieces = closed ? count : count - 1;
  for (let i = 0; i < pieces; i += 1) {
    const p0 = point(i - 1);
    const p1 = point(i);
    const p2 = point(i + 1);
    const p3 = point(i + 2);
    const x1 = control[p1];
    const z1 = control[p1 + 1];
    const x2 = control[p2];
    const z2 = control[p2 + 1];
    const chord = Math.hypot(x2 - x1, z2 - z1);
    // Tangents scaled by the neighbouring chord lengths keep tight corners from overshooting.
    const d01 = Math.hypot(x1 - control[p0], z1 - control[p0 + 1]) || chord;
    const d23 = Math.hypot(control[p3] - x2, control[p3 + 1] - z2) || chord;
    const k1 = chord / (d01 + chord);
    const k2 = chord / (chord + d23);
    const t1x = (x2 - control[p0]) * k1;
    const t1z = (z2 - control[p0 + 1]) * k1;
    const t2x = (control[p3] - x1) * k2;
    const t2z = (control[p3 + 1] - z1) * k2;
    const samples = Math.max(1, Math.round(chord / step));
    for (let k = 0; k < samples; k += 1) {
      const t = k / samples;
      const t2 = t * t;
      const t3 = t2 * t;
      const h1 = 2 * t3 - 3 * t2 + 1;
      const h2 = t3 - 2 * t2 + t;
      const h3 = -2 * t3 + 3 * t2;
      const h4 = t3 - t2;
      out.push(h1 * x1 + h2 * t1x + h3 * x2 + h4 * t2x, h1 * z1 + h2 * t1z + h3 * z2 + h4 * t2z);
    }
  }
  const end = closed ? 0 : (count - 1) * 2;
  out.push(control[end], control[end + 1]);
  return out;
}

/**
 * The ring of an oriented rectangle, counter-clockwise seen from above, starting at the front
 * left corner as seen from the street: front left, front right... of a building that looks
 * along (frontX, frontZ).
 * @param {number} x Centre.
 * @param {number} z Centre.
 * @param {number} frontX Unit direction the rectangle faces.
 * @param {number} frontZ
 * @param {number} halfWidth Half extent across the facing direction.
 * @param {number} halfDepth Half extent along it.
 * @returns {number[]}
 */
export function rectangleRing(x, z, frontX, frontZ, halfWidth, halfDepth) {
  // The right-hand side of the facing direction.
  const rx = -frontZ;
  const rz = frontX;
  const fx = frontX * halfDepth;
  const fz = frontZ * halfDepth;
  const wx = rx * halfWidth;
  const wz = rz * halfWidth;
  return [x + fx + wx, z + fz + wz, x + fx - wx, z + fz - wz, x - fx - wx, z - fz - wz, x - fx + wx, z - fz + wz];
}

/**
 * Whether two convex rings overlap by more than `tolerance` metres (separating axes).
 * @param {ArrayLike<number>} a
 * @param {ArrayLike<number>} b
 * @param {number} [tolerance]
 * @returns {boolean}
 */
export function convexRingsOverlap(a, b, tolerance = 0) {
  return !hasSeparatingAxis(a, b, tolerance) && !hasSeparatingAxis(b, a, tolerance);
}

function hasSeparatingAxis(a, b, tolerance) {
  const count = a.length;
  for (let i = 0; i < count; i += 2) {
    const j = i + 2 < count ? i + 2 : 0;
    const nx = a[j + 1] - a[i + 1];
    const nz = -(a[j] - a[i]);
    const length = Math.hypot(nx, nz);
    if (length < 1e-9) continue;
    let minA = Infinity;
    let maxA = -Infinity;
    for (let k = 0; k < count; k += 2) {
      const p = (a[k] * nx + a[k + 1] * nz) / length;
      if (p < minA) minA = p;
      if (p > maxA) maxA = p;
    }
    let minB = Infinity;
    let maxB = -Infinity;
    for (let k = 0; k < b.length; k += 2) {
      const p = (b[k] * nx + b[k + 1] * nz) / length;
      if (p < minB) minB = p;
      if (p > maxB) maxB = p;
    }
    if (maxA <= minB + tolerance || maxB <= minA + tolerance) return true;
  }
  return false;
}

/**
 * The shortest distance between a segment and a ring: zero when the segment touches or enters it.
 * @param {ArrayLike<number>} ring
 * @returns {number}
 */
export function distanceSegmentToRing(ring, ax, az, bx, bz) {
  if (pointInRing(ring, ax, az) || pointInRing(ring, bx, bz)) return 0;
  let best = Infinity;
  const count = ring.length;
  for (let i = 0; i < count; i += 2) {
    const j = i + 2 < count ? i + 2 : 0;
    const cx = ring[i];
    const cz = ring[i + 1];
    const dx = ring[j];
    const dz = ring[j + 1];
    if (segmentIntersection(ax, az, bx, bz, cx, cz, dx, dz)) return 0;
    best = Math.min(
      best,
      distanceSquaredToSegment(ax, az, cx, cz, dx, dz),
      distanceSquaredToSegment(bx, bz, cx, cz, dx, dz),
      distanceSquaredToSegment(cx, cz, ax, az, bx, bz),
    );
  }
  return Math.sqrt(best);
}

/**
 * Whether a ring crosses itself (quadratic; meant for rings of up to a few hundred points).
 * @param {ArrayLike<number>} ring
 * @returns {boolean}
 */
export function ringCrossesItself(ring) {
  const count = ring.length / 2;
  for (let i = 0; i < count; i += 1) {
    const i2 = (i + 1) % count;
    for (let j = i + 2; j < count; j += 1) {
      const j2 = (j + 1) % count;
      if (j2 === i) continue;
      const hit = segmentIntersection(
        ring[i * 2], ring[i * 2 + 1], ring[i2 * 2], ring[i2 * 2 + 1],
        ring[j * 2], ring[j * 2 + 1], ring[j2 * 2], ring[j2 * 2 + 1],
      );
      if (hit && hit.t > 1e-6 && hit.t < 1 - 1e-6 && hit.u > 1e-6 && hit.u < 1 - 1e-6) return true;
    }
  }
  return false;
}

/**
 * Cuts a ring along an infinite line into the pieces on either side. Each edge of the ring may
 * carry a tag (the road it faces, for a city block); cut edges get the tag -1.
 * @param {ArrayLike<number>} ring Counter-clockwise ring.
 * @param {ArrayLike<number> | null} tags One tag per edge (edge i runs from point i to i + 1).
 * @param {number} px A point on the line.
 * @param {number} pz
 * @param {number} dx The direction of the line.
 * @param {number} dz
 * @returns {{ring: number[], tags: number[]}[]} The pieces, each counter-clockwise.
 */
export function splitRingByLine(ring, tags, px, pz, dx, dz) {
  const count = ring.length / 2;
  const sides = new Array(count);
  let positives = 0;
  for (let i = 0; i < count; i += 1) {
    let side = dx * (ring[i * 2 + 1] - pz) - dz * (ring[i * 2] - px);
    if (Math.abs(side) < 1e-7) side = 1e-7;
    sides[i] = side;
    if (side > 0) positives += 1;
  }
  const whole = () => [{ ring: Array.from(ring), tags: tags ? Array.from(tags) : new Array(count).fill(-1) }];
  if (positives === 0 || positives === count) return whole();

  // The ring with a vertex added wherever it crosses the line.
  const xs = [];
  const zs = [];
  const edgeTags = [];
  const cuts = [];
  for (let i = 0; i < count; i += 1) {
    const j = (i + 1) % count;
    const tag = tags ? tags[i] : -1;
    xs.push(ring[i * 2]);
    zs.push(ring[i * 2 + 1]);
    edgeTags.push(tag);
    if (sides[i] > 0 !== sides[j] > 0) {
      const t = sides[i] / (sides[i] - sides[j]);
      cuts.push(xs.length);
      xs.push(ring[i * 2] + (ring[j * 2] - ring[i * 2]) * t);
      zs.push(ring[i * 2 + 1] + (ring[j * 2 + 1] - ring[i * 2 + 1]) * t);
      edgeTags.push(tag);
    }
  }
  if (cuts.length % 2 !== 0) return whole();
  const total = xs.length;
  const partner = new Int32Array(total).fill(-1);
  cuts.sort((a, b) => xs[a] * dx + zs[a] * dz - (xs[b] * dx + zs[b] * dz));
  for (let i = 0; i < cuts.length; i += 2) {
    partner[cuts[i]] = cuts[i + 1];
    partner[cuts[i + 1]] = cuts[i];
  }

  const visited = new Uint8Array(total);
  const pieces = [];
  for (let start = 0; start < total; start += 1) {
    if (visited[start] || partner[start] >= 0) continue;
    const pieceRing = [];
    const pieceTags = [];
    let current = start;
    let guard = 0;
    while (!visited[current] && guard < total * 2) {
      guard += 1;
      visited[current] = 1;
      pieceRing.push(xs[current], zs[current]);
      pieceTags.push(edgeTags[current]);
      let next = (current + 1) % total;
      if (partner[next] >= 0) {
        // Follow the cut to the far crossing and carry on along the ring from there.
        pieceRing.push(xs[next], zs[next]);
        pieceTags.push(-1);
        const far = partner[next];
        pieceRing.push(xs[far], zs[far]);
        pieceTags.push(edgeTags[far]);
        next = (far + 1) % total;
      }
      current = next;
    }
    const cleaned = dropShortEdges(pieceRing, pieceTags, 1e-4);
    if (cleaned.ring.length >= 6 && Math.abs(ringSignedArea(cleaned.ring)) > 1e-6) pieces.push(cleaned);
  }
  return pieces.length > 0 ? pieces : whole();
}

/**
 * Removes the edges of a ring that are shorter than `minimum`, keeping the tags of the rest.
 * @param {number[]} ring
 * @param {number[]} tags
 * @param {number} minimum
 * @returns {{ring: number[], tags: number[]}}
 */
export function dropShortEdges(ring, tags, minimum) {
  const outRing = [];
  const outTags = [];
  const count = ring.length / 2;
  for (let i = 0; i < count; i += 1) {
    const j = (i + 1) % count;
    if (Math.hypot(ring[j * 2] - ring[i * 2], ring[j * 2 + 1] - ring[i * 2 + 1]) < minimum) continue;
    outRing.push(ring[i * 2], ring[i * 2 + 1]);
    outTags.push(tags[i]);
  }
  return { ring: outRing, tags: outTags };
}

/**
 * The extent of a ring along a unit axis and across it.
 * @param {ArrayLike<number>} ring
 * @param {number} ux Unit axis.
 * @param {number} uz
 * @returns {{minU: number, maxU: number, minV: number, maxV: number}} U runs along the axis and V
 *   along its left-hand normal (uz, -ux).
 */
export function ringExtentAlong(ring, ux, uz) {
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  for (let i = 0; i < ring.length; i += 2) {
    const u = ring[i] * ux + ring[i + 1] * uz;
    const v = ring[i] * uz - ring[i + 1] * ux;
    if (u < minU) minU = u;
    if (u > maxU) maxU = u;
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
  }
  return { minU, maxU, minV, maxV };
}

/**
 * The compass heading of a direction: 0 looks north (-Z), a quarter turn looks east (+X).
 * @param {number} dx
 * @param {number} dz
 * @returns {number} Radians in [0, 2 pi).
 */
export function headingOfDirection(dx, dz) {
  const heading = Math.atan2(dx, -dz);
  return heading < 0 ? heading + Math.PI * 2 : heading;
}

/**
 * Hermite smoothing of a value between two edges.
 * @returns {number} 0 below `from`, 1 above `to`.
 */
export function smoothStep(from, to, value) {
  if (from === to) return value < from ? 0 : 1;
  let t = (value - from) / (to - from);
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  t = t * t * (3 - 2 * t);
  return t;
}

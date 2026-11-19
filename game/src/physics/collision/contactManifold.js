// Turns a separating axis into contact points. The vertices of each piece that lie on its
// supporting plane along the axis form its contact feature (a point, an edge or a face); the two
// features are clipped against each other in the plane across the axis, which gives one point for
// a corner, two for an edge on a face and up to four for a face on a face. Works for any pair of
// convex pieces without knowing their face polygons.
import { closestSegmentParameters } from '../math/vectorMath.js';
import { createSeparatingAxis, findSeparatingAxis } from './separatingAxis.js';

const MAX_FEATURE = 16;
const MAX_POINTS = 4;

/** Contact points between two convex pieces. */
export class ContactManifold {
  constructor() {
    /** How many points the manifold has (0 to 4). */
    this.count = 0;
    /** The contact normal, a unit vector from piece A to piece B. */
    this.nx = 0;
    this.ny = 1;
    this.nz = 0;
    /** Point positions, three numbers each. */
    this.points = new Float64Array(MAX_POINTS * 3);
    /** Penetration depth at each point; negative for a point that is still a little apart. */
    this.depths = new Float64Array(MAX_POINTS);
    /** The separation of the cores along the normal (negative when they overlap). */
    this.separation = 0;
  }
}

const axis = createSeparatingAxis();
const featureA = new Float64Array(MAX_FEATURE * 3);
const featureB = new Float64Array(MAX_FEATURE * 3);
const sortKeys = new Float64Array(MAX_FEATURE);
const clipIn = new Float64Array(MAX_FEATURE * 2 * 3);
const clipOut = new Float64Array(MAX_FEATURE * 2 * 3);
const candidates = new Float64Array(MAX_FEATURE * 2 * 4);
const segmentParameters = { s: 0, t: 0 };
let featureCountA = 0;
let featureCountB = 0;

/**
 * Collides two convex pieces.
 * @param {import('./ConvexPoly.js').ConvexPoly} a The first piece.
 * @param {import('./ConvexPoly.js').ConvexPoly} b The second piece.
 * @param {number} margin Pieces closer than this (but not yet touching) still give contact
 *   points, with negative depth: the solver uses them to stop the pieces just in time.
 * @param {ContactManifold} manifold Receives the contact points.
 * @returns {boolean} True when the manifold has at least one point.
 */
export function collideConvexPieces(a, b, margin, manifold) {
  manifold.count = 0;
  if (!findSeparatingAxis(a, b, a.radius + b.radius + margin, axis)) return false;
  buildManifold(a, b, axis.nx, axis.ny, axis.nz, axis.separation, margin, manifold);
  return manifold.count > 0;
}

/**
 * Builds the contact points of two pieces along a known axis.
 * @param {import('./ConvexPoly.js').ConvexPoly} a The first piece.
 * @param {import('./ConvexPoly.js').ConvexPoly} b The second piece.
 * @param {number} nx The axis from A to B (unit).
 * @param {number} ny
 * @param {number} nz
 * @param {number} separation The separation of the cores along the axis.
 * @param {number} margin How far apart a point may be and still be kept.
 * @param {ContactManifold} manifold Receives the contact points.
 */
export function buildManifold(a, b, nx, ny, nz, separation, margin, manifold) {
  manifold.nx = nx;
  manifold.ny = ny;
  manifold.nz = nz;
  manifold.separation = separation;
  manifold.count = 0;
  const radii = a.radius + b.radius;
  const tolerance = 0.02 + (separation < 0 ? -separation * 0.5 : 0);
  const aMax = collectFeature(a, nx, ny, nz, tolerance, featureA, true);
  featureCountA = collectedCount;
  const bMin = -collectFeature(b, -nx, -ny, -nz, tolerance, featureB, false);
  featureCountB = collectedCount;

  // A basis of the plane across the axis.
  let ux;
  let uy;
  let uz;
  if (Math.abs(nx) < 0.57) {
    const inverse = 1 / Math.sqrt(ny * ny + nz * nz);
    ux = 0;
    uy = -nz * inverse;
    uz = ny * inverse;
  } else {
    const inverse = 1 / Math.sqrt(nx * nx + nz * nz);
    ux = -nz * inverse;
    uy = 0;
    uz = nx * inverse;
  }
  const wx = ny * uz - nz * uy;
  const wy = nz * ux - nx * uz;
  const wz = nx * uy - ny * ux;

  if (featureCountA >= 3) featureCountA = orderFeature(featureA, featureCountA, ux, uy, uz, wx, wy, wz);
  if (featureCountB >= 3) featureCountB = orderFeature(featureB, featureCountB, ux, uy, uz, wx, wy, wz);

  // Candidates are (x, y, z, depth); `fromA` points lie on A's feature, the rest on B's.
  let count = 0;
  if (featureCountA === 1) {
    count = pushCandidate(count, featureA[0] + nx * a.radius, featureA[1] + ny * a.radius, featureA[2] + nz * a.radius,
      radii - (bMin - (featureA[0] * nx + featureA[1] * ny + featureA[2] * nz)));
  } else if (featureCountB === 1) {
    count = pushCandidate(count, featureB[0] - nx * b.radius, featureB[1] - ny * b.radius, featureB[2] - nz * b.radius,
      radii - (featureB[0] * nx + featureB[1] * ny + featureB[2] * nz - aMax));
  } else if (featureCountA === 2 && featureCountB === 2) {
    count = edgeEdgeCandidates(a.radius, b.radius, nx, ny, nz);
  } else if (featureCountA >= 3) {
    // Clip B's feature (an edge or a face) against A's face.
    const clipped = clipFeature(featureB, featureCountB, featureA, featureCountA, ux, uy, uz, wx, wy, wz);
    for (let i = 0; i < clipped; i += 1) {
      const x = clipOut[i * 3];
      const y = clipOut[i * 3 + 1];
      const z = clipOut[i * 3 + 2];
      count = pushCandidate(count, x - nx * b.radius, y - ny * b.radius, z - nz * b.radius,
        radii - (x * nx + y * ny + z * nz - aMax));
    }
  } else {
    // A's edge against B's face.
    const clipped = clipFeature(featureA, featureCountA, featureB, featureCountB, ux, uy, uz, wx, wy, wz);
    for (let i = 0; i < clipped; i += 1) {
      const x = clipOut[i * 3];
      const y = clipOut[i * 3 + 1];
      const z = clipOut[i * 3 + 2];
      count = pushCandidate(count, x + nx * a.radius, y + ny * a.radius, z + nz * a.radius,
        radii - (bMin - (x * nx + y * ny + z * nz)));
    }
  }
  if (count === 0) {
    // Clipping lost everything (features that barely overlap): fall back to the deepest vertex.
    count = pushCandidate(0, featureB[0] - nx * b.radius, featureB[1] - ny * b.radius, featureB[2] - nz * b.radius,
      radii - separation);
  }
  reduceCandidates(count, margin, manifold);
}

let collectedCount = 0;

/** Collects the vertices of a piece on its supporting plane along a direction. */
function collectFeature(poly, dx, dy, dz, tolerance, feature) {
  const verts = poly.verts;
  let max = -Infinity;
  for (let i = 0, end = poly.vertexCount * 3; i < end; i += 3) {
    const d = verts[i] * dx + verts[i + 1] * dy + verts[i + 2] * dz;
    if (d > max) max = d;
  }
  const threshold = max - tolerance;
  let count = 0;
  for (let i = 0, end = poly.vertexCount * 3; i < end && count < MAX_FEATURE; i += 3) {
    const d = verts[i] * dx + verts[i + 1] * dy + verts[i + 2] * dz;
    if (d >= threshold) {
      feature[count * 3] = verts[i];
      feature[count * 3 + 1] = verts[i + 1];
      feature[count * 3 + 2] = verts[i + 2];
      count += 1;
    }
  }
  collectedCount = count;
  return max;
}

/**
 * Sorts feature points counter-clockwise in the (u, w) plane. A feature with no area (points in
 * a line) is cut down to its two end points.
 * @returns {number} The new point count.
 */
function orderFeature(feature, count, ux, uy, uz, wx, wy, wz) {
  let centreU = 0;
  let centreW = 0;
  for (let i = 0; i < count; i += 1) {
    centreU += feature[i * 3] * ux + feature[i * 3 + 1] * uy + feature[i * 3 + 2] * uz;
    centreW += feature[i * 3] * wx + feature[i * 3 + 1] * wy + feature[i * 3 + 2] * wz;
  }
  centreU /= count;
  centreW /= count;
  for (let i = 0; i < count; i += 1) {
    const pu = feature[i * 3] * ux + feature[i * 3 + 1] * uy + feature[i * 3 + 2] * uz - centreU;
    const pw = feature[i * 3] * wx + feature[i * 3 + 1] * wy + feature[i * 3 + 2] * wz - centreW;
    sortKeys[i] = Math.atan2(pw, pu);
  }
  for (let i = 1; i < count; i += 1) {
    const key = sortKeys[i];
    const x = feature[i * 3];
    const y = feature[i * 3 + 1];
    const z = feature[i * 3 + 2];
    let j = i - 1;
    while (j >= 0 && sortKeys[j] > key) {
      sortKeys[j + 1] = sortKeys[j];
      feature[(j + 1) * 3] = feature[j * 3];
      feature[(j + 1) * 3 + 1] = feature[j * 3 + 1];
      feature[(j + 1) * 3 + 2] = feature[j * 3 + 2];
      j -= 1;
    }
    sortKeys[j + 1] = key;
    feature[(j + 1) * 3] = x;
    feature[(j + 1) * 3 + 1] = y;
    feature[(j + 1) * 3 + 2] = z;
  }
  // Twice the signed area; a sliver is treated as an edge.
  let area = 0;
  let previous = count - 1;
  for (let i = 0; i < count; i += 1) {
    const pu = feature[previous * 3] * ux + feature[previous * 3 + 1] * uy + feature[previous * 3 + 2] * uz;
    const pw = feature[previous * 3] * wx + feature[previous * 3 + 1] * wy + feature[previous * 3 + 2] * wz;
    const qu = feature[i * 3] * ux + feature[i * 3 + 1] * uy + feature[i * 3 + 2] * uz;
    const qw = feature[i * 3] * wx + feature[i * 3 + 1] * wy + feature[i * 3 + 2] * wz;
    area += pu * qw - qu * pw;
    previous = i;
  }
  if (area > 1e-6) return count;
  let first = 0;
  let second = 1;
  let longest = -1;
  for (let i = 0; i < count; i += 1) {
    for (let j = i + 1; j < count; j += 1) {
      const dx = feature[i * 3] - feature[j * 3];
      const dy = feature[i * 3 + 1] - feature[j * 3 + 1];
      const dz = feature[i * 3 + 2] - feature[j * 3 + 2];
      const distance = dx * dx + dy * dy + dz * dz;
      if (distance > longest) {
        longest = distance;
        first = i;
        second = j;
      }
    }
  }
  const ax = feature[first * 3];
  const ay = feature[first * 3 + 1];
  const az = feature[first * 3 + 2];
  feature[3] = feature[second * 3];
  feature[4] = feature[second * 3 + 1];
  feature[5] = feature[second * 3 + 2];
  feature[0] = ax;
  feature[1] = ay;
  feature[2] = az;
  return 2;
}

/**
 * Clips a subject feature (two or more points) against a convex clip polygon (three or more
 * points, counter-clockwise) in the (u, w) plane. The result is left in clipOut.
 * @returns {number} The number of points kept.
 */
function clipFeature(subject, subjectCount, clip, clipCount, ux, uy, uz, wx, wy, wz) {
  let count = subjectCount;
  for (let i = 0; i < count * 3; i += 1) clipOut[i] = subject[i];
  const closed = subjectCount >= 3;
  let previous = clipCount - 1;
  for (let edge = 0; edge < clipCount && count > 0; edge += 1) {
    const ax = clip[previous * 3];
    const ay = clip[previous * 3 + 1];
    const az = clip[previous * 3 + 2];
    const au = ax * ux + ay * uy + az * uz;
    const aw = ax * wx + ay * wy + az * wz;
    const eu = clip[edge * 3] * ux + clip[edge * 3 + 1] * uy + clip[edge * 3 + 2] * uz - au;
    const ew = clip[edge * 3] * wx + clip[edge * 3 + 1] * wy + clip[edge * 3 + 2] * wz - aw;
    previous = edge;
    const length = Math.sqrt(eu * eu + ew * ew);
    if (length < 1e-9) continue;
    const slack = length * 1e-4;
    for (let i = 0; i < count * 3; i += 1) clipIn[i] = clipOut[i];
    const inputCount = count;
    count = 0;
    const segments = closed ? inputCount : inputCount - 1;
    if (!closed) {
      // An open edge: keep its first point if it is inside, then walk its one segment.
      const side = sideOf(clipIn, 0, au, aw, eu, ew, ux, uy, uz, wx, wy, wz);
      if (side >= -slack) count = copyPoint(clipIn, 0, count);
    }
    for (let s = 0; s < segments; s += 1) {
      const from = closed ? (s + inputCount - 1) % inputCount : s;
      const to = closed ? s : s + 1;
      const fromSide = sideOf(clipIn, from, au, aw, eu, ew, ux, uy, uz, wx, wy, wz);
      const toSide = sideOf(clipIn, to, au, aw, eu, ew, ux, uy, uz, wx, wy, wz);
      const fromInside = fromSide >= -slack;
      const toInside = toSide >= -slack;
      if (fromInside !== toInside && count < MAX_FEATURE * 2) {
        const t = fromSide / (fromSide - toSide);
        clipOut[count * 3] = clipIn[from * 3] + (clipIn[to * 3] - clipIn[from * 3]) * t;
        clipOut[count * 3 + 1] = clipIn[from * 3 + 1] + (clipIn[to * 3 + 1] - clipIn[from * 3 + 1]) * t;
        clipOut[count * 3 + 2] = clipIn[from * 3 + 2] + (clipIn[to * 3 + 2] - clipIn[from * 3 + 2]) * t;
        count += 1;
      }
      if (toInside && count < MAX_FEATURE * 2) count = copyPoint(clipIn, to, count);
    }
  }
  return count;
}

function sideOf(points, index, au, aw, eu, ew, ux, uy, uz, wx, wy, wz) {
  const pu = points[index * 3] * ux + points[index * 3 + 1] * uy + points[index * 3 + 2] * uz - au;
  const pw = points[index * 3] * wx + points[index * 3 + 1] * wy + points[index * 3 + 2] * wz - aw;
  return eu * pw - ew * pu;
}

function copyPoint(points, index, count) {
  clipOut[count * 3] = points[index * 3];
  clipOut[count * 3 + 1] = points[index * 3 + 1];
  clipOut[count * 3 + 2] = points[index * 3 + 2];
  return count + 1;
}

/** Two edges: one point where they cross, or two along their overlap when they are parallel. */
function edgeEdgeCandidates(radiusA, radiusB, nx, ny, nz) {
  const ax = featureA[0];
  const ay = featureA[1];
  const az = featureA[2];
  const bx = featureA[3];
  const by = featureA[4];
  const bz = featureA[5];
  const cx = featureB[0];
  const cy = featureB[1];
  const cz = featureB[2];
  const dx = featureB[3];
  const dy = featureB[4];
  const dz = featureB[5];
  const e1x = bx - ax;
  const e1y = by - ay;
  const e1z = bz - az;
  const e2x = dx - cx;
  const e2y = dy - cy;
  const e2z = dz - cz;
  const crossX = e1y * e2z - e1z * e2y;
  const crossY = e1z * e2x - e1x * e2z;
  const crossZ = e1x * e2y - e1y * e2x;
  const lengths = (e1x * e1x + e1y * e1y + e1z * e1z) * (e2x * e2x + e2y * e2y + e2z * e2z);
  const radii = radiusA + radiusB;
  let count = 0;
  if (crossX * crossX + crossY * crossY + crossZ * crossZ < lengths * 0.003) {
    // Nearly parallel: the part of A's edge that lies alongside B's edge.
    const lengthSquared = e1x * e1x + e1y * e1y + e1z * e1z || 1;
    let t0 = ((cx - ax) * e1x + (cy - ay) * e1y + (cz - az) * e1z) / lengthSquared;
    let t1 = ((dx - ax) * e1x + (dy - ay) * e1y + (dz - az) * e1z) / lengthSquared;
    if (t0 > t1) {
      const swap = t0;
      t0 = t1;
      t1 = swap;
    }
    t0 = t0 < 0 ? 0 : t0 > 1 ? 1 : t0;
    t1 = t1 < 0 ? 0 : t1 > 1 ? 1 : t1;
    const bMin = Math.min(cx * nx + cy * ny + cz * nz, dx * nx + dy * ny + dz * nz);
    for (let i = 0; i < 2; i += 1) {
      const t = i === 0 ? t0 : t1;
      if (i === 1 && t1 - t0 < 1e-6) break;
      const x = ax + e1x * t;
      const y = ay + e1y * t;
      const z = az + e1z * t;
      count = pushCandidate(count, x + nx * radiusA, y + ny * radiusA, z + nz * radiusA,
        radii - (bMin - (x * nx + y * ny + z * nz)));
    }
    return count;
  }
  closestSegmentParameters(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, segmentParameters);
  const px = ax + e1x * segmentParameters.s;
  const py = ay + e1y * segmentParameters.s;
  const pz = az + e1z * segmentParameters.s;
  const qx = cx + e2x * segmentParameters.t;
  const qy = cy + e2y * segmentParameters.t;
  const qz = cz + e2z * segmentParameters.t;
  const gap = (qx - px) * nx + (qy - py) * ny + (qz - pz) * nz;
  return pushCandidate(0, (px + qx) * 0.5 + nx * (radiusA - radiusB) * 0.5, (py + qy) * 0.5 + ny * (radiusA - radiusB) * 0.5,
    (pz + qz) * 0.5 + nz * (radiusA - radiusB) * 0.5, radii - gap);
}

function pushCandidate(count, x, y, z, depth) {
  if (count >= MAX_FEATURE * 2) return count;
  candidates[count * 4] = x;
  candidates[count * 4 + 1] = y;
  candidates[count * 4 + 2] = z;
  candidates[count * 4 + 3] = depth;
  return count + 1;
}

/** Keeps at most four candidates: the deepest, then the ones that spread the contact widest. */
function reduceCandidates(count, margin, manifold) {
  // Drop points that are further apart than the margin, but always keep the deepest.
  let deepest = 0;
  for (let i = 1; i < count; i += 1) if (candidates[i * 4 + 3] > candidates[deepest * 4 + 3]) deepest = i;
  let kept = 0;
  for (let i = 0; i < count; i += 1) {
    if (i !== deepest && candidates[i * 4 + 3] < -margin) continue;
    if (i === deepest) deepest = kept;
    if (kept !== i) {
      candidates[kept * 4] = candidates[i * 4];
      candidates[kept * 4 + 1] = candidates[i * 4 + 1];
      candidates[kept * 4 + 2] = candidates[i * 4 + 2];
      candidates[kept * 4 + 3] = candidates[i * 4 + 3];
    }
    kept += 1;
  }
  if (kept <= MAX_POINTS) {
    for (let i = 0; i < kept; i += 1) writePoint(manifold, i, i);
    manifold.count = kept;
    return;
  }
  // First the deepest; second the farthest from it; third the farthest from that line; fourth
  // the farthest from the third on the other side of the line.
  const p0 = deepest;
  let p1 = -1;
  let best = -1;
  for (let i = 0; i < kept; i += 1) {
    if (i === p0) continue;
    const distance = squaredDistance(i, p0);
    if (distance > best) {
      best = distance;
      p1 = i;
    }
  }
  let p2 = -1;
  best = -1;
  for (let i = 0; i < kept; i += 1) {
    if (i === p0 || i === p1) continue;
    const distance = squaredDistanceToLine(i, p0, p1);
    if (distance > best) {
      best = distance;
      p2 = i;
    }
  }
  let p3 = -1;
  best = -1;
  for (let i = 0; i < kept; i += 1) {
    if (i === p0 || i === p1 || i === p2) continue;
    const distance = squaredDistance(i, p2) * (oppositeSides(i, p2, p0, p1) ? 4 : 1);
    if (distance > best) {
      best = distance;
      p3 = i;
    }
  }
  writePoint(manifold, 0, p0);
  writePoint(manifold, 1, p1);
  writePoint(manifold, 2, p2);
  writePoint(manifold, 3, p3);
  manifold.count = 4;
}

function writePoint(manifold, slot, candidate) {
  manifold.points[slot * 3] = candidates[candidate * 4];
  manifold.points[slot * 3 + 1] = candidates[candidate * 4 + 1];
  manifold.points[slot * 3 + 2] = candidates[candidate * 4 + 2];
  manifold.depths[slot] = candidates[candidate * 4 + 3];
}

function squaredDistance(i, j) {
  const dx = candidates[i * 4] - candidates[j * 4];
  const dy = candidates[i * 4 + 1] - candidates[j * 4 + 1];
  const dz = candidates[i * 4 + 2] - candidates[j * 4 + 2];
  return dx * dx + dy * dy + dz * dz;
}

function squaredDistanceToLine(i, a, b) {
  const ex = candidates[b * 4] - candidates[a * 4];
  const ey = candidates[b * 4 + 1] - candidates[a * 4 + 1];
  const ez = candidates[b * 4 + 2] - candidates[a * 4 + 2];
  const px = candidates[i * 4] - candidates[a * 4];
  const py = candidates[i * 4 + 1] - candidates[a * 4 + 1];
  const pz = candidates[i * 4 + 2] - candidates[a * 4 + 2];
  const cx = ey * pz - ez * py;
  const cy = ez * px - ex * pz;
  const cz = ex * py - ey * px;
  return (cx * cx + cy * cy + cz * cz) / (ex * ex + ey * ey + ez * ez || 1);
}

function oppositeSides(i, j, a, b) {
  const ex = candidates[b * 4] - candidates[a * 4];
  const ey = candidates[b * 4 + 1] - candidates[a * 4 + 1];
  const ez = candidates[b * 4 + 2] - candidates[a * 4 + 2];
  const px = candidates[i * 4] - candidates[a * 4];
  const py = candidates[i * 4 + 1] - candidates[a * 4 + 1];
  const pz = candidates[i * 4 + 2] - candidates[a * 4 + 2];
  const qx = candidates[j * 4] - candidates[a * 4];
  const qy = candidates[j * 4 + 1] - candidates[a * 4 + 1];
  const qz = candidates[j * 4 + 2] - candidates[a * 4 + 2];
  // Compare the directions of the two points' offsets from the line.
  const c1x = ey * pz - ez * py;
  const c1y = ez * px - ex * pz;
  const c1z = ex * py - ey * px;
  const c2x = ey * qz - ez * qy;
  const c2y = ez * qx - ex * qz;
  const c2z = ex * qy - ey * qx;
  return c1x * c2x + c1y * c2y + c1z * c2z < 0;
}

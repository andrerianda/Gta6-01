// The separating-axis test between two convex pieces: finds the direction along which they are
// furthest apart (or overlap least) and that distance. Cores are tested on their face normals and
// on the cross products of their edge directions; when either piece is rounded (a sphere, a
// capsule) the closest vertex-edge pair adds the axis that makes round corners exact.
import { closestSegmentParameter } from '../math/vectorMath.js';

/**
 * The result of a separating-axis test.
 * @typedef {object} SeparatingAxis
 * @property {number} nx The axis, a unit vector pointing from piece A to piece B.
 * @property {number} ny
 * @property {number} nz
 * @property {number} separation Distance between the cores along the axis: negative when the
 *   cores overlap. The pieces touch when it is below the sum of their radii.
 */

let projectedMin = 0;
let projectedMax = 0;

/**
 * Finds the axis of greatest separation between two convex pieces.
 * @param {import('./ConvexPoly.js').ConvexPoly} a The first piece.
 * @param {import('./ConvexPoly.js').ConvexPoly} b The second piece.
 * @param {number} limit Give up as soon as some axis separates the cores by more than this (the
 *   sum of the radii plus any margin).
 * @param {SeparatingAxis} out Receives the axis and the separation when the result is true.
 * @returns {boolean} True when the cores are within `limit` of each other.
 */
export function findSeparatingAxis(a, b, limit, out) {
  let best = -Infinity;
  let bestX = 0;
  let bestY = 1;
  let bestZ = 0;

  for (let pass = 0; pass < 2; pass += 1) {
    const owner = pass === 0 ? a : b;
    const normals = owner.faceNormals;
    for (let i = 0, end = owner.uniqueFaceCount * 3; i < end; i += 3) {
      const nx = normals[i];
      const ny = normals[i + 1];
      const nz = normals[i + 2];
      project(a, nx, ny, nz);
      const aMin = projectedMin;
      const aMax = projectedMax;
      project(b, nx, ny, nz);
      const forward = projectedMin - aMax;
      const backward = aMin - projectedMax;
      if (forward > backward) {
        if (forward > limit) return false;
        if (forward > best) {
          best = forward;
          bestX = nx;
          bestY = ny;
          bestZ = nz;
        }
      } else {
        if (backward > limit) return false;
        if (backward > best) {
          best = backward;
          bestX = -nx;
          bestY = -ny;
          bestZ = -nz;
        }
      }
    }
  }

  const aDirs = a.edgeDirs;
  const bDirs = b.edgeDirs;
  for (let i = 0, aEnd = a.edgeDirCount * 3; i < aEnd; i += 3) {
    const ax = aDirs[i];
    const ay = aDirs[i + 1];
    const az = aDirs[i + 2];
    for (let j = 0, bEnd = b.edgeDirCount * 3; j < bEnd; j += 3) {
      let nx = ay * bDirs[j + 2] - az * bDirs[j + 1];
      let ny = az * bDirs[j] - ax * bDirs[j + 2];
      let nz = ax * bDirs[j + 1] - ay * bDirs[j];
      const lengthSquared = nx * nx + ny * ny + nz * nz;
      if (lengthSquared < 1e-8) continue;
      const inverse = 1 / Math.sqrt(lengthSquared);
      nx *= inverse;
      ny *= inverse;
      nz *= inverse;
      project(a, nx, ny, nz);
      const aMin = projectedMin;
      const aMax = projectedMax;
      project(b, nx, ny, nz);
      const forward = projectedMin - aMax;
      const backward = aMin - projectedMax;
      const separation = forward > backward ? forward : backward;
      if (separation > limit) return false;
      // Face axes win ties: an edge axis must be clearly better to replace one.
      const threshold = best < 0 ? best * 0.98 + 0.0005 : best + 1e-7;
      if (separation > threshold) {
        best = separation;
        const sign = forward > backward ? 1 : -1;
        bestX = nx * sign;
        bestY = ny * sign;
        bestZ = nz * sign;
      }
    }
  }

  if (a.radius > 0 || b.radius > 0) {
    // Round corners: the closest vertex-edge pair of the cores gives the missing axis.
    let closest = Infinity;
    let fromX = 0;
    let fromY = 0;
    let fromZ = 0;
    let toX = 0;
    let toY = 0;
    let toZ = 0;
    for (let pass = 0; pass < 2; pass += 1) {
      const points = pass === 0 ? a : b;
      const lines = pass === 0 ? b : a;
      const pv = points.verts;
      const lv = lines.verts;
      const le = lines.edges;
      for (let i = 0, pEnd = points.vertexCount * 3; i < pEnd; i += 3) {
        const px = pv[i];
        const py = pv[i + 1];
        const pz = pv[i + 2];
        for (let e = 0, eEnd = lines.edgeCount * 2; e < eEnd; e += 2) {
          const s = le[e] * 3;
          const t = le[e + 1] * 3;
          const u = closestSegmentParameter(px, py, pz, lv[s], lv[s + 1], lv[s + 2], lv[t], lv[t + 1], lv[t + 2]);
          const qx = lv[s] + (lv[t] - lv[s]) * u;
          const qy = lv[s + 1] + (lv[t + 1] - lv[s + 1]) * u;
          const qz = lv[s + 2] + (lv[t + 2] - lv[s + 2]) * u;
          const distance = (qx - px) * (qx - px) + (qy - py) * (qy - py) + (qz - pz) * (qz - pz);
          if (distance < closest) {
            closest = distance;
            if (pass === 0) {
              fromX = px;
              fromY = py;
              fromZ = pz;
              toX = qx;
              toY = qy;
              toZ = qz;
            } else {
              fromX = qx;
              fromY = qy;
              fromZ = qz;
              toX = px;
              toY = py;
              toZ = pz;
            }
          }
        }
      }
    }
    if (closest > 1e-16 && closest < Infinity) {
      const inverse = 1 / Math.sqrt(closest);
      const nx = (toX - fromX) * inverse;
      const ny = (toY - fromY) * inverse;
      const nz = (toZ - fromZ) * inverse;
      project(a, nx, ny, nz);
      const aMax = projectedMax;
      project(b, nx, ny, nz);
      const separation = projectedMin - aMax;
      if (separation > limit) return false;
      if (separation > best) {
        best = separation;
        bestX = nx;
        bestY = ny;
        bestZ = nz;
      }
    }
  }

  if (best === -Infinity) {
    // Two points on top of each other, or pieces with no axes at all: push along the centres.
    let nx = b.cx - a.cx;
    let ny = b.cy - a.cy;
    let nz = b.cz - a.cz;
    const length = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (length > 1e-9) {
      nx /= length;
      ny /= length;
      nz /= length;
    } else {
      nx = 0;
      ny = 1;
      nz = 0;
    }
    project(a, nx, ny, nz);
    const aMax = projectedMax;
    project(b, nx, ny, nz);
    best = projectedMin - aMax;
    if (best > limit) return false;
    bestX = nx;
    bestY = ny;
    bestZ = nz;
  }

  out.nx = bestX;
  out.ny = bestY;
  out.nz = bestZ;
  out.separation = best;
  return true;
}

/**
 * Creates an empty result object for findSeparatingAxis.
 * @returns {SeparatingAxis}
 */
export function createSeparatingAxis() {
  return { nx: 0, ny: 1, nz: 0, separation: 0 };
}

function project(poly, nx, ny, nz) {
  const verts = poly.verts;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0, end = poly.vertexCount * 3; i < end; i += 3) {
    const d = verts[i] * nx + verts[i + 1] * ny + verts[i + 2] * nz;
    if (d < min) min = d;
    if (d > max) max = d;
  }
  projectedMin = min;
  projectedMax = max;
}

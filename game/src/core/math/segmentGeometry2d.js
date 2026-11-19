// 2D geometry of points, segments and polylines: projections, distances, intersections and
// walking along a path. The game uses it on the ground plane (x east, z south passed as y) for
// roads, lanes, kerbs, sight lines and placement tests. Coordinates are plain numbers; a
// polyline is an array of [x, y] pairs. Results are small plain objects.
//
//   const hit = closestPointOnSegment(car.x, car.z, a[0], a[1], b[0], b[1]);
//   const where = projectOnPolyline(laneCentreLine, car.x, car.z);   // .along is metres from the start

/**
 * The point of segment AB nearest to P.
 * @param {number} px
 * @param {number} py
 * @param {number} ax
 * @param {number} ay
 * @param {number} bx
 * @param {number} by
 * @returns {{x: number, y: number, t: number, distance: number}} The point, its parameter along
 *   the segment (0 at A, 1 at B) and its distance from P.
 */
export function closestPointOnSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  let t = lengthSquared > 0 ? ((px - ax) * dx + (py - ay) * dy) / lengthSquared : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const x = ax + dx * t;
  const y = ay + dy * t;
  return { x, y, t, distance: Math.hypot(px - x, py - y) };
}

/**
 * The squared distance from P to segment AB (no allocation; use it in hot loops).
 * @returns {number}
 */
export function distanceSquaredToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  let t = lengthSquared > 0 ? ((px - ax) * dx + (py - ay) * dy) / lengthSquared : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ox = px - (ax + dx * t);
  const oy = py - (ay + dy * t);
  return ox * ox + oy * oy;
}

/** The distance from P to segment AB. @returns {number} */
export function distanceToSegment(px, py, ax, ay, bx, by) {
  return Math.sqrt(distanceSquaredToSegment(px, py, ax, ay, bx, by));
}

/**
 * The 2D cross product (ax * by - ay * bx): positive when B is counter-clockwise from A.
 * @returns {number}
 */
export function cross2d(ax, ay, bx, by) {
  return ax * by - ay * bx;
}

/**
 * Which side of the directed line A -> B the point P lies on: positive on the left
 * (counter-clockwise side), negative on the right, zero on the line. The magnitude is twice the
 * area of the triangle ABP.
 * @returns {number}
 */
export function sideOfLine(px, py, ax, ay, bx, by) {
  return (bx - ax) * (py - ay) - (by - ay) * (px - ax);
}

/**
 * The intersection of segments AB and CD.
 * @returns {{x: number, y: number, t: number, u: number} | null} The crossing point with its
 *   parameters along AB (t) and CD (u), or null when the segments do not cross (parallel and
 *   collinear segments count as not crossing).
 */
export function segmentIntersection(ax, ay, bx, by, cx, cy, dx, dy) {
  const rx = bx - ax;
  const ry = by - ay;
  const sx = dx - cx;
  const sy = dy - cy;
  const denominator = rx * sy - ry * sx;
  if (Math.abs(denominator) < 1e-12) return null;
  const t = ((cx - ax) * sy - (cy - ay) * sx) / denominator;
  const u = ((cx - ax) * ry - (cy - ay) * rx) / denominator;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: ax + rx * t, y: ay + ry * t, t, u };
}

/** Whether segments AB and CD cross or touch. @returns {boolean} */
export function segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
  return segmentIntersection(ax, ay, bx, by, cx, cy, dx, dy) !== null;
}

/**
 * The intersection of the infinite lines through AB and CD.
 * @returns {{x: number, y: number} | null} Null when the lines are parallel.
 */
export function lineIntersection(ax, ay, bx, by, cx, cy, dx, dy) {
  const rx = bx - ax;
  const ry = by - ay;
  const sx = dx - cx;
  const sy = dy - cy;
  const denominator = rx * sy - ry * sx;
  if (Math.abs(denominator) < 1e-12) return null;
  const t = ((cx - ax) * sy - (cy - ay) * sx) / denominator;
  return { x: ax + rx * t, y: ay + ry * t };
}

/**
 * The length of a polyline.
 * @param {ArrayLike<ArrayLike<number>>} points [x, y] pairs.
 * @param {boolean} [closed] Whether the last point joins the first.
 * @returns {number}
 */
export function polylineLength(points, closed = false) {
  let length = 0;
  const count = points.length;
  for (let i = 1; i < count; i += 1) {
    length += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  }
  if (closed && count > 1) length += Math.hypot(points[0][0] - points[count - 1][0], points[0][1] - points[count - 1][1]);
  return length;
}

/**
 * Projects a point onto a polyline: the nearest point on any of its segments.
 * @param {ArrayLike<ArrayLike<number>>} points [x, y] pairs, at least one.
 * @param {number} px
 * @param {number} py
 * @param {boolean} [closed] Whether the last point joins the first.
 * @returns {{x: number, y: number, distance: number, segment: number, t: number, along: number,
 *   side: number}} The nearest point, its distance from P, the index of the segment it lies on,
 *   the parameter within that segment, the arc length from the start of the polyline, and which
 *   side of the path P is on (+1 left of the direction of travel, -1 right, 0 on it).
 */
export function projectOnPolyline(points, px, py, closed = false) {
  const count = points.length;
  const segments = closed ? count : count - 1;
  let best = { x: points[0][0], y: points[0][1], distance: Math.hypot(px - points[0][0], py - points[0][1]), segment: 0, t: 0, along: 0, side: 0 };
  let bestSquared = best.distance * best.distance;
  let travelled = 0;
  for (let i = 0; i < segments; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % count];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const lengthSquared = dx * dx + dy * dy;
    const length = Math.sqrt(lengthSquared);
    let t = lengthSquared > 0 ? ((px - a[0]) * dx + (py - a[1]) * dy) / lengthSquared : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const x = a[0] + dx * t;
    const y = a[1] + dy * t;
    const squared = (px - x) * (px - x) + (py - y) * (py - y);
    if (squared < bestSquared || i === 0) {
      bestSquared = squared;
      const turn = dx * (py - a[1]) - dy * (px - a[0]);
      best = { x, y, distance: Math.sqrt(squared), segment: i, t, along: travelled + length * t, side: Math.sign(turn) };
    }
    travelled += length;
  }
  return best;
}

/**
 * The distance from a point to a polyline. @returns {number}
 * @param {ArrayLike<ArrayLike<number>>} points
 * @param {number} px
 * @param {number} py
 * @param {boolean} [closed]
 */
export function distanceToPolyline(points, px, py, closed = false) {
  const count = points.length;
  if (count === 1) return Math.hypot(px - points[0][0], py - points[0][1]);
  const segments = closed ? count : count - 1;
  let best = Infinity;
  for (let i = 0; i < segments; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % count];
    const squared = distanceSquaredToSegment(px, py, a[0], a[1], b[0], b[1]);
    if (squared < best) best = squared;
  }
  return Math.sqrt(best);
}

/**
 * The point at a given arc length along a polyline, with the direction of travel there.
 * Distances before the start or past the end clamp to the ends (or wrap when closed).
 * @param {ArrayLike<ArrayLike<number>>} points [x, y] pairs, at least two.
 * @param {number} distance Metres from the first point.
 * @param {boolean} [closed]
 * @returns {{x: number, y: number, tangentX: number, tangentY: number, segment: number, t: number}}
 *   The point, the unit tangent, the segment index and the parameter within it.
 */
export function pointAlongPolyline(points, distance, closed = false) {
  const count = points.length;
  const segments = closed ? count : count - 1;
  let remaining = distance;
  if (closed) {
    const total = polylineLength(points, true);
    if (total > 0) remaining = ((distance % total) + total) % total;
  }
  if (remaining < 0) remaining = 0;
  let last = null;
  for (let i = 0; i < segments; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % count];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const length = Math.hypot(dx, dy);
    if (length <= 0) continue;
    last = { a, dx, dy, length, index: i };
    if (remaining <= length) {
      const t = remaining / length;
      return { x: a[0] + dx * t, y: a[1] + dy * t, tangentX: dx / length, tangentY: dy / length, segment: i, t };
    }
    remaining -= length;
  }
  if (!last) return { x: points[0][0], y: points[0][1], tangentX: 1, tangentY: 0, segment: 0, t: 0 };
  return {
    x: last.a[0] + last.dx,
    y: last.a[1] + last.dy,
    tangentX: last.dx / last.length,
    tangentY: last.dy / last.length,
    segment: last.index,
    t: 1,
  };
}

/**
 * Resamples a polyline into points a fixed distance apart (the last step may be shorter; the
 * end point is always included).
 * @param {ArrayLike<ArrayLike<number>>} points
 * @param {number} spacing Metres between samples, greater than zero.
 * @param {boolean} [closed]
 * @returns {number[][]} New [x, y] pairs.
 */
export function resamplePolyline(points, spacing, closed = false) {
  const total = polylineLength(points, closed);
  const steps = Math.max(1, Math.ceil(total / spacing - 1e-9));
  const result = [];
  for (let i = 0; i <= steps; i += 1) {
    if (closed && i === steps) break;
    const sample = pointAlongPolyline(points, Math.min(total, i * spacing), closed);
    result.push([sample.x, sample.y]);
  }
  return result;
}

/**
 * Offsets a polyline sideways by a constant distance, joining the offset segments with mitres
 * (limited to four times the distance at sharp corners). Positive distances go to the left of
 * the direction of travel.
 * @param {ArrayLike<ArrayLike<number>>} points
 * @param {number} distance
 * @param {boolean} [closed]
 * @returns {number[][]}
 */
export function offsetPolyline(points, distance, closed = false) {
  const count = points.length;
  const result = [];
  for (let i = 0; i < count; i += 1) {
    const previous = points[closed ? (i - 1 + count) % count : Math.max(0, i - 1)];
    const next = points[closed ? (i + 1) % count : Math.min(count - 1, i + 1)];
    const here = points[i];
    let inX = here[0] - previous[0];
    let inY = here[1] - previous[1];
    let outX = next[0] - here[0];
    let outY = next[1] - here[1];
    const inLength = Math.hypot(inX, inY);
    const outLength = Math.hypot(outX, outY);
    if (inLength > 0) {
      inX /= inLength;
      inY /= inLength;
    } else {
      inX = outLength > 0 ? outX / outLength : 1;
      inY = outLength > 0 ? outY / outLength : 0;
    }
    if (outLength > 0) {
      outX /= outLength;
      outY /= outLength;
    } else {
      outX = inX;
      outY = inY;
    }
    // The mitre direction is the normalised sum of the two left normals.
    let normalX = -inY - outY;
    let normalY = inX + outX;
    const normalLength = Math.hypot(normalX, normalY);
    if (normalLength < 1e-9) {
      normalX = -inY;
      normalY = inX;
    } else {
      normalX /= normalLength;
      normalY /= normalLength;
    }
    const cosHalf = normalX * -inY + normalY * inX;
    const mitre = distance / Math.max(0.25, cosHalf);
    result.push([here[0] + normalX * mitre, here[1] + normalY * mitre]);
  }
  return result;
}

/**
 * Rotates the point (x, y) about the origin by an angle, counter-clockwise in the number plane.
 * @param {number} x
 * @param {number} y
 * @param {number} angle Radians.
 * @returns {[number, number]}
 */
export function rotatePoint(x, y, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [x * cos - y * sin, x * sin + y * cos];
}

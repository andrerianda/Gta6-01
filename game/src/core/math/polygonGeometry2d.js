// 2D polygons: area, winding, centroid, containment, convexity, offsetting, clipping and hulls.
// A polygon is an array of [x, y] pairs without a repeated closing point. "Counter-clockwise"
// is meant in the number plane (x right, y up); on the game's ground plane, where y stands for
// z (south), the same polygon looks clockwise from above. Nothing here depends on three.js.
//
//   const lot = ensureCounterClockwise(corners);
//   const buildable = offsetConvexPolygon(lot, -3);          // 3 m setback
//   if (pointInPolygon(x, z, district.outline)) ...

/**
 * The signed area of a polygon: positive when its points run counter-clockwise.
 * @param {ArrayLike<ArrayLike<number>>} points
 * @returns {number}
 */
export function polygonSignedArea(points) {
  let twice = 0;
  const count = points.length;
  for (let i = 0, j = count - 1; i < count; j = i, i += 1) {
    twice += points[j][0] * points[i][1] - points[i][0] * points[j][1];
  }
  return twice / 2;
}

/** The area of a polygon, whatever its winding. @param {ArrayLike<ArrayLike<number>>} points @returns {number} */
export function polygonArea(points) {
  return Math.abs(polygonSignedArea(points));
}

/**
 * The winding of a polygon: +1 counter-clockwise, -1 clockwise, 0 degenerate.
 * @param {ArrayLike<ArrayLike<number>>} points
 * @returns {number}
 */
export function polygonWinding(points) {
  return Math.sign(polygonSignedArea(points));
}

/**
 * A copy of the polygon with counter-clockwise winding (the input is not changed).
 * @param {ArrayLike<ArrayLike<number>>} points
 * @returns {number[][]}
 */
export function ensureCounterClockwise(points) {
  const copy = Array.from(points, (point) => [point[0], point[1]]);
  return polygonSignedArea(copy) < 0 ? copy.reverse() : copy;
}

/**
 * The perimeter of a polygon.
 * @param {ArrayLike<ArrayLike<number>>} points
 * @returns {number}
 */
export function polygonPerimeter(points) {
  let length = 0;
  const count = points.length;
  for (let i = 0, j = count - 1; i < count; j = i, i += 1) {
    length += Math.hypot(points[i][0] - points[j][0], points[i][1] - points[j][1]);
  }
  return length;
}

/**
 * The centroid (centre of area) of a polygon; for a degenerate polygon, the mean of its points.
 * @param {ArrayLike<ArrayLike<number>>} points
 * @returns {[number, number]}
 */
export function polygonCentroid(points) {
  const count = points.length;
  let twice = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = count - 1; i < count; j = i, i += 1) {
    const cross = points[j][0] * points[i][1] - points[i][0] * points[j][1];
    twice += cross;
    cx += (points[j][0] + points[i][0]) * cross;
    cy += (points[j][1] + points[i][1]) * cross;
  }
  if (Math.abs(twice) < 1e-12) {
    let sx = 0;
    let sy = 0;
    for (let i = 0; i < count; i += 1) {
      sx += points[i][0];
      sy += points[i][1];
    }
    return count > 0 ? [sx / count, sy / count] : [0, 0];
  }
  return [cx / (3 * twice), cy / (3 * twice)];
}

/**
 * Whether the point lies inside the polygon (even-odd rule; points exactly on an edge may fall
 * either way). Works for convex and concave polygons of either winding.
 * @param {number} px
 * @param {number} py
 * @param {ArrayLike<ArrayLike<number>>} points
 * @returns {boolean}
 */
export function pointInPolygon(px, py, points) {
  let inside = false;
  const count = points.length;
  for (let i = 0, j = count - 1; i < count; j = i, i += 1) {
    const xi = points[i][0];
    const yi = points[i][1];
    const xj = points[j][0];
    const yj = points[j][1];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Whether the polygon is convex (collinear points are allowed).
 * @param {ArrayLike<ArrayLike<number>>} points
 * @returns {boolean}
 */
export function isConvexPolygon(points) {
  const count = points.length;
  if (count < 3) return false;
  let sign = 0;
  for (let i = 0; i < count; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % count];
    const c = points[(i + 2) % count];
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(cross) < 1e-12) continue;
    const turn = cross > 0 ? 1 : -1;
    if (sign === 0) sign = turn;
    else if (turn !== sign) return false;
  }
  return true;
}

/**
 * The distance from a point to the nearest edge of a polygon, negative when the point is inside.
 * @param {number} px
 * @param {number} py
 * @param {ArrayLike<ArrayLike<number>>} points
 * @returns {number}
 */
export function signedDistanceToPolygon(px, py, points) {
  let best = Infinity;
  const count = points.length;
  for (let i = 0, j = count - 1; i < count; j = i, i += 1) {
    const ax = points[j][0];
    const ay = points[j][1];
    const dx = points[i][0] - ax;
    const dy = points[i][1] - ay;
    const lengthSquared = dx * dx + dy * dy;
    let t = lengthSquared > 0 ? ((px - ax) * dx + (py - ay) * dy) / lengthSquared : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ox = px - (ax + dx * t);
    const oy = py - (ay + dy * t);
    const squared = ox * ox + oy * oy;
    if (squared < best) best = squared;
  }
  const distance = Math.sqrt(best);
  return pointInPolygon(px, py, points) ? -distance : distance;
}

/**
 * Offsets a convex polygon: every edge moves by `distance` along its outward normal (positive
 * grows the polygon, negative shrinks it) and neighbouring edges are re-intersected. Edges that
 * vanish when shrinking are dropped; the result is empty when the polygon shrinks to nothing.
 * @param {ArrayLike<ArrayLike<number>>} points A convex polygon of either winding.
 * @param {number} distance Metres.
 * @returns {number[][]} A counter-clockwise polygon, possibly empty.
 */
export function offsetConvexPolygon(points, distance) {
  let polygon = ensureCounterClockwise(points);
  if (polygon.length < 3) return [];
  if (distance >= 0) {
    // Growing: intersect consecutive offset edge lines.
    const count = polygon.length;
    const result = [];
    for (let i = 0; i < count; i += 1) {
      const previous = polygon[(i - 1 + count) % count];
      const here = polygon[i];
      const next = polygon[(i + 1) % count];
      const inNormal = outwardNormal(previous, here);
      const outNormal = outwardNormal(here, next);
      const denominator = 1 + inNormal[0] * outNormal[0] + inNormal[1] * outNormal[1];
      if (denominator < 1e-9) {
        result.push([here[0] + inNormal[0] * distance, here[1] + inNormal[1] * distance]);
        continue;
      }
      result.push([
        here[0] + ((inNormal[0] + outNormal[0]) * distance) / denominator,
        here[1] + ((inNormal[1] + outNormal[1]) * distance) / denominator,
      ]);
    }
    return result;
  }
  // Shrinking: clip the polygon by each edge line moved inward, which handles vanishing edges.
  const original = polygon;
  const count = original.length;
  for (let i = 0; i < count && polygon.length >= 3; i += 1) {
    const a = original[i];
    const b = original[(i + 1) % count];
    const normal = outwardNormal(a, b);
    const ax = a[0] + normal[0] * distance;
    const ay = a[1] + normal[1] * distance;
    polygon = clipPolygonByLine(polygon, ax, ay, ax + (b[0] - a[0]), ay + (b[1] - a[1]));
  }
  return polygon.length >= 3 && polygonArea(polygon) > 1e-9 ? polygon : [];
}

/** The unit outward normal of edge A -> B of a counter-clockwise polygon. */
function outwardNormal(a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = Math.hypot(dx, dy) || 1;
  return [dy / length, -dx / length];
}

/**
 * Clips a polygon by a directed line, keeping the part on its left (Sutherland-Hodgman step).
 * Clipping a polygon by every edge of a counter-clockwise convex polygon intersects the two.
 * @param {ArrayLike<ArrayLike<number>>} points
 * @param {number} ax
 * @param {number} ay
 * @param {number} bx
 * @param {number} by
 * @returns {number[][]}
 */
export function clipPolygonByLine(points, ax, ay, bx, by) {
  const result = [];
  const count = points.length;
  const dx = bx - ax;
  const dy = by - ay;
  for (let i = 0; i < count; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % count];
    const currentSide = dx * (current[1] - ay) - dy * (current[0] - ax);
    const nextSide = dx * (next[1] - ay) - dy * (next[0] - ax);
    if (currentSide >= 0) result.push([current[0], current[1]]);
    if (currentSide >= 0 !== nextSide >= 0) {
      const t = currentSide / (currentSide - nextSide);
      result.push([current[0] + (next[0] - current[0]) * t, current[1] + (next[1] - current[1]) * t]);
    }
  }
  return result;
}

/**
 * The intersection of a polygon with a convex polygon.
 * @param {ArrayLike<ArrayLike<number>>} subject Any simple polygon.
 * @param {ArrayLike<ArrayLike<number>>} convexClip A convex polygon of either winding.
 * @returns {number[][]} Possibly empty.
 */
export function clipPolygonByConvex(subject, convexClip) {
  const clip = ensureCounterClockwise(convexClip);
  let result = Array.from(subject, (point) => [point[0], point[1]]);
  for (let i = 0; i < clip.length && result.length > 0; i += 1) {
    const a = clip[i];
    const b = clip[(i + 1) % clip.length];
    result = clipPolygonByLine(result, a[0], a[1], b[0], b[1]);
  }
  return result;
}

/**
 * The convex hull of a set of points (Andrew's monotone chain).
 * @param {ArrayLike<ArrayLike<number>>} points
 * @returns {number[][]} The hull, counter-clockwise, without collinear points.
 */
export function convexHull(points) {
  const sorted = Array.from(points, (point) => [point[0], point[1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (sorted.length < 3) return sorted;
  const turn = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const point of sorted) {
    while (lower.length >= 2 && turn(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop();
    lower.push(point);
  }
  const upper = [];
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const point = sorted[i];
    while (upper.length >= 2 && turn(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop();
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/**
 * Whether two convex polygons overlap (separating axis test; touching counts as overlapping).
 * @param {ArrayLike<ArrayLike<number>>} first
 * @param {ArrayLike<ArrayLike<number>>} second
 * @returns {boolean}
 */
export function convexPolygonsOverlap(first, second) {
  return !hasSeparatingAxis(first, second) && !hasSeparatingAxis(second, first);
}

function hasSeparatingAxis(edgesOf, other) {
  const count = edgesOf.length;
  for (let i = 0, j = count - 1; i < count; j = i, i += 1) {
    const axisX = edgesOf[i][1] - edgesOf[j][1];
    const axisY = edgesOf[j][0] - edgesOf[i][0];
    let minA = Infinity;
    let maxA = -Infinity;
    for (let k = 0; k < count; k += 1) {
      const projection = edgesOf[k][0] * axisX + edgesOf[k][1] * axisY;
      if (projection < minA) minA = projection;
      if (projection > maxA) maxA = projection;
    }
    let minB = Infinity;
    let maxB = -Infinity;
    for (let k = 0; k < other.length; k += 1) {
      const projection = other[k][0] * axisX + other[k][1] * axisY;
      if (projection < minB) minB = projection;
      if (projection > maxB) maxB = projection;
    }
    if (maxA < minB || maxB < minA) return true;
  }
  return false;
}

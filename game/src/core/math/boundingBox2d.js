// Axis-aligned bounding boxes in 2D: { minX, minY, maxX, maxY }. Used for broad-phase tests,
// sector lookups and culling on the ground plane (y stands for z there). An empty box has
// minX > maxX, so growing it by a first point works without a special case.
//
//   const bounds = boundsOfPoints(lot.outline);
//   if (boundsOverlap(bounds, sectorBounds)) ...

/**
 * @typedef {Object} Bounds2d
 * @property {number} minX
 * @property {number} minY
 * @property {number} maxX
 * @property {number} maxY
 */

/**
 * Creates a bounding box; without arguments, an empty one ready to be grown.
 * @param {number} [minX]
 * @param {number} [minY]
 * @param {number} [maxX]
 * @param {number} [maxY]
 * @returns {Bounds2d}
 */
export function createBounds(minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity) {
  return { minX, minY, maxX, maxY };
}

/**
 * The bounding box of a list of [x, y] points.
 * @param {ArrayLike<ArrayLike<number>>} points
 * @returns {Bounds2d}
 */
export function boundsOfPoints(points) {
  const bounds = createBounds();
  for (let i = 0; i < points.length; i += 1) growBoundsToPoint(bounds, points[i][0], points[i][1]);
  return bounds;
}

/**
 * The bounding box of a circle. @returns {Bounds2d}
 */
export function boundsOfCircle(x, y, radius) {
  return { minX: x - radius, minY: y - radius, maxX: x + radius, maxY: y + radius };
}

/** Whether the box is empty (was never grown). @param {Bounds2d} bounds @returns {boolean} */
export function boundsAreEmpty(bounds) {
  return bounds.minX > bounds.maxX || bounds.minY > bounds.maxY;
}

/**
 * Grows a box in place to include a point.
 * @param {Bounds2d} bounds
 * @param {number} x
 * @param {number} y
 * @returns {Bounds2d} The same object.
 */
export function growBoundsToPoint(bounds, x, y) {
  if (x < bounds.minX) bounds.minX = x;
  if (y < bounds.minY) bounds.minY = y;
  if (x > bounds.maxX) bounds.maxX = x;
  if (y > bounds.maxY) bounds.maxY = y;
  return bounds;
}

/**
 * Grows a box in place to include another box.
 * @param {Bounds2d} bounds
 * @param {Bounds2d} other
 * @returns {Bounds2d} The same object.
 */
export function growBoundsToBounds(bounds, other) {
  if (other.minX < bounds.minX) bounds.minX = other.minX;
  if (other.minY < bounds.minY) bounds.minY = other.minY;
  if (other.maxX > bounds.maxX) bounds.maxX = other.maxX;
  if (other.maxY > bounds.maxY) bounds.maxY = other.maxY;
  return bounds;
}

/**
 * A copy of the box grown by a margin on every side (negative margins shrink it).
 * @param {Bounds2d} bounds
 * @param {number} margin
 * @returns {Bounds2d}
 */
export function inflateBounds(bounds, margin) {
  return { minX: bounds.minX - margin, minY: bounds.minY - margin, maxX: bounds.maxX + margin, maxY: bounds.maxY + margin };
}

/** Whether the box contains the point (edges included). @returns {boolean} */
export function boundsContainPoint(bounds, x, y) {
  return x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY;
}

/** Whether the first box contains the whole of the second. @returns {boolean} */
export function boundsContainBounds(outer, inner) {
  return inner.minX >= outer.minX && inner.maxX <= outer.maxX && inner.minY >= outer.minY && inner.maxY <= outer.maxY;
}

/** Whether two boxes overlap (touching counts). @returns {boolean} */
export function boundsOverlap(a, b) {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

/**
 * The overlap of two boxes, or null when they are apart.
 * @param {Bounds2d} a
 * @param {Bounds2d} b
 * @returns {Bounds2d | null}
 */
export function intersectBounds(a, b) {
  const minX = Math.max(a.minX, b.minX);
  const minY = Math.max(a.minY, b.minY);
  const maxX = Math.min(a.maxX, b.maxX);
  const maxY = Math.min(a.maxY, b.maxY);
  return minX <= maxX && minY <= maxY ? { minX, minY, maxX, maxY } : null;
}

/** The centre of a box. @param {Bounds2d} bounds @returns {[number, number]} */
export function boundsCentre(bounds) {
  return [(bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2];
}

/** The width and height of a box. @param {Bounds2d} bounds @returns {[number, number]} */
export function boundsSize(bounds) {
  return [Math.max(0, bounds.maxX - bounds.minX), Math.max(0, bounds.maxY - bounds.minY)];
}

/**
 * The distance from a point to a box: zero inside.
 * @param {Bounds2d} bounds
 * @param {number} x
 * @param {number} y
 * @returns {number}
 */
export function distanceToBounds(bounds, x, y) {
  const dx = Math.max(bounds.minX - x, 0, x - bounds.maxX);
  const dy = Math.max(bounds.minY - y, 0, y - bounds.maxY);
  return Math.hypot(dx, dy);
}

/**
 * Whether a box overlaps a circle.
 * @param {Bounds2d} bounds
 * @param {number} x
 * @param {number} y
 * @param {number} radius
 * @returns {boolean}
 */
export function boundsOverlapCircle(bounds, x, y, radius) {
  return distanceToBounds(bounds, x, y) <= radius;
}

/**
 * Clips the segment AB to a box (Liang-Barsky).
 * @returns {{ax: number, ay: number, bx: number, by: number} | null} The part inside, or null.
 */
export function clipSegmentToBounds(bounds, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  let t0 = 0;
  let t1 = 1;
  const edges = [
    [-dx, ax - bounds.minX],
    [dx, bounds.maxX - ax],
    [-dy, ay - bounds.minY],
    [dy, bounds.maxY - ay],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return null;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return null;
      if (r < t1) t1 = r;
    }
  }
  return { ax: ax + dx * t0, ay: ay + dy * t0, bx: ax + dx * t1, by: ay + dy * t1 };
}

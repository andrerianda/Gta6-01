// Oriented rectangles on the ground plane: the footprint of a vehicle, a building, a parking bay
// or a road segment. A rectangle is a centre, a half length along its own forward axis, a half
// width across it, and the angle of the forward axis from +x (counter-clockwise in the number
// plane). Tests are exact (separating axes), allocation-free where it matters.
//
//   const car = createOrientedRectangle(x, z, 2.3, 0.95, heading);
//   if (orientedRectanglesOverlap(car, bay)) ...

/**
 * @typedef {Object} OrientedRectangle
 * @property {number} x Centre.
 * @property {number} y Centre.
 * @property {number} halfLength Half extent along the forward axis.
 * @property {number} halfWidth Half extent across it.
 * @property {number} angle Radians from +x to the forward axis.
 * @property {number} axisX Unit forward axis (cos angle).
 * @property {number} axisY Unit forward axis (sin angle).
 */

/**
 * Creates an oriented rectangle.
 * @param {number} x
 * @param {number} y
 * @param {number} halfLength
 * @param {number} halfWidth
 * @param {number} [angle]
 * @returns {OrientedRectangle}
 */
export function createOrientedRectangle(x, y, halfLength, halfWidth, angle = 0) {
  return { x, y, halfLength, halfWidth, angle, axisX: Math.cos(angle), axisY: Math.sin(angle) };
}

/**
 * The rectangle that covers a segment from A to B with a given total width (a road or lane piece).
 * @returns {OrientedRectangle}
 */
export function orientedRectangleFromSegment(ax, ay, bx, by, width) {
  const dx = bx - ax;
  const dy = by - ay;
  return createOrientedRectangle((ax + bx) / 2, (ay + by) / 2, Math.hypot(dx, dy) / 2, width / 2, Math.atan2(dy, dx));
}

/**
 * Moves or turns a rectangle in place (keeps the cached axis in step with the angle).
 * @param {OrientedRectangle} rectangle
 * @param {number} x
 * @param {number} y
 * @param {number} angle
 * @returns {OrientedRectangle} The same object.
 */
export function setOrientedRectangle(rectangle, x, y, angle) {
  rectangle.x = x;
  rectangle.y = y;
  rectangle.angle = angle;
  rectangle.axisX = Math.cos(angle);
  rectangle.axisY = Math.sin(angle);
  return rectangle;
}

/**
 * The four corners, counter-clockwise, starting at the front left: front-left, back-left,
 * back-right, front-right (left is counter-clockwise from forward).
 * @param {OrientedRectangle} rectangle
 * @returns {number[][]}
 */
export function orientedRectangleCorners(rectangle) {
  const { x, y, halfLength, halfWidth, axisX, axisY } = rectangle;
  const fx = axisX * halfLength;
  const fy = axisY * halfLength;
  const lx = -axisY * halfWidth;
  const ly = axisX * halfWidth;
  return [
    [x + fx + lx, y + fy + ly],
    [x - fx + lx, y - fy + ly],
    [x - fx - lx, y - fy - ly],
    [x + fx - lx, y + fy - ly],
  ];
}

/**
 * Converts a point to the rectangle's own frame: [along the forward axis, to the left].
 * @param {OrientedRectangle} rectangle
 * @param {number} px
 * @param {number} py
 * @returns {[number, number]}
 */
export function toRectangleFrame(rectangle, px, py) {
  const dx = px - rectangle.x;
  const dy = py - rectangle.y;
  return [dx * rectangle.axisX + dy * rectangle.axisY, -dx * rectangle.axisY + dy * rectangle.axisX];
}

/**
 * Whether the rectangle contains the point (edges included), optionally grown by a margin.
 * @param {OrientedRectangle} rectangle
 * @param {number} px
 * @param {number} py
 * @param {number} [margin]
 * @returns {boolean}
 */
export function orientedRectangleContains(rectangle, px, py, margin = 0) {
  const dx = px - rectangle.x;
  const dy = py - rectangle.y;
  const along = dx * rectangle.axisX + dy * rectangle.axisY;
  const across = -dx * rectangle.axisY + dy * rectangle.axisX;
  return Math.abs(along) <= rectangle.halfLength + margin && Math.abs(across) <= rectangle.halfWidth + margin;
}

/**
 * The distance from a point to the rectangle: zero inside, otherwise the distance to its edge.
 * @param {OrientedRectangle} rectangle
 * @param {number} px
 * @param {number} py
 * @returns {number}
 */
export function distanceToOrientedRectangle(rectangle, px, py) {
  const dx = px - rectangle.x;
  const dy = py - rectangle.y;
  const along = Math.abs(dx * rectangle.axisX + dy * rectangle.axisY) - rectangle.halfLength;
  const across = Math.abs(-dx * rectangle.axisY + dy * rectangle.axisX) - rectangle.halfWidth;
  return Math.hypot(Math.max(0, along), Math.max(0, across));
}

/**
 * Whether two oriented rectangles overlap (separating axis test on their four axes).
 * @param {OrientedRectangle} a
 * @param {OrientedRectangle} b
 * @returns {boolean}
 */
export function orientedRectanglesOverlap(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  // Cosine and sine of the angle between the two forward axes.
  const cos = a.axisX * b.axisX + a.axisY * b.axisY;
  const sin = a.axisX * b.axisY - a.axisY * b.axisX;
  const absCos = Math.abs(cos);
  const absSin = Math.abs(sin);
  // Axes of a: forward, then left.
  if (Math.abs(dx * a.axisX + dy * a.axisY) > a.halfLength + b.halfLength * absCos + b.halfWidth * absSin) return false;
  if (Math.abs(-dx * a.axisY + dy * a.axisX) > a.halfWidth + b.halfLength * absSin + b.halfWidth * absCos) return false;
  // Axes of b.
  if (Math.abs(dx * b.axisX + dy * b.axisY) > b.halfLength + a.halfLength * absCos + a.halfWidth * absSin) return false;
  if (Math.abs(-dx * b.axisY + dy * b.axisX) > b.halfWidth + a.halfLength * absSin + a.halfWidth * absCos) return false;
  return true;
}

/**
 * Whether an oriented rectangle overlaps a circle.
 * @param {OrientedRectangle} rectangle
 * @param {number} cx
 * @param {number} cy
 * @param {number} radius
 * @returns {boolean}
 */
export function orientedRectangleOverlapsCircle(rectangle, cx, cy, radius) {
  return distanceToOrientedRectangle(rectangle, cx, cy) <= radius;
}

/**
 * The axis-aligned bounding box of an oriented rectangle.
 * @param {OrientedRectangle} rectangle
 * @returns {{minX: number, minY: number, maxX: number, maxY: number}}
 */
export function orientedRectangleBounds(rectangle) {
  const extentX = Math.abs(rectangle.axisX) * rectangle.halfLength + Math.abs(rectangle.axisY) * rectangle.halfWidth;
  const extentY = Math.abs(rectangle.axisY) * rectangle.halfLength + Math.abs(rectangle.axisX) * rectangle.halfWidth;
  return { minX: rectangle.x - extentX, minY: rectangle.y - extentY, maxX: rectangle.x + extentX, maxY: rectangle.y + extentY };
}

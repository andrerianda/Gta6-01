// Maps the live call screen (a flat DOM rectangle) onto the screen of the rendered handset: the
// four corners the Blender script printed (art/build_phone.py) give a homography, written as a
// CSS matrix3d for an element whose transform-origin is its top left corner. Pure maths.
//
//   element.style.transform = screenQuadTransform(SCREEN_SIZE.width, SCREEN_SIZE.height, PHONE_PICTURE.corners);

/**
 * The rendered handset: the picture's size and its screen's corners in picture pixels (top left,
 * top right, bottom right, bottom left), as printed by `art/build_phone.py`.
 */
export const PHONE_PICTURE = Object.freeze({
  width: 304,
  height: 560,
  corners: Object.freeze([[43.39, 50.84], [250.76, 29.19], [265.0, 528.93], [34.89, 525.08]]),
});

/** The live screen's own layout size in CSS pixels (the handset's 66 x 146 mm lit area). */
export const SCREEN_SIZE = Object.freeze({ width: 264, height: 584 });

/**
 * The homography that takes the rectangle (0,0)-(width,height) to a quadrilateral.
 * @param {number} width
 * @param {number} height
 * @param {readonly (readonly number[])[]} corners Top left, top right, bottom right, bottom left.
 * @returns {number[]} [a, b, c, d, e, f, g, h]: x' = (a x + b y + c) / (g x + h y + 1),
 *   y' = (d x + e y + f) / (g x + h y + 1).
 */
export function quadHomography(width, height, corners) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = corners;
  // The unit square to the quadrilateral (Heckbert), then the rectangle to the unit square.
  const dx1 = x1 - x2;
  const dx2 = x3 - x2;
  const dy1 = y1 - y2;
  const dy2 = y3 - y2;
  const sx = x0 - x1 + x2 - x3;
  const sy = y0 - y1 + y2 - y3;
  const denominator = dx1 * dy2 - dx2 * dy1;
  const g = denominator === 0 ? 0 : (sx * dy2 - dx2 * sy) / denominator;
  const h = denominator === 0 ? 0 : (dx1 * sy - sx * dy1) / denominator;
  const a = x1 - x0 + g * x1;
  const b = x3 - x0 + h * x3;
  const d = y1 - y0 + g * y1;
  const e = y3 - y0 + h * y3;
  return [a / width, b / height, x0, d / width, e / height, y0, g / width, h / height];
}

/**
 * Applies a homography to a point.
 * @param {readonly number[]} m From quadHomography.
 * @param {number} x
 * @param {number} y
 * @returns {[number, number]}
 */
export function projectPoint(m, x, y) {
  const w = m[6] * x + m[7] * y + 1;
  return [(m[0] * x + m[1] * y + m[2]) / w, (m[3] * x + m[4] * y + m[5]) / w];
}

/**
 * The CSS transform that lays a width x height element (transform-origin 0 0, placed at the
 * picture's top left) onto the quadrilateral.
 * @param {number} width
 * @param {number} height
 * @param {readonly (readonly number[])[]} corners
 * @returns {string} `matrix3d(...)`, column-major as CSS wants it.
 */
export function screenQuadTransform(width, height, corners) {
  const [a, b, c, d, e, f, g, h] = quadHomography(width, height, corners);
  const values = [a, d, 0, g, b, e, 0, h, 0, 0, 1, 0, c, f, 0, 1];
  return `matrix3d(${values.map((v) => Number(v.toFixed(7))).join(',')})`;
}

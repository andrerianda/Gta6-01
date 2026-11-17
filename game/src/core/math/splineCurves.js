// Spline helpers: Catmull-Rom splines through points and cubic Bezier curves, with tangents and
// arc-length parameterisation, for roads, rails, camera paths and animation. Points are plain
// arrays of any dimension ([x, y] or [x, y, z]); nothing here depends on three.js.
//
//   const path = createCatmullRomPath(roadCentreLine, { closed: false });
//   const { point, tangent } = path.sampleAtDistance(120);   // 120 m from the start, unit tangent
//   const stations = path.toPolyline(4);                      // points every 4 m of arc length

/**
 * Builds an arc-length parameterised Catmull-Rom path through a list of points.
 * @param {ArrayLike<ArrayLike<number>>} points At least two points of equal dimension.
 * @param {Object} [options]
 * @param {boolean} [options.closed] Whether the path returns to its first point.
 * @param {number} [options.tension] 0.5 is the classic Catmull-Rom; 0 gives straight corners.
 * @param {number} [options.samplesPerSegment] Resolution of the arc-length table (default 16).
 * @returns {{
 *   length: number, closed: boolean, segmentCount: number,
 *   pointAt: (u: number, out?: number[]) => number[],
 *   tangentAt: (u: number, out?: number[]) => number[],
 *   parameterAtDistance: (distance: number) => number,
 *   sampleAtDistance: (distance: number) => {point: number[], tangent: number[], u: number},
 *   toPolyline: (spacing: number) => number[][],
 * }} `u` runs 0..1 over the whole path (not uniform in distance); distances are in the units of
 *   the points.
 */
export function createCatmullRomPath(points, options = {}) {
  const closed = options.closed === true;
  const tension = options.tension ?? 0.5;
  const count = points.length;
  const segmentCount = closed ? count : count - 1;
  const controlAt = (index) => {
    if (closed) return points[((index % count) + count) % count];
    return points[index < 0 ? 0 : index >= count ? count - 1 : index];
  };
  const locate = (u) => {
    const scaled = (closed ? u - Math.floor(u) : u < 0 ? 0 : u > 1 ? 1 : u) * segmentCount;
    let segment = Math.floor(scaled);
    if (segment >= segmentCount) segment = segmentCount - 1;
    return [segment, scaled - segment];
  };
  const pointAt = (u, out = []) => {
    const [segment, t] = locate(u);
    return catmullRomPoint(controlAt(segment - 1), controlAt(segment), controlAt(segment + 1), controlAt(segment + 2), t, tension, out);
  };
  const tangentAt = (u, out = []) => {
    const [segment, t] = locate(u);
    const tangent = catmullRomDerivative(controlAt(segment - 1), controlAt(segment), controlAt(segment + 1), controlAt(segment + 2), t, tension, out);
    return normaliseVector(tangent);
  };
  const table = createArcLengthTable(pointAt, Math.max(2, segmentCount * (options.samplesPerSegment ?? 16)));
  const parameterAtDistance = (distance) => {
    if (closed && table.length > 0) return table.parameterAt(((distance % table.length) + table.length) % table.length);
    return table.parameterAt(distance);
  };
  return {
    length: table.length,
    closed,
    segmentCount,
    pointAt,
    tangentAt,
    parameterAtDistance,
    sampleAtDistance: (distance) => {
      const u = parameterAtDistance(distance);
      return { point: pointAt(u), tangent: tangentAt(u), u };
    },
    toPolyline: (spacing) => {
      const steps = Math.max(1, Math.round(table.length / spacing));
      const result = [];
      for (let i = 0; i <= steps; i += 1) {
        if (closed && i === steps) break;
        result.push(pointAt(table.parameterAt((table.length * i) / steps)));
      }
      return result;
    },
  };
}

/**
 * A point on one Catmull-Rom segment, between p1 (t = 0) and p2 (t = 1).
 * @param {ArrayLike<number>} p0 The point before the segment.
 * @param {ArrayLike<number>} p1
 * @param {ArrayLike<number>} p2
 * @param {ArrayLike<number>} p3 The point after the segment.
 * @param {number} t 0..1
 * @param {number} [tension]
 * @param {number[]} [out]
 * @returns {number[]}
 */
export function catmullRomPoint(p0, p1, p2, p3, t, tension = 0.5, out = []) {
  const t2 = t * t;
  const t3 = t2 * t;
  for (let i = 0; i < p1.length; i += 1) {
    const m1 = tension * (p2[i] - p0[i]);
    const m2 = tension * (p3[i] - p1[i]);
    out[i] = (2 * t3 - 3 * t2 + 1) * p1[i] + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * p2[i] + (t3 - t2) * m2;
  }
  out.length = p1.length;
  return out;
}

/**
 * The derivative (not normalised) of a Catmull-Rom segment with respect to t.
 * @returns {number[]}
 */
export function catmullRomDerivative(p0, p1, p2, p3, t, tension = 0.5, out = []) {
  const t2 = t * t;
  for (let i = 0; i < p1.length; i += 1) {
    const m1 = tension * (p2[i] - p0[i]);
    const m2 = tension * (p3[i] - p1[i]);
    out[i] = (6 * t2 - 6 * t) * p1[i] + (3 * t2 - 4 * t + 1) * m1 + (-6 * t2 + 6 * t) * p2[i] + (3 * t2 - 2 * t) * m2;
  }
  out.length = p1.length;
  return out;
}

/**
 * A point on a cubic Bezier curve with end points p0, p3 and control points p1, p2.
 * @param {ArrayLike<number>} p0
 * @param {ArrayLike<number>} p1
 * @param {ArrayLike<number>} p2
 * @param {ArrayLike<number>} p3
 * @param {number} t 0..1
 * @param {number[]} [out]
 * @returns {number[]}
 */
export function cubicBezierPoint(p0, p1, p2, p3, t, out = []) {
  const s = 1 - t;
  const a = s * s * s;
  const b = 3 * s * s * t;
  const c = 3 * s * t * t;
  const d = t * t * t;
  for (let i = 0; i < p0.length; i += 1) out[i] = a * p0[i] + b * p1[i] + c * p2[i] + d * p3[i];
  out.length = p0.length;
  return out;
}

/**
 * The derivative (not normalised) of a cubic Bezier curve with respect to t.
 * @returns {number[]}
 */
export function cubicBezierDerivative(p0, p1, p2, p3, t, out = []) {
  const s = 1 - t;
  const a = 3 * s * s;
  const b = 6 * s * t;
  const c = 3 * t * t;
  for (let i = 0; i < p0.length; i += 1) {
    out[i] = a * (p1[i] - p0[i]) + b * (p2[i] - p1[i]) + c * (p3[i] - p2[i]);
  }
  out.length = p0.length;
  return out;
}

/**
 * An arc-length parameterised cubic Bezier curve.
 * @param {ArrayLike<number>} p0
 * @param {ArrayLike<number>} p1
 * @param {ArrayLike<number>} p2
 * @param {ArrayLike<number>} p3
 * @param {number} [samples] Resolution of the arc-length table.
 * @returns {{length: number, pointAt: (t: number, out?: number[]) => number[],
 *   tangentAt: (t: number, out?: number[]) => number[],
 *   sampleAtDistance: (distance: number) => {point: number[], tangent: number[], t: number},
 *   toPolyline: (spacing: number) => number[][]}}
 */
export function createCubicBezierPath(p0, p1, p2, p3, samples = 32) {
  const pointAt = (t, out = []) => cubicBezierPoint(p0, p1, p2, p3, t, out);
  const tangentAt = (t, out = []) => normaliseVector(cubicBezierDerivative(p0, p1, p2, p3, t, out));
  const table = createArcLengthTable(pointAt, samples);
  return {
    length: table.length,
    pointAt,
    tangentAt,
    sampleAtDistance: (distance) => {
      const t = table.parameterAt(distance);
      return { point: pointAt(t), tangent: tangentAt(t), t };
    },
    toPolyline: (spacing) => {
      const steps = Math.max(1, Math.round(table.length / spacing));
      const result = [];
      for (let i = 0; i <= steps; i += 1) result.push(pointAt(table.parameterAt((table.length * i) / steps)));
      return result;
    },
  };
}

/**
 * Measures a parametric curve and inverts the measurement: given a distance along the curve,
 * finds the parameter there. The curve is sampled at `samples` equal parameter steps.
 * @param {(u: number, out?: number[]) => number[]} evaluate The curve, for u in 0..1.
 * @param {number} [samples]
 * @returns {{length: number, distances: Float64Array, parameterAt: (distance: number) => number,
 *   distanceAt: (u: number) => number}}
 */
export function createArcLengthTable(evaluate, samples = 64) {
  const distances = new Float64Array(samples + 1);
  let previous = evaluate(0, []);
  let current = [];
  for (let i = 1; i <= samples; i += 1) {
    current = evaluate(i / samples, current);
    let squared = 0;
    for (let k = 0; k < current.length; k += 1) squared += (current[k] - previous[k]) * (current[k] - previous[k]);
    distances[i] = distances[i - 1] + Math.sqrt(squared);
    const held = previous;
    previous = current;
    current = held;
  }
  const length = distances[samples];
  return {
    length,
    distances,
    parameterAt: (distance) => {
      if (distance <= 0 || length <= 0) return 0;
      if (distance >= length) return 1;
      // Binary search for the table interval that holds the distance.
      let low = 0;
      let high = samples;
      while (high - low > 1) {
        const middle = (low + high) >> 1;
        if (distances[middle] <= distance) low = middle;
        else high = middle;
      }
      const span = distances[high] - distances[low];
      const within = span > 0 ? (distance - distances[low]) / span : 0;
      return (low + within) / samples;
    },
    distanceAt: (u) => {
      const scaled = (u < 0 ? 0 : u > 1 ? 1 : u) * samples;
      const low = Math.min(samples - 1, Math.floor(scaled));
      return distances[low] + (distances[low + 1] - distances[low]) * (scaled - low);
    },
  };
}

/**
 * Scales a vector to unit length in place (a zero vector becomes the first unit axis).
 * @param {number[]} vector
 * @returns {number[]} The same array.
 */
export function normaliseVector(vector) {
  let squared = 0;
  for (let i = 0; i < vector.length; i += 1) squared += vector[i] * vector[i];
  if (squared <= 0) {
    vector.fill(0);
    if (vector.length > 0) vector[0] = 1;
    return vector;
  }
  const scale = 1 / Math.sqrt(squared);
  for (let i = 0; i < vector.length; i += 1) vector[i] *= scale;
  return vector;
}

// Scalar helpers used everywhere in MARAZUL: clamping, interpolation, remapping, smooth steps,
// frame-rate independent damping, wrapping and angle arithmetic. Plain numbers in, plain numbers
// out; angles are radians.
//
//   speed = damp(speed, targetSpeed, 4, dt);               // same feel at 30 and 144 fps
//   heading += shortestAngleDifference(heading, wanted) * 0.2;
//   const fog = remapClamped(distance, 200, 900, 0, 1);

/**
 * Limits a value to the range [min, max].
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

/** Limits a value to [0, 1]. @param {number} value @returns {number} */
export function clamp01(value) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * Linear interpolation: `from` at t = 0, `to` at t = 1 (t is not clamped).
 * @param {number} from
 * @param {number} to
 * @param {number} t
 * @returns {number}
 */
export function lerp(from, to, t) {
  return from + (to - from) * t;
}

/**
 * The inverse of lerp: where `value` lies between `from` and `to` (0 at from, 1 at to, not
 * clamped). Returns 0 when the range is empty.
 * @param {number} from
 * @param {number} to
 * @param {number} value
 * @returns {number}
 */
export function inverseLerp(from, to, value) {
  return from === to ? 0 : (value - from) / (to - from);
}

/**
 * Maps a value from the range [inMin, inMax] to [outMin, outMax] without clamping.
 * @param {number} value
 * @param {number} inMin
 * @param {number} inMax
 * @param {number} outMin
 * @param {number} outMax
 * @returns {number}
 */
export function remap(value, inMin, inMax, outMin, outMax) {
  return outMin + (outMax - outMin) * inverseLerp(inMin, inMax, value);
}

/**
 * Maps a value from [inMin, inMax] to [outMin, outMax] and clamps the result to the output range.
 * @param {number} value
 * @param {number} inMin
 * @param {number} inMax
 * @param {number} outMin
 * @param {number} outMax
 * @returns {number}
 */
export function remapClamped(value, inMin, inMax, outMin, outMax) {
  return outMin + (outMax - outMin) * clamp01(inverseLerp(inMin, inMax, value));
}

/**
 * Hermite smooth step: 0 below edge0, 1 above edge1, with zero slope at both ends. The edges may
 * be given in descending order for a falling step.
 * @param {number} edge0
 * @param {number} edge1
 * @param {number} value
 * @returns {number}
 */
export function smoothstep(edge0, edge1, value) {
  const t = clamp01(inverseLerp(edge0, edge1, value));
  return t * t * (3 - 2 * t);
}

/**
 * Perlin's smoother step: like smoothstep with zero first and second derivatives at the ends.
 * @param {number} edge0
 * @param {number} edge1
 * @param {number} value
 * @returns {number}
 */
export function smootherstep(edge0, edge1, value) {
  const t = clamp01(inverseLerp(edge0, edge1, value));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * Frame-rate independent exponential damping: moves `current` toward `target` so that the
 * remaining distance shrinks by the factor e^(-rate * dt). A rate of 4 closes about 98 percent
 * of the gap in one second, whatever the frame rate.
 * @param {number} current
 * @param {number} target
 * @param {number} rate Per second; larger is snappier.
 * @param {number} dt Seconds since the last update.
 * @returns {number}
 */
export function damp(current, target, rate, dt) {
  return target + (current - target) * Math.exp(-rate * dt);
}

/**
 * The interpolation factor that damp() applies for a rate and a time step, for use with any
 * lerp (vectors, colours): `position.lerp(goal, dampFactor(6, dt))`.
 * @param {number} rate
 * @param {number} dt
 * @returns {number} A factor in [0, 1).
 */
export function dampFactor(rate, dt) {
  return 1 - Math.exp(-rate * dt);
}

/**
 * Damps an angle toward a target angle along the shortest way round.
 * @param {number} current Radians.
 * @param {number} target Radians.
 * @param {number} rate
 * @param {number} dt
 * @returns {number} Radians, not wrapped.
 */
export function dampAngle(current, target, rate, dt) {
  return current + shortestAngleDifference(current, target) * dampFactor(rate, dt);
}

/**
 * Moves `current` toward `target` by at most `maxStep` and never past it.
 * @param {number} current
 * @param {number} target
 * @param {number} maxStep A non-negative step, typically speed * dt.
 * @returns {number}
 */
export function approach(current, target, maxStep) {
  const difference = target - current;
  if (Math.abs(difference) <= maxStep) return target;
  return current + Math.sign(difference) * maxStep;
}

/**
 * Turns `current` toward `target` by at most `maxStep` radians along the shortest way round.
 * @param {number} current
 * @param {number} target
 * @param {number} maxStep
 * @returns {number} Radians, not wrapped.
 */
export function approachAngle(current, target, maxStep) {
  const difference = shortestAngleDifference(current, target);
  if (Math.abs(difference) <= maxStep) return current + difference;
  return current + Math.sign(difference) * maxStep;
}

/**
 * Wraps a value into the half-open range [min, max): wrap(370, 0, 360) is 10, wrap(-1, 0, 4) is 3.
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function wrap(value, min, max) {
  const span = max - min;
  if (!(span > 0)) return min;
  const offset = (value - min) % span;
  return min + (offset < 0 ? offset + span : offset);
}

/** Wraps an angle into [-pi, pi). @param {number} angle @returns {number} */
export function wrapAngle(angle) {
  return wrap(angle, -Math.PI, Math.PI);
}

/**
 * The signed smallest turn that takes the angle `from` to the angle `to`, in [-pi, pi).
 * @param {number} from Radians.
 * @param {number} to Radians.
 * @returns {number}
 */
export function shortestAngleDifference(from, to) {
  return wrap(to - from, -Math.PI, Math.PI);
}

/**
 * Interpolates between two angles along the shortest way round.
 * @param {number} from
 * @param {number} to
 * @param {number} t
 * @returns {number} Radians, not wrapped.
 */
export function lerpAngle(from, to, t) {
  return from + shortestAngleDifference(from, to) * t;
}

/**
 * A triangle wave that runs 0 -> length -> 0 as the value grows, for back-and-forth motion.
 * @param {number} value
 * @param {number} length
 * @returns {number}
 */
export function pingPong(value, length) {
  const phase = wrap(value, 0, length * 2);
  return phase <= length ? phase : length * 2 - phase;
}

/**
 * Rounds to the nearest multiple of `step` (snapToStep(7.3, 0.5) is 7.5).
 * @param {number} value
 * @param {number} step
 * @returns {number}
 */
export function snapToStep(value, step) {
  return step > 0 ? Math.round(value / step) * step : value;
}

/**
 * Whether two numbers differ by at most `tolerance`.
 * @param {number} a
 * @param {number} b
 * @param {number} [tolerance]
 * @returns {boolean}
 */
export function nearlyEqual(a, b, tolerance = 1e-6) {
  return Math.abs(a - b) <= tolerance;
}

/** Degrees to radians. @param {number} degrees @returns {number} */
export function toRadians(degrees) {
  return degrees * 0.017453292519943295;
}

/** Radians to degrees. @param {number} radians @returns {number} */
export function toDegrees(radians) {
  return radians * 57.29577951308232;
}

/**
 * A value that reaches 1 over `attack`, holds, and falls back to 0 over `release` at the end of
 * the range [0, duration]: the envelope of a fade, a blink or a camera move.
 * @param {number} time
 * @param {number} duration
 * @param {number} attack
 * @param {number} release
 * @returns {number} 0..1
 */
export function fadeInOut(time, duration, attack, release) {
  if (time <= 0 || time >= duration) return 0;
  const rise = attack > 0 ? clamp01(time / attack) : 1;
  const fall = release > 0 ? clamp01((duration - time) / release) : 1;
  return Math.min(rise, fall);
}

/**
 * The mean and standard deviation of a list of numbers (used by tools and tuning code).
 * @param {ArrayLike<number>} values
 * @returns {{mean: number, deviation: number, min: number, max: number}}
 */
export function summarise(values) {
  const count = values.length;
  if (count === 0) return { mean: 0, deviation: 0, min: 0, max: 0 };
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < count; i += 1) {
    const value = values[i];
    sum += value;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  const mean = sum / count;
  let squares = 0;
  for (let i = 0; i < count; i += 1) squares += (values[i] - mean) * (values[i] - mean);
  return { mean, deviation: Math.sqrt(squares / count), min, max };
}

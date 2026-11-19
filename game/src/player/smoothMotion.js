// Frame-rate independent smoothing for the player and the camera: exponential approach, a
// critically damped spring with its own velocity, angle wrapping and approach along the short
// way round, and a speed that changes at a limited rate. The same result at 30, 60 or 144
// frames per second is what keeps the camera free of jitter and the lead free of popping.

/**
 * The share of the remaining distance an exponential approach covers in one step.
 * @param {number} rate How fast, per second (about 1 / time constant).
 * @param {number} deltaSeconds The step.
 * @returns {number} 0..1.
 */
export function approachFactor(rate, deltaSeconds) {
  return 1 - Math.exp(-rate * deltaSeconds);
}

/**
 * Moves a value toward a target by an exponential approach.
 * @param {number} value
 * @param {number} target
 * @param {number} rate Per second.
 * @param {number} deltaSeconds
 * @returns {number}
 */
export function approach(value, target, rate, deltaSeconds) {
  return value + (target - value) * approachFactor(rate, deltaSeconds);
}

/**
 * Wraps an angle into -PI..PI.
 * @param {number} angle Radians.
 * @returns {number}
 */
export function wrapAngle(angle) {
  const turn = Math.PI * 2;
  let a = angle % turn;
  if (a > Math.PI) a -= turn;
  else if (a < -Math.PI) a += turn;
  return a;
}

/**
 * Moves an angle toward a target the short way round by an exponential approach, at most
 * `maxRate` radians per second.
 * @param {number} angle
 * @param {number} target
 * @param {number} rate Per second.
 * @param {number} deltaSeconds
 * @param {number} [maxRate] Radians per second.
 * @returns {number}
 */
export function approachAngle(angle, target, rate, deltaSeconds, maxRate = Infinity) {
  const difference = wrapAngle(target - angle);
  let step = difference * approachFactor(rate, deltaSeconds);
  const limit = maxRate * deltaSeconds;
  if (step > limit) step = limit;
  else if (step < -limit) step = -limit;
  return wrapAngle(angle + step);
}

/**
 * Blends two angles the short way round.
 * @param {number} from
 * @param {number} to
 * @param {number} t 0..1.
 * @returns {number}
 */
export function lerpAngle(from, to, t) {
  return wrapAngle(from + wrapAngle(to - from) * t);
}

/**
 * Moves a value toward a target at a limited rate (a speed that accelerates and brakes).
 * @param {number} value
 * @param {number} target
 * @param {number} rise Largest increase per second.
 * @param {number} fall Largest decrease per second.
 * @param {number} deltaSeconds
 * @returns {number}
 */
export function moveToward(value, target, rise, fall, deltaSeconds) {
  if (target > value) return Math.min(target, value + rise * deltaSeconds);
  return Math.max(target, value - fall * deltaSeconds);
}

/**
 * A critically damped spring (no overshoot) for one value: `state.value` follows `target` and
 * `state.velocity` carries the motion between frames, so a moving target is followed smoothly
 * with a steady lag of about `smoothTime` seconds.
 * @param {{value: number, velocity: number}} state Updated in place.
 * @param {number} target
 * @param {number} smoothTime Seconds (larger lags more).
 * @param {number} deltaSeconds
 * @returns {number} The new value.
 */
export function springToward(state, target, smoothTime, deltaSeconds) {
  const omega = 2 / Math.max(1e-4, smoothTime);
  const x = omega * deltaSeconds;
  const decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = state.value - target;
  const temp = (state.velocity + omega * change) * deltaSeconds;
  state.velocity = (state.velocity - omega * temp) * decay;
  state.value = target + (change + temp) * decay;
  return state.value;
}

/**
 * Creates the state of a spring that follows a point in three dimensions.
 * @returns {{x: {value: number, velocity: number}, y: {value: number, velocity: number}, z: {value: number, velocity: number}}}
 */
export function createPointSpring() {
  return { x: { value: 0, velocity: 0 }, y: { value: 0, velocity: 0 }, z: { value: 0, velocity: 0 } };
}

/**
 * Puts a point spring at rest on a point (a camera cut).
 * @param {ReturnType<typeof createPointSpring>} spring
 * @param {{x: number, y: number, z: number}} point
 */
export function resetPointSpring(spring, point) {
  spring.x.value = point.x; spring.y.value = point.y; spring.z.value = point.z;
  spring.x.velocity = spring.y.velocity = spring.z.velocity = 0;
}

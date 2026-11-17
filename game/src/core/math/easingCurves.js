// Easing curves: functions that map a progress t in [0, 1] to an eased progress, 0 at 0 and 1 at
// 1. Used for camera moves, interface animation, doors, fades and anything else that should not
// move like a robot.
//
//   const k = EASING.outCubic(elapsed / duration);
//   door.rotation.y = lerp(closedAngle, openAngle, k);

/**
 * The named easing curves. `in` starts slowly, `out` ends slowly, `inOut` does both.
 * @type {Readonly<Record<string, (t: number) => number>>}
 */
export const EASING = Object.freeze({
  linear: (t) => t,

  inQuad: (t) => t * t,
  outQuad: (t) => t * (2 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t)),

  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - (1 - t) * (1 - t) * (1 - t),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - 4 * (1 - t) * (1 - t) * (1 - t)),

  inQuart: (t) => t * t * t * t,
  outQuart: (t) => 1 - (1 - t) ** 4,
  inOutQuart: (t) => (t < 0.5 ? 8 * t ** 4 : 1 - 8 * (1 - t) ** 4),

  inSine: (t) => 1 - Math.cos((t * Math.PI) / 2),
  outSine: (t) => Math.sin((t * Math.PI) / 2),
  inOutSine: (t) => 0.5 - 0.5 * Math.cos(t * Math.PI),

  inExpo: (t) => (t <= 0 ? 0 : 2 ** (10 * t - 10)),
  outExpo: (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t)),
  inOutExpo: (t) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return t < 0.5 ? 2 ** (20 * t - 10) / 2 : (2 - 2 ** (-20 * t + 10)) / 2;
  },

  inCirc: (t) => 1 - Math.sqrt(1 - t * t),
  outCirc: (t) => Math.sqrt(1 - (t - 1) * (t - 1)),

  /** Pulls back a little before moving forward. */
  inBack: (t) => t * t * (2.70158 * t - 1.70158),
  /** Overshoots the end a little and settles. */
  outBack: (t) => 1 + (t - 1) * (t - 1) * (2.70158 * (t - 1) + 1.70158),

  /** A spring that overshoots and rings before settling. */
  outElastic: (t) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return 2 ** (-10 * t) * Math.sin(((t * 10 - 0.75) * 2 * Math.PI) / 3) + 1;
  },

  /** A dropped ball: three diminishing bounces at the end. */
  outBounce: (t) => {
    const n = 7.5625;
    const d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t - 1.5 / d) * (t - 1.5 / d) + 0.75;
    if (t < 2.5 / d) return n * (t - 2.25 / d) * (t - 2.25 / d) + 0.9375;
    return n * (t - 2.625 / d) * (t - 2.625 / d) + 0.984375;
  },
});

/**
 * Looks an easing curve up by name; unknown names give the linear curve.
 * @param {string} name A key of EASING.
 * @returns {(t: number) => number}
 */
export function easingByName(name) {
  return EASING[name] ?? EASING.linear;
}

/**
 * Evaluates an easing curve on a clamped progress and scales the result to a range.
 * @param {string | ((t: number) => number)} curve A name from EASING or a function.
 * @param {number} t Progress; clamped to [0, 1].
 * @param {number} [from]
 * @param {number} [to]
 * @returns {number}
 */
export function ease(curve, t, from = 0, to = 1) {
  const shape = typeof curve === 'function' ? curve : easingByName(curve);
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  return from + (to - from) * shape(clamped);
}

/**
 * A critically damped spring step (the "smooth damp" of game cameras): moves a value toward a
 * target with a velocity that is continuous even when the target jumps.
 * @param {{value: number, velocity: number}} state Updated in place and returned.
 * @param {number} target
 * @param {number} smoothTime Roughly the time to reach the target, in seconds.
 * @param {number} dt Seconds since the last step.
 * @param {number} [maxSpeed] Optional speed limit.
 * @returns {{value: number, velocity: number}}
 */
export function springDamp(state, target, smoothTime, dt, maxSpeed = Infinity) {
  const time = Math.max(1e-4, smoothTime);
  const omega = 2 / time;
  const x = omega * dt;
  const decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const limit = maxSpeed * time;
  let change = state.value - target;
  change = change < -limit ? -limit : change > limit ? limit : change;
  const goal = state.value - change;
  const carried = (state.velocity + omega * change) * dt;
  state.velocity = (state.velocity - omega * carried) * decay;
  let next = goal + (change + carried) * decay;
  // Never overshoot the target.
  if (target - state.value > 0 === next > target) {
    next = target;
    state.velocity = 0;
  }
  state.value = next;
  return state;
}

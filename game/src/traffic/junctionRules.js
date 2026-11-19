// The rules of the road at Marazul's junctions: the two-phase traffic signals of the city plan
// cycled on the simulation clock (green, yellow, all red, as node.signal describes), what a
// driver does at the stop line (red holds, yellow holds only when there is room to stop, a stop
// sign holds until the car has stood still for a moment), and whether a left turn must wait for
// oncoming traffic. Pure: no engine, tested in tools/tests/traffic/.

/** Light of a signal phase: what the lamps of an arm show. */
export const SIGNAL_LIGHT = Object.freeze({ GREEN: 'green', YELLOW: 'yellow', RED: 'red' });

/** Comfortable braking a driver plans with, m/s^2. */
export const COMFORT_BRAKING = 2.6;
/** Hardest braking a driver accepts to stop for a yellow, m/s^2. */
export const YELLOW_BRAKING = 4.2;
/** Seconds a car stands at a stop sign before it pulls out. */
export const STOP_SIGN_WAIT = 0.9;
/** Metres short of the lane's end where a car waits (the painted stop line). */
export const STOP_LINE_MARGIN = 1.6;

/**
 * The light a signal shows to a phase at a time.
 * @param {{phases: {green: number, yellow: number}[], allRed: number, cycle: number, offset: number} | null} signal node.signal.
 * @param {number} phase The phase index of the arm (lane.phase); -1 means no signal.
 * @param {number} seconds Simulation time.
 * @returns {'green'|'yellow'|'red'}
 */
export function signalLightAt(signal, phase, seconds) {
  if (!signal || phase < 0) return SIGNAL_LIGHT.GREEN;
  let t = (seconds + signal.offset) % signal.cycle;
  if (t < 0) t += signal.cycle;
  for (let i = 0; i < signal.phases.length; i += 1) {
    const { green, yellow } = signal.phases[i];
    if (t < green) return i === phase ? SIGNAL_LIGHT.GREEN : SIGNAL_LIGHT.RED;
    if (t < green + yellow) return i === phase ? SIGNAL_LIGHT.YELLOW : SIGNAL_LIGHT.RED;
    t -= green + yellow + signal.allRed;
    if (t < 0) return SIGNAL_LIGHT.RED;
  }
  return SIGNAL_LIGHT.RED;
}

/**
 * The phase that has green or yellow now, or -1 during the all-red gap.
 * @param {object | null} signal node.signal.
 * @param {number} seconds Simulation time.
 */
export function activeSignalPhase(signal, seconds) {
  if (!signal) return -1;
  for (let i = 0; i < signal.phases.length; i += 1) if (signalLightAt(signal, i, seconds) !== SIGNAL_LIGHT.RED) return i;
  return -1;
}

/**
 * Whether a car must wait at the end of its lane.
 * @param {object} lane The lane it is on (control, signalNode, phase, mustStop).
 * @param {object | null} signal The signal of lane.signalNode, if any.
 * @param {number} seconds Simulation time.
 * @param {number} distance Metres to the end of the lane.
 * @param {number} speed m/s.
 * @param {number} stoppedSeconds How long the car has stood at this line.
 * @param {?string} [shownLight] The light the shared signal clock shows this lane (openWorldCity.signals), if any.
 * @returns {boolean}
 */
export function mustHoldAtLine(lane, signal, seconds, distance, speed, stoppedSeconds, shownLight = null) {
  if (lane.control === 'signals') {
    const light = shownLight ?? signalLightAt(signal, lane.phase, seconds);
    if (light === SIGNAL_LIGHT.GREEN) return false;
    if (light === SIGNAL_LIGHT.RED) return distance > -0.5;
    // Yellow: stop only when it can be done without a panic stop.
    const room = distance - STOP_LINE_MARGIN;
    return room > 0 && room > (speed * speed) / (2 * YELLOW_BRAKING);
  }
  if (lane.control === 'stop' && lane.mustStop) return stoppedSeconds < STOP_SIGN_WAIT;
  return false;
}

/**
 * Fastest speed that still stops at a line: sqrt(2 a d).
 * @param {number} distance Metres to the end of the lane.
 * @param {number} [braking] m/s^2.
 */
export function speedToStopAt(distance, braking = COMFORT_BRAKING) {
  const room = distance - STOP_LINE_MARGIN;
  return room > 0 ? Math.sqrt(2 * braking * room) : 0;
}

/**
 * Whether a car turning left must let an oncoming car pass first.
 * @param {number} oncomingDistance Metres to the nearest oncoming car (Infinity for none).
 * @param {number} oncomingSpeed Its speed, m/s.
 * @returns {boolean}
 */
export function mustYieldLeftTurn(oncomingDistance, oncomingSpeed) {
  if (!(oncomingDistance < 60)) return false;
  // Gap acceptance: about four seconds of clear road, or it is crawling and close is enough.
  const arrival = oncomingDistance / Math.max(oncomingSpeed, 0.5);
  return arrival < 4.5 && oncomingDistance > 1.5;
}

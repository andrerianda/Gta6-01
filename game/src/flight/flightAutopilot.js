// The autopilot's guidance: from where the aircraft is and what is selected (HDG or NAV for the
// way, ALT or VS for the height, auto-throttle for the speed) to a bank angle, a vertical speed and
// a throttle setting, which the flight assists then fly. HDG turns the shortest way round with at
// most 25 degrees of bank; NAV follows the legs of a route (cross-track and track-angle guidance,
// turning early at each waypoint) and holds the last leg's course at the end; ALT captures and
// holds a height through a vertical-speed command; VS holds a vertical speed; the auto-throttle
// holds an indicated airspeed. Headings are compass radians (0 = north = -Z, clockwise from above).
// Pure numbers, no imports.

/**
 * One step of guidance. Writes `out` and returns it; `out.active` is false when nothing is engaged.
 * @param {AutopilotState} autopilot From createAutopilotState.
 * @param {AutopilotSense} sense Where the aircraft is and how it moves.
 * @param {{maxBank: number, maxVerticalSpeed: number, autoThrottle: boolean, climbSpeed: number}} limits From the
 *   tuning; climbSpeed is the indicated airspeed a climb keeps (0: none).
 * @param {number} dt Seconds.
 * @param {{active: boolean, bankTarget: number, verticalSpeedTarget: number, throttle: number}} out
 *   throttle is -1 when the pilot keeps the lever.
 * @returns {typeof out}
 */
export function updateAutopilot(autopilot, sense, limits, dt, out) {
  out.active = autopilot.engaged;
  out.throttle = -1;
  if (!autopilot.engaged) {
    autopilot.speedIntegral = 0;
    return out;
  }
  const speed = sense.groundSpeed > 5 ? sense.groundSpeed : 5;
  let course = autopilot.targetHeading;
  let steerBy = sense.heading;
  if (autopilot.lateral === 'NAV') {
    const guided = routeCourse(autopilot, sense, speed, limits.maxBank);
    if (guided === null) autopilot.lateral = 'HDG';
    else {
      course = guided;
      // Steer the path over the ground, so a crosswind does not carry it off the leg.
      steerBy = sense.track;
    }
  }
  const error = wrapAngle(course - steerBy);
  // A turn rate that eases off into the heading, flown as the bank that gives it.
  const turnRate = clamp(error * 0.35, -0.12, 0.12);
  out.bankTarget = clamp(Math.atan((turnRate * Math.max(sense.airspeed, 20)) / 9.81), -limits.maxBank, limits.maxBank);

  const most = limits.maxVerticalSpeed;
  if (autopilot.vertical === 'VS') out.verticalSpeedTarget = clamp(autopilot.targetVerticalSpeed, -most * 1.5, most);
  else out.verticalSpeedTarget = clamp((autopilot.targetAltitude - sense.altitude) * 0.14, -most, most);
  // A climb never costs the climbing speed: slower than that, the nose comes down until the speed is back.
  if (out.verticalSpeedTarget > 0 && limits.climbSpeed > 0) {
    const share = clamp((sense.indicatedAirspeed - 0.9 * limits.climbSpeed) / (0.1 * limits.climbSpeed), -0.25, 1);
    out.verticalSpeedTarget = Math.min(out.verticalSpeedTarget, most * share);
  }

  if (autopilot.autoThrottle && limits.autoThrottle) {
    const miss = autopilot.targetSpeed - sense.indicatedAirspeed;
    autopilot.speedIntegral = clamp(autopilot.speedIntegral + miss * dt * 0.012, 0, 1);
    out.throttle = clamp(autopilot.speedIntegral + miss * 0.06 - sense.acceleration * 0.12, 0, 1);
  } else {
    autopilot.speedIntegral = sense.throttle;
  }
  return out;
}

/**
 * The course to fly along the route now, or null when the route is finished (the last leg's
 * course is then left in targetHeading).
 */
function routeCourse(autopilot, sense, speed, maxBank) {
  const route = autopilot.route;
  if (route === null || route.length === 0) return null;
  const turnRadius = (speed * speed) / (9.81 * Math.tan(maxBank));
  for (let guard = 0; guard < 4; guard += 1) {
    if (autopilot.routeIndex >= route.length) return null;
    const to = route[autopilot.routeIndex];
    const fromX = autopilot.routeIndex > 0 ? route[autopilot.routeIndex - 1].x : autopilot.legStartX;
    const fromZ = autopilot.routeIndex > 0 ? route[autopilot.routeIndex - 1].z : autopilot.legStartZ;
    let legX = to.x - fromX;
    let legZ = to.z - fromZ;
    const length = Math.hypot(legX, legZ);
    if (length < 1) {
      autopilot.routeIndex += 1;
      continue;
    }
    legX /= length;
    legZ /= length;
    const legCourse = Math.atan2(legX, -legZ);
    const alongLeft = (to.x - sense.x) * legX + (to.z - sense.z) * legZ;
    // Turn early by the lead a rounded corner needs (none at the last waypoint).
    let lead = Math.max(40, speed * 2);
    if (autopilot.routeIndex + 1 < route.length) {
      const next = route[autopilot.routeIndex + 1];
      const turn = Math.abs(wrapAngle(Math.atan2(next.x - to.x, -(next.z - to.z)) - legCourse));
      lead = Math.max(lead, Math.min(turnRadius * Math.tan(Math.min(turn, 2.4) / 2), length * 0.5));
    }
    if (alongLeft < lead) {
      autopilot.targetHeading = legCourse;
      autopilot.routeIndex += 1;
      continue;
    }
    // Cross-track distance (+ right of the leg) and a look-ahead that scales with speed.
    const across = (sense.x - fromX) * -legZ + (sense.z - fromZ) * legX;
    const ahead = clamp(speed * 14, 200, 9000);
    autopilot.targetHeading = legCourse;
    autopilot.crossTrack = across;
    autopilot.routeDistance = alongLeft + remainingAfter(route, autopilot.routeIndex);
    return legCourse - clamp(Math.atan(across / ahead), -1.0, 1.0);
  }
  return null;
}

function remainingAfter(route, index) {
  let total = 0;
  for (let i = index; i + 1 < route.length; i += 1) total += Math.hypot(route[i + 1].x - route[i].x, route[i + 1].z - route[i].z);
  return total;
}

/**
 * A disengaged autopilot.
 * @returns {AutopilotState}
 */
export function createAutopilotState() {
  return {
    engaged: false, lateral: null, vertical: null, autoThrottle: false,
    targetHeading: 0, targetAltitude: 0, targetVerticalSpeed: 0, targetSpeed: 0,
    route: null, routeIndex: 0,
    legStartX: 0, legStartZ: 0, crossTrack: 0, routeDistance: 0, speedIntegral: 0,
  };
}

/**
 * Engages the autopilot on the present heading and altitude. Refused on the ground or stalled.
 * @param {AutopilotState} autopilot
 * @param {AutopilotSense} sense
 * @returns {boolean} Whether it is engaged now.
 */
export function engageAutopilot(autopilot, sense) {
  if (sense.onGround || sense.stalled) return false;
  if (autopilot.engaged) return true;
  autopilot.engaged = true;
  autopilot.lateral = 'HDG';
  autopilot.vertical = 'ALT';
  autopilot.targetHeading = sense.heading;
  autopilot.targetAltitude = sense.altitude;
  autopilot.targetVerticalSpeed = 0;
  if (autopilot.targetSpeed <= 0) autopilot.targetSpeed = sense.indicatedAirspeed;
  autopilot.speedIntegral = sense.throttle;
  return true;
}

/**
 * Hands the aircraft back to the pilot (the targets are kept for the next time).
 * @param {AutopilotState} autopilot
 */
export function disengageAutopilot(autopilot) {
  autopilot.engaged = false;
  autopilot.lateral = null;
  autopilot.vertical = null;
  autopilot.autoThrottle = false;
}

/**
 * Selects a mode: 'HDG' or 'NAV' for the way, 'ALT' or 'VS' for the height; 'ATHR' switches the
 * auto-throttle on and off. Engages the autopilot first when it is off. HDG takes the present
 * heading, ALT the present altitude, VS the present vertical speed (rounded to half a metre per
 * second), ATHR the present indicated airspeed; NAV needs a route.
 * @param {AutopilotState} autopilot
 * @param {'HDG' | 'NAV' | 'ALT' | 'VS' | 'ATHR'} mode
 * @param {AutopilotSense} sense
 * @param {boolean} hasAutoThrottle From the tuning.
 * @returns {boolean} Whether the mode is on now.
 */
export function selectAutopilotMode(autopilot, mode, sense, hasAutoThrottle) {
  if (mode === 'ATHR' && autopilot.engaged && autopilot.autoThrottle) {
    autopilot.autoThrottle = false;
    return false;
  }
  if (!engageAutopilot(autopilot, sense)) return false;
  if (mode === 'HDG') {
    autopilot.lateral = 'HDG';
    autopilot.targetHeading = sense.heading;
  } else if (mode === 'NAV') {
    if (autopilot.route === null || autopilot.routeIndex >= autopilot.route.length) return false;
    autopilot.lateral = 'NAV';
    autopilot.legStartX = sense.x;
    autopilot.legStartZ = sense.z;
  } else if (mode === 'ALT') {
    autopilot.vertical = 'ALT';
    autopilot.targetAltitude = sense.altitude;
  } else if (mode === 'VS') {
    autopilot.vertical = 'VS';
    autopilot.targetVerticalSpeed = Math.round(sense.verticalSpeed * 2) / 2;
  } else if (mode === 'ATHR') {
    if (!hasAutoThrottle) return false;
    autopilot.autoThrottle = true;
    autopilot.targetSpeed = sense.indicatedAirspeed;
    autopilot.speedIntegral = sense.throttle;
  }
  return true;
}

/**
 * Gives the autopilot a route for NAV (or takes it away: NAV then falls back to HDG).
 * @param {AutopilotState} autopilot
 * @param {{x: number, z: number}[] | null} points Waypoints in order, the destination last.
 * @param {AutopilotSense} sense The first leg starts where the aircraft is.
 */
export function setAutopilotRoute(autopilot, points, sense) {
  autopilot.route = points && points.length > 0 ? points : null;
  autopilot.routeIndex = 0;
  autopilot.legStartX = sense.x;
  autopilot.legStartZ = sense.z;
  autopilot.routeDistance = 0;
  if (autopilot.route === null && autopilot.lateral === 'NAV') {
    autopilot.lateral = 'HDG';
    autopilot.targetHeading = sense.heading;
  }
}

/** The angle in -pi .. pi. */
export function wrapAngle(angle) {
  let a = angle % (2 * Math.PI);
  if (a > Math.PI) a -= 2 * Math.PI;
  else if (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

function clamp(value, low, high) {
  return value < low ? low : value > high ? high : value;
}

/**
 * @typedef {object} AutopilotState
 * @property {boolean} engaged
 * @property {'HDG' | 'NAV' | null} lateral
 * @property {'ALT' | 'VS' | null} vertical
 * @property {boolean} autoThrottle
 * @property {number} targetHeading Compass radians.
 * @property {number} targetAltitude Metres above sea level.
 * @property {number} targetVerticalSpeed Metres per second.
 * @property {number} targetSpeed Indicated airspeed, m/s.
 * @property {{x: number, z: number}[] | null} route
 * @property {number} routeIndex The waypoint being flown to.
 * @property {number} legStartX Where the first leg starts.
 * @property {number} legStartZ
 * @property {number} crossTrack Metres right of the leg (NAV).
 * @property {number} routeDistance Metres left along the route (NAV).
 * @property {number} speedIntegral The auto-throttle's memory.
 */

/**
 * @typedef {object} AutopilotSense
 * @property {number} x World position.
 * @property {number} z
 * @property {number} heading Compass radians.
 * @property {number} track Compass radians of the path over the ground.
 * @property {number} altitude Metres above sea level.
 * @property {number} verticalSpeed
 * @property {number} airspeed True, m/s.
 * @property {number} indicatedAirspeed
 * @property {number} groundSpeed
 * @property {number} acceleration Along the flight path, m/s^2.
 * @property {number} throttle The lever now, 0..1.
 * @property {boolean} onGround
 * @property {boolean} stalled
 */

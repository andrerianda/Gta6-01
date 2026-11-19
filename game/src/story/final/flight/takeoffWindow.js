// The takeoff window of POINT OF NO RETURN as pure logic: the countdown the insider bought, the
// tower's prompts at their times, the line-up on runway 27, the roll with its two calls, the
// success (airborne above 30 m in time) or the window closing with the wheels on the ground, and
// the grade of the takeoff (centreline, rotation speed, how smoothly the nose came up).
// No three.js, no DOM: runs in Node (tools/tests/finalflight/).

const DEGREES = 180 / Math.PI;

export const TAKEOFF_WINDOW = Object.freeze({
  seconds: 180,
  radioCheckAt: 1, readbackAt: 5, taxiClearanceAt: 9.5,
  readinessLeft: 90, statusLeft: 40,
  lineUpHeadingDegrees: 15, lineUpHalfWidth: 20, lineUpLength: 260, lineUpMaxSpeed: 12,
  readbackDelay: 4,
  positiveRateHeight: 15, airborneHeight: 30,
});

export const TAKEOFF_GRADES = Object.freeze({
  gold: Object.freeze({ centreline: 4, rotateError: 7, pitchRate: 9 }),
  silver: Object.freeze({ centreline: 9, rotateError: 14, pitchRate: 16 }),
});

/**
 * Where a point lies against a runway or strip given by its two ends: metres along it from end 0,
 * signed metres right of the centreline, and the compass heading of the line.
 * @param {{x0: number, z0: number, x1: number, z1: number}} line
 * @param {number} x
 * @param {number} z
 * @param {{along: number, offset: number, length: number, heading: number}} [out]
 */
export function alongAndOffset(line, x, z, out = { along: 0, offset: 0, length: 0, heading: 0 }) {
  const dx = line.x1 - line.x0;
  const dz = line.z1 - line.z0;
  const length = Math.hypot(dx, dz) || 1;
  const ux = dx / length;
  const uz = dz / length;
  out.along = (x - line.x0) * ux + (z - line.z0) * uz;
  out.offset = -(x - line.x0) * uz + (z - line.z0) * ux;
  out.length = length;
  out.heading = (Math.atan2(dx, -dz) + Math.PI * 2) % (Math.PI * 2);
  return out;
}

/** Smallest difference between two compass headings, radians, -pi..pi. */
export function headingDifference(a, b) {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Whether the aircraft is lined up for takeoff: on the runway near end 0, slow, nose along it.
 * @param {{x0: number, z0: number, x1: number, z1: number, width?: number}} runway
 * @param {{x: number, z: number, heading: number, speed: number}} sample
 */
export function isLinedUp(runway, sample, rules = TAKEOFF_WINDOW) {
  const place = alongAndOffset(runway, sample.x, sample.z);
  if (place.along < -15 || place.along > rules.lineUpLength) return false;
  if (Math.abs(place.offset) > rules.lineUpHalfWidth) return false;
  return Math.abs(headingDifference(sample.heading, place.heading)) * DEGREES <= rules.lineUpHeadingDegrees;
}

/**
 * The grade of a takeoff.
 * @param {{centreline: number, rotateError: number, pitchRate: number}} run Largest metres off the
 *   centreline during the roll, metres per second between the speed the nose came up at and the
 *   aircraft's rotation speed, and the fastest pitch rate in degrees per second up to 30 m.
 * @returns {'gold' | 'silver' | 'bronze'}
 */
export function gradeTakeoff(run) {
  const within = (limit) => Math.abs(run.centreline) <= limit.centreline
    && Math.abs(run.rotateError) <= limit.rotateError && Math.abs(run.pitchRate) <= limit.pitchRate;
  return within(TAKEOFF_GRADES.gold) ? 'gold' : within(TAKEOFF_GRADES.silver) ? 'silver' : 'bronze';
}

/**
 * The window. Feed it a sample each frame; it answers with the events of that frame (strings):
 * 'tw_01', 'tw_02', 'tw_03' (radio check, readback, taxi clearance), 'tw_04' / 'tw_05' (the tower
 * growing suspicious, only while not lined up), 'lined_up', 'tw_06', 'tw_07' (cleared, readback),
 * 'tw_08' (rotation speed), 'tw_09' (positive rate), 'success', 'timeout', 'crashed'.
 * @param {{seconds?: number, runway: object, rotateSpeed: number}} options rotateSpeed in m/s indicated.
 */
export function createTakeoffWindow(options) {
  const rules = TAKEOFF_WINDOW;
  const runway = options.runway;
  const place = { along: 0, offset: 0, length: 0, heading: 0 };
  const events = [];
  const said = new Set();
  const window = {
    left: options.seconds ?? rules.seconds,
    elapsed: 0,
    linedUp: false,
    rolling: false,
    outcome: null,
    grade: null,
    run: { centreline: 0, rotateError: 0, pitchRate: 0, rotateSpeed: 0 },
    update,
  };
  let clearedAt = -1;
  let rotated = false;
  let lastPitch = null;

  function once(id) {
    if (said.has(id)) return;
    said.add(id);
    events.push(id);
  }

  function update(sample, dt) {
    events.length = 0;
    if (window.outcome) return events;
    window.elapsed += dt;
    window.left = Math.max(0, window.left - dt);
    if (sample.crashed) return finish('crashed');
    if (window.elapsed >= rules.radioCheckAt) once('tw_01');
    if (window.elapsed >= rules.readbackAt) once('tw_02');
    if (window.elapsed >= rules.taxiClearanceAt) once('tw_03');

    alongAndOffset(runway, sample.x, sample.z, place);
    if (!window.linedUp && sample.onGround && sample.speed <= rules.lineUpMaxSpeed && isLinedUp(runway, sample, rules)) {
      window.linedUp = true;
      clearedAt = window.elapsed;
      events.push('lined_up');
      once('tw_06');
    }
    if (window.linedUp && window.elapsed - clearedAt >= rules.readbackDelay) once('tw_07');
    if (!window.linedUp && !window.rolling) {
      if (window.left <= rules.readinessLeft) once('tw_04');
      if (window.left <= rules.statusLeft) once('tw_05');
    }

    // The roll: any run along the runway counts, cleared or not (he is stealing it anyway).
    const onRunway = Math.abs(place.offset) < 40 && place.along > -30 && place.along < place.length + 30;
    if (sample.onGround && onRunway && sample.speed > 15) {
      window.rolling = true;
      if (Math.abs(place.offset) > window.run.centreline) window.run.centreline = Math.abs(place.offset);
    }
    if (window.rolling) {
      if (sample.speed >= options.rotateSpeed) once('tw_08');
      const pitch = sample.pitch * DEGREES;
      if (!rotated && (pitch > 3 || !sample.onGround)) {
        rotated = true;
        window.run.rotateSpeed = sample.speed;
        window.run.rotateError = sample.speed - options.rotateSpeed;
      }
      if (lastPitch !== null && dt > 1e-4 && sample.speed > options.rotateSpeed * 0.6) {
        const rate = Math.abs(pitch - lastPitch) / dt;
        if (rate > window.run.pitchRate) window.run.pitchRate = rate;
      }
      lastPitch = pitch;
      if (!sample.onGround && sample.verticalSpeed > 0.5 && sample.height > rules.positiveRateHeight) once('tw_09');
    }
    if (!sample.onGround && sample.height > rules.airborneHeight) {
      window.grade = gradeTakeoff(window.run);
      return finish('success');
    }
    // The window closes on an aircraft with its wheels on the ground; one already in the air
    // has made it as long as it does not come back down.
    if (window.left <= 0 && sample.onGround) return finish('timeout');
    return events;
  }

  function finish(outcome) {
    window.outcome = outcome;
    events.push(outcome);
    return events;
  }

  return window;
}

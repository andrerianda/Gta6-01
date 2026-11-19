// The flight HUD's maths, apart from its drawing: where a pitch-ladder rung sits for a pitch and a
// bank, which ticks a moving tape shows, heading differences across north, the flight-path marker,
// which warnings are up, and the text of the autopilot line. Pure (no DOM), tested in Node.

const DEG = Math.PI / 180;

/** Pitch-ladder rung spacing and how far from the centre rungs are drawn, degrees. */
export const LADDER = Object.freeze({ step: 5, reach: 13 });

/** Warning thresholds. */
export const WARNING_LIMITS = Object.freeze({
  pullUpSeconds: 7,          // time to the ground at the present sink rate
  pullUpSinkFpm: -1000,      // gentler sink rates never warn (a normal approach)
  pullUpBelowFeet: 2500,     // the radar altimeter's reach
  gearBelowFeet: 800,
  gearSlowFactor: 1.6,       // times the stall speed
  apOffSeconds: 4,           // how long AP OFF flashes after a disconnect
});

/**
 * The HUD's frame for a viewport.
 * @param {number} width Viewport width, CSS pixels.
 * @param {number} height
 * @param {number} fieldOfViewDegrees The camera's vertical field of view (the ladder is conformal).
 * @param {{cx: number, cy: number, unit: number, pixelsPerDegree: number, width: number, height: number}} out
 */
export function hudFrame(width, height, fieldOfViewDegrees, out) {
  out.width = width;
  out.height = height;
  out.cx = width * 0.5;
  out.cy = height * 0.5;
  out.unit = Math.min(width / 1280, height / 720);
  out.pixelsPerDegree = height / Math.max(20, fieldOfViewDegrees || 55);
  return out;
}

/**
 * Where the centre of a ladder rung (or the horizon, rung 0) is, relative to the HUD's centre.
 * The horizon turns against the bank (right wing down lifts its right end) and drops as the nose
 * rises.
 * @param {number} rungDegrees The rung's pitch angle.
 * @param {number} pitchDegrees The aircraft's pitch, + nose up.
 * @param {number} rollDegrees The aircraft's bank, + right wing down.
 * @param {number} pixelsPerDegree
 * @param {{x: number, y: number, angle: number}} out Offset in pixels (y down) and the rung's
 *   rotation for the canvas (radians, clockwise positive).
 */
export function ladderRungPosition(rungDegrees, pitchDegrees, rollDegrees, pixelsPerDegree, out) {
  const drop = (pitchDegrees - rungDegrees) * pixelsPerDegree;
  const roll = rollDegrees * DEG;
  out.x = drop * Math.sin(roll);
  out.y = drop * Math.cos(roll);
  out.angle = -roll;
  return out;
}

/**
 * The first rung at or above (pitch - reach), a multiple of the ladder step.
 * @param {number} pitchDegrees
 * @returns {number}
 */
export function firstLadderRung(pitchDegrees) {
  const pitch = Number.isFinite(pitchDegrees) ? pitchDegrees : 0;
  return Math.max(-90, Math.ceil((pitch - LADDER.reach) / LADDER.step) * LADDER.step);
}

/**
 * The ticks of a moving tape around a value.
 * @param {number} value The tape's present reading.
 * @param {number} step Units between ticks.
 * @param {number} halfSpan Units shown either side of the reading.
 * @param {number} floor The lowest tick allowed (0 for speed, -1000 for altitude).
 * @param {{first: number, count: number}} out The first tick's value and how many follow by `step`.
 */
export function tapeTicks(value, step, halfSpan, floor, out) {
  const v = Number.isFinite(value) ? value : 0;
  let first = Math.ceil((v - halfSpan) / step) * step;
  if (first < floor) first = floor;
  const last = Math.floor((v + halfSpan) / step) * step;
  out.first = first;
  out.count = last >= first ? Math.round((last - first) / step) + 1 : 0;
  return out;
}

/**
 * The signed smallest turn from one heading to another.
 * @param {number} toDegrees
 * @param {number} fromDegrees
 * @returns {number} -180..180, + clockwise (to the right).
 */
export function headingDifference(toDegrees, fromDegrees) {
  let d = ((toDegrees - fromDegrees) % 360 + 540) % 360 - 180;
  if (d === -180) d = 180;
  return Number.isFinite(d) ? d : 0;
}

/**
 * A heading 0..359 as three digits ('007'); 360 shows as '000'.
 * @param {number} degrees
 * @returns {string}
 */
export function headingText(degrees) {
  const n = ((Math.round(Number.isFinite(degrees) ? degrees : 0) % 360) + 360) % 360;
  return n < 10 ? `00${n}` : n < 100 ? `0${n}` : String(n);
}

/** The compass letter of a tape tick, or its tens ('N', '03', '06', 'E' ...). */
export function headingTickLabel(degrees) {
  const d = ((degrees % 360) + 360) % 360;
  if (d === 0) return 'N';
  if (d === 90) return 'E';
  if (d === 180) return 'S';
  if (d === 270) return 'W';
  const tens = d / 10;
  return tens < 10 ? `0${tens}` : String(tens);
}

/**
 * Where the flight-path marker sits relative to the HUD's centre (the nose): below it by the angle
 * of attack, aside by the slip.
 * @param {number} alphaDegrees
 * @param {number} slipBall -1..1 from the readout (+ = ball right = the path is to the left).
 * @param {number} pixelsPerDegree
 * @param {{x: number, y: number}} out
 */
export function flightPathMarkerOffset(alphaDegrees, slipBall, pixelsPerDegree, out) {
  const alpha = Number.isFinite(alphaDegrees) ? Math.max(-20, Math.min(20, alphaDegrees)) : 0;
  const slip = Number.isFinite(slipBall) ? Math.max(-1, Math.min(1, slipBall)) : 0;
  out.x = -slip * 4 * pixelsPerDegree;
  out.y = alpha * pixelsPerDegree;
  return out;
}

/**
 * Which warnings are up.
 * @param {object} readout From readInstruments.
 * @param {{retractableGear?: boolean, apOffSeconds?: number}} craft Whether the gear retracts, and
 *   how long ago the autopilot disconnected (Infinity or undefined: not recently).
 * @param {{stall: boolean, pullUp: boolean, overspeed: boolean, gear: boolean, apOff: boolean, any: boolean}} out
 */
export function flightWarnings(readout, craft, out) {
  const airborne = !readout.onGround;
  out.stall = airborne && Boolean(readout.stallWarning || readout.stalled);
  const sink = readout.verticalSpeedFpm;
  const feet = readout.radarAltitudeFeet;
  out.pullUp = airborne && sink < WARNING_LIMITS.pullUpSinkFpm && feet < WARNING_LIMITS.pullUpBelowFeet
    && feet / (-sink / 60) < WARNING_LIMITS.pullUpSeconds;
  out.overspeed = Boolean(readout.overspeed);
  out.gear = airborne && Boolean(craft && craft.retractableGear) && !readout.gearDown && !readout.gearInTransit
    && feet < WARNING_LIMITS.gearBelowFeet && readout.airspeedKnots < readout.stallSpeedKnots * WARNING_LIMITS.gearSlowFactor
    && sink < 200;
  out.apOff = Boolean(craft && craft.apOffSeconds < WARNING_LIMITS.apOffSeconds);
  out.any = out.stall || out.pullUp || out.overspeed || out.gear || out.apOff;
  return out;
}

/**
 * The autopilot line: 'AP HDG 270 | ALT 12,000 | A/THR 250', or 'AP NAV 3.2 nm | VS +800'.
 * @param {{engaged: boolean, lateral: string|null, vertical: string|null, autoThrottle: boolean, headingDegrees: number,
 *   altitudeFeet: number, verticalSpeedFpm: number, speedKnots: number, routeDistanceNm: number|null}} autopilot
 * @returns {string} Empty when nothing is engaged.
 */
export function autopilotLine(autopilot) {
  if (!autopilot || (!autopilot.engaged && !autopilot.autoThrottle)) return '';
  let text = '';
  if (autopilot.engaged) {
    text = 'AP';
    if (autopilot.lateral === 'NAV') {
      const nm = autopilot.routeDistanceNm;
      text += ` NAV ${nm === null || nm === undefined || !Number.isFinite(nm) ? '--' : nm.toFixed(1)} nm`;
    } else if (autopilot.lateral === 'HDG') text += ` HDG ${headingText(autopilot.headingDegrees)}`;
    if (autopilot.vertical === 'ALT') text += ` | ALT ${thousands(Math.round(autopilot.altitudeFeet / 100) * 100)}`;
    else if (autopilot.vertical === 'VS') {
      const vs = Math.round(autopilot.verticalSpeedFpm / 50) * 50;
      text += ` | VS ${vs >= 0 ? '+' : ''}${vs}`;
    }
  }
  if (autopilot.autoThrottle) text += `${text ? ' | ' : ''}A/THR ${Math.round(autopilot.speedKnots)}`;
  return text;
}

/**
 * A whole number with thousands separators ('12,000').
 * @param {number} value
 * @returns {string}
 */
export function thousands(value) {
  const n = Math.round(Number.isFinite(value) ? value : 0);
  const digits = String(Math.abs(n));
  let out = '';
  for (let i = 0; i < digits.length; i += 1) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ',';
    out += digits[i];
  }
  return n < 0 ? `-${out}` : out;
}

/**
 * Which HUD an aircraft shows in a camera view.
 * @param {string|null} view 'cockpit', 'chase' or 'outside' (the follow camera's flightView).
 * @param {string|null} cockpit The catalog's flight.cockpit ('analog_six', 'glass_four', 'analog_gauges' or null).
 * @returns {'full' | 'combiner' | 'annunciator'} The jets' combiner glass in their cockpits, only
 *   the annunciator line in the trainer's (its panel has the six instruments), everything outside.
 */
/**
 * What the screen (not the cockpit model) shows while flying.
 * @param {string|null} view 'cockpit', 'chase' or 'outside'.
 * @param {string|null} cockpit The catalog's flight.cockpit kind, or null.
 * @param {'casual'|'realistic'|string|null} flightMode casual = ASSISTED, realistic = SIMULATION.
 * @returns {'assisted' | 'simulation'} assisted: a clean screen with the small speed / altitude
 *   readout; simulation: only what a pilot needs beyond the cockpit's own instruments.
 */
export function screenHudModeFor(view, cockpit, flightMode) {
  return flightMode === 'realistic' ? 'simulation' : 'assisted';
}

export function hudModeFor(view, cockpit) {
  if (view !== 'cockpit' || !cockpit) return 'full';
  return cockpit === 'analog_six' ? 'annunciator' : 'combiner';
}

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
 * What the screen (not the cockpit model) shows while flying.
 * @param {string|null} view 'cockpit', 'chase' or 'outside'.
 * @param {string|null} cockpit The catalog's flight.cockpit kind, or null.
 * @param {'casual'|'realistic'|string|null} flightMode casual = ASSISTED, realistic = SIMULATION.
 * @returns {'assisted' | 'simulation'} assisted: a clean screen with the small speed / altitude
 *   readout; simulation: only what a pilot needs beyond the cockpit's own instruments.
 */
export function screenHudModeFor(view, cockpit, flightMode) {
  return flightMode === 'realistic' || flightMode === 'simulation' ? 'simulation' : 'assisted';
}

/**
 * Which symbology an aircraft's own cockpit carries in a camera view (not what the screen shows:
 * that is screenHudModeFor).
 * @param {string|null} view 'cockpit', 'chase' or 'outside' (the follow camera's flightView).
 * @param {string|null} cockpit The catalog's flight.cockpit ('analog_six', 'glass_four', 'analog_gauges' or null).
 * @returns {'full' | 'combiner' | 'annunciator'} The jets' combiner glass in their cockpits, only
 *   the annunciator line in the trainer's (its panel has the six instruments), everything outside.
 */
export function hudModeFor(view, cockpit) {
  if (view !== 'cockpit' || !cockpit) return 'full';
  return cockpit === 'analog_six' ? 'annunciator' : 'combiner';
}

/** The one warning the screen shows, most urgent first. */
export const WARNING_ORDER = Object.freeze([
  ['pullUp', 'PULL UP', 'warn'], ['stall', 'STALL', 'warn'], ['overspeed', 'OVERSPEED', 'warn'], ['gear', 'GEAR', 'caution'], ['apOff', 'AP OFF', 'caution'],
]);

/**
 * The most urgent warning that is up.
 * @param {{stall?: boolean, pullUp?: boolean, overspeed?: boolean, gear?: boolean, apOff?: boolean}|null} warnings
 * @returns {{key: string, text: string, level: 'warn'|'caution'}|null}
 */
export function topWarning(warnings) {
  if (!warnings) return null;
  for (let i = 0; i < WARNING_ORDER.length; i += 1) if (warnings[WARNING_ORDER[i][0]]) return WARNING_ENTRIES[i];
  return null;
}
const WARNING_ENTRIES = WARNING_ORDER.map(([key, text, level]) => Object.freeze({ key, text, level }));

/**
 * A whole number grouped with spaces, as the small readout writes it ('2 450').
 * @param {number} value
 * @returns {string}
 */
export function spacedThousands(value) {
  return thousands(value).replace(/,/g, ' ');
}

/**
 * What the screen paints for a mode and a view. With a combiner glass in the cockpit model (or a
 * cockpit that carries its own instruments) the screen has no ladder, tapes or heading at all; a
 * cockpit view without its model behaves as the chase view.
 * @param {'assisted'|'simulation'|string} mode From screenHudModeFor (older callers: anything else reads as assisted).
 * @param {'cockpit'|'chase'|'outside'|string|null} view
 * @param {boolean} hasCombiner
 * @param {{readout: boolean, horizon: boolean, strip: boolean, fullHud: boolean}} [out]
 */
export function screenHudParts(mode, view, hasCombiner, out = { readout: false, horizon: false, strip: false, fullHud: false }) {
  const simulation = mode === 'simulation';
  const inCockpit = view === 'cockpit' && Boolean(hasCombiner);
  out.fullHud = simulation && !inCockpit;
  out.strip = simulation;
  out.readout = !out.fullHud;
  out.horizon = !simulation && !inCockpit;
  return out;
}

/** The simulation strip's cells: heading, vertical speed, throttle, flaps, gear, autopilot. */
export const STRIP_CELLS = 6;

/**
 * The texts of the simulation strip, left to right.
 * @param {object} readout From readInstruments.
 * @param {{retractableGear?: boolean, flapSteps?: number}} craft
 * @param {{label: string, value: string, level: ''|'bright'|'caution'}[]} out Six cells, reused.
 */
export function stripCells(readout, craft, out) {
  const number = (value) => (Number.isFinite(value) ? value : 0);
  const vs = Math.round(number(readout.verticalSpeedFpm) / 50) * 50;
  const ap = readout.autopilot;
  set(out[0], 'HDG', headingText(readout.headingDegrees), '');
  set(out[1], 'VS', `${vs > 0 ? '+' : ''}${vs}`, Math.abs(vs) >= 6000 ? 'caution' : '');
  set(out[2], readout.afterburner ? 'A/B' : 'THR', `${Math.round(clamp(number(readout.throttlePercent), 0, 100))}%`, readout.afterburner ? 'caution' : '');
  set(out[3], 'FLAPS', craft && craft.flapSteps > 1 ? String(Math.round(number(readout.flapsDegrees))) : 'FIX', number(readout.flapsDegrees) > 0 ? 'bright' : '');
  set(out[4], 'GEAR', !craft || !craft.retractableGear ? 'FIX' : readout.gearInTransit ? '---' : readout.gearDown ? 'DN' : 'UP', readout.gearInTransit ? 'caution' : '');
  set(out[5], 'AP', ap && ap.engaged ? ap.lateral || ap.vertical || 'ON' : ap && ap.autoThrottle ? 'A/THR' : 'OFF', ap && (ap.engaged || ap.autoThrottle) ? 'bright' : '');
  return out;
}

function set(cell, label, value, level) {
  cell.label = label;
  cell.value = value;
  cell.level = level;
}

const clamp = (value, low, high) => (value < low ? low : value > high ? high : value);
const slot = (x, y, w, h) => ({ x, y, w, h });

/**
 * The fixed slots of the screen while flying, CSS pixels: where every piece of the flight screen
 * may be, so that no two share a pixel. The DOM pieces are placed by styles/hud.css and
 * styles/final-mission.css with the same formulas (viewport-height based, so the picture reads the
 * same at 768x480 and 1920x1080); the canvas pieces are painted inside theirs by flightHudPainter.js.
 *   top row: notice (one card at a time) | objective with its countdown | wanted stars
 *   right column: air guard, mission label, stage hint ... location banner, speed / altitude readout
 *   left column: key hint (brief) ... minimap with the health bar
 *   centre: warning line, [simulation outside: heading, speed box, ladder, altitude box], key prompt, subtitle
 *   bottom centre: the simulation strip (heading, vertical speed, throttle, flaps, gear, autopilot)
 * @param {number} width Viewport width.
 * @param {number} height Viewport height.
 * @returns {Record<string, {x: number, y: number, w: number, h: number}> & {u: number, type: number, stripType: number, boxType: number, warningType: number, pad: number}}
 */
export function flightScreenSlots(width, height) {
  const u = clamp(height * 0.00125, 0.8, 1.6);
  const edge = clamp(height * 0.035, 14, 44);
  const mapW = clamp(height * 0.25, 124, 320);
  const mapH = mapW * 0.65;
  const bar = clamp(height * 0.0056, 3, 7);
  const gap = clamp(height * 0.0045, 2, 6);
  const pad = height * 0.012;
  const cx = width / 2;
  const type = clamp(height * 0.0275, 15, 30);          // the readout's digits
  const stripType = clamp(height * 0.0175, 11, 20);
  const boxType = clamp(height * 0.026, 14, 30);
  const warningType = clamp(height * 0.035, 18, 40);
  const subtitleType = clamp(height * 0.0205, 14, 26);

  const minimap = slot(edge, height - edge - bar - gap - mapH, mapW, mapH);
  const vitals = slot(edge, height - edge - bar, mapW, bar);
  const readout = slot(width - edge - type * 6, height - edge - type * 2.5, type * 6, type * 2.5);
  const horizon = slot(readout.x - pad - type * 2.5, readout.y, type * 2.5, type * 2.5);
  const banner = slot(width - edge - width * 0.34, readout.y - pad - type * 1.3, width * 0.34, type * 1.3);
  const stripW = stripType * 5.9 * STRIP_CELLS;
  const stripH = stripType * 3.6;
  const strip = slot(cx - stripW / 2, height - edge - stripH, stripW, stripH);
  const subtitleW = Math.min(width * 0.92, 1100);
  const subtitle = slot(cx - subtitleW / 2, minimap.y - pad - subtitleType * 3.46, subtitleW, subtitleType * 3.46);
  const promptH = clamp(height * 0.019, 12, 19) * 2.5;
  const prompt = slot(cx - width * 0.15, subtitle.y - pad - promptH, width * 0.3, promptH);
  const hintW = Math.min(width * 0.215, 300 * u);
  const keyHint = slot(edge, subtitle.y - pad - 120 * u, hintW, 120 * u);

  const notice = slot(24 * u, 22 * u, Math.min(300 * u, width * 0.235), 100 * u);
  const objectiveW = Math.min(width * 0.46, 640 * u);
  const objective = slot(cx - objectiveW / 2, 24 * u, objectiveW, 76 * u);
  const stars = slot(width - 185 * u, 22 * u, 157 * u, 29 * u);
  const airGuard = slot(width - edge - width * 0.23, 60 * u, width * 0.23, 76 * u);
  const label = slot(width * 0.978 - width * 0.34, height * 0.275, width * 0.34, Math.max(15, height * 0.03));
  const stageW = Math.min(250, width * 0.23);
  const stageHint = slot(width - edge - stageW, height * 0.315, stageW, height * 0.245);
  const warning = slot(cx - width * 0.15, height * 0.215, width * 0.3, warningType * 1.4);

  // The restrained full HUD of the simulation outside the cockpit.
  const heading = slot(cx - width * 0.11, height * 0.275, width * 0.22, height * 0.06);
  const ladder = slot(cx - width * 0.12, height * 0.35, width * 0.24, height * 0.24);
  const boxH = boxType * 3;                               // the boxed digits (1.7) and one small line under them
  const boxY = ladder.y + ladder.h / 2 - boxType * 0.85;
  const speedBox = slot(ladder.x - width * 0.012 - boxType * 4.6, boxY, boxType * 4.6, boxH);
  const altitudeBox = slot(ladder.x + ladder.w + width * 0.012, boxY, boxType * 5.4, boxH);

  return {
    u, type, stripType, boxType, warningType, pad,
    minimap, vitals, readout, horizon, banner, strip, subtitle, prompt, keyHint, notice, objective, stars, airGuard, label, stageHint,
    warning, heading, ladder, speedBox, altitudeBox,
  };
}

/** The slots every flight screen may fill at once, whatever the mode. */
export const COMMON_FLIGHT_SLOTS = Object.freeze([
  'minimap', 'vitals', 'objective', 'notice', 'keyHint', 'subtitle', 'prompt', 'stars', 'airGuard', 'label', 'stageHint', 'banner', 'warning',
]);

/**
 * The named rectangles a flight screen can show at once in a mode and a view: the common slots
 * plus the canvas pieces of screenHudParts.
 * @param {number} width
 * @param {number} height
 * @param {'assisted'|'simulation'} mode
 * @param {'cockpit'|'chase'|'outside'} view
 * @param {boolean} hasCombiner
 * @returns {{name: string, x: number, y: number, w: number, h: number}[]}
 */
export function flightScreenRectangles(width, height, mode, view, hasCombiner) {
  const slots = flightScreenSlots(width, height);
  const parts = screenHudParts(mode, view, hasCombiner);
  const names = [...COMMON_FLIGHT_SLOTS];
  if (parts.readout) names.push('readout');
  if (parts.horizon) names.push('horizon');
  if (parts.strip) names.push('strip');
  if (parts.fullHud) names.push('heading', 'ladder', 'speedBox', 'altitudeBox');
  return names.map((name) => ({ name, ...slots[name] }));
}

/**
 * The pairs of rectangles that share more than `tolerance` pixels in both directions.
 * @param {{name: string, x: number, y: number, w: number, h: number}[]} rectangles
 * @param {number} [tolerance]
 * @returns {string[]} 'a+b' for each overlapping pair.
 */
export function overlappingRectangles(rectangles, tolerance = 0.5) {
  const pairs = [];
  for (let i = 0; i < rectangles.length; i += 1) {
    for (let j = i + 1; j < rectangles.length; j += 1) {
      const a = rectangles[i];
      const b = rectangles[j];
      const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (overlapX > tolerance && overlapY > tolerance) pairs.push(`${a.name}+${b.name}`);
    }
  }
  return pairs;
}

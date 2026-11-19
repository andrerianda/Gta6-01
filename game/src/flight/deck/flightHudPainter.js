// Draws the flight HUD on a Canvas 2D context from the instrument readout: the pitch ladder and
// horizon, the roll scale with its bank pointer and slip bar, the airspeed tape with the stall band
// and the rotate and never-exceed marks, the altitude tape with the radar altitude, the heading
// tape with the autopilot bug and the waypoint, vertical speed, the flight-path marker, Mach, G,
// throttle, the flap / gear / trim / brake annunciators, the mode, the autopilot line and the
// flashing warnings. Green-white strokes over a dark outline, so it reads over a bright sky.
// The maths is flightHudLayout.js; this file only draws, and allocates nothing but short strings.
import {
  LADDER, firstLadderRung, flightPathMarkerOffset, headingDifference, headingText, headingTickLabel, ladderRungPosition,
  tapeTicks, thousands,
} from './flightHudLayout.js';

/** The HUD's colours. */
export const HUD_COLOURS = Object.freeze({
  ink: '#b6ffb0', bright: '#f2fff0', outline: 'rgba(6, 14, 8, 0.85)', warn: '#ff5a4a', caution: '#ffc94a',
  bug: '#ff7be9', plate: 'rgba(6, 14, 8, 0.38)',
});

const DEG = Math.PI / 180;
const rung = { x: 0, y: 0, angle: 0 };
const ticks = { first: 0, count: 0 };
const marker = { x: 0, y: 0 };
let unit = 1;

/**
 * Paints the HUD.
 * @param {CanvasRenderingContext2D} ctx Already scaled so that one unit is one CSS pixel.
 * @param {object} readout From readInstruments.
 * @param {{cx: number, cy: number, unit: number, pixelsPerDegree: number, width: number, height: number}} frame From hudFrame.
 * @param {{mode: 'full'|'combiner'|'annunciator', warnings: {stall: boolean, pullUp: boolean, overspeed: boolean,
 *   gear: boolean, apOff: boolean}, flash: boolean, jet: boolean, waypointBearing: number|null, autopilotText: string,
 *   retractableGear: boolean, flapSteps: number}} options
 */
/**
 * Paints the pilot's head-up symbology for the cockpit model's combiner glass (the `hud_combiner`
 * mesh): pitch ladder, flight path marker, speed, altitude and heading, in HUD green on a
 * transparent canvas. The whole canvas is the glass; nothing may touch its edges.
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} readout The instrument readout (flightInstruments.js).
 * @param {number} width Canvas width, pixels.
 * @param {number} height Canvas height, pixels.
 * @param {{degreesTall?: number, warnings?: object, flash?: boolean, jet?: boolean, waypointBearing?: number|null}} [options]
 *   degreesTall: the pitch angle the glass spans top to bottom as seen from the eye (for a conformal ladder).
 */
export function paintCombinerHud(ctx, readout, width, height, options = {}) {
  ctx.clearRect(0, 0, width, height);
}

export function paintFlightHud(ctx, readout, frame, options) {
  unit = frame.unit;
  ctx.clearRect(0, 0, frame.width, frame.height);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (options.mode !== 'annunciator') {
    paintLadder(ctx, readout, frame);
    paintRollScale(ctx, readout, frame);
    paintFlightPathMarker(ctx, readout, frame);
    paintSpeedTape(ctx, readout, frame, options);
    paintAltitudeTape(ctx, readout, frame);
    paintHeadingTape(ctx, readout, frame, options);
  }
  paintStatusLines(ctx, readout, frame, options);
  paintWarnings(ctx, frame, options);
}

function stroke(ctx, width = 1.6, colour = HUD_COLOURS.ink) {
  ctx.strokeStyle = HUD_COLOURS.outline;
  ctx.lineWidth = (width + 2.2) * unit;
  ctx.stroke();
  ctx.strokeStyle = colour;
  ctx.lineWidth = width * unit;
  ctx.stroke();
}

function text(ctx, value, x, y, size = 15, colour = HUD_COLOURS.ink, align = 'center') {
  ctx.font = `600 ${Math.max(9, Math.round(size * unit))}px ui-monospace, Menlo, Consolas, monospace`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 3 * unit;
  ctx.strokeStyle = HUD_COLOURS.outline;
  ctx.strokeText(value, x, y);
  ctx.fillStyle = colour;
  ctx.fillText(value, x, y);
}

function paintLadder(ctx, readout, frame) {
  const ppd = frame.pixelsPerDegree;
  const pitch = Number.isFinite(readout.pitchDegrees) ? readout.pitchDegrees : 0;
  const roll = Number.isFinite(readout.rollDegrees) ? readout.rollDegrees : 0;
  const half = 86 * unit;
  const gap = 30 * unit;
  ctx.save();
  ctx.beginPath();
  ctx.rect(frame.cx - frame.width * 0.24, frame.cy - frame.height * 0.3, frame.width * 0.48, frame.height * 0.6);
  ctx.clip();
  for (let d = firstLadderRung(pitch); d <= pitch + LADDER.reach && d <= 90; d += LADDER.step) {
    ladderRungPosition(d, pitch, roll, ppd, rung);
    ctx.save();
    ctx.translate(frame.cx + rung.x, frame.cy + rung.y);
    ctx.rotate(rung.angle);
    ctx.beginPath();
    if (d === 0) {
      ctx.moveTo(-half * 2.6, 0);
      ctx.lineTo(-gap, 0);
      ctx.moveTo(gap, 0);
      ctx.lineTo(half * 2.6, 0);
      stroke(ctx, 1.8, HUD_COLOURS.bright);
    } else {
      const tip = (d > 0 ? 8 : -8) * unit;
      const wide = d % 10 === 0 ? half : half * 0.6;
      if (d < 0) ctx.setLineDash([9 * unit, 6 * unit]);
      ctx.moveTo(-wide, tip);
      ctx.lineTo(-wide, 0);
      ctx.lineTo(-gap, 0);
      ctx.moveTo(gap, 0);
      ctx.lineTo(wide, 0);
      ctx.lineTo(wide, tip);
      stroke(ctx);
      ctx.setLineDash(NO_DASH);
      if (d % 10 === 0) {
        text(ctx, String(Math.abs(d)), -wide - 16 * unit, 0, 13);
        text(ctx, String(Math.abs(d)), wide + 16 * unit, 0, 13);
      }
    }
    ctx.restore();
  }
  ctx.restore();
  // The boresight (where the nose points).
  ctx.beginPath();
  ctx.moveTo(frame.cx - 16 * unit, frame.cy);
  ctx.lineTo(frame.cx - 6 * unit, frame.cy);
  ctx.lineTo(frame.cx, frame.cy + 6 * unit);
  ctx.lineTo(frame.cx + 6 * unit, frame.cy);
  ctx.lineTo(frame.cx + 16 * unit, frame.cy);
  stroke(ctx, 1.8, HUD_COLOURS.bright);
}

const NO_DASH = Object.freeze([]);
const ROLL_MARKS = Object.freeze([-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60]);

function paintRollScale(ctx, readout, frame) {
  const radius = frame.height * 0.33;
  const roll = Number.isFinite(readout.rollDegrees) ? readout.rollDegrees : 0;
  ctx.beginPath();
  for (let i = 0; i < ROLL_MARKS.length; i += 1) {
    const mark = ROLL_MARKS[i];
    const a = mark * DEG;
    const long = mark % 30 === 0 ? 14 : 8;
    ctx.moveTo(frame.cx + Math.sin(a) * radius, frame.cy - Math.cos(a) * radius);
    ctx.lineTo(frame.cx + Math.sin(a) * (radius + long * unit), frame.cy - Math.cos(a) * (radius + long * unit));
  }
  stroke(ctx);
  // The pointer shows where "up" is: it moves against the bank, as the horizon does.
  const a = -Math.max(-70, Math.min(70, roll)) * DEG;
  const px = frame.cx + Math.sin(a) * radius;
  const py = frame.cy - Math.cos(a) * radius;
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(a);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-8 * unit, 14 * unit);
  ctx.lineTo(8 * unit, 14 * unit);
  ctx.closePath();
  stroke(ctx, 1.6, HUD_COLOURS.bright);
  // The slip bar under the pointer slides with the ball.
  const slip = Number.isFinite(readout.slipBall) ? Math.max(-1, Math.min(1, readout.slipBall)) : 0;
  ctx.beginPath();
  ctx.rect(-9 * unit + slip * 16 * unit, 17 * unit, 18 * unit, 5 * unit);
  stroke(ctx, 1.4, Math.abs(slip) > 0.5 ? HUD_COLOURS.caution : HUD_COLOURS.ink);
  ctx.restore();
}

function paintFlightPathMarker(ctx, readout, frame) {
  if (readout.onGround) return;
  flightPathMarkerOffset(readout.alphaDegrees, readout.slipBall, frame.pixelsPerDegree, marker);
  const x = frame.cx + marker.x;
  const y = frame.cy + marker.y;
  const r = 7 * unit;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.moveTo(x - r, y);
  ctx.lineTo(x - r * 2.6, y);
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + r * 2.6, y);
  ctx.moveTo(x, y - r);
  ctx.lineTo(x, y - r * 1.9);
  stroke(ctx, 1.6, HUD_COLOURS.bright);
}

function plate(ctx, x, y, w, h) {
  ctx.fillStyle = HUD_COLOURS.plate;
  ctx.fillRect(x, y, w, h);
}

function paintSpeedTape(ctx, readout, frame, options) {
  const w = 74 * unit;
  const h = frame.height * 0.44;
  const x = frame.cx - frame.width * 0.3 - w;
  const y = frame.cy - h / 2;
  const speed = Number.isFinite(readout.airspeedKnots) ? Math.max(0, readout.airspeedKnots) : 0;
  const step = options.jet ? 20 : 10;
  const span = step * 5;
  const pixels = h / (span * 2);
  plate(ctx, x, y, w, h);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x - 30 * unit, y, w + 60 * unit, h);
  ctx.clip();
  // The stall band (red, up to the stall speed for the present flaps) and the never-exceed band.
  const stallY = frame.cy - (readout.stallSpeedKnots - speed) * pixels;
  ctx.fillStyle = HUD_COLOURS.warn;
  if (stallY < y + h) ctx.fillRect(x + w - 6 * unit, Math.max(y, stallY), 6 * unit, y + h - Math.max(y, stallY));
  const vneY = frame.cy - (readout.neverExceedKnots - speed) * pixels;
  if (vneY > y) ctx.fillRect(x + w - 6 * unit, y, 6 * unit, Math.min(y + h, vneY) - y);
  tapeTicks(speed, step, span, 0, ticks);
  ctx.beginPath();
  for (let i = 0; i < ticks.count; i += 1) {
    const value = ticks.first + i * step;
    const ty = frame.cy - (value - speed) * pixels;
    ctx.moveTo(x + w - 14 * unit, ty);
    ctx.lineTo(x + w - 6 * unit, ty);
  }
  stroke(ctx, 1.3);
  for (let i = 0; i < ticks.count; i += 1) {
    const value = ticks.first + i * step;
    if (Math.round(value / step) % 2 !== 0) continue;
    text(ctx, String(value), x + w - 20 * unit, frame.cy - (value - speed) * pixels, 13, HUD_COLOURS.ink, 'right');
  }
  // Rotate speed: a small R beside the tape while on the ground.
  if (readout.onGround && readout.rotateSpeedKnots > 0) {
    text(ctx, 'R', x + w + 12 * unit, frame.cy - (readout.rotateSpeedKnots - speed) * pixels, 13, HUD_COLOURS.caution);
  }
  ctx.restore();
  // The reading.
  ctx.beginPath();
  ctx.rect(x - 4 * unit, frame.cy - 15 * unit, w - 8 * unit, 30 * unit);
  ctx.fillStyle = 'rgba(4, 10, 6, 0.8)';
  ctx.fill();
  stroke(ctx, 1.5, HUD_COLOURS.bright);
  text(ctx, String(Math.round(speed)), x + w - 18 * unit, frame.cy, 19, speed < readout.stallSpeedKnots && !readout.onGround ? HUD_COLOURS.warn : HUD_COLOURS.bright, 'right');
  text(ctx, 'KT', x + w * 0.5, y - 12 * unit, 12);
  text(ctx, `GS ${Math.round(readout.groundSpeedKnots)}`, x + w * 0.5, y + h + 14 * unit, 12);
  if (options.jet || readout.mach > 0.4) text(ctx, `M ${Number.isFinite(readout.mach) ? readout.mach.toFixed(2) : '-.--'}`, x + w * 0.5, y + h + 32 * unit, 14, HUD_COLOURS.bright);
  text(ctx, `G ${Number.isFinite(readout.loadFactor) ? readout.loadFactor.toFixed(1) : '-'}`, x + w * 0.5, y + h + (options.jet || readout.mach > 0.4 ? 50 : 32) * unit, 12);
  // Throttle: a column left of the tape, with the afterburner mark above it.
  const tx = x - 26 * unit;
  const throttle = Math.max(0, Math.min(100, Number.isFinite(readout.throttlePercent) ? readout.throttlePercent : 0));
  plate(ctx, tx, y, 10 * unit, h);
  ctx.fillStyle = readout.afterburner ? HUD_COLOURS.caution : HUD_COLOURS.ink;
  ctx.fillRect(tx, y + h * (1 - throttle / 100), 10 * unit, h * throttle / 100);
  ctx.beginPath();
  ctx.rect(tx, y, 10 * unit, h);
  stroke(ctx, 1.2);
  text(ctx, `${Math.round(throttle)}%`, tx + 5 * unit, y + h + 14 * unit, 12);
  text(ctx, readout.afterburner ? 'A/B' : 'THR', tx + 5 * unit, y - 12 * unit, 12, readout.afterburner ? HUD_COLOURS.caution : HUD_COLOURS.ink);
}

function paintAltitudeTape(ctx, readout, frame) {
  const w = 86 * unit;
  const h = frame.height * 0.44;
  const x = frame.cx + frame.width * 0.3;
  const y = frame.cy - h / 2;
  const altitude = Number.isFinite(readout.altitudeFeet) ? readout.altitudeFeet : 0;
  const step = 100;
  const span = 500;
  const pixels = h / (span * 2);
  plate(ctx, x, y, w, h);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  tapeTicks(altitude, step, span, -1000, ticks);
  ctx.beginPath();
  for (let i = 0; i < ticks.count; i += 1) {
    const ty = frame.cy - (ticks.first + i * step - altitude) * pixels;
    ctx.moveTo(x + 6 * unit, ty);
    ctx.lineTo(x + 14 * unit, ty);
  }
  stroke(ctx, 1.3);
  for (let i = 0; i < ticks.count; i += 1) {
    const value = ticks.first + i * step;
    if (Math.round(value / step) % 2 !== 0) continue;
    text(ctx, thousands(value), x + 20 * unit, frame.cy - (value - altitude) * pixels, 13, HUD_COLOURS.ink, 'left');
  }
  ctx.restore();
  ctx.beginPath();
  ctx.rect(x + 10 * unit, frame.cy - 15 * unit, w - 6 * unit, 30 * unit);
  ctx.fillStyle = 'rgba(4, 10, 6, 0.8)';
  ctx.fill();
  stroke(ctx, 1.5, HUD_COLOURS.bright);
  text(ctx, thousands(Math.round(altitude / 10) * 10), x + 18 * unit, frame.cy, 18, HUD_COLOURS.bright, 'left');
  text(ctx, 'FT', x + w * 0.5, y - 12 * unit, 12);
  if (readout.radarAltitudeFeet < 2500) text(ctx, `R ${thousands(Math.round(readout.radarAltitudeFeet / 10) * 10)}`, x + w * 0.5, y + h + 14 * unit, 14, HUD_COLOURS.bright);
  // Vertical speed: a column right of the tape, +-2,000 ft/min over its height (jets read more as a number).
  const vx = x + w + 14 * unit;
  const vs = Number.isFinite(readout.verticalSpeedFpm) ? readout.verticalSpeedFpm : 0;
  const share = Math.max(-1, Math.min(1, vs / 2000));
  ctx.beginPath();
  ctx.moveTo(vx, y + h * 0.15);
  ctx.lineTo(vx, y + h * 0.85);
  ctx.moveTo(vx - 4 * unit, frame.cy);
  ctx.lineTo(vx + 4 * unit, frame.cy);
  stroke(ctx, 1.2);
  ctx.beginPath();
  ctx.moveTo(vx + 12 * unit, frame.cy - share * h * 0.35);
  ctx.lineTo(vx + 2 * unit, frame.cy - share * h * 0.35 - 5 * unit);
  ctx.lineTo(vx + 2 * unit, frame.cy - share * h * 0.35 + 5 * unit);
  ctx.closePath();
  stroke(ctx, 1.4, HUD_COLOURS.bright);
  const rounded = Math.round(vs / 50) * 50;
  text(ctx, `${rounded > 0 ? '+' : ''}${rounded}`, vx + 6 * unit, y + h * (share >= 0 ? 0.92 : 0.08), 12, HUD_COLOURS.bright);
}

function paintHeadingTape(ctx, readout, frame, options) {
  const w = frame.width * 0.34;
  const y = Math.max(34 * unit, frame.height * 0.085);
  const heading = Number.isFinite(readout.headingDegrees) ? readout.headingDegrees : 0;
  const span = 30;
  const pixels = w / (span * 2);
  const x0 = frame.cx - w / 2;
  plate(ctx, x0, y - 4 * unit, w, 30 * unit);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y - 12 * unit, w, 44 * unit);
  ctx.clip();
  const first = Math.ceil((heading - span) / 5) * 5;
  ctx.beginPath();
  for (let d = first; d <= heading + span; d += 5) {
    const tx = frame.cx + (d - heading) * pixels;
    ctx.moveTo(tx, y);
    ctx.lineTo(tx, y + (d % 10 === 0 ? 9 : 5) * unit);
  }
  stroke(ctx, 1.3);
  for (let d = first; d <= heading + span; d += 5) {
    if (d % 30 !== 0 && !(d % 10 === 0 && pixels * 10 > 34 * unit)) continue;
    text(ctx, headingTickLabel(d), frame.cx + (d - heading) * pixels, y + 18 * unit, d % 90 === 0 ? 14 : 12, d % 90 === 0 ? HUD_COLOURS.bright : HUD_COLOURS.ink);
  }
  ctx.restore();
  // The autopilot's heading bug and the waypoint's bearing, pinned to the tape's ends when off it.
  const ap = readout.autopilot;
  if (ap && (ap.engaged || ap.lateral)) {
    const off = Math.max(-span, Math.min(span, headingDifference(ap.headingDegrees, heading)));
    const bx = frame.cx + off * pixels;
    ctx.beginPath();
    ctx.moveTo(bx - 7 * unit, y - 2 * unit);
    ctx.lineTo(bx - 7 * unit, y - 9 * unit);
    ctx.lineTo(bx + 7 * unit, y - 9 * unit);
    ctx.lineTo(bx + 7 * unit, y - 2 * unit);
    ctx.lineTo(bx, y - 6 * unit);
    ctx.closePath();
    stroke(ctx, 1.4, HUD_COLOURS.bug);
  }
  if (options.waypointBearing !== null && options.waypointBearing !== undefined) {
    const off = Math.max(-span, Math.min(span, headingDifference(options.waypointBearing, heading)));
    const wx = frame.cx + off * pixels;
    ctx.beginPath();
    ctx.moveTo(wx, y + 28 * unit);
    ctx.lineTo(wx - 6 * unit, y + 38 * unit);
    ctx.lineTo(wx + 6 * unit, y + 38 * unit);
    ctx.closePath();
    stroke(ctx, 1.4, HUD_COLOURS.caution);
  }
  ctx.beginPath();
  ctx.rect(frame.cx - 26 * unit, y - 30 * unit, 52 * unit, 22 * unit);
  ctx.fillStyle = 'rgba(4, 10, 6, 0.8)';
  ctx.fill();
  stroke(ctx, 1.5, HUD_COLOURS.bright);
  text(ctx, headingText(heading), frame.cx, y - 19 * unit, 16, HUD_COLOURS.bright);
}

function paintStatusLines(ctx, readout, frame, options) {
  const y = frame.height - Math.max(26 * unit, frame.height * 0.06);
  const flaps = Math.round(Number.isFinite(readout.flapsDegrees) ? readout.flapsDegrees : 0);
  const trim = Math.round(Number.isFinite(readout.trimPercent) ? readout.trimPercent : 0);
  const gear = !options.retractableGear ? '' : readout.gearInTransit ? 'GEAR ---' : readout.gearDown ? 'GEAR DN' : 'GEAR UP';
  let x = frame.cx - 250 * unit;
  const cell = (value, colour) => {
    if (!value) return;
    text(ctx, value, x, y, 14, colour ?? HUD_COLOURS.ink, 'left');
    x += (value.length * 9 + 22) * unit;
  };
  cell(readout.mode === 'realistic' ? 'SIMULATION' : 'ASSISTED', HUD_COLOURS.bright);
  if (options.flapSteps > 1) cell(`FLAPS ${flaps}`, flaps > 0 ? HUD_COLOURS.bright : HUD_COLOURS.ink);
  cell(gear, readout.gearInTransit ? HUD_COLOURS.caution : HUD_COLOURS.ink);
  cell(`TRIM ${trim > 0 ? '+' : ''}${trim}`);
  if (readout.brake) cell('BRAKE', HUD_COLOURS.caution);
  if (options.mode === 'annunciator') cell(`THR ${Math.round(readout.throttlePercent)}%`);
  if (options.autopilotText) text(ctx, options.autopilotText, frame.cx, y - 24 * unit, 15, HUD_COLOURS.bug);
}

function paintWarnings(ctx, frame, options) {
  const w = options.warnings;
  if (!w || !options.flash) return;
  let y = frame.cy - frame.height * 0.2;
  const line = (value, colour) => {
    text(ctx, value, frame.cx, y, 26, colour);
    y += 30 * unit;
  };
  if (w.pullUp) line('PULL UP', HUD_COLOURS.warn);
  if (w.stall) line('STALL', HUD_COLOURS.warn);
  if (w.overspeed) line('OVERSPEED', HUD_COLOURS.warn);
  if (w.gear) line('GEAR', HUD_COLOURS.caution);
  if (w.apOff) line('AP OFF', HUD_COLOURS.caution);
}

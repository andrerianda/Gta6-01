// Draws the flight HUD on Canvas 2D contexts from the instrument readout. Two canvases:
//  - the SCREEN (paintFlightHud): a clean picture. In the cockpit the aircraft's own instruments and
//    its combiner glass carry the symbology, so the screen shows only the small speed / altitude
//    readout lower right, one warning word while a warning is up, and in SIMULATION one tidy strip
//    (heading, vertical speed, throttle, flaps, gear, autopilot). Outside the cockpit ASSISTED adds a
//    small horizon ball; SIMULATION draws a restrained HUD (ladder, boxed speed and altitude,
//    heading). Every piece stays inside its slot of flightHudLayout.flightScreenSlots.
//  - the COMBINER GLASS of the cockpit model (paintCombinerHud): few, bold green symbols on a small
//    canvas that is the glass itself.
// The maths is flightHudLayout.js; this file only draws, and allocates nothing but short strings.
import {
  LADDER, firstLadderRung, flightPathMarkerOffset, flightScreenSlots, headingDifference, headingText, ladderRungPosition,
  screenHudParts, spacedThousands, stripCells, thousands, topWarning,
} from './flightHudLayout.js';

/** The HUD's colours: the green symbology, and the game HUD's cream, gold and coral for the readout. */
export const HUD_COLOURS = Object.freeze({
  ink: '#b6ffb0', bright: '#f2fff0', outline: 'rgba(6, 14, 8, 0.85)', warn: '#ff5a4a', caution: '#ffc94a',
  bug: '#ff7be9', plate: 'rgba(14, 12, 22, 0.5)', cream: '#fff6e6', gold: '#ffd36b', coral: '#ff6f59',
  glass: '#74ff86', glassGlow: 'rgba(90, 255, 120, 0.55)',
});

/** The game HUD's type (styles/hud.css --hud-font) and the symbology's fixed-width type. */
const HUD_TYPE = '"Segoe UI", "Helvetica Neue", Arial, sans-serif';
const MONO_TYPE = 'ui-monospace, "DejaVu Sans Mono", Menlo, Consolas, monospace';

const DEG = Math.PI / 180;
const NO_DASH = Object.freeze([]);
const rung = { x: 0, y: 0, angle: 0 };
const marker = { x: 0, y: 0 };
const parts = { readout: false, horizon: false, strip: false, fullHud: false };
const cells = [0, 1, 2, 3, 4, 5].map(() => ({ label: '', value: '', level: '' }));
const craft = { retractableGear: false, flapSteps: 1 };
let unit = 1;
let slots = null;
let slotsWidth = 0;
let slotsHeight = 0;

const finite = (value, fallback = 0) => (Number.isFinite(value) ? value : fallback);

function slotsFor(width, height) {
  if (!slots || width !== slotsWidth || height !== slotsHeight) {
    slots = flightScreenSlots(width, height);
    slotsWidth = width;
    slotsHeight = height;
  }
  return slots;
}

/**
 * Paints the screen's flight HUD.
 * @param {CanvasRenderingContext2D} ctx Already scaled so that one unit is one CSS pixel.
 * @param {object} readout From readInstruments.
 * @param {{cx: number, cy: number, unit: number, pixelsPerDegree: number, width: number, height: number}} frame From hudFrame.
 * @param {{mode: 'assisted'|'simulation', view?: 'cockpit'|'chase'|'outside', hasCombiner?: boolean, ownInstruments?: boolean,
 *   warnings: {stall: boolean, pullUp: boolean, overspeed: boolean, gear: boolean, apOff: boolean}, flash: boolean, jet: boolean,
 *   waypointBearing: number|null, autopilotText: string, retractableGear: boolean, flapSteps: number}} options
 *   mode: screenHudModeFor's value (an older caller's 'full' / 'combiner' / 'annunciator' reads the readout's own mode and
 *   counts as a view without a combiner). hasCombiner (or ownInstruments, for a panel that needs no glass): the cockpit
 *   model shows the symbology itself, so the screen draws no ladder, boxes or heading.
 */
export function paintFlightHud(ctx, readout, frame, options = {}) {
  unit = frame.unit;
  ctx.clearRect(0, 0, frame.width, frame.height);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const known = options.mode === 'assisted' || options.mode === 'simulation';
  const mode = known ? options.mode : readout.mode === 'realistic' ? 'simulation' : 'assisted';
  const view = options.view ?? (options.mode === 'combiner' || options.mode === 'annunciator' ? 'cockpit' : 'chase');
  screenHudParts(mode, view, Boolean(options.hasCombiner || options.ownInstruments), parts);
  const s = slotsFor(frame.width, frame.height);
  if (parts.fullHud) {
    paintLadder(ctx, readout, frame, s.ladder);
    paintHeadingBox(ctx, readout, s.heading, options);
    paintSpeedBox(ctx, readout, s, options);
    paintAltitudeBox(ctx, readout, s);
  }
  if (parts.horizon) paintHorizonBall(ctx, readout, s.horizon);
  if (parts.readout) paintReadout(ctx, readout, s);
  if (parts.strip) paintStrip(ctx, readout, s, options);
  paintWarning(ctx, s, options);
}

// ---- the game HUD's type: cream digits with a soft shadow ------------------------------------

function softText(ctx, value, x, y, size, colour, align = 'left', weight = 800) {
  ctx.font = `${weight} ${Math.max(8, Math.round(size))}px ${HUD_TYPE}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
  ctx.shadowBlur = Math.max(3, size * 0.4);
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = Math.max(1, size * 0.06);
  ctx.fillStyle = colour;
  ctx.fillText(value, x, y);
  ctx.shadowBlur = Math.max(1, size * 0.1);        // a second pass firms the edge over a bright sky
  ctx.fillText(value, x, y);
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
}

function roundedPlate(ctx, x, y, w, h, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.fillStyle = HUD_COLOURS.plate;
  ctx.fill();
}

/** Two compact lines, right-aligned in the lower right corner: '286 KT' over '2 450 FT'. */
function paintReadout(ctx, readout, s) {
  const size = s.type;
  const right = s.readout.x + s.readout.w;
  const unitWidth = size * 1.25;
  const speed = Math.max(0, Math.round(finite(readout.airspeedKnots)));
  const altitude = Math.round(finite(readout.altitudeFeet) / 10) * 10;
  const slow = !readout.onGround && (readout.stallWarning || readout.stalled);
  const y1 = s.readout.y + size * 0.65;
  const y2 = s.readout.y + size * 1.85;
  softText(ctx, String(speed), right - unitWidth, y1, size, slow ? HUD_COLOURS.coral : HUD_COLOURS.cream, 'right');
  softText(ctx, 'KT', right, y1 + size * 0.1, size * 0.55, HUD_COLOURS.gold, 'right', 700);
  softText(ctx, spacedThousands(altitude), right - unitWidth, y2, size, HUD_COLOURS.cream, 'right');
  softText(ctx, 'FT', right, y2 + size * 0.1, size * 0.55, HUD_COLOURS.gold, 'right', 700);
}

/** A small attitude ball beside the readout: the ground rises and tilts against the aircraft mark. */
function paintHorizonBall(ctx, readout, box) {
  const r = box.w / 2 - 1;
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const pitch = Math.max(-40, Math.min(40, finite(readout.pitchDegrees)));
  const roll = finite(readout.rollDegrees) * DEG;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(14, 12, 22, 0.42)';
  ctx.fill();
  ctx.clip();
  ctx.translate(cx, cy);
  ctx.rotate(-roll);
  const drop = (pitch / 40) * r;
  ctx.fillStyle = 'rgba(255, 246, 230, 0.3)';
  ctx.fillRect(-r * 2, drop, r * 4, r * 3);
  ctx.beginPath();
  ctx.moveTo(-r * 2, drop);
  ctx.lineTo(r * 2, drop);
  ctx.strokeStyle = HUD_COLOURS.cream;
  ctx.lineWidth = Math.max(1.2, r * 0.07);
  ctx.stroke();
  ctx.restore();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255, 246, 230, 0.85)';
  ctx.lineWidth = Math.max(1.2, r * 0.07);
  ctx.stroke();
  // The aircraft mark: two wings and a dot, in gold.
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.62, cy);
  ctx.lineTo(cx - r * 0.2, cy);
  ctx.moveTo(cx + r * 0.2, cy);
  ctx.lineTo(cx + r * 0.62, cy);
  ctx.strokeStyle = HUD_COLOURS.gold;
  ctx.lineWidth = Math.max(1.6, r * 0.11);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(1.2, r * 0.07), 0, Math.PI * 2);
  ctx.fillStyle = HUD_COLOURS.gold;
  ctx.fill();
}

/** SIMULATION: one strip at the bottom centre; the autopilot's targets sit over it while it flies. */
function paintStrip(ctx, readout, s, options) {
  const box = s.strip;
  const size = s.stripType;
  const rowHeight = size * 1.8;
  const rowY = box.y + box.h - rowHeight;
  craft.retractableGear = Boolean(options.retractableGear);
  craft.flapSteps = options.flapSteps ?? 1;
  stripCells(readout, craft, cells);
  roundedPlate(ctx, box.x, rowY, box.w, rowHeight, size * 0.3);
  const cellWidth = box.w / cells.length;
  for (let i = 0; i < cells.length; i += 1) {
    const cell = cells[i];
    const x = box.x + cellWidth * i + size * 0.55;
    const y = rowY + rowHeight / 2;
    softText(ctx, cell.label, x, y + size * 0.05, size * 0.72, HUD_COLOURS.gold, 'left', 700);
    const labelWidth = ctx.measureText(cell.label).width;
    softText(ctx, cell.value, x + labelWidth + size * 0.4, y, size, cell.level === 'caution' ? HUD_COLOURS.caution : HUD_COLOURS.cream, 'left', cell.level ? 800 : 700);
  }
  if (options.autopilotText) softText(ctx, options.autopilotText, box.x + box.w / 2, box.y + size * 0.85, size * 0.92, HUD_COLOURS.bug, 'center', 700);
}

/** One short centred word, only while a warning is up, blinking with options.flash. */
function paintWarning(ctx, s, options) {
  if (!options.flash) return;
  const top = topWarning(options.warnings);
  if (!top) return;
  const box = s.warning;
  softText(ctx, top.text, box.x + box.w / 2, box.y + box.h / 2, s.warningType, top.level === 'warn' ? HUD_COLOURS.coral : HUD_COLOURS.gold, 'center');
}

// ---- the restrained symbology of the simulation outside the cockpit --------------------------

function stroke(ctx, width = 1.6, colour = HUD_COLOURS.ink) {
  ctx.strokeStyle = HUD_COLOURS.outline;
  ctx.lineWidth = (width + 2.2) * unit;
  ctx.stroke();
  ctx.strokeStyle = colour;
  ctx.lineWidth = width * unit;
  ctx.stroke();
}

function text(ctx, value, x, y, size = 15, colour = HUD_COLOURS.ink, align = 'center') {
  ctx.font = `600 ${Math.max(9, Math.round(size))}px ${MONO_TYPE}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.lineWidth = Math.max(2, size * 0.2);
  ctx.strokeStyle = HUD_COLOURS.outline;
  ctx.strokeText(value, x, y);
  ctx.fillStyle = colour;
  ctx.fillText(value, x, y);
}

function paintLadder(ctx, readout, frame, box) {
  const ppd = frame.pixelsPerDegree;
  const pitch = finite(readout.pitchDegrees);
  const roll = finite(readout.rollDegrees);
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const half = box.w * 0.3;
  const gap = box.w * 0.1;
  const label = Math.max(9, box.w * 0.055);
  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x, box.y, box.w, box.h);
  ctx.clip();
  for (let d = firstLadderRung(pitch); d <= pitch + LADDER.reach && d <= 90; d += LADDER.step) {
    if (d % 10 !== 0) continue;                    // restrained: a rung every ten degrees
    ladderRungPosition(d, pitch, roll, ppd, rung);
    ctx.save();
    ctx.translate(cx + rung.x, cy + rung.y);
    ctx.rotate(rung.angle);
    ctx.beginPath();
    if (d === 0) {
      ctx.moveTo(-box.w, 0);
      ctx.lineTo(-gap, 0);
      ctx.moveTo(gap, 0);
      ctx.lineTo(box.w, 0);
      stroke(ctx, 1.8, HUD_COLOURS.bright);
    } else {
      const tip = (d > 0 ? 7 : -7) * unit;
      if (d < 0) ctx.setLineDash([9 * unit, 6 * unit]);
      ctx.moveTo(-half, tip);
      ctx.lineTo(-half, 0);
      ctx.lineTo(-gap, 0);
      ctx.moveTo(gap, 0);
      ctx.lineTo(half, 0);
      ctx.lineTo(half, tip);
      stroke(ctx);
      ctx.setLineDash(NO_DASH);
      text(ctx, String(Math.abs(d)), half + label * 1.1, 0, label);
    }
    ctx.restore();
  }
  // The flight-path marker, where the aircraft is going.
  if (!readout.onGround) {
    flightPathMarkerOffset(readout.alphaDegrees, readout.slipBall, ppd, marker);
    const x = cx + marker.x;
    const y = cy + marker.y;
    const r = Math.max(4, box.w * 0.022);
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
  // The bank pointer under the slot's top edge: it shows where "up" is.
  const a = -Math.max(-45, Math.min(45, roll)) * DEG;
  const radius = box.h / 2 - 3 * unit;
  ctx.translate(cx, cy);
  ctx.rotate(a);
  ctx.beginPath();
  ctx.moveTo(0, -radius);
  ctx.lineTo(-6 * unit, -radius + 10 * unit);
  ctx.lineTo(6 * unit, -radius + 10 * unit);
  ctx.closePath();
  stroke(ctx, 1.5, HUD_COLOURS.bright);
  ctx.restore();
  // The waterline (where the nose points).
  ctx.beginPath();
  ctx.moveTo(cx - gap * 0.8, cy);
  ctx.lineTo(cx - gap * 0.3, cy);
  ctx.lineTo(cx, cy + gap * 0.3);
  ctx.lineTo(cx + gap * 0.3, cy);
  ctx.lineTo(cx + gap * 0.8, cy);
  stroke(ctx, 1.8, HUD_COLOURS.bright);
}

function digitBox(ctx, x, y, w, h) {
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.fillStyle = 'rgba(4, 10, 6, 0.62)';
  ctx.fill();
  stroke(ctx, 1.5, HUD_COLOURS.bright);
}

function paintSpeedBox(ctx, readout, s, options) {
  const box = s.speedBox;
  const size = s.boxType;
  const h = size * 1.7;
  const speed = Math.max(0, finite(readout.airspeedKnots));
  const slow = speed < readout.stallSpeedKnots && !readout.onGround;
  digitBox(ctx, box.x + 1, box.y + 1, box.w - 2, h - 2);
  text(ctx, String(Math.round(speed)), box.x + box.w - size * 0.45, box.y + h / 2, size, slow ? HUD_COLOURS.warn : HUD_COLOURS.bright, 'right');
  const jet = options.jet || readout.mach > 0.4;
  const under = jet ? `M ${Number.isFinite(readout.mach) ? readout.mach.toFixed(2) : '-.--'}` : `GS ${Math.round(finite(readout.groundSpeedKnots))}`;
  text(ctx, under, box.x + box.w - size * 0.45, box.y + h + size * 0.62, size * 0.66, HUD_COLOURS.ink, 'right');
}

function paintAltitudeBox(ctx, readout, s) {
  const box = s.altitudeBox;
  const size = s.boxType;
  const h = size * 1.7;
  const altitude = finite(readout.altitudeFeet);
  digitBox(ctx, box.x + 1, box.y + 1, box.w - 2, h - 2);
  text(ctx, thousands(Math.round(altitude / 10) * 10), box.x + box.w - size * 0.45, box.y + h / 2, size, HUD_COLOURS.bright, 'right');
  if (readout.radarAltitudeFeet < 2500) {
    text(ctx, `R ${thousands(Math.round(finite(readout.radarAltitudeFeet) / 10) * 10)}`, box.x + box.w - size * 0.45, box.y + h + size * 0.62, size * 0.66, HUD_COLOURS.ink, 'right');
  }
}

/** The heading as boxed digits over a short scale, with the autopilot's bug and the waypoint's caret. */
function paintHeadingBox(ctx, readout, box, options) {
  const heading = finite(readout.headingDegrees);
  const cx = box.x + box.w / 2;
  const boxH = box.h * 0.56;
  const size = boxH * 0.7;
  const boxW = size * 2.9;
  const span = 20;
  const pixels = (box.w / 2 - 2) / span;
  const scaleY = box.y + boxH + box.h * 0.12;
  const tick = box.h * 0.2;
  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x, box.y, box.w, box.h);
  ctx.clip();
  ctx.beginPath();
  const first = Math.ceil((heading - span) / 5) * 5;
  for (let d = first; d <= heading + span; d += 5) {
    const tx = cx + (d - heading) * pixels;
    ctx.moveTo(tx, scaleY);
    ctx.lineTo(tx, scaleY + (d % 10 === 0 ? tick : tick * 0.55));
  }
  stroke(ctx, 1.3);
  const ap = readout.autopilot;
  if (ap && ap.engaged && ap.lateral) {
    const bx = cx + Math.max(-span, Math.min(span, headingDifference(ap.headingDegrees, heading))) * pixels;
    ctx.beginPath();
    ctx.moveTo(bx - tick * 0.5, scaleY + tick);
    ctx.lineTo(bx, scaleY + tick * 0.3);
    ctx.lineTo(bx + tick * 0.5, scaleY + tick);
    stroke(ctx, 1.4, HUD_COLOURS.bug);
  }
  if (options.waypointBearing !== null && options.waypointBearing !== undefined) {
    const wx = cx + Math.max(-span, Math.min(span, headingDifference(options.waypointBearing, heading))) * pixels;
    ctx.beginPath();
    ctx.moveTo(wx - tick * 0.5, scaleY);
    ctx.lineTo(wx, scaleY + tick * 0.7);
    ctx.lineTo(wx + tick * 0.5, scaleY);
    stroke(ctx, 1.4, HUD_COLOURS.caution);
  }
  ctx.restore();
  digitBox(ctx, cx - boxW / 2, box.y + 1, boxW, boxH - 2);
  text(ctx, headingText(heading), cx, box.y + boxH / 2, size, HUD_COLOURS.bright);
}

// ---- the combiner glass ------------------------------------------------------------------------

/**
 * Paints the pilot's head-up symbology for the cockpit model's combiner glass (the `hud_combiner`
 * mesh): a conformal pitch ladder, the waterline and the flight path marker, speed left and
 * altitude right as boxed digits, the heading at the top over a bank pointer, and the warning
 * flashing at the bottom, in HUD green with a faint glow on a transparent canvas. The whole canvas
 * is the glass, small on screen: few, bold symbols, nothing nearer than its margin to an edge.
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} readout The instrument readout (flightInstruments.js).
 * @param {number} width Canvas width, pixels (expected 512).
 * @param {number} height Canvas height, pixels (expected 448).
 * @param {{degreesTall?: number, warnings?: object, flash?: boolean, jet?: boolean, waypointBearing?: number|null}} [options]
 *   degreesTall: the pitch angle the glass spans top to bottom as seen from the eye (for a conformal ladder).
 */
export function paintCombinerHud(ctx, readout, width, height, options = {}) {
  ctx.clearRect(0, 0, width, height);
  const g = combinerGeometry(width, height, options.degreesTall, glass);
  const k = g.scale;
  const pitch = finite(readout.pitchDegrees);
  const roll = finite(readout.rollDegrees);
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = HUD_COLOURS.glass;
  ctx.fillStyle = HUD_COLOURS.glass;
  ctx.lineWidth = Math.max(2, 3 * k);
  ctx.shadowColor = HUD_COLOURS.glassGlow;
  ctx.shadowBlur = 7 * k;

  // The ladder, clipped to the lane between the two boxes.
  ctx.save();
  ctx.beginPath();
  ctx.rect(g.ladder.x, g.ladder.y, g.ladder.w, g.ladder.h);
  ctx.clip();
  const reach = g.ladder.h / g.pixelsPerDegree / 2 + LADDER.step;
  const first = Math.max(-90, Math.ceil((pitch - reach) / LADDER.step) * LADDER.step);
  for (let d = first; d <= pitch + reach && d <= 90; d += LADDER.step) {
    ladderRungPosition(d, pitch, roll, g.pixelsPerDegree, rung);
    ctx.save();
    ctx.translate(g.cx + rung.x, g.cy + rung.y);
    ctx.rotate(rung.angle);
    ctx.beginPath();
    if (d === 0) {
      ctx.moveTo(-g.ladder.w, 0);
      ctx.lineTo(-30 * k, 0);
      ctx.moveTo(30 * k, 0);
      ctx.lineTo(g.ladder.w, 0);
      ctx.stroke();
    } else {
      const tip = (d > 0 ? 10 : -10) * k;
      if (d < 0) ctx.setLineDash([12 * k, 9 * k]);
      ctx.moveTo(-88 * k, tip);
      ctx.lineTo(-88 * k, 0);
      ctx.lineTo(-30 * k, 0);
      ctx.moveTo(30 * k, 0);
      ctx.lineTo(42 * k, 0);
      ctx.stroke();
      ctx.setLineDash(NO_DASH);
      glassText(ctx, String(Math.abs(d)), 70 * k, 0, g.text, 'center');
    }
    ctx.restore();
  }
  ctx.restore();

  // The waterline: where the nose points.
  ctx.beginPath();
  ctx.moveTo(g.cx - 26 * k, g.cy);
  ctx.lineTo(g.cx - 10 * k, g.cy);
  ctx.lineTo(g.cx, g.cy + 10 * k);
  ctx.lineTo(g.cx + 10 * k, g.cy);
  ctx.lineTo(g.cx + 26 * k, g.cy);
  ctx.stroke();
  // The flight path marker: where the aircraft goes, kept on the lane.
  if (!readout.onGround) {
    flightPathMarkerOffset(readout.alphaDegrees, readout.slipBall, g.pixelsPerDegree, marker);
    const r = 11 * k;
    const x = Math.max(g.ladder.x + r * 3, Math.min(g.ladder.x + g.ladder.w - r * 3, g.cx + marker.x));
    const y = Math.max(g.ladder.y + r * 2, Math.min(g.ladder.y + g.ladder.h - r, g.cy + marker.y));
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.moveTo(x - r, y);
    ctx.lineTo(x - r * 2.7, y);
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + r * 2.7, y);
    ctx.moveTo(x, y - r);
    ctx.lineTo(x, y - r * 1.9);
    ctx.stroke();
  }

  // Heading at the top; under it the bank scale and its pointer.
  glassBox(ctx, g.heading);
  glassText(ctx, headingText(readout.headingDegrees), g.heading.x + g.heading.w / 2, g.heading.y + g.heading.h / 2, g.text, 'center');
  ctx.beginPath();
  for (let mark = -30; mark <= 30; mark += 15) {
    const a = mark * DEG;
    const long = mark === 0 ? 14 * k : 9 * k;
    ctx.moveTo(g.cx + Math.sin(a) * g.bankRadius, g.cy - Math.cos(a) * g.bankRadius);
    ctx.lineTo(g.cx + Math.sin(a) * (g.bankRadius - long), g.cy - Math.cos(a) * (g.bankRadius - long));
  }
  ctx.stroke();
  const bank = -Math.max(-40, Math.min(40, roll)) * DEG;
  ctx.save();
  ctx.translate(g.cx, g.cy);
  ctx.rotate(bank);
  ctx.beginPath();
  ctx.moveTo(0, -g.bankRadius + 16 * k);
  ctx.lineTo(-10 * k, -g.bankRadius + 34 * k);
  ctx.lineTo(10 * k, -g.bankRadius + 34 * k);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Speed left, altitude right: boxed digits.
  const speed = Math.max(0, Math.round(finite(readout.airspeedKnots)));
  glassBox(ctx, g.speed);
  glassText(ctx, String(Math.min(9999, speed)), g.speed.x + g.speed.w - 10 * k, g.speed.y + g.speed.h / 2, g.text, 'right');
  const altitude = Math.round(finite(readout.altitudeFeet) / 10) * 10;
  glassBox(ctx, g.altitude);
  glassText(ctx, String(Math.max(-9999, Math.min(99999, altitude))), g.altitude.x + g.altitude.w - 10 * k, g.altitude.y + g.altitude.h / 2, g.text, 'right');

  // The warning, flashing.
  const top = options.flash === false ? null : topWarning(options.warnings);
  if (top) {
    ctx.fillStyle = top.level === 'warn' ? HUD_COLOURS.warn : HUD_COLOURS.caution;
    ctx.shadowColor = 'rgba(255, 110, 80, 0.6)';
    glassText(ctx, top.text, g.cx, g.warning.y + g.warning.h / 2, g.text, 'center');
  }
  ctx.restore();
}

const glass = { scale: 1, cx: 0, cy: 0, pixelsPerDegree: 30, text: 36, margin: 22, bankRadius: 150, ladder: { x: 0, y: 0, w: 0, h: 0 },
  heading: { x: 0, y: 0, w: 0, h: 0 }, speed: { x: 0, y: 0, w: 0, h: 0 }, altitude: { x: 0, y: 0, w: 0, h: 0 }, warning: { x: 0, y: 0, w: 0, h: 0 } };

/**
 * Where the combiner's symbols sit on its canvas (512 x 448 by design; other sizes scale).
 * @param {number} width
 * @param {number} height
 * @param {number} [degreesTall] The pitch angle the glass spans top to bottom (default 14).
 * @param {object} [out]
 */
export function combinerGeometry(width, height, degreesTall, out = {}) {
  const k = Math.min(width / 512, height / 448);
  const margin = 22 * k;
  out.scale = k;
  out.margin = margin;
  out.cx = width / 2;
  out.cy = height / 2 + 12 * k;
  out.pixelsPerDegree = height / Math.max(6, Number.isFinite(degreesTall) && degreesTall > 0 ? degreesTall : 14);
  out.text = Math.max(34 * k, 36 * k);
  const boxH = 54 * k;
  out.heading = place(out.heading, width / 2 - 52 * k, margin, 104 * k, 50 * k);
  out.speed = place(out.speed, margin, out.cy - boxH / 2, 124 * k, boxH);
  out.altitude = place(out.altitude, width - margin - 142 * k, out.cy - boxH / 2, 142 * k, boxH);
  out.warning = place(out.warning, out.speed.x + out.speed.w + 8 * k, height - margin - 46 * k, out.altitude.x - out.speed.x - out.speed.w - 16 * k, 46 * k);
  out.ladder = place(out.ladder, out.speed.x + out.speed.w + 8 * k, out.heading.y + out.heading.h + 38 * k,
    out.altitude.x - out.speed.x - out.speed.w - 16 * k, out.warning.y - 6 * k - (out.heading.y + out.heading.h + 38 * k));
  out.bankRadius = out.cy - (out.heading.y + out.heading.h + 6 * k);
  return out;
}

function place(box, x, y, w, h) {
  const target = box ?? { x: 0, y: 0, w: 0, h: 0 };
  target.x = x;
  target.y = y;
  target.w = w;
  target.h = h;
  return target;
}

function glassBox(ctx, box) {
  ctx.beginPath();
  ctx.rect(box.x + 2, box.y + 2, box.w - 4, box.h - 4);
  ctx.stroke();
}

function glassText(ctx, value, x, y, size, align) {
  ctx.font = `700 ${Math.round(size)}px ${MONO_TYPE}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(value, x, y);
}

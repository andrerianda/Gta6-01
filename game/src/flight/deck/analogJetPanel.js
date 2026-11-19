// The Garza Negra's instruments ('analog_gauges'): 1960s round gauges painted from the live
// readout, white on black with a pointer, ticks, numerals and units. One painter per face, so each
// can sit in its own ring of the cockpit model (ANALOG_JET_FACE_PAINTERS, by mesh name): airspeed,
// Mach, the attitude ball, the altimeter, the heading card, vertical speed, skin temperature with
// its arc from green to red towards 320 C, two exhaust-temperature and two rpm gauges, and fuel.
// paintAnalogJetPanel is the older single quad (the aircraft model's own `instrument_panel`, seen
// from outside and when the cockpit model is missing): the same gauges laid out as a wall, with a
// block of caution lights. Pure functions of the context, the readout and the layout.
import {
  PANEL_COLOURS as C, dialPlace, drawAttitude, drawDialFace, drawDialTicks, drawGauge, drawLabel, drawLamp, drawNeedle, traceNeedle,
} from './gaugeDrawing.js';

const DEG = Math.PI / 180;
/** Skin temperature (C) where the gauge's red arc begins, and the end of its scale. */
export const SKIN_TEMPERATURE_LIMITS = Object.freeze({ caution: 260, limit: 320, scaleEnd: 400 });
const EGT_SCALE = Object.freeze({ min: 0, max: 1000, start: 220, sweep: 280, major: 200, minor: 100, label: (v) => String(v / 100) });
const RPM_SCALE = Object.freeze({ min: 0, max: 110, start: 220, sweep: 280, major: 20, minor: 10, label: (v) => String(v) });

function faceAirspeed(ctx, readout, at, layout) {
  const asi = { min: 0, max: 700, start: 20, sweep: 320, major: 100, minor: 50, label: (v) => String(v / 100) };
  drawGauge(ctx, at, asi, readout.airspeedKnots, {
    caption: 'KNOTS', unit: 'x100', name: 'airspeed', layout,
    arcs: [[readout.stallSpeedKnots * 0.9, readout.stallSpeedKnots, C.red], [readout.neverExceedKnots || 690, 700, C.red]],
  });
}

function faceMach(ctx, readout, at, layout) {
  const maxMach = Math.max(3.4, Math.ceil((readout.maxMach || 3.2) * 5 + 1) / 5);
  const machScale = { min: 0, max: maxMach, start: 30, sweep: 300, major: 0.5, minor: 0.1, label: (v) => v.toFixed(1), labelEvery: 0.5 };
  drawGauge(ctx, at, machScale, readout.mach, { caption: 'MACH', name: 'mach', layout, arcs: [[readout.maxMach || 3.2, maxMach, C.red]] });
  drawLabel(ctx, Number.isFinite(readout.mach) ? readout.mach.toFixed(2) : '-.--', at.x, at.y + at.r * 0.36, at.r * 0.2, C.white, 'center', true);
}

function faceAttitude(ctx, readout, at, layout) {
  drawDialFace(ctx, at.x, at.y, at.r, at.bare === true);
  drawAttitude(ctx, at, readout.pitchDegrees, readout.rollDegrees);
  traceNeedle(layout, 'attitudePitch', readout.pitchDegrees * DEG);
  traceNeedle(layout, 'attitudeRoll', readout.rollDegrees * DEG);
}

/** The altimeter: thousands on the long hand, ten thousands on the short amber one, a counter. */
function faceAltitude(ctx, readout, at, layout) {
  const r = at.r;
  drawDialFace(ctx, at.x, at.y, r, at.bare === true);
  drawDialTicks(ctx, at.x, at.y, r, { min: 0, max: 10, start: 0, sweep: 360, major: 1, minor: 0.5, label: (v) => String(v) });
  drawLabel(ctx, 'ALT x1000 FT', at.x, at.y - r * 0.28, r * 0.11, C.dim);
  const feet = Number.isFinite(readout.altitudeFeet) ? Math.max(0, readout.altitudeFeet) : 0;
  const tenThousands = ((feet / 100000) % 1) * Math.PI * 2;
  const thousands = ((feet / 10000) % 1) * Math.PI * 2;
  drawNeedle(ctx, at.x, at.y, r * 0.45, tenThousands, C.amber, r * 0.05);
  drawNeedle(ctx, at.x, at.y, r * 0.76, thousands, C.needle, r * 0.035);
  traceNeedle(layout, 'altimeterThousands', thousands);
  traceNeedle(layout, 'altimeterTenThousands', tenThousands);
  ctx.fillStyle = '#000';
  ctx.fillRect(at.x - r * 0.32, at.y + r * 0.26, r * 0.64, r * 0.2);
  drawLabel(ctx, String(Math.round(feet / 100) * 100), at.x, at.y + r * 0.36, r * 0.15, C.white);
}

/** The heading card: it turns under a fixed lubber mark; the autopilot's bug rides the card. */
function faceHeading(ctx, readout, at, layout) {
  const r = at.r;
  drawDialFace(ctx, at.x, at.y, r, at.bare === true);
  const heading = Number.isFinite(readout.headingDegrees) ? readout.headingDegrees : 0;
  traceNeedle(layout, 'heading', -heading * DEG);
  ctx.save();
  ctx.translate(at.x, at.y);
  ctx.rotate(-heading * DEG);
  ctx.strokeStyle = C.mark;
  ctx.fillStyle = C.mark;
  ctx.font = `bold ${Math.round(r * 0.18)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let d = 0; d < 360; d += 10) {
    ctx.save();
    ctx.rotate(d * DEG);
    ctx.lineWidth = Math.max(1, r * (d % 30 === 0 ? 0.03 : 0.015));
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.86);
    ctx.lineTo(0, -r * (d % 30 === 0 ? 0.72 : 0.79));
    ctx.stroke();
    if (d % 30 === 0) ctx.fillText(d === 0 ? 'N' : d === 90 ? 'E' : d === 180 ? 'S' : d === 270 ? 'W' : String(d / 10), 0, -r * 0.56);
    ctx.restore();
  }
  if (readout.autopilot.engaged) {
    ctx.rotate(readout.autopilot.headingDegrees * DEG);
    ctx.fillStyle = C.amber;
    ctx.fillRect(-r * 0.07, -r * 0.9, r * 0.14, r * 0.09);
  }
  ctx.restore();
  ctx.fillStyle = C.amber;
  ctx.beginPath();
  ctx.moveTo(at.x, at.y - r * 0.9);
  ctx.lineTo(at.x - r * 0.07, at.y - r * 0.72);
  ctx.lineTo(at.x + r * 0.07, at.y - r * 0.72);
  ctx.closePath();
  ctx.fill();
  // The aircraft mark in the middle of the card.
  ctx.strokeStyle = C.mark;
  ctx.lineWidth = Math.max(1.5, r * 0.03);
  ctx.beginPath();
  ctx.moveTo(at.x, at.y - r * 0.26);
  ctx.lineTo(at.x, at.y + r * 0.26);
  ctx.moveTo(at.x - r * 0.2, at.y + r * 0.02);
  ctx.lineTo(at.x + r * 0.2, at.y + r * 0.02);
  ctx.stroke();
}

function faceVerticalSpeed(ctx, readout, at, layout) {
  const vsi = { min: -6000, max: 6000, start: 100, sweep: 340, major: 2000, minor: 500, label: (v) => String(Math.abs(v) / 1000), labelEvery: 2000 };
  drawGauge(ctx, at, vsi, readout.verticalSpeedFpm, { caption: 'CLIMB', unit: '1000 FT/MIN', name: 'verticalSpeed', layout });
}

/** Skin temperature: the gauge the pilot of a Mach 3 aircraft watches. */
function faceSkinTemperature(ctx, readout, at, layout) {
  const L = SKIN_TEMPERATURE_LIMITS;
  const skin = { min: -100, max: L.scaleEnd, start: 220, sweep: 280, major: 100, minor: 50, label: (v) => String(v) };
  drawGauge(ctx, at, skin, readout.skinTemperatureC, {
    caption: 'SKIN °C', name: 'skinTemperature', layout, arcs: [[-100, L.caution, C.green], [L.caution, L.limit, C.yellow], [L.limit, L.scaleEnd, C.red]],
  });
}

/** One engine's exhaust temperature or rpm; the two engines read a hair apart. */
function faceEngine(ctx, readout, at, layout, right, rpmGauge) {
  const rpm = Number.isFinite(readout.rpmPercent) ? readout.rpmPercent : 0;
  const spread = rpm > 3 ? (right ? 0.4 : -0.4) : 0;
  if (rpmGauge) {
    drawGauge(ctx, at, RPM_SCALE, rpm + spread, { caption: right ? 'RPM R' : 'RPM L', unit: '%', name: right ? 'rpmRight' : 'rpmLeft', layout, arcs: [[100, 110, C.red]] });
    return;
  }
  const egt = Number.isFinite(readout.engineTemperatureC) ? readout.engineTemperatureC : 0;
  drawGauge(ctx, at, EGT_SCALE, egt * (1 + spread * 0.02), {
    caption: right ? 'EGT R' : 'EGT L', unit: '°C x100', name: right ? 'egtRight' : 'egtLeft', layout, arcs: [[850, 1000, C.red]],
  });
}

function faceFuel(ctx, readout, at, layout) {
  const fuel = { min: 0, max: 100, start: 240, sweep: 240, major: 25, minor: 12.5, label: (v) => (v === 0 ? 'E' : v === 100 ? 'F' : v === 50 ? '½' : '') };
  drawGauge(ctx, at, fuel, readout.fuelPercent, { caption: 'FUEL', name: 'fuel', layout, arcs: [[0, 12, C.red]] });
}

const inCell = (face) => (ctx, readout, x, y, w, h, extra, layout) => face(ctx, readout, dialPlace(x, y, w, h), layout ?? null);

/**
 * The painter of each live gauge face of the cockpit model, by mesh name. Each fills the rectangle
 * (x, y, w, h) of the face's atlas cell: the disc's bounding square.
 * @type {Readonly<Record<string, (ctx: CanvasRenderingContext2D, readout: object, x: number, y: number, w: number,
 *   h: number, extra?: object, layout?: object | null) => void>>}
 */
export const ANALOG_JET_FACE_PAINTERS = Object.freeze({
  gauge_airspeed: inCell(faceAirspeed),
  gauge_mach: inCell(faceMach),
  gauge_attitude: inCell(faceAttitude),
  gauge_altitude: inCell(faceAltitude),
  gauge_heading: inCell(faceHeading),
  gauge_vsi: inCell(faceVerticalSpeed),
  gauge_skin_temp: inCell(faceSkinTemperature),
  gauge_egt_l: inCell((ctx, readout, at, layout) => faceEngine(ctx, readout, at, layout, false, false)),
  gauge_egt_r: inCell((ctx, readout, at, layout) => faceEngine(ctx, readout, at, layout, true, false)),
  gauge_rpm_l: inCell((ctx, readout, at, layout) => faceEngine(ctx, readout, at, layout, false, true)),
  gauge_rpm_r: inCell((ctx, readout, at, layout) => faceEngine(ctx, readout, at, layout, true, true)),
  gauge_fuel: inCell(faceFuel),
});

/**
 * Paints the reconnaissance jet's single-quad panel.
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} readout From readInstruments.
 * @param {{width: number, height: number, trace?: Record<string, number>}} layout
 * @param {{radar?: {tracked: boolean, painted: boolean} | null}} [extra] The radar network's picture, for the warning lamp.
 */
export function paintAnalogJetPanel(ctx, readout, layout, extra = null) {
  const W = layout.width;
  const H = layout.height;
  ctx.fillStyle = '#16181a';
  ctx.fillRect(0, 0, W, H);
  const big = Math.min(H * 0.26, W * 0.105);
  const mid = big * 0.78;
  const small = big * 0.56;
  const cx = W * 0.5;
  const rowTop = H * 0.3;
  const rowLow = H * 0.74;

  // Upper row: airspeed, Mach, attitude, altimeter, climb. Lower: engines, skin, heading, fuel.
  faceAttitude(ctx, readout, { x: cx, y: rowTop, r: big }, layout);
  faceMach(ctx, readout, { x: cx - big * 2.25, y: rowTop, r: big }, layout);
  faceAirspeed(ctx, readout, { x: cx - big * 4.25, y: rowTop, r: mid }, layout);
  faceAltitude(ctx, readout, { x: cx + big * 2.25, y: rowTop, r: big }, layout);
  faceVerticalSpeed(ctx, readout, { x: cx + big * 4.25, y: rowTop, r: mid }, layout);
  faceHeading(ctx, readout, { x: cx, y: rowLow, r: mid }, layout);
  faceSkinTemperature(ctx, readout, { x: cx - big * 2.0, y: rowLow, r: mid }, layout);
  for (let i = 0; i < 2; i += 1) {
    const gx = cx - big * 3.6 - i * small * 2.2;
    faceEngine(ctx, readout, { x: gx, y: rowLow - small * 1.08, r: small }, layout, i === 0, false);
    faceEngine(ctx, readout, { x: gx, y: rowLow + small * 1.08, r: small }, layout, i === 0, true);
  }
  faceFuel(ctx, readout, { x: cx + big * 2.0, y: rowLow, r: mid }, layout);

  // Caution lights, right of the fuel gauge: four rows of two.
  const lampW = big * 0.95;
  const lampH = big * 0.3;
  const lx = cx + big * 3.15;
  const ly = rowLow - lampH * 2.2;
  const hot = readout.skinTemperatureC > SKIN_TEMPERATURE_LIMITS.limit;
  const lamps = [
    ['STALL', readout.stallWarning || readout.stalled, C.red], ['SKIN HOT', hot, C.red],
    ['OVERSPD', readout.overspeed, C.red], ['FUEL LOW', readout.fuelPercent < 15, C.amber],
    ['BURNER', readout.afterburner, C.amber], ['GEAR', readout.gearDown || readout.gearInTransit, readout.gearInTransit ? C.amber : C.green],
    ['AUTOPILOT', readout.autopilot.engaged, C.green], ['A/THR', readout.autopilot.autoThrottle, C.green],
  ];
  let lit = 0;
  for (let i = 0; i < lamps.length; i += 1) {
    if (lamps[i][1]) lit += 1;
    drawLamp(ctx, lx + (i % 2) * lampW * 1.06, ly + Math.floor(i / 2) * lampH * 1.12, lampW, lampH, lamps[i][0], Boolean(lamps[i][1]), lamps[i][2]);
  }
  traceNeedle(layout, 'lampsLit', lit);
  // The radar-warning lamp under them: amber while a radar paints the aircraft, red on a held track.
  const radar = extra && extra.radar ? extra.radar : null;
  const warned = Boolean(radar && (radar.tracked || radar.painted));
  drawLamp(ctx, lx, ly + 4 * lampH * 1.12, lampW * 2.06, lampH * 0.85, 'RADAR', warned, radar && radar.tracked ? C.red : C.amber);
  traceNeedle(layout, 'radarWarning', warned ? 1 : 0);
  drawLabel(ctx, `G ${Number.isFinite(readout.loadFactor) ? readout.loadFactor.toFixed(1) : '-'}   THR ${Math.round(readout.throttlePercent)}%`, cx, H * 0.045, H * 0.04, C.dim);
  return layout;
}

// The Gaviota T-2's panel ('analog_six'), painted from the live instrument readout: the six
// standard flight instruments in their two rows (airspeed, attitude, altimeter over turn
// coordinator, heading, vertical speed), then tachometer, fuel, oil temperature, flap and trim
// indicators, an annunciator row along the top and the master switch. A pure function of the
// context, the readout and the layout: the Node tests run it against a recording context.
import { PANEL_COLOURS as C, dialAngle, drawBar, drawAttitude, drawDialFace, drawDialTicks, drawGauge, drawLabel, drawLamp, drawNeedle, traceNeedle } from './gaugeDrawing.js';

const DEG = Math.PI / 180;

/**
 * Paints the trainer's panel.
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} readout From readInstruments (flightInstruments.js).
 * @param {{width: number, height: number, speeds?: {stallClean: number, stallFlaps: number, neverExceed: number},
 *   trace?: Record<string, number>}} layout Canvas size in pixels; the airspeed arcs' knots; `trace`
 *   collects the needle angles by name (tests).
 */
export function paintTrainerSixPackPanel(ctx, readout, layout) {
  const W = layout.width;
  const H = layout.height;
  ctx.fillStyle = C.panel;
  ctx.fillRect(0, 0, W, H);
  const top = H * 0.13;
  const r = Math.min((W * 0.62) / 6.4, (H - top) / 4.3);
  const colX = [W * 0.115, W * 0.115 + r * 2.15, W * 0.115 + r * 4.3];
  const rowY = [top + r * 1.08, top + r * 3.2];
  const power = readout.rpmPercent > 3; // the gyros and the lamps live off the running engine

  // Annunciators.
  const lampW = W * 0.085;
  const lampH = H * 0.07;
  const lamps = [
    ['STALL', readout.stallWarning || readout.stalled, C.red], ['LOW FUEL', readout.fuelPercent < 15, C.amber],
    ['BRAKE', readout.brake && readout.onGround, C.amber], ['FLAPS', readout.flapsDegrees > 0.5, C.green],
    ['AP', readout.autopilot.engaged, C.green], ['OVERSPD', readout.overspeed, C.red],
    ['OIL', readout.engineTemperatureC > 118, C.red], ['ALT', power === false, C.amber],
  ];
  for (let i = 0; i < lamps.length; i += 1) {
    drawLamp(ctx, W * 0.03 + i * lampW * 1.08, H * 0.025, lampW, lampH, lamps[i][0], Boolean(lamps[i][1]), lamps[i][2]);
  }
  drawLabel(ctx, 'GAVIOTA T-2', W * 0.9, H * 0.06, H * 0.045, C.dim);

  // 1. Airspeed.
  const speeds = layout.speeds ?? { stallClean: readout.stallSpeedKnots, stallFlaps: readout.stallSpeedKnots * 0.87, neverExceed: readout.neverExceedKnots };
  const asi = { min: 0, max: Math.max(160, Math.ceil(speeds.neverExceed / 20) * 20 + 20), start: 20, sweep: 320, major: 20, minor: 10, label: (v) => (v >= 40 ? String(v) : '') };
  drawGauge(ctx, { x: colX[0], y: rowY[0], r }, asi, readout.airspeedKnots, {
    caption: 'AIRSPEED', unit: 'KNOTS', name: 'airspeed', layout,
    arcs: [
      [speeds.stallFlaps, Math.min(speeds.stallClean * 1.75, speeds.neverExceed * 0.55), C.white],
      [speeds.stallClean, speeds.neverExceed * 0.78, C.green],
      [speeds.neverExceed * 0.78, speeds.neverExceed, C.yellow],
      [speeds.neverExceed, speeds.neverExceed + 2.5, C.red],
    ],
  });

  // 2. Attitude.
  drawDialFace(ctx, colX[1], rowY[0], r);
  drawAttitude(ctx, { x: colX[1], y: rowY[0], r }, power ? readout.pitchDegrees : 0, power ? readout.rollDegrees : 0);
  traceNeedle(layout, 'attitudePitch', readout.pitchDegrees * DEG);
  traceNeedle(layout, 'attitudeRoll', readout.rollDegrees * DEG);

  // 3. Altimeter: three hands (hundreds, thousands, ten thousands) and the setting window.
  const ax = colX[2];
  const ay = rowY[0];
  drawDialFace(ctx, ax, ay, r);
  drawDialTicks(ctx, ax, ay, r, { min: 0, max: 10, start: 0, sweep: 360, major: 1, minor: 0.2, label: (v) => String(v) });
  drawLabel(ctx, 'ALT', ax, ay - r * 0.3, r * 0.14, C.dim);
  ctx.fillStyle = '#000';
  ctx.fillRect(ax + r * 0.22, ay - r * 0.09, r * 0.4, r * 0.18);
  drawLabel(ctx, '1013', ax + r * 0.42, ay, r * 0.13, C.mark);
  const feet = Number.isFinite(readout.altitudeFeet) ? Math.max(0, readout.altitudeFeet) : 0;
  const tenThousands = ((feet / 100000) % 1) * Math.PI * 2;
  const thousands = ((feet / 10000) % 1) * Math.PI * 2;
  const hundreds = ((feet / 1000) % 1) * Math.PI * 2;
  drawNeedle(ctx, ax, ay, r * 0.34, tenThousands, C.dim, r * 0.05);
  drawNeedle(ctx, ax, ay, r * 0.5, thousands, C.needle, r * 0.055);
  drawNeedle(ctx, ax, ay, r * 0.78, hundreds, C.needle, r * 0.03);
  traceNeedle(layout, 'altimeterHundreds', hundreds);
  traceNeedle(layout, 'altimeterThousands', thousands);

  // 4. Turn coordinator with the slip ball.
  const tx = colX[0];
  const ty = rowY[1];
  drawDialFace(ctx, tx, ty, r);
  ctx.strokeStyle = C.mark;
  ctx.lineWidth = Math.max(1, r * 0.035);
  for (const side of [-1, 1]) {
    for (const mark of [0, 20]) { // level, and the standard-rate mark
      const a = (side * (90 - mark)) * DEG;
      ctx.beginPath();
      ctx.moveTo(tx + Math.sin(a) * r * 0.72, ty - Math.cos(a) * r * 0.72);
      ctx.lineTo(tx + Math.sin(a) * r * 0.86, ty - Math.cos(a) * r * 0.86);
      ctx.stroke();
    }
  }
  const needle = Number.isFinite(readout.turnNeedle) ? Math.max(-1, Math.min(1, readout.turnNeedle)) : 0;
  const tilt = needle * 40 * DEG; // 0.5 (standard rate) meets the 20 degree mark
  traceNeedle(layout, 'turn', tilt);
  ctx.save();
  ctx.translate(tx, ty - r * 0.05);
  ctx.rotate(tilt);
  ctx.fillStyle = C.needle;
  ctx.fillRect(-r * 0.62, -r * 0.03, r * 1.24, r * 0.06);
  ctx.fillRect(-r * 0.03, -r * 0.22, r * 0.06, r * 0.22);
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  const ball = Number.isFinite(readout.slipBall) ? Math.max(-1, Math.min(1, readout.slipBall)) : 0;
  ctx.fillStyle = '#d8d5c8';
  ctx.fillRect(tx - r * 0.5, ty + r * 0.38, r, r * 0.2);
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.arc(tx + ball * r * 0.4, ty + r * 0.48, r * 0.09, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 1;
  ctx.strokeRect(tx - r * 0.11, ty + r * 0.38, r * 0.22, r * 0.2);
  traceNeedle(layout, 'slipBall', ball);
  drawLabel(ctx, 'L', tx - r * 0.6, ty + r * 0.2, r * 0.13, C.dim);
  drawLabel(ctx, 'R', tx + r * 0.6, ty + r * 0.2, r * 0.13, C.dim);
  drawLabel(ctx, '2 MIN', tx, ty + r * 0.72, r * 0.11, C.dim);

  // 5. Heading indicator: the card turns under a fixed lubber line; the autopilot bug rides the card.
  const hx = colX[1];
  const hy = rowY[1];
  drawDialFace(ctx, hx, hy, r);
  const heading = Number.isFinite(readout.headingDegrees) ? readout.headingDegrees : 0;
  traceNeedle(layout, 'heading', -heading * DEG);
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(-heading * DEG);
  ctx.strokeStyle = C.mark;
  ctx.fillStyle = C.mark;
  ctx.font = `${Math.round(r * 0.17)}px sans-serif`;
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
    if (d % 30 === 0) ctx.fillText(d === 0 ? 'N' : d === 90 ? 'E' : d === 180 ? 'S' : d === 270 ? 'W' : String(d / 10), 0, -r * 0.58);
    ctx.restore();
  }
  if (readout.autopilot.engaged || readout.autopilot.lateral) {
    ctx.rotate(readout.autopilot.headingDegrees * DEG);
    ctx.fillStyle = C.amber;
    ctx.fillRect(-r * 0.07, -r * 0.9, r * 0.14, r * 0.09);
  }
  ctx.restore();
  ctx.fillStyle = C.amber;
  ctx.beginPath();
  ctx.moveTo(hx, hy - r * 0.9);
  ctx.lineTo(hx - r * 0.06, hy - r * 0.74);
  ctx.lineTo(hx + r * 0.06, hy - r * 0.74);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = C.amber;
  ctx.lineWidth = Math.max(1.5, r * 0.03);
  ctx.beginPath();
  ctx.moveTo(hx, hy - r * 0.3);
  ctx.lineTo(hx, hy + r * 0.3);
  ctx.moveTo(hx - r * 0.25, hy);
  ctx.lineTo(hx + r * 0.25, hy);
  ctx.stroke();

  // 6. Vertical speed: zero at nine o'clock, climb over the top, 2,000 ft/min each way.
  const vsi = { min: -2000, max: 2000, start: 100, sweep: 340, major: 500, minor: 100, label: (v) => String(Math.abs(v) / 100), labelEvery: 500 };
  drawGauge(ctx, { x: colX[2], y: rowY[1], r }, vsi, readout.verticalSpeedFpm, { caption: 'VERT SPEED', unit: '100 FT/MIN', name: 'verticalSpeed', layout });

  // Engine and systems, right of the six.
  const ex = W * 0.115 + r * 6.45;
  const small = Math.min(r * 0.72, (W - ex) * 0.3);
  const tach = { min: 0, max: 30, start: 220, sweep: 280, major: 5, minor: 1, label: (v) => String(v) };
  const rpmHundreds = readout.rpmPercent * 0.27; // 100 percent = 2,700 rpm
  drawGauge(ctx, { x: ex + small, y: rowY[0] - r * 0.25, r: small }, tach, rpmHundreds, {
    caption: 'RPM', unit: 'x100', name: 'tachometer', layout, arcs: [[21, 25, C.green], [27, 27.6, C.red]],
  });
  const fuel = { min: 0, max: 100, start: 240, sweep: 240, major: 50, minor: 25, label: (v) => (v === 0 ? 'E' : v === 100 ? 'F' : '½') };
  drawGauge(ctx, { x: ex + small * 3.15, y: rowY[0] - r * 0.25, r: small }, fuel, readout.fuelPercent, { caption: 'FUEL', name: 'fuel', layout, arcs: [[0, 12, C.red]] });
  const oil = { min: 40, max: 130, start: 240, sweep: 240, major: 30, minor: 10, label: (v) => String(v) };
  drawGauge(ctx, { x: ex + small, y: rowY[0] + small * 2.05 - r * 0.25, r: small }, oil, readout.engineTemperatureC, {
    caption: 'OIL °C', name: 'oilTemperature', layout, arcs: [[60, 110, C.green], [118, 130, C.red]],
  });
  const thr = { min: 0, max: 100, start: 240, sweep: 240, major: 50, minor: 10, label: (v) => String(v) };
  drawGauge(ctx, { x: ex + small * 3.15, y: rowY[0] + small * 2.05 - r * 0.25, r: small }, thr, readout.throttlePercent, { caption: 'POWER %', name: 'throttle', layout });

  // Flap and trim indicators, the gear lamps (fixed gear: three greens) and the master switch.
  const stripY = H * 0.86;
  drawLabel(ctx, 'FLAPS', ex + small * 0.5, stripY - H * 0.05, H * 0.035, C.dim);
  drawBar(ctx, ex, stripY, small * 1.6, H * 0.04, readout.flapsDegrees / 30, C.white, false);
  traceNeedle(layout, 'flaps', readout.flapsDegrees / 30);
  drawLabel(ctx, `${Math.round(readout.flapsDegrees)}°`, ex + small * 1.9, stripY + H * 0.02, H * 0.04, C.mark, 'left');
  drawLabel(ctx, 'TRIM', ex + small * 3.2, stripY - H * 0.05, H * 0.035, C.dim);
  const trimX = ex + small * 2.5;
  const trimW = small * 1.6;
  ctx.fillStyle = '#14171a';
  ctx.fillRect(trimX, stripY, trimW, H * 0.04);
  ctx.strokeStyle = C.bezelLight;
  ctx.strokeRect(trimX, stripY, trimW, H * 0.04);
  ctx.fillStyle = C.green;
  ctx.fillRect(trimX + trimW * 0.46, stripY, trimW * 0.08, H * 0.04); // the take-off band
  const trim = Math.max(-100, Math.min(100, Number.isFinite(readout.trimPercent) ? readout.trimPercent : 0)) / 100;
  ctx.fillStyle = C.needle;
  ctx.fillRect(trimX + trimW * (0.5 + trim * 0.48) - 2, stripY - 3, 4, H * 0.04 + 6);
  traceNeedle(layout, 'trim', trim);
  drawLamp(ctx, W * 0.03, H * 0.9, W * 0.07, H * 0.07, 'MASTER', power, C.green);
  drawLabel(ctx, readout.mode === 'realistic' ? 'SIMULATION' : 'ASSISTED', W * 0.03 + W * 0.035, H * 0.865, H * 0.03, C.dim);
  return layout;
}

/** The trainer airspeed dial's scale for a never-exceed speed (what the painter uses; for tests). */
export function trainerAirspeedAngle(knots, neverExceedKnots) {
  const max = Math.max(160, Math.ceil(neverExceedKnots / 20) * 20 + 20);
  return dialAngle(knots, 0, max, 20, 320);
}

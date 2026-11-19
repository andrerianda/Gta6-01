// The Garza Negra's panel ('analog_gauges'): a 1960s wall of round gauges painted from the live
// readout. A large Mach meter in the middle with the attitude ball above the heading card; airspeed
// and altimeter either side; vertical speed; skin temperature with its arc from green to red
// towards 320 C; two exhaust-temperature and two rpm gauges; fuel; and a block of caution lights.
// A pure function of the context, the readout and the layout.
import { PANEL_COLOURS as C, drawAttitude, drawDialFace, drawDialTicks, drawGauge, drawLabel, drawLamp, drawNeedle, traceNeedle } from './gaugeDrawing.js';

const DEG = Math.PI / 180;
/** Skin temperature (C) where the gauge's red arc begins, and the end of its scale. */
export const SKIN_TEMPERATURE_LIMITS = Object.freeze({ caution: 260, limit: 320, scaleEnd: 400 });

/**
 * Paints the reconnaissance jet's panel.
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} readout From readInstruments.
 * @param {{width: number, height: number, trace?: Record<string, number>}} layout
 */
export function paintAnalogJetPanel(ctx, readout, layout) {
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

  // Centre column: attitude over the heading card, the Mach meter left of them.
  drawDialFace(ctx, cx, rowTop, big);
  drawAttitude(ctx, { x: cx, y: rowTop, r: big }, readout.pitchDegrees, readout.rollDegrees);
  traceNeedle(layout, 'attitudePitch', readout.pitchDegrees * DEG);
  traceNeedle(layout, 'attitudeRoll', readout.rollDegrees * DEG);

  const maxMach = Math.max(3.4, Math.ceil((readout.maxMach || 3.2) * 5 + 1) / 5);
  const machScale = { min: 0, max: maxMach, start: 30, sweep: 300, major: 0.5, minor: 0.1, label: (v) => v.toFixed(1), labelEvery: 0.5 };
  drawGauge(ctx, { x: cx - big * 2.25, y: rowTop, r: big }, machScale, readout.mach, {
    caption: 'MACH', name: 'mach', layout, arcs: [[readout.maxMach || 3.2, maxMach, C.red]],
  });
  drawLabel(ctx, Number.isFinite(readout.mach) ? readout.mach.toFixed(2) : '-.--', cx - big * 2.25, rowTop + big * 0.36, big * 0.2, C.white, 'center', true);

  // Airspeed (knots, to 700 indicated) and the three-hand altimeter in thousands and ten thousands.
  const asi = { min: 0, max: 700, start: 20, sweep: 320, major: 100, minor: 50, label: (v) => String(v / 100) };
  drawGauge(ctx, { x: cx - big * 4.25, y: rowTop, r: mid }, asi, readout.airspeedKnots, {
    caption: 'KNOTS', unit: 'x100', name: 'airspeed', layout,
    arcs: [[readout.stallSpeedKnots * 0.9, readout.stallSpeedKnots, C.red], [readout.neverExceedKnots || 690, 700, C.red]],
  });
  const ax = cx + big * 2.25;
  drawDialFace(ctx, ax, rowTop, big);
  drawDialTicks(ctx, ax, rowTop, big, { min: 0, max: 10, start: 0, sweep: 360, major: 1, minor: 0.5, label: (v) => String(v) });
  drawLabel(ctx, 'ALT x1000 FT', ax, rowTop - big * 0.28, big * 0.11, C.dim);
  const feet = Number.isFinite(readout.altitudeFeet) ? Math.max(0, readout.altitudeFeet) : 0;
  const tenThousands = ((feet / 100000) % 1) * Math.PI * 2;
  const thousands = ((feet / 10000) % 1) * Math.PI * 2;
  drawNeedle(ctx, ax, rowTop, big * 0.45, tenThousands, C.amber, big * 0.05);
  drawNeedle(ctx, ax, rowTop, big * 0.76, thousands, C.needle, big * 0.035);
  traceNeedle(layout, 'altimeterThousands', thousands);
  traceNeedle(layout, 'altimeterTenThousands', tenThousands);
  ctx.fillStyle = '#000';
  ctx.fillRect(ax - big * 0.32, rowTop + big * 0.26, big * 0.64, big * 0.2);
  drawLabel(ctx, String(Math.round(feet / 100) * 100), ax, rowTop + big * 0.36, big * 0.15, C.white);

  const vsi = { min: -6000, max: 6000, start: 100, sweep: 340, major: 2000, minor: 500, label: (v) => String(Math.abs(v) / 1000), labelEvery: 2000 };
  drawGauge(ctx, { x: cx + big * 4.25, y: rowTop, r: mid }, vsi, readout.verticalSpeedFpm, { caption: 'CLIMB', unit: '1000 FT/MIN', name: 'verticalSpeed', layout });

  // Lower row: the heading card under the attitude ball.
  drawDialFace(ctx, cx, rowLow, mid);
  const heading = Number.isFinite(readout.headingDegrees) ? readout.headingDegrees : 0;
  traceNeedle(layout, 'heading', -heading * DEG);
  ctx.save();
  ctx.translate(cx, rowLow);
  ctx.rotate(-heading * DEG);
  ctx.strokeStyle = C.mark;
  ctx.fillStyle = C.mark;
  ctx.font = `${Math.round(mid * 0.18)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let d = 0; d < 360; d += 10) {
    ctx.save();
    ctx.rotate(d * DEG);
    ctx.lineWidth = d % 30 === 0 ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(0, -mid * 0.86);
    ctx.lineTo(0, -mid * (d % 30 === 0 ? 0.72 : 0.79));
    ctx.stroke();
    if (d % 30 === 0) ctx.fillText(d === 0 ? 'N' : d === 90 ? 'E' : d === 180 ? 'S' : d === 270 ? 'W' : String(d / 10), 0, -mid * 0.56);
    ctx.restore();
  }
  if (readout.autopilot.engaged) {
    ctx.rotate(readout.autopilot.headingDegrees * DEG);
    ctx.fillStyle = C.amber;
    ctx.fillRect(-mid * 0.07, -mid * 0.9, mid * 0.14, mid * 0.09);
  }
  ctx.restore();
  ctx.fillStyle = C.amber;
  ctx.beginPath();
  ctx.moveTo(cx, rowLow - mid * 0.9);
  ctx.lineTo(cx - mid * 0.07, rowLow - mid * 0.72);
  ctx.lineTo(cx + mid * 0.07, rowLow - mid * 0.72);
  ctx.closePath();
  ctx.fill();

  // Skin temperature: the gauge the pilot of a Mach 3 aircraft watches.
  const L = SKIN_TEMPERATURE_LIMITS;
  const skin = { min: -100, max: L.scaleEnd, start: 220, sweep: 280, major: 100, minor: 50, label: (v) => String(v) };
  drawGauge(ctx, { x: cx - big * 2.0, y: rowLow, r: mid }, skin, readout.skinTemperatureC, {
    caption: 'SKIN °C', name: 'skinTemperature', layout, arcs: [[-100, L.caution, C.green], [L.caution, L.limit, C.yellow], [L.limit, L.scaleEnd, C.red]],
  });

  // Engines: exhaust temperature and rpm, left and right.
  const egtScale = { min: 0, max: 1000, start: 220, sweep: 280, major: 200, minor: 100, label: (v) => String(v / 100) };
  const rpmScale = { min: 0, max: 110, start: 220, sweep: 280, major: 20, minor: 10, label: (v) => String(v) };
  const egt = Number.isFinite(readout.engineTemperatureC) ? readout.engineTemperatureC : 0;
  const rpm = Number.isFinite(readout.rpmPercent) ? readout.rpmPercent : 0;
  for (let i = 0; i < 2; i += 1) {
    const gx = cx - big * 3.6 - i * small * 2.2;
    const spread = rpm > 3 ? (i === 0 ? 0.4 : -0.4) : 0;
    drawGauge(ctx, { x: gx, y: rowLow - small * 1.08, r: small }, egtScale, egt * (1 + spread * 0.02), {
      caption: i === 0 ? 'EGT R' : 'EGT L', name: i === 0 ? 'egtRight' : 'egtLeft', layout, arcs: [[850, 1000, C.red]],
    });
    drawGauge(ctx, { x: gx, y: rowLow + small * 1.08, r: small }, rpmScale, rpm + spread, {
      caption: i === 0 ? 'RPM R' : 'RPM L', name: i === 0 ? 'rpmRight' : 'rpmLeft', layout, arcs: [[100, 110, C.red]],
    });
  }

  const fuel = { min: 0, max: 100, start: 240, sweep: 240, major: 25, minor: 12.5, label: (v) => (v === 0 ? 'E' : v === 100 ? 'F' : v === 50 ? '½' : '') };
  drawGauge(ctx, { x: cx + big * 2.0, y: rowLow, r: mid }, fuel, readout.fuelPercent, { caption: 'FUEL', name: 'fuel', layout, arcs: [[0, 12, C.red]] });

  // Caution lights, right of the fuel gauge: four rows of two.
  const lampW = big * 0.95;
  const lampH = big * 0.3;
  const lx = cx + big * 3.15;
  const ly = rowLow - lampH * 2.2;
  const hot = readout.skinTemperatureC > L.limit;
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
  drawLabel(ctx, `G ${Number.isFinite(readout.loadFactor) ? readout.loadFactor.toFixed(1) : '-'}   THR ${Math.round(readout.throttlePercent)}%`, cx, H * 0.045, H * 0.04, C.dim);
  return layout;
}

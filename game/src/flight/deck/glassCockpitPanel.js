// The Manta Sombra's panel ('glass_four'): four large displays side by side, painted from the live
// readout. 1 primary flight display (attitude, speed and altitude tapes, heading, autopilot line);
// 2 map (own ship, the route's legs, heading-up range rings); 3 radar scope with the
// stealth-signature meter (contacts come from the flight deck's setContacts, for the interceptors
// of the final mission); 4 engines and fuel (four engine columns) with the caution list.
// A pure function of the context, the readout, the layout and the extra data.
import { PANEL_COLOURS as C, drawAttitude, drawBar, drawLabel, traceNeedle } from './gaugeDrawing.js';
import { SIGNATURE_DETECTED, stealthSignatureLabel, stealthSignatureOf } from './stealthSignature.js';
import { paintTargetingScreen } from './targetingDisplay.js';

const DEG = Math.PI / 180;
const METRES_PER_NM = 1852;
/** Map ranges in nautical miles; the display picks the smallest that holds the next route point. */
export const MAP_RANGES_NM = Object.freeze([2, 5, 10, 20, 40]);

/**
 * Paints the four displays.
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} readout From readInstruments.
 * @param {{width: number, height: number, trace?: Record<string, number>}} layout
 * @param {{position?: {x: number, z: number}, route?: {points: ArrayLike<number>, count: number} | null,
 *   contacts?: Array<{bearingDegrees: number, distanceNm: number, hostile?: boolean}>, hatchOpen?: boolean,
 *   timeSeconds?: number}} [extra]
 */
export function paintGlassCockpitPanel(ctx, readout, layout, extra = EMPTY) {
  const W = layout.width;
  const H = layout.height;
  ctx.fillStyle = C.panel;
  ctx.fillRect(0, 0, W, H);
  const gap = W * 0.012;
  const w = (W - gap * 5) / 4;
  const h = H - gap * 2;
  for (let i = 0; i < 4; i += 1) {
    const x = gap + i * (w + gap);
    ctx.fillStyle = C.glass;
    ctx.fillRect(x, gap, w, h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, gap, w, h);
    ctx.clip();
    if (i === 0) paintPrimaryFlight(ctx, readout, x, gap, w, h, layout);
    else if (i === 1 && extra.radar?.targeting?.active) paintTargetingScreen(ctx, extra.radar.targeting, x, gap, w, h, layout);
    else if (i === 1) paintMap(ctx, readout, x, gap, w, h, extra, layout);
    else if (i === 2) paintRadar(ctx, readout, x, gap, w, h, extra, layout);
    else paintEngines(ctx, readout, x, gap, w, h, extra, layout);
    ctx.restore();
    ctx.strokeStyle = C.bezelLight;
    ctx.lineWidth = Math.max(1, W * 0.002);
    ctx.strokeRect(x, gap, w, h);
  }
  return layout;
}

const EMPTY = Object.freeze({});

function paintPrimaryFlight(ctx, readout, x, y, w, h, layout) {
  const cx = x + w * 0.5;
  const cy = y + h * 0.46;
  drawAttitude(ctx, { x: cx, y: cy, r: h * 0.3, square: true, w: w * 0.56, h: h * 0.6 }, readout.pitchDegrees, readout.rollDegrees, h * 0.012);
  traceNeedle(layout, 'pfdPitch', readout.pitchDegrees * DEG);
  traceNeedle(layout, 'pfdRoll', readout.rollDegrees * DEG);
  paintTape(ctx, x + w * 0.02, y + h * 0.16, w * 0.17, h * 0.6, readout.airspeedKnots, 10, 4, false);
  paintTape(ctx, x + w * 0.79, y + h * 0.16, w * 0.19, h * 0.6, readout.altitudeFeet, 100, 4, true);
  // Stall band on the speed tape.
  if (readout.stallWarning) drawLabel(ctx, 'STALL', cx, y + h * 0.2, h * 0.07, C.red, 'center', true);
  const hdg = wrap360(readout.headingDegrees);
  drawLabel(ctx, `${pad3(hdg)}°`, cx, y + h * 0.84, h * 0.07, C.white, 'center', true);
  drawLabel(ctx, `M ${fixed(readout.mach, 2)}`, x + w * 0.11, y + h * 0.82, h * 0.05, C.white);
  const vs = Number.isFinite(readout.verticalSpeedFpm) ? Math.round(readout.verticalSpeedFpm / 50) * 50 : 0;
  drawLabel(ctx, `${vs >= 0 ? '+' : ''}${vs}`, x + w * 0.88, y + h * 0.82, h * 0.05, C.white);
  const ap = readout.autopilot;
  const line = ap.engaged ? `AP ${ap.lateral ?? '---'} ${ap.vertical ?? '---'}${ap.autoThrottle ? ' A/THR' : ''}` : 'AP OFF';
  drawLabel(ctx, line, cx, y + h * 0.07, h * 0.055, ap.engaged ? C.green : C.dim, 'center', true);
  if (ap.engaged) drawLabel(ctx, `${pad3(wrap360(ap.headingDegrees))}  ${Math.round(ap.altitudeFeet)} FT`, cx, y + h * 0.93, h * 0.045, C.magenta);
}

function paintTape(ctx, x, y, w, h, value, step, stepsShown, rightSide) {
  ctx.fillStyle = 'rgba(20, 24, 30, 0.85)';
  ctx.fillRect(x, y, w, h);
  const v = Number.isFinite(value) ? value : 0;
  const pixels = h / (stepsShown * 2 * step);
  const first = Math.floor((v - stepsShown * step) / step) * step;
  ctx.strokeStyle = C.white;
  ctx.lineWidth = 1;
  for (let t = first; t <= v + stepsShown * step; t += step) {
    if (t < 0) continue;
    const ty = y + h / 2 - (t - v) * pixels;
    if (ty < y || ty > y + h) continue;
    ctx.beginPath();
    ctx.moveTo(rightSide ? x : x + w, ty);
    ctx.lineTo(rightSide ? x + w * 0.18 : x + w * 0.82, ty);
    ctx.stroke();
    if (Math.round(t / step) % 2 === 0) drawLabel(ctx, String(t), x + w * 0.5, ty, w * 0.24, C.white);
  }
  ctx.fillStyle = '#000';
  ctx.fillRect(x, y + h / 2 - w * 0.2, w, w * 0.4);
  ctx.strokeStyle = C.white;
  ctx.strokeRect(x, y + h / 2 - w * 0.2, w, w * 0.4);
  drawLabel(ctx, String(Math.round(v)), x + w * 0.5, y + h / 2, w * 0.3, C.green, 'center', true);
}

/**
 * The smallest map range (nautical miles) that shows a point `metres` away.
 * @param {number} metres
 * @returns {number}
 */
export function mapRangeFor(metres) {
  const nm = metres / METRES_PER_NM;
  for (const range of MAP_RANGES_NM) if (nm <= range * 0.9) return range;
  return MAP_RANGES_NM[MAP_RANGES_NM.length - 1];
}

/**
 * A world point on a heading-up display centred on the aircraft.
 * @param {number} dx East of the aircraft, metres (+X).
 * @param {number} dz South of the aircraft, metres (+Z).
 * @param {number} headingDegrees The aircraft's compass heading.
 * @param {number} pixelsPerMetre
 * @param {{x: number, y: number}} out Offset from the own-ship symbol in pixels (y down).
 */
export function headingUpOffset(dx, dz, headingDegrees, pixelsPerMetre, out) {
  const h = headingDegrees * DEG;
  const ahead = dx * Math.sin(h) - dz * Math.cos(h);
  const right = dx * Math.cos(h) + dz * Math.sin(h);
  out.x = right * pixelsPerMetre;
  out.y = -ahead * pixelsPerMetre;
  return out;
}

const offset = { x: 0, y: 0 };

function paintMap(ctx, readout, x, y, w, h, extra, layout) {
  const cx = x + w * 0.5;
  const cy = y + h * 0.68;
  const radius = h * 0.58;
  const route = extra.route && extra.route.count > 0 ? extra.route : null;
  const here = extra.position ?? null;
  let range = 10;
  if (route && here) {
    const last = (route.count - 1) * 2;
    range = mapRangeFor(Math.hypot(route.points[last] - here.x, route.points[last + 1] - here.z));
  }
  traceNeedle(layout, 'mapRange', range);
  ctx.strokeStyle = '#2c5d40';
  ctx.lineWidth = 1;
  for (const share of [0.5, 1]) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius * share, Math.PI, Math.PI * 2);
    ctx.stroke();
  }
  drawLabel(ctx, `${range} NM`, cx + radius * 0.72, cy - radius * 0.74, h * 0.04, C.green);
  drawLabel(ctx, `${range / 2}`, cx + radius * 0.37, cy - radius * 0.37, h * 0.035, C.green);
  const heading = wrap360(readout.headingDegrees);
  drawLabel(ctx, `HDG ${pad3(heading)}`, cx, y + h * 0.06, h * 0.055, C.white, 'center', true);
  if (route && here) {
    const scale = radius / (range * METRES_PER_NM);
    ctx.strokeStyle = C.magenta;
    ctx.lineWidth = Math.max(1.5, w * 0.008);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    for (let i = 0; i < route.count; i += 1) {
      headingUpOffset(route.points[i * 2] - here.x, route.points[i * 2 + 1] - here.z, heading, scale, offset);
      ctx.lineTo(cx + offset.x, cy + offset.y);
    }
    ctx.stroke();
    ctx.fillStyle = C.magenta;
    ctx.fillRect(cx + offset.x - 4, cy + offset.y - 4, 8, 8);
    traceNeedle(layout, 'mapTargetX', offset.x);
    traceNeedle(layout, 'mapTargetY', offset.y);
    const nm = readout.autopilot.routeDistanceNm;
    if (nm !== null && nm !== undefined) drawLabel(ctx, `${fixed(nm, 1)} NM`, x + w * 0.84, y + h * 0.06, h * 0.045, C.magenta);
  } else {
    drawLabel(ctx, 'NO ROUTE', cx, y + h * 0.16, h * 0.04, C.dim);
  }
  // Own ship: a small flying wing.
  ctx.fillStyle = C.white;
  ctx.beginPath();
  ctx.moveTo(cx, cy - h * 0.03);
  ctx.lineTo(cx + w * 0.07, cy + h * 0.02);
  ctx.lineTo(cx, cy + h * 0.005);
  ctx.lineTo(cx - w * 0.07, cy + h * 0.02);
  ctx.closePath();
  ctx.fill();
  drawLabel(ctx, `GS ${Math.round(readout.groundSpeedKnots)}`, x + w * 0.16, y + h * 0.06, h * 0.045, C.green);
}

function paintRadar(ctx, readout, x, y, w, h, extra, layout) {
  const cx = x + w * 0.44;
  const cy = y + h * 0.56;
  const radius = Math.min(w * 0.4, h * 0.4);
  ctx.strokeStyle = '#1f6a3a';
  ctx.lineWidth = 1;
  for (const share of [0.33, 0.66, 1]) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius * share, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(cx - radius, cy);
  ctx.lineTo(cx + radius, cy);
  ctx.moveTo(cx, cy - radius);
  ctx.lineTo(cx, cy + radius);
  ctx.stroke();
  // The sweep of the aircraft's own passive scope.
  const sweep = ((extra.timeSeconds ?? 0) * 1.6) % (Math.PI * 2);
  ctx.strokeStyle = C.green;
  ctx.lineWidth = Math.max(1, w * 0.006);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.sin(sweep) * radius, cy - Math.cos(sweep) * radius);
  ctx.stroke();
  const contacts = extra.contacts ?? NO_CONTACTS;
  const heading = wrap360(readout.headingDegrees);
  for (let i = 0; i < contacts.length; i += 1) {
    const contact = contacts[i];
    const share = Math.min(1, contact.distanceNm / RADAR_RANGE_NM);
    const a = (contact.bearingDegrees - heading) * DEG;
    ctx.fillStyle = contact.hostile === false ? C.cyan : C.red;
    ctx.beginPath();
    ctx.arc(cx + Math.sin(a) * radius * share, cy - Math.cos(a) * radius * share, Math.max(3, w * 0.018), 0, Math.PI * 2);
    ctx.fill();
  }
  traceNeedle(layout, 'radarContacts', contacts.length);
  drawLabel(ctx, `RADAR ${RADAR_RANGE_NM} NM`, cx, y + h * 0.06, h * 0.05, C.green, 'center', true);
  drawLabel(ctx, contacts.length ? `${contacts.length} CONTACT${contacts.length > 1 ? 'S' : ''}` : 'CLEAR', cx, y + h * 0.94, h * 0.045, contacts.length ? C.red : C.green);
  // The radar emitters in range (from the radar network): a square at each, its beam turning.
  const radar = extra.radar ?? null;
  const emitterCount = radar ? radar.emitterCount : 0;
  for (let i = 0; i < emitterCount; i += 1) {
    const emitter = radar.emitters[i];
    const share = Math.min(1, emitter.distanceNm / RADAR_RANGE_NM);
    const a = (emitter.bearingDegrees - heading) * DEG;
    const ex = cx + Math.sin(a) * radius * share;
    const ey = cy - Math.cos(a) * radius * share;
    const beam = (emitter.beamBearingDegrees - heading) * DEG;
    const reach = Math.max(radius * 0.12, Math.min(radius * 2, (emitter.reachNm / RADAR_RANGE_NM) * radius));
    ctx.strokeStyle = emitter.painting ? C.red : C.amber;
    ctx.lineWidth = Math.max(1, w * (emitter.painting ? 0.01 : 0.005));
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex + Math.sin(beam) * reach, ey - Math.cos(beam) * reach);
    ctx.stroke();
    const half = Math.max(3, w * 0.016);
    ctx.strokeRect(ex - half, ey - half, half * 2, half * 2);
  }
  traceNeedle(layout, 'radarEmitters', emitterCount);
  // The signature meter: the radar network's model when it is there, else the deck's own estimate.
  const signature = radar ? radar.signature : stealthSignatureOf(readout, extra);
  const threshold = radar ? Math.min(1, radar.threshold) : SIGNATURE_DETECTED;
  const word = radar ? radar.word : stealthSignatureLabel(signature);
  traceNeedle(layout, 'signature', signature);
  const bx = x + w * 0.88;
  const colour = radar
    ? (radar.tracked ? C.red : signature >= threshold || radar.painted ? C.amber : C.green)
    : signature >= SIGNATURE_DETECTED ? C.red : signature >= 0.3 ? C.amber : C.green;
  // (the bar shows the fourth root when the model drives it, as the radars' reach goes: small echoes stay readable)
  drawBar(ctx, bx, y + h * 0.14, w * 0.07, h * 0.66, radar ? Math.sqrt(Math.sqrt(signature)) : signature, colour, true);
  const mark = radar ? Math.sqrt(Math.sqrt(threshold)) : threshold;
  ctx.strokeStyle = C.red;
  ctx.beginPath();
  ctx.moveTo(bx - w * 0.015, y + h * 0.14 + h * 0.66 * (1 - mark));
  ctx.lineTo(bx + w * 0.085, y + h * 0.14 + h * 0.66 * (1 - mark));
  ctx.stroke();
  drawLabel(ctx, 'SIG', bx + w * 0.035, y + h * 0.09, h * 0.04, C.white);
  drawLabel(ctx, word, bx + w * 0.02, y + h * 0.87, h * 0.038, colour, 'center', true);
  if (radar && radar.tracked && ((extra.timeSeconds ?? 0) * 2) % 1 < 0.6) drawLabel(ctx, 'TRACKED', cx, y + h * 0.14, h * 0.06, C.red, 'center', true);
  traceNeedle(layout, 'radarTracked', radar && radar.tracked ? 1 : 0);
}

/** The radar scope's range, nautical miles. */
export const RADAR_RANGE_NM = 20;
const NO_CONTACTS = Object.freeze([]);

function paintEngines(ctx, readout, x, y, w, h, extra, layout) {
  drawLabel(ctx, 'ENGINES', x + w * 0.3, y + h * 0.06, h * 0.05, C.white, 'center', true);
  const rpm = Number.isFinite(readout.rpmPercent) ? readout.rpmPercent : 0;
  const hot = Number.isFinite(readout.engineTemperatureC) ? readout.engineTemperatureC : 0;
  for (let i = 0; i < 4; i += 1) {
    const ex = x + w * (0.06 + i * 0.135);
    // The four engines share one spool state; a small fixed spread makes the columns read as four.
    const each = Math.max(0, Math.min(100, rpm + (rpm > 3 ? (i - 1.5) * 0.6 : 0)));
    drawBar(ctx, ex, y + h * 0.13, w * 0.09, h * 0.42, each / 100, each > 97 ? C.amber : C.green, true);
    drawLabel(ctx, String(Math.round(each)), ex + w * 0.045, y + h * 0.59, h * 0.04, C.white);
    drawLabel(ctx, String(i + 1), ex + w * 0.045, y + h * 0.1, h * 0.032, C.dim);
  }
  traceNeedle(layout, 'engineRpm', rpm / 100);
  drawLabel(ctx, `N1 %   EGT ${Math.round(hot)}°C`, x + w * 0.3, y + h * 0.66, h * 0.038, C.dim);
  drawLabel(ctx, 'FUEL', x + w * 0.74, y + h * 0.1, h * 0.04, C.white);
  drawBar(ctx, x + w * 0.68, y + h * 0.13, w * 0.12, h * 0.42, readout.fuelPercent / 100, readout.fuelPercent < 15 ? C.red : C.cyan, true);
  traceNeedle(layout, 'fuel', readout.fuelPercent / 100);
  drawLabel(ctx, `${Math.round(readout.fuelPercent)}%`, x + w * 0.74, y + h * 0.59, h * 0.04, C.white);
  drawLabel(ctx, `THR ${Math.round(readout.throttlePercent)}%`, x + w * 0.88, y + h * 0.3, h * 0.036, C.white);
  drawLabel(ctx, readout.gearInTransit ? 'GEAR ---' : readout.gearDown ? 'GEAR DN' : 'GEAR UP', x + w * 0.88, y + h * 0.4, h * 0.036,
    readout.gearInTransit ? C.amber : readout.gearDown ? C.green : C.white);
  drawLabel(ctx, `FLAP ${Math.round(readout.flapsDegrees)}`, x + w * 0.88, y + h * 0.5, h * 0.036, C.white);
  // Cautions, most urgent first.
  let row = 0;
  const caution = (text, colour) => {
    if (row >= 5) return;
    drawLabel(ctx, text, x + w * 0.05, y + h * (0.74 + row * 0.05), h * 0.04, colour, 'left', true);
    row += 1;
  };
  if (readout.stalled || readout.stallWarning) caution('STALL', C.red);
  if (readout.overspeed) caution('OVERSPEED', C.red);
  if (readout.fuelPercent < 15) caution('FUEL LOW', C.amber);
  if (extra.radar?.tracked) caution('RADAR TRACKED', C.red);
  if (extra.radar?.bayOpen) caution('BOMB BAY OPEN', C.amber);
  if (extra.hatchOpen) caution('HATCH OPEN', C.amber);
  if (!readout.onGround && readout.gearDown && readout.airspeedKnots > 250) caution('GEAR SPEED', C.amber);
  if (readout.brake && readout.onGround) caution('PARK BRAKE', C.amber);
  if (!readout.autopilot.engaged && !readout.onGround) caution('AP OFF', C.white);
  if (row === 0) caution('NO CAUTIONS', C.green);
  traceNeedle(layout, 'cautions', row);
}

function wrap360(degrees) {
  const d = Number.isFinite(degrees) ? degrees % 360 : 0;
  return d < 0 ? d + 360 : d;
}

function pad3(degrees) {
  const n = Math.round(degrees) % 360;
  return n < 10 ? `00${n}` : n < 100 ? `0${n}` : String(n);
}

function fixed(value, digits) {
  return Number.isFinite(value) ? value.toFixed(digits) : '--';
}

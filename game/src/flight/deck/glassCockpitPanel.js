// The Manta Sombra's displays ('glass_four'), painted from the live readout, one painter per
// display so each can sit behind its own bezel of the cockpit model:
//   display_map       the moving map: track up, a compass arc with the north mark, range rings, the
//                     GPS route's legs and waypoints, ground speed and distance to go;
//   display_radar     the passive scope with its sweep, the contacts (the interceptors of the final
//                     mission, from the flight deck's setContacts), the radar emitters in range and
//                     the stealth-signature meter; the guided bomb's targeting screen takes it over;
//   display_engines   four engines (N1 and EGT columns each), fuel, throttle;
//   display_cautions  the caution tiles, the gear, the flaps, the hatch and the bomb bay.
// All share one look: dark glass, thin cyan, green and amber line work, small crisp labels and the
// soft-key legends along the bezel edges (gaugeDrawing.js drawDisplayPage).
// paintGlassCockpitPanel is the older single quad (the aircraft model's own `instrument_panel`,
// seen from outside and when the cockpit model is missing): a primary flight display, then map,
// radar, and engines over cautions.
// Pure functions of the context, the readout, the rectangle and the extra data.
import {
  DISPLAY_COLOURS as D, PANEL_COLOURS as C, drawAttitude, drawDisplayBar, drawDisplayPage, drawDisplayText, drawLabel, traceNeedle,
} from './gaugeDrawing.js';
import { SIGNATURE_DETECTED, stealthSignatureLabel, stealthSignatureOf } from './stealthSignature.js';
import { paintTargetingScreen } from './targetingDisplay.js';

const DEG = Math.PI / 180;
const TWO_PI = Math.PI * 2;
const METRES_PER_NM = 1852;
/** Map ranges in nautical miles; the display picks the smallest that holds the next route point. */
export const MAP_RANGES_NM = Object.freeze([2, 5, 10, 20, 40]);
/** The radar scope's range, nautical miles. */
export const RADAR_RANGE_NM = 20;
const NO_CONTACTS = Object.freeze([]);
const EMPTY = Object.freeze({});

/**
 * Paints the single-quad panel: primary flight display, map, radar, engines over cautions.
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
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, gap, w, h);
    ctx.clip();
    if (i === 0) {
      ctx.fillStyle = C.glass;
      ctx.fillRect(x, gap, w, h);
      paintPrimaryFlight(ctx, readout, x, gap, w, h, layout);
    } else if (i === 1 && extra.radar?.targeting?.active) paintTargetingScreen(ctx, extra.radar.targeting, x, gap, w, h, layout);
    else if (i === 1) paintMapDisplay(ctx, readout, x, gap, w, h, extra, layout);
    else if (i === 2) paintRadarScope(ctx, readout, x, gap, w, h, extra, layout);
    else {
      paintEnginesDisplay(ctx, readout, x, gap, w, h * 0.5, extra, layout);
      paintCautionsDisplay(ctx, readout, x, gap + h * 0.5, w, h * 0.5, extra, layout);
    }
    ctx.restore();
    ctx.strokeStyle = C.bezelLight;
    ctx.lineWidth = Math.max(1, W * 0.002);
    ctx.strokeRect(x, gap, w, h);
  }
  return layout;
}

function paintPrimaryFlight(ctx, readout, x, y, w, h, layout) {
  const cx = x + w * 0.5;
  const cy = y + h * 0.46;
  drawAttitude(ctx, { x: cx, y: cy, r: h * 0.3, square: true, w: w * 0.56, h: h * 0.6 }, readout.pitchDegrees, readout.rollDegrees, h * 0.012);
  traceNeedle(layout, 'pfdPitch', readout.pitchDegrees * DEG);
  traceNeedle(layout, 'pfdRoll', readout.rollDegrees * DEG);
  paintTape(ctx, x + w * 0.02, y + h * 0.16, w * 0.17, h * 0.6, readout.airspeedKnots, 10, 4, false);
  paintTape(ctx, x + w * 0.79, y + h * 0.16, w * 0.19, h * 0.6, readout.altitudeFeet, 100, 4, true);
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
const MAP_PAGE = Object.freeze({ title: 'NAV', top: ['MAP', 'PLAN', 'WX', 'TERR', 'DATA'], bottom: ['RNG-', 'RNG+', 'TRK UP', 'WPT', 'DIR'], active: 'TRK UP' });
const RADAR_PAGE = Object.freeze({ title: 'SENSOR', top: ['PASV', 'ACTV', 'EMCON', 'SIG', 'DCLT'], bottom: ['RNG-', 'RNG+', 'TGT', 'IFF', 'REC'], active: 'PASV' });
const ENGINE_PAGE = Object.freeze({ title: 'ENG', top: ['ENG', 'FUEL', 'HYD', 'ELEC', 'APU'], bottom: ['', 'XFEED', '', 'IGN', 'TEST'], active: 'ENG' });
const CAUTION_PAGE = Object.freeze({ title: 'STATUS', top: ['CAUT', 'GEAR', 'BAY', 'DOORS', 'LOG'], bottom: ['ACK', '', 'RCL', '', 'TEST'], active: 'CAUT' });

/**
 * The moving map (display_map): track up, own ship low on the glass.
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} readout
 * @param {number} x Left of the display, pixels.
 * @param {number} y Top.
 * @param {number} w
 * @param {number} h
 * @param {{position?: {x: number, z: number}, route?: {points: ArrayLike<number>, count: number} | null}} [extra]
 * @param {{trace?: Record<string, number>} | null} [layout]
 */
export function paintMapDisplay(ctx, readout, x, y, w, h, extra = EMPTY, layout = null) {
  const area = drawDisplayPage(ctx, x, y, w, h, MAP_PAGE);
  const u = area.u;
  const cx = area.x + area.w * 0.5;
  const cy = area.y + area.h * 0.8;
  const radius = Math.min(area.h * 0.68, area.w * 0.5);
  const route = extra.route && extra.route.count > 0 ? extra.route : null;
  const here = extra.position ?? null;
  let range = 10;
  if (route && here) {
    const last = (route.count - 1) * 2;
    range = mapRangeFor(Math.hypot(route.points[last] - here.x, route.points[last + 1] - here.z));
  }
  traceNeedle(layout, 'mapRange', range);
  const heading = wrap360(readout.headingDegrees);
  ctx.save();
  ctx.beginPath();
  ctx.rect(area.x, area.y, area.w, area.h);
  ctx.clip();
  // Range rings and the compass arc, turning with the track.
  ctx.strokeStyle = D.grid;
  ctx.lineWidth = Math.max(1, u * 0.35);
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.5, 0, TWO_PI);
  ctx.stroke();
  ctx.strokeStyle = D.line;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, TWO_PI);
  ctx.stroke();
  for (let d = 0; d < 360; d += 10) {
    const a = (d - heading) * DEG;
    const sin = Math.sin(a);
    const cos = -Math.cos(a);
    const inner = radius * (d % 30 === 0 ? 0.93 : 0.965);
    ctx.beginPath();
    ctx.moveTo(cx + sin * inner, cy + cos * inner);
    ctx.lineTo(cx + sin * radius, cy + cos * radius);
    ctx.stroke();
    if (d % 30 === 0) {
      const text = d === 0 ? 'N' : d === 90 ? 'E' : d === 180 ? 'S' : d === 270 ? 'W' : String(d / 10);
      drawDisplayText(ctx, text, cx + sin * radius * 0.86, cy + cos * radius * 0.86, u * (d === 0 ? 4.2 : 3.2), d === 0 ? D.amber : D.dim, 'center', d === 0);
    }
  }
  drawDisplayText(ctx, `${range}`, cx + radius * 0.72, cy - radius * 0.72, u * 3, D.dim, 'left');
  drawDisplayText(ctx, `${range / 2}`, cx + radius * 0.37, cy - radius * 0.37, u * 3, D.dim, 'left');
  // The route: legs in magenta, a diamond at each point, a box at the destination.
  if (route && here) {
    const scale = radius / (range * METRES_PER_NM);
    ctx.strokeStyle = D.magenta;
    ctx.lineWidth = Math.max(1.5, u * 0.7);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    for (let i = 0; i < route.count; i += 1) {
      headingUpOffset(route.points[i * 2] - here.x, route.points[i * 2 + 1] - here.z, heading, scale, offset);
      ctx.lineTo(cx + offset.x, cy + offset.y);
    }
    ctx.stroke();
    ctx.lineWidth = Math.max(1, u * 0.4);
    for (let i = 0; i < route.count; i += 1) {
      headingUpOffset(route.points[i * 2] - here.x, route.points[i * 2 + 1] - here.z, heading, scale, offset);
      const s = u * (i === route.count - 1 ? 2 : 1.3);
      ctx.beginPath();
      ctx.moveTo(cx + offset.x, cy + offset.y - s);
      ctx.lineTo(cx + offset.x + s, cy + offset.y);
      ctx.lineTo(cx + offset.x, cy + offset.y + s);
      ctx.lineTo(cx + offset.x - s, cy + offset.y);
      ctx.closePath();
      ctx.stroke();
    }
    traceNeedle(layout, 'mapTargetX', offset.x);
    traceNeedle(layout, 'mapTargetY', offset.y);
  }
  // The track line and the own ship: a small flying wing.
  ctx.strokeStyle = D.dim;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx, cy - u * 5);
  ctx.lineTo(cx, cy - radius * 0.93);
  ctx.stroke();
  ctx.strokeStyle = D.white;
  ctx.lineWidth = Math.max(1.5, u * 0.6);
  ctx.beginPath();
  ctx.moveTo(cx, cy - u * 3.6);
  ctx.lineTo(cx + u * 7, cy + u * 2.2);
  ctx.lineTo(cx, cy + u * 0.4);
  ctx.lineTo(cx - u * 7, cy + u * 2.2);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
  // The data blocks.
  const top = area.y + u * 3;
  ctx.fillStyle = D.glass;
  ctx.fillRect(cx - u * 12, top - u * 3, u * 24, u * 6);
  ctx.strokeStyle = D.line;
  ctx.lineWidth = 1;
  ctx.strokeRect(cx - u * 12, top - u * 3, u * 24, u * 6);
  drawDisplayText(ctx, `HDG ${pad3(heading)}`, cx, top, u * 4.4, D.white, 'center', true);
  drawDisplayText(ctx, `GS ${Math.round(Number.isFinite(readout.groundSpeedKnots) ? readout.groundSpeedKnots : 0)}`, area.x + area.w - u * 2, top, u * 3.8, D.green, 'right');
  drawDisplayText(ctx, `${range} NM`, area.x + u, area.y + area.h - u * 3, u * 3.4, D.dim, 'left');
  if (route && here) {
    const nm = readout.autopilot.routeDistanceNm;
    if (nm !== null && nm !== undefined) drawDisplayText(ctx, `${fixed(nm, 1)} NM`, area.x + area.w - u * 2, top + u * 5.2, u * 3.8, D.magenta, 'right');
  } else {
    drawDisplayText(ctx, 'NO ROUTE', area.x + area.w - u * 2, top + u * 5.2, u * 3.4, D.dim, 'right');
  }
}

/**
 * The sensor display (display_radar): the bomb's targeting screen while it is active, else the scope.
 * Same arguments as paintMapDisplay; extra carries contacts, radar, hatchOpen and timeSeconds.
 */
export function paintRadarDisplay(ctx, readout, x, y, w, h, extra = EMPTY, layout = null) {
  if (extra.radar?.targeting?.active) {
    ctx.fillStyle = D.glass;
    ctx.fillRect(x, y, w, h);
    paintTargetingScreen(ctx, extra.radar.targeting, x, y, w, h, layout);
    traceNeedle(layout, 'radarTargeting', 1);
    return;
  }
  traceNeedle(layout, 'radarTargeting', 0);
  paintRadarScope(ctx, readout, x, y, w, h, extra, layout);
}

function paintRadarScope(ctx, readout, x, y, w, h, extra, layout) {
  const area = drawDisplayPage(ctx, x, y, w, h, RADAR_PAGE);
  const u = area.u;
  const cx = area.x + area.w * 0.42;
  const cy = area.y + area.h * 0.53;
  const radius = Math.min(area.w * 0.36, area.h * 0.4);
  ctx.strokeStyle = D.grid;
  ctx.lineWidth = Math.max(1, u * 0.35);
  for (const share of [0.33, 0.66]) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius * share, 0, TWO_PI);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(cx - radius, cy);
  ctx.lineTo(cx + radius, cy);
  ctx.moveTo(cx, cy - radius);
  ctx.lineTo(cx, cy + radius);
  ctx.stroke();
  ctx.strokeStyle = D.line;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, TWO_PI);
  ctx.stroke();
  for (let d = 0; d < 360; d += 30) {
    const a = d * DEG;
    ctx.beginPath();
    ctx.moveTo(cx + Math.sin(a) * radius * 0.95, cy - Math.cos(a) * radius * 0.95);
    ctx.lineTo(cx + Math.sin(a) * radius * 1.04, cy - Math.cos(a) * radius * 1.04);
    ctx.stroke();
  }
  // The sweep of the aircraft's own passive scope, with a fading trail.
  const sweep = ((extra.timeSeconds ?? 0) * 1.6) % TWO_PI;
  for (let i = 5; i >= 0; i -= 1) {
    const a = sweep - i * 0.07;
    ctx.strokeStyle = i === 0 ? D.green : `rgba(69, 208, 106, ${(0.3 - i * 0.05).toFixed(2)})`;
    ctx.lineWidth = Math.max(1, u * (i === 0 ? 0.6 : 1.2));
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.sin(a) * radius, cy - Math.cos(a) * radius);
    ctx.stroke();
  }
  // Own ship.
  ctx.strokeStyle = D.white;
  ctx.lineWidth = Math.max(1, u * 0.5);
  ctx.beginPath();
  ctx.moveTo(cx, cy - u * 2);
  ctx.lineTo(cx + u * 2.4, cy + u * 1.4);
  ctx.lineTo(cx - u * 2.4, cy + u * 1.4);
  ctx.closePath();
  ctx.stroke();
  const contacts = extra.contacts ?? NO_CONTACTS;
  const heading = wrap360(readout.headingDegrees);
  for (let i = 0; i < contacts.length; i += 1) {
    const contact = contacts[i];
    const share = Math.min(1, contact.distanceNm / RADAR_RANGE_NM);
    const a = (contact.bearingDegrees - heading) * DEG;
    const px = cx + Math.sin(a) * radius * share;
    const py = cy - Math.cos(a) * radius * share;
    const s = Math.max(3, u * 1.8);
    const friendly = contact.hostile === false;
    ctx.strokeStyle = friendly ? D.cyan : D.red;
    ctx.fillStyle = friendly ? D.cyan : D.red;
    ctx.lineWidth = Math.max(1.5, u * 0.6);
    ctx.beginPath();
    if (friendly) ctx.arc(px, py, s, 0, TWO_PI);
    else {
      ctx.moveTo(px, py - s * 1.2);
      ctx.lineTo(px + s, py + s * 0.8);
      ctx.lineTo(px - s, py + s * 0.8);
      ctx.closePath();
    }
    ctx.stroke();
    ctx.fillRect(px - 1, py - 1, 2, 2);
  }
  traceNeedle(layout, 'radarContacts', contacts.length);
  drawDisplayText(ctx, `RADAR ${RADAR_RANGE_NM} NM`, cx, area.y + u * 3, u * 3.8, D.green, 'center', true);
  drawDisplayText(ctx, contacts.length ? `${contacts.length} CONTACT${contacts.length > 1 ? 'S' : ''}` : 'CLEAR', cx, area.y + area.h - u * 3, u * 3.8, contacts.length ? D.red : D.green, 'center', contacts.length > 0);
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
    ctx.strokeStyle = emitter.painting ? D.red : D.amber;
    ctx.lineWidth = Math.max(1, u * (emitter.painting ? 0.9 : 0.45));
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex + Math.sin(beam) * reach, ey - Math.cos(beam) * reach);
    ctx.stroke();
    const half = Math.max(3, u * 1.5);
    ctx.strokeRect(ex - half, ey - half, half * 2, half * 2);
  }
  traceNeedle(layout, 'radarEmitters', emitterCount);
  // The signature meter: the radar network's model when it is there, else the deck's own estimate.
  const signature = radar ? radar.signature : stealthSignatureOf(readout, extra);
  const threshold = radar ? Math.min(1, radar.threshold) : SIGNATURE_DETECTED;
  const word = radar ? radar.word : stealthSignatureLabel(signature);
  traceNeedle(layout, 'signature', signature);
  const bw = u * 5;
  const bx = area.x + area.w - bw - u * 5;
  const by = area.y + u * 9;
  const bh = area.h - u * 19;
  const colour = radar
    ? (radar.tracked ? D.red : signature >= threshold || radar.painted ? D.amber : D.green)
    : signature >= SIGNATURE_DETECTED ? D.red : signature >= 0.3 ? D.amber : D.green;
  // (the bar shows the fourth root when the model drives it, as the radars' reach goes: small echoes stay readable)
  drawDisplayBar(ctx, bx, by, bw, bh, radar ? Math.sqrt(Math.sqrt(signature)) : signature, colour, radar ? Math.sqrt(Math.sqrt(threshold)) : threshold);
  drawDisplayText(ctx, 'SIG', bx + bw / 2, by - u * 3, u * 3.6, D.white, 'center', true);
  drawDisplayText(ctx, word, bx + bw / 2, by + bh + u * 3.2, u * 3.2, colour, 'center', true);
  if (radar && radar.tracked && ((extra.timeSeconds ?? 0) * 2) % 1 < 0.6) drawDisplayText(ctx, 'TRACKED', cx, area.y + u * 8, u * 5, D.red, 'center', true);
  traceNeedle(layout, 'radarTracked', radar && radar.tracked ? 1 : 0);
}

/**
 * The engine display (display_engines): four engines with N1 and EGT columns, fuel and throttle.
 * Same arguments as paintMapDisplay.
 */
export function paintEnginesDisplay(ctx, readout, x, y, w, h, extra = EMPTY, layout = null) {
  const area = drawDisplayPage(ctx, x, y, w, h, h > w * 0.6 ? ENGINE_PAGE : EMPTY);
  const u = area.u;
  drawDisplayText(ctx, 'ENGINES', area.x + area.w * 0.36, area.y + u * 3, u * 3.8, D.white, 'center', true);
  const rpm = Number.isFinite(readout.rpmPercent) ? readout.rpmPercent : 0;
  const hot = Number.isFinite(readout.engineTemperatureC) ? readout.engineTemperatureC : 0;
  const top = area.y + u * 10;
  const barH = Math.max(u * 6, area.h - u * 24);
  const slot = (area.w * 0.72) / 4;
  for (let i = 0; i < 4; i += 1) {
    const ex = area.x + slot * i + slot * 0.14;
    // The four engines share one spool state; a small fixed spread makes the columns read as four.
    const each = Math.max(0, Math.min(100, rpm + (rpm > 3 ? (i - 1.5) * 0.6 : 0)));
    const egt = Math.max(0, hot * (1 + (rpm > 3 ? (1.5 - i) * 0.012 : 0)));
    drawDisplayText(ctx, String(i + 1), ex + slot * 0.36, top - u * 3, u * 3.2, D.dim);
    drawDisplayBar(ctx, ex, top, slot * 0.3, barH, each / 100, each > 97 ? D.amber : D.green, 0.97);
    drawDisplayBar(ctx, ex + slot * 0.42, top, slot * 0.3, barH, egt / 1000, egt > 850 ? D.red : D.cyan, 0.85);
    drawDisplayText(ctx, String(Math.round(each)), ex + slot * 0.15, top + barH + u * 3, u * 3.4, D.white);
    drawDisplayText(ctx, String(Math.round(egt)), ex + slot * 0.57, top + barH + u * 3, u * 2.8, D.dim);
  }
  traceNeedle(layout, 'engineRpm', rpm / 100);
  drawDisplayText(ctx, 'N1 %', area.x + slot * 0.3, top + barH + u * 7.4, u * 2.9, D.green, 'left');
  drawDisplayText(ctx, 'EGT °C', area.x + slot * 1.4, top + barH + u * 7.4, u * 2.9, D.cyan, 'left');
  // Fuel and throttle, right.
  const fx = area.x + area.w * 0.78;
  const fuel = Number.isFinite(readout.fuelPercent) ? readout.fuelPercent : 0;
  drawDisplayText(ctx, 'FUEL', fx + u * 3, area.y + u * 3, u * 3.8, D.white, 'center', true);
  drawDisplayBar(ctx, fx, top, u * 6, barH, fuel / 100, fuel < 15 ? D.red : D.cyan, 0.15);
  traceNeedle(layout, 'fuel', fuel / 100);
  drawDisplayText(ctx, `${Math.round(fuel)}%`, fx + u * 3, top + barH + u * 3, u * 3.4, D.white);
  const thr = Number.isFinite(readout.throttlePercent) ? readout.throttlePercent : 0;
  drawDisplayBar(ctx, fx + u * 10, top, u * 3, barH, thr / 100, D.white);
  drawDisplayText(ctx, `THR ${Math.round(thr)}%`, fx + u * 9, top + barH + u * 7.4, u * 2.9, D.white);
}

/** The caution tiles, in the order they are laid out; the most urgent first. */
const CAUTION_TILES = Object.freeze([
  ['STALL', 'red', (r) => r.stalled || r.stallWarning],
  ['OVERSPEED', 'red', (r) => r.overspeed],
  ['RADAR TRACKED', 'red', (r, e) => Boolean(e.radar?.tracked)],
  ['FUEL LOW', 'amber', (r) => r.fuelPercent < 15],
  ['BOMB BAY OPEN', 'amber', (r, e) => Boolean(e.radar?.bayOpen)],
  ['HATCH OPEN', 'amber', (r, e) => Boolean(e.hatchOpen)],
  ['GEAR SPEED', 'amber', (r) => !r.onGround && r.gearDown && r.airspeedKnots > 250],
  ['PARK BRAKE', 'amber', (r) => Boolean(r.brake && r.onGround)],
  ['AP OFF', 'white', (r) => !r.autopilot.engaged && !r.onGround],
]);

/**
 * The status display (display_cautions): caution tiles, gear, flaps, hatch and bomb bay.
 * Same arguments as paintMapDisplay. `layout.trace.cautions` counts the lit tiles.
 */
export function paintCautionsDisplay(ctx, readout, x, y, w, h, extra = EMPTY, layout = null) {
  const tall = h > w * 0.6;
  const area = drawDisplayPage(ctx, x, y, w, h, tall ? CAUTION_PAGE : EMPTY);
  const u = area.u;
  const columns = 3;
  const rows = Math.ceil(CAUTION_TILES.length / columns);
  const gridTop = area.y + (tall ? u * 7 : u);
  const gridH = area.h * (tall ? 0.5 : 0.62);
  const tileW = area.w / columns;
  const tileH = gridH / rows;
  let lit = 0;
  for (let i = 0; i < CAUTION_TILES.length; i += 1) {
    const tile = CAUTION_TILES[i];
    const on = Boolean(tile[2](readout, extra));
    if (on) lit += 1;
    const tx = area.x + (i % columns) * tileW + u * 0.6;
    const ty = gridTop + Math.floor(i / columns) * tileH + u * 0.6;
    const colour = D[tile[1]];
    ctx.strokeStyle = on ? colour : D.grid;
    ctx.lineWidth = Math.max(1, u * (on ? 0.6 : 0.3));
    if (on) {
      ctx.fillStyle = tile[1] === 'red' ? 'rgba(240, 72, 60, 0.22)' : tile[1] === 'amber' ? 'rgba(242, 168, 30, 0.2)' : 'rgba(238, 244, 245, 0.12)';
      ctx.fillRect(tx, ty, tileW - u * 1.2, tileH - u * 1.2);
    }
    ctx.strokeRect(tx, ty, tileW - u * 1.2, tileH - u * 1.2);
    // (a dark tile keeps a faint legend, as an unlit annunciator does; a lit one is drawn in full)
    if (on) drawDisplayText(ctx, tile[0], tx + (tileW - u * 1.2) / 2, ty + (tileH - u * 1.2) / 2, Math.min(u * 3.1, tileH * 0.42), colour, 'center', true);
  }
  traceNeedle(layout, 'cautions', lit);
  const lineY = gridTop + gridH + u * 3;
  if (lit === 0) drawDisplayText(ctx, 'NO CAUTIONS', area.x + area.w / 2, gridTop + gridH / 2, u * 4, D.green, 'center', true);
  // Gear: three wheels, green down, amber in transit, hollow up.
  const gearText = readout.gearInTransit ? 'GEAR ---' : readout.gearDown ? 'GEAR DN' : 'GEAR UP';
  const gearColour = readout.gearInTransit ? D.amber : readout.gearDown ? D.green : D.white;
  drawDisplayText(ctx, gearText, area.x + u, lineY, u * 3.6, gearColour, 'left', true);
  const wheelsX = area.x + u * 30;
  for (let i = 0; i < 3; i += 1) {
    const wx = wheelsX + (i - 1) * u * 4.2;
    const wy = lineY + (i === 1 ? -u * 1.4 : u * 1.2);
    ctx.strokeStyle = gearColour;
    ctx.fillStyle = gearColour;
    ctx.lineWidth = Math.max(1, u * 0.5);
    ctx.beginPath();
    ctx.arc(wx, wy, u * 1.5, 0, TWO_PI);
    if (readout.gearDown && !readout.gearInTransit) ctx.fill();
    else ctx.stroke();
  }
  const flaps = Number.isFinite(readout.flapsDegrees) ? readout.flapsDegrees : 0;
  drawDisplayText(ctx, `FLAP ${Math.round(flaps)}`, area.x + area.w * 0.5, lineY, u * 3.6, D.white, 'left');
  const barX = area.x + area.w * 0.74;
  ctx.strokeStyle = D.dim;
  ctx.lineWidth = 1;
  ctx.strokeRect(barX, lineY - u * 1.4, area.w * 0.24, u * 2.8);
  ctx.fillStyle = D.cyan;
  ctx.fillRect(barX, lineY - u * 1.4, area.w * 0.24 * Math.max(0, Math.min(1, flaps / 40)), u * 2.8);
  if (tall) {
    const doorY = lineY + u * 7;
    const hatch = Boolean(extra.hatchOpen);
    const bay = Boolean(extra.radar?.bayOpen);
    drawDisplayText(ctx, hatch ? 'HATCH  OPEN' : 'HATCH  SHUT', area.x + u, doorY, u * 3.4, hatch ? D.amber : D.green, 'left');
    drawDisplayText(ctx, bay ? 'BAY  OPEN' : 'BAY  SHUT', area.x + area.w * 0.5, doorY, u * 3.4, bay ? D.amber : D.green, 'left');
  }
}

/**
 * The painter of each live display of the cockpit model, by mesh name.
 * @type {Readonly<Record<string, (ctx: CanvasRenderingContext2D, readout: object, x: number, y: number, w: number,
 *   h: number, extra?: object, layout?: object | null) => void>>}
 */
export const GLASS_DISPLAY_PAINTERS = Object.freeze({
  display_map: paintMapDisplay,
  display_radar: paintRadarDisplay,
  display_engines: paintEnginesDisplay,
  display_cautions: paintCautionsDisplay,
});

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

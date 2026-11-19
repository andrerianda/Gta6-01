// Shared drawing helpers for the cockpit panels and the flight HUD: round dials with ticks,
// coloured arcs and needles, an attitude ball, text, lamps and bars, on any Canvas 2D context (or a
// recording stand-in in the Node tests). Angles of a dial are clockwise from straight up, radians.
// Nothing here knows about a particular aircraft; the panel files lay the gauges out.

/** The panels' palette. */
export const PANEL_COLOURS = Object.freeze({
  face: '#0b0d10', bezel: '#2a2d31', bezelLight: '#4b4f55', mark: '#e9e6da', dim: '#8d9096', needle: '#f4f1e6',
  green: '#3fbf5a', yellow: '#e2c032', red: '#e0443a', amber: '#f0a020', white: '#f2f2f2', cyan: '#48d8e8',
  sky: '#2f6fb5', ground: '#6b4a2b', magenta: '#e45bd0', panel: '#1a1c1f', glass: '#04070a',
});

const TWO_PI = Math.PI * 2;
const DEG = Math.PI / 180;

/**
 * Where a value sits on a dial: clamped to the scale, clockwise from straight up.
 * @param {number} value
 * @param {number} min The value at the start of the scale.
 * @param {number} max The value at its end.
 * @param {number} startDegrees Angle of `min`, degrees clockwise from up.
 * @param {number} sweepDegrees Angle from `min` to `max`.
 * @returns {number} Radians clockwise from up.
 */
export function dialAngle(value, min, max, startDegrees, sweepDegrees) {
  const span = max - min || 1;
  let t = (value - min) / span;
  if (!(t > 0)) t = 0; // also catches NaN
  else if (t > 1) t = 1;
  return (startDegrees + sweepDegrees * t) * DEG;
}

/** Remembers a needle's angle under a name when the layout carries a `trace` object (tests). */
export function traceNeedle(layout, name, angle) {
  if (layout && layout.trace) layout.trace[name] = angle;
}

/**
 * A round instrument's bezel and face.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx
 * @param {number} cy
 * @param {number} r Outer radius of the bezel.
 */
export function drawDialFace(ctx, cx, cy, r) {
  ctx.fillStyle = PANEL_COLOURS.bezel;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TWO_PI);
  ctx.fill();
  ctx.strokeStyle = PANEL_COLOURS.bezelLight;
  ctx.lineWidth = Math.max(1, r * 0.03);
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.97, 0, TWO_PI);
  ctx.stroke();
  ctx.fillStyle = PANEL_COLOURS.face;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.9, 0, TWO_PI);
  ctx.fill();
}

/**
 * Ticks (and numbers) round a dial.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx
 * @param {number} cy
 * @param {number} r The bezel radius (ticks sit inside 0.86 r).
 * @param {{min: number, max: number, start: number, sweep: number, major: number, minor?: number,
 *   label?: (value: number) => string, labelEvery?: number}} scale Values and angles in degrees.
 */
export function drawDialTicks(ctx, cx, cy, r, scale) {
  const step = scale.minor ?? scale.major;
  const count = Math.round((scale.max - scale.min) / step);
  ctx.strokeStyle = PANEL_COLOURS.mark;
  ctx.fillStyle = PANEL_COLOURS.mark;
  ctx.font = `${Math.round(r * 0.19)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const labelEvery = scale.labelEvery ?? scale.major;
  for (let i = 0; i <= count; i += 1) {
    const value = scale.min + i * step;
    const a = dialAngle(value, scale.min, scale.max, scale.start, scale.sweep);
    const sin = Math.sin(a);
    const cos = -Math.cos(a);
    const isMajor = Math.abs(value / scale.major - Math.round(value / scale.major)) < 1e-6;
    const inner = r * (isMajor ? 0.7 : 0.78);
    ctx.lineWidth = Math.max(1, r * (isMajor ? 0.03 : 0.015));
    ctx.beginPath();
    ctx.moveTo(cx + sin * inner, cy + cos * inner);
    ctx.lineTo(cx + sin * r * 0.86, cy + cos * r * 0.86);
    ctx.stroke();
    if (scale.label && Math.abs(value / labelEvery - Math.round(value / labelEvery)) < 1e-6 && !(scale.sweep >= 360 && i === count)) {
      ctx.fillText(scale.label(value), cx + sin * r * 0.54, cy + cos * r * 0.54);
    }
  }
}

/**
 * A coloured band along a dial's rim between two values.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx
 * @param {number} cy
 * @param {number} r Bezel radius.
 * @param {{min: number, max: number, start: number, sweep: number}} scale
 * @param {number} from
 * @param {number} to
 * @param {string} colour
 * @param {number} [track] Radius of the band as a share of r.
 */
export function drawDialArc(ctx, cx, cy, r, scale, from, to, colour, track = 0.83) {
  if (!(to > from)) return;
  const a0 = dialAngle(from, scale.min, scale.max, scale.start, scale.sweep) - Math.PI / 2;
  const a1 = dialAngle(to, scale.min, scale.max, scale.start, scale.sweep) - Math.PI / 2;
  ctx.strokeStyle = colour;
  ctx.lineWidth = Math.max(1, r * 0.06);
  ctx.beginPath();
  ctx.arc(cx, cy, r * track, a0, a1);
  ctx.stroke();
}

/**
 * A needle from the hub.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx
 * @param {number} cy
 * @param {number} length
 * @param {number} angle Radians clockwise from up.
 * @param {string} [colour]
 * @param {number} [width]
 */
export function drawNeedle(ctx, cx, cy, length, angle, colour = PANEL_COLOURS.needle, width = 0) {
  const w = width || Math.max(1.5, length * 0.06);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.moveTo(-w, length * 0.18);
  ctx.lineTo(-w * 0.5, -length * 0.8);
  ctx.lineTo(0, -length);
  ctx.lineTo(w * 0.5, -length * 0.8);
  ctx.lineTo(w, length * 0.18);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = PANEL_COLOURS.bezelLight;
  ctx.beginPath();
  ctx.arc(cx, cy, w * 1.4, 0, TWO_PI);
  ctx.fill();
}

/**
 * Text, centred by default.
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} x
 * @param {number} y
 * @param {number} size Pixels.
 * @param {string} [colour]
 * @param {CanvasTextAlign} [align]
 * @param {boolean} [bold]
 */
export function drawLabel(ctx, text, x, y, size, colour = PANEL_COLOURS.mark, align = 'center', bold = false) {
  ctx.font = `${bold ? 'bold ' : ''}${Math.max(6, Math.round(size))}px sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = colour;
  ctx.fillText(text, x, y);
}

/**
 * A complete simple gauge: face, ticks, optional arcs, caption, one needle.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{x: number, y: number, r: number}} at Centre and bezel radius.
 * @param {{min: number, max: number, start: number, sweep: number, major: number, minor?: number,
 *   label?: (value: number) => string, labelEvery?: number}} scale
 * @param {number} value
 * @param {{caption?: string, unit?: string, arcs?: Array<[number, number, string]>, name?: string, layout?: object}} [options]
 * @returns {number} The needle's angle.
 */
export function drawGauge(ctx, at, scale, value, options = {}) {
  drawDialFace(ctx, at.x, at.y, at.r);
  if (options.arcs) for (const arc of options.arcs) drawDialArc(ctx, at.x, at.y, at.r, scale, arc[0], arc[1], arc[2]);
  drawDialTicks(ctx, at.x, at.y, at.r, scale);
  if (options.caption) drawLabel(ctx, options.caption, at.x, at.y - at.r * 0.28, at.r * 0.15, PANEL_COLOURS.dim);
  if (options.unit) drawLabel(ctx, options.unit, at.x, at.y + at.r * 0.32, at.r * 0.13, PANEL_COLOURS.dim);
  const angle = dialAngle(value, scale.min, scale.max, scale.start, scale.sweep);
  drawNeedle(ctx, at.x, at.y, at.r * 0.74, angle);
  if (options.name) traceNeedle(options.layout, options.name, angle);
  return angle;
}

/**
 * An attitude ball clipped to a circle or a rectangle: sky over ground, pitch bars every 5 or 10
 * degrees, a bank index, and the fixed aircraft symbol.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{x: number, y: number, r: number, square?: boolean, w?: number, h?: number}} at Centre; r the
 *   radius (or half the height of a square one, with w and h its full size).
 * @param {number} pitchDegrees + nose up.
 * @param {number} rollDegrees + right wing down.
 * @param {number} [pixelsPerDegree]
 */
export function drawAttitude(ctx, at, pitchDegrees, rollDegrees, pixelsPerDegree = 0) {
  const ppd = pixelsPerDegree || at.r / 28;
  const pitch = Number.isFinite(pitchDegrees) ? Math.max(-90, Math.min(90, pitchDegrees)) : 0;
  const roll = Number.isFinite(rollDegrees) ? rollDegrees : 0;
  const far = at.r * 6;
  ctx.save();
  ctx.beginPath();
  if (at.square) ctx.rect(at.x - at.w / 2, at.y - at.h / 2, at.w, at.h);
  else ctx.arc(at.x, at.y, at.r * 0.9, 0, TWO_PI);
  ctx.clip();
  ctx.translate(at.x, at.y);
  // The horizon turns against the bank: right wing down shows the horizon tilted up on the right.
  ctx.rotate(-roll * DEG);
  ctx.translate(0, pitch * ppd);
  ctx.fillStyle = PANEL_COLOURS.sky;
  ctx.fillRect(-far, -far, far * 2, far);
  ctx.fillStyle = PANEL_COLOURS.ground;
  ctx.fillRect(-far, 0, far * 2, far);
  ctx.strokeStyle = PANEL_COLOURS.white;
  ctx.fillStyle = PANEL_COLOURS.white;
  ctx.lineWidth = Math.max(1, at.r * 0.02);
  ctx.beginPath();
  ctx.moveTo(-far, 0);
  ctx.lineTo(far, 0);
  ctx.stroke();
  ctx.font = `${Math.max(6, Math.round(at.r * 0.13))}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let d = -80; d <= 80; d += 5) {
    if (d === 0 || Math.abs(d - pitch) > 32) continue;
    const half = at.r * (d % 10 === 0 ? 0.28 : 0.14);
    ctx.beginPath();
    ctx.moveTo(-half, -d * ppd);
    ctx.lineTo(half, -d * ppd);
    ctx.stroke();
    if (d % 10 === 0) ctx.fillText(String(Math.abs(d)), half + at.r * 0.14, -d * ppd);
  }
  ctx.restore();
  // The fixed aircraft symbol and the bank pointer.
  ctx.strokeStyle = PANEL_COLOURS.amber;
  ctx.lineWidth = Math.max(2, at.r * 0.045);
  ctx.beginPath();
  ctx.moveTo(at.x - at.r * 0.5, at.y);
  ctx.lineTo(at.x - at.r * 0.18, at.y);
  ctx.lineTo(at.x - at.r * 0.18, at.y + at.r * 0.08);
  ctx.moveTo(at.x + at.r * 0.5, at.y);
  ctx.lineTo(at.x + at.r * 0.18, at.y);
  ctx.lineTo(at.x + at.r * 0.18, at.y + at.r * 0.08);
  ctx.stroke();
  ctx.fillStyle = PANEL_COLOURS.amber;
  ctx.fillRect(at.x - at.r * 0.03, at.y - at.r * 0.03, at.r * 0.06, at.r * 0.06);
  ctx.save();
  ctx.translate(at.x, at.y);
  ctx.rotate(-roll * DEG);
  ctx.fillStyle = PANEL_COLOURS.white;
  ctx.beginPath();
  ctx.moveTo(0, -at.r * 0.86);
  ctx.lineTo(-at.r * 0.06, -at.r * 0.74);
  ctx.lineTo(at.r * 0.06, -at.r * 0.74);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/**
 * A caution lamp: a lit or dark rounded box with a caption.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x Left.
 * @param {number} y Top.
 * @param {number} w
 * @param {number} h
 * @param {string} caption
 * @param {boolean} lit
 * @param {string} [colour] The lit colour.
 */
export function drawLamp(ctx, x, y, w, h, caption, lit, colour = PANEL_COLOURS.amber) {
  ctx.fillStyle = lit ? colour : '#1d1f22';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = PANEL_COLOURS.bezelLight;
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);
  drawLabel(ctx, caption, x + w / 2, y + h / 2, h * 0.5, lit ? '#101010' : '#55585d', 'center', true);
}

/**
 * A bar gauge (a column or a strip) filled to a fraction.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x Left.
 * @param {number} y Top.
 * @param {number} w
 * @param {number} h
 * @param {number} fraction 0..1.
 * @param {string} colour
 * @param {boolean} [vertical] Fills from the bottom when true, from the left otherwise.
 */
export function drawBar(ctx, x, y, w, h, fraction, colour, vertical = true) {
  const f = fraction > 0 ? (fraction < 1 ? fraction : 1) : 0;
  ctx.fillStyle = '#14171a';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = colour;
  if (vertical) ctx.fillRect(x, y + h * (1 - f), w, h * f);
  else ctx.fillRect(x, y, w * f, h);
  ctx.strokeStyle = PANEL_COLOURS.bezelLight;
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);
}

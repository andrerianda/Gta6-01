// The Manta Sombra's green targeting screen: the bomb seeker's stabilised look at the designated
// target, drawn as a monochrome synthetic picture from the plan's height data (the land around the
// target as a green relief mesh, the sea left dark, the target boxed under the reticle), with the
// range, the time of fall, the release envelope and the release cue, and the bomb on its way down.
// The radar network (flight/radar/guidedBombRun.js) owns the data; this only paints it, on the
// glass cockpit's second display or as an inset of the flight HUD. A pure function of its inputs.

const GREEN = '#35ff6a';
const DIM = '#178a3a';
const DARK = '#031207';
const POINTS = new Float32Array(33 * 33 * 2);
const view = { fx: 0, fy: 0, fz: 0, rx: 0, rz: 0, ux: 0, uy: 0, uz: 0, focal: 1, cx: 0, cy: 0, ox: 0, oy: 0, oz: 0 };
const spot = { x: 0, y: 0, ahead: 0 };

/**
 * Paints the targeting screen into a rectangle.
 * @param {CanvasRenderingContext2D} ctx
 * @param {TargetingData} data From the radar network's display.
 * @param {number} x @param {number} y @param {number} w @param {number} h The rectangle, pixels.
 * @param {{trace?: Record<string, number>} | null} [layout] Records what was drawn, for tests.
 *
 * @typedef {object} TargetingData
 * @property {boolean} active
 * @property {{x: number, y: number, z: number}} craft The seeker's place.
 * @property {{x: number, y: number, z: number} | null} target The aim point.
 * @property {string} targetName @property {boolean} valid @property {number} bombs
 * @property {{range: number, timeOfFall: number, alongError: number, crossError: number, authority: number, inEnvelope: boolean, reason: string}} solution
 * @property {boolean} bombAway @property {{x: number, y: number, z: number}} bomb @property {number} timeToImpact
 * @property {string} result '' | 'TARGET DESTROYED' | 'MISS'
 * @property {{heights: Float32Array, size: number, spacing: number, x: number, z: number} | null} terrain Heights on a
 *   square grid centred on (x, z).
 * @property {number} timeSeconds
 */
export function paintTargetingScreen(ctx, data, x, y, w, h, layout = null) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = DARK;
  ctx.fillRect(x, y, w, h);
  const cx = x + w * 0.5;
  const cy = y + h * 0.5;
  const size = Math.min(w, h);
  const line = Math.max(1, size * 0.006);
  ctx.lineWidth = line;
  let drawn = 0;
  const target = data.target;
  if (target && aim(data.craft, target, cx, cy, size)) {
    if (data.terrain) drawn = paintRelief(ctx, data.terrain);
    // The target: a box on its foot and a mast.
    if (project(target.x, target.y, target.z) && project(target.x, target.y - 17, target.z)) {
      const footX = spot.x;
      const footY = spot.y;
      project(target.x, target.y + 17, target.z);
      ctx.strokeStyle = GREEN;
      ctx.lineWidth = line * 2;
      ctx.beginPath();
      ctx.moveTo(footX, footY);
      ctx.lineTo(spot.x, spot.y);
      ctx.stroke();
      ctx.lineWidth = line;
    }
    if (data.bombAway && project(data.bomb.x, data.bomb.y, data.bomb.z)) {
      ctx.fillStyle = GREEN;
      ctx.beginPath();
      ctx.arc(spot.x, spot.y, size * 0.014, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Scan lines over the picture, then the symbology on top.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
  const pitch = Math.max(3, Math.round(h / 90));
  for (let sy = y; sy < y + h; sy += pitch) ctx.fillRect(x, sy, w, 1);
  paintReticle(ctx, cx, cy, size, data);
  paintReadouts(ctx, data, x, y, w, h);
  if (layout && layout.trace) {
    layout.trace.targetingSegments = drawn;
    layout.trace.targetingRange = Number.isFinite(data.solution.range) ? data.solution.range : 0;
    layout.trace.targetingCue = data.solution.inEnvelope && data.valid && data.bombs > 0 ? 1 : 0;
  }
  ctx.restore();
}

/** Points the seeker from `eye` at `target`; false when they coincide. */
function aim(eye, target, cx, cy, size) {
  let fx = target.x - eye.x;
  let fy = target.y - eye.y;
  let fz = target.z - eye.z;
  const range = Math.hypot(fx, fy, fz);
  if (!(range > 1)) return false;
  fx /= range; fy /= range; fz /= range;
  let rx = -fz;
  let rz = fx;
  const flat = Math.hypot(rx, rz);
  if (flat < 1e-4) { rx = 1; rz = 0; } else { rx /= flat; rz /= flat; }
  view.fx = fx; view.fy = fy; view.fz = fz;
  view.rx = rx; view.rz = rz;
  // up = right x forward
  view.ux = -rz * fy; view.uy = rz * fx - rx * fz; view.uz = rx * fy;
  // The zoom keeps about 700 m around the target in the picture (6 to 50 degrees across).
  const half = Math.min(0.47, Math.max(0.052, Math.atan2(700, range)));
  view.focal = (size * 0.5) / Math.tan(half);
  view.cx = cx; view.cy = cy;
  view.ox = eye.x; view.oy = eye.y; view.oz = eye.z;
  return true;
}

function project(px, py, pz) {
  const dx = px - view.ox;
  const dy = py - view.oy;
  const dz = pz - view.oz;
  const ahead = dx * view.fx + dy * view.fy + dz * view.fz;
  spot.ahead = ahead;
  if (ahead < 5) return false;
  spot.x = view.cx + ((dx * view.rx + dz * view.rz) / ahead) * view.focal;
  spot.y = view.cy - ((dx * view.ux + dy * view.uy + dz * view.uz) / ahead) * view.focal;
  return true;
}

/** The land as a mesh of green lines; returns the segments drawn. */
function paintRelief(ctx, terrain) {
  const n = Math.min(33, terrain.size);
  const half = (n - 1) / 2;
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      const height = terrain.heights[j * terrain.size + i];
      const k = (j * n + i) * 2;
      if (height > 0.3 && project(terrain.x + (i - half) * terrain.spacing, height, terrain.z + (j - half) * terrain.spacing)) {
        POINTS[k] = spot.x; POINTS[k + 1] = spot.y;
      } else POINTS[k] = NaN;
    }
  }
  let segments = 0;
  ctx.strokeStyle = DIM;
  ctx.beginPath();
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      const k = (j * n + i) * 2;
      if (Number.isNaN(POINTS[k])) continue;
      if (i + 1 < n && !Number.isNaN(POINTS[k + 2])) { ctx.moveTo(POINTS[k], POINTS[k + 1]); ctx.lineTo(POINTS[k + 2], POINTS[k + 3]); segments += 1; }
      const below = k + n * 2;
      if (j + 1 < n && !Number.isNaN(POINTS[below])) { ctx.moveTo(POINTS[k], POINTS[k + 1]); ctx.lineTo(POINTS[below], POINTS[below + 1]); segments += 1; }
    }
  }
  ctx.stroke();
  return segments;
}

function paintReticle(ctx, cx, cy, size, data) {
  const cue = data.solution.inEnvelope && data.valid && data.bombs > 0;
  const flash = cue && (data.timeSeconds * 4) % 1 < 0.5;
  ctx.strokeStyle = GREEN;
  ctx.lineWidth = Math.max(1, size * (flash ? 0.012 : 0.006));
  const gap = size * 0.05;
  const arm = size * 0.2;
  ctx.beginPath();
  ctx.moveTo(cx - arm, cy); ctx.lineTo(cx - gap, cy);
  ctx.moveTo(cx + gap, cy); ctx.lineTo(cx + arm, cy);
  ctx.moveTo(cx, cy - arm); ctx.lineTo(cx, cy - gap);
  ctx.moveTo(cx, cy + gap); ctx.lineTo(cx, cy + arm);
  ctx.stroke();
  if (data.target) ctx.strokeRect(cx - gap, cy - gap, gap * 2, gap * 2);
}

function paintReadouts(ctx, data, x, y, w, h) {
  const s = data.solution;
  const size = Math.min(w, h);
  const font = (scale, bold) => { ctx.font = `${bold ? '700 ' : ''}${Math.max(8, Math.round(size * scale))}px "DejaVu Sans Mono", "Courier New", monospace`; };
  ctx.fillStyle = GREEN;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  font(0.05, true);
  ctx.fillText('TGT', x + w * 0.04, y + h * 0.07);
  font(0.045, false);
  ctx.fillText(data.target ? data.targetName.toUpperCase() : 'NO TARGET', x + w * 0.16, y + h * 0.07);
  ctx.fillText(`BOMB ${data.bombs}`, x + w * 0.04, y + h * 0.15);
  if (data.target) {
    ctx.fillText(`RNG ${(s.range / 1000).toFixed(1)} KM`, x + w * 0.04, y + h * 0.83);
    ctx.fillText(data.bombAway ? `TTI ${Math.max(0, data.timeToImpact).toFixed(0)} S` : `TOF ${s.timeOfFall.toFixed(0)} S`, x + w * 0.04, y + h * 0.91);
    // The range ladder on the right: the unguided fall against the fins' reach.
    const lx = x + w * 0.93;
    const top = y + h * 0.22;
    const tall = h * 0.56;
    const reach = Math.max(1, s.authority);
    ctx.strokeStyle = GREEN;
    ctx.beginPath();
    ctx.moveTo(lx, top); ctx.lineTo(lx, top + tall);
    ctx.moveTo(lx - w * 0.025, top + tall * 0.33); ctx.lineTo(lx + w * 0.025, top + tall * 0.33);
    ctx.moveTo(lx - w * 0.025, top + tall * 0.67); ctx.lineTo(lx + w * 0.025, top + tall * 0.67);
    ctx.stroke();
    const along = Math.max(-3, Math.min(3, s.alongError / reach));
    const cross = Math.max(-1, Math.min(1, s.crossError / reach / 3));
    ctx.fillRect(lx - w * 0.035, top + tall * (0.5 - along / 6) - 2, w * 0.03, 4);
    // The steering bar under the reticle: the target left or right of the track.
    const bx = x + w * 0.5;
    const by = y + h * 0.74;
    ctx.strokeRect(bx - w * 0.2, by - 3, w * 0.4, 6);
    ctx.fillRect(bx + cross * w * 0.2 - 2, by - 7, 4, 14);
  }
  ctx.textAlign = 'center';
  font(0.06, true);
  let cue = '';
  if (data.result) cue = data.result;
  else if (data.bombAway) cue = 'BOMB AWAY';
  else if (data.bombs <= 0) cue = 'NO BOMB';
  else if (!data.target) cue = 'NO TARGET';
  else if (!data.valid) cue = 'INVALID TARGET';
  else cue = s.inEnvelope ? 'IN ENVELOPE  RELEASE' : s.reason;
  ctx.fillText(cue, x + w * 0.5, y + h * 0.235);
  ctx.textAlign = 'right';
  font(0.04, false);
  ctx.fillText('SEEKER', x + w * 0.96, y + h * 0.07);
}

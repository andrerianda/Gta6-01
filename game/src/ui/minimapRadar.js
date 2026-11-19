// The radar in the corner of the HUD: a landscape window on the city plan that turns with the
// camera (the view direction always up; north up when the player turns that off) and lies tilted
// back in perspective, as if seen from behind and above, with the player's arrow low in the frame
// so more of what lies ahead shows. The flat map (tiles and GPS routes) is drawn into an offscreen
// "ground" canvas around the player and copied into the frame row by row, each row scaled across
// by the tilt. Icons and blips (points of interest, police, mission givers, the objective, the
// waypoint, the north marker) are placed through the same tilt in screen space and pinned to the
// frame's edge when out of range. A slight dark backing and a thin light frame with small corners.
import { drawMapIcon } from './mapIconPainter.js';
import {
  clampToRectangle, minimapArrowAngle, minimapRotationFromForward, projectToMinimap, tileRangeAround, tiltRowToMap, tiltToScreen,
} from './minimapProjection.js';
import { MINIMAP_PALETTE } from './minimapTiles.js';

const TILT = (35 * Math.PI) / 180;    // how far the map leans back
const DEPTH_PER_HEIGHT = 1.4;          // viewing distance, in frame heights (smaller: stronger perspective)
const PLAYER_DOWN = 0.63;              // the player's point, as a fraction of the frame's height from the top
const BACKING_PIXELS = 2.5;            // the dark backing around the map, at ratio 1
const CORNER_PIXELS = 5;               // the corner radius of the frame
const ROW_PIXELS = 2;                  // rows copied per draw call, at ratio 1

/** Traces a rounded rectangle. */
function traceRoundedRectangle(context, left, top, right, bottom, corner) {
  const r = Math.min(corner, (right - left) / 2, (bottom - top) / 2);
  context.beginPath();
  context.moveTo(left + r, top);
  context.arcTo(right, top, right, bottom, r);
  context.arcTo(right, bottom, left, bottom, r);
  context.arcTo(left, bottom, left, top, r);
  context.arcTo(left, top, right, top, r);
  context.closePath();
}

/**
 * Creates the radar.
 * @param {HTMLCanvasElement} canvas `hud-minimap`.
 * @param {ReturnType<import('./minimapTiles.js').createMinimapTiles>} tiles
 * @param {object} entities context.entities.
 * @param {{kind: string, x: number, z: number, letter: string, fill: string}[]} places Points of
 *   interest (ui/minimapPointsOfInterest.js).
 */
export function createMinimapRadar(canvas, tiles, entities, places) {
  const context = canvas.getContext('2d');
  const ground = canvas.ownerDocument.createElement('canvas');
  const groundContext = ground.getContext('2d');
  const flat = { x: 0, y: 0, pinned: false };
  const point = { x: 0, y: 0, ok: false, pinned: false };
  const row = { y: 0, scale: 1 };
  const range = { minI: 0, maxI: 0, minJ: 0, maxJ: 0 };
  const givers = new Map();                      // missionId -> {x, z, letter}
  let waypoint = null;
  let objective = null;
  let width = 0; let height = 0;                 // canvas size in device pixels
  let ratio = 1;
  let depth = 1; let originX = 0; let originY = 0; let groundHalf = 0;
  // The frame's inner edges relative to the player's screen point.
  let left = 0; let top = 0; let right = 0; let bottom = 0;
  // Per-draw values the blip visitor reads (set in draw, so the visitor allocates nothing).
  let centerX = 0; let centerZ = 0; let rotation = 0; let scale = 1; let flash = false;
  /** @type {CanvasGradient|string} */
  let distance = 'rgba(0, 0, 0, 0)';
  let smallFont = '';
  let largeFont = '';

  /**
   * Places a world point in screen space into `point` (pixels from the player's screen point);
   * false when it is out of range and not pinned. Pinned points ride the frame's edge.
   */
  function place(x, z, pin) {
    projectToMinimap(x - centerX, z - centerZ, rotation, scale, Infinity, flat);
    tiltToScreen(flat.x, flat.y, TILT, depth, point);
    const margin = (pin ? 9 : 4) * ratio;
    if (point.ok && point.x >= left + margin && point.x <= right - margin && point.y >= top + margin && point.y <= bottom - margin) return true;
    if (!pin) return false;
    // The ray from the player keeps its direction under the tilt: follow it to the edge.
    const length = Math.hypot(flat.x, flat.y) || 1;
    tiltToScreen((flat.x / length) * 8, (flat.y / length) * 8, TILT, depth, point);
    clampToRectangle(point.x * 1e4, point.y * 1e4, left + margin, top + margin, right - margin, bottom - margin, point);
    return true;
  }
  function blip(x, z, pin, fill, stroke, size) {
    if (!place(x, z, pin)) return;
    context.beginPath();
    context.arc(point.x, point.y, size * ratio, 0, Math.PI * 2);
    context.fillStyle = fill;
    context.fill();
    context.lineWidth = 1.6 * ratio;
    context.strokeStyle = stroke;
    context.stroke();
  }
  const visitPolice = (entity) => {
    blip(entity.position.x, entity.position.z, false, flash ? '#ff4b5c' : '#4b8dff', '#ffffff', 3.4);
  };
  const policeFilter = { tag: 'police' };
  const visitGiver = (giver) => {
    if (place(giver.x, giver.z, true)) drawMapIcon(context, 'giver', point.x, point.y, 7 * ratio, giver.letter);
  };
  // A GPS route on the ground canvas: a dark casing, then the colour.
  function drawRoute(route, colour) {
    if (!route || route.count < 2) return;
    const p = route.points;
    groundContext.beginPath();
    groundContext.moveTo((p[0] - centerX) * scale, (p[1] - centerZ) * scale);
    for (let k = 1; k < route.count; k += 1) groundContext.lineTo((p[k * 2] - centerX) * scale, (p[k * 2 + 1] - centerZ) * scale);
    groundContext.lineJoin = 'round';
    groundContext.lineCap = 'round';
    groundContext.lineWidth = 6 * ratio;
    groundContext.strokeStyle = 'rgba(16, 10, 24, 0.7)';
    groundContext.stroke();
    groundContext.lineWidth = 3.4 * ratio;
    groundContext.strokeStyle = colour;
    groundContext.stroke();
  }
  // The flat map around the player, turned so the view points up.
  function drawGround(view, gps) {
    const size = ground.width;
    groundContext.setTransform(1, 0, 0, 1, 0, 0);
    groundContext.fillStyle = MINIMAP_PALETTE.sea;
    groundContext.fillRect(0, 0, size, size);
    groundContext.translate(size / 2, size / 2);
    groundContext.rotate(rotation);
    const span = tiles.span;
    tileRangeAround(centerX, centerZ, (groundHalf / scale) * Math.SQRT2, span, range);
    let paints = tiles.count === 0 ? Infinity : 2;
    groundContext.imageSmoothingEnabled = true;
    for (let i = range.minI; i <= range.maxI; i += 1) {
      for (let j = range.minJ; j <= range.maxJ; j += 1) {
        const cached = tiles.has(i, j);
        const tile = tiles.get(i, j, cached || paints > 0);
        if (!cached && tile) paints -= 1;
        if (tile) groundContext.drawImage(tile, (i * span - centerX) * scale, (j * span - centerZ) * scale, span * scale + 0.5, span * scale + 0.5);
      }
    }
    if (gps) {
      drawRoute(gps.waypointRoute, '#e0408a');
      drawRoute(gps.objectiveRoute, '#ffcf4a');
    }
  }

  return {
    /**
     * Sizes the canvas backing store to its CSS size and works out the tilt's geometry.
     * @param {number} cssWidth
     * @param {number} cssHeight
     * @param {number} pixelRatio
     */
    resize(cssWidth, cssHeight, pixelRatio) {
      const k = Math.max(1, pixelRatio || 1);
      width = Math.max(96, Math.round(cssWidth * k));
      height = Math.max(64, Math.round(cssHeight * k));
      ratio = Math.max(1, width / 210);          // blips, arrow and frame grow with the map
      canvas.width = width;
      canvas.height = height;
      const inset = BACKING_PIXELS * ratio;
      originX = width / 2; originY = height * PLAYER_DOWN;
      left = inset - originX; right = width - inset - originX;
      top = inset - originY; bottom = height - inset - originY;
      depth = height * DEPTH_PER_HEIGHT;
      // The ground canvas covers every map row the frame shows, across its widest (top) row.
      tiltRowToMap(top, TILT, depth, row);
      groundHalf = Math.ceil(Math.max(-row.y, originX / row.scale, tiltRowToMap(bottom, TILT, depth, row).y) + 4 * ratio);
      ground.width = groundHalf * 2;
      ground.height = groundHalf * 2;
      distance = context.createLinearGradient(0, top, 0, top + (bottom - top) * 0.45);
      distance.addColorStop(0, 'rgba(12, 14, 20, 0.38)');
      distance.addColorStop(1, 'rgba(12, 14, 20, 0)');
      smallFont = `800 ${Math.round(7.5 * ratio)}px "Segoe UI", Arial, sans-serif`;
      largeFont = `800 ${Math.round(9 * ratio)}px "Segoe UI", Arial, sans-serif`;
    },
    /** @param {{x: number, z: number}|null} position */
    setWaypoint(position) { waypoint = position ? { x: position.x, z: position.z } : null; },
    /** @param {{x: number, z: number}|null} position */
    setObjective(position) { objective = position && Number.isFinite(position.x) ? { x: position.x, z: position.z } : null; },
    /** @param {string} missionId @param {{x: number, z: number}|null} position @param {string} [letter] */
    setMissionGiver(missionId, position, letter = '!') {
      if (position) givers.set(missionId, { x: position.x, z: position.z, letter });
      else givers.delete(missionId);
    },
    get waypoint() { return waypoint; },
    /**
     * Draws the radar.
     * @param {{x: number, z: number, forwardX: number, forwardZ: number, faceX: number, faceZ: number,
     *   radiusMetres: number, time: number, northUp?: boolean}} view radiusMetres: from the player to
     *   the frame's side edge on the player's row. northUp: north always up (the setting
     *   gameplay.minimapRotates off) instead of the view direction.
     * @param {{waypointRoute: object, objectiveRoute: object}|null} [gps] GPS routes to draw.
     */
    draw(view, gps = null) {
      if (!width) return;
      const corner = CORNER_PIXELS * ratio;
      centerX = view.x; centerZ = view.z;
      rotation = view.northUp ? 0 : minimapRotationFromForward(view.forwardX, view.forwardZ);
      scale = right / view.radiusMetres;
      flash = Math.floor(view.time * 4) % 2 === 0;
      drawGround(view, gps);

      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, width, height);
      context.save();
      context.translate(originX, originY);
      // The slight dark backing, then the tilted map clipped to the inner rounded rectangle.
      traceRoundedRectangle(context, -originX + 0.5, -originY + 0.5, width - originX - 0.5, height - originY - 0.5, corner + BACKING_PIXELS * ratio);
      context.fillStyle = 'rgba(10, 10, 16, 0.62)';
      context.fill();
      traceRoundedRectangle(context, left, top, right, bottom, corner);
      context.fillStyle = MINIMAP_PALETTE.sea;
      context.fill();
      context.clip();
      context.imageSmoothingEnabled = true;
      const step = Math.max(1, Math.round(ROW_PIXELS * ratio));
      for (let y0 = Math.floor(top); y0 < bottom; y0 += step) {
        const y1 = Math.min(bottom + 1, y0 + step);
        const mapTop = tiltRowToMap(y0, TILT, depth, row).y;
        const across = tiltRowToMap((y0 + y1) / 2, TILT, depth, row).scale;
        const mapBottom = tiltRowToMap(y1, TILT, depth, row).y;
        const half = originX / across;
        context.drawImage(ground, groundHalf - half, groundHalf + mapTop, half * 2, Math.max(0.5, mapBottom - mapTop),
          -originX, y0, width, y1 - y0);
      }
      // Distance haze toward the top, and a soft inner shade along the edges.
      context.fillStyle = distance;
      context.fillRect(left, top, right - left, bottom - top);
      traceRoundedRectangle(context, left, top, right, bottom, corner);
      context.lineWidth = 12 * ratio;
      context.strokeStyle = 'rgba(10, 12, 18, 0.12)';
      context.stroke();
      context.lineWidth = 5 * ratio;
      context.strokeStyle = 'rgba(10, 12, 18, 0.16)';
      context.stroke();

      // Icons and blips, least important first, upright in screen space.
      context.font = smallFont;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      for (let i = 0; i < places.length; i += 1) {
        const p = places[i];
        if (place(p.x, p.z, false)) drawMapIcon(context, p.kind, point.x, point.y, (p.kind === 'shop' ? 5.4 : 6.2) * ratio, p.letter, p.fill);
      }
      entities.forEachWithin(centerX, centerZ, view.radiusMetres * 2.2, visitPolice, policeFilter);
      context.font = largeFont;
      givers.forEach(visitGiver);
      if (objective) blip(objective.x, objective.z, true, '#ffd36b', '#2a1d10', 5.2 + (flash ? 1 : 0));
      if (waypoint) blip(waypoint.x, waypoint.z, true, '#e0408a', '#ffffff', 5.2);

      // The player's arrow, upright, pointing where the player faces as seen on the tilted map.
      const facing = minimapArrowAngle(view.faceX, view.faceZ, rotation);
      const angle = Math.atan2(Math.sin(facing), Math.cos(facing) * Math.cos(TILT));
      context.rotate(angle);
      context.beginPath();
      context.moveTo(0, -9.5 * ratio);
      context.lineTo(7 * ratio, 7.5 * ratio);
      context.lineTo(0, 3.8 * ratio);
      context.lineTo(-7 * ratio, 7.5 * ratio);
      context.closePath();
      context.lineJoin = 'round';
      context.lineWidth = 4 * ratio;
      context.strokeStyle = 'rgba(14, 10, 12, 0.85)';
      context.stroke();
      context.lineWidth = 1.9 * ratio;
      context.strokeStyle = '#fff6e6';
      context.stroke();
      context.fillStyle = '#ff5a3c';
      context.fill();
      context.rotate(-angle);
      context.restore();

      // The thin light frame, and the north marker riding it.
      context.save();
      context.translate(originX, originY);
      traceRoundedRectangle(context, left - 0.5 * ratio, top - 0.5 * ratio, right + 0.5 * ratio, bottom + 0.5 * ratio, corner);
      context.lineWidth = 1.5 * ratio;
      context.strokeStyle = 'rgba(255, 240, 212, 0.92)';
      context.stroke();
      projectToMinimap(0, -1, rotation, 1, Infinity, flat);
      tiltToScreen(flat.x * 8, flat.y * 8, TILT, depth, point);
      const inset = 4 * ratio;
      clampToRectangle(point.x * 1e4, point.y * 1e4, left + inset, top + inset, right - inset, bottom - inset, point);
      context.beginPath();
      context.arc(point.x, point.y, 6.5 * ratio, 0, Math.PI * 2);
      context.fillStyle = '#12110f';
      context.fill();
      context.lineWidth = 1.3 * ratio;
      context.strokeStyle = '#fff0d4';
      context.stroke();
      context.fillStyle = '#fff0d4';
      context.font = smallFont;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText('N', point.x, point.y + 0.5 * ratio);
      context.restore();
    },
  };
}

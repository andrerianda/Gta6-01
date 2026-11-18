// The radar in the corner of the HUD: a square window on the city plan with softly rounded
// corners that turns with the camera (the view direction always up; north up when the player
// turns that off), with the GPS routes to the waypoint and the objective along the roads, the
// player's arrow at its centre, flashing police blips, point-of-interest icons nearby (shops,
// hospitals, police stations, safehouses), mission givers, the current objective and the waypoint
// (pinned to the square's edge when they are out of range), on a slight dark backing inside a
// thin light frame with the north marker riding the frame.
import { drawMapIcon } from './mapIconPainter.js';
import {
  insideMinimapSquare, minimapArrowAngle, minimapRotationFromForward, projectToMinimap, tileRangeAround,
} from './minimapProjection.js';
import { MINIMAP_PALETTE } from './minimapTiles.js';

const BACKING_PIXELS = 3;        // the dark backing around the map, in radar pixels at ratio 1
const CORNER_PIXELS = 6;         // the corner radius of the frame

/**
 * Traces a rounded square of half-side `half` centred on the origin.
 * @param {CanvasRenderingContext2D} context
 * @param {number} half
 * @param {number} corner
 */
function traceRoundedSquare(context, half, corner) {
  const r = Math.min(corner, half);
  context.beginPath();
  context.moveTo(-half + r, -half);
  context.arcTo(half, -half, half, half, r);
  context.arcTo(half, half, -half, half, r);
  context.arcTo(-half, half, -half, -half, r);
  context.arcTo(-half, -half, half, -half, r);
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
  const point = { x: 0, y: 0, pinned: false };
  const range = { minI: 0, maxI: 0, minJ: 0, maxJ: 0 };
  const givers = new Map();                      // missionId -> {x, z, letter}
  let waypoint = null;
  let objective = null;
  let pixels = 0;                                // canvas size in device pixels
  let ratio = 1;
  // Per-draw values the blip visitor reads (set in draw, so the visitor allocates nothing).
  let centerX = 0; let centerZ = 0; let rotation = 0; let scale = 1; let edge = 0; let flash = false;

  /** Projects a world point into `point`; false when it falls outside the square and is not pinned. */
  function place(x, z, pin) {
    projectToMinimap(x - centerX, z - centerZ, rotation, scale, pin ? edge - 9 * ratio : Infinity, point);
    return pin || insideMinimapSquare(point, edge - 4 * ratio);
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
    blip(entity.position.x, entity.position.z, false, flash ? '#ff4b5c' : '#4b8dff', '#ffffff', 3.6);
  };
  const policeFilter = { tag: 'police' };
  const visitGiver = (giver) => {
    if (place(giver.x, giver.z, true)) drawMapIcon(context, 'giver', point.x, point.y, 7.5 * ratio, giver.letter);
  };
  // A GPS route in the map's turned frame: a dark casing, then the colour, ending at the edge.
  function drawRoute(route, colour) {
    if (!route || route.count < 2) return;
    const p = route.points;
    context.beginPath();
    context.moveTo((p[0] - centerX) * scale, (p[1] - centerZ) * scale);
    for (let k = 1; k < route.count; k += 1) context.lineTo((p[k * 2] - centerX) * scale, (p[k * 2 + 1] - centerZ) * scale);
    context.lineJoin = 'round';
    context.lineCap = 'round';
    context.lineWidth = 6.4 * ratio;
    context.strokeStyle = 'rgba(16, 10, 24, 0.7)';
    context.stroke();
    context.lineWidth = 3.6 * ratio;
    context.strokeStyle = colour;
    context.stroke();
  }
  let smallFont = '';
  let largeFont = '';

  return {
    /**
     * Sizes the canvas backing store to its CSS size.
     * @param {number} cssSize
     * @param {number} pixelRatio
     */
    resize(cssSize, pixelRatio) {
      pixels = Math.max(64, Math.round(cssSize * Math.max(1, pixelRatio || 1)));
      ratio = Math.max(1, pixels / 200);          // blips, arrow and frame grow with the map
      canvas.width = pixels;
      canvas.height = pixels;
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
     *   radiusMetres: number, time: number, northUp?: boolean}} view radiusMetres: from the centre to
     *   the square's edge. northUp: north always up (the setting gameplay.minimapRotates off)
     *   instead of the view direction.
     * @param {{waypointRoute: object, objectiveRoute: object}|null} [gps] GPS routes to draw.
     */
    draw(view, gps = null) {
      if (!pixels) return;
      const half = pixels / 2;
      const corner = CORNER_PIXELS * ratio;
      centerX = view.x; centerZ = view.z;
      rotation = view.northUp ? 0 : minimapRotationFromForward(view.forwardX, view.forwardZ);
      edge = half - BACKING_PIXELS * ratio;
      scale = edge / view.radiusMetres;
      flash = Math.floor(view.time * 4) % 2 === 0;
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, pixels, pixels);
      context.save();
      context.translate(half, half);
      // The slight dark backing, then the map clipped to the inner rounded square.
      traceRoundedSquare(context, half - 0.5, corner + BACKING_PIXELS * ratio);
      context.fillStyle = 'rgba(10, 10, 16, 0.62)';
      context.fill();
      traceRoundedSquare(context, edge, corner);
      context.fillStyle = MINIMAP_PALETTE.sea;
      context.fill();
      context.clip();

      // The map: every tile the turned square touches, painting the missing ones (all of them
      // when the radar has nothing yet, otherwise two a frame).
      context.rotate(rotation);
      const span = tiles.span;
      tileRangeAround(centerX, centerZ, view.radiusMetres * Math.SQRT2, span, range);
      let paints = tiles.count === 0 ? Infinity : 2;
      context.imageSmoothingEnabled = true;
      for (let i = range.minI; i <= range.maxI; i += 1) {
        for (let j = range.minJ; j <= range.maxJ; j += 1) {
          const cached = tiles.has(i, j);
          const tile = tiles.get(i, j, cached || paints > 0);
          if (!cached && tile) paints -= 1;
          if (tile) context.drawImage(tile, (i * span - centerX) * scale, (j * span - centerZ) * scale, span * scale + 0.5, span * scale + 0.5);
        }
      }
      if (gps) {
        drawRoute(gps.waypointRoute, '#e0408a');
        drawRoute(gps.objectiveRoute, '#ffcf4a');
      }
      context.rotate(-rotation);
      // A soft inner shade along the edges (wide translucent strokes, cut by the clip).
      traceRoundedSquare(context, edge, corner);
      context.lineWidth = 16 * ratio;
      context.strokeStyle = 'rgba(10, 12, 18, 0.12)';
      context.stroke();
      context.lineWidth = 7 * ratio;
      context.strokeStyle = 'rgba(10, 12, 18, 0.16)';
      context.stroke();

      // Icons and blips, least important first.
      context.font = smallFont;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      for (let i = 0; i < places.length; i += 1) {
        const p = places[i];
        if (place(p.x, p.z, false)) drawMapIcon(context, p.kind, point.x, point.y, (p.kind === 'shop' ? 5.6 : 6.4) * ratio, p.letter, p.fill);
      }
      entities.forEachWithin(centerX, centerZ, view.radiusMetres * 1.5, visitPolice, policeFilter);
      context.font = largeFont;
      givers.forEach(visitGiver);
      if (objective) blip(objective.x, objective.z, true, '#ffd36b', '#2a1d10', 5.5 + (flash ? 1 : 0));
      if (waypoint) blip(waypoint.x, waypoint.z, true, '#e0408a', '#ffffff', 5.5);

      // The player's arrow: solid coral with a cream rim and a dark outline, so it holds on the
      // light roads and the dark blocks alike.
      const angle = minimapArrowAngle(view.faceX, view.faceZ, rotation);
      context.rotate(angle);
      context.beginPath();
      context.moveTo(0, -10 * ratio);
      context.lineTo(7.5 * ratio, 8 * ratio);
      context.lineTo(0, 4 * ratio);
      context.lineTo(-7.5 * ratio, 8 * ratio);
      context.closePath();
      context.lineJoin = 'round';
      context.lineWidth = 4.2 * ratio;
      context.strokeStyle = 'rgba(14, 10, 12, 0.85)';
      context.stroke();
      context.lineWidth = 2 * ratio;
      context.strokeStyle = '#fff6e6';
      context.stroke();
      context.fillStyle = '#ff5a3c';
      context.fill();
      context.rotate(-angle);
      context.restore();

      // The thin light frame, and the north marker riding it.
      context.save();
      context.translate(half, half);
      traceRoundedSquare(context, edge + 0.5 * ratio, corner);
      context.lineWidth = 1.5 * ratio;
      context.strokeStyle = 'rgba(255, 240, 212, 0.92)';
      context.stroke();
      projectToMinimap(0, -1, rotation, 1e6, edge - 3.5 * ratio, point);
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

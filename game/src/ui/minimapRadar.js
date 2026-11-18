// The radar in the corner of the HUD: a round window on the city plan that turns with the camera
// (the view direction always up), with the player's arrow at its centre, flashing police blips,
// shop icons nearby, mission givers, the current objective and the waypoint (pinned to the rim
// when they are out of range), and a north marker riding the bezel.
import { minimapArrowAngle, minimapRotationFromForward, projectToMinimap, tileRangeForDisc } from './minimapProjection.js';

/** Letters and colours of the shop kinds on the radar (SHOP_KINDS ids). */
const SHOP_BLIPS = Object.freeze({
  gun_shop: ['G', '#ff8a5c'], clothing_store: ['C', '#f39ac0'], paint_and_body_shop: ['S', '#b79cff'],
  mod_garage: ['W', '#6fd6c8'], car_dealership: ['D', '#8fc8ff'], boat_dealer: ['B', '#6fb8ff'], diner: ['F', '#ffd36b'],
  bar_cantina: ['F', '#ffd36b'], convenience_store: ['$', '#9fe39a'], fuel_station: ['P', '#c9e36b'], motel: ['M', '#e3c39a'],
  phone_kiosk: ['T', '#9adfe3'],
});

/**
 * Creates the radar.
 * @param {HTMLCanvasElement} canvas `hud-minimap`.
 * @param {ReturnType<import('./minimapTiles.js').createMinimapTiles>} tiles
 * @param {object} entities context.entities.
 * @param {{x: number, z: number, kind: string}[]} shops Shop positions from the plan's landmarks.
 */
export function createMinimapRadar(canvas, tiles, entities, shops) {
  const context = canvas.getContext('2d');
  const point = { x: 0, y: 0, pinned: false };
  const range = { minI: 0, maxI: 0, minJ: 0, maxJ: 0 };
  const givers = new Map();                      // missionId -> {x, z, letter}
  let waypoint = null;
  let objective = null;
  let pixels = 0;                                // canvas size in device pixels
  let ratio = 1;
  // Per-draw values the blip visitor reads (set in draw, so the visitor allocates nothing).
  let centerX = 0; let centerZ = 0; let rotation = 0; let scale = 1; let radius = 0; let flash = false;

  function blip(x, z, pin, fill, stroke, size, letter) {
    projectToMinimap(x - centerX, z - centerZ, rotation, scale, pin ? radius - 9 * ratio : Infinity, point);
    if (!pin && Math.hypot(point.x, point.y) > radius - 4 * ratio) return;
    context.beginPath();
    context.arc(point.x, point.y, size * ratio, 0, Math.PI * 2);
    context.fillStyle = fill;
    context.fill();
    context.lineWidth = 1.6 * ratio;
    context.strokeStyle = stroke;
    context.stroke();
    if (letter) {
      context.fillStyle = stroke;
      context.fillText(letter, point.x, point.y + 0.5 * ratio);
    }
  }
  const visitPolice = (entity) => {
    blip(entity.position.x, entity.position.z, false, flash ? '#ff4b5c' : '#4b8dff', '#ffffff', 3.6, '');
  };
  const policeFilter = { tag: 'police' };
  const visitGiver = (giver) => blip(giver.x, giver.z, true, '#ffcf5a', '#2a1d10', 7, giver.letter);
  /** @type {CanvasGradient|string} */
  let shade = 'rgba(0, 0, 0, 0)';
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
      ratio = Math.max(1, pixels / 180);          // blips, arrow and bezel grow with the disc
      canvas.width = pixels;
      canvas.height = pixels;
      const rim = pixels / 2 - 3 * ratio;
      shade = context.createRadialGradient(0, 0, rim * 0.55, 0, 0, rim);
      shade.addColorStop(0, 'rgba(10, 12, 18, 0)');
      shade.addColorStop(1, 'rgba(10, 12, 18, 0.45)');
      smallFont = `800 ${Math.round(8 * ratio)}px "Segoe UI", Arial, sans-serif`;
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
     *   radiusMetres: number, time: number}} view
     */
    draw(view) {
      if (!pixels) return;
      const half = pixels / 2;
      centerX = view.x; centerZ = view.z;
      rotation = minimapRotationFromForward(view.forwardX, view.forwardZ);
      radius = half - 3 * ratio;
      scale = radius / view.radiusMetres;
      flash = Math.floor(view.time * 4) % 2 === 0;
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, pixels, pixels);
      context.save();
      context.beginPath();
      context.arc(half, half, radius, 0, Math.PI * 2);
      context.fillStyle = '#16404f';
      context.fill();
      context.clip();

      // The map: every tile the disc touches, painting the missing ones (all of them when the
      // radar has nothing yet, otherwise two a frame).
      context.translate(half, half);
      context.rotate(rotation);
      const span = tiles.span;
      const reach = view.radiusMetres * 1.0;
      tileRangeForDisc(centerX, centerZ, reach, span, range);
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
      context.rotate(-rotation);
      // A soft vignette toward the rim.
      context.fillStyle = shade;
      context.fillRect(-half, -half, pixels, pixels);

      // Blips, least important first.
      context.font = smallFont;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      for (let i = 0; i < shops.length; i += 1) {
        const style = SHOP_BLIPS[shops[i].kind];
        if (style) blip(shops[i].x, shops[i].z, false, '#1d1b19', style[1], 6, style[0]);
      }
      entities.forEachWithin(centerX, centerZ, view.radiusMetres * 1.5, visitPolice, policeFilter);
      context.font = largeFont;
      givers.forEach(visitGiver);
      if (objective) blip(objective.x, objective.z, true, '#ffd36b', '#2a1d10', 5.5 + (flash ? 1 : 0), '');
      if (waypoint) blip(waypoint.x, waypoint.z, true, '#e0408a', '#ffffff', 5.5, '');

      // The player's arrow.
      const angle = minimapArrowAngle(view.faceX, view.faceZ, rotation);
      context.rotate(angle);
      context.beginPath();
      context.moveTo(0, -9 * ratio);
      context.lineTo(6.5 * ratio, 7 * ratio);
      context.lineTo(0, 3.5 * ratio);
      context.lineTo(-6.5 * ratio, 7 * ratio);
      context.closePath();
      context.fillStyle = '#fff6e6';
      context.fill();
      context.lineWidth = 1.8 * ratio;
      context.strokeStyle = '#e8573f';
      context.stroke();
      context.rotate(-angle);
      context.restore();

      // The bezel and the north marker riding it.
      context.save();
      context.translate(half, half);
      context.beginPath();
      context.arc(0, 0, radius, 0, Math.PI * 2);
      context.lineWidth = 3 * ratio;
      context.strokeStyle = 'rgba(255, 238, 205, 0.92)';
      context.stroke();
      projectToMinimap(0, -1, rotation, 1, Infinity, point);
      const markerX = point.x * (radius - 1 * ratio);
      const markerY = point.y * (radius - 1 * ratio);
      context.beginPath();
      context.arc(markerX, markerY, 8.5 * ratio, 0, Math.PI * 2);
      context.fillStyle = '#1d1b19';
      context.fill();
      context.lineWidth = 1.6 * ratio;
      context.strokeStyle = '#fff6e6';
      context.stroke();
      context.fillStyle = '#fff6e6';
      context.font = largeFont;
      context.fillText('N', markerX, markerY + 0.5 * ratio);
      context.restore();
    },
  };
}

// The minimap's map tiles: the city plan painted once by the plan library's cityPlanPainter into
// small offscreen canvases (square tiles of the world at a fixed pixels-per-metre), kept in a
// least-recently-used cache, so that the radar only has to rotate and blit a few images per
// frame. Each tile paints only the lots and roads that reach into it. The radar's own look: a blue
// sea, a dark warm ground, light roads, and every built lot as a soft rounded block with a shadow.
import { paintCityPlan } from '../world/plan/cityPlanPainter.js';

/** The radar's colours: azure sea, charcoal ground, sandy blocks, cream and amber roads. */
export const MINIMAP_PALETTE = Object.freeze({
  sea: '#2a6ea6', shallows: '#3f8fc4', land: '#2b2a27', wetland: '#33503b', sand: '#8a7754',
  building: '#4f4a42', landmark: '#8a5a48', landmarkDot: '#e58f6a', label: '#f4efe6', labelHalo: 'rgba(0,0,0,0.6)',
  roadCasing: '#151413', bridgeCasing: '#0e1012',
  road: Object.freeze({ highway: '#f6c766', avenue: '#f3ead6', ramp: '#eec27a', street: '#d8d1c2', alley: '#aaa395', service: '#a39d90', dirt: '#8d7c5f' }),
  zone: Object.freeze({
    hotel: '#5d4f55', tower: '#4e5762', retail: '#5b5345', mixed_use: '#534f5a', residential_low: '#514c43', residential_high: '#574e46',
    villa: '#554f44', industrial: '#4c4b47', port_yard: '#484c52', leisure: '#5b5341', rural: '#46442f', park: '#3d6b40', plaza: '#5d584e',
    parking: '#3a3936',
  }),
  zoning: Object.freeze({}),
});

/** Lot zones painted flat to the lot's edge (open ground, not a building block). */
const FLAT_ZONES = new Set(['park', 'plaza', 'parking', 'rural']);
const BLOCK_INSET_METRES = 2.5;          // a block stands this far inside its lot
const BLOCK_ROUNDING_METRES = 2.2;       // corner radius of a block

/** A number naming tile (i, j), so a lookup allocates no string. */
const tileKey = (i, j) => (i + 4096) * 8192 + (j + 4096);

const PAINT_STYLE = Object.freeze({ lots: false, labels: false, landmarks: false, boatLanes: false, palette: MINIMAP_PALETTE });

/**
 * Paints the lots of a tile as soft blocks: inset, rounded by a stroke of their own colour,
 * over a faint shadow; open lots (parks, plazas, car parks) flat.
 * @param {CanvasRenderingContext2D} context
 * @param {object[]} lots
 * @param {(x: number) => number} px World x to tile pixels.
 * @param {(z: number) => number} pz World z to tile pixels.
 * @param {number} scale Pixels per metre.
 */
function paintSoftBlocks(context, lots, px, pz, scale) {
  context.lineJoin = 'round';
  for (const pass of ['shadow', 'block']) {
    for (const lot of lots) {
      const ring = lot.ring;
      const count = ring.length / 2;
      let cx = 0; let cz = 0;
      for (let k = 0; k < count; k += 1) { cx += ring[k * 2]; cz += ring[k * 2 + 1]; }
      cx /= count; cz /= count;
      const flat = FLAT_ZONES.has(lot.zone);
      if (flat && pass === 'shadow') continue;
      const short = Math.max(4, Math.min(lot.width ?? 20, lot.depth ?? 20));
      const shrink = flat ? 0 : Math.min(0.42, (BLOCK_INSET_METRES + BLOCK_ROUNDING_METRES) / (short / 2));
      const k0 = 1 - shrink;
      const offset = pass === 'shadow' ? 1.6 * scale : 0;
      context.beginPath();
      for (let k = 0; k < count; k += 1) {
        const x = px(cx + (ring[k * 2] - cx) * k0) + offset;
        const y = pz(cz + (ring[k * 2 + 1] - cz) * k0) + offset;
        if (k === 0) context.moveTo(x, y); else context.lineTo(x, y);
      }
      context.closePath();
      const colour = pass === 'shadow' ? 'rgba(6, 6, 8, 0.38)'
        : lot.landmarkId && lot.zone === 'landmark' ? MINIMAP_PALETTE.landmark
          : MINIMAP_PALETTE.zone[lot.zone] ?? MINIMAP_PALETTE.building;
      context.fillStyle = colour;
      context.fill();
      if (!flat) {
        context.lineWidth = BLOCK_ROUNDING_METRES * 2 * scale;
        context.strokeStyle = colour;
        context.stroke();
      }
    }
  }
}

/**
 * Creates the tile cache.
 * @param {Document} document
 * @param {object} plan The city plan.
 * @param {{tileMetres?: number, pixelsPerMetre?: number, capacity?: number}} [options]
 */
export function createMinimapTiles(document, plan, options = {}) {
  const span = options.tileMetres ?? 256;
  const pixelsPerMetre = options.pixelsPerMetre ?? 1;
  const capacity = options.capacity ?? 40;
  const size = Math.round(span * pixelsPerMetre);
  /** @type {Map<number, {canvas: HTMLCanvasElement, used: number}>} */
  const tiles = new Map();
  const spare = [];
  let clock = 0;

  // Bounds of every road segment, once, so a tile can pick the roads that reach into it.
  const segmentBounds = plan.roads.segments.map((segment) => {
    let minX = Infinity; let minZ = Infinity; let maxX = -Infinity; let maxZ = -Infinity;
    for (let i = 0; i < segment.points.length; i += 2) {
      minX = Math.min(minX, segment.points[i]); maxX = Math.max(maxX, segment.points[i]);
      minZ = Math.min(minZ, segment.points[i + 1]); maxZ = Math.max(maxZ, segment.points[i + 1]);
    }
    const pad = (segment.width ?? 12) / 2 + 2;
    return { segment, minX: minX - pad, minZ: minZ - pad, maxX: maxX + pad, maxZ: maxZ + pad };
  });

  function paint(i, j) {
    const canvas = spare.pop() ?? Object.assign(document.createElement('canvas'), { width: size, height: size });
    const minX = i * span; const minZ = j * span;
    const maxX = minX + span; const maxZ = minZ + span;
    const lotReach = 60;
    const lots = plan.lots.filter((lot) => lot.x > minX - lotReach && lot.x < maxX + lotReach && lot.z > minZ - lotReach && lot.z < maxZ + lotReach);
    const subset = {
      ...plan,
      lots,
      roads: { ...plan.roads, segments: segmentBounds
        .filter((b) => b.maxX > minX && b.minX < maxX && b.maxZ > minZ && b.minZ < maxZ).map((b) => b.segment) },
    };
    const context = canvas.getContext('2d');
    const view = { centerX: minX + span / 2, centerZ: minZ + span / 2, scale: pixelsPerMetre, width: size, height: size };
    paintCityPlan(context, subset, view, PAINT_STYLE);
    // The blocks go over the painted ground; lots never reach into the roadway.
    context.save();
    paintSoftBlocks(context, lots, (x) => (x - minX) * pixelsPerMetre, (z) => (z - minZ) * pixelsPerMetre, pixelsPerMetre);
    context.restore();
    return canvas;
  }

  return {
    span,
    /**
     * The tile (i, j), painted now if it is not cached and `mayPaint` allows.
     * @param {number} i Tile column (x / span).
     * @param {number} j Tile row (z / span).
     * @param {boolean} mayPaint
     * @returns {HTMLCanvasElement|null}
     */
    get(i, j, mayPaint) {
      const key = tileKey(i, j);
      clock += 1;
      let tile = tiles.get(key);
      if (tile) {
        tile.used = clock;
        return tile.canvas;
      }
      if (!mayPaint) return null;
      if (tiles.size >= capacity) {
        let oldestKey = null; let oldest = Infinity;
        for (const [k, entry] of tiles) if (entry.used < oldest) { oldest = entry.used; oldestKey = k; }
        spare.push(tiles.get(oldestKey).canvas);
        tiles.delete(oldestKey);
      }
      tile = { canvas: paint(i, j), used: clock };
      tiles.set(key, tile);
      return tile.canvas;
    },
    /** @param {number} i @param {number} j @returns {boolean} */
    has(i, j) { return tiles.has(tileKey(i, j)); },
    get count() { return tiles.size; },
    dispose() { tiles.clear(); spare.length = 0; },
  };
}

// The minimap's map tiles: the city plan painted once by the plan library's cityPlanPainter into
// small offscreen canvases (square tiles of the world at a fixed pixels-per-metre), kept in a
// least-recently-used cache, so that the radar only has to rotate and blit a few images per
// frame. Each tile paints only the lots and roads that reach into it. The radar's own look, calm
// and readable: blue water, dark muted ground, roads as light lines of their real width, and
// every built lot as a faint soft block barely lighter than the ground.
import { paintCityPlan } from '../world/plan/cityPlanPainter.js';

/** The radar's colours, calm and readable: blue water, dark muted ground, light roads, faint blocks. */
export const MINIMAP_PALETTE = Object.freeze({
  sea: '#2c6a9c', shallows: '#3a7fb0', land: '#25272a', wetland: '#2b3a30', sand: '#4d483e',
  building: '#2e3034', landmark: '#3a3432', landmarkDot: '#e58f6a', label: '#f4efe6', labelHalo: 'rgba(0,0,0,0.6)',
  roadCasing: '#1b1c1f', bridgeCasing: '#151619',
  road: Object.freeze({ highway: '#e9c780', avenue: '#ece8de', ramp: '#dcc08a', street: '#d2cfc7', alley: '#8e8b85', service: '#8a8782', dirt: '#6b6354' }),
  zone: Object.freeze({
    hotel: '#312f34', tower: '#2d3137', retail: '#32302d', mixed_use: '#302f35', residential_low: '#2f2e2c', residential_high: '#31302e',
    villa: '#2f2e2b', industrial: '#2d2e2f', port_yard: '#2b2e32', leisure: '#32312b', rural: '#2b2c25', park: '#2b3d30', plaza: '#33322f',
    parking: '#292a2c',
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
 * Paints the lots of a tile as faint soft blocks, barely lighter than the ground: inset and
 * rounded by a stroke of their own colour; open lots (parks, plazas, car parks) flat.
 * @param {CanvasRenderingContext2D} context
 * @param {object[]} lots
 * @param {(x: number) => number} px World x to tile pixels.
 * @param {(z: number) => number} pz World z to tile pixels.
 * @param {number} scale Pixels per metre.
 */
function paintSoftBlocks(context, lots, px, pz, scale) {
  context.lineJoin = 'round';
  for (const lot of lots) {
    const ring = lot.ring;
    const count = ring.length / 2;
    let cx = 0; let cz = 0;
    for (let k = 0; k < count; k += 1) { cx += ring[k * 2]; cz += ring[k * 2 + 1]; }
    cx /= count; cz /= count;
    const flat = FLAT_ZONES.has(lot.zone);
    const short = Math.max(4, Math.min(lot.width ?? 20, lot.depth ?? 20));
    const k0 = 1 - (flat ? 0 : Math.min(0.42, (BLOCK_INSET_METRES + BLOCK_ROUNDING_METRES) / (short / 2)));
    context.beginPath();
    for (let k = 0; k < count; k += 1) {
      const x = px(cx + (ring[k * 2] - cx) * k0);
      const y = pz(cz + (ring[k * 2 + 1] - cz) * k0);
      if (k === 0) context.moveTo(x, y); else context.lineTo(x, y);
    }
    context.closePath();
    const colour = lot.landmarkId && lot.zone === 'landmark' ? MINIMAP_PALETTE.landmark
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

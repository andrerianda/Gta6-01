// The minimap's map tiles: the city plan painted once by the plan library's cityPlanPainter into
// small offscreen canvases (square tiles of the world at a fixed pixels-per-metre), kept in a
// least-recently-used cache, so that the radar only has to rotate and blit a few images per
// frame. Each tile paints only the lots and roads that reach into it.
import { paintCityPlan } from '../world/plan/cityPlanPainter.js';

/** The radar's colours: warm dark ground, teal water, cream and amber roads. */
export const MINIMAP_PALETTE = Object.freeze({
  sea: '#16404f', shallows: '#1f5566', land: '#2f2d29', wetland: '#2c3a2c', sand: '#5a4c37',
  building: '#3e3a35', landmark: '#6a4a3a', landmarkDot: '#e58f6a', label: '#f4efe6', labelHalo: 'rgba(0,0,0,0.6)',
  roadCasing: '#1b1a18', bridgeCasing: '#101214',
  road: Object.freeze({ highway: '#f0b250', avenue: '#e9dcb8', ramp: '#e0b06a', street: '#b9b1a1', alley: '#8c8577', service: '#857f73', dirt: '#7a6a4f' }),
  zone: Object.freeze({
    hotel: '#4a3c40', tower: '#3a4048', retail: '#463f34', mixed_use: '#3f3c44', residential_low: '#3d3a33', residential_high: '#423b35',
    villa: '#413d34', industrial: '#3a3936', port_yard: '#373a3e', leisure: '#46402f', rural: '#38362c', park: '#2f4a2f', plaza: '#47433b',
  }),
  zoning: Object.freeze({}),
});

/** A number naming tile (i, j), so a lookup allocates no string. */
const tileKey = (i, j) => (i + 4096) * 8192 + (j + 4096);

const PAINT_STYLE = Object.freeze({ labels: false, landmarks: false, boatLanes: false, palette: MINIMAP_PALETTE });

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
  /** @type {Map<string, {canvas: HTMLCanvasElement, used: number}>} */
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
    const subset = {
      ...plan,
      lots: plan.lots.filter((lot) => lot.x > minX - lotReach && lot.x < maxX + lotReach && lot.z > minZ - lotReach && lot.z < maxZ + lotReach),
      roads: { ...plan.roads, segments: segmentBounds
        .filter((b) => b.maxX > minX && b.minX < maxX && b.maxZ > minZ && b.minZ < maxZ).map((b) => b.segment) },
    };
    const context = canvas.getContext('2d');
    paintCityPlan(context, subset, { centerX: minX + span / 2, centerZ: minZ + span / 2, scale: pixelsPerMetre, width: size, height: size }, PAINT_STYLE);
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

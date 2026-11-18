// Makes the ground and what is built on it agree. First the road profiles are limited to a ten
// percent gradient (hill streets cut and fill instead of following the slope); then the height
// field is pressed to the road heights and to a level pad under every lot, with banks that blend
// back into the natural ground. After this, `terrain.heightAt` under a road is the road's height
// and under a building it is `lot.y`.
//
//   limitRoadGradients(roads);                 // after assembleRoadGraph
//   conformTerrain(terrain, roads, lots);      // after the lots are placed

import { projectOnPolyline } from './planGeometry.js';

/** The steepest gradient a road may have after limiting. */
export const MAX_ROAD_GRADIENT = 0.1;

const WORKING_GRADIENT = 0.096;
const ROAD_CORE_MARGIN = 4;
const ROAD_BLEND = 12;
const LOT_CORE_MARGIN = 2;
const LOT_BLEND = 8;
const SHORE_FADE = 5;

/**
 * Limits the gradient of every road to MAX_ROAD_GRADIENT by moving heights of neighbouring
 * samples towards each other, junction heights included. Heights change only where a road was
 * too steep.
 * @param {{nodes: import('./roadGraphAssembly.js').RoadNode[], segments: import('./roadGraphAssembly.js').RoadSegment[]}} roads
 * @returns {number} The passes it took.
 */
export function limitRoadGradients(roads) {
  const { nodes, segments } = roads;
  const sum = new Float64Array(nodes.length);
  const count = new Uint16Array(nodes.length);
  let pass = 0;
  for (; pass < 600; pass += 1) {
    let worst = 0;
    sum.fill(0);
    count.fill(0);
    for (const segment of segments) {
      const h = segment.heights;
      const s = segment.along;
      const n = h.length;
      h[0] = nodes[segment.a].y;
      h[n - 1] = nodes[segment.b].y;
      for (let sweep = 0; sweep < 2; sweep += 1) {
        for (let k = 1; k < n; k += 1) {
          const i = sweep === 0 ? k : n - k;
          const difference = h[i] - h[i - 1];
          const excess = Math.abs(difference) - WORKING_GRADIENT * (s[i] - s[i - 1]);
          if (excess <= 0) continue;
          if (excess > worst) worst = excess;
          const move = (difference > 0 ? 0.5 : -0.5) * excess;
          h[i] -= move;
          h[i - 1] += move;
        }
      }
      sum[segment.a] += h[0];
      count[segment.a] += 1;
      sum[segment.b] += h[n - 1];
      count[segment.b] += 1;
    }
    for (const node of nodes) if (count[node.id] > 0) node.y = sum[node.id] / count[node.id];
    if (worst < 0.004) break;
  }
  for (const segment of segments) {
    segment.heights[0] = nodes[segment.a].y;
    segment.heights[segment.heights.length - 1] = nodes[segment.b].y;
  }
  return pass;
}

/**
 * The height of a road's surface a distance along it.
 * @param {import('./roadGraphAssembly.js').RoadSegment} segment
 * @param {number} along Metres from the segment's first point.
 * @returns {number}
 */
export function roadHeightAlong(segment, along) {
  const s = segment.along;
  const h = segment.heights;
  let low = 0;
  let high = s.length - 1;
  if (along <= 0) return h[0];
  if (along >= s[high]) return h[high];
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (s[middle] <= along) low = middle;
    else high = middle;
  }
  const t = (along - s[low]) / Math.max(1e-6, s[high] - s[low]);
  return h[low] + (h[high] - h[low]) * t;
}

/**
 * Presses the height field to the roads and to the lot pads. Sets `lot.y` of every built lot to
 * the height of its street at the entrance (parks keep their natural ground). Inside a road
 * corridor the ground is the road, inside a lot it is the pad, and on open ground both blend into
 * the natural relief. Water stays water: samples off shore are not touched, and the press fades
 * out over the last metres to the shore.
 * @param {import('./terrainHeightField.js').TerrainHeightField} terrain Changed in place.
 * @param {{nodes: import('./roadGraphAssembly.js').RoadNode[], segments: import('./roadGraphAssembly.js').RoadSegment[]}} roads
 * @param {import('./lotPlacement.js').CityLot[]} lots
 * @param {import('./lotPlacement.js').GroundCover} cover The raster of road corridors and lots.
 * @param {{x: number, z: number, frontX: number, frontZ: number, width: number, depth: number, y: number}[]} [pads]
 *   More level rectangles (the promenade, the runway): `depth` lies along the front direction.
 */
export function conformTerrain(terrain, roads, lots, cover, pads = []) {
  const { heights, columns, rows, minX, minZ, cellSize, shoreDistance } = terrain;
  const weightSum = new Float32Array(heights.length);
  const heightSum = new Float32Array(heights.length);
  const padWeightSum = new Float32Array(heights.length);
  const padHeightSum = new Float32Array(heights.length);
  const strongest = new Float32Array(heights.length);

  // A road piece from A to B: full weight within `core` of it, fading to nothing at `reach`.
  const pressPiece = (ax, az, ah, bx, bz, bh, core, reach) => {
    const c0 = Math.max(0, Math.ceil((Math.min(ax, bx) - reach - minX) / cellSize));
    const c1 = Math.min(columns - 1, Math.floor((Math.max(ax, bx) + reach - minX) / cellSize));
    const r0 = Math.max(0, Math.ceil((Math.min(az, bz) - reach - minZ) / cellSize));
    const r1 = Math.min(rows - 1, Math.floor((Math.max(az, bz) + reach - minZ) / cellSize));
    const ux = bx - ax;
    const uz = bz - az;
    const inverse = 1 / Math.max(1e-6, ux * ux + uz * uz);
    const fade = 1 / (reach - core);
    for (let r = r0; r <= r1; r += 1) {
      const pz = minZ + r * cellSize - az;
      for (let c = c0; c <= c1; c += 1) {
        const px = minX + c * cellSize - ax;
        let t = (px * ux + pz * uz) * inverse;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const dx = px - ux * t;
        const dz = pz - uz * t;
        const d2 = dx * dx + dz * dz;
        if (d2 >= reach * reach) continue;
        const index = r * columns + c;
        let w = 1;
        if (d2 > core * core) {
          const f = (Math.sqrt(d2) - core) * fade;
          w = 1 - f * f * (3 - 2 * f);
        }
        // Where two roads lie close together, each keeps its own surface: the nearer one counts far more.
        const w2 = w * w;
        const w8 = (w2 * w2 * w2 * w2) / (1 + (d2 * d2) / 64);
        weightSum[index] += w8;
        heightSum[index] += w8 * (ah + (bh - ah) * t);
        if (w > strongest[index]) strongest[index] = w;
      }
    }
  };

  for (const segment of roads.segments) {
    const core = Math.max(segment.corridorLeft, segment.corridorRight) + ROAD_CORE_MARGIN;
    const p = segment.points;
    const h = segment.heights;
    for (let i = 0; i + 1 < h.length; i += 1) {
      pressPiece(p[i * 2], p[i * 2 + 1], h[i], p[i * 2 + 2], p[i * 2 + 3], h[i + 1], core, core + ROAD_BLEND);
    }
  }
  for (const node of roads.nodes) {
    if (node.culDeSac) pressPiece(node.x, node.z, node.y, node.x, node.z, node.y, 13 + ROAD_CORE_MARGIN, 13 + ROAD_CORE_MARGIN + ROAD_BLEND);
  }

  // A level rectangle: full weight inside it (and a little beyond), fading out over LOT_BLEND.
  const pressPad = (pad, y) => {
    const halfWidth = pad.width / 2 + LOT_CORE_MARGIN;
    const halfDepth = pad.depth / 2 + LOT_CORE_MARGIN;
    const reach = Math.hypot(halfWidth, halfDepth) + LOT_BLEND;
    const c0 = Math.max(0, Math.ceil((pad.x - reach - minX) / cellSize));
    const c1 = Math.min(columns - 1, Math.floor((pad.x + reach - minX) / cellSize));
    const r0 = Math.max(0, Math.ceil((pad.z - reach - minZ) / cellSize));
    const r1 = Math.min(rows - 1, Math.floor((pad.z + reach - minZ) / cellSize));
    for (let r = r0; r <= r1; r += 1) {
      const pz = minZ + r * cellSize - pad.z;
      for (let c = c0; c <= c1; c += 1) {
        const px = minX + c * cellSize - pad.x;
        const outV = Math.abs(px * pad.frontX + pz * pad.frontZ) - halfDepth;
        if (outV >= LOT_BLEND) continue;
        const outU = Math.abs(-px * pad.frontZ + pz * pad.frontX) - halfWidth;
        if (outU >= LOT_BLEND) continue;
        const d = Math.hypot(Math.max(outU, 0), Math.max(outV, 0));
        if (d >= LOT_BLEND) continue;
        const index = r * columns + c;
        const f = d / LOT_BLEND;
        const w = 1 - f * f * (3 - 2 * f);
        const w2 = w * w;
        const w8 = w2 * w2 * w2 * w2;
        padWeightSum[index] += w8;
        padHeightSum[index] += w8 * y;
        if (w > strongest[index]) strongest[index] = w;
      }
    }
  };
  const natural = [];
  for (const lot of lots) {
    if (lot.zone === 'park') {
      natural.push(lot);
      continue;
    }
    const segment = roads.segments[lot.frontages[0].segment];
    const hit = projectOnPolyline(segment.points, lot.entrance.x, lot.entrance.z);
    lot.y = roadHeightAlong(segment, hit.along);
    pressPad(lot, lot.y);
  }
  for (const pad of pads) pressPad(pad, pad.y);

  for (let index = 0; index < heights.length; index += 1) {
    const w = strongest[index];
    if (w === 0) continue;
    const shore = shoreDistance[index];
    if (shore <= 0) continue;
    // What stands on this sample decides: a road corridor, a lot pad, or open ground between them.
    const column = index % columns;
    const code = cover.codeAt(minX + column * cellSize + 0.5, minZ + ((index - column) / columns) * cellSize + 0.5);
    let target;
    let weight = w;
    if (code >= 3 && padWeightSum[index] > 0 && lots[code - 3].zone !== 'park') {
      target = lots[code - 3].y;
      weight = 1;
    } else if ((code === 1 || code === 2) && weightSum[index] > 0) {
      target = heightSum[index] / weightSum[index];
    } else {
      target = (heightSum[index] + padHeightSum[index]) / (weightSum[index] + padWeightSum[index]);
    }
    heights[index] += (target - heights[index]) * (shore >= SHORE_FADE ? weight : (weight * shore) / SHORE_FADE);
  }
  for (const lot of natural) lot.y = Math.max(terrain.heightAt(lot.x, lot.z), 1);
}

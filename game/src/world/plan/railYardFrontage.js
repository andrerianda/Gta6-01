// Gives the rail yard's side street a row of buildings. The train yard landmark is a huge open
// lot (100 x 84 m, no building); where it stands on a corner its long side edge runs along the
// cross street, so that street looked across 100 m of bare concrete (Calle Gaviota in Barrio
// Hierro, the first mission giver's street, QA bug 5). This pass pulls the yard back from the
// side street and lines that frontage with ordinary industrial lots (warehouses and workshops of
// the industrial kit, with their yard fences and service clutter), so the street reads as a
// worn industrial block and the yard opens behind it. It runs after every street is filled and
// takes no random numbers, so every other lot of the city stays exactly where it was.
//
//   lineRailYardSideStreets(state, tryPlaceLot);   // inside placeLotsAndLandmarks

import { pointAlongPolyline, projectOnPolyline, rectangleRing } from './planGeometry.js';

/** Depth of the lots of the row, metres (Barrio Hierro's ordinary industrial lots are 42 deep). */
export const RAIL_YARD_ROW_DEPTH = 36;
const ROW_SETBACK = 1.5;
const ROW_GAP_TO_YARD = 3;
const ROW_LOT_WIDTH = 26;
const ROW_LOT_GAP = 1.5;
const MIN_YARD_WIDTH = 44;
const ROW_STYLES = ['warehouse', 'factory', 'warehouse'];

/**
 * Pulls every corner train yard back from its side street and lines that street with lots.
 * @param {{graph: {segments: Object[]}, lots: Object[], cover: Object}} state The lot placement state.
 * @param {(state: Object, segment: Object, side: string, along: number, width: number, depth: number, options: Object) => ?Object} placeLot
 *   lotPlacement's tryPlaceLot.
 * @returns {Object[]} The new lots.
 */
export function lineRailYardSideStreets(state, placeLot) {
  const { graph, lots } = state;
  const added = [];
  for (const yard of lots.slice()) {
    if (yard.landmarkKind !== 'train_yard' || yard.frontages.length < 2) continue;
    const side = yard.frontages[1];
    const segment = graph.segments[side.segment];
    const midX = (side.ax + side.bx) / 2;
    const midZ = (side.az + side.bz) / 2;
    // Unit direction from the yard's centre to the side edge (across the yard's width).
    let sx = midX - yard.x;
    let sz = midZ - yard.z;
    const half = Math.hypot(sx, sz) || 1;
    sx /= half;
    sz /= half;
    const hit = projectOnPolyline(segment.points, midX, midZ);
    const at = pointAlongPolyline(segment.points, hit.along);
    const tangent = Math.hypot(at.dx, at.dz) || 1;
    const towardYard = (-at.dz / tangent) * (yard.x - at.x) + (at.dx / tangent) * (yard.z - at.z) > 0 ? 'right' : 'left';
    const corridor = towardYard === 'right' ? segment.corridorRight : segment.corridorLeft;
    // Distance from the street's centre line to the edge now, and where the edge goes.
    const edgeNow = Math.abs((midX - at.x) * sx + (midZ - at.z) * sz);
    const edgeNew = corridor + ROW_SETBACK + RAIL_YARD_ROW_DEPTH + ROW_GAP_TO_YARD;
    const cut = edgeNew - edgeNow;
    if (cut <= 0 || yard.width - cut < MIN_YARD_WIDTH) continue;
    // The row's stretch of the street: the old side edge, inside the segment's untrimmed length.
    const alongA = projectOnPolyline(segment.points, side.ax, side.az).along;
    const alongB = projectOnPolyline(segment.points, side.bx, side.bz).along;
    const low = Math.max(Math.min(alongA, alongB), segment.trimA + 2);
    const high = Math.min(Math.max(alongA, alongB), segment.length - segment.trimB - 2);
    if (high - low < ROW_LOT_WIDTH) continue;

    shrinkLot(state, yard, cut, sx, sz);
    const count = Math.max(1, Math.round((high - low + ROW_LOT_GAP) / (ROW_LOT_WIDTH + ROW_LOT_GAP)));
    const width = (high - low + ROW_LOT_GAP) / count - ROW_LOT_GAP;
    for (let index = 0; index < count; index += 1) {
      const along = low + index * (width + ROW_LOT_GAP) + width / 2;
      const options = {
        zone: 'industrial', zoning: 'industrial', floors: index % 2 ? [2, 3] : [1, 2], style: ROW_STYLES[index % ROW_STYLES.length],
        setback: ROW_SETBACK, corner: index === 0 || index === count - 1, district: segment.district,
      };
      const lot = placeLot(state, segment, towardYard, along, width, RAIL_YARD_ROW_DEPTH, options)
        ?? placeLot(state, segment, towardYard, along, width, RAIL_YARD_ROW_DEPTH * 0.75, options);
      if (lot) added.push(lot);
    }
  }
  return added;
}

// Cuts `cut` metres off the side of the lot towards (sx, sz): new ring, centre, width and main
// frontage; the side frontage goes (the row now faces that street) and the ground cover follows.
function shrinkLot(state, lot, cut, sx, sz) {
  const { cover } = state;
  const code = lot.id + 3;
  const old = lot.ring;
  lot.x -= (sx * cut) / 2;
  lot.z -= (sz * cut) / 2;
  lot.width -= cut;
  lot.area = lot.width * lot.depth;
  lot.ring = rectangleRing(lot.x, lot.z, lot.frontX, lot.frontZ, lot.width / 2, lot.depth / 2);
  const main = lot.frontages[0];
  lot.frontages = [{ segment: main.segment, ax: lot.ring[0], az: lot.ring[1], bx: lot.ring[2], bz: lot.ring[3] }];
  lot.corner = false;
  const segment = state.graph.segments[main.segment];
  const frontX = (lot.ring[0] + lot.ring[2]) / 2;
  const frontZ = (lot.ring[1] + lot.ring[3]) / 2;
  const hit = projectOnPolyline(segment.points, frontX, frontZ);
  const away = Math.hypot(frontX - hit.x, frontZ - hit.z) || 1;
  const corridor = Math.max(segment.corridorLeft, segment.corridorRight);
  lot.entrance = { x: hit.x + ((frontX - hit.x) / away) * corridor, z: hit.z + ((frontZ - hit.z) / away) * corridor };
  // Ground cover: clear the old rectangle's cells, then stamp the new one.
  let lowX = Infinity;
  let lowZ = Infinity;
  let highX = -Infinity;
  let highZ = -Infinity;
  for (let i = 0; i < 8; i += 2) {
    lowX = Math.min(lowX, old[i]);
    highX = Math.max(highX, old[i]);
    lowZ = Math.min(lowZ, old[i + 1]);
    highZ = Math.max(highZ, old[i + 1]);
  }
  const c0 = Math.max(0, Math.floor((lowX - 2 - cover.minX) / cover.cellSize));
  const c1 = Math.min(cover.columns - 1, Math.floor((highX + 2 - cover.minX) / cover.cellSize));
  const r0 = Math.max(0, Math.floor((lowZ - 2 - cover.minZ) / cover.cellSize));
  const r1 = Math.min(cover.rows - 1, Math.floor((highZ + 2 - cover.minZ) / cover.cellSize));
  for (let r = r0; r <= r1; r += 1) {
    for (let c = c0; c <= c1; c += 1) if (cover.cells[r * cover.columns + c] === code) cover.cells[r * cover.columns + c] = 0;
  }
  const rightX = -lot.frontZ;
  const rightZ = lot.frontX;
  const halfWidth = lot.width / 2;
  const halfDepth = lot.depth / 2;
  for (let u = -halfWidth + 0.5; u <= halfWidth - 0.5; u += 1.4) {
    for (let v = -halfDepth + 0.5; v <= halfDepth - 0.5; v += 1.4) {
      const c = Math.floor((lot.x + rightX * u + lot.frontX * v - cover.minX) / cover.cellSize);
      const r = Math.floor((lot.z + rightZ * u + lot.frontZ * v - cover.minZ) / cover.cellSize);
      if (c >= 0 && r >= 0 && c < cover.columns && r < cover.rows) cover.cells[r * cover.columns + c] = code;
    }
  }
}

// Road paint as a decal layer: lane lines, dashes, double yellow lines, stop bars, zebra
// crossings and lane arrows, each painted with wear (flaked and chipped paint, cracks of the road
// showing through, grime) into maps whose colour alpha is the paint coverage. The road builder
// lays a strip or quad a hair above the asphalt and uses the catalogue's `marking...` surfaces:
// u runs along the line (the tile repeats along u), v across it.
//
//   surfaces.getMaterial('markingDashedLine', { wear: 0.5 })   // tile 9 m x 0.3 m: 3 m dash, 6 m gap
//   surfaces.getMaterial('markingCrosswalk', { depth: 3.5 })   // tile 1 m x 3.5 m: one stripe and gap
//
// Paint is a thermoplastic film about 2 mm thick, off-white or traffic yellow (never pure white:
// albedo about 0.6), a little smoother than the asphalt around it.

import { parseColor } from '../colorMath.js';
import { drawCrack } from '../fields/patternFields.js';

/**
 * Paints one tile of a road marking.
 * @param {ReturnType<import('./surfacePainter.js').createSurfacePainter>} p The painter; its
 *   tile is [length along the line, width across it] in metres (see ROAD_MARKING_TILES).
 * @param {Object} [options]
 * @param {'solidLine' | 'dashedLine' | 'doubleLine' | 'stopBar' | 'crosswalk' | 'arrow'} [options.kind]
 * @param {number} [options.wear] 0 fresh paint .. 1 mostly worn away (default 0.35).
 * @param {number | string} [options.color] Paint colour (default ROAD_PAINT_COLORS.white).
 * @param {number} [options.lineWidth] Width of a line in metres (default 0.15; 0.12 for double lines).
 * @param {number} [options.dash] Dash length in metres (default 3).
 * @param {number} [options.gap] Gap between dashes in metres (default 6).
 * @param {number} [options.stripe] Zebra stripe width in metres (default 0.5; the gap is equal).
 * @param {number} [options.depth] Crossing depth in metres (default 3).
 * @param {'straight' | 'left' | 'right'} [options.turn] The arrow's direction (default straight;
 *   the arrow points along +v).
 * @returns {Generator<void, import('./surfacePainter.js').SurfaceMaps, void>}
 */
export function* paintRoadMarking(p, options = {}) {
  const kind = options.kind ?? 'solidLine';
  const wear = clamp01(options.wear ?? 0.35);
  const size = p.size;
  const count = size * size;
  const width = p.tileMetres;
  const depth = p.tileMetresY;
  const du = width / size;
  const dv = depth / size;
  // Edges are a little soft: at least 3 mm, at least a texel.
  const softU = Math.max(du * 1.2, 0.003);
  const softV = Math.max(dv * 1.2, 0.003);
  const coverage = markingCoverage(kind, width, depth, options);
  const alpha = p.alphaField();
  for (let y = 0, i = 0; y < size; y += 1) {
    const v = (y + 0.5) * dv;
    for (let x = 0; x < size; x += 1, i += 1) alpha[i] = coverage((x + 0.5) * du, v, softU, softV);
  }
  yield;

  // Wear: big flaked areas and small chips, both from tiling noise in real units.
  const cellsU = (metres) => Math.max(2, Math.min(size >> 2, Math.round(width / metres)));
  const cellsV = (metres) => Math.max(2, Math.min(size >> 2, Math.round(depth / metres)));
  const flakes = p.fractal(cellsU(0.35), 4, { periodY: cellsV(0.35) });
  const chips = p.fractal(cellsU(0.05), 3, { periodY: cellsV(0.05), label: 2 });
  const grime = p.fractal(cellsU(0.8), 4, { periodY: cellsV(0.8), label: 3 });
  const cracks = p.field();
  const crackCount = Math.round(1 + wear * 4);
  for (let n = 0; n < crackCount; n += 1) drawCrack(cracks, size, p.random, { length: size * 0.7, halfWidth: 0.7, wander: 0.45 });
  yield;

  const [paintR, paintG, paintB] = parseColor(options.color ?? ROAD_PAINT_COLORS.white);
  const threshold = -1.2 + 1.3 * wear ** 0.4;
  const dirtAmount = 0.12 + 0.3 * wear;
  const { r, g, b, height, roughness } = p;
  for (let i = 0; i < count; i += 1) {
    const noise = flakes[i] * 0.7 + chips[i] * 0.5;
    let kept = (noise - threshold) / 0.16 + 0.5;
    kept = kept < 0 ? 0 : kept > 1 ? 1 : kept;
    kept = kept * kept * (3 - 2 * kept);
    const crack = cracks[i] > 1 ? 1 : cracks[i];
    const cover = alpha[i] * kept * (1 - 0.92 * crack);
    alpha[i] = cover;
    // The colour is the paint everywhere (so mipmaps never bleed a dark fringe), dirtier where
    // the film is thin and where grime has settled.
    const dirt = dirtAmount * (0.5 + 0.5 * grime[i]) + 0.2 * (1 - kept);
    const shade = 1 - (dirt > 0.6 ? 0.6 : dirt < 0 ? 0 : dirt);
    r[i] = paintR * shade;
    g[i] = paintG * shade * 0.985;
    b[i] = paintB * shade * 0.95;
    height[i] = 0.002 * cover + 0.00015 * chips[i];
    roughness[i] = 0.58 + 0.22 * wear + 0.1 * (1 - kept) + 0.05 * chips[i];
  }
  p.release(cracks);
  yield;
  return yield* p.finish({ occlusionDepth: 0, normalStrength: 0.6, ceiling: 0.8 });
}

/** Linear-light paint colours as sRGB hex: an off-white and a traffic yellow, both below 0.7 albedo. */
export const ROAD_PAINT_COLORS = Object.freeze({ white: 0xd6d3c9, yellow: 0xd8a41c, blue: 0x2f62a8, red: 0xa8372c });

/**
 * The tile each marking kind is designed for, [metres along u, metres along v], from its options.
 * @type {Readonly<Record<string, (options: Object) => [number, number]>>}
 */
export const ROAD_MARKING_TILES = Object.freeze({
  solidLine: () => [4, 0.3],
  dashedLine: (options) => [(options.dash ?? 3) + (options.gap ?? 6), 0.3],
  doubleLine: () => [4, 0.5],
  stopBar: () => [4, 0.6],
  crosswalk: (options) => [2 * (options.stripe ?? 0.5), options.depth ?? 3],
  arrow: () => [1.6, 4],
});

/**
 * The coverage function of a marking kind: (u, v, softU, softV) in metres -> 0..1.
 * @returns {(u: number, v: number, softU: number, softV: number) => number}
 */
function markingCoverage(kind, width, depth, options) {
  const middle = depth / 2;
  if (kind === 'dashedLine') {
    const line = (options.lineWidth ?? 0.15) / 2;
    const dash = options.dash ?? 3;
    const start = (width - dash) / 2;
    return (u, v, softU, softV) => box(v, middle - line, middle + line, softV) * box(u, start, start + dash, softU);
  }
  if (kind === 'doubleLine') {
    const line = options.lineWidth ?? 0.12;
    return (u, v, softU, softV) => box(v, middle - 1.5 * line, middle - 0.5 * line, softV) + box(v, middle + 0.5 * line, middle + 1.5 * line, softV);
  }
  if (kind === 'stopBar') return (u, v, softU, softV) => box(v, 0.05, depth - 0.05, softV);
  if (kind === 'crosswalk') {
    return (u, v, softU, softV) => box(u, width * 0.25, width * 0.75, softU) * box(v, 0.05, depth - 0.05, softV);
  }
  if (kind === 'arrow') {
    const centre = width / 2;
    const turn = options.turn === 'left' ? -1 : options.turn === 'right' ? 1 : 0;
    if (turn === 0) {
      return (u, v, softU, softV) => {
        const shaft = box(u, centre - 0.1, centre + 0.1, softU) * box(v, 0.3, 2.5, softV);
        const half = 0.45 * (3.7 - v) / 1.3;
        const head = v > 2.4 && half > 0 ? box(u, centre - half, centre + half, softU) * box(v, 2.4, 3.7, softV) : 0;
        return shaft > head ? shaft : head;
      };
    }
    return (u, v, softU, softV) => {
      const side = (u - centre) * turn;
      const shaft = box(u, centre - 0.1, centre + 0.1, softU) * box(v, 0.3, 2.6, softV);
      const bar = box(side, -0.1, 0.32, softU) * box(v, 2.4, 2.6, softV);
      const along = (side - 0.3) / 0.42;
      const half = 0.48 * (1 - along);
      const head = along >= 0 && half > 0 ? box(v, 2.5 - half, 2.5 + half, softV) * box(side, 0.3, 0.72, softU) : 0;
      return Math.max(shaft, bar, head);
    };
  }
  const line = (options.lineWidth ?? 0.15) / 2;
  return (u, v, softU, softV) => box(v, middle - line, middle + line, softV);
}

/** A soft-edged box function: 1 between low and high, falling to 0 over `soft` at each edge. */
function box(x, low, high, soft) {
  const rise = (x - low) / soft + 0.5;
  const fall = (high - x) / soft + 0.5;
  const t = rise < fall ? rise : fall;
  return t <= 0 ? 0 : t >= 1 ? 1 : t;
}

function clamp01(value) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

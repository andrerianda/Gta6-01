// Timber surfaces: weathered planks for docks, piers, boardwalks and decking. Boards run along
// u with staggered end joints, open gaps, sun-bleached grey fibres over remnants of brown,
// raised grain, knots, checks (drying cracks) and nail heads with rust weeping from them.
// Tile 2.4 m with sixteen 15 cm boards.
//
//   generateSurfaceMaps('dockPlanks', { weathering: 0.8 })

import { hashGridCell } from '../../../core/random/coordinateHash.js';
import { parseColor } from '../colorMath.js';
import { cellRandomField, createTilePattern, stampShape, stampStroke } from '../fields/patternFields.js';
import { fillWhiteNoise } from '../noise/whiteNoise.js';

const clamp01 = (value) => (value < 0 ? 0 : value > 1 ? 1 : value);

/**
 * Paints a deck of weathered planks.
 * @param {ReturnType<import('./surfacePainter.js').createSurfacePainter>} p
 * @param {Object} [options]
 * @param {number} [options.boards] Boards across the tile (default 16).
 * @param {number} [options.weathering] 0 freshly oiled brown to 1 silver-grey and cracked (default 0.75).
 * @param {number | string} [options.color] sRGB colour of the unweathered wood.
 * @param {number} [options.gapMetres] Width of the gap between boards (default 7 mm).
 */
export function* paintPlanks(p, options = {}) {
  const size = p.size;
  const count = size * size;
  const tpm = p.texelsPerMetre;
  const random = p.random;
  const boards = options.boards ?? 16;
  const weathering = clamp01(options.weathering ?? 0.75);
  const fresh = parseColor(options.color ?? 0x8a5a36);
  const grey = parseColor(0xa39c90);

  const layout = createTilePattern(size, {
    columns: 1,
    rows: boards,
    randomStagger: true,
    seed: p.seed,
    jointTexels: Math.max(1.6, (options.gapMetres ?? 0.007) * tpm),
    bevelTexels: Math.max(1.5, 0.006 * tpm),
  });
  const boardTone = cellRandomField(layout.cell, layout.cellCount, p.seed, p.field());
  // Grain: noise stretched along the boards; every board reads it at its own offset.
  const grain = p.fractal(2, 3, { label: 1, periodY: Math.min(size / 4, 96) });
  const fibre = p.fractal(4, 2, { label: 2, periodY: Math.min(size / 2, 200) });
  const macro = p.fractal(3, 4, { label: 3 });
  const speck = fillWhiteNoise(p.field(), p.seed);
  yield;

  const { r, g, b, height, roughness } = p;
  const boardHeight = size / boards;
  for (let y = 0; y < size; y += 1) {
    const board = Math.min(boards - 1, Math.floor((y + 0.5) / boardHeight));
    const shift = Math.floor(((board * 0.6180339) % 1) * size);
    const across = ((y + 0.5) / boardHeight - board) * 2 - 1;
    // Boards cup as they dry: the edges curl up a little.
    const cup = across * across * 0.0012;
    for (let x = 0; x < size; x += 1) {
      const i = y * size + x;
      const face = layout.profile[i];
      const source = y * size + ((x + shift) % size);
      const lines = grain[source];
      const fine = fibre[source];
      const tone = boardTone[i];
      const bleach = clamp01(weathering * (0.75 + 0.5 * tone) + macro[i] * 0.25);
      const dark = 1 + lines * 0.35 + fine * 0.18;
      const shade = dark * (0.82 + 0.36 * tone) * (0.94 + 0.12 * speck[i]);
      const cr = (fresh[0] + (grey[0] - fresh[0]) * bleach) * shade;
      const cg = (fresh[1] + (grey[1] - fresh[1]) * bleach) * shade;
      const cb = (fresh[2] + (grey[2] - fresh[2]) * bleach) * shade;
      r[i] = 0.012 + (cr - 0.012) * face;
      g[i] = 0.01 + (cg - 0.01) * face;
      b[i] = 0.008 + (cb - 0.008) * face;
      height[i] = face * (0.02 + cup + (tone - 0.5) * 0.003) + (lines * 0.0009 + fine * 0.0005) * (0.4 + 0.6 * weathering) * face;
      roughness[i] = 0.72 + 0.16 * bleach + (1 - face) * 0.1;
    }
  }
  p.release(boardTone, speck);
  yield;

  // Knots, drying checks and nail heads.
  const marks = p.field();
  const checks = p.field();
  const nails = p.field();
  for (let board = 0; board < boards; board += 1) {
    const centre = (board + 0.5) * boardHeight;
    if (random.chance(0.45)) {
      stampShape(marks, size, { x: random.range(0, size), y: centre + random.range(-0.25, 0.25) * boardHeight, halfWidth: random.range(0.012, 0.025) * tpm, halfHeight: random.range(0.008, 0.016) * tpm, soft: 0.01 * tpm });
    }
    const checkCount = Math.round(weathering * random.range(0.5, 3));
    for (let k = 0; k < checkCount; k += 1) {
      const x = random.range(0, size);
      const y = centre + random.range(-0.35, 0.35) * boardHeight;
      const length = random.range(0.08, 0.45) * tpm;
      stampStroke(checks, size, x, y, x + length, y + random.range(-1.5, 1.5), 0.5, 1, 0.7, 'max');
    }
    // Two nails at each end of the board, which lies where the random stagger put it.
    const end = (1 - hashGridCell(board, 17, p.seed) / 4294967296) * size;
    for (const side of [-0.28, 0.28]) {
      for (const along of [-0.03, 0.03]) {
        stampShape(nails, size, { x: end + along * tpm, y: centre + side * boardHeight, halfWidth: Math.max(1.2, 0.004 * tpm), soft: 1 });
      }
    }
  }
  for (let i = 0; i < count; i += 1) {
    const knot = marks[i];
    const check = checks[i] > 1 ? 1 : checks[i];
    const nail = nails[i];
    if (knot <= 0 && check <= 0 && nail <= 0) continue;
    const face = layout.profile[i];
    const dark = (1 - 0.6 * knot * face) * (1 - 0.7 * check * face);
    r[i] *= dark;
    g[i] *= dark;
    b[i] *= dark;
    height[i] -= (0.002 * check + 0.0006 * knot) * face;
    if (nail > 0) {
      r[i] += (0.12 - r[i]) * nail;
      g[i] += (0.07 - g[i]) * nail;
      b[i] += (0.045 - b[i]) * nail;
      height[i] -= 0.0012 * nail;
      roughness[i] += (0.6 - roughness[i]) * nail;
    }
  }
  p.release(marks, checks, nails);
  yield;
  return yield* p.finish({
    normalStrength: 1.1,
    occlusionRadius: 3,
    occlusionDepth: 0.008,
    occlusionStrength: 0.8,
    cavityShade: 0.4,
    meanLuminance: 0.13 + 0.15 * weathering,
  });
}

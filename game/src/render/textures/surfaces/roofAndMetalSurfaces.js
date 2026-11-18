// Roofs and sheet metal, the surfaces a skyline view and the port are made of: terracotta
// barrel tiles, a flat roof of bitumen membrane, and corrugated sheet metal, painted or
// galvanised, with rust creeping from its fasteners and edges.
//
//   generateSurfaceMaps('roofTiles')                         // tile 2 m, courses run down v
//   getSurfaceMaterial('corrugatedMetal', { tint: 0x8fb2c9, rust: 0.6 })

import { parseColor } from '../colorMath.js';
import { cellRandomField, createTilePattern, scatterBlots, stampShape } from '../fields/patternFields.js';
import { fillWhiteNoise } from '../noise/whiteNoise.js';

const clamp01 = (value) => (value < 0 ? 0 : value > 1 ? 1 : value);

/**
 * Paints terracotta barrel tiles: half-round tiles in columns (along u) laid in overlapping
 * courses (along v, the eaves at v = 0). Tile 2 m.
 * @param {ReturnType<import('./surfacePainter.js').createSurfacePainter>} p
 * @param {Object} [options]
 * @param {number} [options.columns] Tiles across (default 8, 25 cm each).
 * @param {number} [options.rows] Courses (default 5, 40 cm each).
 * @param {Array<number | string>} [options.colors] sRGB tile colours.
 * @param {number} [options.weathering] 0..1 dark staining and lichen (default 0.5).
 */
export function* paintRoofTiles(p, options = {}) {
  const size = p.size;
  const count = size * size;
  const tpm = p.texelsPerMetre;
  const random = p.random;
  const columns = options.columns ?? 8;
  const rows = options.rows ?? 5;
  const colors = (options.colors ?? [0xb5623c, 0xa85736, 0xc27148, 0x9a4c30, 0xb86a45]).map(parseColor);
  const weathering = clamp01(options.weathering ?? 0.5);
  const layout = createTilePattern(size, { columns, rows, jointTexels: 0, bevelTexels: 1 });
  const tone = cellRandomField(layout.cell, layout.cellCount, p.seed, p.field());
  const macro = p.fractal(2, 5);
  const meso = p.fractal(14, 4, { label: 1 });
  const grain = fillWhiteNoise(p.field(), p.seed);
  yield;

  const { r, g, b, height, roughness } = p;
  const colorCount = colors.length;
  const columnTexels = size / columns;
  const rowTexels = size / rows;
  for (let y = 0; y < size; y += 1) {
    const course = Math.min(rows - 1, Math.floor((y + 0.5) / rowTexels));
    const fv = (y + 0.5) / rowTexels - course;
    for (let x = 0; x < size; x += 1) {
      const i = y * size + x;
      const fu = (x + 0.5) / columnTexels - Math.floor((x + 0.5) / columnTexels);
      // The barrel: a half round across the tile, with a narrow valley between tiles.
      const barrel = Math.sin(Math.PI * fu);
      const t = tone[i];
      const color = colors[Math.min(colorCount - 1, Math.floor(((t * 9.7) % 1) * colorCount))];
      // Each course lies on the one below: it rises toward its lower end and casts a shadow
      // line on the next.
      const lap = fv < 0.06 ? fv / 0.06 : 1;
      const shade = (0.82 + 0.36 * t) * (1 + macro[i] * 0.1 + meso[i] * 0.1) * (0.92 + 0.16 * grain[i]) * (0.55 + 0.45 * Math.sqrt(barrel)) * (0.6 + 0.4 * lap);
      r[i] = color[0] * shade;
      g[i] = color[1] * shade;
      b[i] = color[2] * shade;
      height[i] = Math.sqrt(barrel) * 0.045 + (1 - fv) * 0.022 + (t - 0.5) * 0.004 + meso[i] * 0.0008;
      roughness[i] = 0.82 + meso[i] * 0.06;
    }
  }
  p.release(tone, grain);
  yield;

  if (weathering > 0) {
    const stain = p.field();
    scatterBlots(stain, size, random, { count: Math.round(weathering * 14), minRadius: 0.06 * tpm, maxRadius: 0.3 * tpm, soft: 1, stretch: 2.5, value: 0.8 });
    const speckle = p.fractal(30, 3, { label: 5 });
    for (let i = 0; i < count; i += 1) {
      const m = clamp01(stain[i] * (0.5 + speckle[i] * 1.5));
      if (m <= 0) continue;
      const dark = 1 - 0.5 * m;
      r[i] *= dark;
      g[i] *= dark * 1.03;
      b[i] *= dark;
    }
    p.release(stain);
  }
  return yield* p.finish({ normalStrength: 1, occlusionRadius: 4, occlusionDepth: 0.03, occlusionStrength: 0.75, cavityShade: 0.35, meanLuminance: 0.17 });
}

/**
 * Paints a flat roof: sheets of mineral-surfaced bitumen membrane with lapped seams, patches,
 * ponding stains and scattered grit. Tile 4 m. Neutral light grey: tint it for other membranes.
 * @param {ReturnType<import('./surfacePainter.js').createSurfacePainter>} p
 * @param {Object} [options]
 * @param {number} [options.sheets] Membrane sheets across the tile (default 4, 1 m wide).
 * @param {number} [options.weathering] 0..1 stains and ponding rings (default 0.6).
 * @param {number} [options.luminance] Mean albedo (default 0.3).
 */
export function* paintFlatRoof(p, options = {}) {
  const size = p.size;
  const count = size * size;
  const tpm = p.texelsPerMetre;
  const random = p.random;
  const sheets = options.sheets ?? 4;
  const weathering = clamp01(options.weathering ?? 0.6);
  const layout = createTilePattern(size, { columns: 1, rows: sheets, randomStagger: true, seed: p.seed, jointTexels: Math.max(1.5, 0.012 * tpm), bevelTexels: Math.max(2, 0.03 * tpm) });
  const tone = cellRandomField(layout.cell, layout.cellCount, p.seed, p.field());
  const macro = p.fractal(2, 6);
  const meso = p.fractal(10, 4, { label: 1 });
  const grain = fillWhiteNoise(p.field(), p.seed);
  const stones = p.cells(Math.min(250, Math.floor(size / 4)), { label: 2 });
  yield;

  const { r, g, b, height, roughness } = p;
  for (let i = 0; i < count; i += 1) {
    const face = layout.profile[i];
    const granule = clamp01((stones.second[i] - stones.nearest[i]) * 3);
    const shade = (0.93 + 0.14 * tone[i]) * (1 + macro[i] * 0.14 + meso[i] * 0.08) * (0.86 + 0.28 * grain[i]) * (0.6 + 0.4 * face);
    r[i] = 0.34 * shade;
    g[i] = 0.335 * shade;
    b[i] = 0.32 * shade;
    height[i] = face * 0.004 + granule * 0.0012 + macro[i] * 0.004 + grain[i] * 0.0004;
    roughness[i] = 0.9 - 0.25 * (1 - face);
  }
  p.release(tone, grain);
  yield;

  if (weathering > 0) {
    // Ponding: rings left where rain water stood and dried.
    const pond = p.field();
    const rings = p.field();
    for (let k = 0; k < Math.round(weathering * 6); k += 1) {
      const shape = { x: random.range(0, size), y: random.range(0, size), halfWidth: random.range(0.25, 0.8) * tpm, halfHeight: random.range(0.2, 0.5) * tpm, angle: random.angle(), soft: 0.06 * tpm };
      stampShape(pond, size, shape);
      stampShape(rings, size, { ...shape, halfWidth: shape.halfWidth + 0.03 * tpm, halfHeight: shape.halfHeight + 0.03 * tpm });
    }
    for (let i = 0; i < count; i += 1) {
      const inside = pond[i];
      const ring = Math.max(0, rings[i] - inside);
      if (inside <= 0 && ring <= 0) continue;
      const dark = (1 - 0.22 * inside) * (1 - 0.3 * ring);
      r[i] *= dark;
      g[i] *= dark;
      b[i] *= dark * 0.97;
      roughness[i] -= 0.08 * inside;
    }
    p.release(pond, rings);
  }
  return yield* p.finish({ normalStrength: 1.1, occlusionRadius: 4, occlusionDepth: 0.004, occlusionStrength: 0.6, cavityShade: 0.25, meanLuminance: options.luminance ?? 0.3 });
}

/**
 * Paints corrugated sheet metal: sinusoidal ribs running along v, sheet laps, rows of
 * fasteners, and rust that starts at the fasteners and the lower edges and runs down.
 * Tile 2.28 m (30 ribs of 76 mm). Painted sheets are neutral light grey: tint them.
 * @param {ReturnType<import('./surfacePainter.js').createSurfacePainter>} p
 * @param {Object} [options]
 * @param {'painted' | 'galvanised'} [options.finish] Default painted.
 * @param {number} [options.ribs] Ribs across the tile (default 30).
 * @param {number} [options.rust] 0..1 (default 0.4).
 */
export function* paintCorrugatedMetal(p, options = {}) {
  const size = p.size;
  const count = size * size;
  const tpm = p.texelsPerMetre;
  const random = p.random;
  const ribs = options.ribs ?? 30;
  const galvanised = options.finish === 'galvanised';
  const rustAmount = clamp01(options.rust ?? 0.4);
  const macro = p.fractal(2, 5);
  const meso = p.fractal(12, 4, { label: 1 });
  const runs = p.fractal(Math.min(size / 8, 48), 3, { label: 3, periodY: 2 });
  const grain = fillWhiteNoise(p.field(), p.seed);
  const spangle = p.cells(Math.min(200, Math.floor(size / 6)), { label: 2 });
  const spangleTone = cellRandomField(spangle.cell, spangle.period * spangle.period, p.seed, p.field());

  // Rust seeds: fastener rows every 0.76 m and the sheet lap at the bottom of the tile.
  const rust = p.field();
  const fastenerRows = 3;
  const fasteners = p.field();
  for (let row = 0; row < fastenerRows; row += 1) {
    const y = ((row + 0.5) / fastenerRows) * size;
    for (let rib = 0; rib < ribs; rib += 3) {
      const x = ((rib + 0.5) / ribs) * size;
      stampShape(fasteners, size, { x, y, halfWidth: Math.max(1.3, 0.006 * tpm), soft: 1 });
      if (random.chance(rustAmount)) {
        // The run of rust hangs below the fastener (toward v = 0).
        stampShape(rust, size, { x, y: y - 0.06 * tpm, halfWidth: random.range(0.012, 0.03) * tpm, halfHeight: random.range(0.04, 0.16) * tpm, soft: 0.02 * tpm, value: random.range(0.5, 1) });
      }
    }
  }
  scatterBlots(rust, size, random, { count: Math.round(rustAmount * 10), minRadius: 0.05 * tpm, maxRadius: 0.25 * tpm, soft: 1, stretch: 3, value: 0.8 });
  yield;

  const { r, g, b, height, roughness } = p;
  const metalness = p.metalnessField();
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = y * size + x;
      const wave = Math.sin(((x + 0.5) / size) * ribs * Math.PI * 2);
      const m = clamp01(rust[i] * (0.55 + meso[i] * 1.2 + runs[i] * 0.8) * (0.6 + rustAmount));
      const fastener = fasteners[i];
      let cr;
      let cg;
      let cb;
      let rough;
      let metal;
      if (galvanised) {
        const flake = 0.82 + 0.3 * spangleTone[i];
        cr = 0.62 * flake;
        cg = 0.63 * flake;
        cb = 0.64 * flake;
        rough = 0.36 + 0.12 * spangleTone[i];
        metal = 1;
      } else {
        const shade = (1 + macro[i] * 0.07) * (0.97 + 0.06 * grain[i]) * (1 - 0.1 * Math.max(0, runs[i]));
        cr = 0.7 * shade;
        cg = 0.7 * shade;
        cb = 0.7 * shade;
        rough = 0.5 + meso[i] * 0.06;
        metal = 0;
      }
      // Rust: orange at the fringe, dark brown at the core, always rough and non-metallic.
      const core = m * m;
      r[i] = cr + (0.3 - 0.17 * core - cr) * m;
      g[i] = cg + (0.12 - 0.07 * core - cg) * m;
      b[i] = cb + (0.045 - 0.02 * core - cb) * m;
      roughness[i] = rough + (0.92 - rough) * m;
      metalness[i] = metal * (1 - m);
      height[i] = wave * 0.009 + fastener * 0.003 + m * grain[i] * 0.0008;
      if (fastener > 0) {
        r[i] += (0.35 - r[i]) * fastener * 0.6;
        g[i] += (0.34 - g[i]) * fastener * 0.6;
        b[i] += (0.33 - b[i]) * fastener * 0.6;
      }
    }
  }
  p.release(rust, fasteners, grain, spangleTone);
  yield;
  return yield* p.finish({ normalStrength: 1, occlusionRadius: 3, occlusionDepth: 0.012, occlusionStrength: 0.5, cavityShade: 0.2, ceiling: 0.88 });
}

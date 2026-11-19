// Tiling wall surfaces for facades that are not baked: painted stucco, board-marked concrete
// and brick. Stucco and concrete are painted in a light neutral tone so that one texture set
// serves every colour: the material's own colour tints it (see surfaceMaterials.js), which
// keeps the memory of a pastel city small. All of them carry what a wall collects over the
// years: sun-faded mottling, rain streaks, hairline cracks and repainted patches.
//
//   getSurfaceMaterial('stucco', { tint: 0xf2b8a0 })       // any pastel, same maps
//   generateSurfaceMaps('brick', { color: 0x9b4a35 })

import { parseColor } from '../colorMath.js';
import { blurField } from '../fields/fieldFilters.js';
import { cellRandomField, createTilePattern, drawCrack, scatterBlots, stampShape } from '../fields/patternFields.js';
import { fillWhiteNoise } from '../noise/whiteNoise.js';

const clamp01 = (value) => (value < 0 ? 0 : value > 1 ? 1 : value);

/**
 * Paints stucco (render): a sand-finished or trowelled coat of plaster under paint.
 * Tile 4 m. Neutral: tint it with the material colour.
 * @param {ReturnType<import('./surfacePainter.js').createSurfacePainter>} p
 * @param {Object} [options]
 * @param {number} [options.trowel] 0 fine sand finish to 1 heavy trowelled texture (default 0.5).
 * @param {number} [options.weathering] 0 freshly painted to 1 streaked, faded and cracked (default 0.5).
 * @param {number} [options.patches] 0..1 repainted and repaired patches (default 0.4).
 * @param {number} [options.luminance] Mean albedo of the neutral map (default 0.7).
 */
export function* paintStucco(p, options = {}) {
  const size = p.size;
  const count = size * size;
  const tpm = p.texelsPerMetre;
  const random = p.random;
  const trowel = clamp01(options.trowel ?? 0.5);
  const weathering = clamp01(options.weathering ?? 0.5);

  const macro = p.fractal(2, 5);
  const sweeps = p.fractal(9, 4, { label: 1, shape: 'billow' });
  const fine = p.fractal(56, 3, { label: 2 });
  // Rain streaks: noise stretched down the wall (v is up).
  const streaks = p.fractal(Math.min(size / 8, 40), 3, { label: 3, periodY: 2 });
  const grain = fillWhiteNoise(p.field(), p.seed);
  blurField(grain, 1, 1);
  yield;

  const { r, g, b, height, roughness } = p;
  for (let i = 0; i < count; i += 1) {
    const streak = clamp01(streaks[i] * 1.6 + macro[i] * 0.5) * weathering;
    const shade = (1 + macro[i] * (0.05 + 0.07 * weathering)) * (0.965 + 0.07 * grain[i]) * (1 - 0.16 * streak) * (0.97 + 0.06 * sweeps[i]);
    r[i] = 0.72 * shade;
    g[i] = 0.72 * shade * (1 - 0.012 * streak);
    b[i] = 0.72 * shade * (1 - 0.045 * streak);
    height[i] = sweeps[i] * 0.0028 * (0.25 + 0.75 * trowel) + fine[i] * 0.0006 + grain[i] * 0.0011 + macro[i] * 0.002;
    roughness[i] = 0.9 + fine[i] * 0.04 - 0.05 * streak;
  }
  p.release(grain);
  yield;

  // Repainted patches: a slightly different tone, flatter, with a brushed edge.
  const patchCount = Math.round((options.patches ?? 0.4) * 4);
  if (patchCount > 0) {
    const patch = p.field();
    for (let k = 0; k < patchCount; k += 1) {
      stampShape(patch, size, {
        x: random.range(0, size),
        y: random.range(0, size),
        halfWidth: random.range(0.25, 0.8) * tpm,
        halfHeight: random.range(0.2, 0.6) * tpm,
        angle: random.range(-0.05, 0.05),
        kind: 'box',
        soft: 0.05 * tpm,
        value: random.range(0.5, 1),
      });
    }
    const ragged = p.fractal(20, 3, { label: 4 });
    for (let i = 0; i < count; i += 1) {
      let m = patch[i];
      if (m <= 0) continue;
      m = clamp01(m * 1.4 + ragged[i] * 0.5 - 0.15);
      const tone = 1 + 0.07 * m;
      r[i] *= tone;
      g[i] *= tone;
      b[i] *= tone * 1.01;
      height[i] += 0.0006 * m;
    }
    p.release(patch);
  }
  // Hairline cracks, mostly running up the wall, and a few dark blooms of mildew.
  const crackCount = Math.round(weathering * 5);
  if (crackCount > 0) {
    const crack = p.field();
    for (let k = 0; k < crackCount; k += 1) {
      drawCrack(crack, size, random, {
        angle: Math.PI / 2 + random.range(-0.5, 0.5),
        length: random.range(0.5, 2.2) * tpm,
        step: Math.max(3, 0.03 * tpm),
        wander: 0.35,
        halfWidth: 0.5,
        branching: 0.04,
      });
    }
    const bloom = p.field();
    scatterBlots(bloom, size, random, { count: Math.round(weathering * 5), minRadius: 0.08 * tpm, maxRadius: 0.3 * tpm, soft: 1, stretch: 2.2, value: 0.5 });
    const speckle = p.fractal(30, 3, { label: 5 });
    for (let i = 0; i < count; i += 1) {
      const c = crack[i] > 1 ? 1 : crack[i];
      const m = clamp01(bloom[i] * (0.5 + speckle[i] * 1.5));
      if (c <= 0 && m <= 0) continue;
      const dark = (1 - 0.45 * c) * (1 - 0.22 * m);
      r[i] *= dark;
      g[i] *= dark * (1 + 0.02 * m);
      b[i] *= dark;
      height[i] -= 0.0012 * c;
    }
    p.release(crack, bloom);
  }
  yield;
  return yield* p.finish({
    normalStrength: 1.2,
    occlusionRadius: 3,
    occlusionDepth: 0.003,
    occlusionStrength: 0.5,
    cavityShade: 0.18,
    meanLuminance: options.luminance ?? 0.7,
    ceiling: 0.88,
  });
}

/**
 * Paints cast concrete as a wall: formwork panels with their joints and tie holes, bug holes,
 * rain streaks and stains. Tile 4.8 m (panels 2.4 x 1.2 m). Neutral grey: tint it, or leave it.
 * @param {ReturnType<import('./surfacePainter.js').createSurfacePainter>} p
 * @param {Object} [options]
 * @param {number} [options.columns] Formwork panels across the tile (default 2).
 * @param {number} [options.rows] Panels up the tile (default 4).
 * @param {number} [options.weathering] 0..1 streaks and stains (default 0.6).
 * @param {number} [options.luminance] Mean albedo (default 0.36).
 */
export function* paintConcreteWall(p, options = {}) {
  const size = p.size;
  const count = size * size;
  const tpm = p.texelsPerMetre;
  const random = p.random;
  const columns = options.columns ?? 2;
  const rows = options.rows ?? 4;
  const weathering = clamp01(options.weathering ?? 0.6);

  const panels = createTilePattern(size, { columns, rows, jointTexels: Math.max(1.2, 0.006 * tpm), bevelTexels: Math.max(1.5, 0.01 * tpm) });
  const panelTone = cellRandomField(panels.cell, panels.cellCount, p.seed, p.field());
  const macro = p.fractal(2, 6);
  const meso = p.fractal(8, 4, { label: 1 });
  const fine = p.fractal(48, 3, { label: 2 });
  const streaks = p.fractal(Math.min(size / 8, 36), 3, { label: 3, periodY: 2 });
  const grain = fillWhiteNoise(p.field(), p.seed);
  yield;

  const { r, g, b, height, roughness } = p;
  for (let i = 0; i < count; i += 1) {
    const face = panels.profile[i];
    const streak = clamp01(streaks[i] * 1.5 + macro[i] * 0.6) * weathering;
    const shade =
      (0.93 + 0.14 * panelTone[i]) * (1 + macro[i] * 0.12 + meso[i] * 0.08) * (0.95 + 0.1 * grain[i]) * (1 - 0.22 * streak) * (0.8 + 0.2 * face);
    r[i] = 0.42 * shade;
    g[i] = 0.415 * shade;
    b[i] = 0.4 * shade * (1 - 0.04 * streak);
    height[i] = face * 0.003 + (panelTone[i] - 0.5) * 0.0015 * face + fine[i] * 0.0004 + grain[i] * 0.0002 + macro[i] * 0.0012;
    roughness[i] = 0.84 + meso[i] * 0.06 - 0.05 * streak;
  }
  p.release(panelTone, grain);
  yield;

  // Tie holes: a regular grid of cone-shaped holes left by the formwork ties; and bug holes.
  const holes = p.field();
  const panelWidth = size / columns;
  const panelHeight = size / rows;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      for (const u of [0.18, 0.82]) {
        stampShape(holes, size, { x: (column + u) * panelWidth, y: (row + 0.5) * panelHeight, halfWidth: Math.max(1.6, 0.014 * tpm), soft: Math.max(1.2, 0.01 * tpm) });
      }
    }
  }
  scatterBlots(holes, size, random, { count: Math.round(count / 6000), minRadius: 0.7, maxRadius: 1.9, soft: 0.6, stretch: 1.3, value: 0.6 });
  for (let i = 0; i < count; i += 1) {
    const m = holes[i];
    if (m <= 0) continue;
    height[i] -= 0.006 * m;
    const dark = 1 - 0.5 * m;
    r[i] *= dark;
    g[i] *= dark;
    b[i] *= dark;
  }
  p.release(holes);
  yield;
  return yield* p.finish({
    normalStrength: 1.2,
    occlusionRadius: 3,
    occlusionDepth: 0.004,
    occlusionStrength: 0.65,
    cavityShade: 0.3,
    meanLuminance: options.luminance ?? 0.36,
  });
}

/**
 * Paints brickwork in running bond with recessed mortar. Tile 1.8 m (8 bricks by 24 courses).
 * @param {ReturnType<import('./surfacePainter.js').createSurfacePainter>} p
 * @param {Object} [options]
 * @param {number | string} [options.color] sRGB colour of the bricks.
 * @param {number | string} [options.mortarColor] sRGB colour of the mortar.
 * @param {number} [options.columns] Bricks across the tile (default 8).
 * @param {number} [options.rows] Courses up the tile (default 24).
 * @param {number} [options.variation] Tone spread between bricks, 0..1 (default 0.5).
 * @param {number} [options.weathering] 0..1 soot, efflorescence and chipped faces (default 0.5).
 * @param {number} [options.luminance] Mean albedo (default: as painted).
 */
export function* paintBrick(p, options = {}) {
  const size = p.size;
  const count = size * size;
  const tpm = p.texelsPerMetre;
  const random = p.random;
  const brick = parseColor(options.color ?? 0x9b4f38);
  const mortar = parseColor(options.mortarColor ?? 0xb5ada0);
  const variation = options.variation ?? 0.5;
  const weathering = clamp01(options.weathering ?? 0.5);

  const bond = createTilePattern(size, {
    columns: options.columns ?? 8,
    rows: options.rows ?? 24,
    stagger: 0.5,
    jointTexels: Math.max(1.8, 0.01 * tpm),
    bevelTexels: Math.max(1.5, 0.004 * tpm),
  });
  const tone = cellRandomField(bond.cell, bond.cellCount, p.seed, p.field());
  const level = cellRandomField(bond.cell, bond.cellCount, p.seed + 3, p.field());
  const macro = p.fractal(2, 5);
  const meso = p.fractal(16, 4, { label: 1 });
  const fine = p.fractal(64, 2, { label: 2 });
  const grain = fillWhiteNoise(p.field(), p.seed);
  yield;

  const { r, g, b, height, roughness } = p;
  for (let i = 0; i < count; i += 1) {
    const face = bond.profile[i];
    const t = tone[i];
    // A few bricks are overfired (dark, purplish), a few pale.
    const burnt = t > 0.88 ? (t - 0.88) * 8 : 0;
    const shade = (1 - 0.3 * variation + 0.6 * variation * t) * (1 + macro[i] * 0.1 + meso[i] * 0.12) * (0.92 + 0.16 * grain[i]) * (1 - 0.45 * burnt);
    const mr = mortar[0] * (0.9 + 0.2 * grain[i]) * (1 + macro[i] * 0.1);
    r[i] = mr + (brick[0] * shade - mr) * face;
    g[i] = mr * (mortar[1] / mortar[0]) + (brick[1] * shade * (1 + 0.1 * burnt) - mr * (mortar[1] / mortar[0])) * face;
    b[i] = mr * (mortar[2] / mortar[0]) + (brick[2] * shade * (1 + 0.5 * burnt) - mr * (mortar[2] / mortar[0])) * face;
    height[i] = face * (0.004 + (level[i] - 0.5) * 0.0016) + (meso[i] * 0.0006 + fine[i] * 0.0003 + grain[i] * 0.0003) * face + grain[i] * 0.0004 * (1 - face);
    roughness[i] = 0.86 + 0.08 * (1 - face) + meso[i] * 0.04;
  }
  p.release(tone, level, grain);
  yield;

  if (weathering > 0) {
    // Efflorescence (white salt bloom) and soot, in soft drifting patches.
    const salt = p.field();
    const soot = p.field();
    scatterBlots(salt, size, random, { count: Math.round(weathering * 5), minRadius: 0.1 * tpm, maxRadius: 0.35 * tpm, soft: 1, stretch: 2, value: 0.7 });
    scatterBlots(soot, size, random, { count: Math.round(weathering * 5), minRadius: 0.15 * tpm, maxRadius: 0.5 * tpm, soft: 1, stretch: 2.5, value: 0.7 });
    const speckle = p.fractal(28, 3, { label: 5 });
    for (let i = 0; i < count; i += 1) {
      const white = clamp01(salt[i] * (0.4 + speckle[i] * 1.6)) * bond.profile[i];
      const black = clamp01(soot[i] * (0.6 + speckle[i]));
      if (white > 0) {
        r[i] += (0.55 - r[i]) * white * 0.5;
        g[i] += (0.54 - g[i]) * white * 0.5;
        b[i] += (0.5 - b[i]) * white * 0.5;
      }
      if (black > 0) {
        const dark = 1 - 0.35 * black;
        r[i] *= dark;
        g[i] *= dark;
        b[i] *= dark;
      }
    }
    p.release(salt, soot);
  }
  yield;
  return yield* p.finish({
    normalStrength: 1.2,
    occlusionRadius: 3,
    occlusionDepth: 0.004,
    occlusionStrength: 0.75,
    cavityShade: 0.3,
    meanLuminance: options.luminance,
  });
}

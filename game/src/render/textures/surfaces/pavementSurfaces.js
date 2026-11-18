// Paved ground: everything laid in units with joints (concrete paving slabs, clay pavers,
// stone and terrazzo plaza tiles, kerb stones) and poured concrete with tooled joints and a
// broom finish. One tiled recipe with presets covers the laid surfaces; each unit gets its own
// tone and a slight tilt, joints are recessed and dirty, and the faces carry pores, stains,
// chewing gum and the odd crack, so that a low sun reads every slab edge.
//
//   generateSurfaceMaps('pavingSlabs')            // 60 cm concrete slabs, tile 2.4 m
//   generateSurfaceMaps('plazaPavers', { colors: [0xa65a3c, 0x8f4a35, 0xb8704c] })

import { parseColor } from '../colorMath.js';
import { cellRandomField, createTilePattern, drawCrack, scatterBlots } from '../fields/patternFields.js';
import { fillWhiteNoise } from '../noise/whiteNoise.js';

/**
 * Paints a surface laid in rectangular units with joints.
 * @param {ReturnType<import('./surfacePainter.js').createSurfacePainter>} p
 * @param {Object} [options]
 * @param {number} [options.columns] Units across the tile (default 4).
 * @param {number} [options.rows] Courses down the tile (default 4).
 * @param {number} [options.stagger] 0 stacked, 0.5 running bond.
 * @param {Array<number | string>} [options.colors] sRGB colours the units are drawn from.
 * @param {number} [options.toneVariation] Brightness spread between units (default 0.12).
 * @param {number} [options.jointMetres] Joint width (default 8 mm).
 * @param {number | string} [options.jointColor] sRGB colour of the joint filling.
 * @param {number} [options.jointDepth] Metres the joint lies below the face (default 5 mm).
 * @param {number} [options.tilt] Height spread between neighbouring units in metres (default 1.5 mm).
 * @param {number} [options.roughness] Roughness of the faces (default 0.88).
 * @param {number} [options.grain] Strength of pores and grain, 0..1 (default 1).
 * @param {number} [options.chips] 0..1 amount of terrazzo chips in the faces (default 0).
 * @param {number} [options.dirt] 0..1 stains, gum and edge grime (default 0.6).
 * @param {number} [options.cracks] 0..1 cracked units (default 0.3).
 * @param {number} [options.luminance] Mean albedo to pin the result to (default: as painted).
 */
export function* paintTiledPaving(p, options = {}) {
  const size = p.size;
  const count = size * size;
  const tpm = p.texelsPerMetre;
  const random = p.random;
  const colors = (options.colors ?? [0xa8a399, 0x9f9a90, 0xb0aba1]).map(parseColor);
  const jointColor = parseColor(options.jointColor ?? 0x4a453d);
  const toneVariation = options.toneVariation ?? 0.12;
  const jointDepth = options.jointDepth ?? 0.005;
  const tilt = options.tilt ?? 0.0015;
  const grainAmount = options.grain ?? 1;
  const dirt = options.dirt ?? 0.6;
  const baseRoughness = options.roughness ?? 0.88;

  const tiles = createTilePattern(size, {
    columns: options.columns ?? 4,
    rows: options.rows ?? 4,
    stagger: options.stagger ?? 0,
    jointTexels: Math.max(1.4, (options.jointMetres ?? 0.008) * tpm),
    bevelTexels: Math.max(1.5, 0.006 * tpm),
  });
  const unitTone = cellRandomField(tiles.cell, tiles.cellCount, p.seed, p.field());
  const unitLevel = cellRandomField(tiles.cell, tiles.cellCount, p.seed + 7, p.field());
  const macro = p.fractal(2, 5);
  const meso = p.fractal(10, 4, { label: 1 });
  const fine = p.fractal(48, 3, { label: 2 });
  const grain = fillWhiteNoise(p.field(), p.seed);
  yield;

  const { r, g, b, height, roughness } = p;
  const edgeReach = 1 / (0.035 * tpm);
  const colorCount = colors.length;
  for (let i = 0; i < count; i += 1) {
    const face = tiles.profile[i];
    const tone = unitTone[i];
    const color = colors[Math.min(colorCount - 1, Math.floor(((tone * 5.37) % 1) * colorCount))];
    // Grime gathers along the edges of each unit.
    let edge = 1 - tiles.distance[i] * edgeReach;
    edge = edge < 0 ? 0 : edge * edge * dirt * 0.28;
    const shade =
      (1 - toneVariation + 2 * toneVariation * tone) *
      (1 + macro[i] * 0.1 + meso[i] * 0.07 * grainAmount) *
      (1 - 0.07 * grainAmount + 0.14 * grainAmount * grain[i]) *
      (1 - edge);
    r[i] = jointColor[0] + (color[0] * shade - jointColor[0]) * face;
    g[i] = jointColor[1] + (color[1] * shade - jointColor[1]) * face;
    b[i] = jointColor[2] + (color[2] * shade - jointColor[2]) * face;
    height[i] =
      face * (jointDepth + (unitLevel[i] - 0.5) * tilt) +
      (fine[i] * 0.00035 + grain[i] * 0.0002) * grainAmount * face +
      macro[i] * 0.001;
    roughness[i] = baseRoughness + (0.97 - baseRoughness) * (1 - face) + meso[i] * 0.04;
  }
  p.release(unitTone, unitLevel, grain);
  yield;

  // Terrazzo: stone chips of several colours ground flush with the face.
  const chipAmount = options.chips ?? 0;
  if (chipAmount > 0) {
    const chips = p.cells(Math.min(200, Math.round(p.tileMetres / 0.022)), { label: 4 });
    const chipTone = cellRandomField(chips.cell, chips.period * chips.period, p.seed + 3, p.field());
    for (let i = 0; i < count; i += 1) {
      const t = chipTone[i];
      if (t > chipAmount) continue;
      const inside = chips.second[i] - chips.nearest[i];
      if (inside < 0.22) continue;
      const k = ((t * 13.7) % 1);
      const lift = tiles.profile[i] * 0.85;
      const tr = k < 0.33 ? 0.62 : k < 0.66 ? 0.16 : 0.48;
      const tg = k < 0.33 ? 0.58 : k < 0.66 ? 0.14 : 0.3;
      const tb = k < 0.33 ? 0.5 : k < 0.66 ? 0.13 : 0.2;
      r[i] += (tr - r[i]) * lift;
      g[i] += (tg - g[i]) * lift;
      b[i] += (tb - b[i]) * lift;
      roughness[i] -= 0.08 * lift;
    }
    p.release(chipTone);
    yield;
  }

  if (dirt > 0) {
    // Broad stains, then chewing gum: small dark discs trodden flat.
    const stain = p.field();
    scatterBlots(stain, size, random, { count: Math.round(dirt * 9), minRadius: 0.06 * tpm, maxRadius: 0.3 * tpm, soft: 0.9, stretch: 2, value: 0.6 });
    scatterBlots(stain, size, random, { count: Math.round(dirt * 22), minRadius: 0.009 * tpm, maxRadius: 0.017 * tpm, soft: 0.5, stretch: 1.3, value: 1 });
    for (let i = 0; i < count; i += 1) {
      const m = stain[i] * tiles.profile[i];
      if (m <= 0) continue;
      const dark = 1 - 0.42 * m;
      r[i] *= dark;
      g[i] *= dark;
      b[i] *= dark;
      roughness[i] -= 0.06 * m;
    }
    p.release(stain);
  }
  const crackCount = Math.round((options.cracks ?? 0.3) * 5);
  if (crackCount > 0) {
    const crack = p.field();
    for (let k = 0; k < crackCount; k += 1) {
      drawCrack(crack, size, random, { length: random.range(0.25, 0.7) * tpm, step: Math.max(3, 0.02 * tpm), wander: 0.4, halfWidth: 0.55, branching: 0.03 });
    }
    for (let i = 0; i < count; i += 1) {
      const m = crack[i];
      if (m <= 0) continue;
      const t = (m > 1 ? 1 : m) * tiles.profile[i];
      const dark = 1 - 0.6 * t;
      r[i] *= dark;
      g[i] *= dark;
      b[i] *= dark;
      height[i] -= 0.003 * t;
    }
    p.release(crack);
  }
  yield;
  return yield* p.finish({
    normalStrength: options.normalStrength ?? 1.2,
    occlusionRadius: 4,
    occlusionDepth: 0.004,
    occlusionStrength: 0.7,
    cavityShade: 0.3,
    meanLuminance: options.luminance,
  });
}

/** Parameter presets of paintTiledPaving, by catalogue name. */
export const TILED_PAVING_PRESETS = Object.freeze({
  /** Grey concrete paving slabs, 60 x 60 cm. Tile 2.4 m. */
  pavingSlabs: Object.freeze({ columns: 4, rows: 4, stagger: 0, luminance: 0.31 }),
  /** Clay brick pavers in running bond, 20 x 10 cm. Tile 2.4 m. */
  plazaPavers: Object.freeze({
    columns: 12, rows: 24, stagger: 0.5, colors: [0xa2573d, 0x8e4934, 0xb26a4a, 0x9a5038, 0x7d4332],
    toneVariation: 0.16, jointMetres: 0.006, jointColor: 0x5a4a3c, jointDepth: 0.004, tilt: 0.0012,
    dirt: 0.35, cracks: 0.1, luminance: 0.17,
  }),
  /** Light stone tiles in two tones, 60 x 60 cm, honed. Tile 2.4 m. */
  plazaStone: Object.freeze({
    columns: 4, rows: 4, stagger: 0.5, colors: [0xcfc5b2, 0xc4b8a2, 0xd6cdbd, 0xb9ab94],
    toneVariation: 0.07, jointMetres: 0.005, jointColor: 0x6b6558, jointDepth: 0.003, tilt: 0.0006,
    roughness: 0.62, grain: 0.6, dirt: 0.3, cracks: 0.1, luminance: 0.46,
  }),
  /** Terrazzo slabs with stone chips and dark joints, 80 x 80 cm, polished. Tile 2.4 m. */
  plazaTerrazzo: Object.freeze({
    columns: 3, rows: 3, stagger: 0, colors: [0xd9d2c4, 0xd4ccbc],
    toneVariation: 0.04, jointMetres: 0.005, jointColor: 0x3d3a34, jointDepth: 0.0015, tilt: 0.0003,
    roughness: 0.38, grain: 0.3, chips: 0.6, dirt: 0.2, cracks: 0, luminance: 0.42,
  }),
  /** Concrete kerb stones, 1 m long, laid end to end along u. Tile 2 m. */
  kerbStone: Object.freeze({
    columns: 2, rows: 1, stagger: 0, colors: [0xb3aea4, 0xa9a49a],
    toneVariation: 0.08, jointMetres: 0.01, jointDepth: 0.006, tilt: 0.002,
    roughness: 0.86, dirt: 0.5, cracks: 0.2, luminance: 0.34,
  }),
});

/**
 * Paints poured concrete: a floated or broom-finished slab with tooled control joints, the
 * ground of yards, car parks, docks and loading bays.
 * @param {ReturnType<import('./surfacePainter.js').createSurfacePainter>} p
 * @param {Object} [options]
 * @param {number | string} [options.color] sRGB colour of the concrete.
 * @param {number} [options.panels] Control-joint panels per tile edge (default 2; 0 for none).
 * @param {number} [options.broom] 0..1 strength of the broom finish (default 0.6).
 * @param {number} [options.stains] 0..1 (default 0.5).
 * @param {number} [options.cracks] 0..1 (default 0.4).
 * @param {number} [options.luminance] Mean albedo (default 0.3).
 */
export function* paintPouredConcrete(p, options = {}) {
  const size = p.size;
  const count = size * size;
  const tpm = p.texelsPerMetre;
  const random = p.random;
  const color = parseColor(options.color ?? 0xa7a297);
  const panels = options.panels ?? 2;
  const broom = options.broom ?? 0.6;

  const macro = p.fractal(2, 6);
  const meso = p.fractal(9, 4, { label: 1 });
  const fine = p.fractal(40, 3, { label: 2 });
  // Broom marks: noise stretched into fine parallel striations.
  const strokes = p.fractal(Math.min(size / 4, 120), 2, { label: 5, periodY: 2 });
  const grain = fillWhiteNoise(p.field(), p.seed);
  const joints = panels > 0 ? createTilePattern(size, { columns: panels, rows: panels, jointTexels: Math.max(1.6, 0.012 * tpm), bevelTexels: Math.max(2, 0.015 * tpm) }) : null;
  yield;

  const { r, g, b, height, roughness } = p;
  for (let i = 0; i < count; i += 1) {
    const face = joints ? joints.profile[i] : 1;
    const shade = (1 + macro[i] * 0.14 + meso[i] * 0.08) * (0.94 + 0.12 * grain[i]) * (0.72 + 0.28 * face);
    r[i] = color[0] * shade;
    g[i] = color[1] * shade;
    b[i] = color[2] * shade;
    height[i] = face * 0.006 + strokes[i] * 0.0005 * broom + fine[i] * 0.0003 + grain[i] * 0.00018 + macro[i] * 0.0015;
    roughness[i] = 0.87 + meso[i] * 0.05 + (1 - face) * 0.08;
  }
  // Bug holes: small pits left by air bubbles.
  const pits = p.field();
  scatterBlots(pits, size, random, { count: Math.round(count / 9000), minRadius: 0.8, maxRadius: 2.2, soft: 0.6, stretch: 1.2 });
  for (let i = 0; i < count; i += 1) {
    const m = pits[i];
    if (m <= 0) continue;
    height[i] -= 0.002 * m;
    const dark = 1 - 0.35 * m;
    r[i] *= dark;
    g[i] *= dark;
    b[i] *= dark;
  }
  p.release(pits, grain);
  yield;

  const stainAmount = options.stains ?? 0.5;
  if (stainAmount > 0) {
    const stain = p.field();
    scatterBlots(stain, size, random, { count: Math.round(stainAmount * 10), minRadius: 0.08 * tpm, maxRadius: 0.45 * tpm, soft: 0.95, stretch: 2.4, value: 0.7 });
    const breakup = p.fractal(18, 3, { label: 3 });
    for (let i = 0; i < count; i += 1) {
      let m = stain[i];
      if (m <= 0) continue;
      m *= 0.7 + 0.6 * breakup[i];
      m = m < 0 ? 0 : m > 1 ? 1 : m;
      const dark = 1 - 0.3 * m;
      r[i] *= dark;
      g[i] *= dark * 0.99;
      b[i] *= dark * 0.96;
      roughness[i] -= 0.08 * m;
    }
    p.release(stain);
  }
  const crackCount = Math.round((options.cracks ?? 0.4) * 6);
  if (crackCount > 0) {
    const crack = p.field();
    for (let k = 0; k < crackCount; k += 1) {
      drawCrack(crack, size, random, { length: random.range(0.5, 2) * tpm, step: Math.max(3, 0.025 * tpm), wander: 0.35, halfWidth: 0.6, branching: 0.04 });
    }
    for (let i = 0; i < count; i += 1) {
      const m = crack[i];
      if (m <= 0) continue;
      const t = m > 1 ? 1 : m;
      const dark = 1 - 0.65 * t;
      r[i] *= dark;
      g[i] *= dark;
      b[i] *= dark;
      height[i] -= 0.003 * t;
    }
    p.release(crack);
  }
  yield;
  return yield* p.finish({
    normalStrength: 1.2,
    occlusionRadius: 4,
    occlusionDepth: 0.004,
    occlusionStrength: 0.65,
    cavityShade: 0.3,
    meanLuminance: options.luminance ?? 0.3,
  });
}

// Road surfaces: asphalt of any age, from a fresh black overlay to a sun-bleached street with
// exposed aggregate, repair patches, cracks, tar-sealed cracks, alligator cracking and oil
// stains. One recipe, driven by `age` and a few amounts, tiles over 4 m. The albedo is pinned to
// measured values (about 0.08 for new asphalt to 0.12 for old) and the roughness stays between
// 0.75 and 0.85 on average, with glossier tar and oil so that a low sun picks them out.
//
//   const maps = generateSurfaceMaps('asphalt', { age: 0.7, cracks: 0.6 });   // see surfaceCatalog.js

import { cellRandomField, drawCrack, scatterBlots, stampShape } from '../fields/patternFields.js';
import { fillWhiteNoise } from '../noise/whiteNoise.js';

const clamp01 = (value) => (value < 0 ? 0 : value > 1 ? 1 : value);

/**
 * Paints asphalt.
 * @param {ReturnType<import('./surfacePainter.js').createSurfacePainter>} p
 * @param {Object} [options]
 * @param {number} [options.age] 0 freshly laid (dark, stones coated) to 1 old (bleached, stones
 *   exposed, ravelled). Default 0.5.
 * @param {number} [options.cracks] 0..1 amount of open cracks (default grows with age).
 * @param {number} [options.sealed] 0..1 amount of tar-sealed cracks (default grows with age).
 * @param {number} [options.patches] 0..1 amount of rectangular repair patches (default grows with age).
 * @param {number} [options.alligator] 0..1 amount of alligator (fatigue) cracking (default: only when old).
 * @param {number} [options.stains] 0..1 amount of oil stains (default 0.4).
 */
export function* paintAsphalt(p, options = {}) {
  const age = clamp01(options.age ?? 0.5);
  const crackAmount = clamp01(options.cracks ?? age * 0.7);
  const sealedAmount = clamp01(options.sealed ?? Math.max(0, age - 0.35));
  const patchAmount = clamp01(options.patches ?? Math.max(0, age - 0.3) * 0.9);
  const alligatorAmount = clamp01(options.alligator ?? Math.max(0, age - 0.7) * 2);
  const stainAmount = clamp01(options.stains ?? 0.4);
  const size = p.size;
  const count = size * size;
  const tpm = p.texelsPerMetre;
  const random = p.random;

  // Aggregate: stones of about 18 mm (never finer than 3.6 texels) in a bituminous binder.
  const stonePeriod = Math.max(8, Math.min(250, Math.round(p.tileMetres / 0.018), Math.floor(size / 3.6)));
  const stones = p.cells(stonePeriod);
  const tone = cellRandomField(stones.cell, stonePeriod * stonePeriod, p.seed, p.field());
  const macro = p.fractal(3, 5);
  const meso = p.fractal(14, 4, { label: 1 });
  const grain = fillWhiteNoise(p.field(), p.seed);
  yield;

  const binder = 0.04 + 0.05 * age;
  const expose = 0.3 + 0.7 * age;
  const relief = 0.0008 + 0.001 * age;
  const { r, g, b, height, roughness } = p;
  for (let i = 0; i < count; i += 1) {
    let stone = (stones.second[i] - stones.nearest[i]) * 3.2;
    stone = stone > 1 ? 1 : stone;
    stone = stone * stone * (3 - 2 * stone);
    const t = tone[i];
    const warm = (t * 7.31) % 1;
    const light = 0.085 + 0.25 * t * t;
    // Not every stone has lost its coat of bitumen.
    const show = stone * expose * (0.35 + 0.65 * t);
    const mottle = (1 + macro[i] * 0.12 + meso[i] * 0.07) * (0.93 + 0.14 * grain[i]);
    r[i] = (binder * 0.98 + (light * (0.95 + 0.13 * warm) - binder * 0.98) * show) * mottle;
    g[i] = (binder + (light - binder) * show) * mottle;
    b[i] = (binder * 1.03 + (light * (1.07 - 0.17 * warm) - binder * 1.03) * show) * mottle;
    height[i] = stone * relief * (0.45 + 0.75 * t) + meso[i] * 0.0007 + macro[i] * 0.0012 + grain[i] * 0.00025;
    roughness[i] = 0.845 - 0.11 * show + macro[i] * 0.03;
  }
  p.release(tone, grain);
  yield;

  // Repair patches: newer, darker asphalt set in with a tar seam around it.
  const patchCount = Math.round(patchAmount * 3.4);
  if (patchCount > 0) {
    const patch = p.field();
    const band = 0.03 * tpm;
    for (let k = 0; k < patchCount; k += 1) {
      stampShape(patch, size, {
        x: random.range(0, size),
        y: random.range(0, size),
        halfWidth: random.range(0.3, 0.95) * tpm,
        halfHeight: random.range(0.25, 0.6) * tpm,
        angle: (random.chance(0.5) ? 0 : Math.PI / 2) + random.range(-0.04, 0.04),
        kind: 'box',
        soft: band,
      });
    }
    for (let i = 0; i < count; i += 1) {
      const m = patch[i];
      if (m <= 0) continue;
      const inside = m > 0.55 ? 1 : m < 0.45 ? 0 : (m - 0.45) * 10;
      const seam = m < 1 ? 1 - Math.abs(2 * m - 1) : 0;
      const dark = 1 - 0.36 * inside;
      const tar = seam * 0.85;
      r[i] = r[i] * dark + (0.03 - r[i] * dark) * tar;
      g[i] = g[i] * dark + (0.03 - g[i] * dark) * tar;
      b[i] = b[i] * dark + (0.032 - b[i] * dark) * tar;
      height[i] += 0.0018 * inside + 0.001 * seam;
      roughness[i] += (0.5 - roughness[i]) * tar + 0.02 * inside;
    }
    p.release(patch);
    yield;
  }

  // Tar-sealed cracks: wide glossy black bands that wander across the lane.
  const sealedCount = Math.round(sealedAmount * 5);
  if (sealedCount > 0) {
    const sealed = p.field();
    for (let k = 0; k < sealedCount; k += 1) {
      drawCrack(sealed, size, random, {
        length: random.range(0.8, 2.6) * tpm,
        step: Math.max(4, 0.03 * tpm),
        wander: 0.32,
        halfWidth: Math.max(1.2, 0.013 * tpm),
        branching: 0.03,
      });
    }
    for (let i = 0; i < count; i += 1) {
      const m = sealed[i];
      if (m <= 0) continue;
      const t = m > 1 ? 1 : m;
      r[i] += (0.028 - r[i]) * t * 0.93;
      g[i] += (0.028 - g[i]) * t * 0.93;
      b[i] += (0.03 - b[i]) * t * 0.93;
      height[i] += 0.0012 * t;
      roughness[i] += (0.42 - roughness[i]) * t;
    }
    p.release(sealed);
    yield;
  }

  // Open cracks, and alligator cracking where the base has failed.
  const crackCount = Math.round(crackAmount * 9);
  if (crackCount > 0 || alligatorAmount > 0) {
    const crack = p.field();
    for (let k = 0; k < crackCount; k += 1) {
      drawCrack(crack, size, random, {
        length: random.range(0.5, 2.4) * tpm,
        step: Math.max(3, 0.02 * tpm),
        wander: 0.5,
        halfWidth: Math.max(0.55, 0.0028 * tpm) * random.range(0.8, 1.4),
        branching: 0.05,
      });
    }
    if (alligatorAmount > 0) {
      const region = p.field();
      scatterBlots(region, size, random, {
        count: Math.max(1, Math.round(alligatorAmount * 3)),
        minRadius: 0.35 * tpm,
        maxRadius: 0.8 * tpm,
        soft: 0.5,
      });
      const plates = p.cells(Math.max(6, Math.round(p.tileMetres / 0.11)), { label: 2 });
      const lineWidth = 0.05 + 2.2 / (size / plates.period);
      for (let i = 0; i < count; i += 1) {
        if (region[i] <= 0.05) continue;
        const edge = plates.second[i] - plates.nearest[i];
        const line = edge < lineWidth ? (1 - edge / lineWidth) * Math.min(1, region[i] * 2) : 0;
        if (line > crack[i]) crack[i] = line;
        height[i] -= 0.0015 * region[i];
      }
      p.release(region);
    }
    for (let i = 0; i < count; i += 1) {
      const m = crack[i];
      if (m <= 0) continue;
      const t = m > 1 ? 1 : m;
      const dark = 1 - 0.78 * t;
      r[i] *= dark;
      g[i] *= dark;
      b[i] *= dark;
      height[i] -= 0.0045 * t;
      roughness[i] += (0.95 - roughness[i]) * t;
    }
    p.release(crack);
    yield;
  }

  // Oil stains: dark, soft-edged, a little glossy.
  const stainCount = Math.round(stainAmount * 8);
  if (stainCount > 0) {
    const stain = p.field();
    scatterBlots(stain, size, random, { count: stainCount, minRadius: 0.05 * tpm, maxRadius: 0.17 * tpm, soft: 0.85, stretch: 2.2, value: 0.8 });
    scatterBlots(stain, size, random, { count: stainCount * 2, minRadius: 0.012 * tpm, maxRadius: 0.035 * tpm, soft: 0.7, value: 1 });
    const breakup = p.fractal(24, 3, { label: 3 });
    for (let i = 0; i < count; i += 1) {
      let m = stain[i];
      if (m <= 0) continue;
      m *= 0.75 + 0.5 * breakup[i];
      m = m < 0 ? 0 : m > 1 ? 1 : m;
      const dark = 1 - 0.52 * m;
      r[i] *= dark;
      g[i] *= dark;
      b[i] *= dark * 0.97;
      roughness[i] += (0.5 - roughness[i]) * m * 0.75;
    }
    p.release(stain);
    yield;
  }

  return yield* p.finish({
    normalStrength: 1.3,
    occlusionRadius: 3,
    occlusionDepth: 0.0028,
    occlusionStrength: 0.6,
    cavityShade: 0.3,
    meanLuminance: 0.078 + 0.044 * age,
  });
}

/**
 * Parameter presets for asphalt at the ages a city shows: a new overlay, an ordinary street, an
 * old one, and one that has been dug up and patched many times.
 */
export const ASPHALT_PRESETS = Object.freeze({
  fresh: Object.freeze({ age: 0.08, cracks: 0, sealed: 0, patches: 0, alligator: 0, stains: 0.15 }),
  worn: Object.freeze({ age: 0.5, cracks: 0.25, sealed: 0.2, patches: 0.15, alligator: 0, stains: 0.45 }),
  old: Object.freeze({ age: 0.9, cracks: 0.75, sealed: 0.6, patches: 0.3, alligator: 0.5, stains: 0.5 }),
  patched: Object.freeze({ age: 0.65, cracks: 0.4, sealed: 0.8, patches: 1, alligator: 0.15, stains: 0.5 }),
});

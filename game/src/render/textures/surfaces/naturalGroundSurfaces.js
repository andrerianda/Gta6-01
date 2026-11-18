// Unpaved ground: beach sand (dry with wind ripples and footprints, or wet and glossy), lawn and
// dry scrub grass, bare dirt, wet mud and gravel. All tile over 3 m (gravel 2 m) and are pinned
// to measured reflectances: dry sand about 0.42, wet sand 0.2, grass 0.09 to 0.14, soil 0.12,
// mud 0.06, gravel 0.25.
//
//   generateSurfaceMaps('sand', { wetness: 0, footprints: 0.5 })
//   generateSurfaceMaps('grass', { dryness: 0.8 })

import { parseColor } from '../colorMath.js';
import { blurField } from '../fields/fieldFilters.js';
import { cellRandomField, scatterBlots, stampShape, stampStroke } from '../fields/patternFields.js';
import { fillWhiteNoise } from '../noise/whiteNoise.js';

const clamp01 = (value) => (value < 0 ? 0 : value > 1 ? 1 : value);

/**
 * Paints beach sand.
 * @param {ReturnType<import('./surfacePainter.js').createSurfacePainter>} p
 * @param {Object} [options]
 * @param {number | string} [options.color] sRGB colour of the dry sand.
 * @param {number} [options.wetness] 0 dry and loose to 1 wet, dark and smooth (default 0).
 * @param {number} [options.ripples] 0..1 strength of the wind ripples (default 0.7).
 * @param {number} [options.footprints] 0..1 amount of footprints (default 0.5).
 */
export function* paintSand(p, options = {}) {
  const size = p.size;
  const count = size * size;
  const tpm = p.texelsPerMetre;
  const random = p.random;
  const wetness = clamp01(options.wetness ?? 0);
  const rippleAmount = (options.ripples ?? 0.7) * (1 - 0.6 * wetness);
  const color = parseColor(options.color ?? 0xdccfae);

  const macro = p.fractal(2, 5);
  const meso = p.fractal(7, 4, { label: 1 });
  const warp = p.fractal(4, 3, { label: 2 });
  const grain = fillWhiteNoise(p.field(), p.seed);
  const flecks = fillWhiteNoise(p.field(), p.seed + 11);
  yield;

  // Wind ripples: a wave train with whole numbers of waves per tile, bent by noise, that fades
  // in and out over the tile.
  const wavesAlong = 2;
  const wavesAcross = Math.max(6, Math.round(p.tileMetres / 0.11));
  const { r, g, b, height, roughness } = p;
  const twoPi = Math.PI * 2;
  for (let y = 0; y < size; y += 1) {
    const v = y / size;
    for (let x = 0; x < size; x += 1) {
      const i = y * size + x;
      const phase = twoPi * (wavesAlong * (x / size) + wavesAcross * v) + warp[i] * 5 + macro[i] * 3;
      let wave = 0.5 + 0.5 * Math.sin(phase);
      wave *= wave;
      const presence = clamp01(0.55 + meso[i] * 1.6) * rippleAmount;
      const ripple = wave * presence;
      const speck = flecks[i] > 0.985 ? 0.55 : flecks[i] < 0.02 ? 1.18 : 1;
      const shade = (1 + macro[i] * 0.08 + meso[i] * 0.05) * (0.9 + 0.2 * grain[i]) * (0.93 + 0.1 * ripple) * speck;
      r[i] = color[0] * shade;
      g[i] = color[1] * shade;
      b[i] = color[2] * shade;
      height[i] = ripple * 0.006 + macro[i] * 0.01 + meso[i] * 0.003 + grain[i] * 0.0006 * (1 - 0.7 * wetness);
      roughness[i] = 0.93 - 0.03 * grain[i];
    }
  }
  p.release(grain, flecks);
  yield;

  // Footprints: pairs of dents with a pushed-up rim, in short walking lines.
  const walkers = Math.round((options.footprints ?? 0.5) * 5);
  if (walkers > 0) {
    const dent = p.field();
    for (let w = 0; w < walkers; w += 1) {
      let x = random.range(0, size);
      let y = random.range(0, size);
      const heading = random.angle();
      const steps = random.int(4, 9);
      for (let s = 0; s < steps; s += 1) {
        const side = s % 2 === 0 ? 1 : -1;
        const fx = x + Math.cos(heading + Math.PI / 2) * side * 0.09 * tpm;
        const fy = y + Math.sin(heading + Math.PI / 2) * side * 0.09 * tpm;
        stampShape(dent, size, { x: fx, y: fy, halfWidth: 0.13 * tpm, halfHeight: 0.05 * tpm, angle: heading + random.range(-0.15, 0.15), soft: 0.035 * tpm, value: random.range(0.6, 1) });
        x += Math.cos(heading) * 0.36 * tpm;
        y += Math.sin(heading) * 0.36 * tpm;
      }
    }
    const rim = p.copy(dent);
    blurField(rim, Math.max(2, 0.03 * tpm), 2);
    for (let i = 0; i < count; i += 1) {
      const d = dent[i];
      const around = rim[i] - d;
      height[i] += (around > 0 ? around * 0.008 : 0) - d * 0.014;
      const dark = 1 - 0.1 * d;
      r[i] *= dark;
      g[i] *= dark;
      b[i] *= dark;
    }
    p.release(dent, rim);
    yield;
  }

  if (wetness > 0) {
    // Water fills the pores: darker, more saturated, and smooth where it stands.
    const pools = p.fractal(5, 4, { label: 3 });
    for (let i = 0; i < count; i += 1) {
      const wet = clamp01(wetness * (1.1 + pools[i] * 0.6));
      r[i] *= 1 - 0.5 * wet;
      g[i] *= 1 - 0.53 * wet;
      b[i] *= 1 - 0.58 * wet;
      roughness[i] += (0.3 - roughness[i]) * wet * 0.9;
      height[i] *= 1 - 0.5 * wet;
    }
  }
  return yield* p.finish({
    normalStrength: 1.1,
    occlusionRadius: 5,
    occlusionDepth: 0.008,
    occlusionStrength: 0.55,
    cavityShade: 0.22,
    meanLuminance: 0.42 - 0.22 * wetness,
  });
}

/**
 * Paints grass seen from above: thousands of blades drawn as short strokes, in clumps, over
 * dark soil. `dryness` turns a watered lawn into sun-burnt scrub with straw and bare patches.
 * @param {ReturnType<import('./surfacePainter.js').createSurfacePainter>} p
 * @param {Object} [options]
 * @param {number} [options.dryness] 0 lush lawn to 1 dry scrub (default 0.15).
 * @param {number} [options.length] Blade length in metres as seen from above (default 0.07).
 * @param {number} [options.bare] 0..1 amount of bare soil showing (default grows with dryness).
 */
export function* paintGrass(p, options = {}) {
  const size = p.size;
  const count = size * size;
  const tpm = p.texelsPerMetre;
  const random = p.random;
  const dryness = clamp01(options.dryness ?? 0.15);
  const bare = clamp01(options.bare ?? dryness * 0.5);
  const bladeLength = (options.length ?? 0.07) * tpm;

  const macro = p.fractal(2, 5);
  const meso = p.fractal(9, 4, { label: 1 });
  const hue = p.fractal(18, 3, { label: 2 });
  const blades = p.field();
  // Blades: each stroke carries a brightness, and brighter strokes cover darker ones.
  const bladeCount = Math.round((count / 16) * (1 - 0.3 * bare));
  for (let k = 0; k < bladeCount; k += 1) {
    const x = random.range(0, size);
    const y = random.range(0, size);
    const angle = random.angle();
    const length = bladeLength * random.range(0.5, 1.3);
    stampStroke(blades, size, x, y, x + Math.cos(angle) * length, y + Math.sin(angle) * length, 0.45, random.range(0.3, 1), 0.7, 'max');
    if (k % 3000 === 2999) yield;
  }
  yield;

  const soft = p.copy(blades);
  blurField(soft, Math.max(1, Math.round(0.012 * tpm)), 2);
  const { r, g, b, height, roughness } = p;
  const soil = parseColor(0x3a2c1e);
  const lush = parseColor(0x4f7a2a);
  const deep = parseColor(0x2c4a1c);
  const straw = parseColor(0xa8935a);
  for (let i = 0; i < count; i += 1) {
    const blade = blades[i];
    // Clumps: grass thins out where the mask is low, leaving soil.
    // (A lawn is nearly closed: with the default bareness only about a tenth of it thins at all,
    // or the bare spots draw a grid when the tile repeats.)
    const cover = clamp01((meso[i] * 1.4 + macro[i] * 0.8 + 1.5 - bare * 2.2) * 1.5);
    const dry = clamp01(dryness * 1.25 + macro[i] * 0.55 * (0.3 + dryness) + hue[i] * 0.35 * dryness);
    // Between the lit blades a watered lawn is deep green thatch, not soil; a dry one shows earth.
    const thatch = 0.62 * (1 - 0.6 * dryness);
    const t = cover * (thatch + (1 - thatch) * blade);
    const yellow = clamp01(0.5 + hue[i] * 0.9);
    // Green from deep to lush by blade brightness, then toward straw when dry.
    let cr = deep[0] + (lush[0] - deep[0]) * blade;
    let cg = deep[1] + (lush[1] - deep[1]) * blade;
    let cb = deep[2] + (lush[2] - deep[2]) * blade;
    cr *= 0.8 + 0.3 * yellow;
    cb *= 1.15 - 0.4 * yellow;
    cr += (straw[0] * (0.55 + 0.6 * blade) - cr) * dry;
    cg += (straw[1] * (0.55 + 0.6 * blade) - cg) * dry;
    cb += (straw[2] * (0.55 + 0.6 * blade) - cb) * dry;
    const shade = 1 + macro[i] * 0.12;
    r[i] = (soil[0] + (cr - soil[0]) * t) * shade;
    g[i] = (soil[1] + (cg - soil[1]) * t) * shade;
    b[i] = (soil[2] + (cb - soil[2]) * t) * shade;
    height[i] = (soft[i] * 0.02 + blade * 0.006) * cover + macro[i] * 0.012;
    roughness[i] = 0.9 - 0.12 * t * (1 - dry);
  }
  p.release(blades, soft);
  return yield* p.finish({
    normalStrength: 0.8,
    occlusionRadius: 3,
    occlusionDepth: 0.012,
    occlusionStrength: 0.7,
    cavityShade: 0.45,
    meanLuminance: 0.085 + 0.075 * dryness,
  });
}

/**
 * Paints bare earth: clods, pebbles and dust; with `wetness` it becomes mud, dark and glossy
 * with standing water in the hollows.
 * @param {ReturnType<import('./surfacePainter.js').createSurfacePainter>} p
 * @param {Object} [options]
 * @param {number | string} [options.color] sRGB colour of the dry soil.
 * @param {number} [options.wetness] 0 dry dirt to 1 wet mud (default 0).
 * @param {number} [options.pebbles] 0..1 amount of small stones (default 0.5).
 * @param {number} [options.ruts] 0..1 tyre ruts and footprints pressed into mud (default: wetness).
 */
export function* paintDirt(p, options = {}) {
  const size = p.size;
  const count = size * size;
  const tpm = p.texelsPerMetre;
  const random = p.random;
  const wetness = clamp01(options.wetness ?? 0);
  const pebbleAmount = clamp01(options.pebbles ?? 0.5);
  const color = parseColor(options.color ?? 0x8a7355);

  const macro = p.fractal(2, 6);
  const clods = p.fractal(12, 4, { label: 1, shape: 'billow' });
  const fine = p.fractal(48, 3, { label: 2 });
  const grain = fillWhiteNoise(p.field(), p.seed);
  const stones = p.cells(Math.min(220, Math.round(p.tileMetres / 0.03)), { label: 3 });
  const stoneTone = cellRandomField(stones.cell, stones.period * stones.period, p.seed + 5, p.field());
  yield;

  const { r, g, b, height, roughness } = p;
  for (let i = 0; i < count; i += 1) {
    const shade = (1 + macro[i] * 0.2 + fine[i] * 0.1) * (0.88 + 0.24 * grain[i]) * (0.8 + 0.4 * clods[i]);
    r[i] = color[0] * shade;
    g[i] = color[1] * shade;
    b[i] = color[2] * shade;
    height[i] = clods[i] * 0.012 + macro[i] * 0.015 + fine[i] * 0.0015 + grain[i] * 0.0006;
    roughness[i] = 0.94;
    // Pebbles: only some cells hold a stone, lighter and rounder than the soil.
    const tone = stoneTone[i];
    if (tone < pebbleAmount * 0.3) {
      let stone = (stones.second[i] - stones.nearest[i]) * 2.6 - 0.25;
      if (stone > 0) {
        stone = stone > 1 ? 1 : stone;
        const k = (tone * 31.7) % 1;
        const light = 0.16 + 0.3 * k;
        r[i] += (light * 1.02 - r[i]) * stone;
        g[i] += (light - g[i]) * stone;
        b[i] += (light * 0.94 - b[i]) * stone;
        height[i] += Math.sqrt(stone) * 0.006;
        roughness[i] -= 0.12 * stone;
      }
    }
  }
  p.release(grain, stoneTone);
  yield;

  const rutAmount = clamp01(options.ruts ?? wetness);
  if (rutAmount > 0) {
    // Tyre ruts: two parallel grooves with tread blocks, crossing the tile.
    const rut = p.field();
    const passes = Math.round(rutAmount * 2);
    for (let k = 0; k < passes; k += 1) {
      const horizontal = random.chance(0.5);
      const offset = random.range(0, size);
      for (const track of [-0.75, 0.75]) {
        const at = offset + track * tpm;
        for (let s = 0; s < size; s += 0.09 * tpm) {
          const wobble = Math.sin((s / size) * Math.PI * 2 * 2) * 0.05 * tpm;
          const cx = horizontal ? s : at + wobble;
          const cy = horizontal ? at + wobble : s;
          stampShape(rut, size, { x: cx, y: cy, halfWidth: 0.1 * tpm, halfHeight: 0.03 * tpm, angle: (horizontal ? Math.PI / 2 : 0) + 0.5, kind: 'box', soft: 0.02 * tpm, value: 0.9 });
        }
      }
    }
    for (let i = 0; i < count; i += 1) height[i] -= rut[i] * 0.02;
    p.release(rut);
  }
  if (wetness > 0) {
    // Water darkens the soil and stands in the lowest places.
    const level = p.copy(height);
    blurField(level, Math.max(2, Math.round(0.02 * tpm)), 2);
    let low = Infinity;
    let high = -Infinity;
    for (let i = 0; i < count; i += 1) {
      if (level[i] < low) low = level[i];
      if (level[i] > high) high = level[i];
    }
    const waterLine = low + (high - low) * (0.25 + 0.3 * wetness);
    const span = (high - low) * 0.08 || 1;
    for (let i = 0; i < count; i += 1) {
      const puddle = clamp01((waterLine - level[i]) / span);
      const wet = clamp01(wetness * 1.2);
      r[i] *= 1 - 0.55 * wet;
      g[i] *= 1 - 0.58 * wet;
      b[i] *= 1 - 0.62 * wet;
      roughness[i] += (0.42 - roughness[i]) * wet * 0.8;
      roughness[i] += (0.06 - roughness[i]) * puddle * wet;
      if (puddle > 0) height[i] += (waterLine - height[i]) * puddle * wet;
      r[i] *= 1 - 0.3 * puddle * wet;
      g[i] *= 1 - 0.3 * puddle * wet;
      b[i] *= 1 - 0.28 * puddle * wet;
    }
    p.release(level);
  }
  yield;
  return yield* p.finish({
    normalStrength: 1,
    occlusionRadius: 5,
    occlusionDepth: 0.012,
    occlusionStrength: 0.65,
    cavityShade: 0.35,
    meanLuminance: 0.14 - 0.08 * wetness,
  });
}

/**
 * Paints gravel: rounded stones of two sizes, each with its own tone, lying in dark gaps.
 * @param {ReturnType<import('./surfacePainter.js').createSurfacePainter>} p
 * @param {Object} [options]
 * @param {Array<number | string>} [options.colors] sRGB stone colours.
 * @param {number} [options.stoneMetres] Mean stone size (default 0.03).
 * @param {number} [options.luminance] Mean albedo (default 0.25).
 */
export function* paintGravel(p, options = {}) {
  const size = p.size;
  const count = size * size;
  const colors = (options.colors ?? [0xb9b2a4, 0x8f897d, 0xc9c0ae, 0x6e6a62, 0xa8947a, 0xd6d0c4]).map(parseColor);
  const stoneMetres = options.stoneMetres ?? 0.03;
  const period = Math.max(6, Math.min(250, Math.round(p.tileMetres / stoneMetres), Math.floor(size / 5)));
  const big = p.cells(period);
  const small = p.cells(Math.min(250, period * 2), { label: 1 });
  const bigTone = cellRandomField(big.cell, big.period * big.period, p.seed, p.field());
  const smallTone = cellRandomField(small.cell, small.period * small.period, p.seed + 9, p.field());
  const macro = p.fractal(2, 5);
  const grain = fillWhiteNoise(p.field(), p.seed);
  yield;

  const { r, g, b, height, roughness } = p;
  const colorCount = colors.length;
  const bigHeight = stoneMetres * 0.4;
  for (let i = 0; i < count; i += 1) {
    // Large stones where their cell says so, small ones filling the rest.
    let stone = (big.second[i] - big.nearest[i]) * 2.4 - 0.12;
    let tone = bigTone[i];
    let lift = bigHeight;
    if (tone < 0.35 || stone <= 0) {
      stone = (small.second[i] - small.nearest[i]) * 2.4 - 0.1;
      tone = smallTone[i];
      lift = bigHeight * 0.5;
    }
    stone = stone < 0 ? 0 : stone > 1 ? 1 : stone;
    const dome = Math.sqrt(stone);
    const color = colors[Math.min(colorCount - 1, Math.floor(((tone * 17.3) % 1) * colorCount))];
    const shade = (0.72 + 0.5 * ((tone * 5.1) % 1)) * (0.9 + 0.2 * grain[i]) * (1 + macro[i] * 0.1) * (0.35 + 0.65 * dome);
    r[i] = color[0] * shade;
    g[i] = color[1] * shade;
    b[i] = color[2] * shade;
    height[i] = dome * lift * (0.6 + 0.8 * ((tone * 3.7) % 1)) + macro[i] * 0.004;
    roughness[i] = 0.9 - 0.14 * dome * ((tone * 7.9) % 1);
  }
  p.release(bigTone, smallTone, grain);
  yield;
  return yield* p.finish({
    normalStrength: 1,
    occlusionRadius: 3,
    occlusionDepth: stoneMetres * 0.25,
    occlusionStrength: 0.75,
    cavityShade: 0.4,
    meanLuminance: options.luminance ?? 0.25,
  });
}

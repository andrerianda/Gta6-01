// Facades with glass: a glazed curtain wall (vision panes, spandrel panels, aluminium mullions)
// and a plastered wall with punched windows. Both come with an emissive map of lit windows for
// the night, in which every pane is lit or dark on its own, warm or cool, with blinds and a
// brighter ceiling zone. Glass is painted the way a physically based renderer needs it: a
// mid-tone base colour, metalness 1 and a roughness of at most 0.08, so that it mirrors the
// sky; every pane is tilted and pillowed a little in the normal map, which is what makes a
// glass tower shimmer pane by pane instead of reading as one flat mirror.
//
//   getSurfaceMaterial('curtainWall', { tint: 0x7fa6b8 })    // 8 bays x 8 floors per tile
//   getSurfaceMaterial('windowedFacade', { tint: 0xf3e3b5 }) // pastel wall, 4 x 4 windows
//   material.emissiveIntensity = nightFactor * 1.2;          // the game switches the lights on

import { hashGridCell } from '../../../core/random/coordinateHash.js';
import { parseColor } from '../colorMath.js';
import { fillWhiteNoise } from '../noise/whiteNoise.js';

const unit = (a, b, seed) => hashGridCell(a, b, seed) / 4294967296;

/**
 * Paints a glazed curtain wall. The tile covers `bays` x `floors` panes; give its real size
 * to the painter as [bays * bayMetres, floors * floorMetres].
 * @param {ReturnType<import('./surfacePainter.js').createSurfacePainter>} p
 * @param {Object} [options]
 * @param {number} [options.bays] Panes across the tile (default 8).
 * @param {number} [options.floors] Storeys up the tile (default 8).
 * @param {number | string} [options.glassColor] sRGB reflectance colour of the glass (mid-tone).
 * @param {number | string} [options.frameColor] sRGB colour of the mullions.
 * @param {number} [options.spandrel] Fraction of each storey taken by the opaque spandrel
 *   panel at the floor slab (default 0.27; 0 for floor-to-ceiling glass).
 * @param {number} [options.mullionMetres] Width of the mullions (default 0.07).
 * @param {number} [options.litFraction] Share of panes lit at night (default 0.45).
 * @param {number} [options.distortion] 0..1 pane tilt and pillowing (default 0.6).
 */
export function* paintCurtainWall(p, options = {}) {
  const size = p.size;
  const bays = options.bays ?? 8;
  const floors = options.floors ?? 8;
  const glass = parseColor(options.glassColor ?? 0x7d95a0);
  const frame = parseColor(options.frameColor ?? 0x9a9da0);
  const spandrel = options.spandrel ?? 0.27;
  const litFraction = options.litFraction ?? 0.45;
  const distortion = options.distortion ?? 0.6;
  const seed = p.seed;
  const bayTexels = size / bays;
  const floorTexels = size / floors;
  const mullionX = Math.max(1, ((options.mullionMetres ?? 0.07) * p.texelsPerMetre) / 2);
  const mullionY = Math.max(1, ((options.mullionMetres ?? 0.07) * p.texelsPerMetreY) / 2);
  const bayMetres = p.tileMetres / bays;
  const floorMetres = p.tileMetresY / floors;
  const grain = fillWhiteNoise(p.field(), seed);
  const smudge = p.fractal(6, 4);

  const { r, g, b, height, roughness } = p;
  const metalness = p.metalnessField();
  const glow = p.emissiveFields();
  for (let y = 0; y < size; y += 1) {
    const floor = Math.min(floors - 1, Math.floor((y + 0.5) / floorTexels));
    const fv = (y + 0.5) / floorTexels - floor;
    const inSpandrel = fv < spandrel;
    // Distance in texels to the nearest horizontal frame member: the floor lines and the
    // transom between spandrel and vision glass.
    const toTransom = Math.min(fv, 1 - fv, spandrel > 0 ? Math.abs(fv - spandrel) : 1) * floorTexels;
    // Position within the pane (spandrel or vision), 0..1 upward.
    const paneV = inSpandrel ? fv / spandrel : (fv - spandrel) / (1 - spandrel);
    const floorMood = unit(floor, 301, seed);
    for (let x = 0; x < size; x += 1) {
      const i = y * size + x;
      const bay = Math.min(bays - 1, Math.floor((x + 0.5) / bayTexels));
      const fu = (x + 0.5) / bayTexels - bay;
      const toMullion = Math.min(fu, 1 - fu) * bayTexels;
      const isFrame = toMullion < mullionX || toTransom < mullionY;
      const pane = floor * bays + bay + (inSpandrel ? 4096 : 0);
      if (isFrame) {
        const shade = 0.9 + 0.2 * grain[i];
        r[i] = frame[0] * shade;
        g[i] = frame[1] * shade;
        b[i] = frame[2] * shade;
        height[i] = 0.03;
        roughness[i] = 0.42;
        metalness[i] = 1;
        continue;
      }
      // Each pane has its own slight tint, tilt and pillow.
      const tone = 0.9 + 0.2 * unit(pane, 1, seed);
      const tiltX = (unit(pane, 2, seed) - 0.5) * 0.05 * distortion;
      const tiltY = (unit(pane, 3, seed) - 0.5) * 0.05 * distortion;
      const pillow = (unit(pane, 4, seed) - 0.35) * 0.012 * distortion;
      const du = fu - 0.5;
      const dv = paneV - 0.5;
      height[i] = tiltX * du * bayMetres + tiltY * dv * floorMetres * (inSpandrel ? spandrel : 1 - spandrel) + pillow * (1 - 4 * du * du) * (1 - 4 * dv * dv);
      const dark = inSpandrel ? 0.72 : 1;
      r[i] = glass[0] * tone * dark;
      g[i] = glass[1] * tone * dark;
      b[i] = glass[2] * tone * dark;
      roughness[i] = (inSpandrel ? 0.1 : 0.045) + Math.max(0, smudge[i]) * 0.05;
      metalness[i] = 1;
      if (inSpandrel) continue;
      // Night: whole floors tend to be lit or dark together; each lit pane has its own colour.
      const chance = litFraction + (floorMood - 0.5) * 0.7;
      if (unit(pane, 5, seed) < chance) {
        const kind = unit(pane, 6, seed);
        const power = 0.35 + 0.65 * unit(pane, 7, seed);
        const blind = unit(pane, 8, seed);
        // Brighter toward the ceiling where the lamps are; a lowered blind dims the top part.
        let level = power * (0.5 + 0.5 * paneV * paneV);
        if (blind < 0.35 && paneV > 1 - blind * 1.6) level *= 0.45;
        // Partitions and furniture break the pane into thirds of different brightness.
        level *= 0.75 + 0.25 * unit(pane * 3 + Math.floor(fu * 3), 9, seed);
        const warm = kind < 0.62;
        glow.r[i] = level * (warm ? 1 : kind < 0.9 ? 0.78 : 0.45);
        glow.g[i] = level * (warm ? 0.78 : kind < 0.9 ? 0.88 : 0.62);
        glow.b[i] = level * (warm ? 0.5 : kind < 0.9 ? 1 : 1);
      }
    }
  }
  p.release(grain);
  yield;
  return yield* p.finish({ normalStrength: 1, occlusionRadius: 2, occlusionDepth: 0.03, occlusionStrength: 0.5, cavityShade: 0.15, minRoughness: 0.03 });
}

/**
 * Paints a plastered wall with a regular grid of punched windows: recessed glass in a frame,
 * a projecting sill with a grime streak under it. Neutral wall colour: tint it with the
 * material colour. Give the painter the real size [bays * bayMetres, floors * floorMetres].
 * @param {ReturnType<import('./surfacePainter.js').createSurfacePainter>} p
 * @param {Object} [options]
 * @param {number} [options.bays] Windows across the tile (default 4).
 * @param {number} [options.floors] Storeys up the tile (default 4).
 * @param {number} [options.windowWidth] Window width as a fraction of the bay (default 0.48).
 * @param {number} [options.windowHeight] Window height as a fraction of the storey (default 0.5).
 * @param {number | string} [options.glassColor] sRGB reflectance colour of the glass.
 * @param {number | string} [options.frameColor] sRGB colour of the window frames.
 * @param {number} [options.litFraction] Share of windows lit at night (default 0.4).
 * @param {number} [options.weathering] 0..1 streaks under the sills and wall mottling (default 0.5).
 */
export function* paintWindowedFacade(p, options = {}) {
  const size = p.size;
  const bays = options.bays ?? 4;
  const floors = options.floors ?? 4;
  const windowWidth = options.windowWidth ?? 0.48;
  const windowHeight = options.windowHeight ?? 0.5;
  const glass = parseColor(options.glassColor ?? 0x70848c);
  const frame = parseColor(options.frameColor ?? 0xe6e2d8);
  const litFraction = options.litFraction ?? 0.4;
  const weathering = options.weathering ?? 0.5;
  const seed = p.seed;
  const bayTexels = size / bays;
  const floorTexels = size / floors;
  const frameX = Math.max(1.2, 0.06 * p.texelsPerMetre);
  const frameY = Math.max(1.2, 0.06 * p.texelsPerMetreY);
  const sillTexels = Math.max(2, 0.07 * p.texelsPerMetreY);
  const sillBottom = 0.5 - windowHeight / 2 + 0.04;

  const macro = p.fractal(2, 5);
  const sweeps = p.fractal(10, 4, { label: 1, shape: 'billow' });
  const streaks = p.fractal(Math.min(size / 8, 40), 3, { label: 3, periodY: 2 });
  const grain = fillWhiteNoise(p.field(), seed);

  const { r, g, b, height, roughness } = p;
  const metalness = p.metalnessField();
  const glow = p.emissiveFields();
  for (let y = 0; y < size; y += 1) {
    const floor = Math.min(floors - 1, Math.floor((y + 0.5) / floorTexels));
    const fv = (y + 0.5) / floorTexels - floor;
    // Signed distance in texels to the window opening along v (negative inside).
    const outsideV = (Math.abs(fv - (sillBottom + windowHeight / 2)) - windowHeight / 2) * floorTexels;
    const belowSill = (sillBottom - fv) * floorTexels;
    for (let x = 0; x < size; x += 1) {
      const i = y * size + x;
      const bay = Math.min(bays - 1, Math.floor((x + 0.5) / bayTexels));
      const fu = (x + 0.5) / bayTexels - bay;
      const outsideU = (Math.abs(fu - 0.5) - windowWidth / 2) * bayTexels;
      const pane = floor * bays + bay;
      if (outsideU < 0 && outsideV < 0) {
        const inFrame = outsideU > -frameX || outsideV > -frameY || Math.abs(fu - 0.5) * bayTexels < frameX * 0.4;
        if (inFrame) {
          const shade = 0.92 + 0.16 * grain[i];
          r[i] = frame[0] * shade;
          g[i] = frame[1] * shade;
          b[i] = frame[2] * shade;
          height[i] = -0.05;
          roughness[i] = 0.5;
          metalness[i] = 0;
          continue;
        }
        const tone = 0.88 + 0.24 * unit(pane, 1, seed);
        const paneU = (fu - 0.5) / windowWidth;
        const paneV = (fv - sillBottom) / windowHeight;
        const tiltX = (unit(pane, 2, seed) - 0.5) * 0.03;
        const tiltY = (unit(pane, 3, seed) - 0.5) * 0.03;
        height[i] = -0.09 + tiltX * paneU * 1.2 + tiltY * (paneV - 0.5) * 1.4;
        r[i] = glass[0] * tone;
        g[i] = glass[1] * tone;
        b[i] = glass[2] * tone;
        roughness[i] = 0.05 + 0.03 * grain[i];
        metalness[i] = 1;
        if (unit(pane, 5, seed) < litFraction) {
          const kind = unit(pane, 6, seed);
          const curtain = unit(pane, 8, seed);
          let level = (0.35 + 0.65 * unit(pane, 7, seed)) * (0.55 + 0.45 * paneV);
          // Curtains half drawn: one side of the window is dimmer and warmer.
          if (curtain < 0.5 && (paneU + 0.5 < curtain * 0.9) === (curtain < 0.25)) level *= 0.4;
          const warm = kind < 0.72;
          glow.r[i] = level * (warm ? 1 : kind < 0.92 ? 0.8 : 0.4);
          glow.g[i] = level * (warm ? 0.76 : kind < 0.92 ? 0.9 : 0.6);
          glow.b[i] = level * (warm ? 0.46 : 1);
        }
        continue;
      }
      // The wall, with a sill under each window and the streak that runs down from it.
      const underWindow = outsideU < sillTexels * 0.6;
      const isSill = underWindow && belowSill >= 0 && belowSill < sillTexels;
      let streak = Math.max(0, streaks[i] * 1.5 + macro[i] * 0.5) * weathering;
      if (underWindow && belowSill >= sillTexels) {
        const fade = 1 - (belowSill - sillTexels) / (floorTexels * 0.42);
        if (fade > 0) streak += fade * fade * weathering * (0.35 + 0.5 * Math.max(0, streaks[i] + 0.3));
      }
      if (streak > 1) streak = 1;
      const shade = (1 + macro[i] * 0.07) * (0.965 + 0.07 * grain[i]) * (1 - 0.2 * streak) * (0.97 + 0.06 * sweeps[i]);
      r[i] = 0.72 * shade;
      g[i] = 0.72 * shade * (1 - 0.012 * streak);
      b[i] = 0.72 * shade * (1 - 0.045 * streak);
      // The wall rounds into the window reveal over a few texels.
      const reveal = Math.min(1, Math.max(0, Math.max(outsideU, outsideV)) / 2);
      height[i] = (isSill ? 0.04 : 0) + sweeps[i] * 0.0018 + grain[i] * 0.001 - 0.05 * (1 - reveal);
      roughness[i] = isSill ? 0.75 : 0.9 - 0.05 * streak;
      metalness[i] = 0;
    }
  }
  p.release(grain);
  yield;
  return yield* p.finish({ normalStrength: 1, occlusionRadius: 3, occlusionDepth: 0.05, occlusionStrength: 0.6, cavityShade: 0.25, ceiling: 0.88, minRoughness: 0.03 });
}

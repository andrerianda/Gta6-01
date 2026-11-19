// The catalogue of tileable physically based surfaces: every surface the toolkit can paint, by
// name, with its real-world tile size, its default resolution and how it behaves in the rain.
// This module is plain data and typed arrays (no three.js, no canvas), so it also runs in tests
// and workers; surfaceMaterials.js turns the maps into textures and materials.
//
//   const maps = generateSurfaceMaps('asphaltOld');                    // { color, normal, orm, ... }
//   const job = createSurfaceJob('pavingSlabs', { seed: 7 });          // sliced across frames:
//   while (!job.step(4)) await nextFrame();                            //   4 ms per call
//   job.maps
//
// Generation time and memory. Measured in Node 22 on one shared core of the 4-core build
// machine, cold noise cache / warm noise cache; a desktop browser is about twice as fast.
// A map set is three RGBA8 maps (colour, normal, occlusion-roughness-metalness), 4 MB of
// texture memory at 512 with mipmaps and 16 MB at 1024; the pixel arrays are dropped after
// upload. SURFACE_TIMINGS_MS below is written from the same measurement (tools/tests/textures/
// timing run prints it again).
//
// Sizes: asphalt is 1024 over 4 m (3.9 mm per texel: it is what the camera looks at most), and
// over 8 m for the old and patched roads, whose repair patches and long cracks would show their
// repeat on a 4 m tile; road paint decals are 256; everything else is 512. The whole default set of 29 surfaces is about 150 MB of texture
// memory at full detail and 38 MB at detail scale 0.5; a street scene uses 8 to 12 of them.

import { resolveTextureSize } from '../textureQuality.js';
import { paintCurtainWall, paintWindowedFacade } from './glazingSurfaces.js';
import { paintDirt, paintGrass, paintGravel, paintSand } from './naturalGroundSurfaces.js';
import { paintPouredConcrete, paintTiledPaving, TILED_PAVING_PRESETS } from './pavementSurfaces.js';
import { paintRoadMarking, ROAD_MARKING_TILES, ROAD_PAINT_COLORS } from './roadMarkingSurfaces.js';
import { ASPHALT_PRESETS, paintAsphalt } from './roadSurfaces.js';
import { paintCorrugatedMetal, paintFlatRoof, paintRoofTiles } from './roofAndMetalSurfaces.js';
import { createSurfacePainter } from './surfacePainter.js';
import { paintBrick, paintConcreteWall, paintStucco } from './wallSurfaces.js';
import { paintPlanks } from './woodSurfaces.js';

/**
 * @typedef {Object} SurfaceDefinition
 * @property {(painter: any, options: Object) => Generator} paint The recipe.
 * @property {number | ((options: Object) => number | [number, number])} tileMetres Real size
 *   of one tile, or a function of the options for surfaces whose tile depends on them.
 * @property {number} size Default resolution (before the global detail scale).
 * @property {Object} [defaults] Default recipe options.
 * @property {'ground' | 'wall' | 'roof'} use Where the surface lies (sets anisotropy and UVs).
 * @property {{porosity: number, puddles: boolean}} wet How it responds to rain (applyWetSurface).
 * @property {'aggregate' | 'grain' | 'fibre' | null} detail The close-up detail layer that
 *   suits it (see surfaceDetailShader.js), or null for none.
 * @property {boolean} [tintable] True when the maps are a light neutral meant to be tinted by
 *   the material colour.
 * @property {boolean} [emissive] True when the surface has an emissive map (lit windows).
 * @property {boolean} [decal] True when the colour map's alpha is coverage and the surface is
 *   laid over another one (road paint).
 * @property {string} description
 */

const glazingTile = (bayMetres, floorMetres, bays, floors) => (options) => [
  (options.bays ?? bays) * (options.bayMetres ?? bayMetres),
  (options.floors ?? floors) * (options.floorMetres ?? floorMetres),
];

/** A road-paint decal entry: its tile is [metres along the line, metres across] (see roadMarkingSurfaces.js). */
const marking = (kind, defaults, description) => ({
  paint: paintRoadMarking,
  tileMetres: (options) => ROAD_MARKING_TILES[kind](options),
  size: 256,
  defaults: { kind, ...defaults },
  use: 'ground',
  decal: true,
  wet: { porosity: 0.3, puddles: false },
  detail: null,
  description,
});

/** @type {Readonly<Record<string, SurfaceDefinition>>} */
export const SURFACE_CATALOG = Object.freeze({
  // Road paint: decals with alpha, laid over the road (u along the line, v across it).
  markingSolidLine: marking('solidLine', {}, 'A solid white edge or lane line, 15 cm; tile 4 m x 0.3 m.'),
  markingDashedLine: marking('dashedLine', {}, 'A dashed white lane line: 3 m dash, 6 m gap; tile 9 m x 0.3 m.'),
  markingDoubleYellow: marking('doubleLine', { color: ROAD_PAINT_COLORS.yellow }, 'A double yellow centre line; tile 4 m x 0.5 m.'),
  markingStopBar: marking('stopBar', {}, 'A stop bar, 50 cm; tile 4 m x 0.6 m.'),
  markingCrosswalk: marking('crosswalk', { wear: 0.45 }, 'A zebra crossing: 50 cm stripes; tile 1 m (along the kerb) x 3 m (across the walk).'),
  markingArrow: marking('arrow', {}, 'A lane arrow pointing along +v (turn: straight, left, right); one 1.6 m x 4 m quad, not tiled.'),
  // Roads.
  asphalt: { paint: paintAsphalt, tileMetres: 4, size: 1024, defaults: ASPHALT_PRESETS.worn, use: 'ground', wet: { porosity: 1, puddles: true }, detail: 'aggregate', description: 'An ordinary street: grey asphalt with exposed aggregate, a few cracks and stains.' },
  asphaltFresh: { paint: paintAsphalt, tileMetres: 4, size: 1024, defaults: ASPHALT_PRESETS.fresh, use: 'ground', wet: { porosity: 0.9, puddles: true }, detail: 'aggregate', description: 'A new overlay: nearly black, stones still coated.' },
  asphaltOld: { paint: paintAsphalt, tileMetres: 8, size: 1024, defaults: ASPHALT_PRESETS.old, use: 'ground', wet: { porosity: 1, puddles: true }, detail: 'aggregate', description: 'An old road: bleached, ravelled, cracked and tar-sealed, with alligator cracking.' },
  asphaltPatched: { paint: paintAsphalt, tileMetres: 8, size: 1024, defaults: ASPHALT_PRESETS.patched, use: 'ground', wet: { porosity: 1, puddles: true }, detail: 'aggregate', description: 'A street dug up and repaired many times: dark patches with tar seams.' },
  // Paved ground.
  pavingSlabs: { paint: paintTiledPaving, tileMetres: 2.4, size: 512, defaults: TILED_PAVING_PRESETS.pavingSlabs, use: 'ground', wet: { porosity: 0.9, puddles: true }, detail: 'grain', description: 'Concrete paving slabs, 60 cm, with dirty joints, stains and chewing gum.' },
  plazaPavers: { paint: paintTiledPaving, tileMetres: 2.4, size: 512, defaults: TILED_PAVING_PRESETS.plazaPavers, use: 'ground', wet: { porosity: 0.8, puddles: true }, detail: 'grain', description: 'Clay brick pavers in running bond.' },
  plazaStone: { paint: paintTiledPaving, tileMetres: 2.4, size: 512, defaults: TILED_PAVING_PRESETS.plazaStone, use: 'ground', wet: { porosity: 0.6, puddles: true }, detail: 'grain', description: 'Honed light stone tiles in several tones.' },
  plazaTerrazzo: { paint: paintTiledPaving, tileMetres: 2.4, size: 512, defaults: TILED_PAVING_PRESETS.plazaTerrazzo, use: 'ground', wet: { porosity: 0.3, puddles: true }, detail: null, description: 'Polished terrazzo slabs with stone chips.' },
  kerbStone: { paint: paintTiledPaving, tileMetres: 2, size: 512, defaults: TILED_PAVING_PRESETS.kerbStone, use: 'ground', wet: { porosity: 0.9, puddles: false }, detail: 'grain', description: 'Concrete kerb stones, 1 m long along u.' },
  concrete: { paint: paintPouredConcrete, tileMetres: 4, size: 512, use: 'ground', wet: { porosity: 0.9, puddles: true }, detail: 'grain', description: 'Poured concrete with tooled joints and a broom finish.' },
  // Unpaved ground.
  sand: { paint: paintSand, tileMetres: 3, size: 512, use: 'ground', wet: { porosity: 0.8, puddles: false }, detail: 'grain', description: 'Dry beach sand with wind ripples and footprints.' },
  sandWet: { paint: paintSand, tileMetres: 3, size: 512, defaults: { wetness: 1, footprints: 0.3 }, use: 'ground', wet: { porosity: 0.2, puddles: false }, detail: 'grain', description: 'Wet sand at the water line: dark and glossy.' },
  grass: { paint: paintGrass, tileMetres: 3, size: 512, use: 'ground', wet: { porosity: 0.3, puddles: false }, detail: 'fibre', description: 'A watered lawn.' },
  grassDry: { paint: paintGrass, tileMetres: 3, size: 512, defaults: { dryness: 0.85 }, use: 'ground', wet: { porosity: 0.4, puddles: false }, detail: 'fibre', description: 'Sun-burnt scrub grass with bare soil.' },
  dirt: { paint: paintDirt, tileMetres: 3, size: 512, use: 'ground', wet: { porosity: 1, puddles: true }, detail: 'grain', description: 'Bare earth with clods and pebbles.' },
  mud: { paint: paintDirt, tileMetres: 3, size: 512, defaults: { wetness: 1, color: 0x6e5a44, pebbles: 0.2 }, use: 'ground', wet: { porosity: 0.3, puddles: true }, detail: null, description: 'Wet mud with tyre ruts and standing water.' },
  gravel: { paint: paintGravel, tileMetres: 2, size: 512, use: 'ground', wet: { porosity: 0.7, puddles: false }, detail: 'aggregate', description: 'Loose gravel of mixed stone.' },
  dockPlanks: { paint: paintPlanks, tileMetres: 2.4, size: 512, use: 'ground', wet: { porosity: 0.8, puddles: false }, detail: 'fibre', description: 'Weathered dock and boardwalk planks running along u.' },
  // Walls.
  stucco: { paint: paintStucco, tileMetres: 4, size: 512, use: 'wall', wet: { porosity: 0.5, puddles: false }, detail: 'grain', tintable: true, description: 'Painted stucco, neutral: tint it to any pastel.' },
  stuccoWeathered: { paint: paintStucco, tileMetres: 4, size: 512, defaults: { weathering: 1, trowel: 0.7, patches: 0.8 }, use: 'wall', wet: { porosity: 0.6, puddles: false }, detail: 'grain', tintable: true, description: 'Old stucco: streaked, cracked and patched.' },
  concreteWall: { paint: paintConcreteWall, tileMetres: 4.8, size: 512, use: 'wall', wet: { porosity: 0.8, puddles: false }, detail: 'grain', tintable: true, description: 'Cast concrete with formwork joints and tie holes.' },
  brick: { paint: paintBrick, tileMetres: 1.8, size: 512, use: 'wall', wet: { porosity: 0.7, puddles: false }, detail: 'grain', description: 'Brickwork in running bond.' },
  curtainWall: { paint: paintCurtainWall, tileMetres: glazingTile(1.5, 3.6, 8, 8), size: 512, use: 'wall', wet: { porosity: 0, puddles: false }, detail: null, tintable: true, emissive: true, description: 'Glazed curtain wall with spandrels and an emissive map of lit panes.' },
  windowedFacade: { paint: paintWindowedFacade, tileMetres: glazingTile(3.2, 3.2, 4, 4), size: 512, use: 'wall', wet: { porosity: 0.5, puddles: false }, detail: null, tintable: true, emissive: true, description: 'Plastered wall with punched windows, sills and lit windows at night.' },
  // Roofs and sheet metal.
  roofTiles: { paint: paintRoofTiles, tileMetres: 2, size: 512, use: 'roof', wet: { porosity: 0.6, puddles: false }, detail: 'grain', description: 'Terracotta barrel tiles; courses run down v.' },
  flatRoof: { paint: paintFlatRoof, tileMetres: 4, size: 512, use: 'roof', wet: { porosity: 0.7, puddles: true }, detail: 'grain', tintable: true, description: 'Bitumen membrane flat roof with seams and ponding stains.' },
  corrugatedMetal: { paint: paintCorrugatedMetal, tileMetres: 2.28, size: 512, use: 'wall', wet: { porosity: 0.1, puddles: false }, detail: null, tintable: true, description: 'Painted corrugated sheet with rust runs; ribs along v.' },
  galvanisedMetal: { paint: paintCorrugatedMetal, tileMetres: 2.28, size: 512, defaults: { finish: 'galvanised', rust: 0.3 }, use: 'wall', wet: { porosity: 0, puddles: false }, detail: null, description: 'Galvanised corrugated sheet with spangle and rust.' },
});

/** The names of every surface in the catalogue. @returns {string[]} */
export function listSurfaceNames() {
  return Object.keys(SURFACE_CATALOG);
}

/**
 * Resolves a request for a surface into what will actually be generated: the definition, the
 * merged options, the resolution after the global detail scale, and a cache key.
 * @param {string} name A key of SURFACE_CATALOG.
 * @param {Object} [options] Recipe options, plus `seed`, `size` (nominal resolution) and
 *   `tileMetres` overrides.
 * @returns {{name: string, definition: SurfaceDefinition, options: Object, size: number,
 *   tileMetres: number | [number, number], seed: number | string, key: string}}
 */
export function resolveSurfaceRequest(name, options = {}) {
  const definition = SURFACE_CATALOG[name];
  if (!definition) throw new Error(`unknown surface "${name}"; known: ${listSurfaceNames().join(', ')}`);
  const merged = { ...definition.defaults, ...options };
  const size = resolveTextureSize(merged.size ?? definition.size);
  const tileMetres = merged.tileMetres ?? (typeof definition.tileMetres === 'function' ? definition.tileMetres(merged) : definition.tileMetres);
  const seed = merged.seed ?? 1;
  delete merged.size;
  delete merged.tileMetres;
  delete merged.seed;
  const sorted = Object.keys(merged).sort().map((key) => `${key}=${JSON.stringify(merged[key])}`).join(',');
  return { name, definition, options: merged, size, tileMetres, seed, key: `${name}|${size}|${tileMetres}|${seed}|${sorted}` };
}

/**
 * Starts generating a surface in slices. Each call of `step` runs recipe steps until the
 * budget is used up (a step is a few milliseconds at 512; one step always runs).
 * @param {string} name
 * @param {Object} [options] See resolveSurfaceRequest.
 * @returns {{key: string, name: string, done: boolean, maps: import('./surfacePainter.js').SurfaceMaps | null,
 *   step: (budgetMilliseconds?: number) => boolean, cancel: () => void}} `step` returns true
 *   when the surface is finished and `maps` is set.
 */
export function createSurfaceJob(name, options = {}) {
  const request = resolveSurfaceRequest(name, options);
  const painter = createSurfacePainter(request.size, request.tileMetres, request.seed);
  const recipe = request.definition.paint(painter, request.options);
  const job = {
    key: request.key,
    name,
    done: false,
    maps: null,
    step: (budgetMilliseconds = Infinity) => {
      if (job.done) return true;
      const start = now();
      do {
        const result = recipe.next();
        if (result.done) {
          job.maps = result.value;
          job.done = true;
          return true;
        }
      } while (now() - start < budgetMilliseconds);
      return false;
    },
    cancel: () => {
      if (job.done) return;
      job.done = true;
      painter.dispose();
    },
  };
  return job;
}

/**
 * Generates a surface's maps at once.
 * @param {string} name
 * @param {Object} [options] See resolveSurfaceRequest.
 * @returns {import('./surfacePainter.js').SurfaceMaps}
 */
export function generateSurfaceMaps(name, options = {}) {
  const job = createSurfaceJob(name, options);
  job.step(Infinity);
  return job.maps;
}

/** A monotonic clock in milliseconds, used only to slice work (never for content). */
function now() {
  return typeof performance !== 'undefined' ? performance.now() : 0;
}

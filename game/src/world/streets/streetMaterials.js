// The materials of Marazul's streets, taken from the surface library (render/textures/) so they
// share its painted maps, metre UVs and wet look in the rain: asphalt, the dirt of unpaved
// tracks, kerb stone, paving slabs, the planted median, verges and the concrete of bridges.
// Grass, dirt and concrete use the same paintings as the terrain's ground blend. The asphalt is
// the library's 8 m tile, aged like an ordinary worn street, with the anti-repeat of
// asphaltVariation.js on top.

import { applyAsphaltVariation } from './asphaltVariation.js';

/** The asphalt painting: [surface name, options]. */
export const STREET_ASPHALT = ['asphaltOld', { seed: 11, age: 0.55, cracks: 0.3, sealed: 0.3, patches: 0.2, alligator: 0.05, stains: 0.45 }];

/**
 * Creates (or fetches from the library's cache) every street material, painting what is new;
 * the asphalt, kerb, paving and verge are only requested (citySectors.js has the library's
 * worker paint them while the city loads: their maps fill in place).
 * @param {ReturnType<import('../../render/textures/surfaceMaterials.js').createSurfaceLibrary>} surfaces
 * @returns {Record<'asphalt'|'dirtRoad'|'kerb'|'pavement'|'verge'|'median'|'concrete', import('three').MeshStandardMaterial>}
 */
export function createStreetMaterials(surfaces) {
  return {
    asphalt: applyAsphaltVariation(surfaces.requestMaterial(STREET_ASPHALT[0], STREET_ASPHALT[1])),
    dirtRoad: surfaces.getMaterial('dirt'),
    kerb: surfaces.requestMaterial('kerbStone', { seed: 3 }),
    pavement: surfaces.requestMaterial('pavingSlabs', { seed: 7 }),
    verge: surfaces.requestMaterial('grassDry', { seed: 9 }),
    median: surfaces.getMaterial('grass'),
    concrete: surfaces.getMaterial('concrete'),
  };
}

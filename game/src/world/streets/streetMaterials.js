// The materials of Marazul's streets, taken from the surface library (render/textures/) so they
// share its painted maps, metre UVs and wet look in the rain: asphalt, the dirt of unpaved
// tracks, kerb stone, paving slabs, the planted median, verges and the concrete of bridges.
// Grass, dirt and concrete use the same paintings as the terrain's ground blend.

/**
 * Creates (or fetches from the library's cache) every street material, painting what is new.
 * @param {ReturnType<import('../../render/textures/surfaceMaterials.js').createSurfaceLibrary>} surfaces
 * @returns {Record<'asphalt'|'dirtRoad'|'kerb'|'pavement'|'verge'|'median'|'concrete', import('three').MeshStandardMaterial>}
 */
export function createStreetMaterials(surfaces) {
  return {
    asphalt: surfaces.getMaterial('asphalt', { seed: 11 }),
    dirtRoad: surfaces.getMaterial('dirt'),
    kerb: surfaces.getMaterial('kerbStone', { seed: 3 }),
    pavement: surfaces.getMaterial('pavingSlabs', { seed: 7 }),
    verge: surfaces.getMaterial('grassDry', { seed: 9 }),
    median: surfaces.getMaterial('grass'),
    concrete: surfaces.getMaterial('concrete'),
  };
}

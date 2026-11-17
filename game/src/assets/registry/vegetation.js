// Vegetation: palms, trees, shrubs. Written by hand (see index.js).

/** @type {Record<string, import('./index.js').AssetEntry>} */
export const VEGETATION_ASSETS = {
  // A royal palm about 9 m tall: ringed grey trunk, green crownshaft, a crown of arching fronds
  // on alpha-tested cards (material "cutout"). Three levels of detail.
  royal_palm_a: {
    file: 'vegetation/royal_palm_a.glb',
    kind: 'vegetation',
    lods: 3,
    nodes: ['lod0', 'lod1', 'lod2'],
    colliders: ['col_cyl_trunk'],
    materials: ['atlas', 'cutout'],
  },
};

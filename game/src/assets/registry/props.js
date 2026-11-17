// Props: street furniture and small objects. Written by hand (see index.js).

/** @type {Record<string, import('./index.js').AssetEntry>} */
export const PROP_ASSETS = {
  // A 6.2 m street lamp: tapered steel pole on a cast base, a curved arm and an LED head.
  // lamp_main is the glowing diffuser; anchor_light is where its light comes from, pointing down.
  street_lamp_a: {
    file: 'props/street_lamp_a.glb',
    kind: 'prop',
    lods: 2,
    nodes: ['lod0', 'lod1'],
    anchors: ['anchor_light'],
    colliders: ['col_cyl_pole'],
    materials: ['atlas', 'lamp_main'],
  },
  // A coin-operated newspaper box with worn paint, a glazed door and a stack of papers inside.
  newspaper_box_a: {
    file: 'props/newspaper_box_a.glb',
    kind: 'prop',
    lods: 2,
    nodes: ['lod0', 'lod1'],
    anchors: ['anchor_use'],
    colliders: ['col_box_body'],
    materials: ['atlas', 'glass'],
  },
};

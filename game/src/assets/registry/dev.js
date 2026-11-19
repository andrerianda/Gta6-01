// Development assets: test objects of the asset pipeline. Written by hand (see index.js).

/** @type {Record<string, import('./index.js').AssetEntry>} */
export const DEV_ASSETS = {
  // A 1 m x 2 m plate with a yellow arrow along forward (-Z), a green post up to 1.5 m (+Y)
  // and a red ball on the right (+X): proves the Blender to game axis and scale conventions.
  orientation_probe: {
    file: 'dev/orientation_probe.glb',
    kind: 'dev',
    lods: 1,
    nodes: ['probe'],
    anchors: ['anchor_forward', 'anchor_up'],
    colliders: ['col_box_plate'],
    materials: ['atlas'],
  },
  // A 1.6 m fabric tube skinned to three bones, with two clips and an anchor on the tip bone:
  // proves skeletons, skinning and animation from Blender to the game.
  skin_probe: {
    file: 'dev/skin_probe.glb',
    kind: 'dev',
    lods: 1,
    nodes: ['body', 'root', 'mid', 'tip'],
    anchors: ['anchor_tip'],
    materials: ['atlas'],
    animations: ['wave', 'bow'],
  },
  // Two stucco walls on a brick plinth over a paved floor with a concrete coping: proves the
  // repeating tile_* materials (2 m tiles, UVs in metres) beside an atlas material.
  tile_probe: {
    file: 'dev/tile_probe.glb',
    kind: 'dev',
    lods: 1,
    nodes: ['walls'],
    colliders: ['col_box_back', 'col_box_left'],
    materials: ['atlas', 'tile_stucco', 'tile_brick', 'tile_pavers'],
    maxBytes: 450000,
  },
};

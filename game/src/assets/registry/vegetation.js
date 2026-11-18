// Vegetation: palms, trees, shrubs. Written by hand (see index.js).
//
// PLANT FILES WITH VARIANTS (royal_palm, coconut_palm; every later plant follows the scheme).
// One file holds two or three shape variants sharing one atlas. Each variant is a part with
// three levels, named variant_<letter>_lod<n>:
//     variant_a_lod0   near: trunk, crown of frond strips in two layers, nuts, litter and tufts
//     variant_a_lod1   from 35 m: about a quarter of the triangles
//     variant_a_lod2   from 90 m: a three-sided trunk and three crossed impostor cards (24 triangles)
// A variant's mesh is modelled about its own foot (node origin on the ground). In the file the
// variant nodes stand in a row along +X so the file shows as a group; the city assembler takes
// one variant's geometry and places it itself, ignoring the node's X (also in extras.variants:
// node, x, height, crown_width, crown_base in Blender axes, metres). VEGETATION_PLACEMENT below
// holds the same facts in game axes for code that places plants.
// Collider: one col_cyl_trunk, valid about every variant's own origin. Class: fixed (not knockable).
// Materials: "atlas" (trunk, crownshaft, nuts; opaque) and "cutout" (fronds, the litter patch and
// grass tufts at the foot, the impostor cards; alpha-tested, double sided).
// Wind mask, vertex colour COLOR_0 (linear): R = shade, G = R * warmth, B = R * (1 - wind / 2),
// so wind = 2 * (1 - B / R): 0 on trunks, nuts and the foot, 0.25 at a frond's stalk rising to 1
// at its tip, 0.5 to 0.9 up an impostor card. The stock material just multiplies the colour in.
// No anchors and no lamp roles on plants.
//
// id            variant    height  crown width  crown base (game x,y,z)  leans                 notes
// royal_palm    variant_a  13.1 m   8.7 m       0.30, 10.4, -0.12        0.25 m                green crownshaft 2 m, spear leaf, 1 dead frond
// royal_palm    variant_b  11.4 m   8.1 m      -0.43,  8.6, -0.36        0.45 m                node x = 7 m
// coconut_palm  variant_a  12.3 m  10.3 m       2.48,  8.4,  0.02        2.5 m towards +X      6 coconuts, 2 dead fronds
// coconut_palm  variant_b  10.3 m   9.6 m      -1.17,  6.6, -0.92        1.5 m towards -X, -Z  4 coconuts, 3 dead fronds; node x = 9 m
// (Blender (x, y, z) is game (x, z, -y). The crown base is where the fronds leave the trunk,
// about the variant's own foot, so it also gives the direction of the lean.)
// Spacing along an avenue: royal palms 8 to 10 m, coconut palms 7 to 9 m (their crowns are wide
// and lean); mix variants and turn each plant by a random yaw so a row is not a row of clones.

const VARIANT_NODES = ['variant_a_lod0', 'variant_a_lod1', 'variant_a_lod2',
  'variant_b_lod0', 'variant_b_lod1', 'variant_b_lod2'];

/** @type {Record<string, import('./index.js').AssetEntry>} */
export const VEGETATION_ASSETS = {
  // The pipeline author's example palm, about 9 m tall, one shape, three levels. The engine's
  // demonstration scene still places it; royal_palm replaces it for the city.
  royal_palm_a: {
    file: 'vegetation/royal_palm_a.glb',
    kind: 'vegetation',
    lods: 3,
    nodes: ['lod0', 'lod1', 'lod2'],
    colliders: ['col_cyl_trunk'],
    materials: ['atlas', 'cutout'],
  },
  // Royal palm: smooth ringed grey trunk, green crownshaft, round crown of feather fronds.
  // Two variants in one file: twice a single plant's triangles and draw calls (see above).
  royal_palm: {
    file: 'vegetation/royal_palm.glb',
    kind: 'vegetation',
    lods: 3,
    nodes: VARIANT_NODES,
    colliders: ['col_cyl_trunk'],
    materials: ['atlas', 'cutout'],
    maxTriangles: 6000,
    maxDraws: 4,
  },
  // Coconut palm: slender leaning, curving trunk, loose drooping crown, coconuts.
  // Two variants in one file: twice a single plant's triangles and draw calls (see above).
  coconut_palm: {
    file: 'vegetation/coconut_palm.glb',
    kind: 'vegetation',
    lods: 3,
    nodes: VARIANT_NODES,
    colliders: ['col_cyl_trunk'],
    materials: ['atlas', 'cutout'],
    maxTriangles: 6000,
    maxDraws: 4,
  },
};

/**
 * Placement facts for the city assembler, game axes (+Y up), metres, about each variant's foot.
 * variants[i].prefix + '_lod0' .. '_lod2' are the node names; lodDistances are the switch
 * distances to lod1 and lod2; collider is col_cyl_trunk (radius, height, centred at height / 2).
 * windChannel: the mask is COLOR_0 with wind = 2 * (1 - B / R) (see the header).
 */
export const VEGETATION_PLACEMENT = {
  royal_palm: {
    class: 'fixed',
    lodDistances: [35, 90],
    collider: { radius: 0.26, height: 7.0 },
    spacing: [8, 10],
    windChannel: 'COLOR_0 B/R',
    variants: [
      { prefix: 'variant_a', height: 13.1, crownWidth: 8.7, crownBase: [0.3, 10.4, -0.12] },
      { prefix: 'variant_b', height: 11.4, crownWidth: 8.1, crownBase: [-0.43, 8.6, -0.36] },
    ],
  },
  coconut_palm: {
    class: 'fixed',
    lodDistances: [35, 90],
    collider: { radius: 0.24, height: 3.0 },
    spacing: [7, 9],
    windChannel: 'COLOR_0 B/R',
    variants: [
      { prefix: 'variant_a', height: 12.3, crownWidth: 10.3, crownBase: [2.48, 8.4, 0.02] },
      { prefix: 'variant_b', height: 10.3, crownWidth: 9.6, crownBase: [-1.17, 6.6, -0.92] },
    ],
  },
};

// Vegetation: palms, trees, shrubs. Written by hand (see index.js).
//
// PLANT FILES WITH VARIANTS (royal_palm, coconut_palm, street_tree; every later plant follows the
// scheme). One file holds two or three shape variants sharing one atlas. Each variant is a part
// with three levels, named variant_<letter>_lod<n>:
//     variant_a_lod0   near: trunk, crown (palms: frond strips in two layers, nuts; trees:
//                      branches and cupped leaf-spray cards), the litter or mulch ring
//     variant_a_lod1   about a quarter of the triangles (palms from 35 m, trees from 30 m)
//     variant_a_lod2   a three-sided trunk and three crossed impostor cards baked from the
//                      detailed crown (palms from 90 m, trees from 80 m; 18 to 24 triangles)
// A variant's mesh is modelled about its own foot (node origin on the ground). In the file the
// variant nodes stand in a row along +X so the file shows as a group; the city assembler takes
// one variant's geometry and places it itself, ignoring the node's X (also in extras.variants:
// node, x, height, crown_width, crown_base in Blender axes, metres). VEGETATION_PLACEMENT below
// holds the same facts in game axes for code that places plants.
// Collider: one col_cyl_trunk, valid about every variant's own origin. Class: fixed (not knockable).
// Materials: "atlas" (trunk, branches, crownshaft, nuts; opaque) and "cutout" (fronds, leaf cards,
// the litter patch and grass tufts at the foot, the impostor cards; alpha-tested, double sided).
// Wind mask, vertex colour COLOR_0 (linear): R = shade, G = R * warmth, B = R * (1 - wind / 2),
// so wind = 2 * (1 - B / R): 0 on trunks, nuts and the foot; palms 0.25 at a frond's stalk rising
// to 1 at its tip; trees 0 to 0.15 up the scaffolds, 0.15 to 0.35 along side branches, 0.5 at a
// leaf card's base to 1 at its tip; 0.5 to 0.9 up an impostor card. The stock material just
// multiplies the colour in. No anchors and no lamp roles on plants.
//
// id            variant    height  crown width  crown base (game x,y,z)  leans                 notes
// royal_palm    variant_a  13.3 m   9.3 m       0.30, 10.4, -0.12        0.25 m                green crownshaft 2 m, spear leaf, 1 dead frond
// royal_palm    variant_b  11.6 m   8.6 m      -0.43,  8.6, -0.36        0.45 m                node x = 7 m
// coconut_palm  variant_a  12.3 m  10.3 m       2.48,  8.4,  0.02        2.5 m towards +X      6 coconuts, 2 dead fronds
// coconut_palm  variant_b  10.3 m   9.6 m      -1.17,  6.6, -0.92        1.5 m towards -X, -Z  4 coconuts, 3 dead fronds; node x = 9 m
// street_tree   variant_a   9.0 m   9.0 m       0.01,  2.5, -0.04        0.15 m                first fork at 2.5 m, 5 scaffolds
// street_tree   variant_b   7.9 m   7.7 m      -0.17,  2.2,  0.10        0.25 m                first fork at 2.2 m, 4 scaffolds; node x = 8 m
// (Blender (x, y, z) is game (x, z, -y). The crown base is where the fronds leave the trunk, or
// a tree's first fork, about the variant's own foot, so for a palm it also gives the lean.)
// Spacing along an avenue: royal palms 8 to 10 m, coconut palms 7 to 9 m, street trees 7 to 9 m;
// mix variants and turn each plant by a random yaw so a row is not a row of clones.

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
  // Street tree: tidy medium broadleaf for avenues, trunk clear to about 2.4 m, egg-shaped crown.
  // Two variants in one file: twice a single tree's triangles and draw calls (see above).
  street_tree: {
    file: 'vegetation/street_tree.glb',
    kind: 'vegetation',
    lods: 3,
    nodes: VARIANT_NODES,
    colliders: ['col_cyl_trunk'],
    materials: ['atlas', 'cutout'],
    maxTriangles: 7000,
    maxDraws: 4,
  },
};

/**
 * Placement facts for the city assembler, game axes (+Y up), metres, about each variant's foot.
 * variants[i].prefix + '_lod0' .. '_lod2' are the node names; lodDistances are the switch
 * distances to lod1 and lod2; collider is col_cyl_trunk (radius, height, centred at height / 2);
 * crownBase is where the fronds leave the trunk (palms) or the first fork (trees).
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
      { prefix: 'variant_a', height: 13.3, crownWidth: 9.3, crownBase: [0.3, 10.4, -0.12] },
      { prefix: 'variant_b', height: 11.6, crownWidth: 8.6, crownBase: [-0.43, 8.6, -0.36] },
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
  street_tree: {
    class: 'fixed',
    lodDistances: [30, 80],
    collider: { radius: 0.2, height: 2.6 },
    spacing: [7, 9],
    windChannel: 'COLOR_0 B/R',
    variants: [
      { prefix: 'variant_a', height: 9.0, crownWidth: 9.0, crownBase: [0.01, 2.5, -0.04] },
      { prefix: 'variant_b', height: 7.9, crownWidth: 7.7, crownBase: [-0.17, 2.2, 0.1] },
    ],
  },
};

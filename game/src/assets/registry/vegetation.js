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
// royal_palm    variant_a  13.8 m   9.4 m       0.32, 10.8, -0.13        0.25 m                green crownshaft 2.4 m, spear leaf, 1 dead frond
// royal_palm    variant_b  12.1 m   8.7 m      -0.45,  9.0, -0.37        0.45 m                node x = 7 m
// coconut_palm  variant_a  12.3 m  10.3 m       2.48,  8.4,  0.02        2.5 m towards +X      6 coconuts, 2 dead fronds
// coconut_palm  variant_b  10.3 m   9.6 m      -1.17,  6.6, -0.92        1.5 m towards -X, -Z  4 coconuts, 3 dead fronds; node x = 9 m
// street_tree   variant_a   9.0 m   9.0 m       0.01,  2.5, -0.04        0.15 m                first fork at 2.5 m, 5 scaffolds
// street_tree   variant_b   7.9 m   7.7 m      -0.17,  2.2,  0.10        0.25 m                first fork at 2.2 m, 4 scaffolds; node x = 8 m
// street_tree_narrow  a    10.0 m   3.8 m (reach 1.95 m)  0.0, 2.6, 0.0   0.1 m             columnar crown for pits within ~4.5 m of a facade
// street_tree_narrow  b     9.0 m   3.6 m (reach 1.8 m)  -0.05, 2.4, -0.04  0.12 m          node x = 6 m
// coconut_palm_leaning a   11.8 m   9.7 m       3.99,  7.8,  0.01        4.0 m towards +X      strong lean: turn +X away from the facade
// coconut_palm_leaning b   10.2 m   9.8 m       3.29,  6.6,  0.0         3.3 m towards +X      node x = 10 m
// shrubs_tropical  a / b    1.75 / 1.35 m (hibiscus, flowering mound), col_cyl_trunk r 0.6; node x = 2.5 m
// hedge_clipped    a / b    1.1 / 0.6 m high 2 m modules along X, col_box_hedge; node x = 3 m
// ground_cover     a weeds_kerb 1 m run (0.22 m), b weeds_crack (0.26 m), c grass_clump (0.46 m),
//                  d cover_patch 1.3 m (0.2 m); cutout only, no collider; node x = 0, 2, 4, 6 m
// Near facades: street_tree_narrow wherever street_tree's crown (reach about 4.2 m) would touch
// a building, awning or balcony; coconut_palm_leaning (or coconut_palm turned the same way)
// with its +X turned over the road or the beach, so the crown stands 3.3 to 4 m out from the pit.
// Foliage normals (all files built from 08:47 on 18 Nov): fronds and leaf cards store normals
// pointing out from the crown's axis and up, palm fronds are wound to face down, so the crown
// seen from the street takes the sky and the sun on its side instead of reading black.
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
  // Narrow street tree: the avenue broadleaf with a tall columnar crown about 3.7 m across,
  // for pits close to facades and narrow streets. Two variants (see above).
  street_tree_narrow: {
    file: 'vegetation/street_tree_narrow.glb',
    kind: 'vegetation',
    lods: 3,
    nodes: VARIANT_NODES,
    colliders: ['col_cyl_trunk'],
    materials: ['atlas', 'cutout'],
    maxTriangles: 7000,
    maxDraws: 4,
  },
  // Leaning coconut palm: both variants lean strongly towards +X (crown 3.3 to 4 m out).
  // Two variants (see above).
  coconut_palm_leaning: {
    file: 'vegetation/coconut_palm_leaning.glb',
    kind: 'vegetation',
    lods: 3,
    nodes: VARIANT_NODES,
    colliders: ['col_cyl_trunk'],
    materials: ['atlas', 'cutout'],
    maxTriangles: 6000,
    maxDraws: 4,
  },
  // Tropical shrubs: variant_a a hibiscus (1.75 m, red flowers), variant_b a low spreading
  // flowering mound (1.35 m). For planters, pits, verges, medians and front yards. Since shift 8
  // the leaves come down to the soil (no bare stem) and read warm green, not blue-grey.
  // Two variants (1,060 and 1,028 triangles at level 0); later shifts add more as variant_c...
  shrubs_tropical: {
    file: 'vegetation/shrubs_tropical.glb',
    kind: 'vegetation',
    lods: 3,
    nodes: VARIANT_NODES,
    colliders: ['col_cyl_trunk'],
    materials: ['atlas', 'cutout'],
    maxTriangles: 2400,
    maxDraws: 4,
  },
  // Clipped hedge: 2 m modules that butt end to end along their X axis; variant_a 1.1 m high
  // and 0.7 m deep, variant_b a 0.6 m low edging, 0.55 m deep. Collider col_box_hedge
  // (2.0 x 0.7 x 1.1 m on the origin, also used for the low module). Since shift 8 the leaf
  // cards cover the box evenly over a darker inner layer, so a module reads as a clipped block
  // (leaves overhang its ends by about 0.2 m, so butted modules merge into one hedge).
  hedge_clipped: {
    file: 'vegetation/hedge_clipped.glb',
    kind: 'vegetation',
    lods: 3,
    nodes: VARIANT_NODES,
    colliders: ['col_box_hedge'],
    materials: ['atlas', 'cutout'],
    maxTriangles: 2600,
    maxDraws: 4,
  },
  // Ground cover: weeds, grass and creeping cover where paving meets soil. Four variants, all
  // "cutout" (no atlas material, no collider: people walk over them), one draw call each, so the
  // file is four draws at level 0 by design (172 triangles in all). See VEGETATION_PLACEMENT.
  ground_cover: {
    file: 'vegetation/ground_cover.glb',
    kind: 'vegetation',
    lods: 3,
    nodes: [...VARIANT_NODES, 'variant_c_lod0', 'variant_c_lod1', 'variant_c_lod2',
      'variant_d_lod0', 'variant_d_lod1', 'variant_d_lod2'],
    materials: ['cutout'],
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
      { prefix: 'variant_a', height: 13.8, crownWidth: 9.4, crownBase: [0.32, 10.8, -0.13] },
      { prefix: 'variant_b', height: 12.1, crownWidth: 8.7, crownBase: [-0.45, 9.0, -0.37] },
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
  // crownReach: the furthest leaf from the trunk's axis (metres), for keeping crowns off facades.
  street_tree_narrow: {
    class: 'fixed',
    lodDistances: [30, 80],
    collider: { radius: 0.18, height: 2.6 },
    spacing: [5, 7],
    windChannel: 'COLOR_0 B/R',
    nearFacades: true,
    variants: [
      { prefix: 'variant_a', height: 10.0, crownWidth: 3.8, crownReach: 1.95, crownBase: [0, 2.6, 0] },
      { prefix: 'variant_b', height: 9.0, crownWidth: 3.6, crownReach: 1.8, crownBase: [-0.05, 2.4, -0.04] },
    ],
  },
  // Leans towards +X: turn the plant so +X points away from the facade (over the road or beach).
  coconut_palm_leaning: {
    class: 'fixed',
    lodDistances: [35, 90],
    collider: { radius: 0.24, height: 1.6 },
    spacing: [7, 9],
    windChannel: 'COLOR_0 B/R',
    nearFacades: true,
    leanTowards: '+X',
    variants: [
      { prefix: 'variant_a', height: 11.8, crownWidth: 9.7, crownBase: [3.99, 7.8, 0.01] },
      { prefix: 'variant_b', height: 10.2, crownWidth: 9.8, crownBase: [3.29, 6.6, 0.0] },
    ],
  },
  // Shrubs: the collider is the whole shrub (people walk round it); crownBase is where the
  // stems fork, just above the soil.
  shrubs_tropical: {
    class: 'fixed',
    lodDistances: [30, 80],
    collider: { radius: 0.6, height: 1.2 },
    spacing: [1.6, 3],
    windChannel: 'COLOR_0 B/R',
    variants: [
      { prefix: 'variant_a', height: 1.75, crownWidth: 1.9, crownBase: [0.06, 0.18, -0.04], name: 'hibiscus' },
      { prefix: 'variant_b', height: 1.35, crownWidth: 2.0, crownBase: [-0.05, 0.14, 0.01], name: 'flowering_mound' },
    ],
  },
  // Hedge modules: length along X (2.0 m), place them every 2.0 m along the hedge line with the
  // module's X along that line; turn a module 180 degrees at random so the run does not repeat.
  hedge_clipped: {
    class: 'fixed',
    lodDistances: [30, 80],
    collider: { box: [2.0, 1.1, 0.7] },
    spacing: [2.0, 2.0],
    windChannel: 'COLOR_0 B/R',
    module: { length: 2.0 },
    variants: [
      { prefix: 'variant_a', height: 1.15, depth: 0.7, crownWidth: 2.05, crownBase: [0, 0.1, 0], name: 'hedge_tall' },
      { prefix: 'variant_b', height: 0.65, depth: 0.55, crownWidth: 2.0, crownBase: [0, 0.08, 0], name: 'hedge_low' },
    ],
  },
  // Ground cover: no collider, never casts shadows worth drawing (skip them), place on the
  // surface (surfaceAt) with a random yaw. weeds_kerb: its 1 m length along X, laid along the
  // kerb-gutter joint, wall feet and fences (Barrio Hierro and the port every 2-6 m, Centro
  // rarely); weeds_crack: pavement cracks, post, sign and bollard feet, pit corners, lot edges;
  // grass_clump: verges, vacant lots, the back of the beach and tree pits (2-4 per pit edge);
  // cover_patch: lay one in each tree pit or planter over its soil (1.3 m across, rim 2 cm
  // below its centre's foot), with a weeds_crack or two at the pit's corners.
  ground_cover: {
    class: 'fixed',
    lodDistances: [15, 40],
    collider: null,
    windChannel: 'COLOR_0 B/R',
    castShadow: false,
    variants: [
      { prefix: 'variant_a', height: 0.22, crownWidth: 1.05, depth: 0.15, name: 'weeds_kerb' },
      { prefix: 'variant_b', height: 0.26, crownWidth: 0.5, name: 'weeds_crack' },
      { prefix: 'variant_c', height: 0.46, crownWidth: 0.85, name: 'grass_clump' },
      { prefix: 'variant_d', height: 0.2, crownWidth: 1.25, name: 'cover_patch' },
    ],
  },
};

// Leisure: the beach, waterfront and park sets. Written by hand (see index.js).
//
// SETS (the same scheme as the props sets; art/blender/assets/leisure/_leisure.py). One file holds
// several objects sharing one atlas:
//     <object>                       the node the game clones: an empty at the object's ground centre,
//                                    its extras carry class ('fixed' | 'knockable') and mass (kg)
//     <object>_lod0, <object>_lod1   its levels (children of the object node); level 1 from 40 m
//     col_<shape>_<name>__<object>   its collision proxies (children)
//     anchor_<what>__<object>        its anchors (children)
// In the file the objects stand in a row along +X; a clone of an object node stands on its own
// origin. extras.objects repeats class, mass and the origin for code that reads the file only.
// Every object faces the game's -Z (Blender +Y): the lounger's feet, the lifeguard tower's sea
// window, the kiosk's counter, the net's face.
// Materials: "atlas" and "paint_canvas": the coloured canvas (parasol stripes, the loungers'
// sling, the kiosk awning's stripes, the net-post pads) is baked neutral and tinted per instance
// with setPaint (default coral red; the white stripes between stay white). Vary it along a beach:
// coral, ocean blue, sun yellow, sea green, one colour per bar or hotel frontage.
// No lamps and no wind mask on these sets.
//
// set_beach (7 objects, 6,410 triangles at level 0 in all, one 1024 atlas)
// object           class      mass   size x, height, z (m)  colliders                         anchors
// parasol_open     knockable  6 kg   2.2, 2.42, 2.2          col_cyl_pole                      -
// parasol_closed   knockable  5 kg   0.25, 2.46, 0.25        col_cyl_pole                      -
// lounger          knockable  9 kg   0.72, 0.8, 1.92         col_box_bed                       -
// lounger_towel    knockable  9.5 kg 0.72, 0.8, 1.92         col_box_bed                       -
// lifeguard_tower  fixed      -      2.64, 6.39, 7.23        col_box_cabin, col_cyl_stilt_*    anchor_use (ramp foot), anchor_flag
// beach_bar_kiosk  fixed      -      3.7, 2.94, 3.5          col_box_kiosk                     anchor_sign (sign board), anchor_use (at the counter)
// volleyball_net   fixed      -      12.2, 3.23, 0.14        col_cyl_post_l, col_cyl_post_r    -
// (every collider and anchor name ends in __<object>, as in the list below.)

/** @type {Record<string, import('./index.js').AssetEntry>} */
export const LEISURE_ASSETS = {
  // A set of seven objects in one file: over the prop default by design (each object with
  // canvas is two draw calls, atlas and paint_canvas; 13 at level 0 in all; one shared atlas).
  set_beach: {
    file: 'leisure/set_beach.glb',
    kind: 'prop',
    lods: 2,
    maxTriangles: 9000,
    maxDraws: 14,
    maxBytes: 520000,
    nodes: [
      'parasol_open', 'parasol_open_lod0', 'parasol_open_lod1',
      'parasol_closed', 'parasol_closed_lod0', 'parasol_closed_lod1',
      'lounger', 'lounger_lod0', 'lounger_lod1',
      'lounger_towel', 'lounger_towel_lod0', 'lounger_towel_lod1',
      'lifeguard_tower', 'lifeguard_tower_lod0', 'lifeguard_tower_lod1',
      'beach_bar_kiosk', 'beach_bar_kiosk_lod0', 'beach_bar_kiosk_lod1',
      'volleyball_net', 'volleyball_net_lod0', 'volleyball_net_lod1',
    ],
    anchors: ['anchor_use__lifeguard_tower', 'anchor_flag__lifeguard_tower',
      'anchor_sign__beach_bar_kiosk', 'anchor_use__beach_bar_kiosk'],
    colliders: ['col_cyl_pole__parasol_open', 'col_cyl_pole__parasol_closed',
      'col_box_bed__lounger', 'col_box_bed__lounger_towel', 'col_box_cabin__lifeguard_tower',
      'col_cyl_stilt_fl__lifeguard_tower', 'col_cyl_stilt_fr__lifeguard_tower',
      'col_cyl_stilt_bl__lifeguard_tower', 'col_cyl_stilt_br__lifeguard_tower',
      'col_box_kiosk__beach_bar_kiosk', 'col_cyl_post_l__volleyball_net',
      'col_cyl_post_r__volleyball_net'],
    materials: ['atlas', 'paint_canvas'],
  },
};

/**
 * Per-object facts for the city assembler (game axes, metres). size is [x, height, z].
 * Placement notes say where each object belongs on Playa Dorada and the promenade.
 */
export const LEISURE_SET_OBJECTS = {
  set_beach: {
    parasol_open: {
      class: 'knockable', mass: 6, lods: 2, size: [2.2, 2.42, 2.2],
      anchors: [], colliders: ['col_cyl_pole__parasol_open'], paint: 'paint_canvas',
      note: 'Open beach parasol, pole 0.25 m into the sand. In rows 4-5 m apart parallel to the water, one or two loungers under each, random yaw; a bar or hotel frontage uses one canvas colour.',
    },
    parasol_closed: {
      class: 'knockable', mass: 5, lods: 2, size: [0.25, 2.46, 0.25],
      anchors: [], colliders: ['col_cyl_pole__parasol_closed'], paint: 'paint_canvas',
      note: 'The same parasol furled: mix about one in four into the rows, and all of them at night or in storms.',
    },
    lounger: {
      class: 'knockable', mass: 9, lods: 2, size: [0.72, 0.8, 1.92],
      anchors: [], colliders: ['col_box_bed__lounger'], paint: 'paint_canvas',
      note: 'Sun lounger, backrest at +Z (game), feet at -Z: turn the feet towards the water. Pairs under a parasol 0.8 m apart.',
    },
    lounger_towel: {
      class: 'knockable', mass: 9.5, lods: 2, size: [0.72, 0.8, 1.92],
      anchors: [], colliders: ['col_box_bed__lounger_towel'], paint: 'paint_canvas',
      note: 'The lounger with a teal towel spread on it: about one in three loungers.',
    },
    lifeguard_tower: {
      class: 'fixed', lods: 2, size: [2.64, 6.39, 7.23],
      anchors: ['anchor_use__lifeguard_tower', 'anchor_flag__lifeguard_tower'],
      colliders: ['col_box_cabin__lifeguard_tower', 'col_cyl_stilt_fl__lifeguard_tower',
        'col_cyl_stilt_fr__lifeguard_tower', 'col_cyl_stilt_bl__lifeguard_tower',
        'col_cyl_stilt_br__lifeguard_tower'],
      note: 'Our own lifeguard post on 2.2 m stilts; its sea window faces -Z, the ramp runs 4.6 m back (+Z) to the sand. One every 250-400 m of beach, 25-40 m from the water line; a strong silhouette for the skyline picture. anchor_use: the ramp foot (a lifeguard stands there); anchor_flag: the flag pole top.',
    },
    beach_bar_kiosk: {
      class: 'fixed', lods: 2, size: [3.7, 2.94, 3.5],
      anchors: ['anchor_sign__beach_bar_kiosk', 'anchor_use__beach_bar_kiosk'],
      colliders: ['col_box_kiosk__beach_bar_kiosk'], paint: 'paint_canvas',
      note: 'Beach bar with a counter and three stools facing -Z: on the promenade edge or the back of the sand, the counter towards the walkway. anchor_sign: the blank board on the roof (2.4 x 0.45 m), paint the bar name from the catalogs there; anchor_use: a customer at the counter.',
    },
    volleyball_net: {
      class: 'fixed', lods: 2, size: [12.2, 3.23, 0.14],
      anchors: [], colliders: ['col_cyl_post_l__volleyball_net', 'col_cyl_post_r__volleyball_net'],
      paint: 'paint_canvas',
      note: 'Beach volleyball net, posts 9.5 m apart along X, net top 2.43 m: on open sand with 8 x 16 m clear around it, the net parallel or square to the water.',
    },
  },
};

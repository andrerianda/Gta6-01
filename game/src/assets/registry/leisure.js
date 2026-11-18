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
// set_beach (15 objects, 10,838 triangles at level 0 in all, 21 draws, one 1024 atlas, 262 kB)
// object             class      mass   size x, height, z (m)  colliders                         anchors
// parasol_open       knockable  6 kg   2.2, 2.42, 2.2          col_cyl_pole                      -
// parasol_closed     knockable  5 kg   0.25, 2.46, 0.25        col_cyl_pole                      -
// lounger            knockable  9 kg   0.72, 0.8, 1.92         col_box_bed                       -
// lounger_towel      knockable  9.5 kg 0.72, 0.8, 1.92         col_box_bed                       -
// lifeguard_tower    fixed      -      2.64, 6.39, 7.23        col_box_cabin, col_cyl_stilt_*    anchor_use (ramp foot), anchor_flag
// beach_bar_kiosk    fixed      -      3.7, 2.94, 3.5          col_box_kiosk                     anchor_sign (sign board), anchor_use (at the counter)
// volleyball_net     fixed      -      12.2, 3.23, 0.14        col_cyl_post_l, col_cyl_post_r    -
// surfboard          knockable  4 kg   0.54, 0.17, 2.1         col_box_board                     -
// surfboard_rack     fixed      -      2.4, 2.47, 0.64         col_box_rack                      -
// beach_shower       fixed      -      1.2, 2.44, 1.2          col_box_column                    anchor_use (duckboard), anchor_water (head, down)
// kayak              knockable  24 kg  2.84, 0.52, 3.02        col_box_hull                      -
// pedal_boat         fixed      -      1.56, 1.05, 2.71        col_box_hull                      anchor_seat_1, anchor_seat_2
// court_lines        fixed      -      16.1, 0.02, 8.1         -                                 -
// beach_bin          knockable  28 kg  0.66, 0.97, 0.64        col_box_bin                       -
// beach_bin_recycle  knockable  28 kg  0.66, 0.97, 0.64        col_box_bin                       -
// (every collider and anchor name ends in __<object>, as in the list below.)
//
// set_waterfront (part one: 6 objects, 1,458 triangles at level 0 in all, 8 draws, 128 kB)
// object           class  size x, height, z (m)  colliders                anchors / roles
// promenade_bench  fixed  1.9, 0.89, 0.68         col_box_bench            anchor_seat_1..3 (facing -Z)
// bench_backless   fixed  1.8, 0.46, 0.48         col_box_bench            anchor_seat_1..3 (facing -Z)
// railing_2m       fixed  2.08, 1.1, 0.16         col_box_rail             post at its -X end; butt modules along X
// railing_post     fixed  0.16, 1.1, 0.16         col_box_post             ends a run of railing_2m
// promenade_lamp   fixed  0.48, 4.59, 0.48        col_cyl_pole             anchor_light (lantern, 3.98 m, down); lamp_main
// pier_kiosk       fixed  3.8, 3.78, 3.2          col_cyl_kiosk            anchor_sign (roof board), anchor_use (front counter); paint_canvas flaps

const SET_WATERFRONT_OBJECTS = ['promenade_bench', 'bench_backless', 'railing_2m', 'railing_post',
  'promenade_lamp', 'pier_kiosk'];

const SET_BEACH_OBJECTS = ['parasol_open', 'parasol_closed', 'lounger', 'lounger_towel',
  'lifeguard_tower', 'beach_bar_kiosk', 'volleyball_net', 'surfboard', 'surfboard_rack',
  'beach_shower', 'kayak', 'pedal_boat', 'court_lines', 'beach_bin', 'beach_bin_recycle'];

/** Object node, then its two levels, for every object of a set. */
function setNodes(objects) {
  return objects.flatMap((name) => [name, `${name}_lod0`, `${name}_lod1`]);
}

/** @type {Record<string, import('./index.js').AssetEntry>} */
export const LEISURE_ASSETS = {
  // A set of fifteen objects in one file: over the prop default by design (one draw call per
  // object, two for those with canvas, atlas and paint_canvas; 21 at level 0 in all; one atlas).
  set_beach: {
    file: 'leisure/set_beach.glb',
    kind: 'prop',
    lods: 2,
    maxTriangles: 16000,
    maxDraws: 24,
    maxBytes: 520000,
    nodes: setNodes(SET_BEACH_OBJECTS),
    anchors: ['anchor_use__lifeguard_tower', 'anchor_flag__lifeguard_tower',
      'anchor_sign__beach_bar_kiosk', 'anchor_use__beach_bar_kiosk',
      'anchor_use__beach_shower', 'anchor_water__beach_shower',
      'anchor_seat_1__pedal_boat', 'anchor_seat_2__pedal_boat'],
    colliders: ['col_cyl_pole__parasol_open', 'col_cyl_pole__parasol_closed',
      'col_box_bed__lounger', 'col_box_bed__lounger_towel', 'col_box_cabin__lifeguard_tower',
      'col_cyl_stilt_fl__lifeguard_tower', 'col_cyl_stilt_fr__lifeguard_tower',
      'col_cyl_stilt_bl__lifeguard_tower', 'col_cyl_stilt_br__lifeguard_tower',
      'col_box_kiosk__beach_bar_kiosk', 'col_cyl_post_l__volleyball_net',
      'col_cyl_post_r__volleyball_net', 'col_box_board__surfboard', 'col_box_rack__surfboard_rack',
      'col_box_column__beach_shower', 'col_box_hull__kayak', 'col_box_hull__pedal_boat',
      'col_box_bin__beach_bin', 'col_box_bin__beach_bin_recycle'],
    materials: ['atlas', 'paint_canvas'],
  },
  // A set of six objects in one file: over the prop default by design (one draw per object, the
  // lamp's lantern and the kiosk's canvas flaps one more each; one shared atlas).
  set_waterfront: {
    file: 'leisure/set_waterfront.glb',
    kind: 'prop',
    lods: 2,
    maxTriangles: 6000,
    maxDraws: 10,
    maxBytes: 400000,
    nodes: setNodes(SET_WATERFRONT_OBJECTS),
    anchors: ['anchor_seat_1__promenade_bench', 'anchor_seat_2__promenade_bench',
      'anchor_seat_3__promenade_bench', 'anchor_seat_1__bench_backless',
      'anchor_seat_2__bench_backless', 'anchor_seat_3__bench_backless',
      'anchor_light__promenade_lamp', 'anchor_sign__pier_kiosk', 'anchor_use__pier_kiosk'],
    colliders: ['col_box_bench__promenade_bench', 'col_box_bench__bench_backless',
      'col_box_rail__railing_2m', 'col_box_post__railing_post', 'col_cyl_pole__promenade_lamp',
      'col_cyl_kiosk__pier_kiosk'],
    materials: ['atlas', 'paint_canvas', 'lamp_main'],
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
      note: 'Beach volleyball net, posts 9.5 m apart along X, net top 2.43 m: on open sand with 8 x 16 m clear around it, the net parallel or square to the water. Lay court_lines under it, same origin and yaw.',
    },
    surfboard: {
      class: 'knockable', mass: 4, lods: 2, size: [0.54, 0.17, 2.1],
      anchors: [], colliders: ['col_box_board__surfboard'],
      note: 'A white funboard lying deck up, nose to -Z: beside towels and loungers, by the rack, at the water line near a surf school; one here and there, random yaw.',
    },
    surfboard_rack: {
      class: 'fixed', lods: 2, size: [2.4, 2.47, 0.64],
      anchors: [], colliders: ['col_box_rack__surfboard_rack'],
      note: 'Timber rack with four coloured boards standing nose up: at the back of the sand next to a beach bar or a lifeguard tower, or on the promenade edge; one or two per beach section.',
    },
    beach_shower: {
      class: 'fixed', lods: 2, size: [1.2, 2.44, 1.2],
      anchors: ['anchor_use__beach_shower', 'anchor_water__beach_shower'],
      colliders: ['col_box_column__beach_shower'],
      note: 'Shower post on a concrete pad with a duckboard: at each beach access from the promenade, every 80-150 m. anchor_use: a person standing under the head (facing +Z, the post behind them); anchor_water: the shower head pointing down, for a water effect.',
    },
    kayak: {
      class: 'knockable', mass: 24, lods: 2, size: [2.84, 0.52, 3.02],
      anchors: [], colliders: ['col_box_hull__kayak'],
      note: 'Orange sit-on-top kayak with its paddle across, bow to -Z: pulled up on the sand above the water line in groups of 2-4 by a rental spot, bows to the sea.',
    },
    pedal_boat: {
      class: 'fixed', lods: 2, size: [1.56, 1.05, 2.71],
      anchors: ['anchor_seat_1__pedal_boat', 'anchor_seat_2__pedal_boat'],
      colliders: ['col_box_hull__pedal_boat'],
      note: 'Two-seat pedal boat on white pontoons, bow to -Z: in a row of 3-6 at a rental spot just above the water line, bows to the sea, 2 m apart.',
    },
    court_lines: {
      class: 'fixed', lods: 2, size: [16.1, 0.02, 8.1],
      anchors: [], colliders: [],
      note: 'The 16 x 8 m court outline in blue tape lying on the sand, long side along X: same origin and yaw as volleyball_net. No collider, no shadow needed.',
    },
    beach_bin: {
      class: 'knockable', mass: 28, lods: 2, size: [0.66, 0.97, 0.64],
      anchors: [], colliders: ['col_box_bin__beach_bin'],
      note: 'Slatted timber bin with a timber lid (flap to -Z): at the back of the sand by the promenade, at beach accesses, by kiosks and showers, every 40-60 m; often paired with beach_bin_recycle 0.8 m apart.',
    },
    beach_bin_recycle: {
      class: 'knockable', mass: 28, lods: 2, size: [0.66, 0.97, 0.64],
      anchors: [], colliders: ['col_box_bin__beach_bin_recycle'],
      note: 'The same bin with a blue lid, for recycling: next to a beach_bin.',
    },
  },
  set_waterfront: {
    promenade_bench: {
      class: 'fixed', lods: 2, size: [1.9, 0.89, 0.68],
      anchors: ['anchor_seat_1__promenade_bench', 'anchor_seat_2__promenade_bench',
        'anchor_seat_3__promenade_bench'],
      colliders: ['col_box_bench__promenade_bench'],
      note: 'Timber slat bench on sea-green cast frames, seats facing -Z: along the promenade every 15-25 m with its back to the road and its face to the sea, on the pier facing outwards, in plazas and parks. anchor_seat_*: people sitting.',
    },
    bench_backless: {
      class: 'fixed', lods: 2, size: [1.8, 0.46, 0.48],
      anchors: ['anchor_seat_1__bench_backless', 'anchor_seat_2__bench_backless',
        'anchor_seat_3__bench_backless'],
      colliders: ['col_box_bench__bench_backless'],
      note: 'Concrete plinth with a timber top, seats both ways: in the middle of wide promenade stretches and plazas, in pairs end to end; mix with promenade_bench.',
    },
    railing_2m: {
      class: 'fixed', lods: 2, size: [2.08, 1.1, 0.16],
      anchors: [], colliders: ['col_box_rail__railing_2m'],
      note: 'Sea railing module, post at -X, rail along X: butt modules every 2 m along the sea edge of the promenade, the pier sides and the Mirador terrace; end each run with a railing_post at +X.',
    },
    railing_post: {
      class: 'fixed', lods: 2, size: [0.16, 1.1, 0.16],
      anchors: [], colliders: ['col_box_post__railing_post'],
      note: 'The end post of a railing run (place at the +X end of the last railing_2m).',
    },
    promenade_lamp: {
      class: 'fixed', lods: 2, size: [0.48, 4.59, 0.48],
      anchors: ['anchor_light__promenade_lamp'], colliders: ['col_cyl_pole__promenade_lamp'],
      lamps: ['lamp_main'],
      note: 'Our own promenade lamp, opal lantern on a fluted sea-green column: every 20-25 m along the promenade (sea side, by the railing) and on the pier. lamp_main on from dusk; a small warm pool (2700-3000 K, range 8-10 m) from anchor_light.',
    },
    pier_kiosk: {
      class: 'fixed', lods: 2, size: [3.8, 3.78, 3.2],
      anchors: ['anchor_sign__pier_kiosk', 'anchor_use__pier_kiosk'],
      colliders: ['col_cyl_kiosk__pier_kiosk'], paint: 'paint_canvas',
      note: 'Hexagonal timber kiosk, three hatches facing -Z: one near the pier head and at the pier root, one or two on the promenade. anchor_sign: the roof board (1.2 x 0.34 m), paint an ice-cream, snack or bait-and-tackle name from the catalogs; anchor_use: a customer at the front counter. Canvas flaps per instance (setPaint).',
    },
  },
};

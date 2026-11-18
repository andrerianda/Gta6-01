// Props: street furniture and small objects. Written by hand (see index.js).
//
// SETS: ONE FILE, MANY OBJECTS
// To keep the file count low, related props ship together as a set (set_<theme>): one .glb,
// one atlas, many objects. Inside a set every name carries its object after a double
// underscore, so nothing collides and the plain contract prefixes (lod, anchor_, col_) still
// parse:
//
//   <object>                      an empty at the object's ground centre: the node to clone.
//                                 Everything below is its child, positioned relative to it, so
//                                 a clone moved to the origin is the object standing on (0,0,0)
//                                 facing -Z. Its userData has class, mass, lods, lod_distances.
//   <object>_lod0, _lod1, _lod2   the object's levels of detail (show one at a time)
//   anchor_<what>__<object>       an anchor of that object (anchor_light__lamp_arm)
//   col_<shape>_<name>__<object>  a collision proxy of that object (col_cyl_pole__lamp_arm)
//   <part>__<object>              a moving part, shown at every level (none in these two sets)
//
// In the file the objects stand in rows about a metre apart (the built set is its own contact
// sheet); asset.extras.objects[<object>] repeats class, mass, lods, lod_distances and gives
// `origin`, the object's place in the file in game axes. PROP_SET_OBJECTS below is the same
// table typed out for code that plans without loading files: the city assembler, the physics
// and the street lighting work from it.
//
// Classes: 'fixed' never moves (big poles, barriers); 'knockable' breaks from its base and
// tumbles when a car hits it (mass in kilograms); 'scatter' is light debris (mass too).
// Lamp roles are materials (lamp_<group>): setLamp(instance, group, on).
// Sign anchors (anchor_sign*) sit on the blank face, point out of it, and carry width, height
// (metres) and shape in their userData: the game paints the face there.
// Directions: a lamp's arm reaches over the road in front of it (-Z in the game); signal
// lenses and sign faces look towards -Z, and a mast arm reaches to the object's right (+X),
// which is over the road for right-hand traffic.

/** @type {Record<string, import('./index.js').AssetEntry>} */
export const PROP_ASSETS = {
  // A 6.2 m street lamp: tapered steel pole on a cast base, a curved arm and an LED head.
  // lamp_main is the glowing diffuser; anchor_light is where its light comes from, pointing down.
  // (The same design, lighter and with a far level, is lamp_arm in set_street_lighting.)
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
  // Street lighting set: five lamps and a utility pole (see PROP_SET_OBJECTS).
  // Budget raised because it is six objects in one file: 6,726 triangles and 12 draw calls
  // when all six are drawn at level 0 (each object alone is at most 1,536 and 2).
  set_street_lighting: {
    file: 'props/set_street_lighting.glb',
    kind: 'prop',
    lods: 3,
    maxTriangles: 7500,
    maxDraws: 16,
    maxBytes: 480000,
    nodes: [
      'lamp_wall', 'lamp_wall_lod0', 'lamp_wall_lod1', 'lamp_wall_lod2',
      'lamp_park', 'lamp_park_lod0', 'lamp_park_lod1', 'lamp_park_lod2',
      'lamp_promenade', 'lamp_promenade_lod0', 'lamp_promenade_lod1', 'lamp_promenade_lod2',
      'lamp_arm', 'lamp_arm_lod0', 'lamp_arm_lod1', 'lamp_arm_lod2',
      'lamp_avenue', 'lamp_avenue_lod0', 'lamp_avenue_lod1', 'lamp_avenue_lod2',
      'utility_pole', 'utility_pole_lod0', 'utility_pole_lod1', 'utility_pole_lod2',
    ],
    anchors: [
      'anchor_light__lamp_wall', 'anchor_mount__lamp_wall',
      'anchor_light__lamp_park',
      'anchor_light__lamp_promenade',
      'anchor_light__lamp_arm',
      'anchor_light_1__lamp_avenue', 'anchor_light_2__lamp_avenue',
      'anchor_light__utility_pole',
      'anchor_wire_1__utility_pole', 'anchor_wire_2__utility_pole', 'anchor_wire_3__utility_pole',
    ],
    colliders: [
      'col_box_shade__lamp_wall',
      'col_cyl_pole__lamp_park',
      'col_cyl_pole__lamp_promenade',
      'col_cyl_pole__lamp_arm',
      'col_cyl_pole__lamp_avenue',
      'col_cyl_pole__utility_pole', 'col_box_transformer__utility_pole',
    ],
    materials: ['atlas', 'lamp_main'],
  },
  // Traffic control set: signals, sign posts, bollards, barrier, cone and barrel (see
  // PROP_SET_OBJECTS). Budget raised because it is nineteen objects in one file: 8,296
  // triangles and 28 draw calls when all are drawn at level 0 (the mast signal alone is 2,416
  // and 4: atlas and its three lamp roles; the gantry 1,476 and 1; a sign post about 100 and 1),
  // and 699,848 bytes, mostly the geometry of nineteen objects at three levels each (13,161
  // triangles in all); the 1024 atlas is about 130 kB.
  set_traffic_control: {
    file: 'props/set_traffic_control.glb',
    kind: 'prop',
    lods: 3,
    maxTriangles: 8600,
    maxDraws: 32,
    maxBytes: 720000,
    nodes: [
      'traffic_cone', 'traffic_cone_lod0', 'traffic_cone_lod1', 'traffic_cone_lod2',
      'traffic_barrel', 'traffic_barrel_lod0', 'traffic_barrel_lod1', 'traffic_barrel_lod2',
      'bollard_steel', 'bollard_steel_lod0', 'bollard_steel_lod1', 'bollard_steel_lod2',
      'bollard_concrete', 'bollard_concrete_lod0', 'bollard_concrete_lod1', 'bollard_concrete_lod2',
      'jersey_barrier', 'jersey_barrier_lod0', 'jersey_barrier_lod1',
      'sign_octagon', 'sign_octagon_lod0', 'sign_octagon_lod1', 'sign_octagon_lod2',
      'sign_triangle', 'sign_triangle_lod0', 'sign_triangle_lod1', 'sign_triangle_lod2',
      'sign_round', 'sign_round_lod0', 'sign_round_lod1', 'sign_round_lod2',
      'sign_rectangle', 'sign_rectangle_lod0', 'sign_rectangle_lod1', 'sign_rectangle_lod2',
      'sign_diamond', 'sign_diamond_lod0', 'sign_diamond_lod1', 'sign_diamond_lod2',
      'street_name_post', 'street_name_post_lod0', 'street_name_post_lod1', 'street_name_post_lod2',
      'pedestrian_signal', 'pedestrian_signal_lod0', 'pedestrian_signal_lod1', 'pedestrian_signal_lod2',
      'traffic_signal_post', 'traffic_signal_post_lod0', 'traffic_signal_post_lod1', 'traffic_signal_post_lod2',
      'traffic_signal_mast', 'traffic_signal_mast_lod0', 'traffic_signal_mast_lod1', 'traffic_signal_mast_lod2',
    ],
    anchors: [
      'anchor_sign__sign_octagon', 'anchor_sign__sign_triangle', 'anchor_sign__sign_round',
      'anchor_sign__sign_rectangle', 'anchor_sign__sign_diamond',
      'anchor_sign_1__street_name_post', 'anchor_sign_2__street_name_post',
      'anchor_use__pedestrian_signal',
    ],
    colliders: [
      'col_cyl_body__traffic_cone', 'col_cyl_body__traffic_barrel',
      'col_cyl_body__bollard_steel', 'col_cyl_body__bollard_concrete',
      'col_box_body__jersey_barrier',
      'col_cyl_post__sign_octagon', 'col_cyl_post__sign_triangle', 'col_cyl_post__sign_round',
      'col_cyl_post__sign_rectangle', 'col_cyl_post__sign_diamond',
      'col_cyl_post__street_name_post',
      'col_cyl_pole__pedestrian_signal', 'col_cyl_pole__traffic_signal_post',
      'col_cyl_pole__traffic_signal_mast',
    ],
    materials: ['atlas', 'lamp_red', 'lamp_amber', 'lamp_green', 'lamp_walk', 'lamp_stop'],
  },
};

/**
 * One object of a prop set.
 * @typedef {object} PropSetObject
 * @property {'fixed' | 'knockable' | 'scatter'} class How the game treats it when hit.
 * @property {number} [mass] Kilograms, for knockable and scatter objects.
 * @property {number} lods How many levels the object has (<object>_lod0 ...).
 * @property {number[]} size Width (X), height (Y) and depth (Z) in metres, in game axes.
 * @property {string[]} anchors Its anchors, without the "__<object>" ending.
 * @property {string[]} colliders Its collision proxies, without the "__<object>" ending.
 * @property {string[]} lamps Its lamp groups (setLamp names).
 * @property {string} note What it is and where it belongs.
 */

/**
 * Every object of every prop set, by set id and object name.
 * @type {Readonly<Record<string, Record<string, PropSetObject>>>}
 */
export const PROP_SET_OBJECTS = Object.freeze({
  set_street_lighting: {
    lamp_wall: {
      class: 'fixed', lods: 3, size: [0.44, 0.35, 0.77],
      anchors: ['anchor_light', 'anchor_mount'], colliders: ['col_box_shade'], lamps: ['main'],
      note: 'Gooseneck alley lamp, modelled 3 m up a wall on the plane z = 0: anchor_mount is its fixing point (lower the clone by 3 m minus the height wanted).',
    },
    lamp_park: {
      class: 'knockable', mass: 58, lods: 3, size: [0.61, 3.67, 0.6],
      anchors: ['anchor_light'], colliders: ['col_cyl_pole'], lamps: ['main'],
      note: 'Dark green post-top lamp for parks, squares and housing courts; point light at 3.3 m.',
    },
    lamp_promenade: {
      class: 'knockable', mass: 140, lods: 3, size: [0.66, 4.28, 0.44],
      anchors: ['anchor_light'], colliders: ['col_cyl_pole'], lamps: ['main'],
      note: 'Cream cast column with a caged globe for the beachfront; point light at 3.8 m.',
    },
    lamp_arm: {
      class: 'fixed', lods: 3, size: [0.5, 6.03, 2.29],
      anchors: ['anchor_light'], colliders: ['col_cyl_pole'], lamps: ['main'],
      note: 'The 6 m teal street lamp: its arm reaches 2 m towards -Z; spot light pointing down from 5.9 m.',
    },
    lamp_avenue: {
      class: 'fixed', lods: 3, size: [0.68, 10.47, 5.72],
      anchors: ['anchor_light_1', 'anchor_light_2'], colliders: ['col_cyl_pole'], lamps: ['main'],
      note: 'A 10.4 m galvanised mast with two arms (towards -Z and +Z) for medians of wide avenues; two spot lights.',
    },
    utility_pole: {
      class: 'fixed', lods: 3, size: [0.93, 10.83, 3.75],
      anchors: ['anchor_light', 'anchor_wire_1', 'anchor_wire_2', 'anchor_wire_3'],
      colliders: ['col_cyl_pole', 'col_box_transformer'], lamps: ['main'],
      note: 'Timber pole with cross-arm, transformer and a street-light arm towards -Z; wires run along X between the anchor_wire_1..3 of neighbouring poles.',
    },
  },
  set_traffic_control: {
    traffic_cone: {
      class: 'scatter', mass: 3.5, lods: 3, size: [0.37, 0.71, 0.37],
      anchors: [], colliders: ['col_cyl_body'], lamps: [],
      note: 'Orange cone with a reflective collar on a rubber foot.',
    },
    traffic_barrel: {
      class: 'knockable', mass: 14, lods: 3, size: [0.75, 1.01, 0.73],
      anchors: [], colliders: ['col_cyl_body'], lamps: [],
      note: 'Tiered orange drum with reflective bands and a tyre base, for road works.',
    },
    bollard_steel: {
      class: 'fixed', lods: 3, size: [0.28, 1.08, 0.28],
      anchors: [], colliders: ['col_cyl_body'], lamps: [],
      note: 'Yellow pipe bollard on a bolted flange; stops cars.',
    },
    bollard_concrete: {
      class: 'fixed', lods: 3, size: [0.33, 0.9, 0.32],
      anchors: [], colliders: ['col_cyl_body'], lamps: [],
      note: 'Turned concrete bollard for plazas and the promenade; stops cars.',
    },
    jersey_barrier: {
      class: 'fixed', lods: 2, size: [3.14, 0.87, 0.61],
      anchors: [], colliders: ['col_box_body'], lamps: [],
      note: 'A 3 m length of concrete safety barrier along X; lay end to end at a 3.0 m pitch.',
    },
    sign_octagon: {
      class: 'knockable', mass: 16, lods: 3, size: [0.75, 2.85, 0.07],
      anchors: ['anchor_sign'], colliders: ['col_cyl_post'], lamps: [],
      note: 'Red octagon with a white edge, 0.75 m across, centre 2.475 m up.',
    },
    sign_triangle: {
      class: 'knockable', mass: 15, lods: 3, size: [0.9, 2.88, 0.07],
      anchors: ['anchor_sign'], colliders: ['col_cyl_post'], lamps: [],
      note: 'White triangle, point down, with a broad red edge; 0.9 m sides.',
    },
    sign_round: {
      class: 'knockable', mass: 14, lods: 3, size: [0.6, 2.7, 0.07],
      anchors: ['anchor_sign'], colliders: ['col_cyl_post'], lamps: [],
      note: 'White disc with a red ring, 0.6 m across.',
    },
    sign_rectangle: {
      class: 'knockable', mass: 15, lods: 3, size: [0.6, 2.85, 0.07],
      anchors: ['anchor_sign'], colliders: ['col_cyl_post'], lamps: [],
      note: 'White upright panel with a black edge, 0.6 by 0.75 m.',
    },
    sign_diamond: {
      class: 'knockable', mass: 16, lods: 3, size: [1.06, 3.16, 0.07],
      anchors: ['anchor_sign'], colliders: ['col_cyl_post'], lamps: [],
      note: 'Yellow diamond with a black edge, 0.75 m sides.',
    },
    street_name_post: {
      class: 'knockable', mass: 18, lods: 3, size: [0.9, 3.5, 0.9],
      anchors: ['anchor_sign_1', 'anchor_sign_2'], colliders: ['col_cyl_post'], lamps: [],
      note: 'Two crossed green blades, 0.9 by 0.2 m, green on both sides: anchor_sign_1 looks to -Z (blade along X, 3.15 m up), anchor_sign_2 to +X (blade along Z, 3.38 m up).',
    },
    pedestrian_signal: {
      class: 'knockable', mass: 55, lods: 3, size: [0.37, 3.01, 0.55],
      anchors: ['anchor_use'], colliders: ['col_cyl_pole'], lamps: ['stop', 'walk'],
      note: 'Two-lens walker signal looking to -Z (stop above, walk below); the push button is on the back, where anchor_use stands.',
    },
    traffic_signal_post: {
      class: 'knockable', mass: 95, lods: 3, size: [0.4, 4.12, 0.56],
      anchors: [], colliders: ['col_cyl_pole'], lamps: ['red', 'amber', 'green'],
      note: 'Three-lens head on a 3 m pedestal, looking to -Z.',
    },
    traffic_signal_mast: {
      class: 'fixed', lods: 3, size: [7.92, 6.88, 1.17],
      anchors: [], colliders: ['col_cyl_pole'], lamps: ['red', 'amber', 'green'],
      note: 'Mast at the origin with a 7.4 m arm towards +X at 5.9 to 6.2 m: heads over the road at x = 4.4 and 7.0 and one on the post at 3.45 m, all looking to -Z.',
    },
  },
});

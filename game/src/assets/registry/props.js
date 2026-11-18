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
//   <part>__<object>              a moving part, shown at every level, turning about its own
//                                 origin (hour_1__street_clock, leaf__fence_gate)
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
      'water_barrier', 'water_barrier_lod0', 'water_barrier_lod1', 'water_barrier_lod2',
      'work_barricade', 'work_barricade_lod0', 'work_barricade_lod1', 'work_barricade_lod2',
      'guard_rail', 'guard_rail_lod0', 'guard_rail_lod1', 'guard_rail_lod2',
      'sign_octagon', 'sign_octagon_lod0', 'sign_octagon_lod1', 'sign_octagon_lod2',
      'sign_triangle', 'sign_triangle_lod0', 'sign_triangle_lod1', 'sign_triangle_lod2',
      'sign_round', 'sign_round_lod0', 'sign_round_lod1', 'sign_round_lod2',
      'sign_rectangle', 'sign_rectangle_lod0', 'sign_rectangle_lod1', 'sign_rectangle_lod2',
      'sign_diamond', 'sign_diamond_lod0', 'sign_diamond_lod1', 'sign_diamond_lod2',
      'street_name_post', 'street_name_post_lod0', 'street_name_post_lod1', 'street_name_post_lod2',
      'parking_meter', 'parking_meter_lod0', 'parking_meter_lod1', 'parking_meter_lod2',
      'pedestrian_signal', 'pedestrian_signal_lod0', 'pedestrian_signal_lod1', 'pedestrian_signal_lod2',
      'traffic_signal_post', 'traffic_signal_post_lod0', 'traffic_signal_post_lod1', 'traffic_signal_post_lod2',
      'traffic_signal_mast', 'traffic_signal_mast_lod0', 'traffic_signal_mast_lod1', 'traffic_signal_mast_lod2',
      'sign_gantry', 'sign_gantry_lod0', 'sign_gantry_lod1', 'sign_gantry_lod2',
    ],
    anchors: [
      'anchor_sign__sign_octagon', 'anchor_sign__sign_triangle', 'anchor_sign__sign_round',
      'anchor_sign__sign_rectangle', 'anchor_sign__sign_diamond',
      'anchor_sign_1__street_name_post', 'anchor_sign_2__street_name_post',
      'anchor_use__pedestrian_signal', 'anchor_use__parking_meter',
      'anchor_sign_1__sign_gantry', 'anchor_sign_2__sign_gantry',
    ],
    colliders: [
      'col_cyl_body__traffic_cone', 'col_cyl_body__traffic_barrel',
      'col_cyl_body__bollard_steel', 'col_cyl_body__bollard_concrete',
      'col_box_body__jersey_barrier', 'col_box_body__water_barrier',
      'col_box_body__work_barricade', 'col_box_rail__guard_rail',
      'col_cyl_body__parking_meter',
      'col_cyl_post_1__sign_gantry', 'col_cyl_post_2__sign_gantry',
      'col_cyl_post__sign_octagon', 'col_cyl_post__sign_triangle', 'col_cyl_post__sign_round',
      'col_cyl_post__sign_rectangle', 'col_cyl_post__sign_diamond',
      'col_cyl_post__street_name_post',
      'col_cyl_pole__pedestrian_signal', 'col_cyl_pole__traffic_signal_post',
      'col_cyl_pole__traffic_signal_mast',
    ],
    materials: ['atlas', 'lamp_red', 'lamp_amber', 'lamp_green', 'lamp_walk', 'lamp_stop', 'lamp_warn'],
  },
  // Sidewalk set: benches, bins, hydrant, boxes, kiosk, shelter, bikes, planters, castings, clock
  // (see PROP_SET_OBJECTS). Budget raised because it is nineteen objects in one file: 7,071
  // triangles and 28 draw calls when all are drawn at level 0 (an object alone is at most 958
  // and 3: atlas, glass and lamp_panel), and 611,060 bytes, mostly geometry (462,598).
  set_sidewalk: {
    file: 'props/set_sidewalk.glb',
    kind: 'prop',
    lods: 3,
    maxTriangles: 7600,
    maxDraws: 34,
    maxBytes: 680000,
    nodes: [
      'tree_grate', 'tree_grate_lod0', 'tree_grate_lod1',
      'manhole_cover', 'manhole_cover_lod0', 'manhole_cover_lod1',
      'storm_drain', 'storm_drain_lod0', 'storm_drain_lod1',
      'planter_box', 'planter_box_lod0', 'planter_box_lod1',
      'planter_round', 'planter_round_lod0', 'planter_round_lod1',
      'fire_hydrant', 'fire_hydrant_lod0', 'fire_hydrant_lod1', 'fire_hydrant_lod2',
      'bin_round', 'bin_round_lod0', 'bin_round_lod1', 'bin_round_lod2',
      'bin_box', 'bin_box_lod0', 'bin_box_lod1', 'bin_box_lod2',
      'mailbox', 'mailbox_lod0', 'mailbox_lod1', 'mailbox_lod2',
      'newspaper_box', 'newspaper_box_lod0', 'newspaper_box_lod1', 'newspaper_box_lod2',
      'ticket_machine', 'ticket_machine_lod0', 'ticket_machine_lod1', 'ticket_machine_lod2',
      'drinking_fountain', 'drinking_fountain_lod0', 'drinking_fountain_lod1',
      'bench_slat', 'bench_slat_lod0', 'bench_slat_lod1', 'bench_slat_lod2',
      'bench_concrete', 'bench_concrete_lod0', 'bench_concrete_lod1',
      'bike_rack', 'bike_rack_lod0', 'bike_rack_lod1', 'bike_rack_lod2',
      'bicycle', 'bicycle_lod0', 'bicycle_lod1', 'bicycle_lod2',
      'phone_kiosk', 'phone_kiosk_lod0', 'phone_kiosk_lod1', 'phone_kiosk_lod2',
      'street_clock', 'street_clock_lod0', 'street_clock_lod1', 'street_clock_lod2',
      'hour_1__street_clock', 'minute_1__street_clock', 'hour_2__street_clock', 'minute_2__street_clock',
      'bus_shelter', 'bus_shelter_lod0', 'bus_shelter_lod1', 'bus_shelter_lod2',
    ],
    anchors: [
      'anchor_plant__planter_box', 'anchor_plant__planter_round', 'anchor_tree__tree_grate',
      'anchor_water__fire_hydrant',
      'anchor_use__mailbox', 'anchor_use__newspaper_box', 'anchor_use__ticket_machine',
      'anchor_use__drinking_fountain', 'anchor_use__phone_kiosk', 'anchor_sign__phone_kiosk',
      'anchor_seat_1__bench_slat', 'anchor_seat_2__bench_slat', 'anchor_seat_3__bench_slat',
      'anchor_seat_1__bench_concrete', 'anchor_seat_2__bench_concrete',
      'anchor_seat_1__bus_shelter', 'anchor_seat_2__bus_shelter', 'anchor_seat_3__bus_shelter',
      'anchor_sign_1__bus_shelter', 'anchor_sign_2__bus_shelter',
      'anchor_bike_1__bike_rack', 'anchor_bike_2__bike_rack', 'anchor_bike_3__bike_rack',
      'anchor_face_1__street_clock', 'anchor_face_2__street_clock',
    ],
    colliders: [
      'col_box_body__planter_box', 'col_cyl_body__planter_round',
      'col_cyl_body__fire_hydrant', 'col_cyl_body__bin_round', 'col_box_body__bin_box',
      'col_box_body__mailbox', 'col_box_body__newspaper_box', 'col_box_body__ticket_machine',
      'col_box_body__drinking_fountain', 'col_box_body__bench_slat', 'col_box_body__bench_concrete',
      'col_box_body__bike_rack', 'col_box_body__bicycle', 'col_box_body__phone_kiosk',
      'col_cyl_pole__street_clock',
      'col_box_back__bus_shelter', 'col_box_end__bus_shelter', 'col_box_advert__bus_shelter',
    ],
    materials: ['atlas', 'glass', 'lamp_panel'],
  },
  // Alley and yard set: dumpsters, bins, bags, cartons, pallets, crate, drums, tyres, gas,
  // site toilet, wall-mounted air conditioners and gas meter, chain-link fence and gate (see
  // PROP_SET_OBJECTS). Budget raised because it is nineteen objects in one file: 7,260
  // triangles and 22 draw calls when all are drawn at level 0, and 693,880 bytes (475,608
  // geometry; the 1024 base map is larger than usual because the chain-link cutout is baked at
  // 1.7 times the texel density to keep its wires).
  set_alley_and_yard: {
    file: 'props/set_alley_and_yard.glb',
    kind: 'prop',
    lods: 3,
    maxTriangles: 8000,
    maxDraws: 34,
    maxBytes: 700000,
    nodes: [
      'cardboard_box', 'cardboard_box_lod0', 'cardboard_box_lod1',
      'cardboard_stack', 'cardboard_stack_lod0', 'cardboard_stack_lod1',
      'crate_wood', 'crate_wood_lod0', 'crate_wood_lod1',
      'bin_bags', 'bin_bags_lod0', 'bin_bags_lod1', 'bin_bags_lod2',
      'tyre_stack', 'tyre_stack_lod0', 'tyre_stack_lod1', 'tyre_stack_lod2',
      'drum_oil', 'drum_oil_lod0', 'drum_oil_lod1', 'drum_oil_lod2',
      'drum_rusty', 'drum_rusty_lod0', 'drum_rusty_lod1', 'drum_rusty_lod2',
      'gas_cylinders', 'gas_cylinders_lod0', 'gas_cylinders_lod1', 'gas_cylinders_lod2',
      'wheelie_bin', 'wheelie_bin_lod0', 'wheelie_bin_lod1', 'wheelie_bin_lod2',
      'pallet', 'pallet_lod0', 'pallet_lod1',
      'pallet_stack', 'pallet_stack_lod0', 'pallet_stack_lod1', 'pallet_stack_lod2',
      'dumpster_closed', 'dumpster_closed_lod0', 'dumpster_closed_lod1', 'dumpster_closed_lod2',
      'dumpster_open', 'dumpster_open_lod0', 'dumpster_open_lod1', 'dumpster_open_lod2',
      'portable_toilet', 'portable_toilet_lod0', 'portable_toilet_lod1', 'portable_toilet_lod2',
      'ac_condenser', 'ac_condenser_lod0', 'ac_condenser_lod1', 'ac_condenser_lod2',
      'ac_window', 'ac_window_lod0', 'ac_window_lod1', 'ac_window_lod2',
      'gas_meter', 'gas_meter_lod0', 'gas_meter_lod1', 'gas_meter_lod2',
      'fence_panel', 'fence_panel_lod0', 'fence_panel_lod1', 'fence_panel_lod2',
      'fence_gate', 'fence_gate_lod0', 'fence_gate_lod1', 'fence_gate_lod2', 'leaf__fence_gate',
    ],
    anchors: [
      'anchor_door__portable_toilet',
      'anchor_mount__ac_condenser', 'anchor_mount__ac_window', 'anchor_mount__gas_meter',
    ],
    colliders: [
      'col_box_body__cardboard_box', 'col_box_body__cardboard_stack', 'col_box_body__crate_wood',
      'col_box_body__bin_bags', 'col_cyl_body__tyre_stack', 'col_cyl_body__drum_oil',
      'col_cyl_body__drum_rusty', 'col_box_body__gas_cylinders', 'col_box_body__wheelie_bin',
      'col_box_body__pallet', 'col_box_body__pallet_stack',
      'col_box_body__dumpster_closed', 'col_box_body__dumpster_open',
      'col_box_body__portable_toilet', 'col_box_body__ac_condenser', 'col_box_body__ac_window',
      'col_box_body__gas_meter', 'col_box_body__fence_panel',
      'col_cyl_post_1__fence_gate', 'col_cyl_post_2__fence_gate', 'col_box_leaf__fence_gate',
    ],
    materials: ['atlas', 'cutout_chainlink'],
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
    water_barrier: {
      class: 'knockable', mass: 420, lods: 3, size: [1.97, 1.01, 0.51],
      anchors: [], colliders: ['col_box_body'], lamps: [],
      note: 'Red-orange water-filled plastic barrier, a 1.8 m body along X with interlocking knuckles; lay end to end at a 1.9 m pitch. 420 kg filled.',
    },
    work_barricade: {
      class: 'knockable', mass: 14, lods: 3, size: [1.2, 1.38, 0.8],
      anchors: [], colliders: ['col_box_body'], lamps: ['warn'],
      note: 'Folding road-works barricade: two diagonal-striped boards facing -Z on A-frame legs, and a flashing amber lamp on the left leg (lamp_warn: blink it at night).',
    },
    guard_rail: {
      class: 'fixed', lods: 3, size: [4.0, 0.8, 0.43],
      anchors: [], colliders: ['col_box_rail'], lamps: [],
      note: 'A 4 m W-beam guard rail along X, its face towards -Z (the road) and its posts behind; lay end to end at a 4.0 m pitch (posts every 2 m).',
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
    parking_meter: {
      class: 'knockable', mass: 30, lods: 3, size: [0.2, 1.5, 0.18],
      anchors: ['anchor_use'], colliders: ['col_cyl_body'], lamps: [],
      note: 'Single-space meter at the kerb, its blank display facing -Z; anchor_use is where a walker stands to pay, 0.55 m in front of it.',
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
    sign_gantry: {
      class: 'fixed', lods: 3, size: [16.72, 8.3, 1.2],
      anchors: ['anchor_sign_1', 'anchor_sign_2'], colliders: ['col_cyl_post_1', 'col_cyl_post_2'], lamps: [],
      note: 'Freeway gantry over one three-lane carriageway: a truss spanning X between posts at x = -8 and +8 (the verge and the median). Two blank 4.8 by 2.6 m panels face -Z with centres 7.0 m up, anchor_sign_1 at x = +3.3 (the driver\'s left), anchor_sign_2 at x = -3.3; 5.7 m clear under them.',
    },
  },
  // Fronts face -Z (the walker who uses them). anchor_seat_N: where a walker sits, at the seat's
  // front edge, facing out; anchor_use: where a walker stands to use the thing, facing it.
  set_sidewalk: {
    tree_grate: {
      class: 'fixed', lods: 2, size: [1.24, 0.04, 1.24],
      anchors: ['anchor_tree'], colliders: [], lamps: [],
      note: 'Flat 1.2 m cast-iron grate round a 0.5 m trunk opening; set it flush with the pavement and stand a street tree at anchor_tree.',
    },
    manhole_cover: {
      class: 'fixed', lods: 2, size: [0.76, 0.02, 0.76],
      anchors: [], colliders: [], lamps: [],
      note: 'Flat patterned cast cover in its frame, 0.66 m across; for pavements and road lanes.',
    },
    storm_drain: {
      class: 'fixed', lods: 2, size: [0.92, 0.02, 0.46],
      anchors: [], colliders: [], lamps: [],
      note: 'Flat 0.9 by 0.4 m gully grate in its frame, slots along Z; lay it in the gutter along the kerb (long side along the kerb).',
    },
    planter_box: {
      class: 'fixed', lods: 2, size: [1.6, 0.55, 0.6],
      anchors: ['anchor_plant'], colliders: ['col_box_body'], lamps: [],
      note: 'Hollow concrete trough, 1.6 m along X; its soil top is 7 cm below the rim and empty: plant at anchor_plant (0.48 m up).',
    },
    planter_round: {
      class: 'fixed', lods: 2, size: [1.09, 0.62, 1.07],
      anchors: ['anchor_plant'], colliders: ['col_cyl_body'], lamps: [],
      note: 'Round concrete bowl planter, 1.1 m across, empty soil top at 0.54 m (anchor_plant).',
    },
    fire_hydrant: {
      class: 'knockable', mass: 110, lods: 3, size: [0.48, 0.85, 0.4],
      anchors: ['anchor_water'], colliders: ['col_cyl_body'], lamps: [],
      note: 'Red cast pillar hydrant, its pumper outlet towards -Z (the street). When knocked off, a water jet rises from anchor_water (the flange, pointing up).',
    },
    bin_round: {
      class: 'knockable', mass: 30, lods: 3, size: [0.51, 1.14, 0.51],
      anchors: [], colliders: ['col_cyl_body'], lamps: [],
      note: 'Green louvred steel litter bin on a pedestal, a raised rain lid over the throat.',
    },
    bin_box: {
      class: 'knockable', mass: 40, lods: 3, size: [0.52, 1.13, 0.46],
      anchors: [], colliders: ['col_box_body'], lamps: [],
      note: 'Square charcoal steel litter bin, throats front and back under a hood, a green door.',
    },
    mailbox: {
      class: 'knockable', mass: 85, lods: 3, size: [0.5, 1.24, 0.57],
      anchors: ['anchor_use'], colliders: ['col_box_body'], lamps: [],
      note: 'Slate-blue collection box on four feet, its chute and blank label towards -Z.',
    },
    newspaper_box: {
      class: 'knockable', mass: 35, lods: 3, size: [0.48, 1.09, 0.43],
      anchors: ['anchor_use'], colliders: ['col_box_body'], lamps: [],
      note: 'Ochre coin-operated newspaper box on legs, glazed door with papers inside towards -Z (replaces the single-file newspaper_box_a).',
    },
    ticket_machine: {
      class: 'knockable', mass: 160, lods: 3, size: [0.52, 1.63, 0.42],
      anchors: ['anchor_use'], colliders: ['col_box_body'], lamps: [],
      note: 'Pay-and-display machine for parking bays: screen, keypad, ticket cup towards -Z, solar lid on top.',
    },
    drinking_fountain: {
      class: 'fixed', lods: 2, size: [0.5, 0.98, 0.5],
      anchors: ['anchor_use'], colliders: ['col_box_body'], lamps: [],
      note: 'Concrete pedestal with a steel bowl and bubbler, for parks and the promenade.',
    },
    bench_slat: {
      class: 'knockable', mass: 70, lods: 3, size: [1.84, 0.89, 0.65],
      anchors: ['anchor_seat_1', 'anchor_seat_2', 'anchor_seat_3'], colliders: ['col_box_body'], lamps: [],
      note: 'Steel-and-wood slatted bench, 1.8 m along X, facing -Z; three seats 0.45 m up.',
    },
    bench_concrete: {
      class: 'fixed', lods: 2, size: [1.8, 0.46, 0.5],
      anchors: ['anchor_seat_1', 'anchor_seat_2'], colliders: ['col_box_body'], lamps: [],
      note: 'Concrete seat slab on two plinths, 1.8 m along X; two seats 0.46 m up, facing -Z (sit either side).',
    },
    bike_rack: {
      class: 'fixed', lods: 3, size: [1.9, 0.83, 0.82],
      anchors: ['anchor_bike_1', 'anchor_bike_2', 'anchor_bike_3'], colliders: ['col_box_body'], lamps: [],
      note: 'Three galvanised hoops along X, each in a Y-Z plane; place a bicycle clone at each anchor_bike_N (its forward = the bicycle\'s forward).',
    },
    bicycle: {
      class: 'knockable', mass: 13, lods: 3, size: [0.56, 0.96, 1.71],
      anchors: [], colliders: ['col_box_body'], lamps: [],
      note: 'Teal city bicycle upright on its kickstand, front wheel towards -Z.',
    },
    phone_kiosk: {
      class: 'knockable', mass: 140, lods: 3, size: [0.84, 2.18, 0.7],
      anchors: ['anchor_use', 'anchor_sign'], colliders: ['col_box_body'], lamps: ['panel'],
      note: 'Pay phone on a post with glass sides; lamp_panel lights it from under the hood at night; anchor_sign is the blank 0.74 by 0.16 m hood panel.',
    },
    street_clock: {
      class: 'fixed', lods: 3, size: [0.8, 4.36, 0.44],
      anchors: ['anchor_face_1', 'anchor_face_2'], colliders: ['col_cyl_pole'], lamps: [],
      note: 'Dark green cast post clock, faces 3.75 m up towards -Z (face_1) and +Z (face_2), radius 0.355 in the anchors. Hands hour_N__street_clock and minute_N__street_clock stand at twelve; turn them about their origin, about the face anchor\'s forward axis.',
    },
    bus_shelter: {
      class: 'fixed', lods: 3, size: [3.8, 2.5, 1.68],
      anchors: ['anchor_seat_1', 'anchor_seat_2', 'anchor_seat_3', 'anchor_sign_1', 'anchor_sign_2'],
      colliders: ['col_box_back', 'col_box_end', 'col_box_advert'], lamps: ['panel'],
      note: 'A 3.6 m shelter along X, open side towards -Z (the kerb): glazed back and -X end, a lit advert box at +X (lamp_panel; anchor_sign_1 faces +X, anchor_sign_2 faces -X, 1.14 by 1.78 m each) and a perch bench.',
    },
  },
  // Fronts face -Z. Wall-mounted objects (ac_condenser, ac_window, gas_meter) are modelled
  // against a wall on the plane z = 0 behind them (they stand out towards -Z), at their usual
  // height above the wall foot, which is the object's origin; anchor_mount is the fixing point
  // on the wall face, its forward pointing out of the wall: to hang one, put anchor_mount on the
  // facade at the height wanted with that forward along the facade's outward normal.
  set_alley_and_yard: {
    cardboard_box: {
      class: 'scatter', mass: 2, lods: 2, size: [0.61, 0.4, 0.4],
      anchors: [], colliders: ['col_box_body'], lamps: [],
      note: 'A taped carton, 0.6 by 0.4 by 0.4 m.',
    },
    cardboard_stack: {
      class: 'scatter', mass: 12, lods: 2, size: [1.17, 0.72, 0.46],
      anchors: [], colliders: ['col_box_body'], lamps: [],
      note: 'Four cartons stacked two high, off true; for back doors, loading bays and shop fronts.',
    },
    crate_wood: {
      class: 'scatter', mass: 5, lods: 2, size: [0.6, 0.32, 0.4],
      anchors: [], colliders: ['col_box_body'], lamps: [],
      note: 'Open slatted produce crate, empty.',
    },
    bin_bags: {
      class: 'scatter', mass: 25, lods: 3, size: [1.02, 0.8, 1.05],
      anchors: [], colliders: ['col_box_body'], lamps: [],
      note: 'A slumped pile of five knotted black bags; beside dumpsters, bins and kerbs.',
    },
    tyre_stack: {
      class: 'knockable', mass: 40, lods: 3, size: [0.72, 0.77, 0.72],
      anchors: [], colliders: ['col_cyl_body'], lamps: [],
      note: 'Four car tyres stacked off true; garages and yards.',
    },
    drum_oil: {
      class: 'knockable', mass: 25, lods: 3, size: [0.59, 0.88, 0.58],
      anchors: [], colliders: ['col_cyl_body'], lamps: [],
      note: 'Blue-painted 200 l steel drum with rolling hoops and two bungs.',
    },
    drum_rusty: {
      class: 'knockable', mass: 25, lods: 3, size: [0.59, 0.88, 0.58],
      anchors: [], colliders: ['col_cyl_body'], lamps: [],
      note: 'The same drum rusted through; also the burn barrel of gang corners.',
    },
    gas_cylinders: {
      class: 'knockable', mass: 70, lods: 3, size: [0.77, 1.25, 0.37],
      anchors: [], colliders: ['col_box_body'], lamps: [],
      note: 'Two tall pale gas cylinders side by side along X with valve guards; behind restaurants and on sites.',
    },
    wheelie_bin: {
      class: 'knockable', mass: 15, lods: 3, size: [0.61, 1.04, 0.84],
      anchors: [], colliders: ['col_box_body'], lamps: [],
      note: 'Green 240 l two-wheeled bin, lid grip towards -Z, wheels and handle at +Z.',
    },
    pallet: {
      class: 'scatter', mass: 22, lods: 2, size: [1.2, 0.14, 0.8],
      anchors: [], colliders: ['col_box_body'], lamps: [],
      note: 'A 1.2 by 0.8 m block pallet, long side along X.',
    },
    pallet_stack: {
      class: 'knockable', mass: 66, lods: 3, size: [1.28, 0.43, 0.86],
      anchors: [], colliders: ['col_box_body'], lamps: [],
      note: 'Three pallets stacked off true.',
    },
    dumpster_closed: {
      class: 'knockable', mass: 220, lods: 3, size: [1.96, 1.25, 1.19],
      anchors: [], colliders: ['col_box_body'], lamps: [],
      note: 'Green front-load steel dumpster, 1.8 m along X, sloped front towards -Z, fork pockets on the sides, casters, both black lids shut. Cars shove it: knock it with its mass, do not break it from a base.',
    },
    dumpster_open: {
      class: 'knockable', mass: 240, lods: 3, size: [1.96, 2.36, 1.64],
      anchors: [], colliders: ['col_box_body'], lamps: [],
      note: 'The same dumpster with both lids thrown back towards +Z and bags showing over the rim; the collider is the body only.',
    },
    portable_toilet: {
      class: 'knockable', mass: 85, lods: 3, size: [1.18, 2.51, 1.18],
      anchors: ['anchor_door'], colliders: ['col_box_body'], lamps: [],
      note: 'Blue moulded site toilet on a skid, door towards -Z (anchor_door is where a walker stands, facing it), vent stack at the back corner.',
    },
    ac_condenser: {
      class: 'fixed', lods: 3, size: [0.93, 1.35, 0.46],
      anchors: ['anchor_mount'], colliders: ['col_box_body'], lamps: [],
      note: 'Wall-mounted split condenser on two brackets: the unit spans 2.19 to 2.75 m up and 0.08 to 0.38 m out from the wall, fan towards -Z, insulated pipes into the wall at +X; anchor_mount at 2.2 m on the wall face.',
    },
    ac_window: {
      class: 'fixed', lods: 3, size: [0.63, 0.73, 0.4],
      anchors: ['anchor_mount'], colliders: ['col_box_body'], lamps: [],
      note: 'Through-wall air-conditioning box on a strut bracket: 0.62 m wide, 1.0 to 1.42 m up, standing 0.35 m out of the wall; anchor_mount at 1.0 m on the wall face (a window sill height on upper floors too).',
    },
    gas_meter: {
      class: 'fixed', lods: 3, size: [0.54, 1.49, 0.26],
      anchors: ['anchor_mount'], colliders: ['col_box_body'], lamps: [],
      note: 'Grey gas meter (0.95 to 1.35 m up) with its yellow riser out of the ground at -X, regulator, valve and outlet into the wall; anchor_mount at 0.95 m on the wall face. Stand its origin on the pavement at the wall foot.',
    },
    fence_panel: {
      class: 'knockable', mass: 45, lods: 3, size: [2.68, 1.89, 0.18],
      anchors: [], colliders: ['col_box_body'], lamps: [],
      note: 'Chain-link panel 1.8 m high between two galvanised posts at x = -1.25 and +1.25 (cutout_chainlink, alpha-tested, double sided); lay end to end at a 2.5 m pitch (neighbouring posts coincide).',
    },
    fence_gate: {
      class: 'fixed', lods: 3, size: [1.5, 1.97, 0.18],
      anchors: [], colliders: ['col_cyl_post_1', 'col_cyl_post_2', 'col_box_leaf'], lamps: [],
      note: 'Chain-link gate: hinge post at x = -0.66, latch post at x = +0.66 (fits after a fence_panel run when placed 1.91 m on from the last panel centre). The leaf, leaf__fence_gate, turns about the vertical axis through its origin at the hinge (0 = shut); col_box_leaf covers the shut leaf: switch it off while the gate stands open.',
    },
  },
});

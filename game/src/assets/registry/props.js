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
  // Street wear set: decals for the city dressing to scatter (see PROP_SET_OBJECTS, `decal`):
  // oil and water stains, tyre marks, an asphalt patch, cracks, a manhole and a utility cover,
  // a storm drain, gum, cigarette ends, litter; two throw-ups and three tags in MARAZUL's own
  // invented lettering (they spell nothing), pasted posters and torn flyers (blank print bars),
  // a rust streak, a drip stain and rising damp; three weed tufts. Every decal is one quad (2 to
  // 8 triangles) with the one shared material cutout_decal, whose alpha is SOFT: draw it blended
  // (clone the material once: transparent true, depthWrite false, alphaTest 0, polygonOffset
  // -1/-1) and merge every decal of a sector into one mesh with its world matrices applied, so
  // all decals cost one draw. The weeds are crossed cards with the material cutout
  // (alpha-tested, double sided): merge them the same way for one more draw. Budget raised
  // because each object is its own node (26 draw calls if every object were drawn side by
  // side) and because the 2048 atlas is nearly all colour and alpha detail.
  set_street_wear: {
    file: 'props/set_street_wear.glb',
    kind: 'prop',
    lods: 1,
    maxTriangles: 600,
    maxDraws: 30,
    maxBytes: 900000,
    nodes: [
      'oil_stain_large', 'oil_stain_large_lod0', 'oil_stain_small', 'oil_stain_small_lod0',
      'wet_patch', 'wet_patch_lod0', 'gum_spots', 'gum_spots_lod0',
      'cigarette_butts', 'cigarette_butts_lod0', 'manhole_round', 'manhole_round_lod0',
      'utility_cover', 'utility_cover_lod0', 'storm_drain', 'storm_drain_lod0',
      'tyre_marks', 'tyre_marks_lod0', 'asphalt_patch', 'asphalt_patch_lod0',
      'crack_line', 'crack_line_lod0', 'crack_web', 'crack_web_lod0',
      'litter_scatter', 'litter_scatter_lod0',
      'graffiti_throwup_a', 'graffiti_throwup_a_lod0', 'graffiti_throwup_b', 'graffiti_throwup_b_lod0',
      'graffiti_tag_a', 'graffiti_tag_a_lod0', 'graffiti_tag_b', 'graffiti_tag_b_lod0',
      'graffiti_tag_c', 'graffiti_tag_c_lod0', 'poster_wall', 'poster_wall_lod0',
      'flyers_torn', 'flyers_torn_lod0', 'rust_streak', 'rust_streak_lod0',
      'drip_stain', 'drip_stain_lod0', 'damp_base', 'damp_base_lod0',
      'weeds_small', 'weeds_small_lod0', 'weeds_large', 'weeds_large_lod0',
      'weeds_kerb', 'weeds_kerb_lod0',
    ],
    anchors: [],
    colliders: [],
    materials: ['cutout_decal', 'cutout'],
  },
  // Yard clutter set: cinder blocks (single, stacked, broken), flattened cardboard (lying,
  // bundled, leaning on a wall), plastic crates, a roll-off skip heaped with rubble, a wire
  // shopping trolley, mattresses (leaning, dumped flat), loose tyres, a pallet fence and a
  // warning plate on a wall or a post (see PROP_SET_OBJECTS). The site toilet, tyre stack,
  // cartons and pallets are in set_alley_and_yard. Budget raised because it is seventeen
  // objects in one file: 6,110 triangles and 18 draw calls when all are drawn at level 0,
  // 274,708 bytes. The trolley's wire is cutout_wire (alpha-tested, double sided).
  set_yard_clutter: {
    file: 'props/set_yard_clutter.glb',
    kind: 'prop',
    lods: 3,
    maxTriangles: 9000,
    maxDraws: 26,
    maxBytes: 600000,
    nodes: [
      'cinder_block', 'cinder_block_lod0', 'cinder_block_lod1',
      'cinder_stack', 'cinder_stack_lod0', 'cinder_stack_lod1', 'cinder_stack_lod2',
      'cinder_broken', 'cinder_broken_lod0', 'cinder_broken_lod1',
      'plastic_crate', 'plastic_crate_lod0', 'plastic_crate_lod1',
      'crate_stack', 'crate_stack_lod0', 'crate_stack_lod1', 'crate_stack_lod2',
      'tyre_loose', 'tyre_loose_lod0', 'tyre_loose_lod1',
      'tyre_pile', 'tyre_pile_lod0', 'tyre_pile_lod1', 'tyre_pile_lod2',
      'cardboard_flat', 'cardboard_flat_lod0', 'cardboard_flat_lod1',
      'cardboard_bundle', 'cardboard_bundle_lod0', 'cardboard_bundle_lod1',
      'cardboard_leaning', 'cardboard_leaning_lod0', 'cardboard_leaning_lod1',
      'mattress_leaning', 'mattress_leaning_lod0', 'mattress_leaning_lod1',
      'mattress_flat', 'mattress_flat_lod0', 'mattress_flat_lod1',
      'warning_plate', 'warning_plate_lod0', 'warning_plate_lod1',
      'warning_post', 'warning_post_lod0', 'warning_post_lod1', 'warning_post_lod2',
      'skip', 'skip_lod0', 'skip_lod1', 'skip_lod2',
      'shopping_trolley', 'shopping_trolley_lod0', 'shopping_trolley_lod1', 'shopping_trolley_lod2',
      'pallet_fence', 'pallet_fence_lod0', 'pallet_fence_lod1', 'pallet_fence_lod2',
    ],
    anchors: ['anchor_sign__warning_plate', 'anchor_mount__warning_plate', 'anchor_sign__warning_post'],
    colliders: [
      'col_box_body__cinder_block', 'col_box_body__cinder_stack', 'col_box_body__cinder_broken',
      'col_box_body__plastic_crate', 'col_box_body__crate_stack', 'col_cyl_body__tyre_loose',
      'col_box_body__tyre_pile', 'col_box_body__cardboard_flat', 'col_box_body__cardboard_bundle',
      'col_box_body__cardboard_leaning', 'col_box_body__mattress_leaning',
      'col_box_body__mattress_flat', 'col_box_body__warning_plate', 'col_cyl_pole__warning_post',
      'col_box_body__skip', 'col_box_body__shopping_trolley', 'col_box_body__pallet_fence',
    ],
    materials: ['atlas', 'cutout_wire'],
  },
  // Port set: the container terminal (see PROP_SET_OBJECTS). Budget raised because it is eight
  // objects in one file, two of them very large (the crane stands 72.6 m and reaches 98 m) and
  // the containers keep their corrugation in geometry: 7,743 triangles and 11 draw calls when
  // all are drawn at level 0, 388,532 bytes (2048 base, 1024 normal, 512 ORM). The container
  // shells are the `paint` role: setPaint (or an instance colour) gives each box its line colour.
  set_port: {
    file: 'props/set_port.glb',
    kind: 'prop',
    lods: 3,
    maxTriangles: 16000,
    maxDraws: 22,
    maxBytes: 760000,
    nodes: [
      'container_20', 'container_20_lod0', 'container_20_lod1', 'container_20_lod2',
      'container_40', 'container_40_lod0', 'container_40_lod1', 'container_40_lod2',
      'container_stack', 'container_stack_lod0', 'container_stack_lod1', 'container_stack_lod2',
      'quay_crane', 'quay_crane_lod0', 'quay_crane_lod1', 'quay_crane_lod2',
      'steel_shed', 'steel_shed_lod0', 'steel_shed_lod1',
      'steel_shed_end', 'steel_shed_end_lod0', 'steel_shed_end_lod1',
      'forklift', 'forklift_lod0', 'forklift_lod1', 'forklift_lod2',
      'box_trailer', 'box_trailer_lod0', 'box_trailer_lod1', 'box_trailer_lod2',
      'container_chassis', 'container_chassis_lod0', 'container_chassis_lod1', 'container_chassis_lod2',
      'terminal_tractor', 'terminal_tractor_lod0', 'terminal_tractor_lod1', 'terminal_tractor_lod2',
    ],
    anchors: [
      'anchor_sign_a__container_20', 'anchor_sign_b__container_20', 'anchor_sign_door__container_20',
      'anchor_sign_a__container_40', 'anchor_sign_b__container_40', 'anchor_sign_door__container_40',
      'anchor_sign_a__container_stack', 'anchor_sign_b__container_stack',
      'anchor_cab__quay_crane', 'anchor_spreader__quay_crane',
      'anchor_sign__steel_shed', 'anchor_door__steel_shed', 'anchor_door__steel_shed_end',
      'anchor_seat__forklift', 'anchor_forks__forklift',
      'anchor_sign_a__box_trailer', 'anchor_sign_b__box_trailer', 'anchor_kingpin__box_trailer',
    ],
    colliders: [
      'col_box_body__container_20', 'col_box_body__container_40',
      'col_box_low__container_stack', 'col_box_top__container_stack',
      'col_box_leg_1__quay_crane', 'col_box_leg_2__quay_crane', 'col_box_leg_3__quay_crane',
      'col_box_leg_4__quay_crane',
      'col_box_body__steel_shed', 'col_box_body__steel_shed_end',
      'col_box_body__forklift', 'col_box_forks__forklift', 'col_box_body__box_trailer',
    ],
    materials: ['atlas', 'paint', 'lamp_flood'],
  },
  // Commerce set: what shops and cafes put out on the pavement (see PROP_SET_OBJECTS). Budget
  // raised because it is eleven objects in one file: 4,180 triangles and 15 draw calls when all
  // are drawn at level 0, 232,532 bytes (1024 atlas). paint_awning is the awning canvas, tinted
  // per shop with setPaint(instance, colour, 'paint_awning'); lamp_panel is the vending machines'
  // lit panel; glass the snack machine's front. Every name is an anchor_sign* face the game
  // paints (no lettering in the file).
  set_commerce: {
    file: 'props/set_commerce.glb',
    kind: 'prop',
    lods: 3,
    maxTriangles: 14000,
    maxDraws: 28,
    maxBytes: 520000,
    nodes: [
      'awning_shop', 'awning_shop_lod0', 'awning_shop_lod1',
      'aframe_board', 'aframe_board_lod0', 'aframe_board_lod1',
      'cafe_table', 'cafe_table_lod0', 'cafe_table_lod1',
      'cafe_chair', 'cafe_chair_lod0', 'cafe_chair_lod1',
      'cafe_set', 'cafe_set_lod0', 'cafe_set_lod1', 'cafe_set_lod2',
      'parasol_closed', 'parasol_closed_lod0', 'parasol_closed_lod1',
      'vending_drinks', 'vending_drinks_lod0', 'vending_drinks_lod1', 'vending_drinks_lod2',
      'vending_snacks', 'vending_snacks_lod0', 'vending_snacks_lod1', 'vending_snacks_lod2',
      'news_stand', 'news_stand_lod0', 'news_stand_lod1', 'news_stand_lod2',
      'hotdog_cart', 'hotdog_cart_lod0', 'hotdog_cart_lod1', 'hotdog_cart_lod2',
      'fruit_stall', 'fruit_stall_lod0', 'fruit_stall_lod1', 'fruit_stall_lod2',
    ],
    anchors: [
      'anchor_sign__awning_shop', 'anchor_mount__awning_shop',
      'anchor_sign_a__aframe_board', 'anchor_sign_b__aframe_board',
      'anchor_seat__cafe_chair', 'anchor_seat_1__cafe_set', 'anchor_seat_2__cafe_set',
      'anchor_seat_3__cafe_set',
      'anchor_sign__vending_drinks', 'anchor_use__vending_drinks', 'anchor_use__vending_snacks',
      'anchor_sign__news_stand', 'anchor_use__news_stand',
      'anchor_sign__fruit_stall', 'anchor_use__fruit_stall',
      'anchor_sign__hotdog_cart', 'anchor_use__hotdog_cart',
    ],
    colliders: [
      'col_box_body__awning_shop', 'col_box_body__aframe_board', 'col_cyl_body__cafe_table',
      'col_box_body__cafe_chair', 'col_cyl_table__cafe_set', 'col_cyl_chairs__cafe_set',
      'col_cyl_body__parasol_closed', 'col_box_body__vending_drinks', 'col_box_body__vending_snacks',
      'col_box_body__news_stand', 'col_box_body__fruit_stall', 'col_box_body__hotdog_cart',
    ],
    materials: ['atlas', 'paint_awning', 'lamp_panel', 'glass'],
  },
  // Roadside set: bus-stop pole, twin parking meter, two bollards, two cones, a roadworks
  // barrier, a newspaper box bank, a phone booth and a 12 x 4 m monopole billboard (see
  // PROP_SET_OBJECTS). Budget raised because it is ten objects in one file: 4,456 triangles and
  // 16 draws with every object at level 0 (the billboard alone is 1,440).
  set_roadside: {
    file: 'props/set_roadside.glb',
    kind: 'prop',
    lods: 3,
    maxTriangles: 8000,
    maxDraws: 30,
    maxBytes: 480000,
    nodes: [
      'bus_stop_pole', 'bus_stop_pole_lod0', 'bus_stop_pole_lod1', 'bus_stop_pole_lod2',
      'parking_meter_twin', 'parking_meter_twin_lod0', 'parking_meter_twin_lod1', 'parking_meter_twin_lod2',
      'bollard_stainless', 'bollard_stainless_lod0', 'bollard_stainless_lod1', 'bollard_stainless_lod2',
      'bollard_flex', 'bollard_flex_lod0', 'bollard_flex_lod1', 'bollard_flex_lod2',
      'cone_tall', 'cone_tall_lod0', 'cone_tall_lod1', 'cone_tall_lod2',
      'cone_stack', 'cone_stack_lod0', 'cone_stack_lod1', 'cone_stack_lod2',
      'roadworks_barrier', 'roadworks_barrier_lod0', 'roadworks_barrier_lod1', 'roadworks_barrier_lod2',
      'newspaper_bank', 'newspaper_bank_lod0', 'newspaper_bank_lod1', 'newspaper_bank_lod2',
      'phone_booth', 'phone_booth_lod0', 'phone_booth_lod1', 'phone_booth_lod2',
      'billboard_monopole', 'billboard_monopole_lod0', 'billboard_monopole_lod1', 'billboard_monopole_lod2',
    ],
    anchors: [
      'anchor_sign_a__bus_stop_pole', 'anchor_sign_b__bus_stop_pole', 'anchor_routes__bus_stop_pole',
      'anchor_timetable__bus_stop_pole',
      'anchor_use_a__parking_meter_twin', 'anchor_use_b__parking_meter_twin',
      'anchor_sign_1__newspaper_bank', 'anchor_sign_2__newspaper_bank', 'anchor_sign_3__newspaper_bank',
      'anchor_use__newspaper_bank',
      'anchor_sign__phone_booth', 'anchor_use__phone_booth',
      'anchor_sign__billboard_monopole', 'anchor_light_1__billboard_monopole',
      'anchor_light_2__billboard_monopole', 'anchor_light_3__billboard_monopole',
      'anchor_light_4__billboard_monopole',
    ],
    colliders: [
      'col_cyl_pole__bus_stop_pole', 'col_cyl_post__parking_meter_twin', 'col_box_heads__parking_meter_twin',
      'col_cyl_body__bollard_stainless', 'col_cyl_body__bollard_flex', 'col_cyl_body__cone_tall',
      'col_cyl_body__cone_stack', 'col_box_body__roadworks_barrier', 'col_box_body__newspaper_bank',
      'col_box_body__phone_booth', 'col_cyl_footing__billboard_monopole',
      'col_cyl_pole__billboard_monopole', 'col_box_head__billboard_monopole',
    ],
    materials: ['atlas', 'glass', 'cutout_mesh', 'lamp_booth', 'lamp_flood'],
  },
  // Construction set: scaffold bay, cement mixer, generator, two cable reels, a pipe stack, a
  // dumped sofa and a temporary fence panel (see PROP_SET_OBJECTS). Budget raised because it is
  // eight objects in one file: 4,494 triangles and 9 draws with every object at level 0.
  set_construction: {
    file: 'props/set_construction.glb',
    kind: 'prop',
    lods: 3,
    maxTriangles: 9000,
    maxDraws: 24,
    maxBytes: 480000,
    nodes: [
      'scaffold_bay', 'scaffold_bay_lod0', 'scaffold_bay_lod1', 'scaffold_bay_lod2',
      'cement_mixer', 'cement_mixer_lod0', 'cement_mixer_lod1', 'cement_mixer_lod2',
      'generator', 'generator_lod0', 'generator_lod1', 'generator_lod2',
      'cable_reel', 'cable_reel_lod0', 'cable_reel_lod1', 'cable_reel_lod2',
      'cable_reel_small', 'cable_reel_small_lod0', 'cable_reel_small_lod1', 'cable_reel_small_lod2',
      'pipe_stack', 'pipe_stack_lod0', 'pipe_stack_lod1', 'pipe_stack_lod2',
      'sofa_broken', 'sofa_broken_lod0', 'sofa_broken_lod1', 'sofa_broken_lod2',
      'fence_portable', 'fence_portable_lod0', 'fence_portable_lod1', 'fence_portable_lod2',
    ],
    anchors: ['anchor_deck__scaffold_bay', 'anchor_use__generator', 'anchor_seat__sofa_broken'],
    colliders: [
      'col_box_frame_1__scaffold_bay', 'col_box_frame_2__scaffold_bay', 'col_box_deck__scaffold_bay',
      'col_box_body__cement_mixer', 'col_box_body__generator', 'col_box_body__cable_reel',
      'col_cyl_body__cable_reel_small', 'col_box_body__pipe_stack', 'col_box_body__sofa_broken',
      'col_box_body__fence_portable',
    ],
    materials: ['atlas', 'cutout_fence'],
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
 * @property {'ground' | 'wall' | 'weeds'} [decal] Set on decals (set_street_wear): never give
 *   them a collider. 'ground': a quad 4 mm above the ground facing up, centred on the origin;
 *   lay it on the surface with a random turn about Y. 'wall': a quad 4 mm in front of a wall on
 *   the plane z = 0 behind it (the object's local z; it faces -Z, out of the wall), at the
 *   height above the wall foot given in the note; stand the origin at the wall foot with -Z
 *   pointing out of the facade. 'weeds': small crossed cards standing on the ground.
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
  // Decals: class 'fixed' only because they never move; no colliders, one level. Sizes are
  // the quad (ground: width, 0, depth; wall: width, height, 0).
  set_street_wear: {
    oil_stain_large: {
      class: 'fixed', lods: 1, size: [1.4, 0, 1.0], decal: 'ground', anchors: [], colliders: [], lamps: [],
      note: 'Soaked-in oil pool with drips: under parked cars, in parking bays and at kerbs (a few per block, 1-2 per parking bay row).',
    },
    oil_stain_small: {
      class: 'fixed', lods: 1, size: [0.7, 0, 0.5], decal: 'ground', anchors: [], colliders: [], lamps: [],
      note: 'Small oil drip patch: lane centres near junction stop lines (every 6-10 m), driveways, garage aprons.',
    },
    wet_patch: {
      class: 'fixed', lods: 1, size: [1.6, 0, 1.0], decal: 'ground', anchors: [], colliders: [], lamps: [],
      note: 'Dark wet patch with a dried pale tide line: under AC units and downpipes, by hydrants, along the gutter.',
    },
    gum_spots: {
      class: 'fixed', lods: 1, size: [1.2, 0, 1.2], decal: 'ground', anchors: [], colliders: [], lamps: [],
      note: 'Trodden gum, grey-black dots: on pavements before shop doors, bus stops and crossings.',
    },
    cigarette_butts: {
      class: 'fixed', lods: 1, size: [0.6, 0, 0.6], decal: 'ground', anchors: [], colliders: [], lamps: [],
      note: 'Cigarette ends and ash: at doorways, benches, bus stops, alley mouths and the kerb.',
    },
    manhole_round: {
      class: 'fixed', lods: 1, size: [0.74, 0, 0.74], decal: 'ground', anchors: [], colliders: [], lamps: [],
      note: 'Cast-iron manhole cover, 0.72 m: in lanes (one every 30-60 m along the lane centre or wheel track) and pavements.',
    },
    utility_cover: {
      class: 'fixed', lods: 1, size: [0.64, 0, 0.64], decal: 'ground', anchors: [], colliders: [], lamps: [],
      note: 'Square steel tread-plate access cover: pavements, by lamp and signal posts, near building fronts.',
    },
    storm_drain: {
      class: 'fixed', lods: 1, size: [0.96, 0, 0.48], decal: 'ground', anchors: [], colliders: [], lamps: [],
      note: 'Gutter grate, long side along X: lay it in the gutter against the kerb (X along the kerb), one before each crossing and every 40-60 m.',
    },
    tyre_marks: {
      class: 'fixed', lods: 1, size: [4.0, 0, 2.0], decal: 'ground', anchors: [], colliders: [], lamps: [],
      note: 'A pair of curving skid marks a car track apart (1.54 m), fading in at -X: at junctions, bends and before crossings, along the lane (X along the lane).',
    },
    asphalt_patch: {
      class: 'fixed', lods: 1, size: [1.8, 0, 1.1], decal: 'ground', anchors: [], colliders: [], lamps: [],
      note: 'Newer, darker asphalt patch with tar-sealed seams: in lanes and over trenches; Barrio Hierro and the port many, Centro few.',
    },
    crack_line: {
      class: 'fixed', lods: 1, size: [2.4, 0, 0.5], decal: 'ground', anchors: [], colliders: [], lamps: [],
      note: 'Long crack with branches and hairlines: lanes, kerb lines and pavement joints; put weeds_small or weeds_kerb on it.',
    },
    crack_web: {
      class: 'fixed', lods: 1, size: [1.6, 0, 1.3], decal: 'ground', anchors: [], colliders: [], lamps: [],
      note: 'Alligator cracking, plates partly sunk: worn lanes, parking lots, alleys (Barrio Hierro, port).',
    },
    litter_scatter: {
      class: 'fixed', lods: 1, size: [1.6, 0, 1.2], decal: 'ground', anchors: [], colliders: [], lamps: [],
      note: 'Flattened paper scraps, wrappers, foil, a leaf: gutters, alley floors, around bins and dumpsters, under benches.',
    },
    graffiti_throwup_a: {
      class: 'fixed', lods: 1, size: [2.4, 1.1, 0], decal: 'wall', anchors: [], colliders: [], lamps: [],
      note: 'Silver bubble-letter throw-up with black outline and navy block, 0.35-1.45 m up: shutters, blank walls, under bridges, alley walls.',
    },
    graffiti_throwup_b: {
      class: 'fixed', lods: 1, size: [2.0, 1.0, 0], decal: 'wall', anchors: [], colliders: [], lamps: [],
      note: 'Pink-to-orange bubble-letter throw-up with teal block, 0.4-1.4 m up.',
    },
    graffiti_tag_a: {
      class: 'fixed', lods: 1, size: [1.0, 0.45, 0], decal: 'wall', anchors: [], colliders: [], lamps: [],
      note: 'Black sprayed handstyle tag, 1.1-1.55 m up: doors, shutters, electrical boxes, signal cabinets, walls.',
    },
    graffiti_tag_b: {
      class: 'fixed', lods: 1, size: [0.8, 0.4, 0], decal: 'wall', anchors: [], colliders: [], lamps: [],
      note: 'Silver tag, 1.2-1.6 m up.',
    },
    graffiti_tag_c: {
      class: 'fixed', lods: 1, size: [1.2, 0.5, 0], decal: 'wall', anchors: [], colliders: [], lamps: [],
      note: 'Red tag with overspray, 0.9-1.4 m up.',
    },
    poster_wall: {
      class: 'fixed', lods: 1, size: [1.9, 1.0, 0], decal: 'wall', anchors: [], colliders: [], lamps: [],
      note: 'Three pasted posters over torn older ones, 0.9-1.9 m up: hoardings, blank walls, closed shops, underpasses.',
    },
    flyers_torn: {
      class: 'fixed', lods: 1, size: [0.66, 0.65, 0], decal: 'wall', anchors: [], colliders: [], lamps: [],
      note: 'Stapled handbills, torn, one with tear-off tabs, 1.15-1.8 m up: by doors, on hoardings (on a pole, wrap is not modelled: use a flat post face).',
    },
    rust_streak: {
      class: 'fixed', lods: 1, size: [0.36, 1.4, 0], decal: 'wall', anchors: [], colliders: [], lamps: [],
      note: 'Rust running down from a fixing at 2.12 m, quad 0.8-2.2 m up: under AC brackets, railings, balconies, signs, roll-up door guides.',
    },
    drip_stain: {
      class: 'fixed', lods: 1, size: [0.6, 1.9, 0], decal: 'wall', anchors: [], colliders: [], lamps: [],
      note: 'Dark water and algae stain from a drip at 1.95 m down to the foot, quad 0.1-2.0 m up: under AC units, overflow pipes and window sills.',
    },
    damp_base: {
      class: 'fixed', lods: 1, size: [2.4, 0.8, 0], decal: 'wall', anchors: [], colliders: [], lamps: [],
      note: 'Rising damp at the wall foot (0-0.8 m): ragged tide line, salt bloom, algae; repeat along old walls with random X flips (Barrio Hierro, Viejo, port).',
    },
    weeds_small: {
      class: 'fixed', lods: 1, size: [0.28, 0.18, 0.24], decal: 'weeds', anchors: [], colliders: [], lamps: [],
      note: 'A small weed tuft (3 crossed cards): in cracks, at post feet, kerb joints and wall feet.',
    },
    weeds_large: {
      class: 'fixed', lods: 1, size: [0.49, 0.34, 0.47], decal: 'weeds', anchors: [], colliders: [], lamps: [],
      note: 'A bigger dry-tipped tuft: vacant lots, fence lines, alley corners, around skips and pallets.',
    },
    weeds_kerb: {
      class: 'fixed', lods: 1, size: [1.3, 0.14, 0.13], decal: 'weeds', anchors: [], colliders: [], lamps: [],
      note: 'A 1.3 m strip of grass along X: along the kerb-gutter joint and wall feet, end to end with gaps.',
    },
  },
  set_yard_clutter: {
    cinder_block: {
      class: 'scatter', mass: 13, lods: 2, size: [0.39, 0.19, 0.19],
      anchors: [], colliders: ['col_box_body'], lamps: [],
      note: 'One hollow concrete block (390 x 190 x 190 mm), cores open at the top.',
    },
    cinder_stack: {
      class: 'knockable', mass: 115, lods: 3, size: [0.81, 0.57, 0.4],
      anchors: [], colliders: ['col_box_body'], lamps: [],
      note: 'Nine blocks in three courses, the top two askew: yards, building sites, alley walls; also cover in firefights.',
    },
    cinder_broken: {
      class: 'scatter', mass: 40, lods: 2, size: [0.85, 0.28, 0.73],
      anchors: [], colliders: ['col_box_body'], lamps: [],
      note: 'Broken blocks: one whole on its side, two halves, chunks. Vacant lots, alley floors, beside skips.',
    },
    plastic_crate: {
      class: 'scatter', mass: 1.8, lods: 2, size: [0.62, 0.28, 0.42],
      anchors: [], colliders: ['col_box_body'], lamps: [],
      note: 'Red open moulded crate with hand holes: back doors of shops and bars, market stalls.',
    },
    crate_stack: {
      class: 'knockable', mass: 9, lods: 3, size: [1.38, 0.84, 0.61],
      anchors: [], colliders: ['col_box_body'], lamps: [],
      note: 'Three crates stacked off true (red, blue, red) and a blue one beside them at +X.',
    },
    tyre_loose: {
      class: 'scatter', mass: 9, lods: 2, size: [0.67, 0.17, 0.65],
      anchors: [], colliders: ['col_cyl_body'], lamps: [],
      note: 'One car tyre lying flat: verges, vacant lots, by garages.',
    },
    tyre_pile: {
      class: 'knockable', mass: 45, lods: 3, size: [1.51, 0.65, 0.93],
      anchors: [], colliders: ['col_box_body'], lamps: [],
      note: 'Five loose tyres heaped, one on edge at +X: tyre shops, yards, vacant lots.',
    },
    cardboard_flat: {
      class: 'scatter', mass: 1.5, lods: 2, size: [1.37, 0.09, 0.95],
      anchors: [], colliders: ['col_box_body'], lamps: [],
      note: 'Two flattened cartons lying on the ground, ends curled, one soaked dark: alleys, doorways (a sleeper\'s mat), beside bins.',
    },
    cardboard_bundle: {
      class: 'scatter', mass: 9, lods: 2, size: [0.97, 0.12, 0.68],
      anchors: [], colliders: ['col_box_body'], lamps: [],
      note: 'Flattened cartons stacked and tied with two cords: put out by shop back doors and kerbs for collection.',
    },
    cardboard_leaning: {
      class: 'scatter', mass: 3, lods: 2, size: [1.52, 1.18, 0.26],
      anchors: [], colliders: ['col_box_body'], lamps: [],
      note: 'Three flattened cartons leaning on a wall: wall plane at z = 0 behind (+Z), cartons out towards -Z; origin at the wall foot.',
    },
    mattress_leaning: {
      class: 'scatter', mass: 18, lods: 2, size: [0.92, 1.91, 0.6],
      anchors: [], colliders: ['col_box_body'], lamps: [],
      note: 'Stained single mattress leaning on a wall (wall plane z = 0 behind, foot 0.6 m out towards -Z): alleys, by dumpsters and skips.',
    },
    mattress_flat: {
      class: 'scatter', mass: 18, lods: 2, size: [1.07, 0.24, 1.98],
      anchors: [], colliders: ['col_box_body'], lamps: [],
      note: 'The same mattress dumped flat, long side along Z, ends lifting: vacant lots, alley floors.',
    },
    warning_plate: {
      class: 'fixed', lods: 2, size: [0.45, 0.6, 0.01],
      anchors: ['anchor_sign', 'anchor_mount'], colliders: ['col_box_body'], lamps: [],
      note: 'Steel warning plate, 1.3-1.9 m up, on a wall at z = 0 behind it: hazard triangle with a lightning pictogram and a blank band; the game paints the words in the band at anchor_sign (0.38 x 0.15 m, centre 1.42 m) from the catalogs. Substations, fences, gates, roll-up doors, pump rooms.',
    },
    warning_post: {
      class: 'knockable', mass: 14, lods: 3, size: [0.45, 2.27, 0.08],
      anchors: ['anchor_sign'], colliders: ['col_cyl_pole'], lamps: [],
      note: 'The same plate clamped to a 2.25 m steel post, facing -Z: site edges, vacant-lot fences, the port.',
    },
    skip: {
      class: 'fixed', lods: 3, size: [5.53, 1.89, 2.44],
      anchors: [], colliders: ['col_box_body'], lamps: [],
      note: 'Rust-red 5 m roll-off container on rails, long along X: sloped front and hook at +X, rear door at -X, heaped with rubble and planks. Building sites, renovations, alley ends; cover in firefights.',
    },
    shopping_trolley: {
      class: 'knockable', mass: 16, lods: 3, size: [0.6, 1.05, 1.05],
      anchors: [], colliders: ['col_box_body'], lamps: [],
      note: 'Wire shopping trolley, front towards -Z, handle at +Z (cutout_wire basket): abandoned in alleys, by bus stops, in vacant lots and outside the market.',
    },
    pallet_fence: {
      class: 'fixed', lods: 3, size: [3.38, 1.4, 0.23],
      anchors: [], colliders: ['col_box_body'], lamps: [],
      note: 'Four pallets on end between three timber posts (x = -1.65, 0, +1.65), wired together, boards missing; deck faces -Z. Lay end to end at a 3.3 m pitch to close yards and vacant lots.',
    },
  },
  set_port: {
    container_20: {
      class: 'fixed', lods: 3, size: [6.07, 2.59, 2.44],
      anchors: ['anchor_sign_a', 'anchor_sign_b', 'anchor_sign_door'], colliders: ['col_box_body'], lamps: [],
      note: '20 ft ISO box (6.058 x 2.438 x 2.591 m), long along X, doors at +X. Shell is `paint`: give every instance a line colour (setPaint or instance colour: maroon, blue, green, orange, grey, teal, red, cream, faded). Stacks exactly 2.591 m per tier; rows 2.44 m apart (touching) or 0.3 m gaps. sign_a (side facing -Z) / sign_b (+Z): 3.6 x 0.75 m for the line name from brandsAndSignage (shipping/logistics: naviera_tamarindo, gaviota_express, frigorificos_golfo); sign_door 0.7 x 0.4 m on the right door. Turn 180 degrees for doors at -X.',
    },
    container_40: {
      class: 'fixed', lods: 3, size: [12.2, 2.59, 2.44],
      anchors: ['anchor_sign_a', 'anchor_sign_b', 'anchor_sign_door'], colliders: ['col_box_body'], lamps: [],
      note: 'The 40 ft box (12.192 m), same construction, colours and signs (7.6 x 0.95 m on the sides). The bulk of every yard block, quay apron and stack; two 20 ft boxes fit on one 40 ft.',
    },
    container_stack: {
      class: 'fixed', lods: 3, size: [12.24, 7.77, 7.31],
      anchors: ['anchor_sign_a', 'anchor_sign_b'], colliders: ['col_box_low', 'col_box_top'], lamps: [],
      note: 'Eight 40 ft boxes in three touching columns along Z (z = -2.44, 0, +2.44): 3, 3 and 2 high (the low column at -Z), baked liveries (two with a wave mark), doors at +X on the outer columns and -X in the middle. Hidden faces removed: lay modules end to end along X (12.2 m pitch) or side by side along Z (7.32 m), mixing 180-degree turns, with single boxes on top and beside. sign_a: side of the -Z column top (game -Z face), sign_b: +Z face of the 3-high +Z column, 7.6 x 0.95 m.',
    },
    quay_crane: {
      class: 'fixed', lods: 3, size: [24.0, 72.58, 98.02],
      anchors: ['anchor_cab', 'anchor_spreader'], colliders: ['col_box_leg_1', 'col_box_leg_2', 'col_box_leg_3', 'col_box_leg_4'], lamps: ['flood'],
      note: 'Ship-to-shore gantry crane, white with a blue machinery house and trolley, hazard-striped bogies and spreader. Four legs at x = +-9, on rails at z = -15.24 (waterside) and +15.24 (landside); the boom reaches to z = -65 over the water (-Z), the backreach to z = +33; apex 72 m. Stand the waterside rail 2-3 m from the quay edge, cranes 30-40 m apart along the quay (X), trucks drive between the legs. lamp_flood: six floodlights under the girders (on at night).',
    },
    steel_shed: {
      class: 'fixed', lods: 2, size: [6.0, 7.65, 14.74],
      anchors: ['anchor_sign', 'anchor_door'], colliders: ['col_box_body'], lamps: [],
      note: 'One 6 m bay (along X) of a portal-frame steel shed, 14 m deep (z = -7..+7), eaves 6.5 m, ridge 7.6 m: ribbed cladding, a 4.2 x 4.6 m roll-up door on the -Z side, gutters and downpipes. Lay bays end to end along X at a 6 m pitch (the ends are open) and close each run with steel_shed_end. sign: 3.8 x 1.1 m fascia over the door for a company name.',
    },
    steel_shed_end: {
      class: 'fixed', lods: 2, size: [0.72, 7.75, 14.44],
      anchors: ['anchor_door'], colliders: ['col_box_body'], lamps: [],
      note: 'The gable wall that closes a run of steel_shed bays: on its own plane x = 0, facing +X, with a personnel door and a louvre. Put it at the run\'s +X end (x = last bay + 3 m) as is, and turned 180 degrees about Y at the -X end.',
    },
    forklift: {
      class: 'fixed', lods: 3, size: [1.34, 2.28, 3.8],
      anchors: ['anchor_seat', 'anchor_forks'], colliders: ['col_box_body', 'col_box_forks'], lamps: [],
      note: '3 t counterbalance forklift, ochre with a black mast and guard, LPG bottle at the back, forks lowered towards -Z. Quay aprons, by sheds and stacks, warehouse doors; often in front of a pallet stack.',
    },
    box_trailer: {
      class: 'fixed', lods: 3, size: [2.61, 4.1, 14.73],
      anchors: ['anchor_sign_a', 'anchor_sign_b', 'anchor_kingpin'], colliders: ['col_box_body'], lamps: [],
      note: '14.6 m dry-van semi-trailer dropped on its landing gear: kingpin end at -Z (front), rear doors with locking bars at +Z, side skirts, tandem axle. Back it onto shed doors and loading docks, park rows at 3.5 m pitch. sign_a (+X side) / sign_b (-X side): 10.5 x 1.9 m for a haulier name (gaviota_express, frigorificos_golfo).',
    },
  },
  set_commerce: {
    awning_shop: {
      class: 'fixed', lods: 2, size: [3.1, 2.88, 1.44],
      anchors: ['anchor_sign', 'anchor_mount'], colliders: ['col_box_body'], lamps: [],
      note: 'Folding-arm shop awning, 3 m wide, on a wall at z = 0 behind it (+Z), reaching 1.43 m out towards -Z; modelled with its mount (anchor_mount) 2.75 m up: raise or lower the clone to the shop\'s lintel. Tint the canvas per shop (setPaint(instance, colour, \'paint_awning\')); the valance carries anchor_sign (2.7 x 0.2 m) for the shop name from shopsAndProperties. One or two per shop front, side by side at 3.1 m.',
    },
    aframe_board: {
      class: 'knockable', mass: 7, lods: 2, size: [0.6, 0.94, 0.56],
      anchors: ['anchor_sign_a', 'anchor_sign_b'], colliders: ['col_box_body'], lamps: [],
      note: 'Hinged sandwich board with two framed chalkboards; sign_a faces -Z, sign_b +Z (0.5 x 0.7 m, tilted 16.5 degrees back): paint a short menu or offer in a chalk hand. On the pavement 0.5-1.5 m in front of cafes, bars and shops.',
    },
    cafe_table: {
      class: 'knockable', mass: 18, lods: 2, size: [0.6, 0.75, 0.6],
      anchors: [], colliders: ['col_cyl_body'], lamps: [],
      note: 'Round bistro table (0.6 m) on a cast cross foot: cafe terraces with cafe_chair round it.',
    },
    cafe_chair: {
      class: 'scatter', mass: 4, lods: 2, size: [0.42, 0.88, 0.49],
      anchors: ['anchor_seat'], colliders: ['col_box_body'], lamps: [],
      note: 'Aluminium bistro chair with teak slats, facing -Z (anchor_seat 0.45 m up, pointing the way the sitter faces): two to four round each cafe_table, some pushed back or turned.',
    },
    cafe_set: {
      class: 'knockable', mass: 50, lods: 3, size: [2.4, 2.54, 2.4],
      anchors: ['anchor_seat_1', 'anchor_seat_2', 'anchor_seat_3'], colliders: ['col_cyl_table', 'col_cyl_chairs'], lamps: [],
      note: 'A table with three chairs round it and an open 2.4 m cream parasol through it: drop a row of them on a cafe terrace (2.6 m pitch) or a promenade; seats face the table.',
    },
    parasol_closed: {
      class: 'knockable', mass: 25, lods: 2, size: [0.5, 2.56, 0.5],
      anchors: [], colliders: ['col_cyl_body'], lamps: [],
      note: 'Furled market parasol on its weighted base: closed terraces at night and early morning, beside stacked chairs.',
    },
    vending_drinks: {
      class: 'fixed', lods: 3, size: [0.91, 1.83, 0.79],
      anchors: ['anchor_sign', 'anchor_use'], colliders: ['col_box_body'], lamps: ['panel'],
      note: 'Drinks machine, front towards -Z, back against a wall (z = +0.375): lit front panel (lamp_panel, on at dusk) with anchor_sign (0.56 x 1.34 m) for a drinks brand graphic from brandsAndSignage, keypad, delivery flap. Outside corner shops, gas stations, the port, metro entrances; often in pairs.',
    },
    vending_snacks: {
      class: 'fixed', lods: 3, size: [0.94, 1.83, 0.78],
      anchors: ['anchor_use'], colliders: ['col_box_body'], lamps: ['panel'],
      note: 'Snack machine: glazed front over rows of packets, a lit strip inside (lamp_panel), keypad. Beside vending_drinks.',
    },
    news_stand: {
      class: 'fixed', lods: 3, size: [1.7, 2.28, 0.87],
      anchors: ['anchor_sign', 'anchor_use'], colliders: ['col_box_body'], lamps: [],
      note: 'Green steel news stand, front towards -Z: three tiers of magazines with blank covers, a tall back rack, a small roof; anchor_sign on the fascia (1.6 x 0.19 m). Street corners, plazas, outside the metro; back to a wall or kerb-side.',
    },
    fruit_stall: {
      class: 'fixed', lods: 3, size: [2.2, 2.47, 1.23],
      anchors: ['anchor_sign', 'anchor_use'], colliders: ['col_box_body'], lamps: [],
      note: 'Market stall, customers at -Z: trestle table with six crates of oranges, apples, limes, bananas, tomatoes and mangoes, spare crates under it, a red-and-cream striped canopy with a valance (anchor_sign 2.0 x 0.2 m). The vendor stands at anchor_use behind it. Markets, Barrio Hierro corners, beside bodegas.',
    },
    hotdog_cart: {
      class: 'knockable', mass: 120, lods: 3, size: [2.22, 2.4, 1.9],
      anchors: ['anchor_sign', 'anchor_use'], colliders: ['col_box_body'], lamps: [],
      note: 'Stainless hot-dog cart on two wheels with steam wells, condiments, a gas bottle under it and a red-and-yellow umbrella; its front panel (-Z) carries anchor_sign (1.1 x 0.36 m) for the stand\'s name; the vendor stands at anchor_use behind (+Z). Promenade, beach entrances, parks, the stadium, busy corners.',
    },
  },
  set_roadside: {
    bus_stop_pole: {
      class: 'knockable', mass: 35, lods: 3, size: [0.5, 3.08, 0.26],
      anchors: ['anchor_sign_a', 'anchor_sign_b', 'anchor_routes', 'anchor_timetable'], colliders: ['col_cyl_pole'], lamps: [],
      note: 'Bus-stop post at the kerb: blank flag plate 2.42-3.0 m up, both faces painted (sign_a towards -Z, sign_b towards +Z, 0.48 x 0.56 m: a stop symbol and the stop name from the catalogs), a dark blue route strip under it (anchor_routes 0.48 x 0.18 m: route numbers) and a glazed timetable case at 1.3-1.82 m (anchor_timetable 0.31 x 0.45 m: grey rows, never readable copy). Stand it 0.5 m behind the kerb with -Z along the street towards oncoming buses; one per stop without a shelter, or beside set_sidewalk bus_shelter.',
    },
    parking_meter_twin: {
      class: 'knockable', mass: 60, lods: 3, size: [0.56, 1.46, 0.24],
      anchors: ['anchor_use_a', 'anchor_use_b'], colliders: ['col_cyl_post', 'col_box_heads'], lamps: [],
      note: 'Two-headed meter serving the spaces to its left and right, display windows towards -Z (the pavement side); a payer stands at anchor_use_a / _b, 0.55 m in front. On the kerb line between two parking bays every 11-12 m along metered streets (Centro, Gran Via side streets); alternate with set_traffic_control parking_meter.',
    },
    bollard_stainless: {
      class: 'fixed', lods: 3, size: [0.15, 0.9, 0.15],
      anchors: [], colliders: ['col_cyl_body'], lamps: [],
      note: 'Brushed stainless bollard with a domed top and two reflective bands; stops cars. Rows at 1.4-1.6 m pitch round plazas, shop fronts, the promenade and pedestrianised Centro streets.',
    },
    bollard_flex: {
      class: 'knockable', mass: 1.5, lods: 3, size: [0.24, 0.8, 0.24],
      anchors: [], colliders: ['col_cyl_body'], lamps: [],
      note: 'Flexible white lane delineator with red reflective bands on a bolted rubber base; cars knock it flat. Rows at 2-3 m along bike lanes, lane splits, freeway ramps and works zones.',
    },
    cone_tall: {
      class: 'knockable', mass: 4.5, lods: 3, size: [0.4, 1.0, 0.4],
      anchors: [], colliders: ['col_cyl_body'], lamps: [],
      note: 'One-metre roadworks cone with two reflective sleeves on a square rubber base. Tapers of 6-12 cones at 3-6 m closing a lane before a roadworks_barrier line, round manholes and set_construction sites.',
    },
    cone_stack: {
      class: 'knockable', mass: 18, lods: 3, size: [0.45, 1.2, 0.45],
      anchors: [], colliders: ['col_cyl_body'], lamps: [],
      note: 'Four tall cones nested in one stack, as crews leave them; beside a works van, a skip, a generator or at the end of a cone taper.',
    },
    roadworks_barrier: {
      class: 'knockable', mass: 14, lods: 3, size: [2.13, 1.0, 0.62],
      anchors: [], colliders: ['col_box_body'], lamps: [],
      note: 'Two-metre interlocking pedestrian barrier along X: red-and-white boards, red mesh infill (cutout_mesh), rubber feet. Lay end to end at a 2.05 m pitch (hooks at -X, eyes at +X) round trenches, open manholes, scaffolding and closed pavements; corners at 90 degrees.',
    },
    newspaper_bank: {
      class: 'knockable', mass: 95, lods: 3, size: [1.42, 1.12, 0.44],
      anchors: ['anchor_sign_1', 'anchor_sign_2', 'anchor_sign_3', 'anchor_use'], colliders: ['col_box_body'], lamps: [],
      note: 'Three coin-operated newspaper boxes (blue, yellow, red) on one rail, windows towards -Z; each header (anchor_sign_1..3, 0.34 x 0.1 m) takes a paper\'s name from brandsAndSignage. Street corners, outside cafes, the metro and bus stops, back to the kerb or a wall.',
    },
    phone_booth: {
      class: 'fixed', lods: 3, size: [1.12, 2.51, 1.12],
      anchors: ['anchor_sign', 'anchor_use'], colliders: ['col_box_body'], lamps: ['booth'],
      note: 'Enclosed glazed phone booth (our own design: aluminium frame, teal roof and kick panels), door towards -Z; lamp_booth is the lit band under the roof (on at dusk) with anchor_sign on its front (0.9 x 0.13 m: a short word like the catalog\'s phone service, painted over the glow). A caller stands inside at anchor_use facing the phone (+Z). Plazas, Centro corners, the port gate, gas stations.',
    },
    billboard_monopole: {
      class: 'fixed', lods: 3, size: [12.43, 13.5, 3.03],
      anchors: ['anchor_sign', 'anchor_light_1', 'anchor_light_2', 'anchor_light_3', 'anchor_light_4'], colliders: ['col_cyl_footing', 'col_cyl_pole', 'col_box_head'], lamps: ['flood'],
      note: 'Roadside billboard: a 12 x 4 m blank face 9.4-13.4 m up on a 9 m steel monopole (concrete footing 1.9 m across), catwalk, rail, ladder and four floodlights (lamp_flood, on at night; anchor_light_1..4 point up at the face: spot, range 14 m). Paint an advert from brandsAndSignage at anchor_sign (facing -Z). Beside freeways, the port road, big junctions and empty lots of the outer districts, face turned to the oncoming traffic, 3-10 m behind the kerb; levels switch at 80 and 200 m.',
    },
  },
  set_construction: {
    scaffold_bay: {
      class: 'fixed', lods: 3, size: [2.72, 3.02, 1.5],
      anchors: ['anchor_deck'], colliders: ['col_box_frame_1', 'col_box_frame_2', 'col_box_deck'], lamps: [],
      note: 'One 2.5 m bay of frame scaffold, one 2 m lift, 1.25 m deep: the building side is +Z (cross brace), the street side -Z (guard rail and toe board up to 3.0 m). Stand it with +Z 0.2-0.3 m off a facade; run bays end to end along X at 2.5 m, and stack lifts 2.0 m up (anchor_deck is the top of the boards) for 2-4 lifts on a building under repair, with roadworks_barrier and cone_tall round its foot.',
    },
    cement_mixer: {
      class: 'knockable', mass: 160, lods: 3, size: [1.35, 1.42, 1.9],
      anchors: [], colliders: ['col_box_body'], lamps: [],
      note: 'Towable drum mixer, tilted orange drum with cement crust, tow bar and drum mouth towards -Z, engine box and wheels at +Z. Building sites, Barrio Hierro yards, beside a pile of set_yard_clutter cinder blocks.',
    },
    generator: {
      class: 'knockable', mass: 260, lods: 3, size: [1.43, 1.08, 0.92],
      anchors: ['anchor_use'], colliders: ['col_box_body'], lamps: [],
      note: 'Yellow site generator on skids with a wheel kit at -X, control panel and sockets on the +X end (a worker stands at anchor_use). Put a cable_reel or cable_reel_small beside it; building sites, roadworks, the port, a market at night.',
    },
    cable_reel: {
      class: 'knockable', mass: 280, lods: 3, size: [1.2, 1.25, 1.68],
      anchors: [], colliders: ['col_box_body'], lamps: [],
      note: 'Wooden cable drum (1.24 m) standing on its flanges, axle along X, wound with black cable whose loose end trails towards -Z. Roadworks, utility trenches, the port apron, building sites.',
    },
    cable_reel_small: {
      class: 'knockable', mass: 45, lods: 3, size: [1.25, 0.44, 0.79],
      anchors: [], colliders: ['col_cyl_body'], lamps: [],
      note: 'Small cable drum lying flat, wound with orange cable, a loose end on the ground. Beside a generator, in yards, on scaffold decks.',
    },
    pipe_stack: {
      class: 'fixed', lods: 3, size: [6.16, 0.98, 1.3],
      anchors: [], colliders: ['col_box_body'], lamps: [],
      note: 'Six 6 m steel pipes (0.32 m) stacked 3-2-1 on timber bearers, long along X. Utility works beside a trench, the port, industrial lots, Barrio Hierro yards; good low cover in a firefight.',
    },
    sofa_broken: {
      class: 'knockable', mass: 40, lods: 3, size: [2.24, 0.92, 1.75],
      anchors: ['anchor_seat'], colliders: ['col_box_body'], lamps: [],
      note: 'Dumped three-seat sofa, faded and stained, facing -Z: a leg gone so it sags at +X, one seat cushion fallen in front, torn foam showing. Kerbs and alley mouths of Barrio Hierro and the worn districts, beside bin bags and a mattress; a loiterer may sit at anchor_seat.',
    },
    fence_portable: {
      class: 'knockable', mass: 45, lods: 3, size: [3.64, 2.11, 0.62],
      anchors: [], colliders: ['col_box_body'], lamps: [],
      note: 'Temporary site fence panel: welded mesh (cutout_fence) in a galvanised tube frame on two concrete feet, along X. Lay end to end at 3.5 m round building sites, empty lots and closed pavements; clamps at +X.',
    },
  },
});

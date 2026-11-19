// The models of the sea and the Norvast island, and the military vehicles (art/blender/naval/,
// built by art/build_naval.py): the navy picket ship, the patrol jeep, the army truck and the
// camouflage-net hangar. Written by hand (see index.js).
//
// The jeep and the truck keep the road-vehicle contract of the fleet (vehicles.js, trucks.js):
// - Origin on the ground at the centre of the wheelbase, facing -Z, the driver on the left (-X).
// - lod0 is the body; every moving part is a child of lod0 and shows at level 0 only: wheel_fl /
//   wheel_fr / wheel_rl / wheel_rr (origin at the hub, spin about local X), door_fl / door_fr
//   (origin on the hinge line at the front edge), hood (hinged at the windscreen), bumper_f /
//   bumper_r (detachable), steering_wheel (its local +Y runs along the column towards the
//   driver), window_front (the windscreen pane). lod1 and lod2 are single merged meshes with the
//   wheels and moving parts in them.
// - Anchors: anchor_seat_* (hip joints), anchor_door_driver / _passenger (on the ground beside the
//   doors, facing them), lights, exhaust, plates and the chase camera target.
// - Materials: paint (tinted per spawn), glass, the six lamp groups, atlas for everything else.
// - Scene extras: wheel_radius, track, wheelbase, seats.
// Both are over the vehicle defaults in draw calls only (each moving part and lamp group is its
// own node and material); the merged levels draw once.

const MILITARY_VEHICLE_NODES = [
  'lod0', 'lod1', 'lod2',
  'wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr',
  'door_fl', 'door_fr', 'hood', 'bumper_f', 'bumper_r', 'steering_wheel', 'window_front',
];

const MILITARY_VEHICLE_ANCHORS = [
  'anchor_seat_driver', 'anchor_seat_passenger_1', 'anchor_seat_passenger_2', 'anchor_seat_passenger_3',
  'anchor_door_driver', 'anchor_door_passenger',
  'anchor_light_head_l', 'anchor_light_head_r', 'anchor_light_tail_l', 'anchor_light_tail_r',
  'anchor_exhaust_1', 'anchor_camera', 'anchor_plate_f', 'anchor_plate_r',
];

const MILITARY_VEHICLE_MATERIALS = [
  'atlas', 'paint', 'glass', 'lamp_head', 'lamp_tail', 'lamp_brake', 'lamp_reverse', 'lamp_indicator_l', 'lamp_indicator_r',
];

/**
 * The naval, island and military-vehicle assets by id.
 * @type {Readonly<Record<string, import('./index.js').AssetEntry>>}
 */
export const NAVAL_AND_ISLAND_ASSETS = {
  // Navy picket ship: a grey corvette of the Armada de Marazul, 82 m long (bow at z -42, stern at
  // z +40), 11 m beam (13.5 m over the bridge wings), 24.75 m to the top of the radar. Origin on
  // the waterline amidships, bow towards -Z; the hull goes 3 m below y = 0. Node `antenna` is the
  // search radar on the mast (origin on its vertical axis, 24 m up: turn it about Y) and shows at
  // every level; lod0 is the hull and the big blocks, detail_lod0 the fittings, rails_lod0 the
  // guard rails (cutout_rail, level 0 only); lod1 and lod2 are one mesh each. Lamps: lamp_nav_red
  // (port bridge wing), lamp_nav_green (starboard), lamp_mast (masthead and stern light), each
  // with an anchor_light_* at the lamp. anchor_wake_bow / _stern are on the waterline, anchor_gun
  // on the forward gun house, anchor_funnel on top of the funnel (pointing up). Extras:
  // antenna_height, waterline, draught. About 2,540 / 1,120 / 320 triangles, 7 draws.
  navy_picket_ship: {
    file: 'naval/navy_picket_ship.glb',
    kind: 'vehicle',
    lods: 3,
    nodes: ['lod0', 'detail_lod0', 'rails_lod0', 'lod1', 'lod2', 'antenna'],
    anchors: ['anchor_light_nav_red', 'anchor_light_nav_green', 'anchor_light_mast', 'anchor_light_stern',
      'anchor_wake_bow', 'anchor_wake_stern', 'anchor_gun', 'anchor_funnel'],
    colliders: ['col_box_hull', 'col_box_superstructure', 'col_box_mast'],
    materials: ['atlas', 'cutout_rail', 'lamp_nav_red', 'lamp_nav_green', 'lamp_mast'],
  },

  // Camouflage-net hangar of the Norvast island: five lattice arches 10 m apart under a draped
  // net, 60 m wide between the arch feet and 44 m deep (the net and its guy lines reach 73 x 60 m),
  // 18.2 m to the inside of the crown, 14.5 m at 23 m off the centreline; open on -Z and +Z.
  // lod0 holds the stores, side poles, guy lines and the net (cutout_net, alpha tested), frame_lod0
  // the arches; lod1 and lod2 are one mesh each. Colliders: the two arch-foot rows (col_box_side_l
  // / _r, inner faces 27.6 m off the centreline) and the stores along them; nothing in the
  // openings. anchor_park is the centre, anchor_entry_front (-Z end) and anchor_entry_back face
  // into the hangar. Extras: clear_height, clear_width, arch_spacing. The lattice arches take the
  // triangle count over the building default: about 9,260 / 3,550 / 1,160 triangles, 3 draws.
  camo_net_hangar: {
    file: 'naval/camo_net_hangar.glb',
    kind: 'building',
    lods: 3,
    nodes: ['lod0', 'frame_lod0', 'lod1', 'lod2'],
    anchors: ['anchor_park', 'anchor_entry_front', 'anchor_entry_back'],
    colliders: ['col_box_side_l', 'col_box_side_r', 'col_box_stores_l', 'col_box_stores_l2', 'col_box_stores_r', 'col_box_stores_r2'],
    materials: ['atlas', 'cutout_net'],
    maxTriangles: 10000,
  },

  // Patrol jeep: open-topped 4x4 of flat panels, 4 seats (two front seats and a rear bench),
  // low half doors, roll hoop, spare wheel, jerry can, whip antenna. 3.95 x 1.76 x 1.88 m (the
  // whip reaches 3.0 m), wheelbase 2.40 m, track 1.46 m, wheel radius 0.40 m. The paint colour is
  // the SAND tone of the camouflage (#A8996B); the dominant matt olive is baked into the paint
  // texture as a darker multiplier. anchor_decal_door_l / _r: the door skins (0.8 x 0.4 m).
  patrol_jeep: {
    file: 'naval/patrol_jeep.glb',
    kind: 'vehicle',
    lods: 3,
    nodes: MILITARY_VEHICLE_NODES,
    anchors: [...MILITARY_VEHICLE_ANCHORS, 'anchor_decal_door_l', 'anchor_decal_door_r'],
    colliders: ['col_box_body', 'col_box_cabin'],
    materials: MILITARY_VEHICLE_MATERIALS,
    // About 4,300 / 1,640 / 590 triangles; 21 draws at level 0 (eleven nodes, nine materials).
    maxDraws: 26,
  },

  // Army truck: 6x6 cargo truck, angular bonnet, flat-panel cab, canvas tilt over a drop-side
  // bed. 4 seats (driver and passenger_1 in the cab; passenger_2 / _3 on the benches under the
  // tilt, facing inward). 7.45 x 2.50 x 3.12 m (cab roof 2.66 m), wheelbase 4.60 m (front axle to
  // the REAR axle: wheel_rl / wheel_rr; the middle axle, 1.35 m ahead of it, is part of the body
  // and does not turn; scene extra middle_axle), track 2.04 m, wheel radius 0.55 m. Matt olive
  // paint (#4D5234). anchor_door_rear stands behind the tailgate, anchor_cargo is the centre of
  // the load floor, anchor_decal_side_l / _r the tilt's sides (3.0 x 0.6 m), anchor_exhaust_1
  // the top of the stack behind the cab (pointing up).
  army_truck: {
    file: 'naval/army_truck.glb',
    kind: 'vehicle',
    lods: 3,
    nodes: MILITARY_VEHICLE_NODES,
    anchors: [...MILITARY_VEHICLE_ANCHORS, 'anchor_door_rear', 'anchor_cargo', 'anchor_decal_side_l', 'anchor_decal_side_r'],
    colliders: ['col_box_cab', 'col_box_nose', 'col_box_body'],
    materials: MILITARY_VEHICLE_MATERIALS,
    // About 4,700 / 1,790 / 630 triangles; 23 draws at level 0 (eleven nodes, nine materials).
    maxDraws: 28,
  },
};

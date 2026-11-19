// Trucks, vans and the bus (art/blender/assets/trucks/). Written by hand (see index.js).
//
// Every truck keeps one contract with the game:
// - Origin on the ground at the centre of the wheelbase, facing -Z.
// - lod0 is the body (interior, mirrors, lamps, light bars included); every moving part is a
//   child of lod0 and shows at level 0 only: wheel_fl / wheel_fr / wheel_rl / wheel_rr (origin at
//   the hub, spin about local X; the front ones are steered about the vertical axis through the
//   hub), door_fl / door_fr (cab doors, origin on the hinge line at the front edge; side glass and
//   the big mirror move with them), door_rear_l / door_rear_r (rear double doors, hinged at the
//   outer edges), hood (hinged at the windscreen), bumper_f / bumper_r (detachable),
//   steering_wheel (an empty at the hub; its local +Y in the game runs along the column towards
//   the driver: turn it about that axis), window_front / window_rear / window_l / window_r (glass
//   panes not in doors, which the game can shatter). lod1 and lod2 are single merged meshes with
//   the moving parts and wheels in them (lod2 has no interior and no lamp cells).
// - Anchors: anchor_seat_* are seated hip joints, facing the way the person sits (driver on the
//   left); anchor_door_driver / _passenger stand on the ground beside the cab doors facing them,
//   anchor_door_rear behind the rear doors facing them; anchor_cargo is the centre of the load
//   floor; lights, exhaust and the two plate centres face outward; anchor_camera is the chase
//   target at about roof height; anchor_decal_side_l / _r are the centres of the largest flat
//   side panels, facing outward, with extras width and height (metres) for liveries;
//   anchor_siren is the top centre of the roof light bar (siren sound source, a light position).
// - Materials: paint (tinted, clear-coated), paint_secondary (the livery band), glass, the lamp
//   groups, lamp_siren_a (red, driver's -X side) and lamp_siren_b (blue, +X side): flash them
//   alternately; atlas for everything else.
// - Scene extras (asset.extras): wheel_radius, track and wheelbase in metres, seats.
//
// Budget: a truck has nineteen nodes and twelve game materials, so at level 0 it needs more
// triangles and draw calls than the default vehicle budget; its geometry (no mesh compression)
// is about 590 kB, so the byte cap is raised as well until lod0 is trimmed.

const TRUCK_NODES = [
  'lod0', 'lod1', 'lod2',
  'wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr',
  'door_fl', 'door_fr', 'door_rear_l', 'door_rear_r', 'hood', 'bumper_f', 'bumper_r',
  'steering_wheel', 'window_front', 'window_rear', 'window_l', 'window_r',
];

const TRUCK_ANCHORS = [
  'anchor_seat_driver', 'anchor_seat_passenger_1', 'anchor_seat_passenger_2',
  'anchor_seat_passenger_3', 'anchor_door_driver', 'anchor_door_passenger', 'anchor_door_rear',
  'anchor_cargo', 'anchor_light_head_l', 'anchor_light_head_r', 'anchor_light_tail_l',
  'anchor_light_tail_r', 'anchor_exhaust_1', 'anchor_camera', 'anchor_plate_f', 'anchor_plate_r',
  'anchor_decal_side_l', 'anchor_decal_side_r',
];

const EMERGENCY_MATERIALS = [
  'atlas', 'paint', 'paint_secondary', 'glass', 'lamp_head', 'lamp_tail', 'lamp_brake',
  'lamp_reverse', 'lamp_indicator_l', 'lamp_indicator_r', 'lamp_siren_a', 'lamp_siren_b',
];

/** @type {Record<string, import('./index.js').AssetEntry>} */
export const TRUCK_ASSETS = {
  // Ambulance (catalogue: Brazo Auxilio, Marazul Fire and Rescue): van cab with a box body,
  // 4 seats (driver and passenger in the cab; passenger_2 on the box's kerb-side bench facing
  // the stretcher, passenger_3 at the stretcher's head facing rearward). 6.38 x 2.26 x 2.77 m
  // (2.56 m over the mirrors; cab roof 2.28, box roof 2.64), wheelbase 3.76 m, track 1.74 m,
  // wheel radius 0.38 m. window_l / window_r are the box's side windows, window_rear the
  // pass-through pane in the cab's back wall. paint_secondary is the band round the box and
  // across the rear doors (livery base #F4F2EC, secondary #D8432F). anchor_decal_side_*: 2.0 x
  // 1.2 m above the band. Extras: wheel_radius, track, wheelbase, seats.
  ambulance: {
    file: 'trucks/ambulance.glb',
    kind: 'vehicle',
    lods: 3,
    nodes: TRUCK_NODES,
    anchors: [...TRUCK_ANCHORS, 'anchor_siren'],
    colliders: ['col_box_cab', 'col_box_nose', 'col_box_body'],
    materials: EMERGENCY_MATERIALS,
    // Full node contract (19 nodes, 12 materials): about 16,700 / 4,800 / 1,200 triangles and
    // 37 draws at level 0; about 622 kB, most of it uncompressed geometry.
    maxTriangles: 20000,
    maxDraws: 48,
    maxBytes: 680000,
  },

  // SWAT van (catalogue: Brazo Baluarte, Unidad Tactica): armoured van, 8 seats (driver and
  // passenger in the cab; passenger_2 / _3 on the benches along the left and right walls of the
  // rear, facing inward). 6.66 x 2.46 x 2.75 m (2.62 m over the running boards, 2.94 m over the
  // mirrors), wheelbase 3.92 m, track 1.98 m, wheel radius 0.48 m. window_front is the
  // windscreen slit behind its bar guard, window_l / window_r the rear body's slit windows,
  // window_rear the pass-through pane in the cab bulkhead. paint_secondary is the band along the
  // sides, cab doors and rear doors (livery base #2B3A42, secondary #1D4E7A); the siren lamps
  // are the roof bar, the bumper flashers, the side and the rear flashers. anchor_decal_side_*:
  // 2.4 x 0.5 m under the band. Extras: wheel_radius, track, wheelbase, seats.
  swat_van: {
    file: 'trucks/swat_van.glb',
    kind: 'vehicle',
    lods: 3,
    nodes: TRUCK_NODES,
    anchors: [...TRUCK_ANCHORS, 'anchor_siren'],
    colliders: ['col_box_body', 'col_box_nose'],
    materials: EMERGENCY_MATERIALS,
    // Full node contract (19 nodes, 12 materials): about 16,800 / 4,800 / 1,200 triangles and
    // 41 draws at level 0; about 637 kB, most of it uncompressed geometry.
    maxTriangles: 20000,
    maxDraws: 48,
    maxBytes: 680000,
  },
};

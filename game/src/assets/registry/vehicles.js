// Vehicles: cars, trucks, motorcycles, boats. Written by hand (see index.js).
//
// A vehicle entry promises its moving parts in `nodes` (wheel_fl, wheel_fr, wheel_rl, wheel_rr,
// steer_fl, steer_fr, door_fl, ...), its anchors (anchor_seat_driver, anchor_light_head_l, ...)
// and its role materials (paint, glass, lamp_head, lamp_tail, lamp_brake, ...).
//
// The everyday cars (art/blender/assets/vehicles/) keep one contract with the game:
// - Origin on the ground at the centre of the wheelbase, facing -Z.
// - lod0 is the body shell (interior, rear doors, mirrors on the front doors included); every
//   moving part is a child of lod0 and shows at level 0 only: wheel_fl / wheel_fr / wheel_rl /
//   wheel_rr (origin at the hub, spin about local X; the front ones are steered about the
//   vertical axis through the hub), door_fl / door_fr (origin on the hinge line at the front
//   edge; the side glass and the mirror move with them), hood (hinge at the windscreen), trunk
//   (hinge at the rear glass), bumper_f / bumper_r (detachable), steering_wheel (an empty at
//   the hub; its local +Y in the game runs along the column towards the driver: turn it about
//   that axis), window_front / window_rear / window_l / window_r (glass panes the game can
//   shatter). lod1 and lod2 are single merged meshes with the moving parts and wheels baked in.
// - Anchors: anchor_seat_* are the seated hip joints, facing forward (driver on the left);
//   anchor_door_driver / _passenger stand on the ground beside the front doors, facing them;
//   lights, exhaust, the chase camera target (roof height over the front seats), the two plate
//   centres and the two door-skin centres for liveries (anchor_decal_door_l / _r), all facing
//   outward.
// - Materials: paint (tinted, clear-coated), glass, the lamp groups, atlas for everything else.
// - Scene extras (asset.extras): wheel_radius, track and wheelbase in metres, seats.
//
// Budget: an everyday car has eighteen nodes and up to eleven materials, so at level 0 it needs
// more triangles and draw calls than the default vehicle budget (18,000 and 14); its geometry
// is about 620 kB without mesh compression, so the byte cap is raised as well. The lower levels
// are one mesh each (about 4,600 and 1,100 triangles).

const CAR_NODES = [
  'lod0', 'lod1', 'lod2',
  'wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr',
  'door_fl', 'door_fr', 'hood', 'trunk', 'bumper_f', 'bumper_r', 'steering_wheel',
  'window_front', 'window_rear', 'window_l', 'window_r',
];

const CAR_ANCHORS = [
  'anchor_seat_driver', 'anchor_seat_passenger_1', 'anchor_seat_passenger_2',
  'anchor_seat_passenger_3', 'anchor_door_driver', 'anchor_door_passenger',
  'anchor_light_head_l', 'anchor_light_head_r', 'anchor_light_tail_l', 'anchor_light_tail_r',
  'anchor_exhaust_1', 'anchor_camera', 'anchor_plate_f', 'anchor_plate_r',
  'anchor_decal_door_l', 'anchor_decal_door_r',
];

const CAR_MATERIALS = [
  'atlas', 'paint', 'glass', 'lamp_head', 'lamp_tail', 'lamp_brake', 'lamp_reverse',
  'lamp_indicator_l', 'lamp_indicator_r',
];

/** @type {Record<string, import('./index.js').AssetEntry>} */
export const VEHICLE_ASSETS = {
  // Family sedan (catalogue: Tavira Estela), the commonest car in traffic: 4 seats.
  // 4.72 x 1.82 x 1.46 m (2.04 m over the mirrors), wheelbase 2.76 m, track 1.56 m, wheel
  // radius 0.32 m. Extras: wheel_radius, track, wheelbase, seats.
  family_sedan: {
    file: 'vehicles/family_sedan.glb',
    kind: 'vehicle',
    lods: 3,
    nodes: CAR_NODES,
    anchors: CAR_ANCHORS,
    colliders: ['col_box_body', 'col_box_cabin'],
    materials: CAR_MATERIALS,
    // Full node contract (18 nodes, 9 materials): 15,988 / 4,600 / 1,099 triangles, 34 draws
    // at level 0; 652 kB, most of it uncompressed geometry.
    maxTriangles: 20000,
    maxDraws: 40,
    maxBytes: 1100000,
  },
};

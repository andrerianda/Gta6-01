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
  // 4.72 x 1.82 x 1.46 m (2.04 m over the mirrors), wheelbase 2.76 m, track 1.58 m, wheel
  // radius 0.335 m. Extras: wheel_radius, track, wheelbase, seats.
  family_sedan: {
    file: 'vehicles/family_sedan.glb',
    kind: 'vehicle',
    lods: 3,
    nodes: CAR_NODES,
    anchors: CAR_ANCHORS,
    colliders: ['col_box_body', 'col_box_cabin'],
    materials: CAR_MATERIALS,
    // Full node contract (18 nodes, 9 materials): about 16,000 / 4,600 / 1,100 triangles and
    // 34 draws at level 0; about 655 kB, most of it uncompressed geometry.
    maxTriangles: 20000,
    maxDraws: 40,
    maxBytes: 1100000,
  },

  // Police cruiser (catalogue: Holloway Warden), the police patrol car: 4 seats, the sedan's
  // platform stretched. 5.06 x 1.91 x 1.62 m over the push bar and the light bar (2.12 m over
  // the mirrors, roof 1.49 m), wheelbase 2.96 m, track 1.64 m, wheel radius 0.35 m (steel).
  // Extra node light_bar (under lod0, level 0 only): the roof bar and the driver's A-pillar
  // spotlight. lamp_siren_a is the red driver's (-X) half of the bar, lamp_siren_b the blue
  // other half; flash them alternately. anchor_siren is the top centre of the bar (the siren's
  // sound source and a light position). paint_secondary covers the four door skins and the
  // roof (livery: base #F2F0E8, secondary #1D4E7A). The push bar is part of bumper_f.
  police_cruiser: {
    file: 'vehicles/police_cruiser.glb',
    kind: 'vehicle',
    lods: 3,
    nodes: [...CAR_NODES, 'light_bar'],
    anchors: [...CAR_ANCHORS, 'anchor_siren'],
    colliders: ['col_box_body', 'col_box_cabin'],
    materials: [...CAR_MATERIALS, 'paint_secondary', 'lamp_siren_a', 'lamp_siren_b'],
    // The node contract plus the light bar and three more materials: about 18,700 / 4,800 /
    // 1,200 triangles and 40 draws at level 0; about 770 kB, mostly uncompressed geometry.
    maxTriangles: 21000,
    maxDraws: 46,
    maxBytes: 1250000,
  },
};

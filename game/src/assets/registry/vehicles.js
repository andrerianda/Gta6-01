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
// - Materials: paint (tinted, clear-coated), glass (windows), glass_lens (the clear lamp
//   lenses), the lamp groups, atlas for everything else. Each lamp unit is a clear lens over a
//   recessed bed in the group's lamp material with projector pods and light guides on it, so
//   switching a group lights the bed and its inner shapes behind the lens; unlit, red and amber
//   groups keep their lens colour.
// - Scene extras (asset.extras): wheel_radius, track and wheelbase in metres, seats.
//
// Budget: an everyday car has eighteen nodes and up to fourteen materials, so at level 0 it
// needs more triangles and draw calls than the default vehicle budget (18,000 and 14); its
// geometry is about 650 kB without mesh compression, so the byte cap is raised as well. The
// lower levels are one mesh each (about 4,600 and 1,100 triangles).

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
  'atlas', 'paint', 'glass', 'glass_lens', 'lamp_head', 'lamp_tail', 'lamp_brake',
  'lamp_reverse', 'lamp_indicator_l', 'lamp_indicator_r',
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
    // Full node contract (18 nodes, 10 materials) and the lamp units: about 18,500 / 4,600 /
    // 1,100 triangles and 36 draws at level 0; about 700 kB, most of it uncompressed geometry.
    maxTriangles: 22000,
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
    // The node contract plus the light bar, three more materials and the lamp units: about
    // 21,000 / 4,800 / 1,200 triangles and 42 draws at level 0; about 820 kB, mostly
    // uncompressed geometry. The sirens are deep red and blue glass when unlit.
    maxTriangles: 23500,
    maxDraws: 46,
    maxBytes: 1250000,
  },

  // Taxi cab (catalogue: Tavira Estela Cab, Cangrejo cab livery), common in traffic and parked
  // at hotels: 4 seats, the family sedan's body. 4.72 x 1.82 x 1.59 m over the roof sign (roof
  // 1.46 m), wheelbase 2.76 m, track 1.58 m, wheel radius 0.335 m (black steel wheels).
  // Extra node roof_sign (under lod0, level 0 only; merged into lod1 and lod2): a low arched
  // sign standing crosswise over the front seats, a dark frame round two light panels in
  // lamp_sign (front and back). anchor_sign_roof is the centre of the front panel, facing
  // forward: the game paints the sign's lettering there (the back panel is its mirror image,
  // 0.136 m behind). paint_secondary is the cream band along the sills and the lower bumper
  // corners (livery: base #E8703A, secondary #F3E9D2).
  taxi_cab: {
    file: 'vehicles/taxi_cab.glb',
    kind: 'vehicle',
    lods: 3,
    nodes: [...CAR_NODES, 'roof_sign'],
    anchors: [...CAR_ANCHORS, 'anchor_sign_roof'],
    colliders: ['col_box_body', 'col_box_cabin'],
    materials: [...CAR_MATERIALS, 'paint_secondary', 'lamp_sign'],
    // The node contract plus the sign, two more materials and the lamp units: about 20,000 /
    // 4,700 / 1,150 triangles and 40 draws at level 0; about 780 kB, mostly uncompressed
    // geometry.
    maxTriangles: 23500,
    maxDraws: 44,
    maxBytes: 1250000,
  },

  // SUV (catalogue: suv, upright five-door sport utility), common in traffic: 4 seat anchors
  // (driver, front passenger, two rear). 4.89 x 1.95 x 1.77 m over the roof rails (2.17 m over
  // the mirrors), wheelbase 2.86 m, track 1.68 m, wheel radius 0.38 m, ground clearance 0.21 m.
  // Dark cladding along the sills and round the lower bumpers and blacked-out rear pillars are
  // in the atlas (not recoloured). The tailgate face is body (it does not open); `trunk` is the
  // lip under the rear screen. Roof rails are part of lod0.
  suv: {
    file: 'vehicles/suv.glb',
    kind: 'vehicle',
    lods: 3,
    nodes: CAR_NODES,
    anchors: CAR_ANCHORS,
    colliders: ['col_box_body', 'col_box_cabin'],
    materials: CAR_MATERIALS,
    // Full node contract, the lamp units and the roof rails: about 19,700 / 4,700 / 1,150
    // triangles and 39 draws at level 0; about 860 kB, mostly uncompressed geometry.
    maxTriangles: 23000,
    maxDraws: 40,
    maxBytes: 1200000,
  },
};

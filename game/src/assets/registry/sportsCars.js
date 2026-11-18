// Hero cars: the cars the player steals and drives. Written by hand (see index.js).
//
// Every hero car keeps the same contract with the game:
// - Origin on the ground at the centre of the wheelbase, facing -Z.
// - lod0 is the body shell; every moving part is a child of lod0 and shows at level 0 only:
//   wheel_fl / wheel_fr / wheel_rl / wheel_rr (origin at the hub, spin about local X; the
//   front ones are steered about the vertical axis through the hub), door_fl / door_fr (origin
//   on the hinge line at the front edge), hood (hinge at the windscreen), trunk (hinge at the
//   rear glass), bumper_f / bumper_r (detachable), steering_wheel (an empty at the hub; its
//   local +Y in the game, +Z in Blender, runs along the column towards the driver: turn it
//   about that axis), window_front / window_rear / window_l / window_r (glass panes).
//   lod1 and lod2 are single merged meshes with the moving parts and wheels baked in.
// - Anchors: seats (hip joints, facing forward), doors (on the ground beside each door, facing
//   it), lights, exhausts, the chase camera target and the two licence plate centres.
// - Materials: paint (tintable, clear-coated), glass, the lamp groups, atlas for everything else.
// - Scene extras (asset.extras): wheel_radius, track and wheelbase in metres.
//
// Budget: a hero car has about twenty separate nodes and nine materials, so at level 0 it
// needs more triangles and draw calls than the default vehicle budget (18,000 and 14): each
// entry raises them to 22,000 triangles and 40 draw calls. The lower levels are one mesh each.

/** @type {Record<string, import('./index.js').AssetEntry>} */
export const SPORTS_CAR_ASSETS = {
  // Sports coupe (catalogue: Zarco Vendaval): two seats, front engine, rear drive.
  // 4.52 x 1.90 x 1.25 m (2.02 m over the mirrors), wheelbase 2.62 m, track 1.58 m, wheel
  // radius 0.35 m. The mirrors and handles are part of the doors; the tail pipes, diffuser
  // fins and plate plinths are part of bumper_r, the splitter blade and front plate plinth of
  // bumper_f. The tail-lamp units (tail over brake, indicator, reverse, centre light bar) are
  // part of lod0: a smoked red body carrying the emissive lamp strips under a domed lens
  // (glass_lens_red over tail and brake, glass_lens over indicator and reverse). The headlamps
  // are part of lod0 too: a glass_lens dome on the fender crest over the lamp_head strip and
  // two projector modules with lamp_head halo rings. window_rear has its own darker glass,
  // glass_rear (nearly opaque smoked glass, so the cabin does not read as an open top from the
  // chase camera); the side panes and the windscreen keep glass.
  sports_coupe: {
    file: 'sports_cars/sports_coupe.glb',
    kind: 'vehicle',
    lods: 3,
    nodes: [
      'lod0', 'lod1', 'lod2',
      'wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr',
      'door_fl', 'door_fr', 'hood', 'trunk', 'bumper_f', 'bumper_r', 'steering_wheel',
      'window_front', 'window_rear', 'window_l', 'window_r',
    ],
    anchors: [
      'anchor_seat_driver', 'anchor_seat_passenger_1',
      'anchor_door_driver', 'anchor_door_passenger',
      'anchor_light_head_l', 'anchor_light_head_r', 'anchor_light_tail_l', 'anchor_light_tail_r',
      'anchor_exhaust_1', 'anchor_exhaust_2', 'anchor_camera', 'anchor_plate_f', 'anchor_plate_r',
    ],
    colliders: ['col_box_body', 'col_box_cabin'],
    materials: [
      'atlas', 'paint', 'glass', 'glass_rear', 'glass_lens', 'glass_lens_red', 'lamp_head', 'lamp_tail',
      'lamp_brake', 'lamp_reverse', 'lamp_indicator_l', 'lamp_indicator_r',
    ],
    maxTriangles: 22000,
    maxDraws: 40,
  },
};

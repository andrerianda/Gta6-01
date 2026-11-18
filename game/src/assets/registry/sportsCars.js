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

  // Muscle car (catalogue: Holloway Thunderhead): two doors, four seats, front engine, rear
  // drive. 4.92 x 1.93 x 1.36 m (2.12 m over the mirrors), wheelbase 2.90 m, track 1.62 m,
  // wheel radius 0.35 m. Same node and material contract as sports_coupe, plus a rear bench
  // (anchor_seat_passenger_2 behind the driver, _3 on the right). The four round headlamps
  // (chrome bezel, lamp_head ring and core) sit in the full-width grille and are part of
  // bumper_f with the grille slats and the front plate plinth; the full-width tail-lamp panel
  // (tail over brake, indicator, reverse, centre bar under glass_lens_red / glass_lens) is part
  // of lod0; two pairs of tail pipes and the rear plate plinth are part of bumper_r.
  // Budget override: lod0 is 21,398 triangles (rear bench, round lamps): 26,000 and 44 draws.
  muscle_car: {
    file: 'sports_cars/muscle_car.glb',
    kind: 'vehicle',
    lods: 3,
    nodes: [
      'lod0', 'lod1', 'lod2',
      'wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr',
      'door_fl', 'door_fr', 'hood', 'trunk', 'bumper_f', 'bumper_r', 'steering_wheel',
      'window_front', 'window_rear', 'window_l', 'window_r',
    ],
    anchors: [
      'anchor_seat_driver', 'anchor_seat_passenger_1', 'anchor_seat_passenger_2',
      'anchor_seat_passenger_3',
      'anchor_door_driver', 'anchor_door_passenger',
      'anchor_light_head_l', 'anchor_light_head_r', 'anchor_light_tail_l', 'anchor_light_tail_r',
      'anchor_exhaust_1', 'anchor_exhaust_2', 'anchor_camera', 'anchor_plate_f', 'anchor_plate_r',
    ],
    colliders: ['col_box_body', 'col_box_cabin'],
    materials: [
      'atlas', 'paint', 'glass', 'glass_rear', 'glass_lens', 'glass_lens_red', 'lamp_head', 'lamp_tail',
      'lamp_brake', 'lamp_reverse', 'lamp_indicator_l', 'lamp_indicator_r',
    ],
    maxTriangles: 26000,
    maxDraws: 44,
  },

  // Supercar (catalogue: Ravello Saeta): two seats, mid engine, all-wheel drive.
  // 4.58 x 1.99 x 1.15 m (2.10 m over the mirrors), wheelbase 2.68 m, track 1.70 m, wheel
  // radius 0.35 m. Same node and material contract as sports_coupe. window_rear is the long
  // smoked glass engine cover (glass_rear); trunk is the short rear lid behind it, hood the
  // front lid. Slim crest headlamps (glass_lens dome, lamp_head strip, projector halos) and the
  // slim full-width tail light blade are part of lod0; the dark intakes ahead of the rear
  // wheels are atlas trim on lod0. The central pair of tail pipes, diffuser fins and rear plate
  // plinth are part of bumper_r; the splitter, intake slats and front plate plinth of bumper_f.
  // Budget override: lod0 is 19,962 triangles: 23,000 and 40 draws.
  supercar: {
    file: 'sports_cars/supercar.glb',
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
    maxTriangles: 23000,
    maxDraws: 40,
  },

  // Convertible cruiser (catalogue: Delmara Ocaso): two doors, four seats, front engine, rear
  // drive, ROOF DOWN. 5.42 x 1.99 x 1.37 m over the windscreen (2.23 m over the mirrors),
  // wheelbase 3.16 m, track 1.64 m, wheel radius 0.36 m. An open car: the only pane is
  // window_front (a wraparound windscreen); there is no window_rear, window_l or window_r and
  // the doors carry no glass. The open cockpit shows two front seats and a rear bench
  // (anchor_seat_passenger_2 behind the driver, _3 on the right); a tonneau (atlas) covers
  // the deck behind it. Round headlamps (bumper_f, with the grille slats and the front plate
  // plinth) and three round tail lamps a side in chrome bezels (lod0: tail ring over brake
  // core, indicator, reverse; no lens glass); broad chrome bumpers are atlas bands on the end
  // faces. Note for the game: col_box_cabin is the windscreen and the people, not a roof.
  // Budget override: lod0 is 20,294 triangles (open interior, rear bench, round lamps):
  // 26,000 and 44 draws.
  convertible_cruiser: {
    file: 'sports_cars/convertible_cruiser.glb',
    kind: 'vehicle',
    lods: 3,
    nodes: [
      'lod0', 'lod1', 'lod2',
      'wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr',
      'door_fl', 'door_fr', 'hood', 'trunk', 'bumper_f', 'bumper_r', 'steering_wheel',
      'window_front',
    ],
    anchors: [
      'anchor_seat_driver', 'anchor_seat_passenger_1', 'anchor_seat_passenger_2',
      'anchor_seat_passenger_3',
      'anchor_door_driver', 'anchor_door_passenger',
      'anchor_light_head_l', 'anchor_light_head_r', 'anchor_light_tail_l', 'anchor_light_tail_r',
      'anchor_exhaust_1', 'anchor_exhaust_2', 'anchor_camera', 'anchor_plate_f', 'anchor_plate_r',
    ],
    colliders: ['col_box_body', 'col_box_cabin'],
    materials: [
      'atlas', 'paint', 'glass', 'lamp_head', 'lamp_tail', 'lamp_brake', 'lamp_reverse',
      'lamp_indicator_l', 'lamp_indicator_r',
    ],
    maxTriangles: 26000,
    maxDraws: 44,
  },
};

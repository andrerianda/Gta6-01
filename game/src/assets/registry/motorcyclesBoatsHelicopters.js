// Motorcycles, boats and helicopters (art/blender/assets/{motorcycles,boats,helicopters}/).
// Written by hand (see index.js).
//
// Helicopters keep one contract with the game:
// - Origin on the ground under the rotor mast, resting on the skids, facing -Z.
// - lod0 is the shell (livery, glazing, cowling, boom, tail, skids, lights, sensor ball);
//   interior (seats, panel, console, cyclics), door_fl and door_fr are children of lod0 and show
//   at level 0 only. lod1 and lod2 are single merged meshes with the doors in them.
// - rotor_main (origin at the hub; spin it about the vertical axis, game +Y) with its child
//   rotor_main_blur, and rotor_tail (origin at its hub; spin it about local X) with its child
//   rotor_tail_blur, show at every level. The blur discs are two-sided translucent annuli in the
//   glass_rotor material. Both are visible as loaded: hide the blur child while the rotor is
//   stopped or slow, and at speed show it instead of the blades (hide the rotor's own mesh, keep
//   the child visible) and turn it slowly.
// - door_fl / door_fr: the front doors, hinged at their front edges (origin on the hinge line,
//   swing about the vertical axis). The pilot sits on the left (-X), like the cars' driver.
// - searchlight (police): origin at its gimbal (the drum's centre); aim it by rotating the node.
//   anchor_searchlight is its child at the lens, pointing along the beam (extras light 'spot',
//   range, angle in degrees, color).
// - Anchors: anchor_seat_* are seated hip joints facing forward (driver and passenger_1 in front,
//   passenger_2 / _3 on the rear bench); anchor_door_driver stands on the ground beside door_fl
//   facing it; anchor_light_head_l is the landing light under the nose (forward and down);
//   anchor_light_tail_l the anti-collision beacon on the fin top; anchor_camera the chase target;
//   anchor_decal_side_l / _r the centres of the flat lower cabin sides behind the doors, facing
//   outward, with extras width and height (metres) for the painted lettering.
// - Colliders: col_box_cabin (pod and skids), col_box_tail (boom, fin, stabiliser) and
//   col_cyl_rotor (the main rotor disc: diameter = 2 x rotor_radius, 0.3 m thick).
// - Materials: paint (livery base, tinted, clear-coated), paint_secondary (the lower body, the
//   shroud and end plates), glass (canopy, windows, lenses), glass_rotor (blur discs), lamp_head
//   (landing light), lamp_nav_red (left stabiliser tip), lamp_nav_green (right), lamp_tail (red
//   beacons on the cowling and the fin), lamp_siren_a (red, -X) and lamp_siren_b (blue, +X) under
//   the belly and on the roof: flash them alternately; lamp_searchlight; atlas for the rest.
// - Scene extras (asset.extras): rotor_radius, rotor_hub_height, tail_rotor_radius, skid_height
//   (belly clearance over the skid bottoms), skid_track (between skid centres), seats.
//
// Budget: eleven nodes and twelve game materials need about 26 draw calls at level 0, and the
// geometry (no mesh compression in this build) is about 610 kB, so the byte cap is raised too.

const HELICOPTER_NODES = [
  'lod0', 'lod1', 'lod2', 'interior', 'door_fl', 'door_fr',
  'rotor_main', 'rotor_main_blur', 'rotor_tail', 'rotor_tail_blur',
];

const HELICOPTER_ANCHORS = [
  'anchor_seat_driver', 'anchor_seat_passenger_1', 'anchor_seat_passenger_2',
  'anchor_seat_passenger_3', 'anchor_door_driver', 'anchor_camera', 'anchor_light_head_l',
  'anchor_light_tail_l', 'anchor_decal_side_l', 'anchor_decal_side_r',
];

const HELICOPTER_MATERIALS = [
  'atlas', 'paint', 'paint_secondary', 'glass', 'glass_rotor', 'lamp_head', 'lamp_nav_red',
  'lamp_nav_green', 'lamp_tail',
];

// Motorcycles keep one contract with the game:
// - Origin on the ground midway between the axles, facing -Z, standing upright.
// - lod0 / lod1 / lod2: the body (fairing, tank, seat, tail, frame, engine, exhaust, pegs, mirrors,
//   dash). lod1 and lod2 are merged, decimated copies. The moving parts show at every level.
// - fork: an empty on the steering axis whose local +Y (game) runs UP the raked axis (Blender's
//   local Z) and whose local X is the bike's right: steer by turning it about its own local Y in
//   the game. Its children: fork_mesh (legs, clamps, clip-ons, grips, levers, front mudguard,
//   calipers) and wheel_f. anchor_grip_l / anchor_grip_r are children of fork.
// - wheel_f, wheel_r: origin at the hub; spin about local X. wheel_r is a child of swingarm
//   (origin at its pivot; turn it about X for suspension travel).
// - Anchors: anchor_seat_driver / anchor_seat_passenger_1 are the seated hip joints facing
//   forward; anchor_foot_l / _r the footpegs; anchor_stand on the ground at the left facing the
//   bike (where the rider stands to mount); anchor_light_head_l the headlamp (spot extras);
//   anchor_light_tail_l the tail lamp; anchor_exhaust_1 the under-seat outlet; anchor_plate_r the
//   blank rear plate (extras width, height); anchor_camera the chase target.
// - Materials: paint (body colour, clear-coated), glass (screen and lamp lenses), lamp_head,
//   lamp_tail, lamp_brake, lamp_indicator_l, lamp_indicator_r; atlas for the rest.
// - Scene extras: wheelbase, wheel_radius_f, wheel_radius_r, seat_height, rake_degrees, trail,
//   seats.

// Boats keep one contract with the game:
// - Origin at the waterline (the plane the hull floats on at rest) at mid hull length, facing -Z.
// - lod0 / lod1 / lod2: the hull and everything fixed (deck, screen, consoles, seats, rails,
//   platforms, lights). lod1 and lod2 are merged, decimated copies. The moving parts below show
//   at every level.
// - engine_l / engine_r: the outboards, origin on the steering pivot at the transom: swing them
//   about the vertical axis (game Y) to steer. propeller_l / propeller_r are their children,
//   origin at the hub, spinning about their shaft (game local Z, along the boat).
// - steering_wheel: an empty on the wheel hub whose local +Y (game) runs up the column toward
//   the helmsman; turn it about that axis. Its child steering_wheel_mesh is the wheel.
// - Anchors: anchor_seat_driver (helm seat, starboard), anchor_seat_passenger_1..3 are seated hip
//   joints facing forward; anchor_board on the swim platform where a person steps aboard;
//   anchor_wake at the waterline at the transom centre (pointing aft); anchor_spray_l / _r at
//   the chines forward (pointing out and forward); anchor_light_head_l the bow light;
//   anchor_light_tail_l the stern all-round light on its pole; anchor_camera the chase target.
// - Collider: col_hull_hull, a coarse convex hull of the hull up to the sheer.
// - Materials: paint (topsides, recoloured, clear coat), paint_secondary (hull sweep and boot
//   stripe), glass (windscreen), lamp_head (bow light), lamp_nav_red (port, left) and
//   lamp_nav_green (starboard, right) side lights, lamp_tail (stern light); atlas for the rest
//   (antifouling, non-slip and teak decks, upholstery, stainless, outboard cowls).
// - Scene extras: hull_length, overall_length, beam, draught, freeboard, seats.
// - police_boat adds: lamp_siren_a (red, -X) and lamp_siren_b (blue, +X) in the roof light bar
//   (flash them alternately) with anchor_siren above it; a fixed roof searchlight whose lens is
//   lamp_searchlight and whose beam starts at anchor_searchlight (extras light 'spot', range,
//   angle in degrees, color; aim the game's light from it); anchor_decal_side_l / _r on the
//   white topsides under the collar, facing out, with extras width and height for the painted
//   lettering; col_box_cabin for the wheelhouse.

const BOAT_ANCHORS = [
  'anchor_seat_driver', 'anchor_seat_passenger_1', 'anchor_seat_passenger_2',
  'anchor_seat_passenger_3', 'anchor_board', 'anchor_wake', 'anchor_spray_l', 'anchor_spray_r',
  'anchor_light_head_l', 'anchor_light_tail_l', 'anchor_camera',
];

const MOTORCYCLE_ANCHORS = [
  'anchor_seat_driver', 'anchor_seat_passenger_1', 'anchor_grip_l', 'anchor_grip_r',
  'anchor_foot_l', 'anchor_foot_r', 'anchor_stand', 'anchor_light_head_l', 'anchor_light_tail_l',
  'anchor_exhaust_1', 'anchor_camera', 'anchor_plate_r',
];

/** @type {Record<string, import('./index.js').AssetEntry>} */
export const CRAFT_ASSETS = {
  // Sport motorcycle (catalogue: Rayo Centella): 2.13 m over the tyres, 0.76 m over the mirrors,
  // 1.10 m to the screen top. Wheelbase 1.42 m: front hub (0, 0.300, -0.71) radius 0.300
  // (120/70-17), rear hub (0, 0.305, 0.71) radius 0.305 (180/55-17), in game axes. Rake 24
  // degrees, trail 0.10 m, seat 0.82 m, swingarm pivot at (0, 0.44, 0.25). 2 seats.
  sport_motorcycle: {
    file: 'motorcycles/sport_motorcycle.glb',
    kind: 'vehicle',
    lods: 3,
    nodes: ['lod0', 'lod1', 'lod2', 'fork', 'fork_mesh', 'wheel_f', 'swingarm', 'wheel_r'],
    anchors: MOTORCYCLE_ANCHORS,
    colliders: ['col_box_body'],
    materials: ['atlas', 'paint', 'glass', 'lamp_head', 'lamp_tail', 'lamp_brake',
      'lamp_indicator_l', 'lamp_indicator_r'],
    // The brief's motorcycle caps: about 11,500 / 7,800 / 5,900 triangles (the wheels, fork and
    // swingarm are separate nodes at every level), 13 draws, about 256 kB.
    maxTriangles: 14000,
    maxDraws: 14,
    maxBytes: 430000,
  },
  // Speedboat (catalogue: Olabarria Pez Vela 32): open sports boat with twin outboards, hull
  // 9.05 m (9.80 m over the engines), beam 2.72 m, draught 0.45 m at the keel, freeboard about
  // 0.94 m amidships (0.88 m aft, 1.30 m at the bow), 2.0 m to the screen top. Waterline at
  // game y 0, mid hull length at z 0: transom at game z +4.30, stem at z -4.75. Outboard pivots
  // at (+-0.34, 0.62, 4.40), propeller hubs at (+-0.34, -0.30, 5.12). Helm to starboard (+X).
  // 4 seats. Livery: base #F0EEE8, secondary #1F9AA0.
  speedboat: {
    file: 'boats/speedboat.glb',
    kind: 'vehicle',
    lods: 3,
    nodes: ['lod0', 'lod1', 'lod2', 'engine_l', 'engine_r', 'propeller_l', 'propeller_r',
      'steering_wheel', 'steering_wheel_mesh'],
    anchors: BOAT_ANCHORS,
    colliders: ['col_hull_hull'],
    materials: ['atlas', 'paint', 'paint_secondary', 'glass', 'lamp_head', 'lamp_nav_red',
      'lamp_nav_green', 'lamp_tail'],
    // Nine nodes (body levels, two engines, two propellers, the wheel) and eight materials:
    // 11,104 / 5,588 / 2,967 triangles (the engines and propellers show at every level),
    // 13 draws at level 0, about 244 kB.
    maxTriangles: 16000,
    maxDraws: 14,
    maxBytes: 430000,
  },
  // Police boat (catalogue: Olabarria Rompeolas 36, Harbour Patrol): rigid aluminium hull in a
  // grey foam collar, hull 10.1 m (11.0 m over the guard rail behind the engines), beam 3.32 m
  // over the collar, draught 0.70 m, freeboard about 1.13 m amidships, 3.4 m to the radome
  // (whip antenna 4.05 m). Waterline at game y 0, mid hull length at z 0: transom at game
  // z +4.90, collar bow at z -5.5. Wheelhouse amidships (game z -1.45 .. +1.10, roof 2.42 m);
  // outboard pivots at (+-0.44, 0.69, 5.01). Helm to starboard (+X). 4 seats. Livery: base
  // #F2F0E8, secondary #1D4E7A (boot band, roof band).
  police_boat: {
    file: 'boats/police_boat.glb',
    kind: 'vehicle',
    lods: 3,
    nodes: ['lod0', 'lod1', 'lod2', 'engine_l', 'engine_r', 'propeller_l', 'propeller_r',
      'steering_wheel', 'steering_wheel_mesh'],
    anchors: [...BOAT_ANCHORS, 'anchor_siren', 'anchor_searchlight', 'anchor_decal_side_l',
      'anchor_decal_side_r'],
    colliders: ['col_hull_hull', 'col_box_cabin'],
    materials: ['atlas', 'paint', 'paint_secondary', 'glass', 'lamp_head', 'lamp_nav_red',
      'lamp_nav_green', 'lamp_tail', 'lamp_siren_a', 'lamp_siren_b', 'lamp_searchlight'],
    // Nine nodes and eleven materials: 12,084 / 5,583 / 2,958 triangles (the engines and
    // propellers show at every level), 16 draws at level 0 (over the vehicle default), 260 kB.
    maxTriangles: 16000,
    maxDraws: 20,
    maxBytes: 430000,
  },
  // News helicopter (catalogue: Golfo Aero Libelula, Canal 6 Golfo): single-engine light
  // helicopter with a teardrop bubble canopy, 10.15 m nose to fin, pod 1.50 m wide, 1.96 m over
  // the skids, 3.2 m high at the rotor head. Three-blade main rotor, radius 4.90 m, hub 3.05 m
  // above the ground; open two-blade tail rotor, radius 0.80 m, on the LEFT of the fin at
  // (x -0.21, height 2.12, 5.98 m behind the mast). Skids: track 1.96 m, belly clearance 0.47 m.
  // 4 seats. Camera ball under the nose, antenna pods and a belly dish; no searchlight, no
  // sirens. Livery: base #F1EFEA, secondary #C2337A (lower body, boom underside, fin), dark pin
  // stripe in the atlas.
  news_helicopter: {
    file: 'helicopters/news_helicopter.glb',
    kind: 'vehicle',
    lods: 3,
    nodes: HELICOPTER_NODES,
    anchors: HELICOPTER_ANCHORS,
    colliders: ['col_box_cabin', 'col_box_tail', 'col_cyl_rotor'],
    materials: HELICOPTER_MATERIALS,
    // Ten nodes and nine materials: 11,944 / 4,119 / 1,995 triangles (the rotors show at every
    // level), 22 draws at level 0, about 205 kB.
    maxTriangles: 17000,
    maxDraws: 26,
    maxBytes: 430000,
  },
  // Police helicopter (catalogue: Golfo Aero Gavilan, MPD Air Support): 11.0 m nose to fin,
  // pod 1.64 m wide, 2.24 m over the skids, 3.45 m high at the rotor head. Four-blade main
  // rotor, radius 5.40 m, hub 3.30 m above the ground; fenestron tail rotor radius 0.38 m at
  // (x 0, height 1.98, 6.62 m behind the mast). Skids: track 2.24 m, belly clearance 0.47 m.
  // 4 seats. Livery: base #F2F0E8, secondary #1D4E7A, gold pin stripe in the atlas.
  // searchlight under the nose on the right (+X), sensor ball on the left.
  police_helicopter: {
    file: 'helicopters/police_helicopter.glb',
    kind: 'vehicle',
    lods: 3,
    nodes: [...HELICOPTER_NODES, 'searchlight'],
    anchors: [...HELICOPTER_ANCHORS, 'anchor_searchlight'],
    colliders: ['col_box_cabin', 'col_box_tail', 'col_cyl_rotor'],
    materials: [...HELICOPTER_MATERIALS, 'lamp_siren_a', 'lamp_siren_b', 'lamp_searchlight'],
    // Eleven nodes and twelve materials: about 13,400 / 5,000 / 2,900 triangles (the rotors and
    // the searchlight show at every level) and 26 draws at level 0; about 676 kB, most of it
    // uncompressed geometry.
    maxTriangles: 17000,
    maxDraws: 30,
    maxBytes: 690000,
  },
};

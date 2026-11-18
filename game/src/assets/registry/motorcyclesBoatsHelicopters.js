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

/** @type {Record<string, import('./index.js').AssetEntry>} */
export const CRAFT_ASSETS = {
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

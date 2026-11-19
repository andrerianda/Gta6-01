// The models of Base Aérea Punta Garza and of the radar war (art/blender/military/, built by
// art/build_military.py): shelters, tower, guard post, fence, floodlight, the coastal radar tower
// and the guided bomb. Written by hand (see index.js).
//
// One contract for all: origin on the ground at the footprint's centre (the bomb: its middle),
// front towards -Z, static geometry joined into lod0 / lod1 / lod2 (one draw call per material),
// moving parts as nodes of their own with the origin on the pivot, col_box_* proxies, lamps by
// group. Hinge extras name Blender axes as the aircraft do: x is the game's +X, y the game's -Z,
// z the game's +Y. Every asset is within its kind's default budget.

/**
 * The military base assets by id.
 * @type {Readonly<Record<string, import('./index.js').AssetEntry>>}
 */
export const MILITARY_BASE_ASSETS = {
  // Hardened aircraft shelter in camouflage paint: x -29..29 (a porch to 30.65), z -26 (apron lip;
  // the door plane is z -20..-21.1) to +21.1, 15 m high (roof vents to 16.2). Open on -Z: 50.4 m
  // clear at 9 m height, 52.8 m at the floor, 10.2 m under the stowed door (extras door_clear,
  // inside). Anchors: anchor_park (centre of the floor, facing out), anchor_door (door line).
  base_hardened_shelter: {
    file: 'military/base_hardened_shelter.glb',
    kind: 'building',
    lods: 3,
    nodes: ['lod0', 'lod1', 'lod2'],
    anchors: ['anchor_park', 'anchor_door'],
    colliders: ['col_box_wall_l', 'col_box_wall_r', 'col_box_back', 'col_box_roof'],
    materials: ['atlas', 'lamp_interior'],
  },
  // Control tower, 26 m to the antenna tips: the eight-sided shaft stands at z = -2.5, the 14 x 8 m
  // annex behind it (z -1.5..+6.5); walkway deck at 19 m, cab floor 19.06 m, cab roof 23.25 m.
  base_control_tower: {
    file: 'military/base_control_tower.glb',
    kind: 'building',
    lods: 3,
    nodes: ['lod0', 'lod1', 'lod2'],
    anchors: ['anchor_cab', 'anchor_beacon'],
    colliders: ['col_box_shaft', 'col_box_cab', 'col_box_annex'],
    materials: ['atlas', 'glass', 'glass_window', 'lamp_cab', 'lamp_beacon'],
  },
  // Guard post: the 3 x 4 m gatehouse on the origin, the boom barrier beside it. barrier_arm has
  // its origin on the pivot (x 2.6, y 1.0, z 0) and reaches to x = 10.6 when lowered; scene extra
  // barrier_open = { axis: 'y', degrees: -85 } (rotation.z = +85 degrees in the game raises it).
  // col_box_barrier is the lowered arm: ignore it while the barrier is open.
  base_guard_post: {
    file: 'military/base_guard_post.glb',
    kind: 'building',
    lods: 3,
    nodes: ['lod0', 'lod1', 'lod2', 'barrier_arm'],
    anchors: ['anchor_guard'],
    colliders: ['col_box_house', 'col_box_barrier', 'col_box_block_1', 'col_box_block_2'],
    materials: ['atlas', 'glass', 'lamp_post'],
  },
  // Perimeter fence: lod0..2 are one 6 m chain-link panel along X (x -3..3, barbed wire leaning
  // 0.3 m towards -Z, the outside; the re-made panel has concrete posts and a concertina coil to
  // about 3.05 m). gate_leaf is a second object in the same file: an 8 m framed leaf with its
  // origin on the hinge at x = -4 (extra gate_leaf: swing about the vertical axis).
  // Asset.createBatch() would draw the leaf with every panel: batch the panel from the geometry of
  // the lod node, and place the leaf from findNode('gate_leaf'). The re-made file adds the node
  // sign_warning (a 0.75 x 0.5 m plate at the panel's origin, every level: the base hangs it on
  // every fifth panel) and the opaque material atlas for posts, rails and the sign; the game uses
  // both when they are there (world/airbase/airBaseStructures.js).
  base_fence: {
    file: 'military/base_fence.glb',
    kind: 'prop',
    lods: 3,
    nodes: ['lod0', 'lod1', 'lod2', 'gate_leaf'],
    colliders: ['col_box_panel', 'col_box_gate_leaf'],
    materials: ['cutout'],
  },
  // The ground library of the airfields (Punta Garza and the Norvast strip): ten flat quads that
  // only carry materials, never instantiated as they are (world/airbase/groundKit.js lays the
  // materials on generated slabs). Four seamless 4 x 4 m tiles (scene extra tile_metres) with
  // base colour, normal and roughness: ground_concrete (one slab per tile, the sealed joint on the
  // tile border), ground_asphalt, ground_grass, ground_dirt (two tyre ruts along V); and six alpha
  // decals on one atlas (KHR_texture_transform per material, UV 0..1 shows the whole decal, width
  // along U and length along V): decal_tyre_rubber 6 x 30 m, decal_scorch 6 x 8 m (source end at
  // v = 0), decal_crack 4 x 4 m, decal_oil_stain 2 x 2 m, decal_paint_white / _yellow 1 x 4 m
  // strips that tile along V. Ten materials, so ten draws by design; 1024 px textures take the
  // file over the prop default in bytes.
  base_ground: {
    file: 'military/base_ground.glb',
    kind: 'prop',
    lods: 1,
    nodes: ['ground_concrete', 'ground_asphalt', 'ground_grass', 'ground_dirt', 'decal_tyre_rubber', 'decal_scorch', 'decal_crack',
      'decal_oil_stain', 'decal_paint_white', 'decal_paint_yellow'],
    materials: ['ground_concrete', 'ground_asphalt', 'ground_grass', 'ground_dirt', 'decal_tyre_rubber', 'decal_scorch', 'decal_crack',
      'decal_oil_stain', 'decal_paint_white', 'decal_paint_yellow'],
    maxDraws: 10,
    maxBytes: 840000,
  },
  // Watchtower, 9.2 m: lattice legs, a sandbagged cabin (floor at 6.0 m, scene extra deck_height),
  // roof, ladder on the back (+Z). lamp_search is the searchlight's lens (every level);
  // anchor_search is at the lens and points along the beam (-Z, 12 degrees down), anchor_guard is
  // the standing point on the cabin floor. About 4.4 x 9.2 x 5.2 m.
  base_watchtower: {
    file: 'military/base_watchtower.glb',
    kind: 'building',
    lods: 3,
    nodes: ['lod0', 'lod1', 'lod2', 'lamp_search'],
    anchors: ['anchor_search', 'anchor_guard'],
    colliders: ['col_box_legs', 'col_box_cabin'],
    materials: ['atlas', 'lamp_search'],
  },
  // Camouflage net on eight 6 m poles, 24 m (X) x 18 m (Z) over the pegs, 6.2 m high: the front
  // hem (-Z) is propped 4 m high to drive in under it, the sides and back come down to 2 m; clear
  // height about 4.6 m (extra clear_height). The net is cutout_net (alpha tested, see-through
  // gaps); poles, ropes and pegs are atlas. anchor_park is the centre on the ground.
  base_camo_net: {
    file: 'military/base_camo_net.glb',
    kind: 'building',
    lods: 3,
    nodes: ['lod0', 'lod1', 'lod2'],
    anchors: ['anchor_park'],
    colliders: ['col_box_pole_1', 'col_box_pole_2', 'col_box_pole_3', 'col_box_pole_4', 'col_box_pole_5', 'col_box_pole_6', 'col_box_pole_7',
      'col_box_pole_8'],
    materials: ['atlas', 'cutout_net'],
  },
  // Floodlight mast, 18.2 m: six floodlights shining towards -Z, 30 degrees down. anchor_light is
  // the middle of the head and points the same way. The re-made file carries the lenses as the
  // node lamp_head (material lamp_flood, every level), which the base dims by the hour.
  base_floodlight_mast: {
    file: 'military/base_floodlight_mast.glb',
    kind: 'prop',
    lods: 3,
    nodes: ['lod0', 'lod1', 'lod2'],
    anchors: ['anchor_light'],
    colliders: ['col_box_mast'],
    materials: ['atlas', 'lamp_flood'],
  },
  // Radar Cabo Lejano, 33.6 m: 14 x 12 m plinth, cabin, radome, tapered tower, platform at 26 m.
  // The node antenna (origin on the tower's axis at y = 28.4) turns about the game's Y axis; the
  // 9 m reflector looks towards -Z at rest. anchor_antenna is the middle of the reflector.
  radar_tower: {
    file: 'military/radar_tower.glb',
    kind: 'building',
    lods: 3,
    nodes: ['lod0', 'lod1', 'lod2', 'antenna'],
    anchors: ['anchor_antenna'],
    colliders: ['col_box_plinth', 'col_box_tower', 'col_box_platform', 'col_box_cabin'],
    materials: ['atlas', 'lamp_beacon'],
  },
  // The same station destroyed, same origin: stump on the plinth, the tower fallen towards +X
  // (wreckage out to x = 33, so it needs 37 m of clear ground on that side).
  radar_tower_wreck: {
    file: 'military/radar_tower_wreck.glb',
    kind: 'building',
    lods: 3,
    nodes: ['lod0', 'lod1', 'lod2'],
    colliders: ['col_box_plinth', 'col_box_stump', 'col_box_cabin', 'col_box_section_a', 'col_box_section_b', 'col_box_deck',
      'col_box_antenna'],
    materials: ['atlas'],
  },
  // Guided glide bomb, 3.6 m long, 0.4 m body, fins to 0.8 m across; origin at its middle, nose -Z.
  guided_bomb: {
    file: 'military/guided_bomb.glb',
    kind: 'prop',
    lods: 3,
    nodes: ['lod0', 'lod1', 'lod2'],
    colliders: ['col_box_body'],
    materials: ['atlas'],
  },
};

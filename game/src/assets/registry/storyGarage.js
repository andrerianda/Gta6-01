// The models of the final arc's garage scenes (art/blender/story/garage/, built by
// art/build_story_garage.py): the night office of Tolliver Tow with its desk and window, and the
// props the cinematics hold close: the foreclosure letter, the framed photograph of a young pilot,
// the bank's seal, the forged pass, the uniform on its hanger and the payment case. Written by hand
// (see index.js).
//
// One contract for all: metres, +Y up, the front towards -Z, one level of detail (static geometry
// joined into lod0, one draw call per material), named parts as nodes of their own with the origin
// on the pivot. Positions below are in the game's axes, relative to the asset's origin.

/** @type {Readonly<Record<string, import('./index.js').AssetEntry>>} */
export const STORY_GARAGE_ASSETS = Object.freeze({
  // The office seen from inside (single-sided shell): inner size 7.0 (x) x 3.0 (y) x 5.5 (z),
  // origin at the floor centre. The -Z wall holds the glazed door (opening x -2.7..-1.8, 2.05 high;
  // door_office has its origin on the hinge at (-2.7, 0, -2.8), rotation.y < 0 swings it into the
  // room) and the window (x 0.2..2.4, y 0.95..2.25, blind half down, rain baked into glass_rain).
  // Desk 1.6 x 0.8, top at y 0.76, centre (1.6, 0.3); the chair behind it faces -Z. +X wall: the
  // photograph's place and the calendar; +Z wall: shelves, clock, pegboard, filing cabinet; -X
  // wall: the sign and the coat hooks. lamp_desk is the lamp's shade (origin (1.29, 1.16, 0.25)),
  // its inside the emissive material lamp_desk; scene extra lamp_desk_bulb is where the light goes.
  // Anchors: anchor_letter (1.58, 0.761, 0.44), anchor_phone (2.02, 0.761, 0.32), anchor_seat
  // (1.63, 0.52, 1.08), anchor_photo (3.496, 1.6, 0.6; points to -X), anchor_hanger (-3.44, 1.893,
  // 0.8; points to +X), anchor_seal (-2.25, 1.5, -2.824; outside the door glass, points to -Z),
  // anchor_stand_visitor (-2.25, 0, -1.75; faces +Z). maxTriangles: a whole dressed interior that
  // the camera stands in (tools, tins, blind slats, keys) in one file, drawn once and never far.
  garage_office_set: {
    file: 'story/garage_office_set.glb',
    kind: 'building',
    lods: 1,
    nodes: ['lod0', 'door_office', 'lamp_desk'],
    anchors: ['anchor_letter', 'anchor_photo', 'anchor_phone', 'anchor_seat', 'anchor_hanger', 'anchor_seal',
      'anchor_stand_visitor'],
    materials: ['atlas', 'glass_rain', 'lamp_desk'],
    maxTriangles: 13000,
  },
  // A4 letter lying flat, printed side up, the top of the page towards -Z: x -0.105..0.105,
  // z -0.148..0.148, corners lifting to y 0.008. anchor_top is the middle of the top edge.
  foreclosure_letter: {
    file: 'story/foreclosure_letter.glb',
    kind: 'prop',
    lods: 1,
    nodes: ['lod0'],
    anchors: ['anchor_top'],
    materials: ['atlas'],
  },
  // 30 x 40 cm frame, 2.6 cm deep, upright: origin at the centre of its back, the picture faces -Z.
  framed_pilot_photo: {
    file: 'story/framed_pilot_photo.glb',
    kind: 'prop',
    lods: 1,
    nodes: ['lod0'],
    materials: ['atlas', 'glass'],
  },
  // The seal for a 0.9 m door leaf: two 1.4 m tapes crossed (x -0.47..0.47, y -0.55..0.55) under a
  // 40 x 30 cm notice. Origin at the centre of its back, the lettering faces -Z.
  bank_seal_notice: {
    file: 'story/bank_seal_notice.glb',
    kind: 'prop',
    lods: 1,
    nodes: ['lod0'],
    materials: ['atlas'],
  },
  // 86 x 54 mm pass hanging upright from its clip and lanyard (to y 0.153): origin at the centre
  // of the card, the printed face towards -Z.
  forged_pass_card: {
    file: 'story/forged_pass_card.glb',
    kind: 'prop',
    lods: 1,
    nodes: ['lod0'],
    materials: ['atlas'],
  },
  // Jacket, trousers and cap on a hanger: origin at the top of the hanger's hook, hanging to
  // y -1.3, 0.71 wide, the jacket's front towards -Z. anchor_collar (0, -0.1, 0). maxTriangles:
  // lofted cloth, lapels, pockets, buttons and the cap are seen in close shots.
  uniform_on_hanger: {
    file: 'story/uniform_on_hanger.glb',
    kind: 'prop',
    lods: 1,
    nodes: ['lod0'],
    anchors: ['anchor_collar'],
    materials: ['atlas'],
    maxTriangles: 3000,
  },
  // 46 x 33 x 15 cm case lying flat, origin under its centre, latches and handle on -Z. The node
  // lid has its origin on the hinge line (0, 0.095, 0.165); rotation.x = +1.9 opens it (scene
  // extra lid_open) on twelve banded stacks of notes. anchor_handle (0, 0.035, -0.195).
  // maxTriangles and maxBytes: a rounded ribbed shell, a liner and the stacks, all seen close.
  payment_case: {
    file: 'story/payment_case.glb',
    kind: 'prop',
    lods: 1,
    nodes: ['lod0', 'lid'],
    anchors: ['anchor_handle'],
    materials: ['atlas'],
    maxTriangles: 4000,
    maxBytes: 420000,
  },
});

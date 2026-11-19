// The models of the final arc's base scenes (art/blender/story/hangar/, built by
// art/build_story_hangar.py): the dark hangar interior with its two sliding doors, the fabric covers
// with their red streamers, the tarpaulin curtain, the helmet visor rims the first-person shots look
// through, the pilot's gloved arm, and the pressure suit's portable cooler. Written by hand (see
// index.js). Game axes: +Y up, faces -Z, metres. None has colliders: they are cinematic sets.

/** @type {Readonly<Record<string, import('./index.js').AssetEntry>>} */
export const STORY_HANGAR_ASSETS = Object.freeze({
  // The hangar seen from inside: 60 m wide (x -30..30), 52 m deep (z -26..26), 15 m to the roof
  // deck (11.3 m clear under the lamp housings), origin at the floor centre, the door wall at
  // z = -26 with a 54 x 13 m opening. door_l / door_r: 27.2 x 13.2 x 0.3 m leaves hanging outside
  // the wall in two planes (origins at their centres: (-13.5, 6.6, -26.75) and (13.5, 6.6, -27.15)),
  // overlapping 0.2 m at the centre line; door_l slides to -X, door_r to +X, each by the scene
  // extra door_travel (27.2 m); the head rails reach x +-54.7. anchor_aircraft (0, 0, 4) nose to
  // the doors, anchor_eye_start (0, 1.7, 23), anchor_door_centre (0, 0, -26). One level only (a
  // cinematic interior); the trusses, pilasters, crib and door ribs take about 10,800 triangles
  // and the 2048 atlas 1.7 MB, over the building defaults.
  hangar_interior_set: {
    file: 'story/hangar_interior_set.glb',
    kind: 'building',
    lods: 1,
    nodes: ['lod0', 'door_l', 'door_r'],
    anchors: ['anchor_aircraft', 'anchor_eye_start', 'anchor_door_centre'],
    materials: ['atlas'],
    maxTriangles: 12000,
    maxBytes: 1890000,
  },

  // Covers in the Manta Sombra's model space (parent to the aircraft): cover_nose (a wedge sock
  // over the first 1.6 m of the nose, origin (0, 2.72, -9.3), streamer hanging 1.85 m under the
  // apex), cover_intake_l / _r (quilted blankets 3 x 1.5 m over the intake slits at x -+4, their
  // streamers lying forward on the skin). Three two-sided cloth nodes and a 1024 atlas for the
  // lettering: over the prop defaults.
  aircraft_covers_manta: {
    file: 'story/aircraft_covers_manta.glb',
    kind: 'prop',
    lods: 1,
    nodes: ['cover_nose', 'cover_intake_l', 'cover_intake_r'],
    anchors: [],
    materials: ['atlas'],
    maxTriangles: 4200,
    maxBytes: 400000,
  },

  // Covers in the Garza Negra's model space: cover_nose (nose-and-pitot sock from z -15.6 to
  // -17.99, origin (0, 2.2, -16.8), streamer hanging 1.4 m), cover_intake_l / _r (conical plugs
  // over the intake spikes at x -+4.2, origins (-+4.2, 2.4, -4.2), streamers hanging 1.3 m).
  // Two-sided cloth: over the prop triangle default.
  aircraft_covers_garza: {
    file: 'story/aircraft_covers_garza.glb',
    kind: 'prop',
    lods: 1,
    nodes: ['cover_nose', 'cover_intake_l', 'cover_intake_r'],
    anchors: [],
    materials: ['atlas'],
    maxTriangles: 3200,
    maxBytes: 300000,
  },

  // Tarpaulin closing a hangar mouth: curtain_l (x -13..0) and curtain_r (x 0..13), 13 m high in
  // the plane z = 0, origins at their TOP OUTER corners (-+13, 13, 0): scale or slide along X to
  // draw them aside. Two-sided folded cloth 26 m wide with eyelets, ropes and patches: over the
  // prop defaults.
  tarpaulin_curtain: {
    file: 'story/tarpaulin_curtain.glb',
    kind: 'prop',
    lods: 1,
    nodes: ['curtain_l', 'curtain_r'],
    anchors: [],
    materials: ['atlas'],
    maxTriangles: 7000,
    maxBytes: 700000,
  },

  // The flight helmet seen from inside, in CAMERA space (camera at the origin looking down -Z,
  // 60 degrees vertical at 16:9; nothing nearer than 0.14 m): lod0 (edge roll, shell, cheek pads,
  // mask top, visor pivots, visor trim) and visor_glass (material glass_visor: tint, smudges, fog
  // and scratches in its texture's alpha).
  helmet_visor_rim: {
    file: 'story/helmet_visor_rim.glb',
    kind: 'prop',
    lods: 1,
    nodes: ['lod0', 'visor_glass'],
    anchors: [],
    materials: ['atlas', 'glass_visor'],
  },

  // The pressure helmet seen from inside, same camera space: lod0 (round faceplate frame with
  // bolts and feed port, neck ring 0.215 m below the eye) and visor_glass.
  pressure_helmet_rim: {
    file: 'story/pressure_helmet_rim.glb',
    kind: 'prop',
    lods: 1,
    nodes: ['lod0', 'visor_glass'],
    anchors: [],
    materials: ['atlas', 'glass_visor'],
    maxBytes: 240000,
  },

  // Right forearm and gloved salute hand: origin at the elbow, forearm along -Z, palm down, thumb
  // to -X, 0.468 m to the fingertips. anchor_wrist (0, 0, -0.3).
  pilot_arm_fp: {
    file: 'story/pilot_arm_fp.glb',
    kind: 'prop',
    lods: 1,
    nodes: ['lod0'],
    anchors: ['anchor_wrist'],
    materials: ['atlas'],
  },

  // The pressure suit's portable cooler, 0.35 x 0.25 x 0.30 m (hose coils to x -0.255, handle top
  // 0.396), origin under its centre; anchor_grip (0, 0.385, 0) in the handle.
  suit_cooler: {
    file: 'story/suit_cooler.glb',
    kind: 'prop',
    lods: 1,
    nodes: ['lod0'],
    anchors: ['anchor_grip'],
    materials: ['atlas'],
  },
});

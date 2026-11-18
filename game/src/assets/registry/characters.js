// Characters: the player, pedestrians, police. Written by hand (see index.js).
//
// Every person is one skinned file on the shared skeleton (the 22 bones below, exactly
// naming.SKELETON_BONES / the brief's contract; bones run from joint to joint and the rest pose is
// an A-pose: arms straight, 40 degrees below horizontal, palms down, legs straight, feet
// hip-width apart). The files carry no animation clips: the game animates from the rest joint
// positions, which differ per person. lod0, lod1 and lod2 are separate skinned meshes on the same
// skeleton (switch at 12 m and 30 m, extras.lod_distances). extras.height is the person's height
// in metres.
//
// Anchors ride on bones: anchor_hand_r / anchor_hand_l (hand bones; in the palm, -Z along the
// forearm, which is where a held pistol's barrel points, +Y towards the thumb), anchor_head (head
// bone, top of the head), anchor_back (chest bone, between the shoulder blades, -Z pointing out
// of the back), anchor_hip_r (hips bone, the holster on the right hip, -Z pointing down).
//
// Material roles (each paint role is baked neutral and carries its default colour; setPaint
// recolours it, so one file makes many people):
//   paint_skin    head, neck and hands; lips, brows, beard and the scalp at the hairline are
//                 darker shades inside it and follow the tint
//   paint_hair    the hair shell
//   paint_jacket  a jacket's shell (an outfit with a jacket)
//   paint_top     the shirt, or a jacket's rib knit collar, cuffs and waistband
//   paint_bottom  trousers
//   paint_shoes   shoes or boots (the sole is a darker shade inside it)
//   atlas         the eyes; on the police also the duty belt, holster, pouches, badge, name bar
//                 and shoulder patches (not recoloured)
//
// Ids are the catalog's character ids (game/src/catalog/storyCharacters.js). The starting lead is
// dez_tolliver: load the player by that id. (The earlier placeholder lead_a, a bare body, is
// gone: the registry ties a file's name to its id, so it could not stay as an alias.)
//
// Crowd bases (pedestrian_*) and the police are baked lean: a 1024 base colour, a 512 normal map,
// a 256 packed map and no tangents (three.js derives them per pixel). Recolour paint_skin,
// paint_hair, paint_top, paint_bottom and paint_shoes per spawned person to make a crowd; the
// defaults below are only a starting palette. Every person shares the skeleton and anchors.

const SKELETON = [
  'root', 'hips', 'spine', 'chest', 'neck', 'head',
  'shoulder_l', 'upper_arm_l', 'forearm_l', 'hand_l',
  'shoulder_r', 'upper_arm_r', 'forearm_r', 'hand_r',
  'thigh_l', 'shin_l', 'foot_l', 'toe_l',
  'thigh_r', 'shin_r', 'foot_r', 'toe_r',
];

const PERSON_ANCHORS = ['anchor_hand_r', 'anchor_hand_l', 'anchor_head', 'anchor_back', 'anchor_hip_r'];

/** @type {Record<string, import('./index.js').AssetEntry>} */
export const CHARACTER_ASSETS = {
  // Dez Tolliver, the starting lead: 1.86 m, athletic, 28. Mustard bomber jacket over a dark rib
  // knit collar, cuffs and waistband, grey cargo trousers, brown ankle boots, short afro (a fade)
  // and a short beard. Default colours (sRGB): paint_skin #6B4129, paint_hair #16120F,
  // paint_jacket #E0A526, paint_top #2B2B2E, paint_bottom #3A3D40, paint_shoes #4A3424.
  // lod0 about 8,400 triangles, lod1 2,500, lod2 740. Seven draw calls (the character default is
  // five): six paint roles and the atlas, because the bomber needs both paint_jacket and paint_top.
  dez_tolliver: {
    file: 'characters/dez_tolliver.glb',
    kind: 'character',
    lods: 3,
    nodes: ['lod0', 'lod1', 'lod2', ...SKELETON],
    anchors: PERSON_ANCHORS,
    materials: ['paint_skin', 'paint_hair', 'paint_jacket', 'paint_top', 'paint_bottom', 'paint_shoes', 'atlas'],
    maxDraws: 7,
  },

  // Sol Arrieta, the second playable lead: 1.68 m, athletic, 31. A coral shirt worn open with its
  // sleeves rolled below the elbow (paint_jacket) over a fitted off-white tee tucked in (paint_top),
  // dark blue jeans (paint_bottom), off-white sneakers (paint_shoes), dark brown hair in a high
  // ponytail (paint_hair). In the atlas: a brown belt, a holster low on the right hip (anchor_hip_r),
  // a steel watch on the left wrist, the eyes. Default colours (sRGB): paint_skin #C68B63,
  // paint_hair #2E2019, paint_jacket #E07A5F, paint_top #F2EDE4, paint_bottom #2F4A6B,
  // paint_shoes #EDEAE2. lod0 about 8,100 triangles, lod1 2,400, lod2 710. Seven draw calls (as
  // Dez: the open shirt over the tee needs both paint_jacket and paint_top). About 620 kB: a lead's
  // full-size bake (1024 normal map).
  sol_arrieta: {
    file: 'characters/sol_arrieta.glb',
    kind: 'character',
    lods: 3,
    nodes: ['lod0', 'lod1', 'lod2', ...SKELETON],
    anchors: PERSON_ANCHORS,
    materials: ['paint_skin', 'paint_hair', 'paint_jacket', 'paint_top', 'paint_bottom', 'paint_shoes', 'atlas'],
    maxDraws: 7,
    maxBytes: 640000,
  },

  // Police officer (man), the force's patrol officer (gangsAndFactions.js patrol_officer): 1.80 m,
  // average build. Light blue short-sleeved shirt with collar, tucked in; gold badge (left chest),
  // gold name bar (right), blue shoulder patches with a gold mark; navy trousers; black boots;
  // black duty belt with the holster on the right hip (anchor_hip_r) and two pouches; short hair,
  // no cap (put one on anchor_head). Defaults: paint_skin #8D5A3B, paint_hair #1A1614,
  // paint_top #8FB8D8, paint_bottom #1B2A41, paint_shoes #1A1A1C. Six draw calls (default five).
  // About 440 kB (the kit's parts add vertices); the pedestrians are about 340-350 kB.
  police_officer_m: {
    file: 'characters/police_officer_m.glb',
    kind: 'character',
    lods: 3,
    nodes: ['lod0', 'lod1', 'lod2', ...SKELETON],
    anchors: PERSON_ANCHORS,
    materials: ['paint_skin', 'paint_hair', 'paint_top', 'paint_bottom', 'paint_shoes', 'atlas'],
    maxDraws: 6,
  },

  // Police officer (woman): 1.70 m, athletic, hair in a bun; the same uniform and kit as
  // police_officer_m. Defaults: paint_skin #C69A7A, paint_hair #3A2A20, paint_top #8FB8D8,
  // paint_bottom #1B2A41, paint_shoes #1A1A1C. Six draw calls.
  police_officer_f: {
    file: 'characters/police_officer_f.glb',
    kind: 'character',
    lods: 3,
    nodes: ['lod0', 'lod1', 'lod2', ...SKELETON],
    anchors: PERSON_ANCHORS,
    materials: ['paint_skin', 'paint_hair', 'paint_top', 'paint_bottom', 'paint_shoes', 'atlas'],
    maxDraws: 6,
  },

  // SWAT officer, the force's tactical officer (gangsAndFactions.js tactical_officer): 1.84 m,
  // athletic, buzz cut. Near-black plate carrier with shoulder straps and three magazine pouches
  // (paint_jacket) over a navy long-sleeved shirt (paint_top); navy cargo trousers with thigh
  // pockets (paint_bottom); black boots (paint_shoes). In the atlas: a ballistic helmet and knee
  // pads (#26262B), black gloves, the eyes. No hair shell (the scalp is shaded as a buzz cut).
  // Defaults: paint_skin #8D5A3B, paint_jacket #26262B, paint_top #1B2A41, paint_bottom #1B2A41,
  // paint_shoes #1A1A1C. lod0 about 6,250 triangles. Six draw calls; about 420 kB.
  swat_officer: {
    file: 'characters/swat_officer.glb',
    kind: 'character',
    lods: 3,
    nodes: ['lod0', 'lod1', 'lod2', ...SKELETON],
    anchors: PERSON_ANCHORS,
    materials: ['paint_skin', 'paint_jacket', 'paint_top', 'paint_bottom', 'paint_shoes', 'atlas'],
    maxDraws: 6,
    maxBytes: 480000,
  },

  // Paramedic, Marazul Fire Rescue (gangsAndFactions.js paramedic): a woman of 1.66 m, average
  // build, ponytail. Off-white crew polo with a turned collar, tucked in (paint_top); navy cargo
  // trousers (paint_bottom); black boots (paint_shoes). In the atlas: a black belt, red crew patches
  // on the left chest and both sleeves, light blue nitrile gloves, the eyes. Defaults: paint_skin
  // #B07A55, paint_hair #3A2A20, paint_top #F2F0E8, paint_bottom #1B2A41, paint_shoes #1A1A1C.
  // lod0 about 6,100 triangles. Six draw calls; about 415 kB.
  paramedic: {
    file: 'characters/paramedic.glb',
    kind: 'character',
    lods: 3,
    nodes: ['lod0', 'lod1', 'lod2', ...SKELETON],
    anchors: PERSON_ANCHORS,
    materials: ['paint_skin', 'paint_hair', 'paint_top', 'paint_bottom', 'paint_shoes', 'atlas'],
    maxDraws: 6,
    maxBytes: 440000,
  },

  // Pedestrian base, man at the beach: 1.76 m, heavy, fifties. Unbuttoned short-sleeved shirt over
  // a bare chest (paint_top), knee-length shorts (paint_bottom), sneakers (paint_shoes), short
  // greying hair. Defaults: paint_skin #C08A68, paint_hair #6E655C, paint_top #4F9A94,
  // paint_bottom #4C627A, paint_shoes #E2DED4. Six draw calls.
  pedestrian_beach_m: {
    file: 'characters/pedestrian_beach_m.glb',
    kind: 'character',
    lods: 3,
    nodes: ['lod0', 'lod1', 'lod2', ...SKELETON],
    anchors: PERSON_ANCHORS,
    materials: ['paint_skin', 'paint_hair', 'paint_top', 'paint_bottom', 'paint_shoes', 'atlas'],
    maxDraws: 6,
  },

  // Pedestrian base, woman in office clothes: 1.68 m, slim, about thirty. Short-sleeved blouse
  // with a collar (paint_top) over a straight knee-length skirt (paint_bottom), flats
  // (paint_shoes), hair in a bun. Defaults: paint_skin #A8754F, paint_hair #2A1D16,
  // paint_top #E6DFD2, paint_bottom #2E3440, paint_shoes #2A2222. Six draw calls.
  pedestrian_office_f: {
    file: 'characters/pedestrian_office_f.glb',
    kind: 'character',
    lods: 3,
    nodes: ['lod0', 'lod1', 'lod2', ...SKELETON],
    anchors: PERSON_ANCHORS,
    materials: ['paint_skin', 'paint_hair', 'paint_top', 'paint_bottom', 'paint_shoes', 'atlas'],
    maxDraws: 6,
  },

  // Pedestrian base, young man in casual clothes: 1.83 m, slim, early twenties. Crew-neck tee
  // (paint_top) over straight jeans (paint_bottom), sneakers (paint_shoes), short hair.
  // Defaults: paint_skin #7A4E33, paint_hair #121010, paint_top #B04A3A, paint_bottom #3D5170,
  // paint_shoes #DCDAD2. Six draw calls.
  pedestrian_casual_m: {
    file: 'characters/pedestrian_casual_m.glb',
    kind: 'character',
    lods: 3,
    nodes: ['lod0', 'lod1', 'lod2', ...SKELETON],
    anchors: PERSON_ANCHORS,
    materials: ['paint_skin', 'paint_hair', 'paint_top', 'paint_bottom', 'paint_shoes', 'atlas'],
    maxDraws: 6,
  },

  // Pedestrian base, older woman in a dress: 1.60 m, average build, sixties. Short-sleeved dress
  // with a round neck and a skirt below the knee, all paint_top (no paint_bottom); low shoes
  // (paint_shoes); grey bob. Defaults: paint_skin #D2A486, paint_hair #A8A49C, paint_top #6B7FA8,
  // paint_shoes #5A4636. Five draw calls.
  pedestrian_older_f: {
    file: 'characters/pedestrian_older_f.glb',
    kind: 'character',
    lods: 3,
    nodes: ['lod0', 'lod1', 'lod2', ...SKELETON],
    anchors: PERSON_ANCHORS,
    materials: ['paint_skin', 'paint_hair', 'paint_top', 'paint_shoes', 'atlas'],
  },
};

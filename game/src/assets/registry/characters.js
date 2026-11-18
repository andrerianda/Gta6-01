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
//   atlas         the eyes
//
// Ids are the catalog's character ids (game/src/catalog/storyCharacters.js). The starting lead is
// dez_tolliver: load the player by that id. (The earlier placeholder lead_a, a bare body, is
// gone: the registry ties a file's name to its id, so it could not stay as an alias.)

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
};

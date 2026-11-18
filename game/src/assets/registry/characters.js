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
// Material roles: paint_skin is baked neutral and carries the default complexion as its colour
// (setPaint recolours it; lips, brows and beard shadow are darker shades inside it and follow
// the tint); atlas holds the eyes. Clothes, shoes and hair will add paint_top, paint_bottom,
// paint_shoes, paint_hair and paint_jacket.

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
  // Lead A: a man of about thirty, 1.82 m, athletic. WORK IN PROGRESS: this first build is the
  // rigged body alone (head, hands, feet), without clothes, shoes or hair, so that the animation
  // code has a real body on the final skeleton. Default paint_skin colour: linear (0.36, 0.21, 0.14).
  lead_a: {
    file: 'characters/lead_a.glb',
    kind: 'character',
    lods: 3,
    nodes: ['lod0', 'lod1', 'lod2', ...SKELETON],
    anchors: PERSON_ANCHORS,
    materials: ['paint_skin', 'atlas'],
  },
};

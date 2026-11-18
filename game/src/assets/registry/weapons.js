// Weapons: the hand weapons of weaponCatalog.js. Written by hand (see index.js).
//
// SETS: ONE FILE, SEVERAL WEAPONS
// Weapons ship as sets (set_<theme>): one .glb, one atlas. They follow the set naming of the
// prop sets (see the header of props.js) with the weapon contract on top:
//
//   <weapon>                      an empty at the point where the hand closes on the grip: the
//                                 node to clone and hang on the hand (anchor_hand_r). A clone
//                                 moved to the origin has its barrel along -Z (game), up +Y,
//                                 right +X. Its userData has catalog_id, hold, length (metres),
//                                 lods, lod_distances.
//   <weapon>_lod0, <weapon>_lod1  the weapon's levels of detail (show one at a time)
//   <weapon>_magazine             the magazine, shown at every level (a revolver's cylinder);
//                                 its origin is the magazine's top centre (the cylinder: its axis)
//   anchor_muzzle__<weapon>       the barrel's end, pointing out of the barrel (-Z in the game)
//   anchor_eject__<weapon>        the ejection port, pointing the way the cases fly
//   anchor_grip_off__<weapon>     where the other hand holds (long guns and fore grips)
//
// Hold: 'one_hand' (melee, thrown), 'two_hand_pistol' (handguns, the machine pistol: the off
// hand cups the gun hand, or takes anchor_grip_off when there is one), 'two_hand_long' (long
// guns: the off hand on anchor_grip_off, the stock at the shoulder).
// In the file the weapons lie in one row, lifted clear of the ground; asset.extras.objects
// repeats the table with `origin`, each weapon's place in the file in game axes.
// WEAPON_SET_OBJECTS below is the same table typed out for the combat code, keyed by the
// catalog id of weaponCatalog.js. Materials: atlas only (no laser yet).

/** @type {Record<string, import('./index.js').AssetEntry>} */
export const WEAPON_ASSETS = {
  // Handgun set: the Cordero C9 pistol, the Alcazar .44 revolver and the Cordero Avispa
  // machine pistol. Budget raised because it is three weapons in one file, each with its own
  // magazine node: 6,152 triangles and 6 draw calls with all three drawn at level 0 (each
  // weapon alone is at most 2,376 and 2).
  set_handguns: {
    file: 'weapons/set_handguns.glb',
    kind: 'prop',
    lods: 2,
    maxTriangles: 7000,
    maxDraws: 8,
    maxBytes: 420000,
    nodes: [
      'pistol', 'pistol_lod0', 'pistol_lod1', 'pistol_magazine',
      'heavy_revolver', 'heavy_revolver_lod0', 'heavy_revolver_lod1', 'heavy_revolver_magazine',
      'smg', 'smg_lod0', 'smg_lod1', 'smg_magazine',
    ],
    anchors: [
      'anchor_muzzle__pistol', 'anchor_eject__pistol',
      'anchor_muzzle__heavy_revolver', 'anchor_eject__heavy_revolver',
      'anchor_muzzle__smg', 'anchor_eject__smg', 'anchor_grip_off__smg',
    ],
    materials: ['atlas'],
  },
};

/**
 * Per weapon (keyed by its weaponCatalog.js id): which set holds it and the names to use.
 * length is the weapon's length in metres along its barrel; anchors maps a role to the node
 * name (gripOff only where there is one).
 */
export const WEAPON_SET_OBJECTS = Object.freeze({
  pistol: {
    asset: 'set_handguns', node: 'pistol', lods: ['pistol_lod0', 'pistol_lod1'],
    magazine: 'pistol_magazine', length: 0.189, hold: 'two_hand_pistol',
    anchors: { muzzle: 'anchor_muzzle__pistol', eject: 'anchor_eject__pistol' },
  },
  heavy_revolver: {
    asset: 'set_handguns', node: 'heavy_revolver', lods: ['heavy_revolver_lod0', 'heavy_revolver_lod1'],
    magazine: 'heavy_revolver_magazine', length: 0.288, hold: 'two_hand_pistol',
    anchors: { muzzle: 'anchor_muzzle__heavy_revolver', eject: 'anchor_eject__heavy_revolver' },
  },
  smg: {
    asset: 'set_handguns', node: 'smg', lods: ['smg_lod0', 'smg_lod1'],
    magazine: 'smg_magazine', length: 0.295, hold: 'two_hand_pistol',
    anchors: { muzzle: 'anchor_muzzle__smg', eject: 'anchor_eject__smg', gripOff: 'anchor_grip_off__smg' },
  },
});

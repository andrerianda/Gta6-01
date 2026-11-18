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
//   <weapon>_magazine             the magazine, shown at every level; its origin is the
//                                 magazine's top centre. The revolver's is its cylinder (origin
//                                 on the cylinder's axis), the launcher's the loaded rocket
//                                 (origin at the rocket's base, on the tube's axis).
//   <weapon>_pump                 the shotgun's fore-end (no magazine node: a tube magazine);
//                                 slide it about 0.07 m towards +Z (game) and back to cycle
//   anchor_muzzle__<weapon>       the barrel's end, pointing out of the barrel (-Z in the game)
//   anchor_eject__<weapon>        the ejection port, pointing the way the cases fly
//   anchor_grip_off__<weapon>     where the other hand closes (long guns, fore grips, the bat)
//   anchor_tip__<weapon>          a melee weapon's striking end
//   anchor_exhaust__rocket_launcher  the launcher's rear, pointing back: the back-blast
//
// Hold: 'one_hand' (tire iron), 'two_hand_pistol' (handguns and the machine pistol: the off
// hand cups the gun hand, or takes anchor_grip_off when there is one), 'two_hand_long' (long
// guns and the bat: the off hand on anchor_grip_off, the stock at the shoulder).
// In the files the weapons lie in one row, lifted clear of the ground; asset.extras.objects
// repeats the table with `origin`, each weapon's place in the file in game axes.
// WEAPON_SET_OBJECTS below is the same table typed out for the combat code, keyed by the
// catalog id of weaponCatalog.js. Materials: atlas only (no laser yet). Not modelled yet:
// grenade, fire_bottle (fists need no model).

/** @type {Record<string, import('./index.js').AssetEntry>} */
export const WEAPON_ASSETS = {
  // Handgun set: the Cordero C9 pistol, the Alcazar .44 revolver and the Cordero Avispa
  // machine pistol. Budget raised because it is three weapons in one file, each with its own
  // magazine node: 6,736 triangles and 6 draw calls with all three drawn at level 0 (each
  // weapon alone is at most 2,508 and 2) and 413,620 bytes, mostly geometry at two levels;
  // room is left for the thrown weapons.
  set_handguns: {
    file: 'weapons/set_handguns.glb',
    kind: 'prop',
    lods: 2,
    maxTriangles: 8500,
    maxDraws: 12,
    maxBytes: 520000,
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
  // Long-gun set: the Ballesta 12 shotgun, the CR-7 Tormenta rifle, the Halcon LR-70 sniper
  // rifle, the RL-4 Pelicano launcher, the Fundidores Slugger bat and the tire iron. Budget
  // raised because it is six weapons in one file, four with a moving node: 10,396 triangles
  // and 10 draw calls with all six drawn at level 0 (each weapon alone is at most 2,572 and 2)
  // and 524,268 bytes, mostly geometry at two levels.
  set_long_guns: {
    file: 'weapons/set_long_guns.glb',
    kind: 'prop',
    lods: 2,
    maxTriangles: 12000,
    maxDraws: 12,
    maxBytes: 620000,
    nodes: [
      'pump_shotgun', 'pump_shotgun_lod0', 'pump_shotgun_lod1', 'pump_shotgun_pump',
      'assault_rifle', 'assault_rifle_lod0', 'assault_rifle_lod1', 'assault_rifle_magazine',
      'sniper_rifle', 'sniper_rifle_lod0', 'sniper_rifle_lod1', 'sniper_rifle_magazine',
      'rocket_launcher', 'rocket_launcher_lod0', 'rocket_launcher_lod1', 'rocket_launcher_magazine',
      'baseball_bat', 'baseball_bat_lod0', 'baseball_bat_lod1',
      'tire_iron', 'tire_iron_lod0', 'tire_iron_lod1',
    ],
    anchors: [
      'anchor_muzzle__pump_shotgun', 'anchor_eject__pump_shotgun', 'anchor_grip_off__pump_shotgun',
      'anchor_muzzle__assault_rifle', 'anchor_eject__assault_rifle', 'anchor_grip_off__assault_rifle',
      'anchor_muzzle__sniper_rifle', 'anchor_eject__sniper_rifle', 'anchor_grip_off__sniper_rifle',
      'anchor_muzzle__rocket_launcher', 'anchor_exhaust__rocket_launcher', 'anchor_grip_off__rocket_launcher',
      'anchor_tip__baseball_bat', 'anchor_grip_off__baseball_bat',
      'anchor_tip__tire_iron',
    ],
    materials: ['atlas'],
  },
};

/**
 * Per weapon (keyed by its weaponCatalog.js id): which set holds it and the names to use.
 * length is the weapon's length in metres along its barrel; magazine (or pump) is the moving
 * node or null; anchors maps a role to the node name (only the roles the weapon has).
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
    magazine: 'smg_magazine', length: 0.296, hold: 'two_hand_pistol',
    anchors: { muzzle: 'anchor_muzzle__smg', eject: 'anchor_eject__smg', gripOff: 'anchor_grip_off__smg' },
  },
  pump_shotgun: {
    asset: 'set_long_guns', node: 'pump_shotgun', lods: ['pump_shotgun_lod0', 'pump_shotgun_lod1'],
    magazine: null, pump: 'pump_shotgun_pump', length: 1.057, hold: 'two_hand_long',
    anchors: { muzzle: 'anchor_muzzle__pump_shotgun', eject: 'anchor_eject__pump_shotgun', gripOff: 'anchor_grip_off__pump_shotgun' },
  },
  assault_rifle: {
    asset: 'set_long_guns', node: 'assault_rifle', lods: ['assault_rifle_lod0', 'assault_rifle_lod1'],
    magazine: 'assault_rifle_magazine', length: 0.875, hold: 'two_hand_long',
    anchors: { muzzle: 'anchor_muzzle__assault_rifle', eject: 'anchor_eject__assault_rifle', gripOff: 'anchor_grip_off__assault_rifle' },
  },
  sniper_rifle: {
    asset: 'set_long_guns', node: 'sniper_rifle', lods: ['sniper_rifle_lod0', 'sniper_rifle_lod1'],
    magazine: 'sniper_rifle_magazine', length: 1.187, hold: 'two_hand_long',
    anchors: { muzzle: 'anchor_muzzle__sniper_rifle', eject: 'anchor_eject__sniper_rifle', gripOff: 'anchor_grip_off__sniper_rifle' },
  },
  rocket_launcher: {
    asset: 'set_long_guns', node: 'rocket_launcher', lods: ['rocket_launcher_lod0', 'rocket_launcher_lod1'],
    magazine: 'rocket_launcher_magazine', length: 1.198, hold: 'two_hand_long',
    anchors: { muzzle: 'anchor_muzzle__rocket_launcher', exhaust: 'anchor_exhaust__rocket_launcher', gripOff: 'anchor_grip_off__rocket_launcher' },
  },
  baseball_bat: {
    asset: 'set_long_guns', node: 'baseball_bat', lods: ['baseball_bat_lod0', 'baseball_bat_lod1'],
    magazine: null, length: 0.864, hold: 'two_hand_long',
    anchors: { tip: 'anchor_tip__baseball_bat', gripOff: 'anchor_grip_off__baseball_bat' },
  },
  tire_iron: {
    asset: 'set_long_guns', node: 'tire_iron', lods: ['tire_iron_lod0', 'tire_iron_lod1'],
    magazine: null, length: 0.494, hold: 'one_hand',
    anchors: { tip: 'anchor_tip__tire_iron' },
  },
});

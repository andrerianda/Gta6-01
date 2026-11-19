// The arsenal of MARAZUL: fists, two melee weapons, six firearms, two thrown weapons and a rocket
// launcher, all with invented makers and names, balanced against 100-point pedestrians,
// 120-to-170-point faction members and vehicle durability of about 850 for a family sedan.
// Plain frozen data, no imports.
//
// damage: hit points per hit (per pellet for the shotgun); fireRate: shots per second;
// range: metres of full damage, falling linearly to rangeFalloffTo at maxRange; spread and
// recoil in radians (spread is the cone half-angle standing still and aimed; moving and
// unaimed multiply it); reloadSeconds per magazine; price and ammoPrice (one magazine or one
// thrown item) in whole dollars; unlockRank is a rank number from progressionRanks.js and
// unlockedBy a mission id from storyMissions.js (null: from the start). `crime` is the crime
// id that using the weapon in public adds. Sound parameters steer the WebAudio synthesiser.
//
// stance (combat owns these fields; the character run-time builds the poses from them; owner,
// 09:15: every weapon its own trained stance on the full-body shooter's stance):
//   hold      the run-time's hold to build for it (a WEAPON_HOLDS key of characters/motion/
//             aimPose.js): 'guard', 'one_hand_club', 'two_hand_bat', 'pistol_two_hand',
//             'revolver_two_hand', 'smg_compact', 'shotgun_pump', 'rifle', 'sniper',
//             'launcher_shoulder', 'throw'
//   baseHold  the existing hold used until `hold` exists (null: none, the arms swing free)
//   offHand   where the support hand goes: 'wrap' (round the shooting hand and grip),
//             'anchor_grip_off' (the model's anchor_grip_off__<id>), 'pump' (rides the shotgun's
//             <id>_pump node), 'guard' (fist at the chin), 'balance' (forward, open), 'point'
//             (pointing at the target: throws)
//   lowReady  the carry when not aiming: 'front45' (two hands, muzzle 45 degrees down in front),
//             'across' (across the body, muzzle down), 'shoulder' (on the strong shoulder),
//             'hang' (hanging in the hand), 'side', 'relaxed'
//   lean      forward lean from the hips while aimed, radians (the stance's own 15-20 degrees
//             is about 0.28)
//   recoil    lift: the hands' and muzzle's kick per shot, radians; recover: seconds back on
//             target (owner ~0.15); shake: 0..1 of small random jitter (automatic fire)
//   reload    'magazine', 'cylinder', 'shells', 'rocket', or null
//   cadence   'strike', 'swing', 'single', 'auto', 'pump' and 'bolt' (a cycle of cycleSeconds
//             between shots: the pump racked or the bolt worked), 'launch', 'throw'
//   extras    scope {swayRadians, breathSeconds} (the scope view's breathing), throwLift (radians
//             the throw leaves above the aim line), backblast {length, width} (metres behind)

/**
 * The weapons keyed by id.
 * @type {Readonly<Record<string, object>>}
 */
export const WEAPON_CATALOG = freezeCatalog({
  fists: {
    id: 'fists', name: 'Fists', maker: null, class: 'unarmed', wheelSlot: 'unarmed',
    description: 'Free, legal to carry and always loaded. Three-hit combo; the third knocks down.',
    damage: 14, pellets: 1, headshotMultiplier: 1.3, fireRate: 2.2, automatic: false,
    range: 1.3, maxRange: 1.5, rangeFalloffTo: 1, spread: 0, movingSpreadMultiplier: 1, recoil: 0,
    magazine: null, reserveMax: null, reloadSeconds: 0, price: 0, ammoPrice: 0, unlockRank: 0, unlockedBy: null,
    vehicleDamageMultiplier: 0.1, driveBy: false, knockdownOnHit: 3, crime: 'assault', noiseRadius: 12,
    sound: { character: 'A dull thud and a grunt.', kind: 'thud', pitchHz: 110, decaySeconds: 0.09, noise: 0.5 },
    stance: { hold: 'guard', baseHold: null, offHand: 'guard', lowReady: 'relaxed', lean: 0.12, recoil: { lift: 0, recover: 0.2, shake: 0 }, reload: null, cadence: 'strike' },
  },
  tire_iron: {
    id: 'tire_iron', name: 'Tire Iron', maker: 'Yunque Tools', class: 'melee', wheelSlot: 'melee',
    description: 'Out of the tow truck\'s toolbox. Quick, ugly, and it opens car boots.',
    damage: 30, pellets: 1, headshotMultiplier: 1.5, fireRate: 1.7, automatic: false,
    range: 1.6, maxRange: 1.8, rangeFalloffTo: 1, spread: 0, movingSpreadMultiplier: 1, recoil: 0,
    magazine: null, reserveMax: null, reloadSeconds: 0, price: 60, ammoPrice: 0, unlockRank: 0, unlockedBy: 'm01_hook_and_chain',
    vehicleDamageMultiplier: 0.5, driveBy: false, knockdownOnHit: 2, crime: 'armed_assault', noiseRadius: 16,
    sound: { character: 'A bright metallic clank.', kind: 'clank', pitchHz: 620, decaySeconds: 0.18, noise: 0.3 },
    stance: { hold: 'one_hand_club', baseHold: null, offHand: 'balance', lowReady: 'hang', lean: 0.12, recoil: { lift: 0, recover: 0.25, shake: 0 }, reload: null, cadence: 'swing' },
  },
  baseball_bat: {
    id: 'baseball_bat', name: 'Fundidores Slugger', maker: 'La Fragua Sporting', class: 'melee', wheelSlot: 'melee',
    description: 'An ash bat in the ballclub\'s colours. Slower than the iron, longer, and it knocks down on every hit.',
    damage: 42, pellets: 1, headshotMultiplier: 1.6, fireRate: 1.2, automatic: false,
    range: 1.9, maxRange: 2.1, rangeFalloffTo: 1, spread: 0, movingSpreadMultiplier: 1, recoil: 0,
    magazine: null, reserveMax: null, reloadSeconds: 0, price: 120, ammoPrice: 0, unlockRank: 1, unlockedBy: null,
    vehicleDamageMultiplier: 0.6, driveBy: false, knockdownOnHit: 1, crime: 'armed_assault', noiseRadius: 18,
    sound: { character: 'A woody crack.', kind: 'crack', pitchHz: 340, decaySeconds: 0.12, noise: 0.45 },
    stance: { hold: 'two_hand_bat', baseHold: null, offHand: 'anchor_grip_off', lowReady: 'shoulder', lean: 0.1, recoil: { lift: 0, recover: 0.3, shake: 0 }, reload: null, cadence: 'swing' },
  },
  pistol: {
    id: 'pistol', name: 'Cordero C9', maker: 'Cordero Arms', class: 'handgun', wheelSlot: 'handgun',
    description: 'The nine-millimetre every patrol officer and half the city carries. Accurate enough, cheap to feed, usable from a car window.',
    damage: 24, pellets: 1, headshotMultiplier: 2.5, fireRate: 4.5, automatic: false,
    range: 30, maxRange: 70, rangeFalloffTo: 0.5, spread: 0.014, movingSpreadMultiplier: 1.8, recoil: 0.018,
    magazine: 14, reserveMax: 140, reloadSeconds: 1.4, price: 450, ammoPrice: 35, unlockRank: 0, unlockedBy: 'm03_stamped_and_sealed',
    vehicleDamageMultiplier: 0.6, driveBy: true, knockdownOnHit: null, crime: 'discharging_firearm', noiseRadius: 140,
    sound: { character: 'A flat, dry pop.', kind: 'gunshot', pitchHz: 420, decaySeconds: 0.14, noise: 0.85 },
    stance: { hold: 'pistol_two_hand', baseHold: 'pistol_two_hand', offHand: 'wrap', lowReady: 'front45', lean: 0.22, recoil: { lift: 0.06, recover: 0.15, shake: 0 }, reload: 'magazine', cadence: 'single' },
  },
  heavy_revolver: {
    id: 'heavy_revolver', name: 'Alcázar .44 Notario', maker: 'Alcázar & Hijos', class: 'handgun', wheelSlot: 'handgun',
    description: 'Six rounds, each with the final word. Stops a car engine in four; kicks like the paperwork that follows.',
    damage: 68, pellets: 1, headshotMultiplier: 2.5, fireRate: 1.5, automatic: false,
    range: 40, maxRange: 90, rangeFalloffTo: 0.6, spread: 0.01, movingSpreadMultiplier: 2.2, recoil: 0.07,
    magazine: 6, reserveMax: 60, reloadSeconds: 2.4, price: 2400, ammoPrice: 60, unlockRank: 3, unlockedBy: 'm08_clean_hands',
    vehicleDamageMultiplier: 1.4, driveBy: true, knockdownOnHit: 1, crime: 'discharging_firearm', noiseRadius: 180,
    sound: { character: 'A deep boom with a long tail.', kind: 'gunshot', pitchHz: 180, decaySeconds: 0.32, noise: 0.9 },
    stance: { hold: 'revolver_two_hand', baseHold: 'pistol_two_hand', offHand: 'wrap', lowReady: 'front45', lean: 0.24, recoil: { lift: 0.16, recover: 0.24, shake: 0.05 }, reload: 'cylinder', cadence: 'single' },
  },
  smg: {
    id: 'smg', name: 'Cordero Avispa', maker: 'Cordero Arms', class: 'smg', wheelSlot: 'smg',
    description: 'The Wasp: a compact machine pistol that empties itself in two seconds. The drive-by weapon of the port crews.',
    damage: 17, pellets: 1, headshotMultiplier: 2, fireRate: 13, automatic: true,
    range: 22, maxRange: 60, rangeFalloffTo: 0.45, spread: 0.03, movingSpreadMultiplier: 1.5, recoil: 0.012,
    magazine: 30, reserveMax: 300, reloadSeconds: 1.8, price: 1800, ammoPrice: 70, unlockRank: 2, unlockedBy: 'm05_night_shift',
    vehicleDamageMultiplier: 0.5, driveBy: true, knockdownOnHit: null, crime: 'discharging_firearm', noiseRadius: 150,
    sound: { character: 'A fast, angry buzz.', kind: 'gunshot', pitchHz: 520, decaySeconds: 0.07, noise: 0.8 },
    stance: { hold: 'smg_compact', baseHold: 'smg', offHand: 'anchor_grip_off', lowReady: 'across', lean: 0.3, recoil: { lift: 0.025, recover: 0.08, shake: 0.6 }, reload: 'magazine', cadence: 'auto' },
  },
  pump_shotgun: {
    id: 'pump_shotgun', name: 'Ballesta 12', maker: 'Alcázar & Hijos', class: 'shotgun', wheelSlot: 'shotgun',
    description: 'Eight pellets and a pump you can hear through a wall. Clears a doorway, a windscreen or an argument.',
    damage: 16, pellets: 8, headshotMultiplier: 1.5, fireRate: 1.1, automatic: false,
    range: 9, maxRange: 28, rangeFalloffTo: 0.15, spread: 0.075, movingSpreadMultiplier: 1.2, recoil: 0.09,
    magazine: 6, reserveMax: 60, reloadSeconds: 3, price: 2200, ammoPrice: 55, unlockRank: 2, unlockedBy: 'm07_two_beer_problem',
    vehicleDamageMultiplier: 1, driveBy: false, knockdownOnHit: 1, crime: 'discharging_firearm', noiseRadius: 190,
    sound: { character: 'A wide blast, then the clack of the pump.', kind: 'gunshot', pitchHz: 150, decaySeconds: 0.28, noise: 1, followUp: 'pump_clack' },
    stance: { hold: 'shotgun_pump', baseHold: 'shotgun', offHand: 'pump', lowReady: 'across', lean: 0.32, recoil: { lift: 0.14, recover: 0.22, shake: 0.15 }, reload: 'shells', cadence: 'pump', cycleSeconds: 0.42 },
  },
  assault_rifle: {
    id: 'assault_rifle', name: 'Cordero CR-7 Tormenta', maker: 'Cordero Arms', class: 'rifle', wheelSlot: 'rifle',
    description: 'The Storm: the tactical team\'s rifle and the Circle enforcers\' favourite. Controlled bursts are rewarded; holding the trigger is not.',
    damage: 30, pellets: 1, headshotMultiplier: 2.2, fireRate: 9, automatic: true,
    range: 60, maxRange: 140, rangeFalloffTo: 0.6, spread: 0.011, movingSpreadMultiplier: 2.4, recoil: 0.02,
    magazine: 30, reserveMax: 270, reloadSeconds: 2.2, price: 6500, ammoPrice: 120, unlockRank: 4, unlockedBy: 'm09_weigh_her_again',
    vehicleDamageMultiplier: 1, driveBy: false, knockdownOnHit: null, crime: 'discharging_firearm', noiseRadius: 220,
    sound: { character: 'A hard, even hammering.', kind: 'gunshot', pitchHz: 300, decaySeconds: 0.12, noise: 0.9 },
    stance: { hold: 'rifle', baseHold: 'rifle', offHand: 'anchor_grip_off', lowReady: 'across', lean: 0.28, recoil: { lift: 0.035, recover: 0.1, shake: 0.3 }, reload: 'magazine', cadence: 'auto' },
  },
  sniper_rifle: {
    id: 'sniper_rifle', name: 'Halcón LR-70', maker: 'Alcázar & Hijos', class: 'sniper', wheelSlot: 'sniper',
    description: 'A bolt-action with a scope (right mouse zooms 6x). One round, one decision, and a report the whole hillside hears.',
    damage: 160, pellets: 1, headshotMultiplier: 3, fireRate: 0.7, automatic: false,
    range: 220, maxRange: 400, rangeFalloffTo: 0.8, spread: 0.0015, movingSpreadMultiplier: 12, recoil: 0.11,
    magazine: 5, reserveMax: 40, reloadSeconds: 3.2, price: 12000, ammoPrice: 150, unlockRank: 5, unlockedBy: 'm10_dead_air',
    vehicleDamageMultiplier: 2, driveBy: false, knockdownOnHit: 1, scopeZoom: 6, crime: 'discharging_firearm', noiseRadius: 300,
    sound: { character: 'A sharp crack and a rolling echo.', kind: 'gunshot', pitchHz: 240, decaySeconds: 0.6, noise: 0.9, echo: true },
    stance: { hold: 'sniper', baseHold: 'rifle', offHand: 'anchor_grip_off', lowReady: 'across', lean: 0.14, recoil: { lift: 0.12, recover: 0.35, shake: 0.05 }, reload: 'magazine', cadence: 'bolt', cycleSeconds: 0.9, scope: { swayRadians: 0.0035, breathSeconds: 4.2 } },
  },
  grenade: {
    id: 'grenade', name: 'Coco Frag', maker: 'surplus, no questions', class: 'thrown', wheelSlot: 'thrown',
    description: 'A round fragmentation grenade the port crews call a coconut. Hold to cook, release to throw; it bounces.',
    damage: 0, pellets: 1, headshotMultiplier: 1, fireRate: 0.8, automatic: false,
    range: 28, maxRange: 34, rangeFalloffTo: 1, spread: 0.02, movingSpreadMultiplier: 1.5, recoil: 0,
    magazine: 1, reserveMax: 10, reloadSeconds: 0.9, price: 600, ammoPrice: 600, unlockRank: 5, unlockedBy: 'm11_house_edge',
    projectile: { kind: 'lobbed', speed: 17, gravity: 9.8, fuseSeconds: 3.5, bounces: true, blastRadius: 7, blastDamage: 240, vehicleBlastDamage: 700, fireSeconds: 0 },
    vehicleDamageMultiplier: 1, driveBy: true, knockdownOnHit: 1, crime: 'explosion', noiseRadius: 280,
    sound: { character: 'A pin, a clink, a silence, then the street lifting.', kind: 'explosion', pitchHz: 60, decaySeconds: 1.1, noise: 1 },
    stance: { hold: 'throw', baseHold: null, offHand: 'point', lowReady: 'side', lean: 0.08, recoil: { lift: 0, recover: 0.3, shake: 0 }, reload: null, cadence: 'throw', throwLift: 0.3 },
  },
  fire_bottle: {
    id: 'fire_bottle', name: 'Botella Brava', maker: 'home-made', class: 'thrown', wheelSlot: 'thrown',
    description: 'A soda bottle of petrol with a rag in the neck. Breaks where it lands and burns for eight seconds; enemies leave cover.',
    damage: 0, pellets: 1, headshotMultiplier: 1, fireRate: 0.9, automatic: false,
    range: 22, maxRange: 26, rangeFalloffTo: 1, spread: 0.03, movingSpreadMultiplier: 1.5, recoil: 0,
    magazine: 1, reserveMax: 8, reloadSeconds: 1.1, price: 250, ammoPrice: 250, unlockRank: 3, unlockedBy: 'm12_past_due',
    projectile: { kind: 'lobbed', speed: 14, gravity: 9.8, fuseSeconds: 0, bounces: false, blastRadius: 4, blastDamage: 30, vehicleBlastDamage: 120, fireSeconds: 8, burnDamagePerSecond: 22, vehicleBurnDamagePerSecond: 60 },
    vehicleDamageMultiplier: 1, driveBy: true, knockdownOnHit: null, crime: 'arson', noiseRadius: 60,
    sound: { character: 'Breaking glass and a soft whoomp.', kind: 'whoosh', pitchHz: 90, decaySeconds: 0.9, noise: 0.7 },
    stance: { hold: 'throw', baseHold: null, offHand: 'point', lowReady: 'side', lean: 0.08, recoil: { lift: 0, recover: 0.3, shake: 0 }, reload: null, cadence: 'throw', throwLift: 0.26 },
  },
  rocket_launcher: {
    id: 'rocket_launcher', name: 'Trabuco RL-4 Pelícano', maker: 'Cordero Arms', class: 'heavy', wheelSlot: 'thrown',
    description: 'The Pelican: a shoulder launcher that ends car chases, roadblocks and helicopters, and starts a five-star afternoon.',
    damage: 0, pellets: 1, headshotMultiplier: 1, fireRate: 0.4, automatic: false,
    range: 120, maxRange: 300, rangeFalloffTo: 1, spread: 0.004, movingSpreadMultiplier: 4, recoil: 0.14,
    magazine: 1, reserveMax: 8, reloadSeconds: 3.4, price: 45000, ammoPrice: 2500, unlockRank: 7, unlockedBy: 'm14_heavier_than_it_looks',
    projectile: { kind: 'rocket', speed: 55, gravity: 0, fuseSeconds: 6, bounces: false, blastRadius: 9, blastDamage: 500, vehicleBlastDamage: 2400, fireSeconds: 3, burnDamagePerSecond: 15, vehicleBurnDamagePerSecond: 40 },
    vehicleDamageMultiplier: 1, driveBy: false, knockdownOnHit: 1, crime: 'explosion', noiseRadius: 320,
    sound: { character: 'A hollow thump, a tearing hiss, and a blast you feel in the HUD.', kind: 'explosion', pitchHz: 50, decaySeconds: 1.4, noise: 1, launch: 'hiss' },
    stance: { hold: 'launcher_shoulder', baseHold: 'rifle', offHand: 'anchor_grip_off', lowReady: 'shoulder', lean: 0.18, recoil: { lift: 0.2, recover: 0.4, shake: 0.2 }, reload: 'rocket', cadence: 'launch', backblast: { length: 5, width: 1.6 } },
  },
});

/** Weapon ids in the order shops and the statistics screen list them. */
export const WEAPON_ORDER = Object.freeze([
  'fists', 'tire_iron', 'baseball_bat', 'pistol', 'heavy_revolver', 'smg', 'pump_shotgun', 'assault_rifle', 'sniper_rifle', 'grenade', 'fire_bottle', 'rocket_launcher',
]);

/**
 * The weapon wheel (hold Tab): eight slots clockwise from the top. A slot holds every weapon of
 * its kind the lead owns; the mouse wheel cycles inside the highlighted slot.
 */
export const WEAPON_WHEEL_SLOTS = freezeCatalog({
  unarmed: { id: 'unarmed', index: 0, label: 'Unarmed', angleDegrees: 0, weapons: ['fists'] },
  melee: { id: 'melee', index: 1, label: 'Melee', angleDegrees: 45, weapons: ['tire_iron', 'baseball_bat'] },
  handgun: { id: 'handgun', index: 2, label: 'Handguns', angleDegrees: 90, weapons: ['pistol', 'heavy_revolver'] },
  smg: { id: 'smg', index: 3, label: 'Submachine gun', angleDegrees: 135, weapons: ['smg'] },
  shotgun: { id: 'shotgun', index: 4, label: 'Shotgun', angleDegrees: 180, weapons: ['pump_shotgun'] },
  rifle: { id: 'rifle', index: 5, label: 'Rifle', angleDegrees: 225, weapons: ['assault_rifle'] },
  sniper: { id: 'sniper', index: 6, label: 'Marksman', angleDegrees: 270, weapons: ['sniper_rifle'] },
  thrown: { id: 'thrown', index: 7, label: 'Thrown and heavy', angleDegrees: 315, weapons: ['grenade', 'fire_bottle', 'rocket_launcher'] },
});

/** Combat rules shared by every weapon. */
export const COMBAT_RULES = freezeCatalog({
  playerHealth: 100,
  playerArmorMax: 100,
  armorAbsorbs: 0.8,
  healthRegenUpTo: 35,
  healthRegenPerSecond: 2,
  healthRegenDelaySeconds: 8,
  aimAssistDegrees: 2.5,
  aimAssistRange: 45,
  unaimedSpreadMultiplier: 2.5,
  crouchSpreadMultiplier: 0.7,
  lockOnInVehicle: true,
  driveByArcDegrees: 200,
  enemyReactionSeconds: 0.6,
  enemyDamageToPlayerMultiplier: 0.55,
  tyreHitPointsPerTyre: 40,
  vehicleCatchesFireAtDurabilityFraction: 0.12,
  vehicleExplodesAfterBurningSeconds: 6,
  vehicleExplosion: { blastRadius: 7, blastDamage: 220 },
  slowTimeWhileWheelOpen: 0.2,
  ammoPickupFractionOfMagazine: 0.5,
  bodyArmor: { price: 1500, soldAtKind: 'gun_shop', unlockRank: 2 },
});

/** Recursively freezes a plain data tree so that no system can mutate the shared catalog. */
function freezeCatalog(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) freezeCatalog(value[key]);
  }
  return value;
}

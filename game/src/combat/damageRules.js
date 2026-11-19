// How much a hit hurts and what it counts as: full damage up to a weapon's range, falling
// linearly to its rangeFalloffTo share at maxRange; headshots multiply; vehicles take the
// weapon's vehicle multiplier; armour soaks a share of what reaches a person; and every shot,
// blow and kill names the crime the wanted level hears about. Pure rules: tools/tests/combat/.

/** Where a person is hit, measured up from the feet as a share of their height. */
export const BODY_ZONES = Object.freeze({ headFrom: 0.86, legsBelow: 0.45 });

/**
 * The damage share left at a distance (1 up to range, rangeFalloffTo at maxRange, 0 beyond).
 * @param {{range: number, maxRange: number, rangeFalloffTo: number}} weapon
 * @param {number} distance Metres.
 */
export function falloffAt(weapon, distance) {
  if (distance <= weapon.range) return 1;
  if (distance > weapon.maxRange) return 0;
  const t = (distance - weapon.range) / Math.max(1e-6, weapon.maxRange - weapon.range);
  return 1 + (weapon.rangeFalloffTo - 1) * t;
}

/**
 * The hit points one pellet or blow takes.
 * @param {object} weapon A WEAPON_CATALOG entry.
 * @param {number} distance Metres from the muzzle (or the fist).
 * @param {{zone?: 'head'|'body'|'legs', vehicle?: boolean, multiplier?: number}} [hit]
 * @returns {number} Whole hit points (at least 1 for any hit in range).
 */
export function damageOf(weapon, distance, hit = {}) {
  const share = falloffAt(weapon, distance);
  if (share <= 0) return 0;
  let amount = weapon.damage * share * (hit.multiplier ?? 1);
  if (hit.vehicle) amount *= weapon.vehicleDamageMultiplier ?? 1;
  else if (hit.zone === 'head') amount *= weapon.headshotMultiplier ?? 1;
  else if (hit.zone === 'legs') amount *= 0.75;
  return Math.max(1, Math.round(amount));
}

/**
 * Splits damage between armour and health (armour takes `absorbs` of it while it lasts).
 * @param {number} amount Hit points.
 * @param {number} armour Armour points left.
 * @param {number} absorbs COMBAT_RULES.armorAbsorbs.
 * @returns {{health: number, armour: number}} What each loses.
 */
export function splitArmour(amount, armour, absorbs) {
  const toArmour = Math.min(armour, amount * absorbs);
  return { armour: toArmour, health: amount - toArmour };
}

/**
 * Which zone a hit height falls in.
 * @param {number} heightAboveFeet Metres.
 * @param {number} stature The person's height in metres.
 */
export function zoneAt(heightAboveFeet, stature) {
  const share = heightAboveFeet / stature;
  if (share >= BODY_ZONES.headFrom) return 'head';
  if (share < BODY_ZONES.legsBelow) return 'legs';
  return 'body';
}

/**
 * The crime a hit on a person is, or null for none (a gang member hurting a gang member, a hit
 * on someone already hostile to the lead is still a crime in public).
 * @param {object} weapon
 * @param {{police?: boolean, fatal?: boolean, gang?: boolean}} victim
 * @returns {string | null} A crimeCatalog id.
 */
export function crimeOfHit(weapon, victim) {
  if (victim.police) return victim.fatal ? 'officer_down' : 'assault_on_officer';
  if (victim.fatal) return victim.gang ? 'gang_violence' : 'homicide';
  if (weapon.class === 'unarmed') return 'assault';
  return 'armed_assault';
}

/**
 * The crime of pulling the trigger (heard, not yet a hit), or null for a silent blow.
 * @param {object} weapon
 */
export function crimeOfFiring(weapon) {
  if (weapon.class === 'unarmed' || weapon.class === 'melee') return null;
  return weapon.crime ?? 'discharging_firearm';
}

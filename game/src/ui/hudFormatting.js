// Text formatting for the head-up display, the minimap and the phone: money, ammunition, speed,
// timers and display names. Pure functions with no DOM, tested in Node (tools/tests/hud/).

/**
 * Formats a cash amount as dollars with thousands separators: 12450 gives "$12,450".
 * @param {number} amount Whole dollars; fractions are rounded, negatives get a leading minus.
 * @returns {string}
 */
export function formatCash(amount) {
  const rounded = Math.round(Number.isFinite(amount) ? amount : 0);
  const digits = String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${rounded < 0 ? '-' : ''}$${digits}`;
}

/**
 * Formats a change of cash with its sign: 500 gives "+$500", -75 gives "-$75".
 * @param {number} delta
 * @returns {string}
 */
export function formatCashDelta(delta) {
  const rounded = Math.round(Number.isFinite(delta) ? delta : 0);
  return `${rounded < 0 ? '-' : '+'}${formatCash(Math.abs(rounded))}`;
}

/**
 * Formats a weapon's ammunition as the magazine and the reserve. Melee weapons and fists have
 * no magazine (null) and show nothing; a weapon with no reserve shows the magazine alone.
 * @param {number|null|undefined} magazine Rounds in the weapon.
 * @param {number|null|undefined} reserve Rounds carried besides.
 * @returns {{magazine: string, reserve: string}}
 */
export function formatAmmunition(magazine, reserve) {
  if (magazine === null || magazine === undefined || !Number.isFinite(magazine)) return { magazine: '', reserve: '' };
  const count = (value) => String(Math.max(0, Math.round(value)));
  return { magazine: count(magazine), reserve: Number.isFinite(reserve) ? count(reserve) : '' };
}

/**
 * Converts a speed in metres per second for the speedometer.
 * @param {number} metresPerSecond Speed; its sign is ignored.
 * @param {'kmh'|'mph'} [unit]
 * @returns {{value: number, text: string, unit: string}}
 */
export function formatSpeed(metresPerSecond, unit = 'kmh') {
  const factor = unit === 'mph' ? 2.2369363 : 3.6;
  const value = Math.round(Math.abs(Number.isFinite(metresPerSecond) ? metresPerSecond : 0) * factor);
  return { value, text: String(value), unit: unit === 'mph' ? 'MPH' : 'KM/H' };
}

/**
 * Formats a countdown as minutes and seconds: 65 gives "1:05". Rounds up, so the timer shows
 * "0:01" until the last second has passed.
 * @param {number} seconds
 * @returns {string}
 */
export function formatTimer(seconds) {
  const whole = Math.max(0, Math.ceil(Number.isFinite(seconds) ? seconds : 0));
  const minutes = Math.floor(whole / 60);
  return `${minutes}:${String(whole % 60).padStart(2, '0')}`;
}

/**
 * Turns a catalog id into a display name when the catalog gives none: "playa_dorada" gives
 * "Playa Dorada".
 * @param {string} id
 * @returns {string}
 */
export function displayNameFromId(id) {
  return String(id ?? '').split('_').filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1)).join(' ');
}

/**
 * Eases a displayed number toward its target, as the cash counter does: exponential approach
 * that lands exactly on the target once it is within half a unit.
 * @param {number} shown The value on screen.
 * @param {number} target The real value.
 * @param {number} deltaSeconds Frame time.
 * @param {number} [halfLifeSeconds] Time to close half the gap.
 * @returns {number}
 */
export function approachCounter(shown, target, deltaSeconds, halfLifeSeconds = 0.12) {
  const gap = target - shown;
  if (Math.abs(gap) < 0.5) return target;
  const next = target - gap * Math.pow(0.5, Math.max(0, deltaSeconds) / halfLifeSeconds);
  return Math.abs(target - next) < 0.5 ? target : next;
}

/** How far from a road's edge the location card still names the street (beach, park, lot: beyond it). */
export const STREET_REACH_METRES = 25;

/**
 * The street line of the location card: the nearest road's name when the player is on it or
 * within `reachMetres` of its edge, otherwise null (off-street: the card shows the district only).
 * @param {{segment: {name?: string|null, halfWidth?: number, width?: number}, distance: number}|null} road
 *   The nearest road (openWorldCity.nearestRoad: distance from its centre line).
 * @param {number} [reachMetres]
 * @returns {string|null}
 */
export function streetLineFor(road, reachMetres = STREET_REACH_METRES) {
  if (!road || !road.segment?.name) return null;
  const halfWidth = road.segment.halfWidth ?? (road.segment.width ?? 0) / 2;
  return road.distance - halfWidth <= reachMetres ? road.segment.name : null;
}

/**
 * The district and street the location card names. On a street (see streetLineFor) the card
 * names the street's own district: the district of its centre line beside the player, which is
 * how the road plan assigns a street (segment.district). A street that runs along a district
 * boundary (Calle Iguana, Barrio Hierro, whose far pavement lies in La Marisma's region) then
 * reads the same from either pavement and the card does not flicker crossing it. Off-street the
 * district is the region's at the player's own position.
 * @param {{segment: object, distance: number, x?: number, z?: number}|null} road openWorldCity.nearestRoad.
 * @param {(x: number, z: number) => string|null} districtAt openWorldCity.districtAt.
 * @param {number} x The player's position.
 * @param {number} z
 * @param {number} [reachMetres]
 * @returns {{districtId: string|null, street: string|null}}
 */
export function placeLineFor(road, districtAt, x, z, reachMetres = STREET_REACH_METRES) {
  const street = streetLineFor(road, reachMetres);
  let districtId = null;
  if (street) {
    districtId = Number.isFinite(road.x) && Number.isFinite(road.z) ? districtAt(road.x, road.z) : null;
    districtId ??= road.segment.district ?? null;
  }
  return { districtId: districtId ?? districtAt(x, z) ?? null, street };
}

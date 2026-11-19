// How many wanted stars trespassing on the base is worth: two at once, three and four the
// longer he stays, and at once for what he does there (a drawn weapon, someone hurt, a hand on a
// parked military aircraft, a seat in one). The table and the record of one visit. Pure
// (Node-tested).

/** The star escalation table. */
export const TRESPASS_STARS = Object.freeze({
  /** The crime's id in catalog/crimeCatalog.js. */
  crimeId: 'military_trespass',
  /** Stars the moment he trespasses (the crime's minStars). */
  entered: 2,
  /** [seconds inside, stars]: staying raises the level. */
  lingering: Object.freeze([Object.freeze([20, 3]), Object.freeze([45, 4])]),
  /** Stars at once for each act. */
  weaponDrawn: 3,
  touchedAircraft: 3,
  hurtSomeone: 4,
  boardedAircraft: 4,
  /** The most this crime asks for by itself (the usual crimes take it further). */
  most: 4,
});

/**
 * A fresh record of one trespass.
 * @returns {{seconds: number, weaponDrawn: boolean, hurtSomeone: boolean, touchedAircraft: boolean, boardedAircraft: boolean}}
 */
export function createTrespassRecord() {
  return { seconds: 0, weaponDrawn: false, hurtSomeone: false, touchedAircraft: false, boardedAircraft: false };
}

/** Clears a record for the next visit. */
export function resetTrespassRecord(record) {
  record.seconds = 0;
  record.weaponDrawn = false;
  record.hurtSomeone = false;
  record.touchedAircraft = false;
  record.boardedAircraft = false;
  return record;
}

/**
 * The stars a trespass is worth now.
 * @param {ReturnType<typeof createTrespassRecord>} record
 * @param {typeof TRESPASS_STARS} [table]
 * @returns {number} 2..4
 */
export function trespassStars(record, table = TRESPASS_STARS) {
  let stars = table.entered;
  for (const [seconds, level] of table.lingering) if (record.seconds >= seconds) stars = Math.max(stars, level);
  if (record.weaponDrawn) stars = Math.max(stars, table.weaponDrawn);
  if (record.touchedAircraft) stars = Math.max(stars, table.touchedAircraft);
  if (record.hurtSomeone) stars = Math.max(stars, table.hurtSomeone);
  if (record.boardedAircraft) stars = Math.max(stars, table.boardedAircraft);
  return Math.min(table.most, stars);
}

/**
 * Whether the base is on alarm: he is inside (or still at the gate as a trespasser) and wanted.
 * @param {string} state The restricted area's state.
 * @param {number} wanted Stars.
 */
export function baseAlarmOn(state, wanted) {
  return state === 'trespassing' && wanted > 0;
}

/**
 * The heaviest suitable unit to call for a level: the air guard's own team from three stars, with
 * the police's tactical team behind it at four.
 * @param {number} stars
 * @returns {string[]} Unit kinds of police/policeUnitKinds.js, the first to send first.
 */
export function responseUnitsFor(stars) {
  if (stars >= 4) return ['air_guard_team', 'tactical_team'];
  if (stars >= 3) return ['air_guard_team'];
  return [];
}

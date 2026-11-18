// When the police arrest the lead (BUSTED_RULES in catalog/wantedLevels.js), as pure rules. At one
// or two stars an officer within arrest range holds a lead on foot slower than 1 m/s, or reaches the
// door of a car slower than 2 m/s, for holdSeconds: busted. Moving away breaks the hold. At three
// stars and above the police no longer arrest. Also the fine. No engine.

/** The lead's speed under which an arrest can be made, on foot and in a vehicle (m/s). */
export const ARREST_SPEED = Object.freeze({ onFoot: 1, inVehicle: 2 });
/** In a vehicle the officer reaches the door from a little further than on foot (metres). */
const DOOR_REACH = 1.6;

/**
 * Whether an arrest can be under way this step.
 * @param {{level: number, officerDistance: number, leadSpeed: number, inVehicle: boolean}} situation
 * @param {object} busted BUSTED_RULES.
 * @param {object} rules WANTED_RULES.
 * @returns {boolean}
 */
export function canArrest(situation, busted, rules) {
  if (situation.level < 1 || situation.level > rules.pursuit.arrestOnlyAtStarsAtMost) return false;
  const reach = busted.arrestRange + (situation.inVehicle ? DOOR_REACH : 0);
  if (situation.officerDistance > reach) return false;
  return Math.abs(situation.leadSpeed) < (situation.inVehicle ? ARREST_SPEED.inVehicle : ARREST_SPEED.onFoot);
}

/**
 * Advances the hold of an arrest.
 * @param {number} held Seconds held so far.
 * @param {number} dt
 * @param {object} situation See canArrest.
 * @param {object} busted BUSTED_RULES.
 * @param {object} rules WANTED_RULES.
 * @returns {number} The new hold; busted once it reaches busted.holdSeconds; 0 when broken.
 */
export function stepArrest(held, dt, situation, busted, rules) {
  if (!canArrest(situation, busted, rules)) return 0;
  return held + dt;
}

/**
 * The fine for an arrest.
 * @param {number} cash The lead's cash.
 * @param {object} busted BUSTED_RULES.
 * @returns {number} Whole dollars.
 */
export function arrestFine(cash, busted) {
  const fine = Math.round((cash * busted.finePercentOfCash) / 100);
  return Math.max(busted.fineMinimum, Math.min(busted.fineMaximum, fine));
}

/**
 * The point on the street in front of a station (where a released lead stands and where its cars
 * set off): the lot's entrance, or a step out of the lot along its front direction. A plan
 * landmark's frontX/frontZ are the unit DIRECTION its lot faces, never a position.
 * @param {{x: number, z: number, entrance?: {x: number, z: number}, frontX?: number, frontZ?: number}} landmark
 * @param {number} [step] Metres out from the lot's centre when there is no entrance.
 * @returns {{x: number, z: number}}
 */
export function stationDoorstep(landmark, step = 14) {
  const entrance = landmark.entrance;
  if (entrance && Number.isFinite(entrance.x) && Number.isFinite(entrance.z)) return { x: entrance.x, z: entrance.z };
  return { x: landmark.x + (landmark.frontX ?? 0) * step, z: landmark.z + (landmark.frontZ ?? 0) * step };
}

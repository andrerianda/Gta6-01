// Level of detail by distance for vehicles. Near cars show every part (separate wheels turning,
// steering wheel, doors, glass panes, real headlamp lights): about 36 draws for an everyday car,
// so only the closest ones get it. Middle cars show the merged level 1 and far cars the merged
// level 2, one draw call each (vehicleMergedLevels.js), with no per-frame posing; cars beyond the
// draw distance are hidden. The player's car stays near. Distances scale with the quality tier's
// lodBias; a band of hysteresis stops a car flickering on a boundary. Pure, tested in Node.

/** Level numbers. */
export const VEHICLE_LEVEL = Object.freeze({ NEAR: 0, MID: 1, FAR: 2, HIDDEN: 3 });
/** Metres (at lodBias 1) beyond which a car shows its merged level 1. */
export const NEAR_DISTANCE = 18;
/** Metres (at lodBias 1) beyond which a car shows its merged level 2. */
export const MID_DISTANCE = 70;
/** Metres (at lodBias 1) beyond which a car is hidden, unless the draw distance is shorter. */
export const HIDE_DISTANCE = 420;
/** Fraction of a boundary a car must cross back before it switches again. */
export const HYSTERESIS = 0.12;

function limit(boundary, current, levelBelow) {
  return current <= levelBelow ? boundary * (1 + HYSTERESIS) : boundary * (1 - HYSTERESIS);
}

/**
 * Picks the level of a car from its distance to the camera.
 * @param {number} distance Metres to the camera.
 * @param {number} current The level it shows now.
 * @param {number} [lodBias] context.quality.tier.lodBias.
 * @param {number} [drawDistance] context.quality.tier.drawDistance.
 * @param {boolean} [keepNear] True for a car that always shows every part (the player's).
 * @returns {number} A VEHICLE_LEVEL value.
 */
export function chooseVehicleLevel(distance, current, lodBias = 1, drawDistance = Infinity, keepNear = false) {
  if (keepNear) return VEHICLE_LEVEL.NEAR;
  if (distance < limit(NEAR_DISTANCE * lodBias, current, VEHICLE_LEVEL.NEAR)) return VEHICLE_LEVEL.NEAR;
  if (distance < limit(MID_DISTANCE * lodBias, current, VEHICLE_LEVEL.MID)) return VEHICLE_LEVEL.MID;
  const hide = Math.min(HIDE_DISTANCE * lodBias, drawDistance);
  return distance < limit(hide, current, VEHICLE_LEVEL.FAR) ? VEHICLE_LEVEL.FAR : VEHICLE_LEVEL.HIDDEN;
}

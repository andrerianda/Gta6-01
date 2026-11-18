// Level of detail by distance for vehicles: near cars show every part (separate wheels turning,
// steering wheel, glass panes, real headlamp lights), far cars show one merged mesh and skip
// the per-frame part posing, and cars beyond the draw distance are hidden. Distances scale with
// the quality tier's lodBias; a band of hysteresis stops a car flickering on the boundary.
// Pure, tested in Node.

/** Level numbers. */
export const VEHICLE_LEVEL = Object.freeze({ NEAR: 0, FAR: 1, HIDDEN: 2 });
/** Metres (at lodBias 1) beyond which a car shows its merged mesh. */
export const NEAR_DISTANCE = 45;
/** Metres (at lodBias 1) beyond which a car is hidden, unless the draw distance is shorter. */
export const HIDE_DISTANCE = 420;
/** Fraction of a boundary a car must cross back before it switches again. */
export const HYSTERESIS = 0.12;

/**
 * Picks the level of a car from its distance to the camera.
 * @param {number} distance Metres to the camera.
 * @param {number} current The level it shows now.
 * @param {number} [lodBias] context.quality.tier.lodBias.
 * @param {number} [drawDistance] context.quality.tier.drawDistance.
 * @returns {number} A VEHICLE_LEVEL value.
 */
export function chooseVehicleLevel(distance, current, lodBias = 1, drawDistance = Infinity) {
  const near = NEAR_DISTANCE * lodBias;
  const hide = Math.min(HIDE_DISTANCE * lodBias, drawDistance);
  const nearLimit = current === VEHICLE_LEVEL.NEAR ? near * (1 + HYSTERESIS) : near * (1 - HYSTERESIS);
  if (distance < nearLimit) return VEHICLE_LEVEL.NEAR;
  const hideLimit = current === VEHICLE_LEVEL.HIDDEN ? hide * (1 - HYSTERESIS) : hide * (1 + HYSTERESIS);
  return distance < hideLimit ? VEHICLE_LEVEL.FAR : VEHICLE_LEVEL.HIDDEN;
}

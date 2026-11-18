// What each police unit of the catalog (POLICE_UNITS in catalog/gangsAndFactions.js) is at run
// time: the model it drives, read from the asset library when the unit is sent (the pursuit SUV
// drives the civilian SUV in unmarked navy until a police_suv model exists; any unit falls back to
// the police cruiser while its model is not loaded), how far its crew sees, how many officers ride
// in it, and which unit the dispatcher sends next for a wanted level
// (WANTED_LEVELS[stars].dispatch). Pure.

/** The road model every road unit falls back to. */
export const FALLBACK_POLICE_MODEL = 'police_cruiser';

/** Run-time profile of each unit kind. standIn / standInColour: the model worn until `model` exists. */
export const UNIT_PROFILES = Object.freeze({
  beat_officer: Object.freeze({ kind: 'beat_officer', onFoot: true, model: null, sight: 45, crew: 2, ground: true }),
  patrol_car: Object.freeze({ kind: 'patrol_car', onFoot: false, model: 'police_cruiser', sight: 70, crew: 2, ground: true }),
  pursuit_suv: Object.freeze({
    kind: 'pursuit_suv', onFoot: false, model: 'police_suv', standIn: 'suv', standInColour: '#16213A', sight: 75, crew: 2, ground: true,
  }),
  tactical_team: Object.freeze({ kind: 'tactical_team', onFoot: false, model: 'swat_van', sight: 60, crew: 4, ground: true }),
  air_support: Object.freeze({ kind: 'air_support', onFoot: false, model: 'police_helicopter', sight: 110, crew: 2, ground: false }),
  harbor_boat: Object.freeze({ kind: 'harbor_boat', onFoot: false, model: 'police_boat', sight: 90, crew: 2, ground: false }),
});

/**
 * The vehicle model a unit drives today.
 * @param {string} unitKind A UNIT_PROFILES key.
 * @param {(modelId: string) => boolean} hasModel True when the asset library has that model.
 * @returns {string | null} A vehicle model id, or null for a unit that has no vehicle or cannot
 *   be fielded yet (aircraft and boats need their own physics).
 */
export function modelForUnit(unitKind, hasModel) {
  const profile = UNIT_PROFILES[unitKind];
  if (!profile || profile.onFoot) return null;
  if (!profile.ground) return hasModel(profile.model) ? profile.model : null;
  if (hasModel(profile.model)) return profile.model;
  if (profile.standIn && hasModel(profile.standIn)) return profile.standIn;
  return FALLBACK_POLICE_MODEL;
}

/**
 * The paint for a unit's vehicle: the stand-in's livery colour, or null for the model's own.
 * @param {string} unitKind
 * @param {string} modelId What modelForUnit chose.
 * @returns {string | null}
 */
export function colourForUnit(unitKind, modelId) {
  const profile = UNIT_PROFILES[unitKind];
  return profile && profile.standIn === modelId ? profile.standInColour ?? null : null;
}

/**
 * Picks the unit to send next at a wanted level.
 * @param {object} level A WANTED_LEVELS entry.
 * @param {Record<string, number>} active Units of each kind on the street now.
 * @param {(unitKind: string) => boolean} canField False for units that cannot be fielded now
 *   (no helicopter physics, a boat while the lead is on land).
 * @returns {string | null} A unit kind, or null when the level's quota is full.
 */
export function nextUnitToSend(level, active, canField) {
  let total = 0;
  for (const kind in active) total += active[kind];
  if (total >= level.maxActiveUnits) return null;
  let best = null;
  let bestShare = Infinity;
  for (let i = 0; i < level.dispatch.length; i += 1) {
    const { unit, max } = level.dispatch[i];
    const count = active[unit] ?? 0;
    if (count >= max || !canField(unit)) continue;
    const share = count / max;
    if (share < bestShare) {
      best = unit;
      bestShare = share;
    }
  }
  return best;
}

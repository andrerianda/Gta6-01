// The heat meter behind the wanted stars, as pure rules over the catalogs (WANTED_LEVELS and
// WANTED_RULES of catalog/wantedLevels.js, CRIME_CATALOG and CRIME_REPORTING of
// catalog/crimeCatalog.js). A reported crime adds heat (with the combo multiplier for crimes in
// quick succession, never twice within its repeatSeconds); heat becomes stars at the catalog's
// thresholds and a crime's minStars is a floor the level jumps to. While the police see the lead
// nothing cools; once no unit has seen the lead for lostSightSeconds the search starts (the stars
// blink) round the last known position, and staying unseen for the level's searchSeconds (the
// clock runs 1.5 times faster outside the search circle) clears every star. A clean lead's leftover
// heat drains away. A fight with a gang (GANG_VIOLENCE_RULES) and shots fired are capped at two
// stars on their own (starCapFor). No engine, no three.js:
// wantedLevelRuntime.js feeds it and tools/tests/police/ checks it.

/** What stepWanted reports. */
export const WANTED_STEP = Object.freeze({ NONE: 0, SEARCH_STARTED: 1, CLEARED: 2, SPOTTED: 3 });

/**
 * How the police treat a fight between the lead and a gang (a mission's hostile crew included):
 * any violence against a gang member is reported as gang_violence, one report per victim (the
 * wounds and the kill are one crime), the reports reach the police at most every spacingSeconds,
 * and such a fight alone never lifts the level above maxStars. Shots fired share the cap.
 */
export const GANG_VIOLENCE_RULES = Object.freeze({
  crimeId: 'gang_violence',
  maxStars: 2,
  spacingSeconds: 1.5,
  perVictimSeconds: 10,
});

/** Crimes whose heat alone never lifts the level above these stars (more serious crimes still can). */
const STAR_CAPS = Object.freeze({ gang_violence: GANG_VIOLENCE_RULES.maxStars, discharging_firearm: 2, brandishing: 2 });

/**
 * The most stars a crime's heat can bring on its own.
 * @param {string} crimeId
 * @param {object} rules WANTED_RULES.
 * @returns {number}
 */
export function starCapFor(crimeId, rules) {
  return Math.min(rules.maxStars, STAR_CAPS[crimeId] ?? rules.maxStars);
}

/**
 * True for a gang member, a mission's hostile crew or guards (tags gang / hostile, data
 * missionEnemy or a faction), never an officer. They neither count as civilians nor call the police.
 * @param {{tags?: Set<string>, data?: object} | null | undefined} entity
 * @returns {boolean}
 */
export function isGangMember(entity) {
  if (!entity) return false;
  const tags = entity.tags;
  if (tags?.has?.('police')) return false;
  const data = entity.data ?? {};
  return Boolean(tags?.has?.('gang') || tags?.has?.('hostile') || data.missionEnemy || data.factionId);
}

/**
 * The crime the police record for a reported one: violence against a gang member is gang_violence.
 * @param {string} crimeId As reported (combat may still say homicide or armed_assault).
 * @param {object} crimeCatalog CRIME_CATALOG.
 * @param {boolean} gangVictim True when the victim is a gang member (isGangMember).
 * @returns {string} A CRIME_CATALOG id.
 */
export function crimeAgainstVictim(crimeId, crimeCatalog, gangVictim) {
  if (!gangVictim) return crimeId;
  return crimeCatalog[crimeId]?.category === 'violence' ? GANG_VIOLENCE_RULES.crimeId : crimeId;
}

/**
 * A new, clean wanted state.
 * @returns {object} The state every function here reads and writes.
 */
export function createWantedState() {
  return {
    heat: 0,
    level: 0,
    searching: false,
    unseenSeconds: 0,
    searchSeconds: 0,
    time: 0,
    lastKnown: { x: 0, y: 0, z: 0 },
    lastCrimeTime: new Map(),
    comboCount: 0,
    comboUntil: -1,
  };
}

/**
 * The stars a heat value earns.
 * @param {number} heat
 * @param {ReadonlyArray<number>} thresholds WANTED_RULES.heatThresholds.
 * @returns {number} 0..thresholds.length - 1.
 */
export function starsForHeat(heat, thresholds) {
  let stars = 0;
  for (let i = 1; i < thresholds.length; i += 1) if (heat >= thresholds[i]) stars = i;
  return stars;
}

/**
 * The crime for a VEHICLE_DESTROYED event: none unless the lead destroyed it (an event with no
 * attacker is a crash or a fire, not the lead's doing); a police vehicle is its own, graver crime.
 * @param {{attackerId?: number | null, modelId?: string}} event The event.
 * @param {(id: number) => boolean} isLead True for the lead's entity id.
 * @param {boolean} policeVehicle True when the wreck carries the police tag.
 * @returns {string | null} A CRIME_CATALOG id.
 */
export function crimeForDestroyedVehicle(event, isLead, policeVehicle) {
  const attacker = event?.attackerId;
  if (attacker === null || attacker === undefined || !isLead(attacker)) return null;
  const police = policeVehicle || /^(police_|swat_)/.test(event.modelId ?? '');
  return police ? 'destroy_police_vehicle' : 'destroy_vehicle';
}

/**
 * Adds a reported crime's heat.
 * @param {object} state From createWantedState.
 * @param {object} crime A CRIME_CATALOG entry.
 * @param {object} rules WANTED_RULES.
 * @param {object} reporting CRIME_REPORTING.
 * @param {{x: number, y?: number, z: number} | null} position Where it happened (the last known position).
 * @param {number} [multiplier] Extra scale (a mission's cap, owned property).
 * @returns {number} The heat added (0 when the crime repeated too soon).
 */
export function addCrimeHeat(state, crime, rules, reporting, position, multiplier = 1) {
  const last = state.lastCrimeTime.get(crime.id);
  if (last !== undefined && crime.repeatSeconds > 0 && state.time - last < crime.repeatSeconds) return 0;
  state.lastCrimeTime.set(crime.id, state.time);
  if (state.time <= state.comboUntil) state.comboCount += 1;
  else state.comboCount = 0;
  state.comboUntil = state.time + reporting.comboWindowSeconds;
  const combo = Math.min(reporting.comboHeatMultiplierMax, 1 + reporting.comboHeatMultiplierStep * state.comboCount);
  const cap = starCapFor(crime.id, rules);
  // A capped crime fills the heat only up to just below the next star (never takes any back).
  const room = cap < rules.maxStars ? Math.max(0, rules.heatThresholds[cap + 1] - 1 - state.heat) : Infinity;
  const added = Math.min(crime.heat * combo * multiplier, room);
  state.heat = Math.min(rules.maxHeat, state.heat + added);
  const floor = Math.min(rules.maxStars, crime.minStars || 0);
  let level = Math.max(state.level, starsForHeat(state.heat, rules.heatThresholds), floor);
  level = Math.min(rules.maxStars, level);
  state.heat = Math.max(state.heat, rules.heatFloorPerStar[level]);
  state.level = level;
  markSeen(state, position);
  return added;
}

/**
 * Sets the level outright (debug command, mission scripts): heat jumps to that star's threshold.
 * @param {object} state
 * @param {number} level 0..maxStars.
 * @param {object} rules WANTED_RULES.
 * @param {{x: number, y?: number, z: number} | null} [position] The lead's position.
 */
export function setWantedLevel(state, level, rules, position = null) {
  const stars = Math.max(0, Math.min(rules.maxStars, Math.round(level) || 0));
  state.level = stars;
  state.heat = rules.heatThresholds[stars];
  if (stars === 0) clearWanted(state);
  else markSeen(state, position);
}

/**
 * Removes stars (a change of clothes): the level drops and heat falls to the new floor.
 * @param {object} state
 * @param {number} count Stars to remove.
 * @param {object} rules WANTED_RULES.
 */
export function removeStars(state, count, rules) {
  setWantedLevel(state, state.level - count, rules, state.lastKnown);
}

/**
 * Clears every star.
 * @param {object} state
 */
export function clearWanted(state) {
  state.level = 0;
  state.heat = 0;
  state.searching = false;
  state.unseenSeconds = 0;
  state.searchSeconds = 0;
  state.comboCount = 0;
  state.comboUntil = -1;
}

/**
 * Notes that the police see the lead now.
 * @param {object} state
 * @param {{x: number, y?: number, z: number} | null} position Where the lead is.
 * @returns {boolean} True when this ended a search (the pursuit resumes).
 */
export function markSeen(state, position) {
  const wasSearching = state.searching;
  state.unseenSeconds = 0;
  state.searchSeconds = 0;
  state.searching = false;
  if (position) {
    state.lastKnown.x = position.x;
    state.lastKnown.y = position.y ?? 0;
    state.lastKnown.z = position.z;
  }
  return wasSearching;
}

/**
 * Whether a way to lose the police is open at this level.
 * @param {string} wayId A WANTED_RULES.waysToLose key, or 'busted' / 'wasted' (always open).
 * @param {number} level Current stars.
 * @param {object} rules WANTED_RULES.
 * @returns {boolean}
 */
export function wayToLoseAllows(wayId, level, rules) {
  if (wayId === 'busted' || wayId === 'wasted' || wayId === 'debug' || wayId === 'mission') return true;
  const way = rules.waysToLose[wayId];
  if (!way) return false;
  return level <= way.maxStars;
}

/**
 * Advances the wanted state by one step.
 * @param {object} state
 * @param {number} dt Seconds.
 * @param {boolean} seen True when any unit sees the lead this step.
 * @param {{x: number, y?: number, z: number}} leadPosition Where the lead is.
 * @param {object} rules WANTED_RULES.
 * @param {ReadonlyArray<object>} levels WANTED_LEVELS.
 * @returns {number} A WANTED_STEP code.
 */
export function stepWanted(state, dt, seen, leadPosition, rules, levels) {
  state.time += dt;
  if (state.level === 0) {
    state.heat = Math.max(0, state.heat - rules.heatDecayPerSecondWhenClean * dt);
    return WANTED_STEP.NONE;
  }
  if (seen) return markSeen(state, leadPosition) ? WANTED_STEP.SPOTTED : WANTED_STEP.NONE;
  state.unseenSeconds += dt;
  if (!state.searching) {
    if (state.unseenSeconds < rules.pursuit.lostSightSeconds) return WANTED_STEP.NONE;
    state.searching = true;
    state.searchSeconds = 0;
    return WANTED_STEP.SEARCH_STARTED;
  }
  const level = levels[state.level];
  const dx = leadPosition.x - state.lastKnown.x;
  const dz = leadPosition.z - state.lastKnown.z;
  const outside = dx * dx + dz * dz > level.searchRadius * level.searchRadius;
  state.searchSeconds += dt * (outside ? rules.search.outsideCircleTimeMultiplier : 1);
  if (state.searchSeconds < level.searchSeconds) return WANTED_STEP.NONE;
  clearWanted(state);
  return WANTED_STEP.CLEARED;
}

/**
 * Seconds of search left before the stars clear (for the HUD and the minimap circle).
 * @param {object} state
 * @param {ReadonlyArray<object>} levels WANTED_LEVELS.
 * @returns {number}
 */
export function searchSecondsLeft(state, levels) {
  if (!state.searching) return levels[state.level]?.searchSeconds ?? 0;
  return Math.max(0, levels[state.level].searchSeconds - state.searchSeconds);
}

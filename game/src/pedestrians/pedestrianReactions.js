// How a person on the pavement reacts to trouble: which stimuli reach them (how far a shot, a
// blast or a fight carries), which reaction their archetype picks (its weights per stimulus,
// with fear spreading: someone already panicking never stops to film), which way to run, when
// a car is about to hit them and which side to dive to, and when a car knocks them down. Pure
// functions of plain numbers (Node-tested), no allocation in the per-frame checks.

/** How far each stimulus carries, metres (gunfire scales with the weapon's loudness). */
export const STIMULUS_RANGE = Object.freeze({
  gunfire: 55,
  explosion: 70,
  fight_nearby: 18,
  body_seen: 22,
  aimed_at: 30,
  vehicle_near_miss: 0,
  bumped: 1.2,
});

/** Seconds a fleeing person keeps running once the trouble is out of sight. */
export const FLEE_SECONDS = 12;
/** Seconds a phone call to the police takes before the report lands. */
export const CALL_SECONDS = 4;
/** Car speed (m/s) above which a touch knocks a person down. */
export const KNOCKDOWN_SPEED = 2.5;

/**
 * Whether a stimulus at a distance reaches a person.
 * @param {string} stimulus A PEDESTRIAN_STIMULI id.
 * @param {number} distance Metres.
 * @param {number} [loudness] WEAPON_FIRED loudness (1 a pistol); EXPLOSION radius scale.
 */
export function stimulusReaches(stimulus, distance, loudness = 1) {
  const range = (STIMULUS_RANGE[stimulus] ?? 20) * Math.max(0.3, loudness);
  return distance <= range;
}

/**
 * The reaction an archetype picks.
 * @param {{reactions?: Record<string, Record<string, number>>, courage?: number, aggression?: number}} archetype
 * @param {string} stimulus
 * @param {() => number} random
 * @param {{panicking?: boolean, armed?: boolean, distance?: number}} [situation]
 * @returns {string} A PEDESTRIAN_REACTIONS id ('ignore' when the archetype has none).
 */
export function chooseReaction(archetype, stimulus, random, situation = {}) {
  const table = (archetype.reactions && archetype.reactions[stimulus]) || null;
  if (!table) return stimulus === 'gunfire' || stimulus === 'explosion' ? 'flee' : 'ignore';
  let total = 0;
  const near = (situation.distance ?? 99) < 8;
  const weightOf = (reaction, weight) => {
    if (situation.panicking && (reaction === 'film' || reaction === 'gawk' || reaction === 'ignore')) return 0;
    // Fighting back needs a weapon or the offender close; close trouble makes people cower.
    if (reaction === 'fight') return situation.armed || near ? weight * (0.5 + (archetype.aggression ?? 0)) : weight * 0.2;
    if (reaction === 'cower' && near) return weight * 1.6;
    return weight;
  };
  for (const reaction in table) total += weightOf(reaction, table[reaction]);
  if (!(total > 0)) return 'flee';
  let roll = random() * total;
  let last = 'ignore';
  for (const reaction in table) {
    const weight = weightOf(reaction, table[reaction]);
    if (weight <= 0) continue;
    last = reaction;
    roll -= weight;
    if (roll < 0) return reaction;
  }
  return last;
}

/**
 * The way to run from trouble: straight away from it, bent towards the pavement's direction so
 * people run along streets rather than into walls.
 * @returns {{x: number, z: number}} A unit vector (written into out).
 */
export function fleeDirection(px, pz, sourceX, sourceZ, alongX, alongZ, out = { x: 0, z: 0 }) {
  let ax = px - sourceX, az = pz - sourceZ;
  const d = Math.hypot(ax, az);
  if (d < 1e-3) { ax = alongX; az = alongZ; } else { ax /= d; az /= d; }
  // Along the pavement, whichever way points more away from the trouble.
  const sign = ax * alongX + az * alongZ >= 0 ? 1 : -1;
  let x = ax * 0.45 + alongX * sign * 0.55, z = az * 0.45 + alongZ * sign * 0.55;
  const n = Math.hypot(x, z) || 1;
  x /= n; z /= n;
  out.x = x;
  out.z = z;
  return out;
}

/**
 * Whether a moving car threatens a person, and how soon.
 * @param {number} px Person x.
 * @param {number} pz Person z.
 * @param {number} cx Car centre x.
 * @param {number} cz Car centre z.
 * @param {number} forwardX Car's nose direction (unit).
 * @param {number} forwardZ
 * @param {number} speed Car speed along its nose, m/s (negative reversing).
 * @param {number} [halfWidth] Half the car's width plus a margin, metres.
 * @param {{seconds: number, side: number, lateral: number}} [out]
 * @returns {{seconds: number, side: number, lateral: number} | null} Seconds to contact, and
 *   the side to dive to (+1 the car's right, -1 its left); null when the car is no threat.
 */
export function carThreat(px, pz, cx, cz, forwardX, forwardZ, speed, halfWidth = 1.6, out = { seconds: 0, side: 1, lateral: 0 }) {
  if (Math.abs(speed) < 1.5) return null;
  const dx = px - cx, dz = pz - cz;
  const direction = speed > 0 ? 1 : -1;
  const ahead = (dx * forwardX + dz * forwardZ) * direction - 2.2;
  const lateral = dx * -forwardZ + dz * forwardX;
  if (ahead < -1.5 || Math.abs(lateral) > halfWidth) return null;
  const seconds = Math.max(0, ahead) / Math.abs(speed);
  if (seconds > 2.2) return null;
  out.seconds = seconds;
  out.lateral = lateral;
  out.side = lateral >= 0 ? 1 : -1;
  return out;
}

/** True when a car this close and this fast knocks a person down. */
export function knocksDown(distanceToBody, speed) {
  return distanceToBody < 0.6 && Math.abs(speed) >= KNOCKDOWN_SPEED;
}

/**
 * Heat a witness adds: seeing a crime counts once, a phone call to the police twice as much.
 * @param {boolean} phoned
 */
export function witnessHeat(phoned) {
  return phoned ? 2 : 1;
}

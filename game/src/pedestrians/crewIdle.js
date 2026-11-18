// How people who stand about for a long time spend it: a mission's guard keeps a still watch
// (hands behind the back, no talking, the head and body turning slowly to scan the ground in
// front), and a gang crew hangs out in a loose huddle instead of standing in a row: one talks
// with his hands while the others listen and now and then answer, one squats on his heels, one
// keeps a lookout half turned to the street, one smokes or takes a call. Crew members who are
// not on lookout turn towards their mates. The poses are the character run-time's stances and
// gestures; 'watch', 'lean_wall' and 'smoke' are used as soon as the run-time has them (asked of
// character-runtime: its setStance / setGesture throw on a name they lack, and such a name is
// then dropped for good) and meanwhile fall back to the nearest pose it has. A role's stance is
// dropped the moment the person stops idling (a fight, a flight, a mission turning hostile).
import { ENTITY_TAGS } from '../core/entities/entityKinds.js';

/** Stances and gestures tried, the run-time's own plus those asked of it (dropped if refused). */
const TRIED_STANCES = Object.freeze(['stand', 'cuffed', 'crouch', 'watch', 'lean_wall']);
const TRIED_GESTURES = Object.freeze(['talk', 'phone', 'smoke']);

/** The idle roles. */
export const IDLE_ROLES = Object.freeze(['guard', 'talker', 'listener', 'squat', 'lookout', 'smoker', 'caller', 'leaner']);

/** Crew roles by crew size (the first is the talker; the rest are shuffled by the crew's roll). */
const CREW_ROLES = Object.freeze({
  1: ['smoker'],
  2: ['talker', 'smoker'],
  3: ['talker', 'squat', 'lookout'],
  4: ['talker', 'listener', 'squat', 'lookout'],
  5: ['talker', 'listener', 'squat', 'lookout', 'caller'],
});
/** Extra roles for the bigger crews, in turn. */
const MORE_ROLES = Object.freeze(['leaner', 'listener', 'smoker', 'squat']);
/** Half the arc a guard's scan covers, radians, and its period, seconds. */
export const GUARD_SCAN = Object.freeze({ arc: 0.35, period: 11 });
/** How far a lookout turns from his mates, radians. */
const LOOKOUT_TURN = 1.9;
/** Mates within this many metres count as the same crew. */
const CREW_RADIUS = 4;

/**
 * The roles of a crew of `size`, the talker first, the rest in an order set by `roll` (0..1).
 * @param {number} size
 * @param {number} roll
 * @returns {string[]}
 */
export function crewRolesFor(size, roll) {
  const n = Math.max(1, Math.floor(size));
  const roles = (CREW_ROLES[Math.min(n, 5)] || CREW_ROLES[5]).slice(0, n);
  for (let i = roles.length; i < n; i += 1) roles.push(MORE_ROLES[(i - 5) % MORE_ROLES.length]);
  // Rotate everyone but the talker so crews differ (who squats, who keeps a lookout).
  const rest = roles.slice(1), shift = Math.floor((roll || 0) * rest.length) % Math.max(1, rest.length);
  return [roles[0], ...rest.slice(shift), ...rest.slice(0, shift)];
}

/**
 * The run-time pose for a role: a stance (or 'stand') and a gesture (or null), from the names the
 * run-time knows. `talking` is the talker's or listener's turn to use the hands.
 * @param {string} role
 * @param {{stances: {has: (name: string) => boolean}, gestures: {has: (name: string) => boolean}}} knows
 * @param {boolean} [talking]
 * @returns {{stance: string, gesture: string | null}}
 */
export function idlePoseFor(role, knows, talking = false) {
  const stance = (name, fallback) => (knows.stances.has(name) ? name : fallback);
  const gesture = (name, fallback) => (knows.gestures.has(name) ? name : fallback);
  switch (role) {
    // Hands clasped (behind the back until the run-time has a 'watch' pose), never talking.
    case 'guard': return { stance: stance('watch', stance('cuffed', 'stand')), gesture: null };
    case 'talker': return { stance: 'stand', gesture: talking ? gesture('talk', null) : null };
    case 'listener': return { stance: 'stand', gesture: talking ? gesture('talk', null) : null };
    case 'squat': return { stance: stance('crouch', 'stand'), gesture: null };
    case 'lookout': return { stance: stance('cuffed', 'stand'), gesture: null };
    case 'smoker': return { stance: 'stand', gesture: gesture('smoke', null) };
    case 'caller': return { stance: 'stand', gesture: gesture('phone', null) };
    case 'leaner': return knows.stances.has('lean_wall') ? { stance: 'lean_wall', gesture: gesture('smoke', null) } : { stance: stance('crouch', 'stand'), gesture: null };
    default: return { stance: 'stand', gesture: null };
  }
}

/**
 * Creates the idling of standing crowd members.
 * @param {object} crowd The shared crowd state (crowdSimulation.js): people, setStance, setGesture, random, time.
 */
export function createCrewIdle(crowd) {
  const knows = { stances: new Set(TRIED_STANCES), gestures: new Set(TRIED_GESTURES) };
  const stats = { guards: 0, crew: 0, refused: 0 };

  /** The role a standing person idles in: a guard, a crew member (turf or mission), or none. */
  function roleOf(p) {
    const data = p.entity.data;
    if (data.missionGuard) return 'guard';
    if (p.crewRole) return p.crewRole;
    // A mission's crew standing about (members of a gang, not givers): a role by its id.
    if (data.missionEnemy && (data.factionId || p.entity.tags.has(ENTITY_TAGS.GANG))) {
      const roles = crewRolesFor(4, 0);
      return roles[Math.abs(Number(p.id) || 0) % roles.length];
    }
    return null;
  }

  /**
   * Shows a role's pose: the stance through the crowd (remembered, to drop later) and the
   * gesture; a name the run-time refuses is dropped and the next best pose shown instead.
   */
  function show(p, role, talking) {
    for (let tries = 0; tries < 4; tries += 1) {
      const pose = idlePoseFor(role, knows, talking);
      try {
        if (p.stance !== pose.stance) {
          crowd.setStance(p, pose.stance);
          p.idleStance = pose.stance === 'stand' ? null : pose.stance;
        }
      } catch {
        knows.stances.delete(pose.stance);
        stats.refused += 1;
        continue;
      }
      if (p.gesture === pose.gesture) return;
      try { crowd.setGesture(p, pose.gesture); return; } catch {
        knows.gestures.delete(pose.gesture);
        stats.refused += 1;
        p.gesture = undefined;
      }
    }
  }

  /** Turns a crew member towards the mates near him (a lookout away from them). */
  function faceMates(p) {
    let sx = 0, sz = 0, n = 0;
    for (const q of crowd.people) {
      if (q === p || q.mode !== 'chat' || !q.idleRole || q.idleRole === 'guard') continue;
      const dx = q.x - p.x, dz = q.z - p.z;
      if (dx * dx + dz * dz > CREW_RADIUS * CREW_RADIUS) continue;
      sx += dx; sz += dz; n += 1;
    }
    if (n === 0) return false;
    const toMates = Math.atan2(-sx, -sz);
    p.facing = p.idleRole === 'lookout' ? toMates + (p.id % 2 ? LOOKOUT_TURN : -LOOKOUT_TURN) : toMates;
    return true;
  }

  return {
    stats,
    /**
     * Idles a person in 'chat' mode; false when they have no idle role (ordinary talkers keep
     * their own turns with the hands).
     * @param {object} p A crowd person.
     * @param {number} dt
     * @param {boolean} thinking This person's thinking frame (every few frames).
     */
    update(p, dt, thinking) {
      if (p.idleRole === undefined) {
        p.idleRole = roleOf(p);
        if (p.idleRole === 'guard') stats.guards += 1; else if (p.idleRole) stats.crew += 1;
        p.idleTimer = 0;
        p.idleSeed = crowd.random() * GUARD_SCAN.period;
        p.idleFaced = false;
      }
      const role = p.idleRole;
      if (!role) return false;
      p.idleTimer -= dt;
      if (role === 'guard') {
        show(p, 'guard', false);
        // A slow scan either side of the way the mission faces him (missions reads p.facing).
        const t = (crowd.time + p.idleSeed) * (Math.PI * 2 / GUARD_SCAN.period);
        p.input.facing = p.facing + Math.sin(t) * GUARD_SCAN.arc * Math.min(1, Math.abs(Math.sin(t * 0.5)) * 1.6);
        return true;
      }
      // Once the mates are about (they may still be placed this frame).
      if (thinking && !p.idleFaced) p.idleFaced = faceMates(p);
      p.input.facing = p.facing;
      if (p.idleTimer <= 0) {
        // Turns with the hands: the talker mostly, a listener now and then.
        const talker = role === 'talker';
        p.idleTalking = !p.idleTalking && crowd.random() < (talker ? 0.85 : 0.3);
        p.idleTimer = p.idleTalking ? 2.5 + crowd.random() * 3.5 : 1.5 + crowd.random() * (talker ? 2 : 6);
      }
      show(p, role, Boolean(p.idleTalking));
      return true;
    },
    /** The person stops idling (any other mode, or aiming): back to standing, the role kept. */
    clear(p) {
      if (p.idleStance && p.stance === p.idleStance) crowd.setStance(p, 'stand');
      p.idleStance = null;
      p.idleFaced = false;
    },
  };
}

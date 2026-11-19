// Who stands where on the base: the plan's posts turned into world posts with the archetype that
// mans each (guards, ground crew, the duty officer), the yaw they face, the short loop a crew
// member walks between his post and the nearest aircraft stand, and the timetable of that loop
// (idle at the post, walk over, crouch to inspect, walk back). Pure (Node-tested).
import { yawOfCompass } from './restrictedZone.js';

/** The archetype (catalog/pedestrianArchetypes.js) that mans each role of the plan. */
export const POST_ARCHETYPES = Object.freeze({ guard: 'base_guard', groundCrew: 'base_ground_crew', officer: 'base_officer' });

/** Metres from the lead within which the base is manned, and beyond which it is emptied again. */
export const GARRISON_RANGE = Object.freeze({ man: 320, empty: 380 });

/** A crew member's round: seconds at the post, crouched at the aircraft, and his walking speed. */
export const CREW_ROUND = Object.freeze({ idle: [9, 20], inspect: [5, 9], speed: 1.25, standOff: 7 });

/**
 * The world posts of a base plan.
 * @param {{posts: ReadonlyArray<{id: string, role: string, at: number[], facing: number}>,
 *   stands?: ReadonlyArray<{id: string, at: number[]}>, gate: {at: number[]}}} plan
 * @param {(e: number, n: number) => {x: number, z: number}} toWorld
 * @returns {{id: string, role: string, archetypeId: string, x: number, z: number, yaw: number, atGate: boolean,
 *   standId: string|null, workX: number, workZ: number}[]}
 */
export function worldPostsOf(plan, toWorld) {
  const stands = standsOf(plan, toWorld);
  const gate = toWorld(plan.gate.at[0], plan.gate.at[1]);
  return plan.posts.map((post) => {
    const at = toWorld(post.at[0], post.at[1]);
    const out = { id: post.id, role: post.role, archetypeId: POST_ARCHETYPES[post.role] || POST_ARCHETYPES.guard, x: at.x, z: at.z,
      yaw: yawOfCompass(post.facing), atGate: Math.hypot(at.x - gate.x, at.z - gate.z) < 12, standId: null, workX: at.x, workZ: at.z };
    if (post.role === 'groundCrew' && stands.length) {
      let best = stands[0];
      for (const stand of stands) if (Math.hypot(stand.x - at.x, stand.z - at.z) < Math.hypot(best.x - at.x, best.z - at.z)) best = stand;
      // He works at the aircraft's side nearest his post, a few metres off its centre line.
      const dx = at.x - best.x, dz = at.z - best.z, d = Math.hypot(dx, dz) || 1;
      const off = Math.min(CREW_ROUND.standOff, d);
      out.standId = best.id;
      out.workX = best.x + (dx / d) * off;
      out.workZ = best.z + (dz / d) * off;
    }
    return out;
  });
}

/** The aircraft stands of a plan in world metres ({id, x, z}). */
export function standsOf(plan, toWorld) {
  return (plan.stands || []).map((stand) => ({ id: stand.id, ...toWorld(stand.at[0], stand.at[1]) }));
}

/**
 * Whether the base is manned, with hysteresis.
 * @param {boolean} manned Now.
 * @param {number} distance Metres from the lead to the nearest part of the base (0 inside).
 */
export function garrisonManned(manned, distance) {
  return manned ? distance < GARRISON_RANGE.empty : distance < GARRISON_RANGE.man;
}

/**
 * A crew member's next step of the round.
 * @param {'idle'|'toWork'|'inspect'|'toPost'} phase
 * @param {boolean} arrived Whether he stands where the phase sent him.
 * @param {number} timeLeft Seconds left of a timed phase.
 * @param {() => number} random
 * @returns {{phase: string, seconds: number} | null} The new phase and its time, or null to go on.
 */
export function nextCrewPhase(phase, arrived, timeLeft, random) {
  const span = ([low, high]) => low + (high - low) * random();
  if (phase === 'idle') return timeLeft <= 0 ? { phase: 'toWork', seconds: 60 } : null;
  if (phase === 'toWork') return arrived || timeLeft <= 0 ? { phase: 'inspect', seconds: span(CREW_ROUND.inspect) } : null;
  if (phase === 'inspect') return timeLeft <= 0 ? { phase: 'toPost', seconds: 60 } : null;
  return arrived || timeLeft <= 0 ? { phase: 'idle', seconds: span(CREW_ROUND.idle) } : null;
}

/**
 * Where a gate guard stands: on his post, or a step aside off the road when the officer comes
 * through (away from the gate's middle, along the fence).
 * @param {{x: number, z: number}} post
 * @param {{x: number, z: number, outX: number, outZ: number}} gate
 * @param {boolean} aside
 * @param {{x: number, z: number}} out Written and returned.
 */
export function gateGuardSpot(post, gate, aside, out) {
  out.x = post.x;
  out.z = post.z;
  if (!aside) return out;
  // Along the fence: the gate's outward direction turned a quarter.
  const ax = -gate.outZ, az = gate.outX;
  const side = (post.x - gate.x) * ax + (post.z - gate.z) * az >= 0 ? 1 : -1;
  out.x += ax * side * 2.2;
  out.z += az * side * 2.2;
  return out;
}

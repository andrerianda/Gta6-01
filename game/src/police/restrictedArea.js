// The restricted area of Base Aérea Punta Garza: soldiers of the Guardia Aérea and ground crew on
// the plan's posts (crowd people in their own uniforms), the challenge at the gate ("Restricted
// area. Turn around."), trespass by any way in (the gate, the fence, a boat, a landing, a low
// pass under 150 m) with wanted stars that rise the longer it lasts, guards who open fire and an
// armed response, and the clean switch: with the world flag base.officerAccess the lead is the
// expected officer, the barrier opens and guards and crew salute. The rules are pure modules
// under police/restricted/ (restrictedZone, gateChallenge, trespassEscalation, saluteRules,
// basePosts); restrictedAreaRuntime.js wires them to the crowd, the police and the base.
//
// Members: state ('outside' | 'challenged' | 'trespassing' | 'cleared'), isInside(x, z),
//   suspicion (0..1: the cleared lead running, bumping people, lingering by a stand he was not
//   sent to), suspicionCause, setExpectedStand(standId), people ([{id, role, postId, x, z,
//   saluting}]), countdown (seconds left of the challenge), trespassStars, officerAccess (the
//   flag, unless a drawn weapon or a blow revoked it for this visit).
// Publishes: RESTRICTED_AREA_CHANGED, BASE_CREW_SALUTED, RADIO_MESSAGE (channel 'guard'); sets
//   the flag base.alarm while he is inside and wanted; reports the crime military_trespass.
// Stages (?stage=): gate, trespass, officer (restricted/restrictedAreaStages.js).
const NO_PEOPLE = Object.freeze([]);

/**
 * Creates the restricted area system.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {import('../core/systems/gameSystemContract.js').GameSystem}
 */
export function createRestrictedAreaSystem(context) {
  let runtime = null;

  return {
    name: 'restrictedArea',
    dependsOn: ['pedestrians', 'policeDispatch'],

    async init(progress) {
      const { createRestrictedAreaRuntime } = await import('./restricted/restrictedAreaRuntime.js');
      runtime = createRestrictedAreaRuntime(context);
      if (progress) progress(1, 'restricted area');
    },

    start() {
      if (runtime) runtime.start();
    },

    update(deltaSeconds) {
      if (runtime) runtime.update(deltaSeconds);
    },

    dispose() {
      if (runtime) runtime.dispose();
      runtime = null;
    },

    /** 'outside' | 'challenged' | 'trespassing' | 'cleared'. */
    get state() { return runtime ? runtime.state : 'outside'; },
    /** Whether a ground point lies inside the restricted ring. */
    isInside: (x, z) => (runtime ? runtime.isInside(x, z) : false),
    /** How suspicious the cleared lead looks, 0..1 (reaching 1 does nothing by itself). */
    get suspicion() { return runtime ? runtime.suspicion : 0; },
    /** What raised the suspicion last: 'running' | 'bumped' | 'lingering' | null. */
    get suspicionCause() { return runtime ? runtime.suspicionCause : null; },
    /** The stand the officer was sent to (catalog stand id), so standing by it is not lingering. */
    setExpectedStand(standId) { if (runtime) runtime.setExpectedStand(standId); },
    /** The living people of the base: [{id, role, postId, x, z, saluting}]. */
    get people() { return runtime ? runtime.people : NO_PEOPLE; },
    /** Seconds left of the gate challenge. */
    get countdown() { return runtime ? runtime.countdown : 0; },
    /** The stars the running trespass asks for (0 when none). */
    get trespassStars() { return runtime ? runtime.trespassStars : 0; },
    /** Whether the lead passes as the expected officer now. */
    get officerAccess() { return runtime ? runtime.officerAccess : false; },
    /** The zone's numbers (ring, gate, centre), null before init. */
    get zone() { return runtime ? runtime.zone : null; },
  };
}

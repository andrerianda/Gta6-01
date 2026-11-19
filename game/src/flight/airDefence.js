// The air guard of Marazul: the closed sea's boundary (warned, violated, weapons free, brought down
// at the hard limit; nothing while the flag sea.open is set), the Halcón interceptor pair (scramble
// from the alert pads of Punta Garza, intercept, formate on the lead's wing, order by radio, escort
// if he complies, warning shots and fire if he does not, search when the track is lost, give up at
// the border) and the air wanted level with its corner of the flight HUD.
//
// Members: wanted (0 none, 1 watched, 2 intercepted, 3 weapons free); stage ('idle' | 'scramble' |
//   'intercept' | 'formate' | 'order' | 'escort' | 'warningShots' | 'fire' | 'searching' |
//   'returning'); reason ('boundary' | 'stolenAircraft' | 'alert' | 'command' | 'stage' | null);
//   interceptors ([{id, callsign, x, y, z, heading (compass radians), speed, bank, pitch, phase,
//   stage}], live objects: read, do not keep); boundaryState ('inside' | 'warned' | 'violated' |
//   'open'); boundaryDistance (metres to fly back inside, 0 inside); trackSource ('guidance' |
//   'own' | null); slotDistance (metres from Halcón Uno to his station); scramble(reason) ->
//   boolean; standDown(reason).
// Commands: AIR_DEFENCE_SCRAMBLE {reason?} -> boolean, AIR_DEFENCE_STAND_DOWN {reason?}.
// Flags read: sea.open, air.defenceAlert (relentless: compliance does not help), air.defenceOff
//   (silent, pair gone), radar.towerDestroyed (no ground guidance), base.officerAccess.
// Publishes: AIRSPACE_BOUNDARY_CHANGED, AIR_WANTED_CHANGED, AIR_INTERCEPT_STAGE_CHANGED,
//   AIRCRAFT_SHOT_DOWN, RADIO_MESSAGE (channels 'airspace' and 'airGuard'; lineIds in
//   flight/defence/airGuardTuning.js), and UI_SHOW_SUBTITLE / EFFECT_SPAWN commands.
// Listens: PLAYER_WASTED, NEW_GAME_STARTED, SAVE_LOADED (all reset it; nothing is saved).
// Captures: ?stage=boundary | intercept | wing | shots with ?aircraft=...&air=...
// Implementation: flight/defence/airGuardRuntime.js and its neighbours.

/**
 * Creates the air defence system.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {import('../core/systems/gameSystemContract.js').GameSystem}
 */
export function createAirDefenceSystem(context) {
  let guard = null;

  return {
    name: 'airDefence',
    dependsOn: ['vehicles'],

    /** 0 none, 1 watched, 2 intercepted, 3 weapons free. */
    get wanted() { return guard ? guard.wanted : 0; },
    /** The interception stage. */
    get stage() { return guard ? guard.stage : 'idle'; },
    /** Why the pair is up, or null. */
    get reason() { return guard ? guard.reason : null; },
    /** The two interceptors' live states. */
    get interceptors() { return guard ? guard.interceptors : []; },
    /** 'inside' | 'warned' | 'violated' | 'open'. */
    get boundaryState() { return guard ? guard.boundaryState : 'inside'; },
    /** Metres to fly back to be inside the boundary again (0 when inside). */
    get boundaryDistance() { return guard ? guard.boundary.distanceToReturn : 0; },
    /** 'guidance' | 'own' | null: how the pair holds the lead. */
    get trackSource() { return guard ? guard.trackSource : null; },
    /** Metres from Halcón Uno to his station beside the lead (Infinity when he flies none). */
    get slotDistance() { return guard ? guard.slotDistance : Infinity; },
    /** Sends the pair after the lead now; false when it is already up or the guard is off. */
    scramble: (reason) => (guard ? guard.scramble(reason) : false),
    /** Sends the pair home and clears the air wanted level. */
    standDown: (reason) => { if (guard) guard.standDown(reason); },

    async init() {
      const { createAirGuardRuntime } = await import('./defence/airGuardRuntime.js');
      guard = createAirGuardRuntime(context);
    },

    update(deltaSeconds) {
      if (guard) guard.update(deltaSeconds);
    },

    dispose() {
      if (guard) guard.dispose();
      guard = null;
    },
  };
}

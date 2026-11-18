// Police dispatch: the response to the wanted level. Sends officers on foot and police cars
// (cruisers today; the SUV and tactical van use the cruiser until their models exist) from the
// nearest station or out of sight behind the lead, drives the pursuit on the lane graph and off it
// to ram and box in, flashes the light bars, lets crews out to draw, aim and arrest, sets up
// roadblocks at three stars, and runs the arrest (busted) at one or two stars. The work is in
// policeDispatchRuntime.js and its neighbours (pursuitDriving, officerBehaviour, roadblocks,
// sirenLights, arrestRules, policeUnitKinds); the showcase scene `police-chase` is in
// policeChaseShowcase.js. Its contract is docs/ARCHITECTURE.md, "policeDispatch".
//
// Members: playerSeen (true while any unit sees the lead; the wanted level reads it), units
//   [{id, kind, vehicleId, entity, crew, leaving}], officers, arrestProgress (0..1),
//   spawnUnit(unitKind, position?, heading?) -> unitId, removeAll().
// Command: POLICE_SPAWN_UNIT. Publishes POLICE_UNIT_DISPATCHED, POLICE_SPOTTED_PLAYER, PLAYER_BUSTED
// (until the player system takes the arrest over through a `bust()` member).

/**
 * Creates the police dispatch system.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {import('../core/systems/gameSystemContract.js').GameSystem}
 */
export function createPoliceDispatchSystem(context) {
  let runtime = null;

  return {
    name: 'policeDispatch',
    dependsOn: ['wantedLevel', 'vehicles', 'openWorldCity'],

    async init(progress) {
      const [{ createPoliceDispatchRuntime }, { registerPoliceChaseShowcase }] = await Promise.all([
        import('./policeDispatchRuntime.js'),
        import('./policeChaseShowcase.js'),
      ]);
      runtime = createPoliceDispatchRuntime(context);
      registerPoliceChaseShowcase(context);
      progress(1, 'police dispatch');
    },

    start() {
      runtime.start();
    },

    fixedUpdate(stepSeconds) {
      runtime.fixedUpdate(stepSeconds);
    },

    update(deltaSeconds) {
      runtime.update(deltaSeconds);
    },

    dispose() {
      runtime?.dispose();
    },

    get playerSeen() { return runtime ? runtime.playerSeen : false; },
    get units() { return runtime ? runtime.units : []; },
    get officers() { return runtime ? runtime.officers : []; },
    get arrestProgress() { return runtime ? runtime.arrestProgress ?? 0 : 0; },
    spawnUnit: (unitKind, position, heading) => (runtime ? runtime.spawnUnit(unitKind, position, heading) : null),
    removeAll: () => runtime?.removeAll(),
  };
}

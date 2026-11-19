// POINT OF NO RETURN, mission 17 of 17: the story's last flight. A midnight call from a buyer who
// knows what Dez Tolliver once was; the garage sealed by the bank; a forged pass in the name of
// Lt. Ramiro Osorio; the gate of Base Aérea Punta Garza at 05:40 and the walk across a base where
// one wrong move blows the cover; a dark hangar, the doors parting on the dawn; the walk-out and
// the choice of aircraft (Manta Sombra or Garza Negra) and mode (SIMULATION or ASSISTED); a
// three-minute window to get airborne; the radar on Cabo Lejano; the Halcón interceptors and the
// memory they bring back; the navy picket; three hours of sea; the Norvast island at dawn; the
// handover. Five checkpoints, a fail screen with "Retry from checkpoint" and "Restart mission",
// the epilogue and credits, then free roam as Sol.
// Commands: FINAL_MISSION_START {stage?, checkpoint?, aircraftId?, flightMode?}, FINAL_MISSION_RETRY.
// Publishes: FINAL_MISSION_STAGE_CHANGED, _CHECKPOINT_REACHED, _SUSPICION_CHANGED, _ENDED,
//   STORY_STATE_CHANGED, and the MISSION_* events the HUD already draws.
// Members: active, arc ('idle' | 'running' | 'failed' | 'completed'), stage, checkpoint, failed
//   (the reason id while the fail screen is up), suspicion, aircraftId, flightMode, data, rt (the
//   object the stage controllers get), startArc(options), retry(options), fail(reasonId).
// Saved as { arc, stage, checkpoint, aircraftId, flightMode, data }; a save made mid-mission
//   resumes at its last checkpoint.
// Launch: ?mission=final, &checkpoint=1..5, &finalstage=<stage id>, &plane=<aircraft id>, &flightmode=.
// In normal play the arc begins by itself: mission 16 done, Dez in free roam, 22:00 to 04:00, 20 s.
// Stages: story/final/finalMissionStages.js; runtime: story/final/finalMissionRuntime.js; stage
// controllers: story/final/stages/<stage id>.js.

/**
 * Creates the final mission system.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {import('../core/systems/gameSystemContract.js').GameSystem}
 */
export function createPointOfNoReturnSystem(context) {
  let runtime = null;
  /** A save restored before init finished. */
  let waiting;

  return {
    name: 'finalMission',
    get active() { return runtime ? runtime.machine.active : false; },
    get arc() { return runtime ? runtime.machine.arc : 'idle'; },
    get stage() { return runtime ? runtime.machine.stage : null; },
    get checkpoint() { return runtime ? runtime.machine.checkpoint : 0; },
    get failed() { return runtime ? runtime.machine.failReason : null; },
    get suspicion() { return runtime ? runtime.machine.data.suspicion : 0; },
    get aircraftId() { return runtime ? runtime.machine.data.aircraftId : null; },
    get flightMode() { return runtime ? runtime.machine.data.flightMode : null; },
    get data() { return runtime ? runtime.machine.data : null; },
    get rt() { return runtime ? runtime.rt : null; },
    // Not named start(): that is the engine's lifecycle hook, and it would begin the arc at every boot.
    startArc: (options) => (runtime ? runtime.start(options ?? {}) : false),
    retry: (options) => (runtime ? runtime.retry(options ?? {}) : false),
    fail: (reasonId) => { if (runtime) runtime.rt.fail(reasonId); },

    async init(progress) {
      const { createFinalMissionRuntime } = await import('./final/finalMissionRuntime.js');
      runtime = createFinalMissionRuntime(context);
      runtime.begin();
      if (waiting !== undefined) { runtime.restore(waiting); waiting = undefined; }
      progress(1, 'final mission');
    },

    update(deltaSeconds) {
      if (runtime) runtime.update(deltaSeconds);
    },

    serialise() { return runtime ? runtime.serialise() : null; },
    restore(data) {
      if (runtime) runtime.restore(data); else waiting = data;
    },

    dispose() {
      if (runtime) runtime.dispose();
      runtime = null;
    },
  };
}

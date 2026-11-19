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
// Members: active, stage, checkpoint, suspicion, aircraftId, flightMode, takeoffSecondsLeft.
// Saved as { arc, stage, checkpoint, aircraftId, flightMode, completed }.
// Launch: ?mission=final, &checkpoint=1..5, &finalstage=<stage id>, &plane=<aircraft id>.
// Stages: story/final/finalMissionStages.js; runtime: story/final/finalMissionRuntime.js.

/**
 * Creates the final mission system.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {import('../core/systems/gameSystemContract.js').GameSystem}
 */
export function createPointOfNoReturnSystem(context) {
  void context;
  return {
    name: 'finalMission',
    get active() { return false; },
    get stage() { return null; },
    async init(progress) { progress(1, 'final mission'); },
    update() {},
    dispose() {},
  };
}

// The stages of the final arc and of mission 17, "POINT OF NO RETURN", in order, with the five
// checkpoints the owner fixed and what a retry returns to. Pure data and functions: no three, no
// DOM. The runtime (finalMissionRuntime.js) walks this list; each stage has a controller in
// story/final/stages/ (enter, update, exit).
//
// kind: 'scene' (a cinematic, skippable), 'play' (the player acts), 'call' (the phone), 'choice'
// (a screen), 'end'. `mission` is false for the prologue (before the HUD says MISSION 17/17).

/** @typedef {{id: string, kind: 'scene'|'play'|'call'|'choice'|'end', mission: boolean, checkpoint?: number, scene?: string, flying?: boolean, objective?: string}} FinalStage */

/** @type {ReadonlyArray<FinalStage>} */
export const FINAL_STAGES = Object.freeze([
  { id: 'midnight_call', kind: 'scene', mission: false, scene: 'midnight_call' },
  { id: 'the_decision', kind: 'scene', mission: false, scene: 'the_decision' },
  { id: 'new_face', kind: 'scene', mission: false, scene: 'new_face' },
  { id: 'insider_call', kind: 'call', mission: false, objective: 'Answer the phone' },
  { id: 'gate', kind: 'play', mission: true, checkpoint: 1, objective: 'Show your pass at the gate of Base Aérea Punta Garza' },
  { id: 'cross_the_base', kind: 'play', mission: true, objective: 'Walk to hangar two. Do not run. Return salutes.' },
  { id: 'hangar_reveal', kind: 'scene', mission: true, scene: 'hangar_reveal' },
  { id: 'walk_out', kind: 'scene', mission: true, scene: 'walk_out' },
  { id: 'choose_aircraft', kind: 'choice', mission: true },
  { id: 'boarding', kind: 'scene', mission: true, scene: 'boarding' },
  { id: 'takeoff_window', kind: 'play', mission: true, checkpoint: 2, flying: true, objective: 'Take off from runway 27 before the window closes' },
  { id: 'blind_radar', kind: 'play', mission: true, checkpoint: 3, flying: true, objective: 'Take the Cabo Lejano radar off the air' },
  { id: 'interception', kind: 'play', mission: true, flying: true, objective: 'Lose the air patrol' },
  { id: 'stealth_test', kind: 'play', mission: true, checkpoint: 4, flying: true, objective: 'Slip past the navy picket unseen' },
  { id: 'time_skip', kind: 'scene', mission: true, flying: true, scene: 'time_skip' },
  { id: 'dawn_approach', kind: 'play', mission: true, checkpoint: 5, flying: true, objective: 'Land on the hidden strip of the Norvast island' },
  { id: 'handover', kind: 'scene', mission: true, scene: 'handover' },
  { id: 'epilogue', kind: 'scene', mission: true, scene: 'epilogue' },
  { id: 'free_roam', kind: 'end', mission: false },
].map((stage) => Object.freeze(stage)));

/** Stage ids in order. */
export const FINAL_STAGE_ORDER = Object.freeze(FINAL_STAGES.map((stage) => stage.id));

/** The stage each checkpoint (1 to 5) restarts from. */
export const FINAL_CHECKPOINTS = Object.freeze(Object.fromEntries(
  FINAL_STAGES.filter((stage) => stage.checkpoint).map((stage) => [stage.checkpoint, stage.id]),
));

/** Why the mission fails, by reason id: the fail screen's line. */
export const FINAL_FAIL_REASONS = Object.freeze({
  exposed: 'Your cover is blown',
  weapon_drawn: 'An officer does not draw a weapon on his own base',
  window_closed: 'The real Osorio got through. The runway is blocked.',
  crashed: 'The aircraft is lost',
  shot_down: 'Shot down',
  caught: 'Forced down by the interceptors',
  missile: 'The picket ship\'s missile found you',
  turned_back: 'You turned back',
  bad_landing: 'The aircraft did not survive the landing',
  off_strip: 'You missed the strip',
  lead_dead: 'Flatlined',
});

/**
 * The stage entry for an id, or null.
 * @param {string} stageId
 * @returns {FinalStage | null}
 */
export function finalStage(stageId) {
  return FINAL_STAGES.find((stage) => stage.id === stageId) ?? null;
}

/**
 * The stage after `stageId`, or null after the last.
 * @param {string} stageId
 * @returns {string | null}
 */
export function nextFinalStage(stageId) {
  const index = FINAL_STAGE_ORDER.indexOf(stageId);
  return index === -1 || index === FINAL_STAGE_ORDER.length - 1 ? null : FINAL_STAGE_ORDER[index + 1];
}

/**
 * The last checkpoint reached at or before a stage (0 in the prologue).
 * @param {string} stageId
 * @returns {number}
 */
export function checkpointOfStage(stageId) {
  const index = FINAL_STAGE_ORDER.indexOf(stageId);
  let reached = 0;
  for (let i = 0; i <= index; i += 1) if (FINAL_STAGES[i].checkpoint) reached = FINAL_STAGES[i].checkpoint;
  return reached;
}

/**
 * Where a retry begins: the stage of the last checkpoint ('checkpoint', the default) or the first
 * stage of the mission ('start': checkpoint 1; the prologue is not replayed).
 * @param {string} failedStageId
 * @param {'checkpoint' | 'start'} [from]
 * @returns {string}
 */
export function retryStage(failedStageId, from = 'checkpoint') {
  if (from === 'start') return FINAL_CHECKPOINTS[1];
  const checkpoint = checkpointOfStage(failedStageId);
  return FINAL_CHECKPOINTS[checkpoint] ?? FINAL_STAGE_ORDER[0];
}

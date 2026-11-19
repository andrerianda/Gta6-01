// The generic stage of kind 'scene': plays the stage's cinematic (the `scene` field of
// FINAL_STAGES) with the chosen aircraft as a parameter, then goes on. A scene that is not
// registered resolves at once, so the mission never waits on a missing cinematic.
import { finalStage } from '../finalMissionStages.js';

/**
 * @param {object} rt The mission runtime's `rt`.
 */
export function createSceneStage(rt) {
  let alive = false;
  return {
    enter() {
      alive = true;
      const stage = finalStage(rt.stage);
      rt.playScene(stage?.scene ?? rt.stage, { aircraftId: rt.data.aircraftId }).then(() => {
        // One beat of game time, so a skipped or missing scene does not chain stages inside one frame.
        if (alive) rt.after(0.2, () => rt.next());
      });
    },
    update() {},
    exit() { alive = false; },
  };
}

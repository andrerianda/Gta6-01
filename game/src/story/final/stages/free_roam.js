// The end of the arc: the credits have rolled and the city goes on without Dez. Every story flag
// is cleared (the base is closed again, the sea too), the mission aircraft is gone, it is an
// ordinary morning, and the player is Sol Arrieta at her usual place in the city. One parcel
// arrives with no sender. The arc is marked completed and saved.
import { GAME_COMMANDS } from '../../../core/events/gameCommands.js';
import { GAME_EVENTS } from '../../../core/events/gameEvents.js';
import { clearStoryFlags } from '../finalCheckpoints.js';
import { stagingSpot } from '../../../player/onFootShowcase.js';

/** The parcel's note. */
export const PARCEL_NOTE = 'A parcel with no sender. Inside: a pilot\'s watch, stopped at 05:52.';
/** The hour the city wakes to. */
const MORNING_HOURS = 9.5;

/**
 * @param {object} rt The mission runtime's `rt`.
 */
export function createFreeRoamStage(rt) {
  const { context } = rt;
  const run = (name, payload) => (context.commands.has(name) ? context.commands.run(name, payload) : undefined);

  return {
    enter() {
      run(GAME_COMMANDS.STORY_LINES_STOP, {});
      run(GAME_COMMANDS.AIR_DEFENCE_STAND_DOWN, { reason: 'mission' });
      run(GAME_COMMANDS.WANTED_CLEAR, { reason: 'mission' });
      clearStoryFlags(rt.flags);
      run(GAME_COMMANDS.RADAR_EMITTER_RESTORE, {});
      rt.setStoryState({ alarm: false, betrayed: false });
      // Where the game itself begins a day on foot: the pavement of the Gran Vía.
      let spot = { x: 0, z: 0, heading: 0 };
      try { spot = stagingSpot(context, 0.42); } catch { /* the city centre will do */ }
      // On foot first (out of the aircraft), then the aircraft leaves the world, then the lead becomes Sol.
      rt.leadOnFoot(spot);
      rt.removeAircraft();
      run(GAME_COMMANDS.PLAYER_HEAL, { health: 100 });
      run(GAME_COMMANDS.PLAYER_SWITCH_CHARACTER, { characterId: 'sol_arrieta' });
      rt.leadOnFoot(spot);
      rt.setClock(MORNING_HOURS, 'clear');
      rt.objective('', null);
      rt.timer(null);
      rt.after(2.5, () => {
        rt.notify(PARCEL_NOTE);
        rt.next(); // after the last stage: the machine marks the arc completed
        run(GAME_COMMANDS.SAVE_WRITE, { reason: 'finalMission' });
        context.events.emit(GAME_EVENTS.FINAL_MISSION_ENDED, { outcome: 'completed' });
      });
    },
    update() {},
    exit() {},
  };
}

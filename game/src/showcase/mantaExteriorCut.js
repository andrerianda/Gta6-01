// The exterior picture, scene `manta-exterior-cut`: the mission's own short cinematic cut "takeoff
// at dawn" (story/scenes/flightCuts.js, `cut_takeoff`) on the mission's own aircraft. Mission 17 is
// running at its stage `takeoff_window` (checkpoint 2); the stolen Manta Sombra is just off runway
// 27 of Base Aérea Punta Garza where the causeway leaves the shore, wheels still down, nose coming
// up; the cut's camera ship rides beside it on a long lens, the low sun on the aircraft and the base
// behind (the air guard's Halcón pair still stands on its alert pads there).
// What the scene decides and the mission does not: the clock (see DAWN_HOURS), where along the
// runway the aircraft has left the ground (the takeoff roll itself is not played), and that the
// cut begins here, a moment before the mission would start it at 30 m.
import { GAME_COMMANDS } from '../core/events/gameCommands.js';
import { PUNTA_GARZA_AIR_BASE, puntaGarzaToWorld } from '../catalog/puntaGarzaAirBase.js';
import { dawnHours, flyMissionAircraftAt, startFinalArc } from './finalArcStaging.js';

/** How far along runway 27 the aircraft is when it is put in the air (0 east threshold, 1 west end). */
const ALONG = 0.5;
/** Its height over the runway there, its speed and its climb, metres and metres per second. */
const LIFT_OFF = Object.freeze({ height: 7, speed: 66, climb: 3.5 });
/** Seconds of flight before the cut begins, and into the cut at the picture. */
const SECONDS = Object.freeze({ before: 0.5, cut: 1.6 });
const wallClock = (milliseconds) => new Promise((resolve) => { setTimeout(resolve, milliseconds); });

/**
 * Registers the scene.
 * @param {object} context The game context.
 * @returns {() => void} Removes the scene again.
 */
export function registerMantaExteriorCut(context) {
  return context.showcase.register({
    name: 'manta-exterior-cut',
    title: 'Point of no return: takeoff at dawn',
    description: 'The exterior cut of mission 17: the stolen Manta Sombra just off the runway of Punta Garza at dawn, wheels still down, the base behind it.',
    async run(game, tools) {
      const { commands, input } = game;
      const launch = game.launch ?? {};
      const query = new URLSearchParams(globalThis.location?.search ?? '');
      const aircraftId = launch.plane ?? 'manta_sombra';
      const mission = await startFinalArc(game, { checkpoint: 2, aircraftId, flightMode: launch.flightMode ?? 'casual' });
      if (!mission) return;
      commands.run(GAME_COMMANDS.TIME_SET, { hours: dawnHours() });

      const runway = PUNTA_GARZA_AIR_BASE.runway;
      const along = Number(query.get('along')) > 0 && Number(query.get('along')) < 1 ? Number(query.get('along')) : ALONG;
      const spot = puntaGarzaToWorld(runway.from[0] + (runway.to[0] - runway.from[0]) * along, runway.from[1] + (runway.to[1] - runway.from[1]) * along);
      const craft = await flyMissionAircraftAt(game, tools, {
        x: spot.x, z: spot.z, y: PUNTA_GARZA_AIR_BASE.groundHeight + LIFT_OFF.height, heading: runway.heading,
        speed: LIFT_OFF.speed, climb: LIFT_OFF.climb, gearDown: true,
      });
      if (!craft) return;
      input.setVirtual('throttleUp', true);
      input.setVirtual('pitchUp', true);
      tools.advance(SECONDS.before);
      input.setVirtual('pitchUp', false);

      const cinematics = game.systems.find('cinematics');
      if (!cinematics || typeof cinematics.play !== 'function') return;
      if (commands.has(GAME_COMMANDS.STORY_LINES_STOP)) commands.run(GAME_COMMANDS.STORY_LINES_STOP, {});
      cinematics.play('cut_takeoff', { aircraftId, view: query.get('view') ?? undefined });
      for (let i = 0; i < 100 && cinematics.playing !== 'cut_takeoff'; i += 1) await wallClock(20);
      await wallClock(60);
      tools.advance(SECONDS.cut);
      input.setVirtual('throttleUp', false);
      if (commands.has(GAME_COMMANDS.STORY_LINES_STOP)) commands.run(GAME_COMMANDS.STORY_LINES_STOP, {});
    },
  });
}

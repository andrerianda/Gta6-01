// The flight picture, scene `manta-cockpit-dawn`: mission 17, POINT OF NO RETURN, a minute after
// the stolen Manta Sombra left runway 27 of Base Aérea Punta Garza. It reads as a theft and an
// escape, never as a fight (the owner's rule for the judged set): the aircraft runs low over the
// sea at dawn, the base and its alarm behind it, the air guard's Halcón pair far behind on its
// trail (blips on the radar display, nothing of them in the glass) and, held back there, already
// past the border of the open sea, so it breaks off by its own rule (the HUD's chevron reads
// WATCHED: the patrol is being lost), and Coronel Vargas on the radio in red ordering the thief home. No weapon, lock, target box or
// targeting screen is in the picture.
// The mission itself is running at its stage `blind_radar` (checkpoint 3, ASSISTED): its HUD label,
// its alarm, its radio line (al_02 of the script through the story's subtitles). The aircraft is in
// the game's own cockpit view (the flight camera decides eye, field of view and light; nothing of
// the cockpit is set here), in a shallow left turn with the low sun ahead and to the left.
// What the scene decides and the mission does not: the clock (see DAWN_HOURS), the place, height
// and heading; the air guard released one stage early (the mission sends the pair one stage
// later, by the same command) and held two and a half kilometres back on the trail; Vargas's order
// repeated at this moment; the stage's targeting hint put away and the objective worded as the
// owner wrote it for this picture (OBJECTIVE) instead of the stage's radar-tower objective.
import { GAME_COMMANDS } from '../core/events/gameCommands.js';
import { WORLD_FLAGS } from '../core/state/worldFlags.js';
import { dawnHours, flyMissionAircraftAt, startFinalArc, sunBearing } from './finalArcStaging.js';

/** Where the picture is taken (world metres, height above the sea): low over the water west of the base. */
const PLACE = Object.freeze({ x: -5645, z: -2800, y: 140, speed: 132, climb: 0.5 });
/**
 * Degrees the sun stands to the left of the nose when the aircraft is placed (the turn brings it
 * a degree or two closer): just out of the lens, the sky ahead still golden.
 */
const SUN_LEFT_OF_NOSE = 49;
/** The heading when the atmosphere does not say where the sun is. */
const FALLBACK_HEADING = 128;
/** The radio line on screen. */
const RADIO_LINE = 'al_02';
/** The objective on the HUD: the owner's words for this picture (a theft and a getaway). */
const OBJECTIVE = 'Steal the bomber and lose the air patrol';
/**
 * Seconds of flight before the air guard is sent, while the pair runs on the trail, of the roll
 * into the turn, of the stick held back, and from the stick's release to the picture. Ten seconds
 * in all: the key hint of a pilot just seated (8 s) has left the HUD by then.
 */
const FLY = Object.freeze({ before: 2.4, trail: 5.2, turn: 0.6, pull: 0.5, ease: 1.0 });
/** Metres the pair is held behind the stolen aircraft on its trail, and between the two of them. */
const PURSUIT = Object.freeze({ behind: 2500, spacing: 220, above: 60 });

/**
 * Registers the scene.
 * @param {object} context The game context.
 * @returns {() => void} Removes the scene again.
 */
export function registerMantaCockpitDawn(context) {
  return context.showcase.register({
    name: 'manta-cockpit-dawn',
    title: 'Point of no return: the Manta Sombra at dawn',
    description: 'Mission 17 from the cockpit of the stolen Manta Sombra, escaping low over the sea at dawn: the low sun through the glass, the air patrol far behind, Coronel Vargas on the radio in red.',
    async run(game, tools) {
      const { commands, flags, input } = game;
      const launch = game.launch ?? {};
      const mission = await startFinalArc(game, {
        checkpoint: 3, aircraftId: launch.plane ?? 'manta_sombra', flightMode: launch.flightMode ?? 'casual',
      });
      if (!mission) return;
      commands.run(GAME_COMMANDS.TIME_SET, { hours: dawnHours() });
      tools.advance(0.05);
      const sun = sunBearing(game);
      const heading = sun ? (sun.bearing + SUN_LEFT_OF_NOSE) % 360 : FALLBACK_HEADING;
      const craft = await flyMissionAircraftAt(game, tools, { ...PLACE, heading });
      if (!craft) return;
      game.systems.find('followCamera')?.setFlightView?.('cockpit');
      tools.advance(FLY.before);

      // The pair is sent after him the way the mission's interception sends it (reason 'mission'),
      // its orders and its guns held, and kept far back on his trail: a pursuit, not a dogfight.
      const guard = game.systems.find('airDefence');
      if (guard && commands.has(GAME_COMMANDS.AIR_DEFENCE_SCRAMBLE)) {
        flags.set(WORLD_FLAGS.AIR_DEFENCE_OFF, false);
        commands.run(GAME_COMMANDS.AIR_DEFENCE_SCRAMBLE, { reason: 'mission' });
        commands.run(GAME_COMMANDS.AIR_DEFENCE_SCRAMBLE, { holdFire: 600 });
        tools.advance(0.05);
        holdPursuitBehind(guard, craft);
        await tools.whenIdle();
        tools.advance(FLY.trail);
      }

      // A shallow left turn, eased off so the picture holds a few degrees of bank.
      input.setVirtual('rollLeft', true);
      input.setVirtual('pitchUp', true);
      tools.advance(Math.min(FLY.pull, FLY.turn));
      input.setVirtual(FLY.pull < FLY.turn ? 'pitchUp' : 'rollLeft', false);
      tools.advance(Math.abs(FLY.turn - FLY.pull));
      input.setVirtual('pitchUp', false);
      input.setVirtual('rollLeft', false);
      if (guard) holdPursuitBehind(guard, craft);
      tools.advance(FLY.ease);

      // The order on the radio; the stage's first hint (it teaches the targeting screen) put away,
      // and the objective as the owner worded it. The stage shows a hint only when its key changes,
      // and nothing changes before the picture.
      if (commands.has(GAME_COMMANDS.STORY_LINE_SPEAK)) commands.run(GAME_COMMANDS.STORY_LINE_SPEAK, { lineId: RADIO_LINE, hold: true });
      mission.rt?.hint?.(null);
      mission.rt?.objective?.(OBJECTIVE);
      tools.advance(1 / 60);
    },
  });
}

/** Seconds in the seat before the apron picture: the pilot's key hint (8 s) has left the HUD by then. */
const SEATED_SECONDS = 9;

/**
 * Registers the owner's (not judged) cockpit picture on the ground, scene `manta-cockpit-apron`:
 * mission 17 at checkpoint 2, the pilot seated in the aircraft on its stand on the apron of Punta
 * Garza with the engines running and the three-minute window counting, at dawn (the clock set on
 * to DAWN_HOURS, `&hours=` for another moment; the mission's own 05:50 is before sunrise). The
 * flight camera's own cockpit view; `&plane=garza_negra` gives the Garza Negra's cockpit.
 * @param {object} context The game context.
 * @returns {() => void} Removes the scene again.
 */
export function registerMantaCockpitApron(context) {
  return context.showcase.register({
    name: 'manta-cockpit-apron',
    title: 'Point of no return: in the seat at dawn',
    description: 'Mission 17 from the cockpit on the apron of Punta Garza at dawn, engines running, the takeoff window counting.',
    async run(game, tools) {
      const launch = game.launch ?? {};
      const mission = await startFinalArc(game, {
        checkpoint: 2, aircraftId: launch.plane ?? 'manta_sombra', flightMode: launch.flightMode ?? 'casual',
      });
      if (!mission) return;
      game.commands.run(GAME_COMMANDS.TIME_SET, { hours: dawnHours() });
      tools.advance(0.05);
      await tools.whenIdle();
      game.systems.find('followCamera')?.setFlightView?.('cockpit');
      tools.advance(SEATED_SECONDS);
      await tools.whenIdle();
      tools.advance(1 / 60);
    },
  });
}

/**
 * Puts the air guard's pair on the stolen aircraft's trail, PURSUIT.behind metres back along its
 * course (out of the pilot's sight; on the radar display), at its speed, so it does not join him
 * before the picture. From the picture's place that is beyond the air guard's border (7 km from
 * the chart's centre), where the pair turns back by itself.
 * @param {object} guard The air-defence system.
 * @param {object} craft The mission aircraft.
 */
function holdPursuitBehind(guard, craft) {
  const state = craft.car?.state;
  const at = craft.root?.position;
  if (!state || !at || !Number.isFinite(state.heading)) return;
  const heading = state.heading;
  const speed = Math.hypot(craft.car.body?.linearVelocity?.x ?? 0, craft.car.body?.linearVelocity?.z ?? 0) || 130;
  (guard.interceptors ?? []).forEach((jet, index) => {
    if (!jet || jet.phase !== 'air') return;
    const back = PURSUIT.behind + index * PURSUIT.spacing;
    const side = (index === 0 ? -1 : 1) * 40;
    jet.x = at.x - Math.sin(heading) * back + Math.cos(heading) * side;
    jet.z = at.z + Math.cos(heading) * back + Math.sin(heading) * side;
    jet.y = at.y + PURSUIT.above;
    jet.heading = heading;
    jet.speed = speed;
    jet.bank = 0;
    jet.pitch = 0;
    jet.verticalSpeed = 0;
    jet.stationed = false;
  });
}

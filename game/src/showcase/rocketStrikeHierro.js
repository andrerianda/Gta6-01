// The rocket picture, scene `rocket-strike-hierro` (owner, 12:40: judged picture 2 becomes a
// rocket-launcher hit): late afternoon in Barrio Hierro, the lead in the game's own aim view with
// the rocket launcher on his right shoulder in its own stance; his rocket is in flight with its
// smoke trail across the street and the loading crew's SUV ahead of it is blowing up (the fleet's
// real explosion: fireball, debris, light). Around the SUV the armed crew raise their guns at him,
// passers-by run, the HUD shows the mission objective, two wanted stars and the minimap.
import { GAME_COMMANDS } from '../core/events/gameCommands.js';
import { openScene, placeLead } from './showcaseStaging.js';
import { clearAroundLead, hierroStreet, standCrew } from './missionFirefight.js';

/** The mission shown and the objective it is at (missions' 'firefight' moment). */
const MISSION = Object.freeze({ missionId: 'm05_night_shift', startIndex: 1 });
/** Late afternoon, the sun still well up (the cover already has the golden hour and a burning wreck). */
const HOURS = 17.1;
/** Which Barrio Hierro street and where along it (the firefight's brick warehouse block). */
const STREET = Object.freeze({ pick: 0, along: 0.47 });
/** The crew's SUV across the far lane: [ahead, from the centre line, turn of its nose]. */
const SUV = Object.freeze([13, -3.6, 1.2]);
/** The crew round it: [ahead, from the centre line]; mark 1 crouches at its end. */
const CREW = Object.freeze([[9.6, -5.6], [16.4, -4.4], [10.8, -7.2], [15.2, -6.8], [8.6, -6.4]]);
const CROUCHED = Object.freeze([1]);
/**
 * Seconds of the rocket's flight before the SUV goes up, and seconds of the blast before the
 * picture (`&flight=`, `&blast=` for takes). Shift 11 take r3 (luminance 114): a young fireball with
 * debris; later (r1, 0.16 + 0.14) the launcher's back-blast dust already fills the right half.
 */
const FLIGHT_SECONDS = 0.04;
const BLAST_SECONDS = 0.12;
/** Wanted stars on the HUD (the gang's turf caps gang violence at 2). */
const WANTED = 2;

/**
 * Registers the rocket scene.
 * @param {object} context The game context.
 * @returns {() => void} Removes the scene again.
 */
export function registerRocketStrikeHierro(context) {
  return context.showcase.register({
    name: 'rocket-strike-hierro',
    title: 'A rocket strike in Barrio Hierro',
    description: 'The lead fires the rocket launcher from the aim view; the rocket trails smoke across the street as the gang SUV blows up and the armed crew raise their guns.',
    async run(game, tools) {
      const { commands } = game;
      const query = new URLSearchParams(globalThis.location?.search ?? '');
      const hours = Number(query.get('hours'));
      openScene(game, { hours: hours > 12 && hours < 19 ? hours : HOURS, traffic: 0.3, crowd: 1 });
      const street = hierroStreet(game, numberOr(query.get('pick'), STREET.pick), numberOr(query.get('t'), STREET.along));
      const shift = numberOr(query.get('ahead'), 0);
      const lead = street.at(street.nearSide, 0);
      const suvAt = street.at(SUV[1], SUV[0] + shift);
      const crew = CREW.map(([ahead, side]) => street.at(side, ahead + shift));
      const facing = Math.atan2(suvAt.x - lead.x, -(suvAt.z - lead.z));
      await placeLead(game, tools, lead, -facing);
      if (!(commands.has('missions/moment') && commands.run('missions/moment', { name: 'firefight' })) && commands.has(GAME_COMMANDS.MISSION_START)) {
        commands.run(GAME_COMMANDS.MISSION_START, { ...MISSION, skipIntro: true });
      }
      commands.run(GAME_COMMANDS.PLAYER_GIVE_WEAPON, { weaponId: 'rocket_launcher', ammo: 4 });
      const fleet = game.systems.get('vehicles');
      const suv = fleet?.spawn({
        modelId: 'suv', position: suvAt, heading: street.compass + Math.PI + SUV[2], colour: '#1E2226', parked: true, ownerSystem: 'showcase',
      });
      tools.advance(0.4);
      standCrew(game, crew, lead, CROUCHED);
      clearAroundLead(game, 4);
      game.input.setVirtual('aim', true);
      tools.advance(0.6);
      standCrew(game, crew, lead, CROUCHED);
      tools.advance(0.6);
      standCrew(game, crew, lead, CROUCHED);
      clearAroundLead(game, 3);
      if (commands.has(GAME_COMMANDS.WANTED_SET_LEVEL)) commands.run(GAME_COMMANDS.WANTED_SET_LEVEL, { level: numberOr(query.get('wanted'), WANTED) });
      tools.advance(0.3);
      // Fire; while the rocket is still in the air the SUV goes up (the picture's one instant).
      game.input.setVirtual('attack', true);
      tools.advance(0.06);
      game.input.setVirtual('attack', false);
      tools.advance(numberOr(query.get('flight'), FLIGHT_SECONDS));
      if (suv !== undefined && suv !== null && typeof fleet?.damage === 'function') fleet.damage(suv, 1e6, 'explosion');
      tools.advance(numberOr(query.get('blast'), BLAST_SECONDS));
      if (commands.has('effects/freeze')) commands.run('effects/freeze', { after: 0 });
    },
  });
}

/** A number from the page query, or the fallback. */
function numberOr(given, fallback) {
  const value = Number(given);
  return given !== null && Number.isFinite(value) ? value : fallback;
}

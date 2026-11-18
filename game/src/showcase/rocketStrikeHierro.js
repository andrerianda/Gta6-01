// The rocket picture, scene `rocket-strike-hierro` (owner, 12:40: judged picture 2 becomes a
// rocket-launcher hit): late afternoon in Barrio Hierro, the lead in the game's own aim view with
// the rocket launcher on his right shoulder in its own stance; his rocket is in flight with its
// smoke trail across the street and the loading crew's SUV ahead of it is blowing up (the fleet's
// real explosion: fireball, debris, light). Around the SUV the armed crew raise their guns at him,
// passers-by run, the HUD shows the mission objective, two wanted stars and the minimap.
import { GAME_COMMANDS } from '../core/events/gameCommands.js';
import { cutCamera, groundAt, openScene, placeLead } from './showcaseStaging.js';
import { clearAroundLead, hierroStreet, standCrew } from './missionFirefight.js';

/**
 * The mission shown and the objective it is at: story mission 12, "Past Due", at "Defend Tolliver
 * Tow" (the Circle's cars come for the Tolliver garage in Barrio Hierro by day; m05 "Night Shift"
 * read wrong in afternoon light). `&mission=firefight` shows the old 'firefight' moment instead.
 */
const MISSION = Object.freeze({ missionId: 'm12_past_due', startIndex: 1 });
/** The lead's cash by the twelfth mission (shown on the HUD instead of the new game's $2,000). */
const CASH = 96350;
/** Late afternoon, the sun still well up (the cover already has the golden hour and a burning wreck). */
const HOURS = 17.1;
/** Which Barrio Hierro street and where along it (the firefight's brick warehouse block). */
const STREET = Object.freeze({ pick: 0, along: 0.47 });
/** The crew's SUV across the far lane: [ahead, from the centre line, turn of its nose]. */
const SUV = Object.freeze([13, -3.6, 1.2]);
/**
 * The crew round it: [ahead, from the centre line]; mark 1 crouches. Three stand on the far pavement in
 * front of the SUV, two out on the road beside it (right of the fireball in the picture, off the rocket's line).
 */
const CREW = Object.freeze([[9.6, -5.6], [12.2, 0.6], [10.8, -7.2], [14.6, 1.2], [8.6, -6.4]]);
const CROUCHED = Object.freeze([1]);
/**
 * Seconds of the rocket's flight before the SUV goes up, and seconds of the blast before the
 * picture (`&flight=`, `&blast=` for takes), and how much further along the SUV and crew stand
 * (`&ahead=` metres). Owner 13:45 ("why is it so far"): the SUV stands about 19 m from the lead
 * (ahead 5); flight 0.06 + blast 0.22 (s13/d3) give a fuller fireball while the rope stays short of the SUV.
 */
const AHEAD_METRES = 5;
const FLIGHT_SECONDS = 0.06;
const BLAST_SECONDS = 0.22;
/** Where the lead stands: metres from the centre line (the near lane, so the side camera stays on the street). */
const LEAD_SIDE = 2;
/**
 * The picture's camera once the rocket is away (owner 13:55, "the camera is very far"): close over the
 * lead's right shoulder like his aim view, about 1.4 m behind the head at neck/shoulder height, the lead
 * large from the waist up (head, launcher, both hands) at the left third, a small side offset so the
 * rocket's rope runs diagonally from the launcher into the frame toward the SUV near the centre.
 * Metres right of and behind the lead along the aim line, height over the ground, the point looked
 * at along the aim line, how far left of it, its height, vertical field of view.
 * `&view=aim` keeps the game's aim camera.
 */
const SIDE_VIEW = Object.freeze({ right: 1.15, back: 1.5, height: 1.65, look: 12, lookLeft: 2.2, lookHeight: 1.5, fieldOfView: 48 });
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
      // Early, so the "+$" change has faded by the picture and only the total shows.
      const cash = game.systems.find('economy')?.cash;
      if (Number.isFinite(cash) && cash < CASH && commands.has(GAME_COMMANDS.ECONOMY_ADD_MONEY)) {
        commands.run(GAME_COMMANDS.ECONOMY_ADD_MONEY, { amount: CASH - cash, reason: 'showcase' });
      }
      const street = hierroStreet(game, numberOr(query.get('pick'), STREET.pick), numberOr(query.get('t'), STREET.along));
      const shift = numberOr(query.get('ahead'), AHEAD_METRES);
      const lead = street.at(numberOr(query.get('leadside'), LEAD_SIDE), 0);
      const suvAt = street.at(SUV[1], SUV[0] + shift);
      const crew = CREW.map(([ahead, side]) => street.at(side, ahead + shift));
      const facing = Math.atan2(suvAt.x - lead.x, -(suvAt.z - lead.z));
      await placeLead(game, tools, lead, -facing);
      if (query.get('mission') === 'firefight' && commands.has('missions/moment')) commands.run('missions/moment', { name: 'firefight' });
      else if (commands.has(GAME_COMMANDS.MISSION_START)) commands.run(GAME_COMMANDS.MISSION_START, { ...MISSION, skipIntro: true });
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
      if (query.get('view') !== 'aim') sideView(game, lead, suvAt, query);
      tools.advance(numberOr(query.get('flight'), FLIGHT_SECONDS));
      if (suv !== undefined && suv !== null && typeof fleet?.damage === 'function') fleet.damage(suv, 1e6, 'explosion');
      tools.advance(numberOr(query.get('blast'), BLAST_SECONDS));
      if (commands.has('effects/freeze')) commands.run('effects/freeze', { after: 0 });
    },
  });
}

/**
 * Holds the camera behind-right of the lead, off the aim line (SIDE_VIEW; `&camright=`, `&camback=`, `&camlook=`,
 * `&camfov=` for takes), looking along the line the rocket flies.
 */
function sideView(game, lead, suvAt, query) {
  const dx = suvAt.x - lead.x;
  const dz = suvAt.z - lead.z;
  const length = Math.hypot(dx, dz) || 1;
  const forward = { x: dx / length, z: dz / length };
  const right = { x: -forward.z, z: forward.x };
  const across = numberOr(query.get('camright'), SIDE_VIEW.right);
  const back = numberOr(query.get('camback'), SIDE_VIEW.back);
  const eye = { x: lead.x + right.x * across - forward.x * back, z: lead.z + right.z * across - forward.z * back };
  const ahead = numberOr(query.get('camlook'), SIDE_VIEW.look);
  const left = numberOr(query.get('camleft'), SIDE_VIEW.lookLeft);
  const look = { x: lead.x + forward.x * ahead - right.x * left, z: lead.z + forward.z * ahead - right.z * left };
  cutCamera(
    game,
    { x: eye.x, y: groundAt(game, eye.x, eye.z) + numberOr(query.get('camheight'), SIDE_VIEW.height), z: eye.z },
    { x: look.x, y: groundAt(game, look.x, look.z) + numberOr(query.get('camlookheight'), SIDE_VIEW.lookHeight), z: look.z },
    numberOr(query.get('camfov'), SIDE_VIEW.fieldOfView),
  );
}

/** A number from the page query, or the fallback. */
function numberOr(given, fallback) {
  const value = Number(given);
  return given !== null && Number.isFinite(value) ? value : fallback;
}

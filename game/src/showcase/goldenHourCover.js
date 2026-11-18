// The cover picture, scene `cover-golden-hour`: a police chase on Bulevar Dorado at golden hour,
// looking west down the beachfront drive into the low sun, through the game's own centred chase
// camera (the owner's rule). The lead's red coupe slides through a handbrake drift with three
// stars, cruisers closing around it with their light bars burning; ahead on the left a police
// cruiser that crashed into the palm median burns, its dark smoke column rising against the
// sunset over the beach and its debris strewn on the road. A story mission's objective ("lose
// them") is on the HUD with the stars, minimap with police blips and speedometer. The wreck is the
// vehicle fleet's own damage (it explodes by the fleet's rules) and the effects system's fire,
// smoke and debris; the chase is stagePoliceChase (duskPoliceChase.js).
import { GAME_COMMANDS } from '../core/events/gameCommands.js';
import { pointInFrame } from './showcaseStaging.js';
import { stagePoliceChase } from './duskPoliceChase.js';

/** The clock: the sun about 3.7 degrees up, setting into the vanishing point of the boulevard. */
const SUN_HOURS = 19.25;
/** Where along Bulevar Dorado (0 east end, 1 west end) the coupe starts. */
const ALONG = 0.4;
/** The mission on the HUD: Sparks Fly at "The police crashed the finish: lose them". */
const MISSION = Object.freeze({ missionId: 'm04_sparks_fly', startIndex: 3 });
/**
 * The crashed cruiser: metres from the median's edge (+ into the westbound carriageway), metres
 * ahead of the coupe's start, the compass turn of its nose (- towards the median), and the seconds
 * it burns after its blast before the coupe pulls away (the fireball gone, the smoke column up).
 * The coupe covers about 22 m before the picture, so the wreck stands about 14 m ahead of it.
 */
const WRECK = Object.freeze({ fromMedian: -0.4, ahead: 36, turn: -0.85, burnSeconds: 2.2 });
/**
 * The cruisers sent around the sliding coupe ([right, ahead, turn], see CHASE_CRUISERS): one
 * alongside on the median side, one closing from ahead on the kerb side with its nose turned in,
 * one on the tail behind the camera, one cutting across ahead beside the wreck. (One alongside on
 * the kerb side covered the coupe as it slid towards it.)
 */
const COVER_CRUISERS = Object.freeze([[-3.6, 1.6, 0], [4.2, 10, -0.4], [-3.4, -8.5, 0], [-1.6, 19, 0.45]]);

/**
 * Registers the cover scene.
 * @param {object} context The game context.
 * @returns {() => void} Removes the scene again.
 */
export function registerGoldenHourCover(context) {
  return context.showcase.register({
    name: 'cover-golden-hour',
    title: 'Golden-hour chase on Bulevar Dorado',
    description: 'The lead\'s coupe drifting with three stars into the low sun, cruisers closing and a crashed cruiser burning on the palm median.',
    async run(game, tools) {
      await stagePoliceChase(game, tools, {
        street: 'bulevar_dorado', along: tunedAlong(), hours: SUN_HOURS, traffic: 0.8, crowd: 1.3, cruisers: COVER_CRUISERS,
        prepare: (frame, start) => stageWreck(game, tools, frame, start),
      });
    },
  });
}

/** Starts the mission and stages the crashed cruiser burning ahead on the median side. */
async function stageWreck(game, tools, frame, start) {
  const { commands } = game;
  if (commands.has(GAME_COMMANDS.MISSION_START)) commands.run(GAME_COMMANDS.MISSION_START, { ...MISSION, skipIntro: true });
  const wreck = tunedWreck();
  const fleet = game.systems.get('vehicles');
  const lane = frame.laneSide(1) - frame.laneSide(0);
  const medianEdge = frame.laneSide(0) - lane / 2;
  const along = (start.x - frame.x) * frame.fx + (start.z - frame.z) * frame.fz;
  const at = pointInFrame(frame, medianEdge + wreck.fromMedian, along + wreck.ahead);
  const cruiser = fleet.spawn({ modelId: 'police_cruiser', position: at, heading: frame.compass + wreck.turn, parked: true, ownerSystem: 'showcase' });
  tools.advance(0.1);
  const where = fleet.get(cruiser)?.entity.position ?? at;
  fleet.damage(cruiser, 1e6, 'collision', null, { x: where.x, y: (where.y ?? 0) + 0.8, z: where.z });
  tools.advance(wreck.burnSeconds);
}

/** ALONG, or `&along=<0..1>` in the page query for tuning takes. */
function tunedAlong() {
  const given = Number(new URLSearchParams(globalThis.location?.search ?? '').get('along'));
  return given > 0 && given < 1 ? given : ALONG;
}

/** WRECK, with `&wreck=<fromMedian>,<ahead>,<turn>,<burnSeconds>` in the page query for tuning takes. */
function tunedWreck() {
  const given = new URLSearchParams(globalThis.location?.search ?? '').get('wreck');
  if (!given) return WRECK;
  const [fromMedian, ahead, turn, burnSeconds] = given.split(',').map(Number);
  const pick = (value, fallback) => (Number.isFinite(value) ? value : fallback);
  return {
    fromMedian: pick(fromMedian, WRECK.fromMedian), ahead: pick(ahead, WRECK.ahead),
    turn: pick(turn, WRECK.turn), burnSeconds: pick(burnSeconds, WRECK.burnSeconds),
  };
}

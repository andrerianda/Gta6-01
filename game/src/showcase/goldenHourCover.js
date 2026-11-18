// The cover picture, scene `cover-golden-hour`: a police chase on Bulevar Dorado at golden hour,
// looking west down the beachfront drive into the low sun, through the game's own centred chase
// camera (the owner's rule). The lead's red coupe slides through a handbrake drift with three
// stars, cruisers closing around it with their light bars burning; ahead on the left a police
// cruiser that crashed into the palm median burns, its dark smoke column rising against the
// sunset over the beach and its debris strewn on the road. A story mission's objective ("lose
// them") is on the HUD with the stars, minimap with police blips and speedometer. The wreck is the
// police system's held wreck (dented through the fleet's crash path, light bar on) set ablaze by
// the effects system's 'effects/burn'; the chase is stagePoliceChase (duskPoliceChase.js).
import { GAME_COMMANDS } from '../core/events/gameCommands.js';
import { pointInFrame } from './showcaseStaging.js';
import { stagePoliceChase } from './duskPoliceChase.js';

/**
 * The clock: the sun low over the vanishing point of the boulevard (shift 10 take c4, mean
 * luminance 85 at 768x480; 19.05 gave 80, 18.95 gave 84; the owner wants ~85 or more).
 */
const SUN_HOURS = 18.88;
/**
 * Where along Bulevar Dorado (0 east end, 1 west end) the coupe starts. At 0.4 a dark car at the
 * kerb filled the lower right beside the sliding coupe; at 0.41 the road beside it is clear but
 * the right half was empty pavement; at 0.385 a crowd and a palm in its pit fill the right.
 */
const ALONG = 0.385;
/** Traffic and crowd for the cover (take c4: cars round the coupe, the crowd on the hotel pavement). */
const DENSITY = Object.freeze({ traffic: 2.6, crowd: 2.2 });
/** The mission on the HUD: Sparks Fly at "Cops at the finish line: lose them". */
const MISSION = Object.freeze({ missionId: 'm04_sparks_fly', startIndex: 3 });
/**
 * The crashed cruiser: metres from the median's edge (+ into the westbound carriageway), metres
 * ahead of the coupe's start, the compass turn of its nose (- towards the median), and the seconds
 * it burns before the coupe pulls away. The coupe covers about 22 m before the picture, so the
 * wreck stands about 14 m ahead of it; 0.9 m into the road its flames read over the car (on the
 * median edge, -0.4, palms hid them; at 31 ahead, take c4, it stands clear of the median palm).
 */
const WRECK = Object.freeze({ fromMedian: 0.9, ahead: 31, turn: -0.85, burnSeconds: 2.2 });
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
        street: 'bulevar_dorado', along: tunedAlong(), hours: SUN_HOURS, traffic: tuned('traffic', DENSITY.traffic), crowd: tuned('crowd', DENSITY.crowd), cruisers: COVER_CRUISERS,
        prepare: (frame, start) => stageWreck(game, tools, frame, start),
      });
    },
  });
}

/**
 * Starts the mission and stages the crashed cruiser burning ahead on the median side. Modes
 * (`&wreckmode=` for takes): 'police' (default) is the police system's held wreck (dented through
 * the fleet's crash path, light bar still flashing, crew slumped, never explodes) set ablaze by the
 * effects system's 'effects/burn' with its smoke column already standing; 'fleet' is the fleet's
 * staged wreck (front crushed, glass broken, door ajar) set ablaze the same way; 'explode' is the
 * old blast with the fleet's own burning shell.
 */
async function stageWreck(game, tools, frame, start) {
  const { commands } = game;
  if (commands.has(GAME_COMMANDS.MISSION_START)) commands.run(GAME_COMMANDS.MISSION_START, { ...MISSION, skipIntro: true });
  const wreck = tunedWreck();
  const fleet = game.systems.get('vehicles');
  const lane = frame.laneSide(1) - frame.laneSide(0);
  const medianEdge = frame.laneSide(0) - lane / 2;
  const along = (start.x - frame.x) * frame.fx + (start.z - frame.z) * frame.fz;
  const at = pointInFrame(frame, medianEdge + wreck.fromMedian, along + wreck.ahead);
  const query = new URLSearchParams(globalThis.location?.search ?? '');
  const mode = query.get('wreckmode') ?? 'police';
  const stage = query.get('burn') ?? 'blazing';
  const dispatch = game.systems.find('policeDispatch');
  let cruiser = null;
  if (mode === 'police' && dispatch?.stageWreck) {
    const unitId = dispatch.stageWreck('patrol_car', at, -(frame.compass + wreck.turn), { lights: 'flash', crew: 'slumped', burning: true });
    cruiser = dispatch.units?.find?.((unit) => unit.id === unitId)?.vehicleId ?? null;
  } else {
    cruiser = fleet.spawn({ modelId: 'police_cruiser', position: at, heading: frame.compass + wreck.turn, parked: true, ownerSystem: 'showcase' });
    tools.advance(0.1);
    const where = fleet.get(cruiser)?.entity.position ?? at;
    if (mode === 'explode' || !fleet.stageWreck) fleet.damage(cruiser, 1e6, 'collision', null, { x: where.x, y: (where.y ?? 0) + 0.8, z: where.z });
    else fleet.stageWreck(cruiser, { corner: 'left', door: 'driver', doorAmount: 0.4 });
  }
  if (mode !== 'explode' && cruiser !== null && commands.has('effects/burn')) {
    commands.run('effects/burn', { vehicleId: cruiser, stage, warm: 10 });
  }
  tools.advance(wreck.burnSeconds);
}

/** ALONG, or `&along=<0..1>` in the page query for tuning takes. */
function tunedAlong() {
  const given = Number(new URLSearchParams(globalThis.location?.search ?? '').get('along'));
  return given > 0 && given < 1 ? given : ALONG;
}

/** A positive number from the page query (`&traffic=`, `&crowd=` for tuning takes), or the fallback. */
function tuned(key, fallback) {
  const given = Number(new URLSearchParams(globalThis.location?.search ?? '').get(key));
  return given > 0 ? given : fallback;
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

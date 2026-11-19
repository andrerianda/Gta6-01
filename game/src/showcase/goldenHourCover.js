// The cover picture, scene `cover-golden-hour`: a police chase on Bulevar Dorado at golden hour,
// looking west down the beachfront drive into the low sun, through the game's own centred chase
// camera (the owner's rule). The lead's red coupe is flat out at chase speed with four stars,
// cruisers closing around it with their light bars burning and the police helicopter low over the
// boulevard ahead; ahead on the left a police cruiser that crashed into the palm median burns, its
// dark smoke column rising against the sunset over the beach. Story mission 4 ("Sparks Fly", at
// "lose them") is on the HUD with Chispa's line from the mission, the stars, the cash, the minimap
// with police blips and the speedometer. The wreck is the police system's held wreck (dented
// through the fleet's crash path, light bar on) set ablaze by the effects system's 'effects/burn';
// the chase is stagePoliceChase (duskPoliceChase.js), the helicopter the police dispatch's own.
import { GAME_COMMANDS } from '../core/events/gameCommands.js';
import { pointInFrame } from './showcaseStaging.js';
import { stagePoliceChase } from './duskPoliceChase.js';
import { hideCiviliansAhead, holdHelicopterAhead } from '../police/policeChaseShowcase.js';

/**
 * The clock: the sun low over the vanishing point of the boulevard. With the helicopter and the
 * smoke column in the sky the mean luminance at 768x480 was 85.0 at 18.88, 88.2 at 18.62 and 90.2
 * at 18.45 (re-shoot GPU takes; the owner wants 90 or more for the cover).
 */
const SUN_HOURS = 18.45;
/**
 * Where along Bulevar Dorado (0 east end, 1 west end, about 1,775 m) the coupe starts. It now
 * rolls in at chase speed and covers about 60 m before the picture, so it starts about 40 m
 * further east than the old drifting take (0.385) to end in front of the same hotel block.
 */
const ALONG = 0.363;
/** Traffic and crowd for the cover (take c4: cars round the coupe, the crowd on the hotel pavement). */
const DENSITY = Object.freeze({ traffic: 2.6, crowd: 2.2 });
/** The mission on the HUD: Sparks Fly at "Cops at the finish line: lose them". */
const MISSION = Object.freeze({ missionId: 'm04_sparks_fly', startIndex: 3 });
/**
 * The subtitle: Chispa, the mission's giver, with his own saying (catalog/storyCharacters.js,
 * voice.sayings), short enough for one line under the coupe (his opening line of the mission
 * wrapped to two over its bumper). `&line=intro` shows that opening line instead.
 */
const LINE = Object.freeze({ speakerId: 'jacinto_roldan', missionId: 'm04_sparks_fly', saying: 0 });
/** The lead's cash by the fourth mission (the start's $2,000 plus three missions' pay and side jobs). */
const CASH = 48620;
/** Wanted stars: four, the level the police helicopter joins a chase by day. */
const STARS = 4;
/**
 * The chase at speed: the coupe rolls in at `launch` m/s, flat out for `flatOut` seconds, then a
 * short flick on the handbrake (`slide` seconds) so the camera swings after the nose while the
 * speedometer still reads well over 100 km/h.
 */
const DRIVE = Object.freeze({ launch: 30, flatOut: 1.5, slide: 0.25 });
/**
 * The crashed cruiser: metres from the median's edge (+ into the westbound carriageway), metres
 * ahead of the coupe's start, the compass turn of its nose (- towards the median), and the seconds
 * it burns before the coupe pulls away. The coupe covers about 60 m before the picture, so the
 * wreck stands about 15-20 m ahead of it, clear of the median palms.
 */
const WRECK = Object.freeze({ fromMedian: 0.9, ahead: 78, turn: -0.85, burnSeconds: 2.2 });
/**
 * The cruisers sent around the coupe ([right, ahead, turn], see CHASE_CRUISERS). The coupe moves
 * about 4 m in the instant before the picture and they start from rest, so each is sent a little
 * ahead: one alongside on the median side, one closing on the kerb side, one on the tail behind
 * the camera, one cutting across ahead beside the wreck.
 */
const COVER_CRUISERS = Object.freeze([[-3.6, 4.5, 0], [4.2, 13, -0.4], [-3.4, -4, 0], [-1.6, 22, 0.45]]);
/**
 * The police helicopter by day: low and ahead over the boulevard, so the chase camera sees it in
 * the bright sky between the smoke column and the hotels, under the mission line (local takes:
 * 18 m up 50 m ahead sat behind the mission line; 11 m up 44 m ahead against the hotel wall).
 */
const HELICOPTER = Object.freeze({ altitude: 10, trail: -36, side: 0 });

/**
 * Registers the cover scene.
 * @param {object} context The game context.
 * @returns {() => void} Removes the scene again.
 */
export function registerGoldenHourCover(context) {
  return context.showcase.register({
    name: 'cover-golden-hour',
    title: 'Golden-hour chase on Bulevar Dorado',
    description: 'The lead\'s coupe flat out with four stars into the low sun, cruisers closing, the police helicopter low ahead and a crashed cruiser burning on the palm median.',
    async run(game, tools) {
      const query = new URLSearchParams(globalThis.location?.search ?? '');
      const drive = tunedTriple(query.get('drive'), ['launch', 'flatOut', 'slide'], DRIVE);
      const staged = await stagePoliceChase(game, tools, {
        street: 'bulevar_dorado', along: tunedAlong(), hours: SUN_HOURS, traffic: tuned('traffic', DENSITY.traffic), crowd: tuned('crowd', DENSITY.crowd),
        cruisers: COVER_CRUISERS, stars: tuned('stars', STARS), launch: drive.launch, flatOut: drive.flatOut, slideBefore: drive.slide,
        prepare: (frame, start) => stageWreck(game, tools, frame, start),
      });
      const coupe = game.systems.get('vehicles').get(staged.coupe)?.entity;
      if (!coupe) return;
      // No civilian car between the camera and the wreck, cruisers and helicopter (`&clear=0` keeps them).
      if (query.get('clear') !== '0') hideCiviliansAhead(game, staged.frame, coupe);
      const station = tunedTriple(query.get('heli'), ['altitude', 'trail', 'side'], HELICOPTER);
      if (holdHelicopterAhead(game, staged.frame, coupe, station)) tools.advance(0.05);
    },
  });
}

/**
 * Starts the mission, sets the lead's cash, stages the crashed cruiser burning ahead on the
 * median side and puts Chispa's line up. Modes (`&wreckmode=` for takes): 'police' (default) is
 * the police system's held wreck (dented through the fleet's crash path, light bar still flashing,
 * crew slumped, never explodes) set ablaze by the effects system's 'effects/burn' with its smoke
 * column already standing; 'fleet' is the fleet's staged wreck (front crushed, glass broken, door
 * ajar) set ablaze the same way; 'explode' is the old blast with the fleet's own burning shell.
 */
async function stageWreck(game, tools, frame, start) {
  const { commands } = game;
  if (commands.has(GAME_COMMANDS.MISSION_START)) commands.run(GAME_COMMANDS.MISSION_START, { ...MISSION, skipIntro: true });
  // Early, so the "+$" change has faded by the picture and only the total shows.
  if (commands.has(GAME_COMMANDS.ECONOMY_ADD_MONEY)) commands.run(GAME_COMMANDS.ECONOMY_ADD_MONEY, { amount: CASH - cashOf(game), reason: 'showcase' });
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
  if (query.get('say') !== '0') showLine(game);
}

/** Chispa's line from the game's own story text as the subtitle, held past the picture. */
function showLine(game) {
  const { commands, content } = game;
  const character = content?.find?.('storyCharacters')?.STORY_CHARACTERS?.[LINE.speakerId];
  const intro = content?.find?.('storyMissions')?.STORY_MISSIONS?.[LINE.missionId]?.intro?.find?.((each) => each.speaker === LINE.speakerId);
  const useIntro = new URLSearchParams(globalThis.location?.search ?? '').get('line') === 'intro';
  const text = useIntro ? intro?.line : character?.voice?.sayings?.[LINE.saying];
  if (!text || !character?.name || !commands.has(GAME_COMMANDS.UI_SHOW_SUBTITLE)) return;
  commands.run(GAME_COMMANDS.UI_SHOW_SUBTITLE, { speakerName: character.name, text, seconds: 12 });
}

/** The lead's cash now (the economy's), or the new game's $2,000. */
function cashOf(game) {
  const cash = game.systems.find('economy')?.cash;
  return Number.isFinite(cash) ? cash : 2000;
}

/** ALONG, or `&along=<0..1>` in the page query for tuning takes. */
function tunedAlong() {
  const given = Number(new URLSearchParams(globalThis.location?.search ?? '').get('along'));
  return given > 0 && given < 1 ? given : ALONG;
}

/** A positive number from the page query (`&traffic=`, `&crowd=`, `&stars=` for tuning takes), or the fallback. */
function tuned(key, fallback) {
  const given = Number(new URLSearchParams(globalThis.location?.search ?? '').get(key));
  return given > 0 ? given : fallback;
}

/** Three numbers from a comma list in the page query (`&drive=`, `&heli=` for takes) over the defaults. */
function tunedTriple(given, keys, defaults) {
  if (!given) return defaults;
  const values = given.split(',').map(Number);
  const out = { ...defaults };
  keys.forEach((key, index) => { if (Number.isFinite(values[index]) && given.split(',')[index] !== '') out[key] = values[index]; });
  return out;
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

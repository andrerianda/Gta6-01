// The dusk picture, scene `dusk-on-foot`: Gran Via Marazul just after sundown (19:33 in a light
// haze, the sky still warm at the end of the avenue), the neon, the shop signs and the first
// lamps just on, the pavement still damp from a shower so the lamps and tail lamps streak in the road.
// The lead walks the north pavement westwards through the evening crowd in the game's own close
// on-foot camera, the avenue running away under its signals, the HUD and minimap on. The owner's
// rule (09:58): no night picture in the judged set (too dark for the judge); every picture must
// read at 768x480. Everything is the real game: the clock, the atmosphere's wetness, traffic and
// pedestrians at a busy evening's density.
// A mission moment, not a stroll: story mission 16 is on the HUD at "Meet Whitlock at police
// headquarters" with its GPS route on the minimap, and Det. Whitlock's call comes in on the phone.
import { GAME_COMMANDS } from '../core/events/gameCommands.js';
import { GAME_EVENTS } from '../core/events/gameEvents.js';
import { openScene, pavementPointNear, placeLead, streetFrameOf } from './showcaseStaging.js';

/** The mission on the HUD and its first objective (`&mission=0` for the old plain walk). */
const MISSION = Object.freeze({ missionId: 'm16_for_the_record', startIndex: 0 });
/** The lead's cash by the last mission (shown on the HUD instead of the new game's $2,000). */
const CASH = 152800;
/** Seconds before the picture that the giver's call comes in (the card stays about 5 s). */
const CALL_BEFORE_SECONDS = 1;

/**
 * The clock and the sky: just after sundown in a light haze, the sky still warm over the avenue's
 * vanishing point, the neon and shop signs lit and the car lamps streaking in the damp road
 * (shift 10 take d10, mean luminance 84.6). The atmosphere lights lamps and signs by its night
 * factor, which is 0 in a clear sky until about 19:25 (take d2 at 18.95 read as daylight, QA);
 * the haze adds a little night factor and lifts the frame (clear at 19.68: lamps on, luminance 70).
 */
const DUSK_HOURS = 19.55;
const DUSK_WEATHER = 'hazy';
/** Traffic and crowd: a busy evening, car lamps along the avenue. */
const DENSITY = Object.freeze({ traffic: 2.6, crowd: 2 });
/** Where along Gran Via (0 east end, 1 west end): the night take n5's view, signals and signs. */
const ALONG = 0.47;
/** How wet the streets are (0 dry .. 1 soaked) and how much of them stands in puddles. */
const WET = Object.freeze({ wetness: 0.6, puddles: 0.3 });
/** Seconds the city runs before the lead walks, and seconds of walking before the picture. */
const SETTLE_SECONDS = 5;
const WALK_SECONDS = 1.4;

/**
 * Registers the dusk scene.
 * @param {object} context The game context.
 * @returns {() => void} Removes the scene again.
 */
export function registerDuskOnFoot(context) {
  return context.showcase.register({
    name: 'dusk-on-foot',
    title: 'Gran Via Marazul at dusk',
    description: 'The lead walking a crowded pavement in the blue hour on the way to meet Whitlock, lamps and shop signs just on, the damp avenue mirroring them.',
    async run(game, tools) {
      const query = new URLSearchParams(globalThis.location?.search ?? '');
      const along = Number(query.get('along'));
      const wet = tunedWet(query.get('wet'));
      // `&hours=19.1` tries another moment (for the earlier lamp-on ramp); judged pictures never pass it.
      const hours = Number(query.get('hours'));
      openScene(game, { hours: hours > 17 && hours < 21 ? hours : DUSK_HOURS, weather: DUSK_WEATHER, ...DENSITY });
      if (wet) game.atmosphere?.weatherModel?.setWetness?.(wet.wetness, wet.puddles);
      const frame = streetFrameOf(game, 'gran_via_marazul', along > 0 && along < 1 ? along : ALONG);
      const spot = pavementPointNear(game, frame, frame.kerb + 2.6, 0, [frame.kerb + 1, frame.kerb + 8]);
      await placeLead(game, tools, spot, -frame.compass);
      game.systems.find('pedestrians')?.refill?.();
      const onMission = query.get('mission') !== '0';
      if (onMission) startMission(game);
      tools.advance(SETTLE_SECONDS);
      if (wet) game.atmosphere?.weatherModel?.setWetness?.(wet.wetness, wet.puddles);
      game.systems.get('player').setWalking?.(true);
      game.input.setVirtual('moveForward', true);
      tools.advance(Math.max(0, WALK_SECONDS - CALL_BEFORE_SECONDS));
      if (onMission) callFromGiver(game);
      tools.advance(Math.min(WALK_SECONDS, CALL_BEFORE_SECONDS));
    },
  });
}

/** Starts the mission at its first objective and sets the lead's cash for the last act. */
function startMission(game) {
  const { commands } = game;
  if (commands.has(GAME_COMMANDS.MISSION_START)) commands.run(GAME_COMMANDS.MISSION_START, { ...MISSION, skipIntro: true });
  const cash = game.systems.find('economy')?.cash;
  if (Number.isFinite(cash) && cash < CASH && commands.has(GAME_COMMANDS.ECONOMY_ADD_MONEY)) {
    commands.run(GAME_COMMANDS.ECONOMY_ADD_MONEY, { amount: CASH - cash, reason: 'showcase' });
  }
}

/**
 * The mission's giver calls (the HUD's incoming call card), with the first sentence of the
 * mission's summary as the text, the way the story's own calls offer a mission (storyPhoneCalls.js).
 */
function callFromGiver(game) {
  const mission = game.content?.find?.('storyMissions')?.STORY_MISSIONS?.[MISSION.missionId];
  if (!mission?.giver) return;
  const text = String(mission.summary ?? '').split('. ')[0].replace(/\.?$/, '.');
  game.events.emit(GAME_EVENTS.PHONE_MESSAGE_RECEIVED, { contactId: mission.giver, text, missionId: MISSION.missionId });
}

/** WET, or `&wet=<wetness>,<puddles>` in the page query for tuning takes (`&wet=0`: a dry street). */
function tunedWet(given) {
  if (given === '0') return null;
  const [wetness, puddles] = (given ?? '').split(',').map(Number);
  if (!(wetness > 0)) return WET;
  return { wetness: Math.min(1, wetness), puddles: Number.isFinite(puddles) ? Math.min(1, Math.max(0, puddles)) : WET.puddles };
}

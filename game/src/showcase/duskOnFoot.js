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
//
// The judged dusk picture is the scene `dusk-phone-call`: the same street and walk a story later,
// at the last beat of the final arc's prologue (stage `insider_call` of POINT OF NO RETURN, begun
// through the mission's own command). The objective reads "Answer the phone" and the handset has
// risen from the lower right corner, ringing: Maj. Quiroga, the insider of Punta Garza ("The gate
// opens at 05:40, Lieutenant. Do not be late." once answered), green accept and red decline.
// The picture is taken just after the lead picks up: the handset shows the name and the call's
// timer, the objective reads "Hear out Maj. Quiroga" and his first line is in the story subtitles
// (`&answer=0`: the phone still ringing, as before).
import { GAME_COMMANDS } from '../core/events/gameCommands.js';
import { GAME_EVENTS } from '../core/events/gameEvents.js';
import { startFinalArc } from './finalArcStaging.js';
import { openScene, pavementPointNear, placeLead, pointInFrame, streetFrameOf } from './showcaseStaging.js';

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
// (Re-shoot: with the mission line and the call card on the HUD 19.55 gave 84.0 on the GPU, below the
// owner's 85 floor; 19.4 gives 88.7 with the lamps and signs still lit.)
const DUSK_HOURS = 19.4;
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
      const onMission = query.get('mission') !== '0';
      await openDuskStreet(game, tools, query, () => { if (onMission) startMission(game); });
      game.systems.get('player').setWalking?.(true);
      game.input.setVirtual('moveForward', true);
      tools.advance(Math.max(0, WALK_SECONDS - CALL_BEFORE_SECONDS));
      if (onMission) callFromGiver(game);
      tools.advance(Math.min(WALK_SECONDS, CALL_BEFORE_SECONDS));
    },
  });
}

/**
 * Seconds the insider's call has been ringing at the picture. The handset buzzes and shakes for the
 * first 0.95 s of every 2 s of ringing; the picture is taken in the still part, the handset sharp.
 */
const RINGING_SECONDS = 1.45;
/** Seconds after the stage begins at which the phone rings (stages/insider_call.js). */
const RING_AFTER_SECONDS = 1.2;
/**
 * The picture is taken just after the lead has picked up: the handset still up in the corner with
 * the caller's name and the running timer, and Quiroga's first line (ic_01) in the story subtitles,
 * held for the still (incomingCalls.pose). `&answer=0` keeps the phone ringing instead.
 * 0.45 s is the call's own gap before its first line (callStateMachine.js), then 1.2 s into it.
 */
const ANSWERED_SECONDS = 0.45 + 1.2;
/** The objective once the call is up (the stage's own reads "Answer the phone" until it ends). */
const CALL_OBJECTIVE = 'Hear out Maj. Quiroga';
/** A little more traffic for the judged picture than the plain walk (the crowd's own cap is 2). */
const CALL_DENSITY = Object.freeze({ traffic: 3, crowd: 2 });

/**
 * Registers the judged dusk scene, the insider's call.
 * @param {object} context The game context.
 * @returns {() => void} Removes the scene again.
 */
export function registerDuskPhoneCall(context) {
  return context.showcase.register({
    name: 'dusk-phone-call',
    title: 'The insider calls: Gran Via Marazul at dusk',
    description: 'The lead on a crowded, damp Gran Via in the blue hour as the phone rises ringing in the corner: Maj. Quiroga, the insider of Punta Garza, with the word on the gate.',
    async run(game, tools) {
      const query = new URLSearchParams(globalThis.location?.search ?? '');
      await openDuskStreet(game, tools, query, () => {}, CALL_DENSITY);
      game.systems.get('player').setWalking?.(true);
      game.input.setVirtual('moveForward', true);
      // The handset is posed for a still: no slide to wait for, its pulses held at a fixed moment.
      const phone = game.systems.find('incomingCalls');
      phone?.pose?.();
      const mission = await startFinalArc(game, { stage: 'insider_call' });
      if (!mission) return;
      const cops = query.get('cops') !== '0';
      const early = query.has('copEarly') ? query.get('copEarly') === '1' : CRUISER.early;
      if (cops && early) sendCruiser(game, query);
      // The stage rings the phone itself; should it be slow, the walk goes on until it does.
      tools.advance(RING_AFTER_SECONDS + 0.05);
      for (let i = 0; i < 20 && phone && phone.state !== 'ringing'; i += 1) tools.advance(0.1);
      tools.advance(RINGING_SECONDS);
      if (query.get('answer') === '0' || !phone || phone.state !== 'ringing') return;
      setLateCash(game);
      if (game.commands.has(GAME_COMMANDS.PHONE_CALL_ANSWER)) game.commands.run(GAME_COMMANDS.PHONE_CALL_ANSWER);
      mission.rt?.objective?.(CALL_OBJECTIVE, null);
      if (cops && !early) sendCruiser(game, query);
      tools.advance(ANSWERED_SECONDS);
    },
  });
}

/**
 * The dusk street both scenes share: the clock and the haze, the busy avenue, the lead on the north
 * pavement, the crowd refilled and the city run for a few seconds so traffic and people are in
 * their stride. `begin` runs once the lead stands there, before the city runs.
 */
async function openDuskStreet(game, tools, query, begin, density = DENSITY) {
  const along = Number(query.get('along'));
  const wet = tunedWet(query.get('wet'));
  // `&hours=19.1` tries another moment (for the earlier lamp-on ramp); judged pictures never pass it.
  const hours = Number(query.get('hours'));
  openScene(game, { hours: hours > 17 && hours < 21 ? hours : DUSK_HOURS, weather: DUSK_WEATHER, ...density });
  if (wet) game.atmosphere?.weatherModel?.setWetness?.(wet.wetness, wet.puddles);
  const frame = streetFrameOf(game, 'gran_via_marazul', along > 0 && along < 1 ? along : ALONG);
  const spot = pavementPointNear(game, frame, frame.kerb + 2.6, 0, [frame.kerb + 1, frame.kerb + 8]);
  await placeLead(game, tools, spot, -frame.compass);
  game.systems.find('pedestrians')?.refill?.();
  begin();
  tools.advance(SETTLE_SECONDS);
  if (wet) game.atmosphere?.weatherModel?.setWetness?.(wet.wetness, wet.puddles);
}

/** Starts the mission at its first objective and sets the lead's cash for the last act. */
function startMission(game) {
  const { commands } = game;
  if (commands.has(GAME_COMMANDS.MISSION_START)) commands.run(GAME_COMMANDS.MISSION_START, { ...MISSION, skipIntro: true });
  setLateCash(game);
}

/**
 * The heat on the street as the insider talks: the lead is wanted (WANTED stars on the HUD) and a
 * cruiser comes up the avenue towards him, its light bar burning red and blue on the wet road.
 * [metres to the right of the street frame's centre (negative: the far carriageway), metres ahead
 * of the lead, stars]. `&cop=<side>,<ahead>` tries another spot for takes.
 */
const CRUISER = Object.freeze({ side: -4.5, ahead: 34, stars: 2, early: false });

/** Sends the cruiser down the far carriageway towards the lead and sets the stars. */
function sendCruiser(game, query) {
  const { commands } = game;
  const [side, ahead] = (query.get('cop') ?? '').split(',').map(Number);
  const frame = streetFrameOf(game, 'gran_via_marazul', ALONG);
  const lead = game.systems.find('player')?.entity?.position;
  const along = lead ? (lead.x - frame.x) * frame.fx + (lead.z - frame.z) * frame.fz : 0;
  const lateral = lead ? -(lead.x - frame.x) * frame.fz + (lead.z - frame.z) * frame.fx : frame.kerb + 2.6;
  const position = pointInFrame(frame, lateral + (Number.isFinite(side) && side !== 0 ? side : CRUISER.side), along + (ahead > 0 ? ahead : CRUISER.ahead));
  if (commands.has(GAME_COMMANDS.WANTED_SET_LEVEL)) commands.run(GAME_COMMANDS.WANTED_SET_LEVEL, { level: CRUISER.stars });
  const dispatch = game.systems.find('policeDispatch');
  if (dispatch) dispatch.lightBarPattern = 'steady';
  if (commands.has(GAME_COMMANDS.POLICE_SPAWN_UNIT)) {
    commands.run(GAME_COMMANDS.POLICE_SPAWN_UNIT, { unitKind: 'patrol_car', position, heading: -(frame.compass + Math.PI) });
  }
}

/** The lead's cash for the last act. */
function setLateCash(game) {
  const { commands } = game;
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

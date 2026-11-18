// The dusk picture, scene `dusk-on-foot`: Gran Via Marazul just after sundown (19:33 in a light
// haze, the sky still warm at the end of the avenue), the neon, the shop signs and the first
// lamps just on, the pavement still damp from a shower so the lamps and tail lamps streak in the road.
// The lead walks the north pavement westwards through the evening crowd in the game's own close
// on-foot camera, the avenue running away under its signals, the HUD and minimap on. The owner's
// rule (09:58): no night picture in the judged set (too dark for the judge); every picture must
// read at 768x480. Everything is the real game: the clock, the atmosphere's wetness, traffic and
// pedestrians at a busy evening's density.
import { openScene, pavementPointNear, placeLead, streetFrameOf } from './showcaseStaging.js';

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
    description: 'The lead walking a crowded pavement in the blue hour, lamps and shop signs just on, the damp avenue mirroring them.',
    async run(game, tools) {
      const query = new URLSearchParams(globalThis.location?.search ?? '');
      const along = Number(query.get('along'));
      const wet = tunedWet(query.get('wet'));
      openScene(game, { hours: DUSK_HOURS, weather: DUSK_WEATHER, ...DENSITY });
      if (wet) game.atmosphere?.weatherModel?.setWetness?.(wet.wetness, wet.puddles);
      const frame = streetFrameOf(game, 'gran_via_marazul', along > 0 && along < 1 ? along : ALONG);
      const spot = pavementPointNear(game, frame, frame.kerb + 2.6, 0, [frame.kerb + 1, frame.kerb + 8]);
      await placeLead(game, tools, spot, -frame.compass);
      game.systems.find('pedestrians')?.refill?.();
      tools.advance(SETTLE_SECONDS);
      if (wet) game.atmosphere?.weatherModel?.setWetness?.(wet.wetness, wet.puddles);
      game.systems.get('player').setWalking?.(true);
      game.input.setVirtual('moveForward', true);
      tools.advance(WALK_SECONDS);
    },
  });
}

/** WET, or `&wet=<wetness>,<puddles>` in the page query for tuning takes (`&wet=0`: a dry street). */
function tunedWet(given) {
  if (given === '0') return null;
  const [wetness, puddles] = (given ?? '').split(',').map(Number);
  if (!(wetness > 0)) return WET;
  return { wetness: Math.min(1, wetness), puddles: Number.isFinite(puddles) ? Math.min(1, Math.max(0, puddles)) : WET.puddles };
}

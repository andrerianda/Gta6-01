// The dusk picture, scene `dusk-on-foot`: Gran Via Marazul at sundown (18:57, the sun on the
// horizon, the sky orange-violet), the street lamps, the shop signs and the first windows
// just on, the pavement still damp from a shower so the lamps and tail lamps streak in the road.
// The lead walks the north pavement westwards through the evening crowd in the game's own close
// on-foot camera, the avenue running away under its signals, the HUD and minimap on. The owner's
// rule (09:58): no night picture in the judged set (too dark for the judge); every picture must
// read at 768x480. Everything is the real game: the clock, the atmosphere's wetness, traffic and
// pedestrians at a busy evening's density.
import { openScene, pavementPointNear, placeLead, streetFrameOf } from './showcaseStaging.js';

/**
 * The clock: the sun on the horizon at the avenue's vanishing point, the sky orange-violet, the
 * lamps and signs on (take d2, mean luminance 83; at 19.2 the street went darker, 80).
 */
const DUSK_HOURS = 18.95;
/** Where along Gran Via (0 east end, 1 west end): the night take n5's view, signals and signs. */
const ALONG = 0.47;
/** How wet the streets are (0 dry .. 1 soaked) and how much of them stands in puddles. */
const WET = Object.freeze({ wetness: 0.7, puddles: 0.4 });
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
      const wet = query.get('wet') === '0' ? null : WET;
      openScene(game, { hours: DUSK_HOURS, weather: 'clear', traffic: 1.6, crowd: 2 });
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

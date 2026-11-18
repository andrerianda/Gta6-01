// The night picture, scene `night-after-rain`: Gran Via Marazul at 22:05 just after a shower, the
// asphalt and the pavements still soaked (the atmosphere's wet surfaces mirror the street lamps,
// the towers' lit windows and the traffic's head and tail lamps), the crowd out on the pavement.
// The lead walks the north pavement westwards in the game's own close on-foot camera, the HUD and
// minimap on. Everything is the real game: the clock and weather commands, the atmosphere's
// wetness, traffic and pedestrians at a busy evening's density.
import { openScene, pavementPointNear, placeLead, streetFrameOf } from './showcaseStaging.js';

/** The clock: well after dusk, every window and lamp lit. */
const NIGHT_HOURS = 22.1;
/**
 * Where along Gran Via (0 east end, 1 west end). At 0.47 (shift 8 take n5) the avenue runs away
 * under green signals with the shop signs lit down the right and the tail lamps streaked in the
 * wet road; at 0.5 a passer-by overlapped the lead in front of a palm trunk.
 */
const ALONG = 0.47;
/** How wet the streets are (0 dry .. 1 soaked) and how much of them stands in puddles. */
const WET = Object.freeze({ wetness: 1, puddles: 0.75 });
/** Seconds the city runs before the lead walks, and seconds of walking before the picture. */
const SETTLE_SECONDS = 5;
const WALK_SECONDS = 1.4;

/**
 * Registers the night scene.
 * @param {object} context The game context.
 * @returns {() => void} Removes the scene again.
 */
export function registerNightAfterRain(context) {
  return context.showcase.register({
    name: 'night-after-rain',
    title: 'Gran Via Marazul after the rain',
    description: 'The lead walking a crowded pavement at night, the soaked avenue mirroring the lamps, windows and traffic.',
    async run(game, tools) {
      openScene(game, { hours: NIGHT_HOURS, weather: 'clear', traffic: 1.6, crowd: 1.8 });
      game.atmosphere?.weatherModel?.setWetness?.(WET.wetness, WET.puddles);
      const given = Number(new URLSearchParams(globalThis.location?.search ?? '').get('along'));
      const frame = streetFrameOf(game, 'gran_via_marazul', given > 0 && given < 1 ? given : ALONG);
      const spot = pavementPointNear(game, frame, frame.kerb + 2.6, 0, [frame.kerb + 1, frame.kerb + 8]);
      await placeLead(game, tools, spot, -frame.compass);
      game.systems.find('pedestrians')?.refill?.();
      tools.advance(SETTLE_SECONDS);
      game.atmosphere?.weatherModel?.setWetness?.(WET.wetness, WET.puddles);
      game.systems.get('player').setWalking?.(true);
      game.input.setVirtual('moveForward', true);
      tools.advance(WALK_SECONDS);
    },
  });
}

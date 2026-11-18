// The cover picture, scene `cover-golden-hour`: Bulevar Dorado at 18:50 looking west down the
// beachfront drive, the sun low at the end of the street. The lead walks the beach-side pavement
// in the close follow camera towards a gleaming red sports coupe parked at the kerb, nose to the
// camera; traffic flows on both carriageways past the palm median and the crowd walks the
// pavements. The HUD with its minimap is on. Everything is spawned and moved by the game itself.
import { GAME_COMMANDS } from '../core/events/gameCommands.js';
import { openScene, placeLead, pavementPointNear, pointInFrame, streetFrameOf } from './showcaseStaging.js';

/**
 * The clock. At 18:50 the sun (8.7 degrees up) hid behind the crowns of the pavement palms; at
 * 19:07 it is about 4.5 degrees up and 8 degrees north of west, so in the close camera it sits
 * just above the vanishing point of the boulevard, under the crowns and between the palm rows.
 */
const SUN_HOURS = 19.12;
/** Where along Bulevar Dorado (0 east end, 1 west end). */
const ALONG = 0.44;
/** Metres the coupe stands ahead of where the lead starts walking (v1 at 7.5 filled half the frame). */
const COUPE_AHEAD = 11.5;
/** How far the coupe's nose is turned off the kerb towards the camera (radians): a three-quarter view. */
const COUPE_TURN = -0.22;
/** Seconds the city runs before the lead walks (traffic and the crowd find their pace). */
const SETTLE_SECONDS = 6;
/** Seconds the lead walks towards the coupe. */
const WALK_SECONDS = 1.6;

/**
 * Registers the cover scene.
 * @param {object} context The game context.
 * @returns {() => void} Removes the scene again.
 */
export function registerGoldenHourCover(context) {
  return context.showcase.register({
    name: 'cover-golden-hour',
    title: 'Golden hour on Bulevar Dorado',
    description: 'The lead on the beachfront pavement beside a red sports coupe, traffic, the crowd and the low sun.',
    async run(game, tools) {
      openScene(game, { hours: SUN_HOURS, traffic: 1.5, crowd: 1.6 });
      const frame = streetFrameOf(game, 'bulevar_dorado', ALONG);
      // The beach side of the drive is to the left looking west: negative side offsets.
      const pavement = -(frame.kerb + 3.2);
      const start = pavementPointNear(game, frame, pavement, 0, [-(frame.kerb + 9), -(frame.kerb + 1.2)]);
      await placeLead(game, tools, start, -frame.compass);
      const fleet = game.systems.get('vehicles');
      fleet.spawn({
        modelId: 'sports_coupe', position: pointInFrame(frame, -frame.kerb + 0.2, COUPE_AHEAD),
        heading: frame.compass + Math.PI + COUPE_TURN, colour: '#C2161B', parked: true, ownerSystem: 'showcase',
      });
      game.systems.find('pedestrians')?.refill?.();
      tools.advance(SETTLE_SECONDS);
      if (game.commands.has(GAME_COMMANDS.ECONOMY_ADD_MONEY)) game.commands.run(GAME_COMMANDS.ECONOMY_ADD_MONEY, { amount: 12500, reason: 'showcase' });
      // The lead is caught mid-stride: the walk is still held when the picture is drawn.
      game.systems.get('player').setWalking?.(true);
      game.input.setVirtual('moveForward', true);
      tools.advance(WALK_SECONDS);
    },
  });
}

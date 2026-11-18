// The crowd showcase scenes: the pavements of Bulevar Dorado and Gran Vía Marazul at golden hour
// (18:50) with the crowd the game itself spawns there, seen over the lead's shoulder by the
// follow camera after the lead has walked a few steps. They set the game up through commands
// and play the real rules forward, so the people, their looks and their walks are the game's own.
import { GAME_COMMANDS } from '../core/events/gameCommands.js';
import { GAME_STATE } from '../core/state/gameStates.js';
import { stagingSpot } from '../player/onFootShowcase.js';

/** The scenes: name, title, staging street, where along it (0 east end, 1 west end). */
const CROWD_SCENES = [
  { name: 'pedestrians-bulevar-dorado', title: 'The crowd on Bulevar Dorado at golden hour', street: 'bulevar_dorado', along: 0.45 },
  { name: 'pedestrians-gran-via', title: 'The crowd on Gran Via Marazul at golden hour', street: 'gran_via_marazul', along: 0.4 },
];

/**
 * Registers the crowd showcase scenes.
 * @param {import('../core/systems/gameContext.js').GameContext} context
 */
export function registerCrowdShowcase(context) {
  for (const scene of CROWD_SCENES) {
    if (context.showcase.has(scene.name)) continue;
    context.showcase.register({
      name: scene.name,
      title: scene.title,
      description: 'The pavement crowd at 18:50: people by district and hour, walking, waiting and talking.',
      async run(game, tools) {
        game.state.enter(GAME_STATE.PLAYING);
        game.commands.run(GAME_COMMANDS.TIME_SET, { hours: 18.83 });
        const spot = stagingSpot(game, scene.along, scene.street);
        game.commands.run(GAME_COMMANDS.PLAYER_TELEPORT, { position: { x: spot.x, z: spot.z }, heading: spot.heading });
        await tools.whenIdle();
        game.commands.run(GAME_COMMANDS.PLAYER_TELEPORT, { position: { x: spot.x, z: spot.z }, heading: spot.heading });
        const crowd = game.systems.get('pedestrians');
        crowd.setDensity(1.2);
        crowd.refill();
        const player = game.systems.get('player');
        if (player.setWalking) player.setWalking(true);
        game.input.setVirtual('moveForward', true);
        tools.advance(2.5);
        game.input.setVirtual('moveForward', false);
        if (player.setWalking) player.setWalking(false);
        tools.advance(0.8);
      },
    });
  }
}

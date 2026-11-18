// The on-foot showcase scenes: the lead walking and running at golden hour, seen over the right
// shoulder by the follow camera. They set the game up through commands and play the real rules
// forward (the move keys held, the camera following), so the picture is the game's own.
import { GAME_COMMANDS } from '../core/events/gameCommands.js';
import { GAME_STATE } from '../core/state/gameStates.js';

/** The scenes: name, title, pace, the seconds walked, where and which way. */
const ON_FOOT_SCENES = [
  { name: 'on-foot-walk', title: 'The lead walking at golden hour', walk: true, sprint: false, seconds: 3, x: -14, z: 16, heading: -0.75 },
  { name: 'on-foot-run', title: 'The lead running at golden hour', walk: false, sprint: false, seconds: 2.5, x: -16, z: 18, heading: -0.75 },
  { name: 'on-foot-sprint', title: 'The lead sprinting at golden hour', walk: false, sprint: true, seconds: 2.5, x: -18, z: 20, heading: -0.75 },
];

/**
 * Registers the on-foot showcase scenes.
 * @param {import('../core/systems/gameContext.js').GameContext} context
 */
export function registerOnFootShowcase(context) {
  for (const scene of ON_FOOT_SCENES) {
    if (context.showcase.has(scene.name)) continue;
    context.showcase.register({
      name: scene.name,
      title: scene.title,
      description: 'The lead on foot under the over-the-shoulder follow camera, at 18:50.',
      run(game, tools) {
        game.state.enter(GAME_STATE.PLAYING);
        game.commands.run(GAME_COMMANDS.TIME_SET, { hours: 18.83 });
        game.commands.run(GAME_COMMANDS.PLAYER_TELEPORT, { position: { x: scene.x, z: scene.z }, heading: scene.heading });
        const player = game.systems.get('player');
        player.setWalking(scene.walk);
        game.input.setVirtual('moveForward', true);
        if (scene.sprint) game.input.setVirtual('sprint', true);
        tools.advance(scene.seconds);
        game.input.setVirtual('moveForward', false);
        game.input.setVirtual('sprint', false);
        player.setWalking(false);
      },
    });
  }
}

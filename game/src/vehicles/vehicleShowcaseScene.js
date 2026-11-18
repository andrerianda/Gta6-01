// The fleet's showcase scene, ?shot=vehicles-golden-hour: a row of cars parked along a kerb in
// their catalog colours and a sports coupe driven up the street towards the camera at golden
// hour, everything spawned and moved by the real fleet and physics (no picture is faked).
import { GAME_COMMANDS } from '../core/events/gameCommands.js';
import { GAME_STATE } from '../core/state/gameStates.js';

const PARKED = [
  ['family_sedan', -3.1, -9, 0],
  ['sports_coupe', -3.1, -2.6, 0.02],
  ['compact_hatch', -3.1, 3.2, -0.03],
  ['taxi_cab', 3.4, -14, Math.PI],
];

/**
 * Registers the scene with the showcase registry.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 */
export function registerVehicleShowcase(context) {
  context.showcase.register({
    name: 'vehicles-golden-hour',
    title: 'Parked cars and a coupe on the move at golden hour',
    description: 'The vehicle fleet: catalog models in catalog colours, parked and driven by the physics.',
    run(game, tools) {
      game.state.enter(GAME_STATE.PLAYING);
      game.commands.run(GAME_COMMANDS.TIME_SET, { hours: 18.83 });
      if (game.commands.has(GAME_COMMANDS.PLAYER_TELEPORT)) {
        game.commands.run(GAME_COMMANDS.PLAYER_TELEPORT, { position: { x: -0.6, z: 6 }, heading: 0.5 });
      }
      tools.advance(0.1);
      const fleet = game.systems.get('vehicles');
      for (const [modelId, x, z, heading] of PARKED) {
        fleet.spawn({ modelId, position: { x, z }, heading, parked: true, ownerSystem: 'showcase' });
      }
      const driven = fleet.spawn({ modelId: 'sports_coupe', position: { x: 1.6, z: -34 }, heading: Math.PI, colour: '#C2261F', parked: false, ownerSystem: 'showcase' });
      const controls = fleet.controlsOf(driven);
      controls.throttle = 0.85;
      controls.steer = 0.04;
      tools.advance(2.2);
      controls.throttle = 0;
      controls.brake = 0.6;
      controls.steer = -0.25;
      tools.advance(0.35);
    },
  });
}

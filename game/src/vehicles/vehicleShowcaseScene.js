// The fleet's showcase scenes, everything spawned and moved by the real fleet and physics (no
// picture is faked):
// - ?shot=vehicles-golden-hour: cars parked along a kerb in catalog colours and a sports coupe
//   driven up the street towards the camera, braking, at golden hour.
// - ?shot=vehicles-crash: a coupe rammed into a parked sedan at about 60 km/h: dents, cracked
//   and shattered glass, a lost bumper, smoke.
import { GAME_COMMANDS } from '../core/events/gameCommands.js';
import { GAME_STATE } from '../core/state/gameStates.js';

const PARKED = [
  ['sports_coupe', -3.1, -15, 0.02, '#1E63C4'],
  ['family_sedan', -3.1, -8.6, -0.02, null],
  ['sports_coupe', -3.1, -2.4, 0.01, '#F0B323'],
  ['family_sedan', 3.6, -20, Math.PI, '#EDEBE6'],
];

function setUp(game, tools, position, heading) {
  game.state.enter(GAME_STATE.PLAYING);
  game.commands.run(GAME_COMMANDS.TIME_SET, { hours: 18.83 });
  if (game.commands.has(GAME_COMMANDS.PLAYER_TELEPORT)) game.commands.run(GAME_COMMANDS.PLAYER_TELEPORT, { position, heading });
  tools.advance(0.1);
  return game.systems.get('vehicles');
}

/**
 * Registers the scenes with the showcase registry.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 */
export function registerVehicleShowcase(context) {
  context.showcase.register({
    name: 'vehicles-golden-hour',
    title: 'Parked cars and a coupe on the move at golden hour',
    description: 'The vehicle fleet: catalog models in catalog colours, parked and driven by the physics.',
    run(game, tools) {
      const fleet = setUp(game, tools, { x: -0.6, z: 6 }, 0.5);
      for (const [modelId, x, z, heading, colour] of PARKED) {
        fleet.spawn({ modelId, position: { x, z }, heading, colour: colour ?? undefined, parked: true, ownerSystem: 'showcase' });
      }
      const driven = fleet.spawn({ modelId: 'sports_coupe', position: { x: 1.5, z: -40 }, heading: Math.PI, colour: '#C2261F', parked: false, ownerSystem: 'showcase' });
      const controls = fleet.controlsOf(driven);
      controls.throttle = 0.9;
      tools.advance(3.1);
      controls.throttle = 0;
      controls.brake = 0.7;
      controls.steer = -0.3;
      tools.advance(0.4);
    },
  });

  context.showcase.register({
    name: 'vehicles-crash',
    title: 'A coupe rammed into a parked sedan',
    description: 'Vehicle damage: dented panels, broken glass, a torn-off bumper and engine smoke.',
    run(game, tools) {
      const fleet = setUp(game, tools, { x: 4, z: 4 }, 0.5);
      fleet.spawn({ modelId: 'family_sedan', position: { x: 0, z: -4 }, heading: Math.PI / 2, parked: true, ownerSystem: 'showcase' });
      const coupe = fleet.spawn({ modelId: 'sports_coupe', position: { x: -0.4, z: -32 }, heading: Math.PI, colour: '#178F8A', parked: false, ownerSystem: 'showcase' });
      const controls = fleet.controlsOf(coupe);
      controls.throttle = 1;
      tools.advance(3.1);
      controls.throttle = 0;
      controls.brake = 1;
      tools.advance(1.2);
    },
  });
}

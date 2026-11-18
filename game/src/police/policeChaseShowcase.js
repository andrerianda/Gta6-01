// The showcase scene `police-chase`: golden hour on Gran Via Marazul, the lead's coupe flat out
// westwards between the towers with two stars, and three police cruisers on its tail, light bars
// flashing, one pulling alongside to box it in. Everything is the real game: the lead drives a
// fleet car through the player's own controls, the wanted level is set by its debug command and
// the cruisers are dispatched and driven by policeDispatch. The camera is cut ahead of the lead,
// low and long, looking back down the avenue at the chase.
import { GAME_COMMANDS } from '../core/events/gameCommands.js';
import { GAME_STATE } from '../core/state/gameStates.js';

/** [metres right of the lead's lane, metres behind] for each cruiser. */
const CRUISERS = [[-3.4, 13], [0.2, 24], [-3.6, 36]];

function avenueFrame(game) {
  const plan = game.systems.find('openWorldCity')?.plan;
  const street = plan?.stagingStreets?.find?.((each) => each.key === 'gran_via_marazul') ?? plan?.stagingStreets?.[0];
  const east = street?.eastEnd;
  const west = street?.westEnd;
  if (!east || !west) return { x: 0, z: 0, fx: 0, fz: -1, heading: 0 };
  const length = Math.hypot(west.x - east.x, west.z - east.z);
  const fx = (west.x - east.x) / length;
  const fz = (west.z - east.z) / length;
  let x = east.x + fx * length * 0.53;
  let z = east.z + fz * length * 0.53;
  const centre = plan.nearestRoad?.(x, z, 60);
  if (centre) {
    x = centre.x;
    z = centre.z;
  }
  return { x, z, fx, fz, heading: Math.atan2(fx, -fz) };
}

function at(frame, side, ahead) {
  return { x: frame.x - frame.fz * side + frame.fx * ahead, z: frame.z + frame.fx * side + frame.fz * ahead };
}

/**
 * Registers the scene with the showcase registry.
 * @param {import('../core/systems/gameContext.js').GameContext} context
 */
export function registerPoliceChaseShowcase(context) {
  context.showcase.register({
    name: 'police-chase',
    title: 'A police chase down Gran Via Marazul at golden hour',
    description: 'Two stars: three cruisers with flashing light bars chase the lead\'s coupe between the towers.',
    run(game, tools) {
      const frame = avenueFrame(game);
      const { commands } = game;
      game.state.enter(GAME_STATE.PLAYING);
      commands.run(GAME_COMMANDS.TIME_SET, { hours: 18.83 });
      if (commands.has(GAME_COMMANDS.WEATHER_SET)) commands.run(GAME_COMMANDS.WEATHER_SET, { weather: 'clear', seconds: 0 });
      const start = at(frame, 4.2, 0);
      commands.run(GAME_COMMANDS.PLAYER_TELEPORT, { position: at(frame, 7, 0), heading: -frame.heading });
      tools.advance(0.1);
      const fleet = game.systems.get('vehicles');
      const coupe = fleet.spawn({ modelId: 'sports_coupe', position: start, heading: frame.heading, colour: '#C2261F', parked: false, ownerSystem: 'showcase' });
      commands.run(GAME_COMMANDS.PLAYER_ENTER_VEHICLE, { vehicleId: coupe });
      tools.advance(0.2);
      commands.run(GAME_COMMANDS.WANTED_SET_LEVEL, { level: 2 });
      for (const [side, behind] of CRUISERS) {
        commands.run(GAME_COMMANDS.POLICE_SPAWN_UNIT, { unitKind: 'patrol_car', position: at(frame, 4.2 + side, -behind), heading: -frame.heading });
      }
      game.input.setVirtual('accelerate', true);
      tools.advance(3.6);
      game.input.setVirtual('accelerate', false);
      const car = fleet.get(coupe)?.entity.position ?? start;
      const ground = game.systems.find('openWorldCity')?.groundHeightAt(car.x, car.z) ?? car.y;
      const lead = { x: car.x, z: car.z, fx: frame.fx, fz: frame.fz };
      const eye = at(lead, -4.6, 15);
      const look = at(lead, -1.2, -11);
      if (commands.has(GAME_COMMANDS.CAMERA_CUT_TO)) {
        commands.run(GAME_COMMANDS.CAMERA_CUT_TO, {
          position: { x: eye.x, y: ground + 1.5, z: eye.z },
          target: { x: look.x, y: ground + 1.1, z: look.z },
          fieldOfView: 38,
        });
      }
    },
  });
}

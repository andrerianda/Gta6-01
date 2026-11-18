// The showcase scene `police-chase`: golden hour on Gran Via Marazul, the lead's coupe flat out
// westwards between the towers with two stars, and three police cruisers on its tail, light bars
// flashing, one pulling alongside to box it in. Everything is the real game: the lead drives a
// fleet car through the player's own controls, the wanted level is set by its debug command and
// the cruisers are dispatched and driven by policeDispatch. The camera is cut ahead of the lead,
// low and long, looking back down the avenue at the chase.
import { GAME_COMMANDS } from '../core/events/gameCommands.js';
import { GAME_STATE } from '../core/state/gameStates.js';

/** [westbound lane (0 beside the median), metres behind the lead] for each cruiser. */
const CRUISERS = [[0, 9], [2, 15], [1, 23]];
/** The lead's lane. */
const LEAD_LANE = 1;

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
  const segment = centre?.segment;
  const median = (segment?.medianWidth ?? 5) / 2;
  const width = segment?.laneWidth ?? 3.3;
  const lanes = Math.max(1, Math.min(segment?.lanesForward ?? 3, segment?.lanesBackward ?? 3));
  // Traffic keeps right, so the westbound lanes are on the right (north) of the median.
  const laneSide = (index) => median + width * (Math.min(index, lanes - 1) + 0.5);
  return { x, z, fx, fz, heading: Math.atan2(fx, -fz), laneSide };
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
      const start = at(frame, frame.laneSide(LEAD_LANE), 0);
      commands.run(GAME_COMMANDS.PLAYER_TELEPORT, { position: at(frame, frame.laneSide(LEAD_LANE) + 2, 0), heading: -frame.heading });
      tools.advance(0.1);
      const fleet = game.systems.get('vehicles');
      const coupe = fleet.spawn({ modelId: 'sports_coupe', position: start, heading: frame.heading, colour: '#C2261F', parked: false, ownerSystem: 'showcase' });
      commands.run(GAME_COMMANDS.PLAYER_ENTER_VEHICLE, { vehicleId: coupe });
      tools.advance(0.2);
      // The lead gets away first, so the cruisers join a moving chase rather than a stopped car.
      game.input.setVirtual('accelerate', true);
      tools.advance(1.1);
      const moving = fleet.get(coupe)?.entity.position ?? start;
      const along = (moving.x - frame.x) * frame.fx + (moving.z - frame.z) * frame.fz;
      commands.run(GAME_COMMANDS.WANTED_SET_LEVEL, { level: 2 });
      for (const [lane, behind] of CRUISERS) {
        commands.run(GAME_COMMANDS.POLICE_SPAWN_UNIT, { unitKind: 'patrol_car', position: at(frame, frame.laneSide(lane), along - behind), heading: -frame.heading });
      }
      tools.advance(1.9);
      // Off the throttle: the cruisers close in, one pulls alongside.
      game.input.setVirtual('accelerate', false);
      tools.advance(1.5);
      const car = fleet.get(coupe)?.entity.position ?? start;
      const ground = game.systems.find('openWorldCity')?.groundHeightAt(car.x, car.z) ?? car.y;
      const lead = { x: car.x, z: car.z, fx: frame.fx, fz: frame.fz };
      // Ahead of the lead on the kerb side, low, looking back past the coupe at the cruisers.
      const eye = at(lead, 2.3, 15);
      const look = at(lead, -1.4, -10);
      if (commands.has(GAME_COMMANDS.CAMERA_CUT_TO)) {
        commands.run(GAME_COMMANDS.CAMERA_CUT_TO, {
          position: { x: eye.x, y: ground + 1.25, z: eye.z },
          target: { x: look.x, y: ground + 1.15, z: look.z },
          fieldOfView: 34,
        });
      }
    },
  });
}

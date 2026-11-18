// The showcase scene `police-chase`: dusk on Gran Via Marazul (19:43, the sky still glowing behind
// the towers, the street lights on), the lead's red coupe flat out westwards with three stars and
// sliding a little as it swerves, four police cruisers on its tail: one pulling alongside on the
// median side, two close behind, one further back, their light bars burning red and blue on the
// asphalt, the car bodies and the shop fronts. Everything is the real game: the lead drives a
// fleet car through the player's own controls (throttle, then a dab of handbrake and steering for
// the slide), the wanted level is set by its debug command, the cruisers are dispatched and driven
// by policeDispatch, with their light bars on steady burn for the still. The camera is cut low on
// the kerb side ahead of the coupe, looking back down the avenue at the chase.
import { GAME_COMMANDS } from '../core/events/gameCommands.js';
import { GAME_STATE } from '../core/state/gameStates.js';

/** [westbound lane (0 beside the median), metres behind the lead at the start] of each cruiser. */
const CRUISERS = [[0, 5], [1, 9], [2, 10], [0, 17]];
/** The lead's lane. */
const LEAD_LANE = 1;
/** Where along Gran Via (0 east end, 1 west end). */
const ALONG = 0.44;
/** The shot: hours, seconds flat out, then the slide. */
const SHOT = Object.freeze({ hours: 19.72, flatOut: 2.4, coast: 1.4, slide: 0.42, eyeAhead: 8.5, eyeSide: 3.2, eyeHeight: 0.58, lookBehind: 14, fieldOfView: 42 });

function avenueFrame(game) {
  const plan = game.systems.find('openWorldCity')?.plan;
  const street = plan?.stagingStreets?.find?.((each) => each.key === 'gran_via_marazul') ?? plan?.stagingStreets?.[0];
  const east = street?.eastEnd;
  const west = street?.westEnd;
  if (!east || !west) return { x: 0, z: 0, fx: 0, fz: -1, heading: 0, laneSide: (index) => 4 + index * 3.3 };
  const length = Math.hypot(west.x - east.x, west.z - east.z);
  const fx = (west.x - east.x) / length;
  const fz = (west.z - east.z) / length;
  let x = east.x + fx * length * ALONG;
  let z = east.z + fz * length * ALONG;
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

/** A point `side` metres to the right of the frame's direction and `ahead` metres along it. */
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
    title: 'A police chase down Gran Via Marazul at dusk',
    description: 'Three stars: the red coupe slides between the towers with four cruisers on its tail, light bars burning on the street.',
    run(game, tools) {
      const frame = avenueFrame(game);
      const { commands, input } = game;
      game.state.enter(GAME_STATE.PLAYING);
      commands.run(GAME_COMMANDS.TIME_SET, { hours: SHOT.hours });
      if (commands.has(GAME_COMMANDS.WEATHER_SET)) commands.run(GAME_COMMANDS.WEATHER_SET, { weather: 'clear', seconds: 0 });
      const start = at(frame, frame.laneSide(LEAD_LANE), 0);
      commands.run(GAME_COMMANDS.PLAYER_TELEPORT, { position: at(frame, frame.laneSide(LEAD_LANE) + 2.2, 0), heading: -frame.heading });
      tools.advance(0.1);
      const fleet = game.systems.get('vehicles');
      const dispatch = game.systems.find('policeDispatch');
      const coupe = fleet.spawn({ modelId: 'sports_coupe', position: start, heading: frame.heading, colour: '#C2161B', parked: false, ownerSystem: 'showcase' });
      commands.run(GAME_COMMANDS.PLAYER_ENTER_VEHICLE, { vehicleId: coupe });
      tools.advance(0.2);
      commands.run(GAME_COMMANDS.WANTED_SET_LEVEL, { level: 3 });
      for (const [lane, behind] of CRUISERS) {
        commands.run(GAME_COMMANDS.POLICE_SPAWN_UNIT, { unitKind: 'patrol_car', position: at(frame, frame.laneSide(lane), -behind), heading: -frame.heading });
      }
      if (dispatch) dispatch.lightBarPattern = 'steady';
      // Everyone sets off together: the coupe flat out, the cruisers closing in at pursuit speed.
      input.setVirtual('accelerate', true);
      tools.advance(SHOT.flatOut);
      // Off the throttle for a moment: the cruisers close up on the coupe's tail.
      input.setVirtual('accelerate', false);
      tools.advance(SHOT.coast);
      // A swerve towards the kerb with the handbrake on: the picture is taken mid-slide.
      input.setVirtual('steerRight', true);
      input.setVirtual('handbrake', true);
      tools.advance(SHOT.slide);
      input.setVirtual('handbrake', false);
      input.setVirtual('steerRight', false);
      const car = fleet.get(coupe)?.entity.position ?? start;
      const ground = game.systems.find('openWorldCity')?.groundHeightAt(car.x, car.z) ?? car.y;
      const lead = { x: car.x, z: car.z, fx: frame.fx, fz: frame.fz };
      // Low on the kerb side ahead of the coupe, looking back past it at the cruisers.
      const eye = at(lead, SHOT.eyeSide, SHOT.eyeAhead);
      const look = at(lead, -0.9, -SHOT.lookBehind);
      if (commands.has(GAME_COMMANDS.CAMERA_CUT_TO)) {
        commands.run(GAME_COMMANDS.CAMERA_CUT_TO, {
          position: { x: eye.x, y: ground + SHOT.eyeHeight, z: eye.z },
          target: { x: look.x, y: ground + 1.25, z: look.z },
          fieldOfView: SHOT.fieldOfView,
        });
      }
    },
  });
}

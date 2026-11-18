// The showcase scenes of the police: `police-chase`, dusk on Gran Via Marazul (19:43, the sky still
// glowing behind the towers) with three stars and four cruisers on the red coupe's tail, and
// `police-chase-night`, the same avenue at 22:40 with five stars: pursuit SUVs and cruisers behind
// the coupe and the police helicopter overhead holding its searchlight on it. Everything is the real
// game: the lead drives a fleet car through the player's own controls (throttle, then a dab of
// handbrake and steering for the slide), the wanted level is set by its debug command, the units are
// dispatched and driven by policeDispatch with their light bars on steady burn for the still (both
// halves lit: red pools on one side of each car, blue on the other), and the helicopter is the
// dispatch's own (placed at once instead of flying in). The camera is cut low on the kerb side ahead
// of the coupe, looking back down the avenue at the chase (up at the helicopter at night).
import { GAME_COMMANDS } from '../core/events/gameCommands.js';
import { GAME_STATE } from '../core/state/gameStates.js';

/** Where along Gran Via (0 east end, 1 west end). */
const ALONG = 0.44;
/** The lead's lane. */
const LEAD_LANE = 1;

const SHOTS = Object.freeze({
  'police-chase': {
    title: 'A police chase down Gran Via Marazul at dusk',
    description: 'Three stars: the red coupe slides between the towers with four cruisers on its tail, light bars burning on the street.',
    hours: 19.72, stars: 3, helicopter: false, spawnAfter: 0, flatOut: 2.4, coast: 1.4, slide: 0.42,
    eyeAhead: 8.5, eyeSide: 3.2, eyeHeight: 0.58, lookBehind: 14, lookHeight: 1.25, fieldOfView: 42,
    // [unit kind, westbound lane (0 beside the median), metres behind the lead when sent]
    units: [['patrol_car', 0, 5], ['patrol_car', 1, 9], ['patrol_car', 2, 10], ['patrol_car', 0, 17]],
  },
  'police-chase-night': {
    title: 'A five-star night chase with the police helicopter over Gran Via Marazul',
    description: 'Five stars at night: pursuit SUVs and cruisers on the red coupe, light bars throwing red and blue on the avenue, the helicopter overhead with its searchlight on the car.',
    hours: 22.65, stars: 5, helicopter: { altitude: 24, trail: 40 }, spawnAfter: 1.0, flatOut: 1.2, coast: 1.5, slide: 0.3,
    eyeAhead: 15, eyeSide: 2.6, eyeHeight: 1.3, lookBehind: 12, lookHeight: 7.5, fieldOfView: 56,
    units: [['pursuit_suv', 0, 6], ['patrol_car', 1, 8], ['pursuit_suv', 2, 10], ['patrol_car', 0, 16]],
  },
});

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

function stageChase(game, tools, shot) {
  const frame = avenueFrame(game);
  const { commands, input } = game;
  game.state.enter(GAME_STATE.PLAYING);
  commands.run(GAME_COMMANDS.TIME_SET, { hours: shot.hours });
  if (commands.has(GAME_COMMANDS.WEATHER_SET)) commands.run(GAME_COMMANDS.WEATHER_SET, { weather: 'clear', seconds: 0 });
  const start = at(frame, frame.laneSide(LEAD_LANE), 0);
  commands.run(GAME_COMMANDS.PLAYER_TELEPORT, { position: at(frame, frame.laneSide(LEAD_LANE) + 2.2, 0), heading: -frame.heading });
  tools.advance(0.1);
  const fleet = game.systems.get('vehicles');
  const dispatch = game.systems.find('policeDispatch');
  const coupe = fleet.spawn({ modelId: 'sports_coupe', position: start, heading: frame.heading, colour: '#C2161B', parked: false, ownerSystem: 'showcase' });
  commands.run(GAME_COMMANDS.PLAYER_ENTER_VEHICLE, { vehicleId: coupe });
  tools.advance(0.2);
  commands.run(GAME_COMMANDS.WANTED_SET_LEVEL, { level: shot.stars });
  if (dispatch) dispatch.lightBarPattern = 'steady';
  const carAt = () => fleet.get(coupe)?.entity.position ?? start;
  input.setVirtual('accelerate', true);
  if (shot.spawnAfter > 0) tools.advance(shot.spawnAfter);
  // The units are sent relative to where the coupe is now, so they start close on its tail.
  const now = carAt();
  const along = (now.x - frame.x) * frame.fx + (now.z - frame.z) * frame.fz;
  for (const [unitKind, lane, behind] of shot.units) {
    commands.run(GAME_COMMANDS.POLICE_SPAWN_UNIT, { unitKind, position: at(frame, frame.laneSide(lane), along - behind), heading: -frame.heading });
  }
  if (shot.helicopter && dispatch?.helicopter) {
    dispatch.forceHelicopter = true;
    Object.assign(dispatch.helicopter, shot.helicopter);
    const over = at(frame, frame.laneSide(LEAD_LANE), along - shot.helicopter.trail * 0.6);
    dispatch.helicopter.place(over.x, over.z, now.y, -frame.heading);
  }
  tools.advance(shot.flatOut);
  // Off the throttle for a moment: the units close up on the coupe's tail.
  input.setVirtual('accelerate', false);
  tools.advance(shot.coast);
  // A swerve towards the kerb with the handbrake on: the picture is taken mid-slide.
  input.setVirtual('steerRight', true);
  input.setVirtual('handbrake', true);
  tools.advance(shot.slide);
  input.setVirtual('handbrake', false);
  input.setVirtual('steerRight', false);
  const car = carAt();
  const ground = game.systems.find('openWorldCity')?.groundHeightAt(car.x, car.z) ?? car.y;
  const lead = { x: car.x, z: car.z, fx: frame.fx, fz: frame.fz };
  // Low on the kerb side ahead of the coupe, looking back past it at the chase.
  const eye = at(lead, shot.eyeSide, shot.eyeAhead);
  const look = at(lead, -0.9, -shot.lookBehind);
  if (commands.has(GAME_COMMANDS.CAMERA_CUT_TO)) {
    commands.run(GAME_COMMANDS.CAMERA_CUT_TO, {
      position: { x: eye.x, y: ground + shot.eyeHeight, z: eye.z },
      target: { x: look.x, y: ground + shot.lookHeight, z: look.z },
      fieldOfView: shot.fieldOfView,
    });
  }
}

/**
 * Registers the scenes with the showcase registry.
 * @param {import('../core/systems/gameContext.js').GameContext} context
 */
export function registerPoliceChaseShowcase(context) {
  for (const [name, shot] of Object.entries(SHOTS)) {
    context.showcase.register({ name, title: shot.title, description: shot.description, run: (game, tools) => stageChase(game, tools, shot) });
  }
}

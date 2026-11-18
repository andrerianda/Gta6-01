// The fleet's showcase scenes, everything spawned and moved by the real fleet and physics (no
// picture is faked). Both stand on Bulevar Dorado (the beachfront staging street, facing west
// into the golden-hour sun) when the city plan exists, else around the origin:
// - ?shot=vehicles-golden-hour: cars parked along the kerb in catalog colours and a sports coupe
//   driven up the street towards the camera, braking.
// - ?shot=vehicles-crash: a coupe rammed into the side of a parked sedan at about 60 km/h,
//   then backed off: dents, cracked and shattered glass, a lost bumper.
import { GAME_COMMANDS } from '../core/events/gameCommands.js';
import { GAME_STATE } from '../core/state/gameStates.js';

/** [model, side (m right of the lane line), ahead (m along the street), heading offset, colour]. */
const PARKED = [
  ['sports_coupe', -3.1, 15, 0.02, '#1E63C4'],
  ['family_sedan', -3.1, 8.6, -0.02, null],
  ['sports_coupe', -3.1, 2.4, 0.01, '#F0B323'],
  ['family_sedan', 3.6, 20, Math.PI, '#EDEBE6'],
];

/**
 * A street frame: an origin on Bulevar Dorado, the unit direction along it (westwards) and to
 * its right, its compass heading, and the side offset of the kerbside parking.
 */
function streetFrame(game) {
  const plan = game.systems.find('openWorldCity')?.plan;
  const street = plan?.stagingStreets?.find?.((each) => each.key === 'bulevar_dorado') ?? plan?.stagingStreets?.[0];
  const east = street?.eastEnd;
  const west = street?.westEnd;
  if (!east || !west) return { x: 0, z: 0, fx: 0, fz: -1, heading: 0, kerb: 3.1 };
  const length = Math.hypot(west.x - east.x, west.z - east.z);
  const fx = (west.x - east.x) / length;
  const fz = (west.z - east.z) / length;
  let x = east.x + fx * length * 0.42;
  let z = east.z + fz * length * 0.42;
  const road = plan.nearestRoad?.(x, z, 60);
  if (road) {
    x = road.x;
    z = road.z;
  }
  const half = road?.segment?.halfWidth ?? 7;
  return { x, z, fx, fz, heading: Math.atan2(fx, -fz), kerb: Math.max(2.6, half - (road?.segment?.shoulder ?? 0) - 1.3) };
}

function at(frame, side, ahead) {
  // Right of the street direction (fx, fz) is (-fz, fx).
  return { x: frame.x - frame.fz * side + frame.fx * ahead, z: frame.z + frame.fx * side + frame.fz * ahead };
}

function setUp(game, tools, frame, side, ahead, turn) {
  game.state.enter(GAME_STATE.PLAYING);
  game.commands.run(GAME_COMMANDS.TIME_SET, { hours: 18.83 });
  if (game.commands.has(GAME_COMMANDS.PLAYER_TELEPORT)) {
    // The player's heading grows to the left: minus the compass heading.
    game.commands.run(GAME_COMMANDS.PLAYER_TELEPORT, { position: at(frame, side, ahead), heading: -frame.heading + turn });
  }
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
      const frame = streetFrame(game);
      const fleet = setUp(game, tools, frame, -0.6 * frame.kerb / 3.1, -6, 0.5);
      for (const [modelId, side, ahead, turn, colour] of PARKED) {
        const sign = Math.sign(side);
        fleet.spawn({
          modelId, position: at(frame, sign * frame.kerb, ahead), heading: frame.heading + turn,
          colour: colour ?? undefined, parked: true, ownerSystem: 'showcase',
        });
      }
      const driven = fleet.spawn({
        modelId: 'sports_coupe', position: at(frame, -frame.kerb * 0.52, 44), heading: frame.heading + Math.PI,
        colour: '#C2261F', parked: false, ownerSystem: 'showcase',
      });
      const controls = fleet.controlsOf(driven);
      controls.throttle = 0.9;
      tools.advance(3.4);
      controls.throttle = 0;
      controls.brake = 0.7;
      controls.steer = -0.3;
      tools.advance(0.4);
    },
  });

  context.showcase.register({
    name: 'vehicles-crash',
    title: 'A coupe rammed into a parked sedan',
    description: 'Vehicle damage: dented panels, broken glass, a torn-off bumper.',
    run(game, tools) {
      const frame = streetFrame(game);
      const fleet = setUp(game, tools, frame, 5.5, -7, 0.4);
      fleet.spawn({ modelId: 'family_sedan', position: at(frame, 0, 6), heading: frame.heading + Math.PI / 2, parked: true, ownerSystem: 'showcase' });
      const coupe = fleet.spawn({ modelId: 'sports_coupe', position: at(frame, -0.6, -20), heading: frame.heading, colour: '#178F8A', parked: false, ownerSystem: 'showcase' });
      const controls = fleet.controlsOf(coupe);
      controls.throttle = 1;
      tools.advance(3.1);
      controls.throttle = 0;
      controls.brake = 1;
      tools.advance(0.6);
      controls.brake = 0;
      controls.reverse = true;
      controls.throttle = 0.7;
      controls.steer = 0.5;
      tools.advance(1.3);
      controls.throttle = 0;
      controls.brake = 1;
      tools.advance(0.6);
    },
  });
}

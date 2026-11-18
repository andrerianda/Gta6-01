// The traffic's showcase scenes at golden hour (18:50), everything spawned and driven by the real
// traffic system and physics: the player is teleported, the traffic fills the streets around
// the new place as it does after any teleport, and the rules play forward before the picture.
// - ?shot=traffic-gran-via: Gran Via Marazul among the towers, seen from the north pavement at
//   head height over the cars, looking west into the sun along both carriageways.
// - ?shot=traffic-junction: a signalled junction of Gran Via from a corner, cars queued at the
//   red light on one road while the other flows and turns through.
import { GAME_COMMANDS } from '../core/events/gameCommands.js';
import { GAME_STATE } from '../core/state/gameStates.js';

const ALONG = 0.55;

/** A frame on Gran Via: a centre point, the westward direction and the road's half width. */
function granVia(game) {
  const city = game.systems.find('openWorldCity');
  const street = city?.plan?.stagingStreets?.find((each) => each.key === 'gran_via_marazul');
  if (!street) return null;
  const length = Math.hypot(street.westEnd.x - street.eastEnd.x, street.westEnd.z - street.eastEnd.z);
  const fx = (street.westEnd.x - street.eastEnd.x) / length;
  const fz = (street.westEnd.z - street.eastEnd.z) / length;
  const x = street.eastEnd.x + fx * length * ALONG;
  const z = street.eastEnd.z + fz * length * ALONG;
  const road = city.nearestRoad(x, z, 60);
  return { city, x, z, fx, fz, half: road?.segment?.halfWidth ?? 14, y: city.groundHeightAt(x, z) };
}

// Right of the direction (fx, fz) is (-fz, fx).
function at(frame, side, ahead, height = 0) {
  return { x: frame.x - frame.fz * side + frame.fx * ahead, y: frame.y + height, z: frame.z + frame.fx * side + frame.fz * ahead };
}

async function arrive(game, tools, position, heading) {
  game.state.enter(GAME_STATE.PLAYING);
  game.commands.run(GAME_COMMANDS.TIME_SET, { hours: 18.83 });
  if (game.commands.has(GAME_COMMANDS.PLAYER_TELEPORT)) game.commands.run(GAME_COMMANDS.PLAYER_TELEPORT, { position, heading });
  tools.advance(0.2);
  await tools.whenIdle();
}

function cut(game, position, target) {
  if (game.commands.has(GAME_COMMANDS.CAMERA_CUT_TO)) game.commands.run(GAME_COMMANDS.CAMERA_CUT_TO, { position, target });
}

/**
 * Registers the traffic showcase scenes.
 * @param {import('../core/systems/gameContext.js').GameContext} context
 */
export function registerTrafficShowcase(context) {
  context.showcase.register({
    name: 'traffic-gran-via',
    title: 'Traffic on Gran Via Marazul',
    description: 'Both carriageways of the grand avenue flowing among the towers at golden hour.',
    async run(game, tools) {
      const frame = granVia(game);
      if (!frame) return;
      const side = frame.half - 2.5;
      await arrive(game, tools, at(frame, side, -6), -Math.atan2(frame.fx, -frame.fz));
      tools.advance(5);
      cut(game, at(frame, side + 0.5, -4, 3.6), at(frame, -3, 120, 1.5));
      tools.advance(0.5);
    },
  });

  context.showcase.register({
    name: 'traffic-junction',
    title: 'A Gran Via junction',
    description: 'Queues at the red light, cars turning through on green, at golden hour.',
    async run(game, tools) {
      const frame = granVia(game);
      if (!frame) return;
      const nodes = frame.city.plan.roads.nodes;
      let junction = null;
      for (const node of nodes) {
        if (node.control !== 'signals') continue;
        if (!junction || Math.hypot(node.x - frame.x, node.z - frame.z) < Math.hypot(junction.x - frame.x, junction.z - frame.z)) junction = node;
      }
      if (!junction) return;
      const centre = { ...frame, x: junction.x, z: junction.z, y: frame.city.groundHeightAt(junction.x, junction.z) };
      const corner = junction.radius + 4;
      await arrive(game, tools, at(centre, corner, -corner), -Math.atan2(frame.fx, -frame.fz));
      tools.advance(14);
      cut(game, at(centre, corner + 6, -corner - 14, 9), at(centre, -2, 6, 0));
      tools.advance(0.5);
    },
  });
}

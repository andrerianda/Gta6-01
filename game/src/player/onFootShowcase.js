// The on-foot showcase scenes: the lead walking, running and sprinting west down the pavement of
// Gran Vía Marazul at golden hour (the sun just right of the vanishing point, the towers ahead),
// seen over the right shoulder by the follow camera. They set the game up through commands and
// play the real rules forward (the move keys held, the camera following), so the picture is the
// game's own. Without a city plan they fall back to the open ground near the origin.
import { GAME_COMMANDS } from '../core/events/gameCommands.js';
import { GAME_STATE } from '../core/state/gameStates.js';

/** The scenes: name, title, pace, seconds walked, where along the street (0 east end, 1 west end). */
const ON_FOOT_SCENES = [
  { name: 'on-foot-walk', title: 'The lead walking at golden hour', walk: true, sprint: false, seconds: 3, along: 0.42 },
  { name: 'on-foot-run', title: 'The lead running at golden hour', walk: false, sprint: false, seconds: 2.5, along: 0.43 },
  { name: 'on-foot-sprint', title: 'The lead sprinting at golden hour', walk: false, sprint: true, seconds: 2.5, along: 0.44 },
];

/** Metres from the street's centre line to where the lead walks (the north pavement). */
const PAVEMENT_OFFSET = 12;

/**
 * A spot on a staging street, facing along it (westwards), off the centre line to the right.
 * @param {import('../core/systems/gameContext.js').GameContext} context
 * @param {number} along 0 at the east end, 1 at the west end.
 * @param {string} [streetKey]
 * @returns {{x: number, z: number, heading: number}}
 */
export function stagingSpot(context, along, streetKey = 'gran_via_marazul') {
  const city = context.systems.find('openWorldCity');
  const streets = city && city.plan && city.plan.stagingStreets;
  const street = streets ? streets.find((each) => each.key === streetKey) : null;
  if (!street) return { x: -16 + along * 4, z: 18 - along * 4, heading: -0.75 };
  const heading = -((street.headingDegrees * Math.PI) / 180);
  const x = street.eastEnd.x + (street.westEnd.x - street.eastEnd.x) * along;
  const z = street.eastEnd.z + (street.westEnd.z - street.eastEnd.z) * along;
  const rightX = Math.cos(heading), rightZ = -Math.sin(heading);
  const spot = { x: x + rightX * PAVEMENT_OFFSET, z: z + rightZ * PAVEMENT_OFFSET, heading: Math.atan2(Math.sin(heading), Math.cos(heading)) };
  // Prefer a point of the pedestrian graph: the pavement on the right-hand side, level with the spot.
  const points = typeof city.spawnPointsNear === 'function' ? city.spawnPointsNear(spot.x, spot.z, 30, 'pedestrian', 64) : [];
  let best = Infinity;
  for (const point of points) {
    const lateral = (point.x - x) * rightX + (point.z - z) * rightZ;
    const ahead = (point.x - x) * -rightZ + (point.z - z) * rightX;
    if (lateral < 5 || lateral > 32) continue;
    const score = Math.abs(ahead) + Math.abs(lateral - PAVEMENT_OFFSET) * 0.5;
    if (score < best) { best = score; spot.x = point.x; spot.z = point.z; }
  }
  return spot;
}

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
      async run(game, tools) {
        game.state.enter(GAME_STATE.PLAYING);
        game.commands.run(GAME_COMMANDS.TIME_SET, { hours: 18.83 });
        const spot = stagingSpot(game, scene.along);
        game.commands.run(GAME_COMMANDS.PLAYER_TELEPORT, { position: { x: spot.x, z: spot.z }, heading: spot.heading });
        await tools.whenIdle();
        // Stand the lead on the ground the city streamed in around it.
        game.commands.run(GAME_COMMANDS.PLAYER_TELEPORT, { position: { x: spot.x, z: spot.z }, heading: spot.heading });
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

// Staging helpers shared by the showcase director's scenes: a frame on a staging street (an
// origin, the unit direction along it, the lane and kerb offsets), points in that frame, the
// ground under a point, a camera cut, and the opening every scene shares (state, clock, weather,
// the lead standing on streamed ground). They only read the city plan and run the game's own
// commands, so a scene built from them shows nothing the game would not create itself.
import { GAME_COMMANDS } from '../core/events/gameCommands.js';
import { GAME_STATE } from '../core/state/gameStates.js';

/**
 * A frame on a staging street, facing along it westwards. Positive `side` is to the right of the
 * direction of travel (the north side of both staging streets), positive `ahead` is westwards.
 * @param {object} game The game context.
 * @param {string} streetKey 'bulevar_dorado' or 'gran_via_marazul'.
 * @param {number} along 0 at the east end, 1 at the west end.
 * @returns {{x: number, z: number, fx: number, fz: number, compass: number, half: number,
 *   kerb: number, laneSide: (lane: number) => number}}
 */
export function streetFrameOf(game, streetKey, along) {
  const plan = game.systems.find('openWorldCity')?.plan;
  const street = plan?.stagingStreets?.find?.((each) => each.key === streetKey) ?? plan?.stagingStreets?.[0];
  const east = street?.eastEnd;
  const west = street?.westEnd;
  if (!east || !west) {
    return { x: 0, z: 0, fx: 0, fz: -1, compass: 0, half: 7, kerb: 5.5, laneSide: (lane) => 2.5 + 3.3 * (lane + 0.5) };
  }
  const length = Math.hypot(west.x - east.x, west.z - east.z);
  const fx = (west.x - east.x) / length;
  const fz = (west.z - east.z) / length;
  let x = east.x + fx * length * along;
  let z = east.z + fz * length * along;
  const road = plan.nearestRoad?.(x, z, 60);
  if (road) {
    x = road.x;
    z = road.z;
  }
  const segment = road?.segment;
  const half = segment?.halfWidth ?? 9;
  const median = (segment?.medianWidth ?? 5) / 2;
  const width = segment?.laneWidth ?? 3.3;
  const lanes = Math.max(1, Math.min(segment?.lanesForward ?? 3, segment?.lanesBackward ?? 3));
  return {
    x, z, fx, fz,
    compass: Math.atan2(fx, -fz),
    half,
    kerb: Math.max(2.6, half - (segment?.shoulder ?? 0) - 1.3),
    laneSide: (lane) => median + width * (Math.min(lane, lanes - 1) + 0.5),
  };
}

/**
 * A point in a street frame.
 * @param {{x: number, z: number, fx: number, fz: number}} frame
 * @param {number} side Metres to the right of the direction.
 * @param {number} ahead Metres along the direction.
 * @returns {{x: number, z: number}}
 */
export function pointInFrame(frame, side, ahead) {
  return { x: frame.x - frame.fz * side + frame.fx * ahead, z: frame.z + frame.fx * side + frame.fz * ahead };
}

/**
 * The nearest pedestrian-graph point to a spot whose side offset lies in a range, or the spot.
 * @param {object} game
 * @param {{x: number, z: number, fx: number, fz: number}} frame
 * @param {number} side The wanted side offset.
 * @param {number} ahead The wanted distance along.
 * @param {[number, number]} range The side offsets a pavement point may have.
 */
export function pavementPointNear(game, frame, side, ahead, range) {
  const spot = pointInFrame(frame, side, ahead);
  const city = game.systems.find('openWorldCity');
  const points = typeof city?.spawnPointsNear === 'function' ? city.spawnPointsNear(spot.x, spot.z, 30, 'pedestrian', 64) : [];
  let best = Infinity;
  let chosen = spot;
  for (const point of points) {
    const dx = point.x - frame.x;
    const dz = point.z - frame.z;
    const lateral = -dx * frame.fz + dz * frame.fx;
    const along = dx * frame.fx + dz * frame.fz;
    if (lateral < range[0] || lateral > range[1]) continue;
    const score = Math.abs(along - ahead) + Math.abs(lateral - side) * 0.5;
    if (score < best) {
      best = score;
      chosen = { x: point.x, z: point.z };
    }
  }
  return chosen;
}

/** Ground height under a point, from the city (0 without one). */
export function groundAt(game, x, z) {
  return game.systems.find('openWorldCity')?.groundHeightAt(x, z) ?? 0;
}

/**
 * Opens a scene: the playing state, the clock, clear weather and the given traffic and crowd.
 * @param {object} game
 * @param {{hours: number, weather?: string, traffic?: number, crowd?: number}} setting
 */
export function openScene(game, { hours, weather = 'clear', traffic, crowd }) {
  const { commands } = game;
  game.state.enter(GAME_STATE.PLAYING);
  commands.run(GAME_COMMANDS.TIME_SET, { hours: tunedHours(hours) });
  if (commands.has(GAME_COMMANDS.WEATHER_SET)) commands.run(GAME_COMMANDS.WEATHER_SET, { weather, seconds: 0 });
  if (traffic !== undefined && commands.has(GAME_COMMANDS.TRAFFIC_SET_DENSITY)) commands.run(GAME_COMMANDS.TRAFFIC_SET_DENSITY, { scale: traffic });
  if (crowd !== undefined && commands.has(GAME_COMMANDS.PEDESTRIANS_SET_DENSITY)) commands.run(GAME_COMMANDS.PEDESTRIANS_SET_DENSITY, { scale: crowd });
}

/**
 * The scene's clock, or the page's `&hours=` when it gives one (for trying a shot at other times
 * of day without changing the scene; the judged pictures never pass it).
 * @param {number} hours
 * @returns {number}
 */
function tunedHours(hours) {
  const given = Number(new URLSearchParams(globalThis.location?.search ?? '').get('hours'));
  return Number.isFinite(given) && given > 0 && given < 24 ? given : hours;
}

/**
 * Puts the lead on foot at a spot, waits for the city to stream in around it, then stands it on
 * the streamed ground.
 * @param {object} game
 * @param {object} tools The scene's tools.
 * @param {{x: number, z: number}} spot
 * @param {number} heading The player's heading (minus the compass heading).
 */
export async function placeLead(game, tools, spot, heading) {
  game.commands.run(GAME_COMMANDS.PLAYER_TELEPORT, { position: { x: spot.x, z: spot.z }, heading });
  await tools.whenIdle();
  game.commands.run(GAME_COMMANDS.PLAYER_TELEPORT, { position: { x: spot.x, z: spot.z }, heading });
  tools.advance(0.1);
}

/**
 * Holds the camera at a position looking at a target (the follow camera's CAMERA_CUT_TO).
 * @param {object} game
 * @param {{x: number, y: number, z: number}} position
 * @param {{x: number, y: number, z: number}} target
 * @param {number} [fieldOfView] Vertical, in degrees.
 */
export function cutCamera(game, position, target, fieldOfView) {
  if (game.commands.has(GAME_COMMANDS.CAMERA_CUT_TO)) game.commands.run(GAME_COMMANDS.CAMERA_CUT_TO, { position, target, fieldOfView });
}

/** The lead's entity id, or null. */
export function leadIdOf(game) {
  return game.systems.find('player')?.entity?.id ?? null;
}

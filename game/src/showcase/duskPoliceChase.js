// The chase picture, scene `police-chase-dusk`: Gran Via Marazul at 19:40, just after sunset,
// the street lights and the towers' windows on. The lead drives a red coupe flat out westwards
// with three stars and throws it into a handbrake drift; cruisers dispatched by the police system
// box it in, one alongside on each side and one nosing across ahead, their light bars burning red
// and blue on the asphalt (the police system's steady pattern, so both halves are lit in the
// still). The picture is the game's own centred vehicle chase camera, exactly what the player sees
// at the wheel (the owner's rule: no low cinematic cuts), with the HUD's stars, speedometer and
// minimap. stagePoliceChase is shared with the cover (goldenHourCover.js).
import { GAME_COMMANDS } from '../core/events/gameCommands.js';
import { groundAt, openScene, placeLead, pointInFrame, streetFrameOf } from './showcaseStaging.js';

/**
 * [metres to the right of the coupe (towards the kerb), metres ahead of it, compass turn of the
 * nose (radians, + towards the kerb)] for each cruiser, measured from the sliding coupe when they
 * are sent. The coupe moves about a metre ahead before the picture, so the first two end
 * alongside in the chase camera's view; the third, on its tail behind the camera, throws its
 * light on the road; the fourth noses across ahead to cut it off. A cruiser sent from far behind
 * never closes the gap in a few seconds: the coupe out-accelerates it.
 */
export const CHASE_CRUISERS = Object.freeze([[-3.4, 0.9, 0], [3.3, -0.4, 0], [-3.4, -8.5, 0], [-2.4, 17, 0.4]]);

/**
 * Registers the chase scene.
 * @param {object} context The game context.
 * @returns {() => void} Removes the scene again.
 */
export function registerDuskPoliceChase(context) {
  return context.showcase.register({
    name: 'police-chase-dusk',
    title: 'Three stars on Gran Via Marazul at dusk',
    description: 'The lead\'s coupe drifting between the towers in the chase camera, boxed in by cruisers with their light bars burning.',
    async run(game, tools) {
      await stagePoliceChase(game, tools, { street: 'gran_via_marazul', along: 0.45, hours: 19.68 });
    },
  });
}

/**
 * Stages a police chase seen through the game's chase camera: the lead in a red coupe on a staging
 * street, three stars, flat out westwards, then a handbrake slide with cruisers sent around it.
 * @param {object} game The game context.
 * @param {object} tools The showcase tools (advance, whenIdle).
 * @param {object} setup street, along, hours, and optional lane, traffic, crowd, flatOut,
 *   slideBefore, slideAfter, cruisers, stars, and `prepare(frame, start)`: an async hook run once
 *   the lead sits in the coupe, before the drive (the cover stages its wreck there).
 * @returns {Promise<{frame: object, coupe: number}>} The street frame and the coupe's id.
 */
export async function stagePoliceChase(game, tools, setup) {
  const { commands, input } = game;
  const lane = setup.lane ?? 1;
  openScene(game, { hours: setup.hours, traffic: setup.traffic ?? 0.6, crowd: setup.crowd ?? 1 });
  const frame = streetFrameOf(game, setup.street, setup.along);
  const start = pointInFrame(frame, frame.laneSide(lane), 0);
  await placeLead(game, tools, pointInFrame(frame, frame.laneSide(lane) + 2.2, 0), -frame.compass);
  const fleet = game.systems.get('vehicles');
  const coupe = fleet.spawn({ modelId: 'sports_coupe', position: start, heading: frame.compass, colour: '#C2161B', parked: false, ownerSystem: 'showcase' });
  commands.run(GAME_COMMANDS.PLAYER_ENTER_VEHICLE, { vehicleId: coupe });
  tools.advance(0.2);
  if (setup.prepare) await setup.prepare(frame, start);
  commands.run(GAME_COMMANDS.WANTED_SET_LEVEL, { level: setup.stars ?? 3 });
  // Steady burn: both halves of every light bar lit, so red and blue read in the still.
  const dispatch = game.systems.find('policeDispatch');
  if (dispatch) dispatch.lightBarPattern = 'steady';
  // Flat out down the street: the chase camera settles behind the coupe.
  input.setVirtual('accelerate', true);
  tools.advance(setup.flatOut ?? 2);
  // Off the throttle and a swerve towards the kerb on the handbrake: the picture is mid-drift,
  // the camera swinging after the coupe's nose.
  input.setVirtual('accelerate', false);
  input.setVirtual('steerRight', true);
  input.setVirtual('handbrake', true);
  tools.advance(setup.slideBefore ?? 0.5);
  // The cruisers, sent around the sliding coupe, kept off the kerb and the median.
  const sliding = fleet.get(coupe)?.entity.position ?? start;
  const along = (sliding.x - frame.x) * frame.fx + (sliding.z - frame.z) * frame.fz;
  const side = -(sliding.x - frame.x) * frame.fz + (sliding.z - frame.z) * frame.fx;
  const nearest = frame.laneSide(0) - 0.4;
  const farthest = frame.kerb - 1.3;
  for (const [right, ahead, turn] of setup.cruisers ?? CHASE_CRUISERS) {
    const lateral = Math.min(farthest, Math.max(nearest, side + right));
    const position = pointInFrame(frame, lateral, along + ahead);
    commands.run(GAME_COMMANDS.POLICE_SPAWN_UNIT, { unitKind: 'patrol_car', position, heading: -(frame.compass + turn) });
  }
  tools.advance(setup.slideAfter ?? 0.12);
  input.setVirtual('handbrake', false);
  input.setVirtual('steerRight', false);
  logChaseCamera(game, fleet.get(coupe)?.entity.position ?? start);
  return { frame, coupe };
}

/** Logs where the chase camera stands relative to the coupe (for checking the framing). */
function logChaseCamera(game, car) {
  const camera = game.view?.camera;
  if (!camera?.matrixWorld) return;
  const m = camera.matrixWorld.elements;
  const back = Math.hypot(m[12] - car.x, m[14] - car.z);
  const height = m[13] - groundAt(game, m[12], m[14]);
  const pitch = Math.asin(Math.max(-1, Math.min(1, -m[9]))) * 180 / Math.PI;
  game.log?.info?.(`showcase chase camera: ${back.toFixed(2)} m behind, ${height.toFixed(2)} m up, pitch ${pitch.toFixed(1)} deg, fov ${Number(camera.fov).toFixed(1)}`);
}

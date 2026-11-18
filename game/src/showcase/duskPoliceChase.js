// The chase picture, scene `police-chase-dusk`: Gran Via Marazul at 19:40, just after sunset,
// the street lights and the towers' windows on. The lead drives a red coupe flat out westwards
// with three stars and throws it into a handbrake drift; four cruisers dispatched by the police
// system are on its tail, one alongside on the median side, their light bars burning red and blue
// (the police system's steady pattern, so both halves are lit in the still). The camera is cut low
// on the kerb side just ahead of the sliding coupe, looking back down the avenue at the chase, so
// the coupe, the cruisers and the HUD (stars, speedometer, minimap) read at a glance.
import { GAME_COMMANDS } from '../core/events/gameCommands.js';
import { cutCamera, groundAt, openScene, placeLead, pointInFrame, streetFrameOf } from './showcaseStaging.js';

/**
 * [westbound lane (0 beside the median), metres behind the lead] for each cruiser at the start.
 * The coupe out-accelerates the cruisers by about 5 m over the run, so the first one, starting
 * a little ahead on the median side, ends alongside and the others close behind.
 */
const CRUISERS = [[0, -2.5], [2, 3], [1, 8], [0, 13]];
/** The lead's lane. */
const LEAD_LANE = 1;
/** Where along Gran Via (0 east end, 1 west end). */
const ALONG = 0.45;
/** The shot: the clock, seconds flat out, coasting and sliding, and the camera. */
const SHOT = Object.freeze({
  hours: 19.68, flatOut: 1.7, coast: 0.15, slide: 0.65,
  eyeAhead: 8, eyeSide: 3.4, eyeHeight: 0.75, lookBehind: 13, lookSide: -1.2, lookHeight: 1.2, fieldOfView: 44,
});

/**
 * Registers the chase scene.
 * @param {object} context The game context.
 * @returns {() => void} Removes the scene again.
 */
export function registerDuskPoliceChase(context) {
  return context.showcase.register({
    name: 'police-chase-dusk',
    title: 'Three stars on Gran Via Marazul at dusk',
    description: 'The lead\'s coupe drifting between the towers with four cruisers on its tail, one alongside, light bars burning.',
    async run(game, tools) {
      const { commands, input } = game;
      openScene(game, { hours: SHOT.hours, traffic: 0.6, crowd: 1 });
      const frame = streetFrameOf(game, 'gran_via_marazul', ALONG);
      const start = pointInFrame(frame, frame.laneSide(LEAD_LANE), 0);
      await placeLead(game, tools, pointInFrame(frame, frame.laneSide(LEAD_LANE) + 2.2, 0), -frame.compass);
      const fleet = game.systems.get('vehicles');
      const coupe = fleet.spawn({ modelId: 'sports_coupe', position: start, heading: frame.compass, colour: '#C2161B', parked: false, ownerSystem: 'showcase' });
      commands.run(GAME_COMMANDS.PLAYER_ENTER_VEHICLE, { vehicleId: coupe });
      tools.advance(0.2);
      commands.run(GAME_COMMANDS.WANTED_SET_LEVEL, { level: 3 });
      for (const [lane, behind] of CRUISERS) {
        commands.run(GAME_COMMANDS.POLICE_SPAWN_UNIT, { unitKind: 'patrol_car', position: pointInFrame(frame, frame.laneSide(lane), -behind), heading: -frame.compass });
      }
      // Steady burn: both halves of every light bar lit, so red and blue read in the still.
      const dispatch = game.systems.find('policeDispatch');
      if (dispatch) dispatch.lightBarPattern = 'steady';
      // Everyone sets off together: the coupe flat out, the cruisers closing at pursuit speed.
      input.setVirtual('accelerate', true);
      tools.advance(SHOT.flatOut);
      // Off the throttle: the cruisers close up, the first one draws alongside.
      input.setVirtual('accelerate', false);
      tools.advance(SHOT.coast);
      // A swerve towards the kerb on the handbrake: the picture is taken mid-drift.
      input.setVirtual('steerRight', true);
      input.setVirtual('handbrake', true);
      tools.advance(SHOT.slide);
      input.setVirtual('handbrake', false);
      input.setVirtual('steerRight', false);
      const car = fleet.get(coupe)?.entity.position ?? start;
      const ground = groundAt(game, car.x, car.z);
      const lead = { x: car.x, z: car.z, fx: frame.fx, fz: frame.fz };
      // Low on the kerb side just ahead of the coupe, looking back past it at the cruisers.
      const eye = pointInFrame(lead, SHOT.eyeSide, SHOT.eyeAhead);
      const look = pointInFrame(lead, SHOT.lookSide, -SHOT.lookBehind);
      cutCamera(game, { x: eye.x, y: ground + SHOT.eyeHeight, z: eye.z }, { x: look.x, y: ground + SHOT.lookHeight, z: look.z }, SHOT.fieldOfView);
    },
  });
}

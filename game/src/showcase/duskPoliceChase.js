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
 * [westbound lane (0 beside the median), metres to the right of the lane's centre, metres behind
 * the coupe] for each cruiser. They are sent while the coupe is already sliding, measured from
 * where it is then, so the first ends alongside on the median side (the coupe moves about a
 * metre ahead before the picture) and the others bunched close on its tail. A cruiser sent from
 * far behind never closes the gap in a few seconds: the coupe out-accelerates it.
 */
const CRUISERS = [[0, -0.5, -0.6], [2, 0, 6.5], [1, 0, 10], [0, 0, 14.5]];
/** The lead's lane. */
const LEAD_LANE = 1;
/** Where along Gran Via (0 east end, 1 west end). */
const ALONG = 0.45;
/**
 * The shot: the clock; seconds flat out, sliding before the cruisers are sent and after (time
 * for their light bars to burn); the camera.
 */
const SHOT = Object.freeze({
  hours: 19.68, flatOut: 2, slideBefore: 0.5, slideAfter: 0.12,
  eyeAhead: 8, eyeSide: 3.4, eyeHeight: 0.85, lookBehind: 12, lookSide: -1.6, lookHeight: 1.2, fieldOfView: 48,
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
      // Steady burn: both halves of every light bar lit, so red and blue read in the still.
      const dispatch = game.systems.find('policeDispatch');
      if (dispatch) dispatch.lightBarPattern = 'steady';
      // Flat out down the avenue.
      input.setVirtual('accelerate', true);
      tools.advance(SHOT.flatOut);
      // Off the throttle and a swerve towards the kerb on the handbrake: the picture is mid-drift.
      input.setVirtual('accelerate', false);
      input.setVirtual('steerRight', true);
      input.setVirtual('handbrake', true);
      tools.advance(SHOT.slideBefore);
      // The cruisers, sent around the sliding coupe: one alongside, three bunched on its tail.
      const sliding = fleet.get(coupe)?.entity.position ?? start;
      const along = (sliding.x - frame.x) * frame.fx + (sliding.z - frame.z) * frame.fz;
      for (const [lane, offset, behind] of CRUISERS) {
        const position = pointInFrame(frame, frame.laneSide(lane) + offset, along - behind);
        commands.run(GAME_COMMANDS.POLICE_SPAWN_UNIT, { unitKind: 'patrol_car', position, heading: -frame.compass });
      }
      tools.advance(SHOT.slideAfter);
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

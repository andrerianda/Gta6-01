// The chase picture, scene `police-chase-dusk`: Gran Via Marazul at 19:40, just after sunset,
// the street lights and the towers' windows on. The lead drives a red coupe flat out westwards
// with three stars; four cruisers dispatched by the police system chase it, light bars flashing.
// The camera is cut low ahead of the coupe on the kerb side, looking back down the avenue at the
// chase, so the coupe, the cruisers and the HUD (stars, speedometer, minimap) read at a glance.
import { GAME_COMMANDS } from '../core/events/gameCommands.js';
import { cutCamera, groundAt, openScene, placeLead, pointInFrame, streetFrameOf } from './showcaseStaging.js';

/** [westbound lane (0 beside the median), metres behind the lead] for each cruiser. */
const CRUISERS = [[0, 8], [2, 13], [1, 20], [0, 29]];
/** The lead's lane. */
const LEAD_LANE = 1;
/** Where along Gran Via (0 east end, 1 west end). */
const ALONG = 0.47;

/**
 * Registers the chase scene.
 * @param {object} context The game context.
 * @returns {() => void} Removes the scene again.
 */
export function registerDuskPoliceChase(context) {
  return context.showcase.register({
    name: 'police-chase-dusk',
    title: 'Three stars on Gran Via Marazul at dusk',
    description: 'The lead\'s coupe flat out between the towers with four cruisers on its tail, light bars flashing.',
    async run(game, tools) {
      const { commands } = game;
      openScene(game, { hours: 19.68, traffic: 0.8, crowd: 1 });
      const frame = streetFrameOf(game, 'gran_via_marazul', ALONG);
      const start = pointInFrame(frame, frame.laneSide(LEAD_LANE), 0);
      await placeLead(game, tools, pointInFrame(frame, frame.laneSide(LEAD_LANE) + 2.2, 0), -frame.compass);
      const fleet = game.systems.get('vehicles');
      const coupe = fleet.spawn({ modelId: 'sports_coupe', position: start, heading: frame.compass, colour: '#C2161B', parked: false, ownerSystem: 'showcase' });
      commands.run(GAME_COMMANDS.PLAYER_ENTER_VEHICLE, { vehicleId: coupe });
      tools.advance(0.2);
      game.input.setVirtual('accelerate', true);
      tools.advance(1.2);
      const moving = fleet.get(coupe)?.entity.position ?? start;
      const along = (moving.x - frame.x) * frame.fx + (moving.z - frame.z) * frame.fz;
      commands.run(GAME_COMMANDS.WANTED_SET_LEVEL, { level: 3 });
      for (const [lane, behind] of CRUISERS) {
        commands.run(GAME_COMMANDS.POLICE_SPAWN_UNIT, { unitKind: 'patrol_car', position: pointInFrame(frame, frame.laneSide(lane), along - behind), heading: -frame.compass });
      }
      tools.advance(1.8);
      // Off the throttle for a moment: the cruisers close in and one pulls alongside.
      game.input.setVirtual('accelerate', false);
      tools.advance(2.2);
      game.input.setVirtual('accelerate', true);
      tools.advance(0.3);
      const car = fleet.get(coupe)?.entity.position ?? start;
      const ground = groundAt(game, car.x, car.z);
      const lead = { x: car.x, z: car.z, fx: frame.fx, fz: frame.fz };
      const eye = pointInFrame(lead, 3.2, 13);
      const look = pointInFrame(lead, -0.8, -12);
      cutCamera(game, { x: eye.x, y: ground + 1.15, z: eye.z }, { x: look.x, y: ground + 1.2, z: look.z }, 36);
    },
  });
}

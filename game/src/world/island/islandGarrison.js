// The garrison of the Federasi Norvast on the island: sentries by the hangar and along the strip
// (the crowd's own people, archetype `norvast_soldier`, posted where they stand) and a few parked
// vehicles on the apron. They are mustered when the lead comes near and dismissed with the zone;
// an archetype or a vehicle model the catalogs do not have yet is skipped quietly.
import { GAME_COMMANDS } from '../../core/events/gameCommands.js';
import { VEHICLE_CATALOG } from '../../catalog/vehicleCatalog.js';
import { PEDESTRIAN_ARCHETYPES } from '../../catalog/pedestrianArchetypes.js';
import { NORVAST_ISLAND_SHAPE as SHAPE } from './norvastIslandShape.js';

const SOLDIER = 'norvast_soldier';
/** Sentry posts in the island frame: [u, v]. */
const SENTRY_POSTS = Object.freeze([
  [322, 78], [388, 78], [355, 60], [300, 40], [430, 122],
  [-380, 27], [-100, -26], [150, 27], [470, -26], [520, 30],
]);
/** Parked vehicles in the island frame: [model, u, v, compass heading]. */
const PARKED = Object.freeze([
  ['army_truck', 262, 140, 105], ['army_truck', 274, 140, 105], ['patrol_jeep', 300, 66, 285], ['patrol_jeep', -360, 34, 105],
]);
const MUSTER_WITHIN = 1150, STAND_DOWN_BEYOND = 1650;

/**
 * Creates the garrison.
 * @param {import('../../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {{update: (focusDistance: number) => void, dismiss: () => void, sentries: number, vehicles: number}}
 */
export function createIslandGarrison(context) {
  const vehicleIds = [];
  let posted = false;
  const y = SHAPE.stripLocal.y;

  function muster() {
    posted = true;
    garrison.sentries = 0;
    if (PEDESTRIAN_ARCHETYPES[SOLDIER]) {
      for (const [u, v] of SENTRY_POSTS) {
        const at = SHAPE.toWorld(u, v);
        try {
          const id = context.commands.run(GAME_COMMANDS.PEDESTRIAN_SPAWN, { archetypeId: SOLDIER, position: { x: at.x, y, z: at.z } });
          if (id === null || id === undefined) continue;
          const entity = context.entities.get(id);
          // Posted people stay where they stand and are kept at long range by the crowd.
          if (entity && entity.data) entity.data.posted = true;
          garrison.sentries += 1;
        } catch (error) {
          context.log.debug?.(`norvastIsland: no sentry (${error.message})`);
          break;
        }
      }
    }
    if (vehicleIds.length > 0) return;
    for (const [modelId, u, v, compass] of PARKED) {
      if (!VEHICLE_CATALOG[modelId]) continue;
      const at = SHAPE.toWorld(u, v);
      try {
        const id = context.commands.run(GAME_COMMANDS.VEHICLE_SPAWN, {
          modelId, position: { x: at.x, y, z: at.z }, heading: (-compass * Math.PI) / 180, parked: true, clearance: false,
        });
        if (id !== null && id !== undefined) vehicleIds.push(id);
      } catch (error) {
        context.log.debug?.(`norvastIsland: no ${modelId} (${error.message})`);
      }
    }
    garrison.vehicles = vehicleIds.length;
  }

  const garrison = {
    sentries: 0,
    vehicles: 0,
    /** Musters when the lead is near, and forgets the sentries once the crowd has let them go. */
    update(focusDistance) {
      if (!posted && focusDistance < MUSTER_WITHIN) muster();
      else if (posted && focusDistance > STAND_DOWN_BEYOND) { posted = false; garrison.sentries = 0; }
    },
    dismiss() {
      for (const vehicleId of vehicleIds) {
        try { context.commands.run(GAME_COMMANDS.VEHICLE_REMOVE, { vehicleId }); } catch { /* already gone */ }
      }
      vehicleIds.length = 0;
      garrison.vehicles = 0;
      // The sentries are the crowd's: it lets posted people go once the lead is far away.
      garrison.sentries = 0;
      posted = false;
    },
  };
  return garrison;
}

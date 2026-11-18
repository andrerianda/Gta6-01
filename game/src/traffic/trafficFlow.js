// Traffic: the ambient vehicles of Marazul. Keeps the streets around the player busy within the
// quality tier's maxVehicles and trafficDensity: cars appear out of sight on the city's lane
// graph (openWorldCity.laneGraph), chosen by the district's traffic mix among the vehicle models
// that are built, and are removed far behind. Each is a real physics car of the vehicle fleet,
// driven through its controls: it follows the lane centre line, keeps its distance, slows for
// turns, waits at red lights and stop signs (this system cycles the plan's two-phase signals and
// publishes their state), lets oncoming cars pass before turning left, and turns through the
// junctions on the connector curves. Drivers honk at the player in their way, swerve around
// people, flee from gunfire and explosions, pull over for sirens and get angry when rammed.
//
// Files: trafficDrivers.js (the cars and their driving), laneRoute.js (the road ahead),
// laneFollowing.js (steering and pedals), junctionRules.js (signals and stop lines),
// trafficSpawning.js (how many, where, which model), driverReactions.js (moods).
// Members: count; signalLight(nodeId, phase) -> 'green' | 'yellow' | 'red' (for the lamps of
//   the city dressing: phase is node.arms[i].phase); onAngryDriver (set by pedestrians: called
//   with {vehicleId, position, heading, targetId} when a rammed driver climbs out).
// Commands: TRAFFIC_SET_DENSITY {scale}. Publishes TRAFFIC_BLOCKED; tags its cars 'traffic'.
import { GAME_EVENTS } from '../core/events/gameEvents.js';
import { GAME_COMMANDS } from '../core/events/gameCommands.js';

/**
 * Creates the traffic flow system.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {import('../core/systems/gameSystemContract.js').GameSystem & Record<string, any>}
 */
export function createTrafficFlowSystem(context) {
  let drivers = null;
  const stops = [];

  const system = {
    name: 'traffic',
    dependsOn: ['openWorldCity', 'vehicles'],
    loadWeight: 1,
    /** Hook for the pedestrians system: a rammed driver climbs out to confront the player. */
    onAngryDriver: null,

    get count() {
      return drivers ? drivers.count : 0;
    },

    /** The light a junction's signal shows to a phase now ('green' without a signal). */
    signalLight: (nodeId, phase) => (drivers ? drivers.signalLight(nodeId, phase) : 'green'),

    async init(progress) {
      const city = context.systems.find('openWorldCity');
      const fleet = context.systems.find('vehicles');
      if (!city?.laneGraph || !fleet) {
        context.log.child('traffic').warn('traffic: no lane graph or vehicle fleet; the streets stay empty');
        return;
      }
      const { createTrafficDrivers } = await import('./trafficDrivers.js');
      drivers = createTrafficDrivers(context, { city, fleet });
      stops.push(context.commands.handle(GAME_COMMANDS.TRAFFIC_SET_DENSITY, ({ scale }) => drivers.setDensity(scale)));
      progress(1, 'traffic');
    },

    start() {
      if (!drivers) return;
      const on = (topic, handler) => stops.push(context.events.on(topic, handler));
      on(GAME_EVENTS.PLAYER_TELEPORTED, () => drivers.refill());
      on(GAME_EVENTS.PLAYER_SPAWNED, () => drivers.refill());
      on(GAME_EVENTS.QUALITY_CHANGED, () => drivers.refill());
      on(GAME_EVENTS.CLOCK_HOUR_CHANGED, () => drivers.rebuildMixes());
      on(GAME_EVENTS.WEAPON_FIRED, ({ origin, loudness }) => origin && drivers.danger(origin, 70 * (loudness ?? 1)));
      on(GAME_EVENTS.EXPLOSION_DETONATED, ({ position, radius }) => position && drivers.danger(position, Math.max(80, (radius ?? 6) * 10)));
      on(GAME_EVENTS.VEHICLE_ENTERED, ({ vehicleId, isPlayer }) => isPlayer && drivers.release(vehicleId));
      on(GAME_EVENTS.VEHICLE_REMOVED, ({ vehicleId }) => drivers.forget(vehicleId));
      on(GAME_EVENTS.VEHICLE_COLLIDED, (hit) => {
        const angry = drivers.collided(hit);
        if (angry && typeof system.onAngryDriver === 'function') system.onAngryDriver(angry);
      });
      drivers.refill();
    },

    fixedUpdate(stepSeconds) {
      drivers?.fixedUpdate(stepSeconds);
    },

    dispose() {
      for (const stop of stops.splice(0)) stop?.();
      drivers?.removeAll();
      drivers = null;
    },
  };
  return system;
}

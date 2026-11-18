// Traffic: the ambient vehicles of Marazul. Keeps the streets around the player busy within the
// quality tier's maxVehicles and trafficDensity: cars appear out of sight on the city's lane
// graph (openWorldCity.laneGraph), chosen by the district's traffic mix among the vehicle models
// that are built. Near the player each is a real physics car of the vehicle fleet, driven
// through its controls: it follows the lane, keeps its distance, slows for turns, waits at red
// lights and stop signs (this system cycles the plan's signals and publishes their state), lets
// oncoming cars pass before turning left. Drivers honk at the player in their way, swerve around
// people, flee from gunfire and explosions, pull over for sirens and get angry when rammed.
// Beyond about 180 m, out to the streamed city's edge, distant cars without physics drive the
// lanes as instanced batches of the models' far level and change places with physics cars at
// the ring. Parked cars line the kerbs of the plan's parking spots; some pull out.
//
// Drivers overtake slow cars on multi-lane roads: indicator, gap check, eased merge.
// Files: trafficDrivers.js (the physics cars and their driving), laneChanges.js, laneRoute.js,
// laneFollowing.js (steering and pedals), junctionRules.js (signals and stop lines),
// trafficSpawning.js (how many, where, which model), driverReactions.js (moods),
// distantTraffic.js + distantTrafficBatches.js (far cars), kerbsideParking.js (parked cars).
// Members: count; distantCount; distant and parking (with stats); signalLight(nodeId, phase) ->
//   'green' | 'yellow' | 'red' (phase is node.arms[i].phase); onAngryDriver (set by pedestrians:
//   called with {vehicleId, position, heading, targetId} when a rammed driver climbs out).
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
  let parts = [];
  const stops = [];
  const each = (method, ...args) => parts.forEach((part) => part[method]?.(...args));

  const system = {
    name: 'traffic',
    dependsOn: ['openWorldCity', 'vehicles'],
    loadWeight: 1,
    /** Hook for the pedestrians system: a rammed driver climbs out to confront the player. */
    onAngryDriver: null,
    distant: null,
    parking: null,

    get count() {
      return drivers ? drivers.count : 0;
    },
    get distantCount() {
      return system.distant ? system.distant.count : 0;
    },
    get laneChanges() {
      return drivers?.laneChanges;
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
      const [{ createTrafficDrivers }, { registerTrafficShowcase }, { createDistantTraffic }, { createKerbsideParking }, lamps] = await Promise.all([
        import('./trafficDrivers.js'),
        import('./trafficShowcaseScene.js'),
        import('./distantTraffic.js'),
        import('./kerbsideParking.js'),
        import('../vehicles/vehicleLightsAndDoors.js').catch(() => ({})),
      ]);
      drivers = createTrafficDrivers(context, { city, fleet, setLamp: lamps.setVehicleLamp });
      try {
        system.distant = createDistantTraffic(context, { city, drivers });
        drivers.demote = system.distant.demote;
        system.parking = createKerbsideParking(context, { city, drivers, fleet });
      } catch (error) {
        context.log.child('traffic').warn(`traffic: no distant or parked cars (${error?.message ?? error})`);
      }
      parts = [drivers, system.distant, system.parking].filter(Boolean);
      registerTrafficShowcase(context);
      stops.push(context.commands.handle(GAME_COMMANDS.TRAFFIC_SET_DENSITY, ({ scale }) => each('setDensity', scale)));
      progress(1, 'traffic');
    },

    start() {
      if (!drivers) return;
      const on = (topic, handler) => stops.push(context.events.on(topic, handler));
      const refill = () => each('refill');
      on(GAME_EVENTS.PLAYER_TELEPORTED, refill);
      on(GAME_EVENTS.PLAYER_SPAWNED, refill);
      on(GAME_EVENTS.QUALITY_CHANGED, refill);
      on(GAME_EVENTS.CLOCK_HOUR_CHANGED, () => drivers.rebuildMixes());
      on(GAME_EVENTS.WEAPON_FIRED, ({ origin, loudness }) => origin && drivers.danger(origin, 70 * (loudness ?? 1)));
      on(GAME_EVENTS.EXPLOSION_DETONATED, ({ position, radius }) => position && drivers.danger(position, Math.max(80, (radius ?? 6) * 10)));
      on(GAME_EVENTS.VEHICLE_ENTERED, ({ vehicleId, isPlayer }) => isPlayer && drivers.release(vehicleId));
      on(GAME_EVENTS.VEHICLE_REMOVED, ({ vehicleId }) => drivers.forget(vehicleId));
      on(GAME_EVENTS.VEHICLE_COLLIDED, (hit) => {
        const angry = drivers.collided(hit);
        if (angry && typeof system.onAngryDriver === 'function') system.onAngryDriver(angry);
      });
      refill();
    },

    fixedUpdate(stepSeconds) {
      for (let i = 0; i < parts.length; i += 1) parts[i].fixedUpdate(stepSeconds);
    },

    update() {
      system.distant?.update(system.parking?.draw);
    },

    lateUpdate() {
      drivers?.lateUpdate();
    },

    dispose() {
      for (const stop of stops.splice(0)) stop?.();
      drivers?.removeAll();
      each('dispose');
      drivers = system.distant = system.parking = null;
      parts = [];
    },
  };
  return system;
}

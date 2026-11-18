// Traffic: the ambient vehicles of Marazul, within the quality tier's maxVehicles and
// trafficDensity. Cars appear out of sight on openWorldCity.laneGraph, by the district's mix of
// built models. Near the player each is a physics car of the vehicle fleet driven through its
// controls: lane keeping, distance, turns, red lights and stop signs (the shared signal clock),
// yielding before a left turn, overtaking and moving into turn lanes (indicator, gap, eased
// merge). Drivers honk, swerve round people, flee gunfire, get angry when rammed, pull over to
// the kerb for sirens and scatter from a chase. Motorcycles ride mounted in the left wheel
// track (the physics leans them into turns). Beyond about 180 m distant cars without physics
// drive the lanes as instanced batches and swap with physics cars at the ring; parked cars line
// the kerbs and some pull out.
// Files: trafficDrivers.js, laneChanges.js, laneRoute.js, laneFollowing.js, junctionRules.js,
// trafficSpawning.js, driverReactions.js, sirenGiveWay.js, distantTraffic.js (+ Batches,
// farCarProxy.js), kerbsideParking.js.
// Members: count; distantCount; distant, parking (stats); signalLight(nodeId, phase) -> 'green' |
//   'yellow' | 'red'; nearCars(out, radius) -> ids of driven cars near the camera (pedestrians
//   seat drivers); onAngryDriver (set by pedestrians: {vehicleId, position, heading, targetId}).
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
    /** The drivers (trafficDrivers.js; for debugging and showcase scenes). */
    get drivers() {
      return drivers;
    },

    /** The light a junction's signal shows to a phase now ('green' without a signal). */
    signalLight: (nodeId, phase) => (drivers ? drivers.signalLight(nodeId, phase) : 'green'),
    nearCars: (out = [], radius) => (drivers ? drivers.nearCars(out, radius) : out),

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
      // A quality change is not a cut: the counts follow the new tier on the next passes, and
      // nothing is filled in (or put away) in the camera's view.
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

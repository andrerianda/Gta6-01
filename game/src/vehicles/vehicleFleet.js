// The vehicle fleet: every car and truck in the world. It spawns any vehicleCatalog model as a
// physics vehicle (game/src/physics/) dressed in its Blender model from the asset library
// (a temporary stand-in body until that model is registered), painted in one of the catalog's
// typical colours. Before the physics steps it turns each driver's controls into the car's
// input; each frame it draws the car where the physics put it, at its level of detail, with
// wheels spinning and steering, the steering wheel turning, body roll and pitch, and lamps
// (headlamps at night with real lights, brake, reversing, hazard). Crashes dent the body,
// crack and shatter windows and tear off bumpers; a car that runs out of health smokes, burns
// and explodes. Traffic, police and the player drive through controlsOf().
//
// Members: spawn({modelId, position, heading?, colour?, parked?, ownerSystem?}) -> vehicleId
//   (null for boats and helicopters until their physics exists); remove(id); get(id) -> record
//   ({entity, car, rig: {root}, controls, seats}); controlsOf(id) -> {throttle, brake, steer,
//   handbrake, reverse, autoReverse, horn, headlights}; seatsOf(id) -> [{name, occupantId}];
//   nearestEnterable(x, z, maxDistance?) -> vehicle entity or null; enter(id, occupantId,
//   {seat?, isPlayer?}); exit(id, occupantId, {isPlayer?, bailedOut?}); damage(id, amount,
//   cause?, attackerId?, position?); repair(id).
// Entity: kind vehicle, owner 'vehicles', tags parked / dead, data {modelId, health, maxHealth,
//   speed (m/s along the nose), driverId, controls, colour, stage (0 intact .. 3 wrecked)}.
// Commands: VEHICLE_SPAWN, VEHICLE_REMOVE, VEHICLE_REPAIR. Listens: VEHICLE_COLLIDED (from
// physics), DAMAGE_DEALT (targetId a vehicle), EXPLOSION_DETONATED. Publishes VEHICLE_SPAWNED,
// _REMOVED, _ENTERED, _EXITED, _DAMAGED, _DESTROYED.
// Showcase: ?shot=vehicles-golden-hour (vehicles/vehicleShowcaseScene.js).
import { GAME_EVENTS } from '../core/events/gameEvents.js';
import { GAME_COMMANDS } from '../core/events/gameCommands.js';

/**
 * Creates the vehicle fleet system.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {import('../core/systems/gameSystemContract.js').GameSystem}
 */
export function createVehicleFleetSystem(context) {
  let roster = null;
  const stops = [];

  const fleet = {
    name: 'vehicles',
    dependsOn: ['openWorldCity', 'physics'],
    loadWeight: 2,
    /** Cars kept in the player's garages: [{propertyId, modelId, colour, damage}]. */
    garages: [],

    async init(progress) {
      const [{ createVehicleRoster }, { registerVehicleShowcase }] = await Promise.all([
        import('./vehicleRoster.js'),
        import('./vehicleShowcaseScene.js'),
      ]);
      roster = createVehicleRoster(context);
      stops.push(
        context.commands.handle(GAME_COMMANDS.VEHICLE_SPAWN, (request) => roster.spawn(request)),
        context.commands.handle(GAME_COMMANDS.VEHICLE_REMOVE, ({ vehicleId }) => roster.remove(vehicleId)),
        context.commands.handle(GAME_COMMANDS.VEHICLE_REPAIR, ({ vehicleId }) => roster.repair(vehicleId)),
      );
      registerVehicleShowcase(context);
      progress(1, 'vehicle fleet');
    },

    start() {
      stops.push(
        context.events.on(GAME_EVENTS.VEHICLE_COLLIDED, roster.crash),
        context.events.on(GAME_EVENTS.EXPLOSION_DETONATED, roster.onExplosion),
        context.events.on(GAME_EVENTS.DAMAGE_DEALT, (hit) => {
          if (roster.get(hit.targetId)) roster.damage(hit.targetId, hit.amount, hit.kind ?? 'weapon', hit.attackerId ?? null, hit.position ?? null);
        }),
      );
    },

    fixedUpdate(stepSeconds) {
      roster.fixedUpdate(stepSeconds);
    },

    update(deltaSeconds, alpha) {
      roster.update(deltaSeconds, alpha);
    },

    dispose() {
      for (const stop of stops.splice(0)) stop();
      roster?.removeAll();
    },

    spawn: (request) => roster.spawn(request),
    remove: (vehicleId) => roster.remove(vehicleId),
    get: (vehicleId) => roster.get(vehicleId),
    controlsOf: (vehicleId) => roster.controlsOf(vehicleId),
    seatsOf: (vehicleId) => roster.seatsOf(vehicleId),
    nearestEnterable: (x, z, maxDistance) => roster.nearestEnterable(x, z, maxDistance),
    enter: (vehicleId, occupantId, options) => roster.enter(vehicleId, occupantId, options),
    exit: (vehicleId, occupantId, options) => roster.exit(vehicleId, occupantId, options),
    damage: (vehicleId, amount, cause, attackerId, position) => roster.damage(vehicleId, amount, cause, attackerId, position),
    repair: (vehicleId) => roster.repair(vehicleId),

    serialise: () => ({ garages: fleet.garages.map((car) => ({ ...car })) }),
    restore(data) {
      fleet.garages = Array.isArray(data?.garages) ? data.garages.map((car) => ({ ...car })) : [];
    },
  };
  return fleet;
}

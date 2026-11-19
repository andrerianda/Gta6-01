// The vehicle fleet: every car, truck and bike. It spawns a vehicleCatalog model as a physics
// vehicle (game/src/physics/) in its Blender model (a stand-in until one is registered), turns
// each driver's controls into the car's input, and draws it at its level of detail with wheels,
// steering, body roll and lamps. Crashes dent the body, break windows and tear off bumpers; a
// car out of health smokes, burns and explodes. Traffic, police and the player drive through
// controlsOf().
//
// Members: spawn({modelId, position, heading?, colour?, parked?, ownerSystem?}) -> id (boats, helis:
//   vehicleCraft.js). parked defaults to TRUE (brakes, sleeps, tag parked): anything
//   driven passes parked: false. remove(id); get(id) -> {entity, car, rig.root, controls};
//   controlsOf(id) -> {throttle, brake, steer, handbrake, reverse, autoReverse, horn,
//   headlights}; seatsOf(id); nearestEnterable(x, z, max?); enter(id, occupantId, {seat?,
//   isPlayer?}); exit(id, occupantId, {isPlayer?, bailedOut?}); damage(id, amount, cause?,
//   attackerId?, position?); repair(id); repaint(id, colour);
//   setDoorOpen(id, 'fl'|'fr'|'rl'|'rr'|'driver'|'passenger', 0..1) (eased ~0.4 s);
//   setLamp(id, 'siren_a'|'siren_b'|'head'|..., on); anchorOf(id, 'engine_bay'|'siren'|..., out?).
//   stageWreck(id, {front 0..1, corner 'left'|'right'|'centre', glass 'mixed'|'shattered'|
//   'cracked'|'none', door, doorAmount, scorch 0..1, bumper, burning, burnSeconds, fire}) ->
//   {stage, burning, paint, ...}: a crashed car for a scene, front crumpled, glass broken, a door
//   ajar, paint scorched, burning (wreck_fire at the engine bay) with no explosion; it stays at
//   the near level. Defaults in vehicleWreckStaging.js. extinguish(id) puts the fire out.
// Entity: kind vehicle, owner 'vehicles', tags parked / dead, data {modelId, health, maxHealth,
//   speed, driverId, controls, colour, stage (0 intact, 1 smoking, 2 burning, 3 wrecked)}.
// Commands: VEHICLE_SPAWN, _REMOVE, _REPAIR. Listens: VEHICLE_COLLIDED, DAMAGE_DEALT,
// EXPLOSION_DETONATED. Publishes VEHICLE_SPAWNED, _REMOVED, _ENTERED, _EXITED, _DESTROYED and
// _DAMAGED {vehicleId, amount, health, cause, attackerId, position, stage, previousStage, glass
// ('cracked'|'shattered'|null), windowsCracked, windowsShattered}. EFFECT_SPAWN carries colour.
// Showcase: ?shot=vehicles-golden-hour, vehicles-crash, vehicles-wreck (vehicleShowcaseScene.js).
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
      const { createAerodromeTrainer } = await import('./aerodromeTrainer.js');
      trainer = createAerodromeTrainer(context, roster);
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
      trainer.update(stepSeconds);
    },

    update(deltaSeconds, alpha) {
      roster.update(deltaSeconds, alpha);
    },

    dispose() {
      for (const stop of stops.splice(0)) stop();
      roster?.dispose();
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
    stageWreck: (vehicleId, options) => roster.stageWreck(vehicleId, options),
    extinguish: (vehicleId) => roster.extinguish(vehicleId),
    repaint: (vehicleId, colour) => roster.repaint(vehicleId, colour),
    setDoorOpen: (vehicleId, side, amount) => roster.setDoorOpen(vehicleId, side, amount),
    setLamp: (vehicleId, group, on) => roster.setLamp(vehicleId, group, on),
    anchorOf: (vehicleId, name, out) => roster.anchorOf(vehicleId, name, out),

    serialise: () => ({ garages: fleet.garages.map((car) => ({ ...car })) }),
    restore(data) {
      fleet.garages = Array.isArray(data?.garages) ? data.garages.map((car) => ({ ...car })) : [];
    },
  };
  return fleet;
}

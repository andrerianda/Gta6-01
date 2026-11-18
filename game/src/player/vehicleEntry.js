// Getting in and out of vehicles and driving them. F on foot asks the vehicle fleet for the
// nearest vehicle the lead can enter and takes the driver's seat; while seated the drive keys are
// written into the fleet's controls for that vehicle (throttle, brake, steer, handbrake); F
// again puts the lead back on the pavement by the driver's door. The player tag moves with the
// lead, so `entities.firstWithTag('player')` is the lead on foot or the vehicle being driven.
// While the fleet is still a stub nothing is enterable and this does nothing.
import { ENTITY_TAGS } from '../core/entities/entityKinds.js';
import { GAME_EVENTS } from '../core/events/gameEvents.js';

/** How far from the lead a vehicle may be to be entered, metres. */
export const ENTER_REACH = 4.5;

/**
 * Where the lead steps out of a vehicle: beside the driver's door, on the vehicle's left.
 * @param {{x: number, z: number}} position The vehicle.
 * @param {number} heading The vehicle's heading (0 north, growing to the left).
 * @param {number} radius The vehicle's radius, metres.
 * @returns {{x: number, z: number}}
 */
export function driverDoorPoint(position, heading, radius) {
  const side = Math.max(1.3, radius * 0.45 + 0.6);
  return { x: position.x - Math.cos(heading) * side, z: position.z + Math.sin(heading) * side };
}

/**
 * Creates the vehicle entry of the lead.
 * @param {import('../core/systems/gameContext.js').GameContext} context
 * @param {{entity: object, movement: ReturnType<typeof import('./onFootMovement.js').createOnFootMovement>,
 *   figure: {setVisible: (visible: boolean) => void}}} lead
 */
export function createVehicleEntry(context, { entity, movement, figure }) {
  let vehicle = null;
  let controls = null;

  function fleet() {
    return context.systems.find('vehicles');
  }

  function vehicleEntityOf(found) {
    if (found == null) return null;
    if (typeof found !== 'object') return context.entities.get(found) ?? null;
    if (found.kind) return found;
    const id = found.vehicleId ?? found.id;
    return id == null ? null : context.entities.get(id) ?? null;
  }

  /** Enters the nearest enterable vehicle, if any. */
  function tryEnter() {
    const vehicles = fleet();
    if (!vehicles || typeof vehicles.nearestEnterable !== 'function') return false;
    const state = movement.state;
    const target = vehicleEntityOf(vehicles.nearestEnterable(state.x, state.z, ENTER_REACH));
    return target ? enter(target.id) : false;
  }

  /** Takes a seat in a vehicle (PLAYER_ENTER_VEHICLE). */
  function enter(vehicleId, seat = 'driver') {
    const target = context.entities.get(vehicleId);
    if (!target || !target.alive || vehicle) return false;
    const vehicles = fleet();
    if (vehicles && typeof vehicles.enter === 'function') {
      if (vehicles.enter(vehicleId, entity.id, seat) === false) return false;
    } else {
      context.events.emit(GAME_EVENTS.VEHICLE_ENTERED, {
        vehicleId, modelId: target.data ? target.data.modelId : null, occupantId: entity.id, seat, isPlayer: true,
      });
    }
    vehicle = target;
    controls = vehicles && typeof vehicles.controlsOf === 'function' ? vehicles.controlsOf(vehicleId) : null;
    if (!controls && target.data && target.data.controls) controls = target.data.controls;
    context.entities.removeTag(entity, ENTITY_TAGS.PLAYER);
    context.entities.addTag(target, ENTITY_TAGS.PLAYER);
    entity.data.vehicleId = vehicleId;
    figure.setVisible(false);
    context.controls.setPlayContext('inVehicle');
    return true;
  }

  /** Leaves the vehicle by the driver's door. */
  function exit(bailedOut = false) {
    if (!vehicle) return;
    const left = vehicle;
    if (controls) {
      controls.throttle = 0; controls.steer = 0;
      controls.brake = bailedOut ? 0 : 1;
      controls.handbrake = !bailedOut;
    }
    const vehicles = fleet();
    if (vehicles && typeof vehicles.exit === 'function') vehicles.exit(left.id, entity.id, bailedOut);
    else {
      context.events.emit(GAME_EVENTS.VEHICLE_EXITED, {
        vehicleId: left.id, modelId: left.data ? left.data.modelId : null, occupantId: entity.id, isPlayer: true, bailedOut,
      });
    }
    vehicle = null;
    controls = null;
    context.entities.removeTag(left, ENTITY_TAGS.PLAYER);
    context.entities.addTag(entity, ENTITY_TAGS.PLAYER);
    entity.data.vehicleId = null;
    const heading = left.heading ?? 0;
    const door = driverDoorPoint(left.position, heading, left.radius ?? 2.4);
    movement.placeAt(door.x, door.z, heading);
    figure.setVisible(true);
    context.controls.setPlayContext('onFoot');
  }

  /** One fixed step at the wheel: the drive keys into the vehicle's controls; the lead rides along. */
  function drive(input) {
    if (!vehicle.alive) {
      exit(true);
      return;
    }
    if (input.pressed('exitVehicle')) {
      const speed = vehicle.data && typeof vehicle.data.speed === 'number' ? Math.abs(vehicle.data.speed) : 0;
      exit(speed > 8);
      return;
    }
    if (controls) {
      controls.throttle = input.held('accelerate') ? 1 : 0;
      controls.brake = input.held('brake') ? 1 : 0;
      controls.steer = input.axis('steer');
      controls.handbrake = input.held('handbrake');
    }
    const state = movement.state;
    state.previousX = state.x; state.previousY = state.y; state.previousZ = state.z;
    state.x = vehicle.position.x; state.y = vehicle.position.y; state.z = vehicle.position.z;
    state.heading = state.previousHeading = vehicle.heading ?? state.heading;
    state.speed = state.groundSpeed = 0;
  }

  return {
    tryEnter,
    enter,
    exit,
    drive,
    get vehicle() { return vehicle; },
  };
}

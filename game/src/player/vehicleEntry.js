// Getting in and out of vehicles and driving them. F on foot picks the nearest car the lead can
// enter and the lead gets in through the driver's door: walks to anchor_door_driver (a move key
// cancels), then the character run-time's vehicle transit (walker.enterVehicle) turns to the door,
// reaches the handle, pulls it open stepping back with it, ducks in, sits and swings in at the
// wheel and pulls the door shut; the door follows the transit through the fleet's setDoorOpen.
// A car traffic was driving is taken by force: the transit's carjack hauls the driver out first.
// From then on the lead is drawn at the wheel every frame, both hands on the rim and following
// the steering wheel. F at the wheel brings the car to a stop and the lead gets out the same way
// (walker.exitVehicle: push the door open, swing out, stand, step clear, push it shut); above
// BOARDING.bailSpeed the lead bails out at once and the door hangs open. A moving car is claimed
// when the lead sets off towards it, so traffic lets it go and it brakes for the lead. While
// seated the drive keys go into the fleet's controls (throttle, brake, steer, handbrake, horn).
// The player tag moves with the lead, so `entities.firstWithTag('player')` is the lead on foot or
// the car being driven (from the moment the lead pulls the door shut). Taking a car the lead has
// not driven before emits VEHICLE_STOLEN with the lead as thiefId. Door and seat anchors:
// carDoorAndSeat.js. With a stub fleet nothing is enterable and this does nothing.
import * as THREE from 'three';
import { ENTITY_TAGS } from '../core/entities/entityKinds.js';
import { GAME_EVENTS } from '../core/events/gameEvents.js';
import { createCarDoorAndSeat } from './carDoorAndSeat.js';

/** How far from the lead a vehicle may be to be entered, metres. */
export const ENTER_REACH = 4.5;

/** The walk to the door and the way out: seconds, distances (m) and speeds (m/s). */
export const BOARDING = Object.freeze({
  approach: 3, arrive: 0.22, giveUp: 1.2, walkWithin: 2.2, cancelIntent: 0.3,
  driverSide: -0.3, pastEnd: 2.3, corner: 0.5, perCorner: 2.5,
  stopFirst: 1.5, stopWait: 3, bailSpeed: 8, bailDoor: 0.85,
});

/**
 * Where the lead steps out of a vehicle without a model: beside the driver's door, on its left.
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
 * Whether getting into this car is a carjack: traffic was driving it (not parked, nobody seated
 * through the fleet) and the lead has not driven it before.
 * @param {{id: any, tags?: Set<string>, data?: {driverId?: any}}} target
 * @param {Set<any>} known Car ids the lead has driven.
 */
export function isCarjack(target, known) {
  const tags = target.tags;
  return Boolean(tags && !tags.has(ENTITY_TAGS.PARKED) && !tags.has(ENTITY_TAGS.MISSION)
    && (target.data ? target.data.driverId ?? null : null) === null && !known.has(target.id));
}

/**
 * Creates the vehicle entry of the lead.
 * @param {import('../core/systems/gameContext.js').GameContext} context
 * @param {{entity: object, movement: ReturnType<typeof import('./onFootMovement.js').createOnFootMovement>,
 *   figure: ReturnType<typeof import('./playerAnimation.js').createPlayerAnimation>}} lead
 */
export function createVehicleEntry(context, { entity, movement, figure }) {
  let vehicle = null;   // the car the lead drives, from the moment the door is pulled shut
  let car = null;       // the car being boarded, driven or left
  let points = null;    // its door and seat (carDoorAndSeat.js)
  let phase = null;     // 'approach' | 'enter' | 'seated' | 'stopping' | 'exit'
  let clock = 0;        // seconds into the phase
  let jack = false;     // this boarding hauls traffic's driver out
  let route = 0;        // corners still to round from the passenger side (2, 1, 0: the door)
  let end = -1;         // round the nose (-1) or the tail (+1)
  let limit = 3;        // seconds allowed for the walk to the door
  let held = false;     // the fleet's seat is the lead's
  let controls = null;
  const known = new Set();
  const intent = { x: 0, z: 0, sprint: false, walk: false, jump: false };
  const spot = new THREE.Vector3();
  const turn = new THREE.Quaternion();

  const fleet = () => context.systems.find('vehicles');
  const speedOf = (target) => Math.abs(target && target.data && target.data.speed || 0);
  const transit = () => figure.walker.transit;

  function vehicleEntityOf(found) {
    if (found == null) return null;
    if (typeof found !== 'object') return context.entities.get(found) ?? null;
    if (found.kind) return found;
    const id = found.vehicleId ?? found.id;
    return id == null ? null : context.entities.get(id) ?? null;
  }

  /** Takes the fleet's seat (and the car from traffic); a car never driven before is stolen. */
  function holdSeat(target, seat = 'driver', scripted = false) {
    if (held) return true;
    const vehicles = fleet();
    const driverId = target.data ? target.data.driverId ?? null : null;
    if (driverId !== null && driverId !== entity.id) return false;
    if (vehicles && typeof vehicles.enter === 'function') {
      if (vehicles.enter(target.id, entity.id, { seat, isPlayer: true }) === false) return false;
    } else {
      context.events.emit(GAME_EVENTS.VEHICLE_ENTERED, {
        vehicleId: target.id, modelId: target.data ? target.data.modelId : null, occupantId: entity.id, seat, isPlayer: true,
      });
    }
    if (!scripted && !known.has(target.id)) {
      const p = target.position;
      context.events.emit(GAME_EVENTS.VEHICLE_STOLEN, {
        vehicleId: target.id, modelId: target.data ? target.data.modelId : null, thiefId: entity.id, driverId,
        position: { x: p.x, y: p.y, z: p.z }, jacked: isCarjack(target, known),
      });
    }
    known.add(target.id);
    held = true;
    controls = vehicles && typeof vehicles.controlsOf === 'function' ? vehicles.controlsOf(target.id) : null;
    if (!controls && target.data && target.data.controls) controls = target.data.controls;
    // The parked capsule must not stop or be shoved by the car it is riding in.
    if (movement.capsule) movement.capsule.ignore.push(target.id);
    return true;
  }

  function releaseSeat(bailedOut) {
    if (!held) return;
    const vehicles = fleet();
    if (vehicles && typeof vehicles.exit === 'function') vehicles.exit(car.id, entity.id, { isPlayer: true, bailedOut });
    else {
      if (controls) {
        controls.throttle = 0; controls.steer = 0;
        controls.brake = bailedOut ? 0 : 1;
        controls.handbrake = bailedOut ? 0 : 1;
      }
      context.events.emit(GAME_EVENTS.VEHICLE_EXITED, {
        vehicleId: car.id, modelId: car.data ? car.data.modelId : null, occupantId: entity.id, isPlayer: true, bailedOut,
      });
    }
    held = false;
    controls = null;
    if (movement.capsule) {
      const index = movement.capsule.ignore.indexOf(car.id);
      if (index >= 0) movement.capsule.ignore.splice(index, 1);
    }
  }

  function brake() {
    if (controls) { controls.throttle = 0; controls.brake = 1; controls.steer = 0; controls.horn = false; }
  }

  /** The camera, the HUD and the drive keys follow the car from here. */
  function becomeDriver() {
    vehicle = car;
    context.entities.removeTag(entity, ENTITY_TAGS.PLAYER);
    context.entities.addTag(car, ENTITY_TAGS.PLAYER);
    entity.data.vehicleId = car.id;
    context.controls.setPlayContext('inVehicle');
  }

  function becomePedestrian() {
    if (!vehicle) return;
    context.entities.removeTag(vehicle, ENTITY_TAGS.PLAYER);
    context.entities.addTag(entity, ENTITY_TAGS.PLAYER);
    entity.data.vehicleId = null;
    vehicle = null;
    context.controls.setPlayContext('onFoot');
  }

  function forget() {
    car = null; points = null; phase = null; jack = false;
    movement.state.facing = NaN;
    figure.instance.rotation.x = 0; figure.instance.rotation.z = 0;
  }

  /** Stops boarding (a move key, the car gone, going down): the lead stands by the door. */
  function abandon() {
    const inside = phase === 'enter';
    if (held) releaseSeat(false);
    if (inside) {
      const yaw = points.standPoint(spot);
      movement.placeAt(spot.x, spot.z, yaw + Math.PI);
      figure.walker.sit(null, { fade: 0 });
      figure.reset(yaw + Math.PI);
      points.setDoor(0);
    }
    forget();
  }

  /** Starts getting into a car: walk to its door (false when it cannot be entered now). */
  function board(target) {
    if (phase || vehicle || !target || !target.alive) return false;
    const driverId = target.data ? target.data.driverId ?? null : null;
    if (driverId !== null && driverId !== entity.id) return false;
    car = target;
    points = createCarDoorAndSeat(fleet(), target);
    jack = isCarjack(target, known);
    // A moving car is claimed now: traffic lets it go and it brakes while the lead walks up.
    if (speedOf(target) > BOARDING.stopFirst && !holdSeat(target)) { forget(); return false; }
    const state = movement.state;
    points.toCar(spot, state.x, state.z);
    route = spot.x > BOARDING.driverSide ? (Math.abs(spot.z) > BOARDING.pastEnd ? 1 : 2) : 0;
    end = spot.z < 0 ? -1 : 1;
    limit = BOARDING.approach + route * BOARDING.perCorner;
    phase = 'approach'; clock = 0;
    return true;
  }

  /** Enters the nearest enterable vehicle, if any (F). */
  function tryEnter() {
    const vehicles = fleet();
    if (!vehicles || typeof vehicles.nearestEnterable !== 'function') return false;
    const state = movement.state;
    return board(vehicleEntityOf(vehicles.nearestEnterable(state.x, state.z, ENTER_REACH)));
  }

  /** Takes a seat at once (PLAYER_ENTER_VEHICLE from missions and scenes; not a theft). */
  function enter(vehicleId, seat = 'driver') {
    const target = context.entities.get(vehicleId);
    if (!target || !target.alive || vehicle) return false;
    if (phase) abandon();
    car = target;
    points = createCarDoorAndSeat(fleet(), target);
    if (!holdSeat(target, seat, true)) { forget(); return false; }
    if (seat === 'driver') figure.walker.sit({ kind: 'driver', wheel: points.steeringWheel, wheelRadius: points.wheelRadius }, { fade: 0 });
    figure.setVisible(seat === 'driver');
    becomeDriver();
    phase = 'seated'; clock = 0;
    return true;
  }

  /** Out of the car at once, beside the driver's door (bailing, teleports, going down). */
  function leaveNow(bailedOut) {
    const yaw = points.standPoint(spot) + Math.PI + 0.9;
    releaseSeat(bailedOut);
    becomePedestrian();
    movement.placeAt(spot.x, spot.z, yaw);
    figure.walker.sit(null, { fade: 0 });
    figure.reset(yaw);
    figure.setVisible(true);
    points.setDoor(bailedOut ? BOARDING.bailDoor : 0); // a bailed door hangs open
    forget();
  }

  /**
   * Leaves the car: brakes, then gets out through the door (bailing out at once when
   * `bailedOut`), or stops boarding. `instant` puts the lead outside at once.
   */
  function exit(bailedOut = false, instant = false) {
    if (!car) return;
    if (!vehicle) { abandon(); return; }
    if (bailedOut || instant) { leaveNow(bailedOut); return; }
    if (phase === 'seated') { phase = 'stopping'; clock = 0; }
  }

  function startExit() {
    if (!figure.instance.visible) { leaveNow(false); return; }
    figure.walker.exitVehicle({ door: points.doorAnchor, seat: points.seatAnchor });
    phase = 'exit'; clock = 0;
  }

  /** The transit is over: the capsule takes over where the run-time left the feet. */
  function finishExit() {
    const t = transit();
    const yaw = figure.walker.state.yaw;
    releaseSeat(false);
    becomePedestrian();
    movement.placeAt(t.x, t.z, yaw);
    figure.reset(yaw);
    points.setDoor(0);
    forget();
  }

  /**
   * One fixed step of getting in while not yet driving. `wanted` is the player's on-foot intent
   * (a move key cancels the walk to the door). Returns false when the lead walks freely.
   */
  function boardStep(wanted, stepSeconds) {
    if (!phase || vehicle) return false;
    clock += stepSeconds;
    if (!car.alive) { abandon(); return false; }
    if (held) brake();
    const state = movement.state;
    if (phase === 'approach') {
      if (Math.hypot(wanted.x, wanted.z) > BOARDING.cancelIntent || wanted.jump) { abandon(); return false; }
      // From the passenger side: round the nearer end, corner by corner, to the driver's door.
      if (route > 0) points.corner(spot, route === 2 ? 1 : -1, end); else points.standPoint(spot);
      let dx = spot.x - state.x, dz = spot.z - state.z, distance = Math.hypot(dx, dz);
      if (route > 0 && distance < BOARDING.corner) {
        route -= 1;
        if (route > 0) points.corner(spot, -1, end); else points.standPoint(spot);
        dx = spot.x - state.x; dz = spot.z - state.z; distance = Math.hypot(dx, dz);
      }
      if (distance > BOARDING.arrive && clock < limit) {
        const pace = route > 0 ? 1 : Math.min(1, distance / 0.5);
        intent.x = (dx / distance) * pace; intent.z = (dz / distance) * pace;
        intent.walk = route === 0 && distance < BOARDING.walkWithin; intent.sprint = false; intent.jump = false;
        state.facing = NaN;
        movement.step(intent, stepSeconds);
        return true;
      }
      if (distance > BOARDING.giveUp || !holdSeat(car)) { abandon(); return false; }
      brake();
      figure.walker.enterVehicle({
        door: points.doorAnchor, seat: points.seatAnchor, kind: 'driver', wheel: points.steeringWheel, wheelRadius: points.wheelRadius, jack,
      });
      phase = 'enter'; clock = 0;
      return true;
    }
    return phase === 'enter';
  }

  /** One fixed step at the wheel: the drive keys into the car's controls; the lead rides along. */
  function drive(input, stepSeconds) {
    clock += stepSeconds;
    if (!vehicle.alive) { exit(true, true); return; }
    if (phase === 'stopping') {
      brake();
      if (controls) controls.handbrake = 0;
      if (speedOf(vehicle) <= BOARDING.stopFirst) startExit();
      else if (clock > BOARDING.stopWait) { exit(true); return; }
    } else if (phase === 'exit') {
      brake();
      if (controls) controls.handbrake = 1;
    } else if (phase === 'seated' && input.pressed('exitVehicle')) {
      exit(speedOf(vehicle) > BOARDING.bailSpeed);
      if (!vehicle) return;
    } else if (controls) {
      controls.throttle = input.held('accelerate') ? 1 : 0;
      controls.brake = input.held('brake') ? 1 : 0;
      controls.steer = input.axis('steer');
      controls.handbrake = input.held('handbrake') ? 1 : 0;
      controls.horn = input.held('horn');
    }
    if (!vehicle) return;
    const state = movement.state;
    state.previousX = state.x; state.previousY = state.y; state.previousZ = state.z;
    state.x = vehicle.position.x; state.y = vehicle.position.y; state.z = vehicle.position.z;
    state.heading = state.previousHeading = vehicle.heading ?? state.heading;
    state.speed = state.groundSpeed = 0;
  }

  /**
   * Poses the body for this frame while it gets in or out (the run-time's transit places it) or
   * sits at the wheel; false when the figure walks on foot (the on-foot figure update runs).
   */
  function frame(dt) {
    if (!points || phase === null || phase === 'approach') return false;
    if (!figure.instance.visible) return true;
    if (phase === 'enter' || phase === 'exit') {
      figure.transit(dt);
      const t = transit();
      points.setDoor(t.door);
      if (phase === 'enter') {
        if (!vehicle && (t.stage === 'close' || !t.kind)) becomeDriver();
        if (!t.kind) { phase = 'seated'; clock = 0; }
      } else if (!t.kind) finishExit();
      return true;
    }
    points.seatPose(spot, turn);
    figure.seat(dt, spot, turn);
    return true;
  }

  return {
    tryEnter,
    board,
    enter,
    exit,
    drive,
    boardStep,
    frame,
    /** The car the lead drives (null on foot and while still getting in). */
    get vehicle() { return vehicle; },
    /** The get-in / get-out phase, or null. */
    get phase() { return phase; },
    /** The car being boarded, driven or left. */
    get car() { return car; },
    /** Whether the current boarding is a carjack. */
    get jacking() { return jack; },
    /** Car ids the lead has taken (not stolen again). */
    known,
  };
}

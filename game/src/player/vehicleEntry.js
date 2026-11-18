// Getting in and out of vehicles and driving them. F on foot picks the nearest car the lead can
// enter, and the lead gets in step by step: walks to the driver's door (a move key cancels),
// turns to it and swings it open, sits in (the character run-time's driver seat: the body is
// carried from the door to the seat, lowered first and then slid in, both hands on the rim and
// following the steering wheel), pulls the door shut and drives. F at the wheel brings the car to
// a stop, opens the door, and the lead stands out beside it while the door swings shut behind;
// above BOARDING.bailSpeed the lead bails out at once and the door hangs open. A moving car is
// claimed when the lead sets off towards it, so traffic lets it go and it brakes for the lead.
// While seated the drive keys go into the fleet's controls (throttle, brake, steer, handbrake,
// horn) and the body is drawn at the wheel every frame. The player tag moves with the lead, so
// `entities.firstWithTag('player')` is the lead on foot or the car being driven (from the moment
// the lead is seated). Taking a car the lead has not driven before emits VEHICLE_STOLEN with the
// lead as thiefId. Door and seat geometry: carDoorAndSeat.js. With a stub fleet nothing is
// enterable and this does nothing.
import * as THREE from 'three';
import { ENTITY_TAGS } from '../core/entities/entityKinds.js';
import { GAME_EVENTS } from '../core/events/gameEvents.js';
import { createCarDoorAndSeat, easeInOut } from './carDoorAndSeat.js';

/** How far from the lead a vehicle may be to be entered, metres. */
export const ENTER_REACH = 4.5;

/** The get-in and get-out sequence: phase seconds, distances (m) and speeds (m/s). */
export const BOARDING = Object.freeze({
  approach: 3, open: 0.45, sit: 0.85, close: 0.45, openOut: 0.4, stand: 0.75, shutDelay: 0.2, shut: 0.45,
  arrive: 0.22, walkWithin: 2.2, cancelIntent: 0.3, stopFirst: 1.5, stopWait: 3, bailSpeed: 8,
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

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Creates the vehicle entry of the lead.
 * @param {import('../core/systems/gameContext.js').GameContext} context
 * @param {{entity: object, movement: ReturnType<typeof import('./onFootMovement.js').createOnFootMovement>,
 *   figure: ReturnType<typeof import('./playerAnimation.js').createPlayerAnimation>}} lead
 */
export function createVehicleEntry(context, { entity, movement, figure }) {
  let vehicle = null;   // the car the lead sits in, from the moment they are seated
  let car = null;       // the car being boarded, driven or left
  let points = null;    // its door and seat (carDoorAndSeat.js)
  let phase = null;     // 'approach' | 'open' | 'sitIn' | 'close' | 'seated' | 'openOut' | 'standOut'
  let clock = 0;        // seconds into the phase
  let waited = 0;       // seconds spent braking before getting out
  let step = 1 / 60;
  let held = false;     // the fleet's seat is the lead's
  let controls = null;
  let door = 0;         // how open the boarded car's door is, 0..1
  let shut = null;      // a door swinging shut behind the lead: {points, amount, delay}
  const known = new Set();
  const intent = { x: 0, z: 0, sprint: false, walk: false, jump: false };
  const from = new THREE.Vector3(), to = new THREE.Vector3(), spot = new THREE.Vector3();
  const turnFrom = new THREE.Quaternion(), turnTo = new THREE.Quaternion(), turn = new THREE.Quaternion();

  const fleet = () => context.systems.find('vehicles');
  const speedOf = (target) => Math.abs(target && target.data && target.data.speed || 0);

  function vehicleEntityOf(found) {
    if (found == null) return null;
    if (typeof found !== 'object') return context.entities.get(found) ?? null;
    if (found.kind) return found;
    const id = found.vehicleId ?? found.id;
    return id == null ? null : context.entities.get(id) ?? null;
  }

  function setDoor(amount) {
    door = Math.min(1, Math.max(0, amount));
    if (points) points.setDoor(door);
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
        vehicleId: target.id, modelId: target.data ? target.data.modelId : null, thiefId: entity.id, driverId, position: { x: p.x, y: p.y, z: p.z },
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
    if (points && door > 0) shut = { points, amount: door, delay: 0 };
    car = null; points = null; phase = null; door = 0;
    movement.state.facing = NaN;
  }

  /** Stops boarding where the lead stands (a move key, the car gone, or going down). */
  function abandon() {
    const seated = phase === 'sitIn' || phase === 'standOut';
    if (held) releaseSeat(false);
    if (seated) {
      figure.walker.sit(null, { fade: 0 });
      figure.reset(movement.state.heading);
    }
    forget();
  }

  function sitOn(fade) {
    figure.walker.sit({ kind: 'driver', wheel: points.steeringWheel, wheelRadius: points.wheelRadius }, { fade });
  }

  /** Starts getting into a car: walk to its door (false when it cannot be entered now). */
  function board(target) {
    if (phase || vehicle || !target || !target.alive) return false;
    const driverId = target.data ? target.data.driverId ?? null : null;
    if (driverId !== null && driverId !== entity.id) return false;
    if (shut) { shut.points.setDoor(0); shut = null; }
    car = target;
    points = createCarDoorAndSeat(fleet(), target);
    // A moving car is claimed now: traffic lets it go and it brakes while the lead walks up.
    if (speedOf(target) > BOARDING.stopFirst && !holdSeat(target)) { car = null; points = null; return false; }
    phase = 'approach'; clock = 0; door = 0;
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
    if (!holdSeat(target, seat, true)) { car = null; points = null; return false; }
    if (seat === 'driver') sitOn(0);
    figure.setVisible(seat === 'driver');
    becomeDriver();
    phase = 'seated'; clock = 0; door = 0;
    return true;
  }

  /** Out of the car at once, beside the driver's door (bailing, teleports, going down). */
  function leaveNow(bailedOut) {
    const yaw = points.yaw();
    points.standPoint(spot);
    releaseSeat(bailedOut);
    becomePedestrian();
    movement.placeAt(spot.x, spot.z, yaw + 0.9);
    figure.walker.sit(null, { fade: 0 });
    figure.reset(yaw + 0.9);
    figure.setVisible(true);
    setDoor(bailedOut ? 0.85 : 0);
    door = bailedOut ? 0 : door; // a bailed door hangs open
    forget();
  }

  /**
   * Leaves the car: the door, then standing out (bailing out at once when `bailedOut`), or stops
   * boarding. `instant` puts the lead outside at once.
   */
  function exit(bailedOut = false, instant = false) {
    if (!car) return;
    if (!vehicle) { abandon(); return; }
    if (bailedOut || instant) { leaveNow(bailedOut); return; }
    if (phase === 'seated' || phase === 'close') { phase = 'openOut'; clock = 0; waited = 0; }
  }

  function startStanding() {
    const yaw = points.yaw();
    const out = yaw + 0.85; // stepping out, turned towards the kerb side
    points.standPoint(to);
    releaseSeat(false);
    becomePedestrian();
    movement.placeAt(to.x, to.z, out);
    to.y = movement.state.y;
    turnTo.setFromAxisAngle(UP, out);
    figure.walker.sit(null, { fade: BOARDING.stand });
    figure.walker.reset(out);
    shut = { points, amount: door, delay: BOARDING.stand + BOARDING.shutDelay };
    phase = 'standOut'; clock = 0;
  }

  /** The door swinging shut behind the lead; every fixed step. */
  function tick(stepSeconds) {
    step = stepSeconds;
    if (!shut) return;
    shut.delay -= stepSeconds;
    if (shut.delay > 0) return;
    shut.amount -= stepSeconds / BOARDING.shut;
    shut.points.setDoor(Math.max(0, shut.amount));
    if (shut.amount <= 0) shut = null;
  }

  /**
   * One fixed step of getting in or out while not seated. `wanted` is the player's on-foot
   * intent (a move key cancels the walk to the door). Returns false when the lead walks freely.
   */
  function boardStep(wanted, stepSeconds) {
    if (!phase || vehicle) return false;
    clock += stepSeconds;
    if (!car.alive) { abandon(); return false; }
    if (held && controls) { controls.throttle = 0; controls.brake = 1; controls.steer = 0; }
    const state = movement.state;
    if (phase === 'approach') {
      if (Math.hypot(wanted.x, wanted.z) > BOARDING.cancelIntent || wanted.jump) { abandon(); return false; }
      const yaw = points.standPoint(spot);
      const dx = spot.x - state.x, dz = spot.z - state.z, distance = Math.hypot(dx, dz);
      if (distance > BOARDING.arrive && clock < BOARDING.approach) {
        const pace = Math.min(1, distance / 0.5);
        intent.x = (dx / distance) * pace; intent.z = (dz / distance) * pace;
        intent.walk = distance < BOARDING.walkWithin; intent.sprint = false; intent.jump = false;
        state.facing = NaN;
        movement.step(intent, stepSeconds);
        return true;
      }
      if (distance > 1.2) { abandon(); return false; }
      phase = 'open'; clock = 0;
      state.facing = yaw;
    }
    if (phase === 'open') {
      state.facing = points.standPoint(spot);
      intent.x = 0; intent.z = 0; intent.jump = false;
      movement.step(intent, stepSeconds);
      setDoor(clock / BOARDING.open);
      if (clock >= BOARDING.open) {
        if (!holdSeat(car)) { abandon(); return true; }
        phase = 'sitIn'; clock = 0;
        from.copy(figure.instance.position);
        turnFrom.copy(figure.instance.quaternion);
        sitOn(BOARDING.sit);
      }
      return true;
    }
    if (phase === 'sitIn') {
      if (controls) { controls.throttle = 0; controls.brake = 1; controls.handbrake = 1; controls.steer = 0; }
      if (clock >= BOARDING.sit) { becomeDriver(); phase = 'close'; clock = 0; }
      return true;
    }
    if (phase === 'standOut') {
      if (clock >= BOARDING.stand) forget();
      return true;
    }
    return false;
  }

  /** One fixed step at the wheel: the drive keys into the car's controls; the lead rides along. */
  function drive(input, stepSeconds = step) {
    clock += stepSeconds;
    if (!vehicle.alive) { exit(true, true); return; }
    if (phase === 'close') {
      setDoor(1 - clock / BOARDING.close);
      if (clock >= BOARDING.close) { setDoor(0); phase = 'seated'; clock = 0; }
    }
    if (phase === 'openOut') {
      if (controls) { controls.throttle = 0; controls.brake = 1; controls.steer = 0; controls.handbrake = 0; controls.horn = false; }
      waited += stepSeconds;
      if (speedOf(vehicle) > BOARDING.stopFirst) {
        clock = 0;
        if (waited > BOARDING.stopWait) { exit(true); return; }
      } else {
        setDoor(clock / BOARDING.openOut);
        if (clock >= BOARDING.openOut) { startStanding(); return; }
      }
    } else if (input.pressed('exitVehicle')) {
      exit(speedOf(vehicle) > BOARDING.bailSpeed);
      if (!vehicle) return;
    } else if (controls) {
      controls.throttle = input.held('accelerate') ? 1 : 0;
      controls.brake = input.held('brake') ? 1 : 0;
      controls.steer = input.axis('steer');
      controls.handbrake = input.held('handbrake') ? 1 : 0;
      controls.horn = input.held('horn');
    }
    const state = movement.state;
    state.previousX = state.x; state.previousY = state.y; state.previousZ = state.z;
    state.x = vehicle.position.x; state.y = vehicle.position.y; state.z = vehicle.position.z;
    state.heading = state.previousHeading = vehicle.heading ?? state.heading;
    state.speed = state.groundSpeed = 0;
  }

  /**
   * Poses the body for this frame while it is in, getting into or out of a seat; false when the
   * figure walks on foot (the on-foot figure update runs instead).
   */
  function frame(dt, alpha) {
    if (!points || phase === null || phase === 'approach' || phase === 'open') return false;
    if (!figure.instance.visible) return true;
    if (phase === 'sitIn' || phase === 'standOut') {
      const p = Math.min(1, (clock + alpha * step) / (phase === 'sitIn' ? BOARDING.sit : BOARDING.stand));
      // In: lowered first, then slid across; out: slid out first, then up.
      const across = phase === 'sitIn' ? easeInOut((p - 0.25) / 0.75) : 1 - easeInOut(p / 0.75);
      const down = phase === 'sitIn' ? easeInOut(p) : 1 - easeInOut(p);
      if (phase === 'sitIn') points.seatPose(to, turnTo); else points.seatPose(from, turnFrom);
      const start = phase === 'sitIn' ? from : to, seat = phase === 'sitIn' ? to : from;
      spot.set(
        start.x + (seat.x - start.x) * across,
        start.y + (seat.y - start.y) * down,
        start.z + (seat.z - start.z) * across,
      );
      if (phase === 'sitIn') turn.slerpQuaternions(turnFrom, turnTo, down);
      else turn.slerpQuaternions(turnFrom, turnTo, 1 - down);
      figure.seat(dt, spot, turn);
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
    tick,
    frame,
    /** The car the lead is seated in (null on foot and while still getting in). */
    get vehicle() { return vehicle; },
    /** The get-in / get-out phase, or null. */
    get phase() { return phase; },
    /** The car being boarded, driven or left. */
    get car() { return car; },
    /** Car ids the lead has taken (not stolen again). */
    known,
  };
}

// Getting in and out of vehicles and driving them. F on foot picks the nearest car the lead can
// enter and the lead gets in through the driver's door: walks to anchor_door_driver (from the
// passenger side round the nearer end of the car; a move key cancels), then the character run-time's vehicle transit (walker.enterVehicle) turns to the door,
// reaches the handle, pulls it open stepping back with it, ducks in, sits and swings in at the
// wheel and pulls the door shut; the door follows the transit through the fleet's setDoorOpen.
// A car traffic was driving is taken by force: the transit's carjack hauls the driver out first
// (at its 'pull' stage a driver drawn by traffic or pedestrians, seatedDriverOf(id), plays the
// run-time's dragged-out motion, and VEHICLE_STOLEN {jacked, dragged, door, seat} goes out then).
// Thrown off a motorcycle (the physics' riderSeated false with riderThrow), the lead lands at
// the throw point knocked down, tumbles as a ragdoll and gets up.
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
import { ON_FOOT_TUNING } from './onFootMovement.js';

/** How far from the lead a vehicle may be to be entered, metres. */
export const ENTER_REACH = 4.5;

/**
 * The walk to the door and the way out: seconds, distances (m) and speeds (m/s). Shift 8 (QA:
 * F from 2.5 m took 6 s): the lead goes to the door at a brisk pace (`brisk`, easing to
 * `arriveSpeed` over the last metre) and starts the transit a step out (`arrive`), so the
 * transit's turn takes the last stride instead of a stop and a shuffle.
 */
// The 6 s were mostly the walk's 3 s time limit: the car's collider is wider than the door
// anchor's stand-off, so the capsule stopped against the body short of `arrive` and waited.
// Now a lead within `giveUp` who stops closing in (under stallSpeed for stallTime) has arrived.
export const BOARDING = Object.freeze({
  approach: 3, arrive: 0.4, giveUp: 1.2, brisk: 2.7, arriveSpeed: 1.7, easeIn: 1.4, cancelIntent: 0.3,
  stallSpeed: 0.35, stallTime: 0.12, detour: 0.45,
  driverSide: -0.3, pastEnd: 2.3, corner: 0.9, cornerSpeed: 3.2, perCorner: 2.5,
  stopFirst: 1.5, stopWait: 3, bailSpeed: 8, bailDoor: 0.85, rolling: 0.6, claimSpeed: 6,
});
// `claimSpeed` (shift 10, carjack5.log): F beside a traffic car passing at 63 km/h claimed it; it
// braked 17 m away from the lead, the walk gave up at 6 s and the car stood empty. A car faster
// than this (21.6 km/h) cannot be boarded: carjacks are for cars crawling, queueing or stopped.

/**
 * How much faster than the run-time's own timing the lead's get-in plays, per transit stage:
 * its enter takes 2.95 s (turn 0.35, reach 0.3, open 0.6, step in 1.0, close 0.7), slow for a
 * player who wants to drive; at these paces it takes about 2.1 s and the keys drive from the
 * door's pull (about 1.65 s). The duck, the swing in and the door keep their shapes (one pace per
 * stage, no step), so it reads as purposeful, not rushed. Getting out keeps the run-time's pace.
 */
export const BOARDING_PACE = Object.freeze({ turn: 1.6, reach: 1.5, open: 1.3, pull: 1.15, step_in: 1.3, close: 1.6 });

/**
 * Helicopter flight keys (shift 11, vehicle-system 11:20): Space climbs, Left Shift or Left Ctrl
 * descends, through the craft's controls.lift (-1..1); both are free in the vehicle context
 * (Space is otherwise the handbrake, which a helicopter does not use). The core bindings may list
 * them; until they do, the player bridges them in at run time (ensureFlightKeys).
 */
export const FLIGHT_KEYS = Object.freeze({ ascend: Object.freeze(['Space']), descend: Object.freeze(['ShiftLeft', 'ControlLeft']) });
export const FLIGHT_KEY_LABELS = Object.freeze({ ascend: 'Climb (helicopter)', descend: 'Descend (helicopter)' });

/**
 * The lead never steps out of a helicopter in the air: F above `stepOut` metres (the fleet's
 * record.car.altitude over the ground) lands it first, sinking at full down-lift, then gets out.
 */
export const LANDING = Object.freeze({ stepOut: 1.5, hintSeconds: 9 });

/**
 * Adds the flight keys to the vehicle context when the bindings do not list them (run time only,
 * nothing is saved) and names them for the controls menu and prompts.
 * @param {{actions?: object, labels?: Record<string, string>} | null} controls context.controls
 */
export function ensureFlightKeys(controls) {
  const actions = controls && controls.actions;
  if (!actions || typeof actions.codesFor !== 'function' || typeof actions.rebind !== 'function') return false;
  try {
    for (const action of Object.keys(FLIGHT_KEYS)) {
      if (actions.codesFor(action, 'inVehicle').length === 0) actions.rebind('inVehicle', action, [...FLIGHT_KEYS[action]]);
    }
  } catch { return false; }
  if (controls.labels) for (const action of Object.keys(FLIGHT_KEY_LABELS)) controls.labels[action] = controls.labels[action] ?? FLIGHT_KEY_LABELS[action];
  return true;
}

/** The lift a helicopter's pilot asks for from the keys: +1 climb, -1 descend, 0 hold. */
export function flightLift(input) {
  const up = input.held('ascend') || input.held('handbrake') ? 1 : 0;
  const down = input.held('descend') ? 1 : 0;
  return up - down;
}

/** The pace of the lead's transit stage `stage` of `kind` (1 for getting out). */
export function boardingPace(kind, stage) {
  if (kind !== 'enter' && kind !== 'jack') return 1;
  return BOARDING_PACE[stage] || 1;
}

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
  let pendingTheft = null; // a carjack's VEHICLE_STOLEN, sent at the transit's 'pull' stage
  let riding = false;   // the motorcycle under the lead has carried them (riderSeated seen)
  let lastDistance = Infinity, stall = 0; // the walk to the door closing in, or pressed against the car
  let detour = 0, detourSide = 1;         // seconds left of a sidestep round an obstacle, and its side
  let rollWait = 0;     // seconds the walk's limit was held while a claimed car still rolled to a stop
  const known = new Set();
  const intent = { x: 0, z: 0, sprint: false, walk: false, jump: false };
  const spot = new THREE.Vector3();
  const viewSpot = new THREE.Vector3(); // the camera's own stand-point read (boardingYaw)
  const turn = new THREE.Quaternion();

  const fleet = () => context.systems.find('vehicles');
  const speedOf = (target) => Math.abs(target && target.data && target.data.speed || 0);
  const isHelicopter = (target) => Boolean(target && target.tags && target.tags.has('helicopter'));
  /** A helicopter's height over the ground (the fleet's physics body), 0 for anything else. */
  const altitudeOf = (target) => {
    const vehicles = fleet();
    const record = vehicles && typeof vehicles.get === 'function' ? vehicles.get(target.id) : null;
    const altitude = record && record.car ? record.car.altitude : 0;
    return typeof altitude === 'number' ? altitude : 0;
  };
  let hintLeft = 0;     // seconds the helicopter's key hint still shows
  ensureFlightKeys(context.controls);

  function setHint(action, text) {
    context.events.emit(GAME_EVENTS.HELP_PROMPT_CHANGED, text ? { action, text } : { action: null, text: null });
  }
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
      // The car being boarded keeps the verdict taken at F: a moving traffic car is claimed (the
      // fleet's driverId becomes the lead's) before the walk, which isCarjack would read as no
      // jack (shift 9: the claimed car's theft went out at once, unjacked, and nobody was hauled).
      const theft = {
        vehicleId: target.id, modelId: target.data ? target.data.modelId : null, thiefId: entity.id, driverId,
        position: { x: p.x, y: p.y, z: p.z }, jacked: car === target ? jack : isCarjack(target, known),
      };
      // A carjack is announced when the lead's hands haul the occupant out (haulOut).
      if (theft.jacked && jack && car === target) pendingTheft = theft;
      else context.events.emit(GAME_EVENTS.VEHICLE_STOLEN, theft);
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
    if (isHelicopter(car)) {
      hintLeft = LANDING.hintSeconds;
      setHint('ascend', `climb, ${keyOf('descend', 'Shift')} descend, W/S fly, A/D turn, F lands and leaves`);
    }
  }

  function keyOf(action, fallback) {
    const label = context.controls && typeof context.controls.promptFor === 'function' ? context.controls.promptFor(action, 'inVehicle') : '';
    return label || fallback;
  }

  function becomePedestrian() {
    if (!vehicle) return;
    context.entities.removeTag(vehicle, ENTITY_TAGS.PLAYER);
    context.entities.addTag(entity, ENTITY_TAGS.PLAYER);
    entity.data.vehicleId = null;
    vehicle = null;
    context.controls.setPlayContext('onFoot');
    if (hintLeft > 0) { hintLeft = 0; setHint(null, null); }
  }

  function forget() {
    car = null; points = null; phase = null; jack = false; riding = false;
    movement.state.facing = NaN;
    figure.instance.rotation.x = 0; figure.instance.rotation.z = 0;
  }

  /**
   * The occupant a traffic or pedestrians system draws in the seat of `vehicleId`, if any: an
   * object with the run-time's `walker` (their member seatedDriverOf(vehicleId)).
   */
  function seatedDriverOf(vehicleId) {
    for (const name of ['traffic', 'pedestrians']) {
      const system = context.systems.find(name);
      const found = system && typeof system.seatedDriverOf === 'function' ? system.seatedDriverOf(vehicleId) : null;
      if (found && found.walker) return found;
    }
    return null;
  }

  /**
   * The carjack's haul (the lead's transit stage 'pull'): a drawn driver plays the run-time's
   * dragged-out motion (yanked to the doorway and thrown down beside the door); then
   * VEHICLE_STOLEN {jacked: true, dragged, door, seat} goes out, with the anchors, so a system
   * that draws the driver only now can seat one and play walker.exitVehicle({door, seat,
   * dragged: true}) itself (dragged false).
   * With `plain` (the lead gave up after claiming a moving car, before his hands reached the
   * driver) the driver climbs out by himself through the door instead (walker.exitVehicle with
   * dragged false) and the theft carries `abandoned: true`; nobody is thrown down.
   */
  function haulOut(plain = false) {
    const theft = pendingTheft;
    pendingTheft = null;
    if (!theft) return;
    const driver = points ? seatedDriverOf(theft.vehicleId) : null;
    theft.dragged = false;
    if (plain) theft.abandoned = true;
    if (driver && typeof driver.walker.exitVehicle === 'function') {
      driver.walker.exitVehicle({ door: points.doorAnchor, seat: points.seatAnchor, dragged: !plain });
      // `dragged` tells the crowd the seated body already plays its way out (do not seat another).
      theft.dragged = true;
    }
    if (points) { theft.door = points.doorAnchor; theft.seat = points.seatAnchor; theft.side = 'driver'; }
    context.events.emit(GAME_EVENTS.VEHICLE_STOLEN, theft);
  }

  /**
   * The launch of a rider thrown off a motorcycle this step ({x, y, z, vx, vy, vz}), or null: the
   * bike carried its rider in an earlier step (riderSeated) and has now lost them and fallen.
   */
  function riderThrowOf(target) {
    const vehicles = fleet();
    const record = vehicles && typeof vehicles.get === 'function' ? vehicles.get(target.id) : null;
    const body = record ? record.car : null;
    if (!body || typeof body.riderSeated !== 'boolean') return null;
    if (body.riderSeated) { riding = true; return null; }
    return riding && body.fallen && body.riderThrow ? body.riderThrow : null;
  }

  /**
   * Thrown off a motorcycle (a crash above the bike's crashSpeedChange): the lead leaves the seat
   * at the throw point with the bike's launch, the capsule is pushed (knocked down) and the body
   * tumbles as a ragdoll and gets up when it comes to rest.
   */
  function thrownOff(launch) {
    releaseSeat(true);
    becomePedestrian();
    const yaw = movement.state.heading;
    movement.placeAt(launch.x, launch.z, yaw);
    figure.walker.sit(null, { fade: 0 });
    figure.reset(yaw);
    figure.setVisible(true);
    forget();
    if (movement.capsule && typeof movement.capsule.push === 'function') movement.capsule.push(launch.vx, launch.vy, launch.vz, true);
    if (typeof figure.walker.ragdoll === 'function') {
      figure.walker.ragdoll({ vx: launch.vx, vy: Math.max(1.5, launch.vy), vz: launch.vz, at: 0.5, spin: 1.5, getUp: true });
    }
  }

  /** Stops boarding (a move key, the car gone, going down): the lead stands by the door. */
  function abandon() {
    // The car was already claimed from traffic but the driver was never touched: he gets out.
    if (pendingTheft) haulOut(true);
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
    if (speedOf(target) > BOARDING.claimSpeed) return false;
    car = target;
    points = createCarDoorAndSeat(fleet(), target);
    jack = isCarjack(target, known);
    // A moving car is claimed now: traffic lets it go and it brakes while the lead walks up.
    if (speedOf(target) > BOARDING.stopFirst && !holdSeat(target)) { forget(); return false; }
    const state = movement.state;
    points.toCar(spot, state.x, state.z);
    // A boat is boarded straight over its swim platform: no walk round to a driver's side.
    route = points.fromBoard ? 0 : spot.x > BOARDING.driverSide ? (Math.abs(spot.z) > BOARDING.pastEnd ? 1 : 2) : 0;
    end = spot.z < 0 ? -1 : 1;
    limit = BOARDING.approach + route * BOARDING.perCorner;
    phase = 'approach'; clock = 0;
    lastDistance = Infinity; stall = 0; detour = 0; rollWait = 0;
    return true;
  }

  /**
   * No longer closing in on the door: within giveUp (the capsule against the car's body) that is
   * arrived (true); further out a post or a kerbside box is in the straight way, so the lead
   * sidesteps it for BOARDING.detour seconds (window traces, shift 8: stuck 1.6 s behind one).
   */
  function stalled(distance, stepSeconds, dx, dz) {
    // Not while a claimed car still rolls away from the lead (the door is moving, not blocked).
    if (held && speedOf(car) > BOARDING.rolling) { stall = 0; lastDistance = distance; return false; }
    // Not while the first strides pick up speed.
    stall = clock > 0.3 && lastDistance - distance < BOARDING.stallSpeed * stepSeconds ? stall + stepSeconds : 0;
    lastDistance = distance;
    if (stall < BOARDING.stallTime) return false;
    if (distance < BOARDING.giveUp) return true;
    if (detour <= 0) {
      // Round the side the capsule already slides to (its velocity across the way to the door).
      const s = movement.state, across = (s.x - s.previousX) * -dz + (s.z - s.previousZ) * dx;
      detourSide = across === 0 ? -detourSide || 1 : Math.sign(across);
      detour = BOARDING.detour;
    }
    stall = 0;
    return false;
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
      // A traffic car claimed on the move brakes for the lead: the walk's clock waits while it
      // still rolls (up to stopWait), so the lead is not given up a few metres short of a door
      // that was moving away (shift 9: carjack.js, F boarded nothing and the car stood empty).
      if (held && rollWait < BOARDING.stopWait && speedOf(car) > BOARDING.rolling) { rollWait += stepSeconds; limit += stepSeconds; }
      // From the passenger side: round the nearer end, corner by corner, to the driver's door.
      if (route > 0) points.corner(spot, route === 2 ? 1 : -1, end); else points.standPoint(spot);
      let dx = spot.x - state.x, dz = spot.z - state.z, distance = Math.hypot(dx, dz);
      // Shift 12 (owner's video: the lead stood ~5 s beside the car, then was put in unseen): a
      // corner the capsule cannot quite reach (against the bumper, a post at the kerb) counts as
      // rounded once the lead stops closing in near it; further out it sidesteps (stalled()).
      const cornerStuck = route > 0 && distance > 1e-3 && stalled(distance, stepSeconds, dx / distance, dz / distance);
      if (route > 0 && (distance < BOARDING.corner || cornerStuck)) {
        stall = 0; lastDistance = Infinity;
        route -= 1;
        if (route > 0) points.corner(spot, -1, end); else points.standPoint(spot);
        dx = spot.x - state.x; dz = spot.z - state.z; distance = Math.hypot(dx, dz);
      }
      if (distance > BOARDING.arrive && clock < limit && !(route === 0 && stalled(distance, stepSeconds, dx / distance, dz / distance))) {
        // Round the corners at a jog (cutting each one by BOARDING.corner); to the door briskly,
        // easing over the last metre. Shift 12: at the full run the lead swung 1.3 m wide past
        // the driver's door (owner's video: "walked past the door") and had to come back.
        const speed = route > 0 ? Math.min(ON_FOOT_TUNING.runSpeed, BOARDING.cornerSpeed)
          : Math.min(BOARDING.brisk, BOARDING.arriveSpeed + BOARDING.easeIn * (distance - BOARDING.arrive));
        const pace = speed / ON_FOOT_TUNING.runSpeed;
        let ux = dx / distance, uz = dz / distance;
        if (detour > 0) { // sidestep: the way to the door turned about 60 degrees to one side
          detour -= stepSeconds;
          const sx = -uz * detourSide, sz = ux * detourSide;
          ux = ux * 0.5 + sx * 0.866; uz = uz * 0.5 + sz * 0.866;
        }
        intent.x = ux * pace; intent.z = uz * pace;
        intent.walk = false; intent.sprint = false; intent.jump = false;
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
    const thrown = phase === 'seated' ? riderThrowOf(vehicle) : null;
    if (thrown) { thrownOff(thrown); return; }
    if (phase === 'stopping') {
      brake();
      if (controls) controls.handbrake = 0;
      if (speedOf(vehicle) <= BOARDING.stopFirst) startExit();
      else if (clock > BOARDING.stopWait) { exit(true); return; }
    } else if (phase === 'exit') {
      brake();
      if (controls) { controls.handbrake = 1; controls.lift = 0; }
    } else if (phase === 'landing') {
      // F in the air: sink straight down and land, then get out the usual way.
      brake();
      if (controls) { controls.handbrake = 0; controls.lift = -1; }
      if (altitudeOf(vehicle) <= LANDING.stepOut) {
        if (controls) controls.lift = 0;
        phase = 'seated';
        exit(false);
      }
    } else if (phase === 'seated' && input.pressed('exitVehicle')) {
      if (isHelicopter(vehicle) && altitudeOf(vehicle) > LANDING.stepOut) {
        phase = 'landing'; clock = 0;
        hintLeft = 4; setHint(null, 'Landing before you step out');
      } else {
        exit(speedOf(vehicle) > BOARDING.bailSpeed);
        if (!vehicle) return;
      }
    } else if (controls) {
      controls.throttle = input.held('accelerate') ? 1 : 0;
      controls.brake = input.held('brake') ? 1 : 0;
      controls.steer = input.axis('steer');
      if (isHelicopter(vehicle)) {
        controls.handbrake = 0;
        controls.lift = flightLift(input);
      } else controls.handbrake = input.held('handbrake') ? 1 : 0;
      controls.horn = input.held('horn');
    }
    if (hintLeft > 0) {
      hintLeft -= stepSeconds;
      if (hintLeft <= 0) setHint(null, null);
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
      const t = transit();
      figure.transit(dt * boardingPace(t.kind, t.stage));
      points.setDoor(t.door);
      // The carjack's haul: at 'pull' (or later, if the stage was skipped) the occupant comes out.
      if (pendingTheft && phase === 'enter' && t.stage !== 'start' && t.stage !== 'reach' && t.stage !== 'open') haulOut();
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
    /**
     * Shift 12 (QA D-sheet: the camera hugged the lead's shoulder, the car out of frame): on the
     * last leg to the driver's door and while getting in, the yaw the lead faces at the door (the
     * car's side): the camera swings behind him to frame the door. NaN otherwise.
     */
    get boardingYaw() {
      if (!points || vehicle || !(phase === 'enter' || (phase === 'approach' && route === 0))) return NaN;
      return points.standPoint(viewSpot);
    },
    /** The car being boarded, driven or left. */
    get car() { return car; },
    /** Whether the current boarding is a carjack. */
    get jacking() { return jack; },
    /** Car ids the lead has taken (not stolen again). */
    known,
  };
}

// Getting in and out of vehicles and driving them. F on foot picks the nearest car the lead can
// enter and the lead gets in through the driver's door: walks to anchor_door_driver (round the car
// on the shorter way; from the pavement side of a car nobody drives, or past someone holding the
// driver's door, by the passenger door, sliding across; a boat over its swim platform; a move key
// cancels), then the character run-time's vehicle transit (walker.enterVehicle) turns to the door,
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
// Shift 14 (F to seated: 3.2 s from 2.5 m, 5.3 s from the passenger side; a lead pressed against
// the body for 4 s, then quietly given up): the way round the car is planned every step
// (carDoorAndSeat way()), the walk is a jog (`brisk`, `cornerSpeed`), its time limit grows with
// the way (`approach` + `perMetre`), and a lead stopped or out of time within `reachAnyway` of
// the door gets in from there (the transit's turn glides the last metres at `glide` m/s) instead
// of standing beside the car. A boat is boarded from up to `hop` metres off its swim platform
// (from the quay, never wading round the hull) and left onto land within `landing` metres (off a
// shelving beach, into water at most `wadeDepth` deep within `wade` of the stern).
export const BOARDING = Object.freeze({
  approach: 2, perMetre: 0.45, arrive: 0.45, giveUp: 1.2, reachAnyway: 2.2, brisk: 3.4, arriveSpeed: 2, easeIn: 1.8,
  cancelIntent: 0.3, stallSpeed: 0.35, stallTime: 0.12, detour: 0.45, cornerSpeed: 3.8, turnSpeed: 2.2, glide: 2.6, hop: 2.4, landing: 6.5, wade: 3, wadeDepth: 0.7, sideways: 1.5,
  stopFirst: 1.5, stopWait: 3, bailSpeed: 8, bailDoor: 0.85, rolling: 0.6, claimSpeed: 6, blocked: 0.9,
});

/**
 * The crowd's modes in which a person holds their ground (pedestrians/crowdSteering.js
 * HOLDS_GROUND): standing at a door in one of them, they do not step aside for the lead.
 */
const HOLDS_DOOR = new Set(['fight', 'sit', 'down', 'dead', 'dragged']);
// `claimSpeed` (shift 10, carjack5.log): F beside a traffic car passing at 63 km/h claimed it; it
// braked 17 m away from the lead, the walk gave up at 6 s and the car stood empty. A car faster
// than this (21.6 km/h) cannot be boarded: carjacks are for cars crawling, queueing or stopped.

/**
 * How much faster than the run-time's own timing the lead's get-in plays, per transit stage:
 * its enter takes 2.95 s (turn 0.35, reach 0.3, open 0.6, step in 1.0, close 0.7), slow for a
 * player who wants to drive; at these paces it takes about 1.85 s and the keys drive from the
 * door's pull (about 1.5 s). The duck, the swing in and the door keep their shapes (one pace per
 * stage, no step), so it reads as purposeful, not rushed. Getting out keeps the run-time's pace.
 */
export const BOARDING_PACE = Object.freeze({ turn: 1.6, reach: 2, open: 1.45, pull: 1.15, step_in: 1.45, close: 1.9 });

/**
 * A boat's paces (no door to open): a short reach, the walk from the swim platform forward to the
 * helm at a steady step (step_in, about 4 m), and getting out across the stern onto the quay.
 */
export const BOAT_PACE = Object.freeze({
  enter: Object.freeze({ turn: 1.6, reach: 4, open: 4, step_in: 0.6, close: 5 }),
  exit: Object.freeze({ open: 3, step_out: 0.7, close: 1.4 }),
});

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

/**
 * The pace of the lead's transit stage `stage` of `kind` (1 for getting out of a car). The turn
 * that starts `gap` metres from the door glides there at no more than BOARDING.glide m/s.
 * @param {string | null} kind
 * @param {string | null} stage
 * @param {number} [gap] Metres from the door when the transit began.
 * @param {boolean} [boat] A boat (BOAT_PACE).
 */
export function boardingPace(kind, stage, gap = 0, boat = false) {
  const paces = boat ? (kind === 'exit' ? BOAT_PACE.exit : BOAT_PACE.enter) : kind === 'enter' || kind === 'jack' ? BOARDING_PACE : null;
  if (!paces || (kind === 'exit' && !boat)) return 1;
  const pace = paces[stage] || 1;
  return stage === 'turn' && gap > 0 ? Math.min(pace, (0.35 * BOARDING.glide) / gap) : pace;
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
  let direct = false;   // the walk heads straight for the door (no corner of the car in the way)
  let gap = 0;          // metres from the door when the transit began (its turn glides them)
  let stalls = 0;       // sidesteps on this walk
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
  const doorSpot = new THREE.Vector3(); // the door's stand point this step
  const viewSpot = new THREE.Vector3(); // the camera's own stand-point read (boardingYaw)
  const turn = new THREE.Quaternion();
  const blockers = [];
  const blockerFilter = { kind: 'character', tag: ENTITY_TAGS.PEDESTRIAN };
  let boatX = 0, boatZ = 0; // the lead, while a boat's swim platform is measured (boatFilter)
  const boatFilter = {
    kind: 'vehicle', tag: 'boat',
    accept: (e) => e.owner === 'vehicles' && Boolean(e.data) && e.data.health > 0 && boardGapOf(e) <= ENTER_REACH,
  };

  const fleet = () => context.systems.find('vehicles');
  /** The ground's height at a point (the city's, exact): a car's door point stands on it. */
  const groundAt = (x, z) => {
    const city = context.systems.find('openWorldCity');
    return city && typeof city.groundHeightAt === 'function' ? city.groundHeightAt(x, z) : NaN;
  };
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

  /** Metres from the lead (boatX, boatZ) to a boat's swim platform (anchor_board), Infinity without one. */
  function boardGapOf(target) {
    const vehicles = fleet();
    const rig = vehicles && typeof vehicles.get === 'function' ? vehicles.get(target.id)?.rig : null;
    const board = rig && rig.root && rig.asset && rig.asset.anchors ? rig.asset.anchors.anchor_board : null;
    if (!board) return Infinity;
    rig.root.updateWorldMatrix(true, false);
    spot.copy(board.position).applyMatrix4(rig.root.matrixWorld);
    return Math.hypot(spot.x - boatX, spot.z - boatZ);
  }

  /**
   * Shift 14: whether someone who will not step aside (the crowd's modes that hold their ground,
   * or a mission's person) stands at the door in use; the lead then takes the other door.
   */
  function doorBlocked() {
    if (typeof context.entities.within !== 'function') return false;
    points.standPoint(doorSpot);
    blockers.length = 0;
    context.entities.within(doorSpot.x, doorSpot.z, BOARDING.blocked, blockerFilter, blockers);
    for (let i = 0; i < blockers.length; i += 1) {
      const data = blockers[i].data || {};
      if (HOLDS_DOOR.has(data.mode) || data.missionGiver || data.missionEnemy) return true;
    }
    return false;
  }

  /** Shift 14: the crowd steps out of the door the lead is walking to or getting in by. */
  function clearDoorway() {
    const crowd = context.systems.find('pedestrians');
    const simulation = crowd ? crowd.simulation : null;
    if (!simulation || typeof simulation.clearDoorway !== 'function') return;
    const yaw = points.standPoint(doorSpot);
    simulation.clearDoorway(doorSpot.x, doorSpot.z, Math.sin(yaw), Math.cos(yaw));
  }

  /**
   * Where to step off a boat, into `spot`: land (shore distance over 0.6 m: a quay, a beach)
   * within BOARDING.landing of its swim platform, nearest first; else, off a shelving beach the
   * boat cannot come close to, water no deeper than BOARDING.wadeDepth within BOARDING.wade of
   * the platform (the lead wades ashore); false on open water.
   */
  function landingSpot() {
    const city = context.systems.find('openWorldCity');
    const plan = city && city.plan;
    const shore = plan && (plan.shoreDistanceAt || (plan.terrain && plan.terrain.shoreDistanceAt));
    if (typeof shore !== 'function') return false;
    const ground = typeof city.groundHeightAt === 'function' ? city.groundHeightAt : null;
    points.standPoint(doorSpot);
    for (let pass = 0; pass < 2; pass += 1) {
      if (pass === 1 && !ground) break;
      for (let r = pass ? 0.5 : 1; r <= (pass ? BOARDING.wade : BOARDING.landing); r += 0.5) {
        for (let k = 0; k < 24; k += 1) {
          const a = (k / 24) * Math.PI * 2, x = doorSpot.x + Math.sin(a) * r, z = doorSpot.z + Math.cos(a) * r;
          const y = ground ? ground(x, z) : NaN;
          if (pass ? y > -BOARDING.wadeDepth : shore(x, z) > 0.6) { spot.set(x, y, z); return true; }
        }
      }
    }
    return false;
  }

  /**
   * The height to put the capsule down at a point of the car (shift 14, lead engineer: placeAt
   * without one reads groundHeightAt, which beside a kerb is the pavement's, 0.145 m over the
   * road the transit posed the feet on, so every exit there popped up and dropped back): the
   * point's own height while the car stands upright, else undefined (placeAt's ground).
   */
  function heightAt(point) {
    return Number.isFinite(point.y) && points.upright ? point.y : undefined;
  }

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
    if (!controls) return;
    controls.throttle = 0; controls.steer = 0; controls.horn = false;
    // A boat's brake is full astern (shift 14 boat probe: held while the lead boarded and before
    // getting out, it backed away at 1.8 m/s): the throttle is cut and the water stops it.
    controls.brake = points && points.fromBoard ? 0 : 1;
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
      movement.placeAt(spot.x, spot.z, yaw + Math.PI, heightAt(spot));
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
    points = createCarDoorAndSeat(fleet(), target, groundAt);
    jack = isCarjack(target, known);
    // A moving car is claimed now: traffic lets it go and it brakes while the lead walks up.
    if (speedOf(target) > BOARDING.stopFirst && !holdSeat(target)) { forget(); return false; }
    const state = movement.state;
    // The walk's time limit grows with the way round the car (a boat's platform: straight).
    let way = points.way(spot, state.x, state.z);
    // Shift 14 (5.3-5.6 s from the passenger side, mostly the run round the car): a car nobody
    // drives is got into by the passenger door when that way is shorter by `sideways` metres; the
    // lead slides across to the wheel (a carjack keeps the driver's door: the driver is hauled out).
    if (!jack && !points.fromBoard && points.hasPassengerDoor) {
      points.useDoor('passenger');
      const across = points.way(spot, state.x, state.z);
      if (across + BOARDING.sideways < way) way = across; else points.useDoor('driver');
      // Someone who will not step aside stands at that door: the other one, if it is free.
      if (doorBlocked()) {
        const side = points.doorSide;
        points.useDoor(side === 'driver' ? 'passenger' : 'driver');
        if (doorBlocked()) points.useDoor(side);
        else way = points.way(spot, state.x, state.z);
      }
    }
    limit = BOARDING.approach + BOARDING.perMetre * way;
    phase = 'approach'; clock = 0; direct = false; gap = 0; stalls = 0;
    lastDistance = Infinity; stall = 0; detour = 0; rollWait = 0;
    return true;
  }

  /**
   * No longer closing in on the door (`distance` is the way left): within giveUp of the door (the
   * capsule against the car's body), or within reachAnyway after a sidestep did not help, that is
   * arrived (true); further out a post or a kerbside box is in the way, so the lead sidesteps it
   * for BOARDING.detour seconds (window traces, shift 8: stuck 1.6 s behind one).
   */
  function stalled(distance, doorGap, stepSeconds, dx, dz) {
    // Not while a claimed car still rolls away from the lead (the door is moving, not blocked).
    if (held && speedOf(car) > BOARDING.rolling) { stall = 0; lastDistance = distance; return false; }
    // Not while the first strides pick up speed.
    stall = clock > 0.3 && lastDistance - distance < BOARDING.stallSpeed * stepSeconds ? stall + stepSeconds : 0;
    lastDistance = distance;
    if (stall < BOARDING.stallTime) return false;
    if (doorGap < BOARDING.giveUp || (stalls > 0 && doorGap < BOARDING.reachAnyway)) return true;
    stalls += 1;
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
    // Shift 14 (boat probe: F on the quay 2 m behind a moored speedboat did nothing): a boat is in
    // reach by its swim platform, not by its middle, 4 m further out over the water.
    boatX = state.x; boatZ = state.z;
    const boat = context.entities && typeof context.entities.nearest === 'function'
      ? context.entities.nearest(state.x, state.z, ENTER_REACH + 6, boatFilter) : null;
    return board(boat || vehicleEntityOf(vehicles.nearestEnterable(state.x, state.z, ENTER_REACH)));
  }

  /** Takes a seat at once (PLAYER_ENTER_VEHICLE from missions and scenes; not a theft). */
  function enter(vehicleId, seat = 'driver') {
    const target = context.entities.get(vehicleId);
    if (!target || !target.alive || vehicle) return false;
    if (phase) abandon();
    car = target;
    points = createCarDoorAndSeat(fleet(), target, groundAt);
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
    const y = heightAt(spot);
    releaseSeat(bailedOut);
    becomePedestrian();
    movement.placeAt(spot.x, spot.z, yaw, y);
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
    // Shift 14: out of a boat onto the quay or beach beside it (the transit's door point moves
    // there), never off the swim platform into the water; on open water the lead stays at the helm.
    if (points.fromBoard) {
      if (!landingSpot()) {
        phase = 'seated'; clock = 0;
        hintLeft = 4; setHint(null, 'Steer to a quay or a beach to get out');
        return;
      }
      points.moveDoor(spot.x, spot.z, spot.y);
    }
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
    // At the height the transit posed the feet at (the door anchor's ground), not groundHeightAt.
    movement.placeAt(t.x, t.z, yaw, Number.isFinite(t.y) ? t.y : undefined);
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
    clearDoorway();
    if (phase === 'approach') {
      if (Math.hypot(wanted.x, wanted.z) > BOARDING.cancelIntent || wanted.jump) { abandon(); return false; }
      // A traffic car claimed on the move brakes for the lead: the walk's clock waits while it
      // still rolls (up to stopWait), so the lead is not given up a few metres short of a door
      // that was moving away (shift 9: carjack.js, F boarded nothing and the car stood empty).
      if (held && rollWait < BOARDING.stopWait && speedOf(car) > BOARDING.rolling) { rollWait += stepSeconds; limit += stepSeconds; }
      // The next point of the way round the car (the door itself once no corner is in the way).
      const length = points.way(spot, state.x, state.z);
      points.standPoint(doorSpot);
      const doorGap = Math.hypot(doorSpot.x - state.x, doorSpot.z - state.z);
      direct = length <= doorGap + 1e-3;
      const dx = spot.x - state.x, dz = spot.z - state.z, distance = Math.hypot(dx, dz);
      // A boat's swim platform is stepped onto from up to BOARDING.hop off it (the quay's edge).
      const arrive = points.fromBoard ? BOARDING.hop : BOARDING.arrive;
      const stuck = distance > 1e-3 && stalled(length, doorGap, stepSeconds, dx / distance, dz / distance);
      if (!(direct && doorGap <= arrive) && clock < limit && !stuck) {
        // Round the corners at a jog; to the door briskly, easing over the last metre. Shift 12:
        // at the full run the lead swung 1.3 m wide past the driver's door (owner's video:
        // "walked past the door") and had to come back.
        // Into a corner of the car the jog eases to `turnSpeed` (shift 14: at 3.8 m/s the lead
        // swung 0.8 m wide round the nose before heading for the door).
        const speed = !direct ? Math.min(ON_FOOT_TUNING.runSpeed, BOARDING.cornerSpeed, BOARDING.turnSpeed + BOARDING.easeIn * distance)
          : Math.min(BOARDING.brisk, BOARDING.arriveSpeed + BOARDING.easeIn * (doorGap - arrive));
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
      // Never left standing beside the car: within reachAnyway (out of time, or stuck against
      // something) the transit's turn glides the lead the rest of the way to the door.
      if (doorGap > (points.fromBoard ? Math.max(BOARDING.hop, BOARDING.reachAnyway) : BOARDING.reachAnyway) || !holdSeat(car)) {
        abandon(); return false;
      }
      brake();
      gap = doorGap;
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
      // A boat is never bailed out of (into the water): it gets out the usual way, onto land.
      if (speedOf(vehicle) <= BOARDING.stopFirst || (points.fromBoard && clock > BOARDING.stopWait)) startExit();
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
        exit(!points.fromBoard && speedOf(vehicle) > BOARDING.bailSpeed);
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
      figure.transit(dt * boardingPace(t.kind, t.stage, phase === 'enter' ? gap : 0, points.fromBoard));
      points.setDoor(t.door);
      // The carjack's haul: at 'pull' (or later, if the stage was skipped) the occupant comes out.
      if (pendingTheft && phase === 'enter' && t.stage !== 'start' && t.stage !== 'reach' && t.stage !== 'open') haulOut();
      if (phase === 'enter') {
        if (!vehicle && (t.stage === 'close' || !t.kind)) becomeDriver();
        // In by the passenger door: getting out is by the driver's again.
        if (!t.kind) { phase = 'seated'; clock = 0; points.useDoor('driver'); }
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
      if (!points || vehicle || !(phase === 'enter' || (phase === 'approach' && direct))) return NaN;
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

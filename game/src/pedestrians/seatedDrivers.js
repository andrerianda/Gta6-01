// Drivers at the wheel of the traffic cars near the camera: a pooled pedestrian body sits in the
// driver's seat of each car traffic drives within DRIVER_RADIUS of the camera (traffic.nearCars),
// placed at the car's anchor_seat_driver every frame with both hands on the steering wheel's rim
// (the run-time's walker.sit({kind: 'driver', wheel})). seatedDriverOf(vehicleId) gives the
// player's carjack the body ({walker}); once the run-time's vehicle transit starts on it
// (walker.exitVehicle({door, seat, dragged: true}) at the lead's 'pull' stage) the driver leaves
// the seat and goes to the crowd (onHauled), which lets them get up and run. A rammed driver who
// climbs out to argue (traffic.onAngryDriver) leaves the seat empty until they are back. The
// door and seat anchors come from the player's carDoorAndSeat.js (read only, not changed).
// Traffic's motorcycles get a rider the same way (bikeRiderSeat.js): walker.sit({kind: 'rider'})
// with the hands on the bike's grips and the feet on its pegs, banked with the bike and leaning
// a little further into the bend; seating the rider also mounts the bike so it holds itself up.
import * as THREE from 'three';
import { ENTITY_TAGS } from '../core/entities/entityKinds.js';
import { createCarDoorAndSeat } from '../player/carDoorAndSeat.js';
import { createBikeRiderSeat } from './bikeRiderSeat.js';

/** Metres round the camera within which traffic's cars get a drawn driver. */
export const DRIVER_RADIUS = 40;
/** The most drivers drawn at once (one draw call each, like a pedestrian). */
export const MAX_DRIVERS = 16;
/** Seconds between looks at traffic's list of near cars. */
const REFRESH_SECONDS = 0.4;
/** Within this many metres a driver is posed every frame; beyond, every third frame. */
const POSE_EVERY_FRAME = 14;
/** Seconds a car stays without a drawn driver after its driver was hauled out. */
const HAULED_SECONDS = 120;

/**
 * Creates the seated drivers.
 * @param {object} crowd The shared crowd state (crowdSimulation.js): context, bodies, frustum, time.
 * @param {{dressFor: (x: number, z: number) => ({archetype: object, look: object, assetId: string} | null),
 *   onHauled: (driver: object) => void}} hooks Who sits there (crowdPopulation.dressFor) and who
 *   takes a hauled-out driver (crowdPopulation.adoptDriver).
 */
export function createSeatedDrivers(crowd, { dressFor, onHauled }) {
  const { context, bodies } = crowd;
  /** Drivers by vehicle id. */
  const drivers = new Map();
  /** Cars whose driver is out (an angry driver): vehicle id -> time the seat may be filled again. */
  const vacant = new Map();
  const ids = [];
  const seatAt = new THREE.Vector3(), seatTurn = new THREE.Quaternion();
  const sphere = new THREE.Sphere();
  let refresh = 0, frame = 0;
  const stats = { seated: 0, riders: 0, thrown: 0, hauled: 0, posed: 0 };
  const throwVelocity = { vx: 0, vy: 0, vz: 0 };
  /** The ground a thrown rider lands on (the city's; flat at 0 without one). */
  const groundAt = (x, z) => (crowd.city && typeof crowd.city.groundHeightAt === 'function' ? crowd.city.groundHeightAt(x, z) : 0);

  const fleet = () => context.systems.find('vehicles');
  const traffic = () => context.systems.find('traffic');

  /** Sits a new driver in a car or a rider on a bike (null for one without a drawn model, or the lead's). */
  function seat(vehicleId) {
    const car = context.entities.get(vehicleId);
    if (!car || (car.tags && car.tags.has(ENTITY_TAGS.PLAYER))) return null;
    const bike = createBikeRiderSeat(fleet(), car);
    const points = bike || createCarDoorAndSeat(fleet(), car);
    // No drawn car: nobody to sit in it.
    if (!points.rig || !points.rig.asset) return null;
    const dressed = dressFor(car.position.x, car.position.z);
    if (!dressed) return null;
    const yaw = points.yaw();
    const body = bodies.acquire(dressed.assetId, dressed.look, yaw);
    // The seat anchor is the hip joints of a standard body: drivers are drawn at full size.
    body.scale = 1;
    body.instance.scale.setScalar(1);
    body.input.moveX = 0; body.input.moveZ = 0; body.input.facing = NaN;
    if (bike) {
      body.walker.sit({ kind: 'rider', gripL: bike.gripL, gripR: bike.gripR, footL: bike.footL, footR: bike.footR }, { fade: 0 });
      bike.mount();
      stats.riders += 1;
    } else {
      body.walker.sit({ kind: 'driver', wheel: points.steeringWheel, wheelRadius: points.wheelRadius }, { fade: 0 });
    }
    const driver = { vehicleId, archetype: dressed.archetype, look: dressed.look, body, walker: body.walker, points, bike, seen: true, phase: drivers.size % 3 };
    drivers.set(vehicleId, driver);
    stats.seated += 1;
    const camera = context.view.camera.position;
    place(driver, 0, camera.x, camera.z);
    return driver;
  }

  function release(driver) {
    drivers.delete(driver.vehicleId);
    if (typeof driver.walker.sit === 'function') driver.walker.sit(null, { fade: 0 });
    bodies.release(driver.body);
  }

  /**
   * The bike went down: the rider is thrown off as a ragdoll onto the ground and the crowd takes
   * the body (its 'dragged' mode waits for the ragdoll to rest, then gets up and runs).
   */
  function throwRider(driver) {
    const walker = driver.walker;
    if (typeof walker.sit === 'function') walker.sit(null, { fade: 0 });
    if (typeof walker.ragdoll === 'function') {
      walker.ragdoll({ vx: throwVelocity.vx, vy: throwVelocity.vy, vz: throwVelocity.vz, at: 0.5, spin: 1.5, ground: groundAt, getUp: false });
    }
    stats.thrown += 1;
    handOver(driver);
  }

  /** The driver is being hauled out (the transit runs): the crowd takes the body over. */
  function handOver(driver) {
    drivers.delete(driver.vehicleId);
    // The seat stays empty: the driver is out on the road (traffic may list the car a moment longer).
    vacant.set(driver.vehicleId, crowd.time + HAULED_SECONDS);
    stats.hauled += 1;
    onHauled(driver);
  }

  /**
   * Whether a driver missing from traffic's list stays: the lead has claimed the car (it brakes
   * for him and traffic lets it go) and is on his way to haul the driver out.
   */
  function keepClaimed(driver) {
    const car = context.entities.get(driver.vehicleId);
    return Boolean(car) && claimedByLead(car);
  }

  /** Whether the lead has claimed this car (on his way to its door) and is not yet in it. */
  function claimedByLead(car) {
    if (car.tags && car.tags.has(ENTITY_TAGS.PLAYER)) return false;
    const claimant = car.data ? car.data.driverId ?? null : null;
    return claimant !== null && crowd.player !== null && claimant === crowd.player.id;
  }

  /** Poses a driver's sit now (seated, hands on the wheel or grips), on screen or not. */
  function seatPoseNow(driver) {
    const walker = driver.walker;
    if (typeof walker.update !== 'function') return;
    walker.update(1 / 60, driver.body.input);
    driver.body.pending = 0;
    driver.sitPosed = true;
  }

  /** Puts the body in the seat (following the car) and poses it now and then. */
  function place(driver, dt, cx, cz) {
    driver.points.seatPose(seatAt, seatTurn);
    const body = driver.body, instance = body.instance;
    instance.position.copy(seatAt);
    instance.quaternion.copy(seatTurn);
    // The walker's yaw follows the car, so a transit started from the seat sets off the right way.
    const q = seatTurn;
    body.walker.state.yaw = Math.atan2(2 * (q.x * q.z + q.w * q.y), 1 - 2 * (q.x * q.x + q.y * q.y));
    const distance = Math.hypot(seatAt.x - cx, seatAt.z - cz);
    sphere.center.copy(seatAt);
    sphere.radius = 1;
    const onScreen = crowd.frustum.intersectsSphere(sphere);
    const posed = distance < POSE_EVERY_FRAME || (frame + driver.phase) % 3 === 0;
    if (posed && onScreen) stats.posed += 1;
    if (driver.bike && body.walker.seat) body.walker.seat.lean = driver.bike.lean();
    bodies.animate(body, dt, distance, onScreen, posed);
    // A body is only posed while the crowd's camera sees it, so a driver seated off its screen
    // would keep the standing pose (head through the roof in any other camera: cutscenes, shot
    // scenes). Pose the sit once right away, whatever the crowd's camera sees.
    if (!driver.sitPosed) seatPoseNow(driver);
    // The controller turns rotation.y to its own yaw after posing: the seat's orientation wins.
    instance.quaternion.copy(seatTurn);
    const root = driver.points.rig ? driver.points.rig.root : null;
    instance.visible = !root || root.visible !== false;
  }

  return {
    /** How many drivers sit now, and counts since the start (seated, hauled out). */
    get count() { return drivers.size; },
    stats,
    /** The driver drawn at the wheel of a vehicle ({walker, body, vehicleId}), or null. */
    seatedDriverOf(vehicleId) {
      const driver = drivers.get(vehicleId);
      if (driver) return driver;
      // A car the lead is hauling a driver from always has one (even beyond the cap).
      const car = context.entities.get(vehicleId);
      if (!car || (vacant.get(vehicleId) ?? -1) > crowd.time) return null;
      return claimedByLead(car) ? seat(vehicleId) : null;
    },
    /** Seats a driver in a car now (a carjack with no body drawn yet), or null. */
    seatNow(vehicleId) { return drivers.get(vehicleId) || seat(vehicleId); },
    /** Hands a driver whose haul has begun to the crowd now (VEHICLE_STOLEN); false if none. */
    handOver(vehicleId) {
      const driver = drivers.get(vehicleId);
      if (!driver) return false;
      handOver(driver);
      return true;
    },
    /**
     * Empties a car's seat for `seconds` (its driver climbed out: traffic's angry driver), or
     * lets it be filled again (0: the driver is back in).
     */
    vacate(vehicleId, seconds) {
      const driver = drivers.get(vehicleId);
      if (driver && seconds > 0) release(driver);
      if (seconds > 0) vacant.set(vehicleId, crowd.time + seconds); else vacant.delete(vehicleId);
    },
    /**
     * Render time (the system's lateUpdate, after the vehicles' update has set each car's drawn
     * root for this frame with interpolation): moves every seated body onto its seat again, so
     * the driver is not one frame behind the car (25 cm at 15 m/s). The pose made in update()
     * moves with the body as a whole, hands on the wheel or grips included.
     */
    follow() {
      for (const driver of drivers.values()) {
        const instance = driver.body.instance;
        driver.points.seatPose(seatAt, seatTurn);
        instance.position.copy(seatAt);
        instance.quaternion.copy(seatTurn);
        const root = driver.points.rig ? driver.points.rig.root : null;
        instance.visible = !root || root.visible !== false;
      }
    },
    update(dt) {
      frame += 1;
      const camera = context.view.camera.position;
      refresh -= dt;
      const flow = traffic();
      if (refresh <= 0 && flow && typeof flow.nearCars === 'function') {
        refresh = REFRESH_SECONDS;
        for (const driver of drivers.values()) driver.seen = false;
        flow.nearCars(ids, DRIVER_RADIUS);
        for (let i = 0; i < ids.length; i += 1) {
          const id = ids[i];
          const driver = drivers.get(id);
          if (driver) driver.seen = true;
          else if (drivers.size < MAX_DRIVERS && !((vacant.get(id) ?? -1) > crowd.time)) seat(id);
        }
        for (const driver of drivers.values()) if (!driver.seen && !keepClaimed(driver)) release(driver);
        for (const [id, until] of vacant) if (until <= crowd.time) vacant.delete(id);
      }
      for (const driver of drivers.values()) {
        const transit = driver.walker.transit;
        if (transit && transit.kind) { handOver(driver); continue; }
        if (driver.bike && driver.bike.thrown(throwVelocity)) { throwRider(driver); continue; }
        if (!context.entities.get(driver.vehicleId)) { release(driver); continue; }
        place(driver, dt, camera.x, camera.z);
      }
    },
    dispose() {
      for (const driver of [...drivers.values()]) release(driver);
      vacant.clear();
    },
  };
}

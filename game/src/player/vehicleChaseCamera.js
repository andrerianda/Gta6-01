// The vehicle chase camera: centred behind the vehicle being driven, as the player sees it (the
// owner's direction on the chase point of view): for a car the coupe's size about 5.55 m behind
// the car's centre at rest and in town traffic and 2.15 m above the road, 6 degrees down, 55
// degrees, so the car sits centred with its roof a little below the middle of the picture and
// fills about 27 % of the width; past 20 m/s it falls back a little (6.4 m at 144 km/h) and
// widens a little with speed. The far view (V) sits about 8.5 m back and 2.8 m up.
// Everything scales with the vehicle's size, so bikes are framed closer and trucks from higher
// and farther. It swings after the vehicle through turns (it follows the heading with a lag and
// looks a little into the steering), has a mouse orbit that settles back behind when left alone
// and a look-behind that cuts to the rear view while held.
import { approach, approachAngle, createPointSpring, resetPointSpring, springToward, wrapAngle } from './smoothMotion.js';
import { orbitPoint } from './onFootCamera.js';

/** The framing of the chase view (distances and heights in metres, for a vehicle of `size`). */
export const CHASE_FRAMING = Object.freeze({
  defaultPitch: -0.105,    // 6 degrees down
  minPitch: -0.9,
  maxPitch: 0.35,
  baseDistance: 2.72,      // camera to the vehicle's centre: base + size x distancePerSize
  distancePerSize: 1.18,   //   (a coupe, size 2.42: 5.54 m at rest, QA shift 4: 5.1 was short)
  speedPullBack: 0,        // extra metres per m/s up to topSpeed (the follow lag does it)
  lagAllowance: 0.04,      // seconds: the pivot's follow lag (~0.042 s x speed) is taken off the
  lagAllowanceUpTo: 20,    //   distance up to 20 m/s, so the car keeps its size in town (5.54 m
                           //   at rest, 5.56 at 31 km/h, 5.58 at 64 km/h) and falls back a little
                           //   only beyond (6.4 m at 144 km/h)
  baseHeight: 1.3,         // camera above the road: base + size x heightPerSize
  heightPerSize: 0.35,     //   (a coupe: 2.15 m; + tallPerSize past size 3, trucks and buses)
  tallPerSize: 0.35,
  farDistanceScale: 1.53,  // the far chase view (V): 8.5 m back for a coupe
  farLift: 0.65,           //   and 0.65 m higher (2.8 m)
  followRate: 3.2,         // per second, how fast the camera swings behind the heading
  steerLook: 0.11,         // radians into the turn at full lock
  fieldOfView: -3,         // degrees on the settings' 58: 55 at rest
  speedFieldOfView: 4,     // degrees added at top speed (59)
  topSpeed: 45,            // metres per second for the full widening and pull-back
  settleAfter: 1.4,        // seconds without mouse before the orbit settles back
  followTime: 0.05,        // pivot lag, seconds
});

/**
 * Helicopters (vehicle-system 11:20: the car framing sat close over the tail): 13 m behind the
 * craft's root and 6 m above it, 16 degrees down, so the whole airframe and the rotor disc sit a
 * little under the middle of the picture with the city below; the far view backs off to ~19 m.
 */
export const HELICOPTER_CHASE_FRAMING = Object.freeze({
  ...CHASE_FRAMING,
  defaultPitch: -0.28,
  baseDistance: 13, distancePerSize: 0, lagAllowance: 0,
  baseHeight: 6, heightPerSize: 0, tallPerSize: 0,
  farDistanceScale: 1.45, farLift: 2.5,
  followRate: 2.4, steerLook: 0.05, speedFieldOfView: 6,
});

/** Boats: the car framing a little higher and steeper, so the hull and its wake read on the water. */
export const BOAT_CHASE_FRAMING = Object.freeze({
  ...CHASE_FRAMING,
  defaultPitch: -0.16,
  baseDistance: 3.2, baseHeight: 1.9,
  followRate: 2.6,
});

/** The framing for a vehicle class: target.craft 'helicopter', 'boat' or null (road vehicles). */
export function chaseFramingFor(craft, framing = CHASE_FRAMING) {
  return craft === 'helicopter' ? HELICOPTER_CHASE_FRAMING : craft === 'boat' ? BOAT_CHASE_FRAMING : framing;
}

/** The vehicle's size for framing: its radius (half its diagonal), clamped. */
export function chaseSizeOf(radius) {
  return Math.min(6, Math.max(1.5, radius || 2.4));
}

/**
 * The chase camera's distance to the vehicle's centre and its height above the road.
 * @param {number} size chaseSizeOf(radius)
 * @param {number} speed m/s
 * @param {number} far 0 near .. 1 far
 * @param {typeof CHASE_FRAMING} [framing]
 */
export function chaseReach(size, speed, far, framing = CHASE_FRAMING) {
  const pace = Math.abs(speed);
  const pullBack = Math.min(pace, framing.topSpeed) * framing.speedPullBack
    - Math.min(pace, framing.lagAllowanceUpTo ?? 0) * (framing.lagAllowance ?? 0);
  const distance = (framing.baseDistance + size * framing.distancePerSize + pullBack) * (1 + (framing.farDistanceScale - 1) * far);
  const height = framing.baseHeight + size * framing.heightPerSize + Math.max(0, size - 3) * framing.tallPerSize + framing.farLift * far;
  return { distance, height };
}

/** Creates the chase camera. */
export function createVehicleChaseCamera(roadFraming = CHASE_FRAMING) {
  let framing = roadFraming;
  const spring = createPointSpring();
  const pivot = { x: 0, y: 0, z: 0 };
  const rig = { yaw: 0, orbitYaw: 0, orbitPitch: 0, idle: 0, distance: 6, height: 2.1, fovOffset: 0, far: 0 };
  let far = false;

  /** The pivot's height over the vehicle: the camera ends `height` above the road at `pitch`. */
  const pivotLift = (pitch) => rig.height - rig.distance * Math.sin(-pitch);

  /** Puts the camera behind the vehicle at once. */
  function cut(target) {
    framing = chaseFramingFor(target.craft, roadFraming);
    rig.yaw = target.heading;
    rig.orbitYaw = rig.orbitPitch = 0;
    rig.fovOffset = 0;
    const reach = chaseReach(chaseSizeOf(target.radius), target.speed || 0, rig.far, framing);
    rig.distance = reach.distance; rig.height = reach.height;
    pivot.x = target.x; pivot.y = target.y + pivotLift(framing.defaultPitch); pivot.z = target.z;
    resetPointSpring(spring, pivot);
  }

  /**
   * One frame: writes the wanted shot into `out` ({pivot, shoulder, camera, yaw, pitch, fovOffset}).
   * @param {number} dt
   * @param {{x: number, y: number, z: number, heading: number, speed: number, radius: number, steer: number, lookBehind: boolean}} target
   * @param {{lookX: number, lookY: number, sensitivity: number, invertY: boolean}} look
   * @param {object} out
   */
  function update(dt, target, look, out) {
    framing = chaseFramingFor(target.craft, roadFraming);
    const turnX = look.lookX * look.sensitivity;
    const turnY = look.lookY * look.sensitivity * (look.invertY ? -1 : 1);
    rig.orbitYaw = wrapAngle(rig.orbitYaw - turnX);
    rig.orbitPitch = Math.min(framing.maxPitch - framing.defaultPitch, Math.max(framing.minPitch - framing.defaultPitch, rig.orbitPitch - turnY));
    rig.idle = turnX !== 0 || turnY !== 0 ? 0 : rig.idle + dt;
    if (rig.idle > framing.settleAfter) {
      rig.orbitYaw = approachAngle(rig.orbitYaw, 0, 2, dt);
      rig.orbitPitch = approach(rig.orbitPitch, 0, 2, dt);
    }
    const speed = Math.abs(target.speed);
    const moving = Math.min(1, speed / 8);
    const wanted = target.heading - target.steer * framing.steerLook * moving;
    if (target.speed > -1.5) rig.yaw = approachAngle(rig.yaw, wanted, framing.followRate * (0.35 + 0.65 * moving), dt);

    rig.far = approach(rig.far, far ? 1 : 0, 10, dt);
    const reach = chaseReach(chaseSizeOf(target.radius), speed, rig.far, framing);
    const switching = 1.5 + 6 * Math.abs(rig.far - (far ? 1 : 0));
    rig.distance = approach(rig.distance, reach.distance, switching, dt);
    rig.height = approach(rig.height, reach.height, switching, dt);
    rig.fovOffset = approach(rig.fovOffset, framing.speedFieldOfView * Math.min(1, speed / framing.topSpeed), 1.5, dt);
    springToward(spring.x, target.x, framing.followTime, dt);
    springToward(spring.z, target.z, framing.followTime, dt);
    springToward(spring.y, target.y + pivotLift(framing.defaultPitch), framing.followTime * 3, dt);
    pivot.x = spring.x.value; pivot.y = spring.y.value; pivot.z = spring.z.value;

    const yaw = wrapAngle(rig.yaw + rig.orbitYaw + (target.lookBehind ? Math.PI : 0));
    const pitch = framing.defaultPitch + rig.orbitPitch;
    out.pivot.x = pivot.x; out.pivot.y = pivot.y; out.pivot.z = pivot.z;
    out.shoulder.x = pivot.x; out.shoulder.y = pivot.y; out.shoulder.z = pivot.z;
    orbitPoint(out.camera, pivot, yaw, pitch, 0, 0, rig.distance);
    out.yaw = yaw;
    out.pitch = pitch;
    out.fovOffset = framing.fieldOfView + rig.fovOffset;
  }

  return {
    rig, cut, update,
    /** Switches between the near and the far chase view (V); eases over about 0.3 s. */
    toggleDistance() { far = !far; return far ? 'far' : 'near'; },
    get distanceMode() { return far ? 'far' : 'near'; },
    get yaw() { return rig.yaw; },
  };
}

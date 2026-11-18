// The vehicle chase camera: centred behind the vehicle being driven, as the player sees it (the
// owner's direction on the chase point of view): for a car the coupe's size about 5.6 m behind the
// car's centre when moving and 2.15 m above the road, 6 degrees down, 55 degrees, so the car sits
// centred with its roof a little below the middle of the picture and fills about 30 % of the
// width; it eases back a little and widens a little with speed. The far view (V) sits about
// 8.4 m back and 2.8 m up.
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
  baseDistance: 2.27,      // camera to the vehicle's centre: base + size x distancePerSize
  distancePerSize: 1.18,   //   (a coupe, size 2.42: 5.1 m; the follow lag adds ~0.4 m at 31 km/h)
  speedPullBack: 0.008,    // extra metres per m/s (0.36 m at top speed, besides the follow lag)
  baseHeight: 1.3,         // camera above the road: base + size x heightPerSize
  heightPerSize: 0.35,     //   (a coupe: 2.15 m; + tallPerSize past size 3, trucks and buses)
  tallPerSize: 0.35,
  farDistanceScale: 1.66,  // the far chase view (V): 8.3 m back for a coupe
  farLift: 0.65,           //   and 0.65 m higher (2.8 m)
  followRate: 3.2,         // per second, how fast the camera swings behind the heading
  steerLook: 0.11,         // radians into the turn at full lock
  fieldOfView: -3,         // degrees on the settings' 58: 55 at rest
  speedFieldOfView: 4,     // degrees added at top speed (59)
  topSpeed: 45,            // metres per second for the full widening and pull-back
  settleAfter: 1.4,        // seconds without mouse before the orbit settles back
  followTime: 0.05,        // pivot lag, seconds
});

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
  const pullBack = Math.min(Math.abs(speed), framing.topSpeed) * framing.speedPullBack;
  const distance = (framing.baseDistance + size * framing.distancePerSize + pullBack) * (1 + (framing.farDistanceScale - 1) * far);
  const height = framing.baseHeight + size * framing.heightPerSize + Math.max(0, size - 3) * framing.tallPerSize + framing.farLift * far;
  return { distance, height };
}

/** Creates the chase camera. */
export function createVehicleChaseCamera(framing = CHASE_FRAMING) {
  const spring = createPointSpring();
  const pivot = { x: 0, y: 0, z: 0 };
  const rig = { yaw: 0, orbitYaw: 0, orbitPitch: 0, idle: 0, distance: 6, height: 2.1, fovOffset: 0, far: 0 };
  let far = false;

  /** The pivot's height over the vehicle: the camera ends `height` above the road at `pitch`. */
  const pivotLift = (pitch) => rig.height - rig.distance * Math.sin(-pitch);

  /** Puts the camera behind the vehicle at once. */
  function cut(target) {
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

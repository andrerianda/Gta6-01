// The vehicle chase camera: centred behind the vehicle being driven, sized by the vehicle,
// pulled back and widened with speed, swinging after the vehicle through turns (it follows the
// heading with a lag and looks a little into the steering), with a mouse orbit that settles
// back behind when left alone and a look-behind that cuts to the rear view while held.
import { approach, approachAngle, createPointSpring, resetPointSpring, springToward, wrapAngle } from './smoothMotion.js';
import { orbitPoint } from './onFootCamera.js';

/** The framing of the chase view. */
export const CHASE_FRAMING = Object.freeze({
  defaultPitch: -0.16,
  minPitch: -0.9,
  maxPitch: 0.35,
  followRate: 3.2,         // per second, how fast the camera swings behind the heading
  steerLook: 0.11,         // radians into the turn at full lock
  speedFieldOfView: 11,    // degrees added at top speed
  topSpeed: 45,            // metres per second for the full widening
  settleAfter: 1.4,        // seconds without mouse before the orbit settles back
  followTime: 0.05,        // pivot lag, seconds
});

/** Creates the chase camera. */
export function createVehicleChaseCamera(framing = CHASE_FRAMING) {
  const spring = createPointSpring();
  const pivot = { x: 0, y: 0, z: 0 };
  const rig = { yaw: 0, orbitYaw: 0, orbitPitch: 0, idle: 0, distance: 6, fovOffset: 0 };

  function sizeOf(target) {
    return Math.min(6, Math.max(1.5, target.radius || 2.4));
  }

  /** Puts the camera behind the vehicle at once. */
  function cut(target) {
    rig.yaw = target.heading;
    rig.orbitYaw = rig.orbitPitch = 0;
    rig.fovOffset = 0;
    const size = sizeOf(target);
    rig.distance = size * 1.25 + 3.2;
    pivot.x = target.x; pivot.y = target.y + size * 0.3 + 0.9; pivot.z = target.z;
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

    const size = sizeOf(target);
    rig.distance = approach(rig.distance, size * 1.25 + 3.2 + Math.min(speed, framing.topSpeed) * 0.045, 1.5, dt);
    rig.fovOffset = approach(rig.fovOffset, framing.speedFieldOfView * Math.min(1, speed / framing.topSpeed), 1.5, dt);
    springToward(spring.x, target.x, framing.followTime, dt);
    springToward(spring.z, target.z, framing.followTime, dt);
    springToward(spring.y, target.y + size * 0.3 + 0.9, framing.followTime * 3, dt);
    pivot.x = spring.x.value; pivot.y = spring.y.value; pivot.z = spring.z.value;

    const yaw = wrapAngle(rig.yaw + rig.orbitYaw + (target.lookBehind ? Math.PI : 0));
    const pitch = framing.defaultPitch + rig.orbitPitch;
    out.pivot.x = pivot.x; out.pivot.y = pivot.y; out.pivot.z = pivot.z;
    out.shoulder.x = pivot.x; out.shoulder.y = pivot.y; out.shoulder.z = pivot.z;
    orbitPoint(out.camera, pivot, yaw, pitch, 0, size * 0.12, rig.distance);
    out.yaw = yaw;
    out.pitch = pitch;
    out.fovOffset = rig.fovOffset;
  }

  return { rig, cut, update, get yaw() { return rig.yaw; } };
}

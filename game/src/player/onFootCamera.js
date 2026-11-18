// The on-foot camera: an over-the-shoulder view. The camera orbits a pivot at the lead's
// shoulders, set off to the right so the lead stands about a third of the way from the left edge
// of the picture and the aim point is the screen centre, over the lead's right shoulder. The
// mouse turns it (pitch limited), the pivot follows the lead with a critically damped lag, and
// every change of framing (sprint pull-back, aim push-in, switching shoulder) eases in and out.
// Left alone while the lead runs, it drifts back behind the lead.
import { approach, approachAngle, createPointSpring, resetPointSpring, springToward, wrapAngle } from './smoothMotion.js';

/** The framing of the shoulder view. */
export const ON_FOOT_FRAMING = Object.freeze({
  pivotHeight: 1.47,       // above the feet, metres
  rise: 0.3,               // camera above the pivot line, metres
  distance: 3.6,           // standing, metres
  runDistance: 3.85,
  sprintDistance: 4.5,
  aimDistance: 2.1,
  screenOffset: 0.31,      // the lead's centre left of the screen centre, share of the half width
  aimScreenOffset: 0.37,
  sprintFieldOfView: 6,    // degrees added
  aimFieldOfView: -9,
  defaultPitch: -0.16,     // looking slightly down
  minPitch: -1.0,
  maxPitch: 0.55,
  followHorizontal: 0.085, // pivot lag, seconds
  followVertical: 0.16,
  recentreAfter: 2.2,      // seconds without mouse before it drifts behind the lead
});

/**
 * Where a camera sits for a pivot, an orbit and a local offset (x right, y up, z back).
 * @param {{x: number, y: number, z: number}} out
 */
export function orbitPoint(out, pivot, yaw, pitch, offsetX, offsetY, offsetZ) {
  const cp = Math.cos(pitch), sp = Math.sin(pitch), cy = Math.cos(yaw), sy = Math.sin(yaw);
  const y1 = offsetY * cp - offsetZ * sp;
  const z1 = offsetY * sp + offsetZ * cp;
  out.x = pivot.x + offsetX * cy + z1 * sy;
  out.y = pivot.y + y1;
  out.z = pivot.z - offsetX * sy + z1 * cy;
  return out;
}

/**
 * The sideways shoulder offset that puts the pivot a share of the half width off centre.
 * @param {number} screenOffset Share of the half width (0.33: a third of the way from the edge).
 * @param {number} distance Camera to pivot along the view, metres.
 * @param {number} fieldOfView Vertical, degrees.
 * @param {number} aspect Width over height.
 */
export function shoulderOffsetFor(screenOffset, distance, fieldOfView, aspect) {
  return screenOffset * distance * Math.tan((fieldOfView * Math.PI) / 360) * aspect;
}

/** Creates the on-foot camera. */
export function createOnFootCamera(framing = ON_FOOT_FRAMING) {
  const spring = createPointSpring();
  const pivot = { x: 0, y: 0, z: 0 };
  const rig = {
    yaw: 0, pitch: framing.defaultPitch, side: 1, shownSide: 1,
    distance: framing.distance, screenOffset: framing.screenOffset, fovOffset: 0, idle: 0,
  };

  /** Puts the camera behind the lead at once. */
  function cut(target) {
    rig.yaw = target.heading;
    rig.pitch = framing.defaultPitch;
    rig.shownSide = rig.side;
    rig.distance = framing.distance;
    rig.screenOffset = framing.screenOffset;
    rig.fovOffset = 0;
    pivot.x = target.x; pivot.y = target.y + framing.pivotHeight; pivot.z = target.z;
    resetPointSpring(spring, pivot);
  }

  /**
   * One frame: writes the wanted shot into `out` ({pivot, shoulder, camera, yaw, pitch, fovOffset}).
   * @param {number} dt
   * @param {{x: number, y: number, z: number, heading: number, speed: number, sprinting: boolean, aiming: boolean}} target
   * @param {{lookX: number, lookY: number, sensitivity: number, invertY: boolean, swapShoulder: boolean}} look
   * @param {number} fieldOfView Base vertical field of view, degrees.
   * @param {number} aspect
   * @param {object} out
   */
  function update(dt, target, look, fieldOfView, aspect, out) {
    const turnX = look.lookX * look.sensitivity;
    const turnY = look.lookY * look.sensitivity * (look.invertY ? -1 : 1);
    rig.yaw = wrapAngle(rig.yaw - turnX);
    rig.pitch = Math.min(framing.maxPitch, Math.max(framing.minPitch, rig.pitch - turnY));
    rig.idle = turnX !== 0 || turnY !== 0 ? 0 : rig.idle + dt;
    if (look.swapShoulder) rig.side = -rig.side;
    if (rig.idle > framing.recentreAfter && target.speed > 0.6) {
      const behind = wrapAngle(target.heading - rig.yaw);
      if (Math.abs(behind) < 2.3) rig.yaw = approachAngle(rig.yaw, target.heading, 0.9 * Math.min(1, target.speed / 4), dt);
      rig.pitch = approach(rig.pitch, framing.defaultPitch, 0.8, dt);
    }

    const sprint = target.sprinting && target.speed > 5 ? 1 : 0;
    const run = Math.min(1, target.speed / 4.3);
    const wantDistance = target.aiming ? framing.aimDistance
      : framing.distance + (framing.runDistance - framing.distance) * run + (framing.sprintDistance - framing.runDistance) * sprint;
    rig.distance = approach(rig.distance, wantDistance, target.aiming ? 6 : 1.6, dt);
    rig.screenOffset = approach(rig.screenOffset, target.aiming ? framing.aimScreenOffset : framing.screenOffset, 4, dt);
    rig.fovOffset = approach(rig.fovOffset, sprint * framing.sprintFieldOfView + (target.aiming ? framing.aimFieldOfView : 0), 1.8, dt);
    rig.shownSide = approach(rig.shownSide, rig.side, 5, dt);

    springToward(spring.x, target.x, framing.followHorizontal, dt);
    springToward(spring.z, target.z, framing.followHorizontal, dt);
    springToward(spring.y, target.y + framing.pivotHeight, framing.followVertical, dt);
    pivot.x = spring.x.value; pivot.y = spring.y.value; pivot.z = spring.z.value;

    const fov = fieldOfView + rig.fovOffset;
    const shoulder = rig.shownSide * shoulderOffsetFor(rig.screenOffset, rig.distance, fov, aspect);
    out.pivot.x = pivot.x; out.pivot.y = pivot.y; out.pivot.z = pivot.z;
    orbitPoint(out.shoulder, pivot, rig.yaw, rig.pitch, shoulder, framing.rise, 0);
    orbitPoint(out.camera, pivot, rig.yaw, rig.pitch, shoulder, framing.rise, rig.distance);
    out.yaw = rig.yaw;
    out.pitch = rig.pitch;
    out.fovOffset = rig.fovOffset;
  }

  return { rig, cut, update, get yaw() { return rig.yaw; } };
}

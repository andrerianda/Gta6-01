// The on-foot camera: a close, low over-the-shoulder view, the way modern open-world crime games
// frame their lead. The camera sits a little over two metres behind the lead's upper back at
// shoulder height, nearly level (the horizon near the middle of the frame), with the lead large
// on the left (from about the knees up, the spine some 40 % from the left edge, the head near the
// upper third line) and the aim point at the screen centre over the right shoulder. The mouse
// turns it (pitch limited), the pivot follows the lead with a short critically damped lag, and
// every change of framing (sprint pull-back, aim push-in, switching shoulder) eases in and out.
// Left alone while the lead runs, it drifts back behind the lead.
import { approach, approachAngle, createPointSpring, resetPointSpring, springToward, wrapAngle } from './smoothMotion.js';

/**
 * The framings of the shoulder view, all numbers in one place (metres, radians, degrees of
 * vertical field of view added to the base of the settings, 58).
 * - close: the owner's target at its tight end (2.2 m behind the upper back, knees up).
 * - loose: the owner's target at its loose end (2.6 m behind the upper back, mid-shin up).
 * - previous: the earlier, higher and farther view (kept for comparison).
 * `distance` is camera to the lead's centre line along the view (the back is ~0.13 m nearer);
 * the camera's height is pivotHeight + rise + distance x sin(-defaultPitch).
 */
export const ON_FOOT_FRAMINGS = Object.freeze({
  close: Object.freeze({
    pivotHeight: 1.42, rise: 0, distance: 2.33, runDistance: 2.42, sprintDistance: 2.72, aimDistance: 1.7,
    screenOffset: 0.21, aimScreenOffset: 0.3, sprintFieldOfView: 4, aimFieldOfView: -6,
    defaultPitch: -0.07, minPitch: -1.0, maxPitch: 0.55, followHorizontal: 0.07, followVertical: 0.14, recentreAfter: 2.2,
  }),
  loose: Object.freeze({
    pivotHeight: 1.42, rise: 0, distance: 2.73, runDistance: 2.82, sprintDistance: 3.12, aimDistance: 1.85,
    screenOffset: 0.2, aimScreenOffset: 0.3, sprintFieldOfView: 4, aimFieldOfView: -6,
    defaultPitch: -0.09, minPitch: -1.0, maxPitch: 0.55, followHorizontal: 0.075, followVertical: 0.15, recentreAfter: 2.2,
  }),
  previous: Object.freeze({
    pivotHeight: 1.47, rise: 0.3, distance: 3.6, runDistance: 3.85, sprintDistance: 4.5, aimDistance: 2.1,
    screenOffset: 0.31, aimScreenOffset: 0.37, sprintFieldOfView: 6, aimFieldOfView: -9,
    defaultPitch: -0.16, minPitch: -1.0, maxPitch: 0.55, followHorizontal: 0.085, followVertical: 0.16, recentreAfter: 2.2,
  }),
});

/** The framing the game uses. */
export const DEFAULT_ON_FOOT_FRAMING = 'close';

/** The default framing's numbers (kept for older callers and tests). */
export const ON_FOOT_FRAMING = ON_FOOT_FRAMINGS[DEFAULT_ON_FOOT_FRAMING];

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
 * @param {number} screenOffset Share of the half width (0.2: 40 % from the left edge).
 * @param {number} distance Camera to pivot along the view, metres.
 * @param {number} fieldOfView Vertical, degrees.
 * @param {number} aspect Width over height.
 */
export function shoulderOffsetFor(screenOffset, distance, fieldOfView, aspect) {
  return screenOffset * distance * Math.tan((fieldOfView * Math.PI) / 360) * aspect;
}

/**
 * Creates the on-foot camera.
 * @param {string} [name] A key of ON_FOOT_FRAMINGS.
 */
export function createOnFootCamera(name = DEFAULT_ON_FOOT_FRAMING) {
  let framing = ON_FOOT_FRAMINGS[name] ?? ON_FOOT_FRAMING;
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

  /** Switches to another framing (eases there: the distance and offset approach the new values). */
  function setFraming(next) {
    const found = ON_FOOT_FRAMINGS[next];
    if (!found) return false;
    framing = found;
    rig.pitch = framing.defaultPitch;
    return true;
  }

  return { rig, cut, update, setFraming, get framing() { return framing; }, get yaw() { return rig.yaw; } };
}

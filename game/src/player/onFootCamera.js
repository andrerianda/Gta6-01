// The on-foot camera, framed the way modern open-world crime games frame their lead. Free roam
// (standing, walking, running, sprinting): the lead centred, the whole body in view, the camera
// some 3.9 m behind and above the head looking a little down, so the street's vanishing point
// sits about a third of the way down the picture. Aiming: the camera eases in close over the
// right shoulder at shoulder height, the lead moves to the left third, seen from the waist up,
// and the aim point is the screen centre. The mouse turns it (pitch limited), the pivot follows
// the lead with a short critically damped lag, and every change (aim in and out, sprint
// pull-back, switching shoulder) eases and never snaps. Left alone while the lead runs, it
// drifts back behind the lead.
import { approach, approachAngle, createPointSpring, resetPointSpring, springToward, wrapAngle } from './smoothMotion.js';

/**
 * Every number of the on-foot framing, in one place (the owner's final camera direction).
 * Distances are camera to pivot along the view (metres); pitches in radians (negative looks
 * down); fieldOfView is degrees added to the settings' base of 58 (so 53 roaming, 50 aiming);
 * screenOffset is the lead's spine left of centre as a share of the half width (0.32: 34 % from
 * the left edge). The camera's height is pivotHeight + distance x sin(-pitch).
 */
export const ON_FOOT_FRAMING = Object.freeze({
  roam: Object.freeze({
    pivotHeight: 1.76, distance: 3.96, runDistance: 4.04, sprintDistance: 4.36, pitch: -0.175,
    screenOffset: 0, fieldOfView: -5, sprintFieldOfView: -1,
  }),
  aim: Object.freeze({ pivotHeight: 1.5, distance: 1.42, pitch: -0.035, screenOffset: 0.32, fieldOfView: -8 }),
  aimEaseRate: 10,          // exponential rate: about 0.3 s in or out
  distanceEaseRate: 1.6,    // walk, run and sprint pull-back
  minLook: -0.75,           // the mouse's pitch range around the framing's own pitch
  maxLook: 0.7,
  followHorizontal: 0.07,   // pivot lag, seconds
  followVertical: 0.14,
  recentreAfter: 2.2,       // seconds without mouse before it drifts behind the lead
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
 * @param {number} screenOffset Share of the half width (0.32: 34 % from the left edge).
 * @param {number} distance Camera to pivot along the view, metres.
 * @param {number} fieldOfView Vertical, degrees.
 * @param {number} aspect Width over height.
 */
export function shoulderOffsetFor(screenOffset, distance, fieldOfView, aspect) {
  return screenOffset * distance * Math.tan((fieldOfView * Math.PI) / 360) * aspect;
}

/** Creates the on-foot camera. */
export function createOnFootCamera(framing = ON_FOOT_FRAMING) {
  const roam = framing.roam, aim = framing.aim;
  const spring = createPointSpring();
  const pivot = { x: 0, y: 0, z: 0 };
  const rig = {
    yaw: 0, look: 0, pitch: roam.pitch, side: 1, shownSide: 1, aim: 0,
    distance: roam.distance, screenOffset: 0, fovOffset: roam.fieldOfView, idle: 0,
  };
  const mix = (a, b) => a + (b - a) * rig.aim;

  /** Puts the camera behind the lead at once. */
  function cut(target) {
    rig.yaw = target.heading;
    rig.look = 0;
    rig.aim = target.aiming ? 1 : 0;
    rig.shownSide = rig.side;
    rig.distance = mix(roam.distance, aim.distance);
    rig.screenOffset = mix(roam.screenOffset, aim.screenOffset);
    rig.fovOffset = mix(roam.fieldOfView, aim.fieldOfView);
    pivot.x = target.x; pivot.y = target.y + mix(roam.pivotHeight, aim.pivotHeight); pivot.z = target.z;
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
    rig.look = Math.min(framing.maxLook, Math.max(framing.minLook, rig.look - turnY));
    rig.idle = turnX !== 0 || turnY !== 0 ? 0 : rig.idle + dt;
    if (look.swapShoulder) rig.side = -rig.side;
    if (rig.idle > framing.recentreAfter && target.speed > 0.6 && !target.aiming) {
      const behind = wrapAngle(target.heading - rig.yaw);
      if (Math.abs(behind) < 2.3) rig.yaw = approachAngle(rig.yaw, target.heading, 0.9 * Math.min(1, target.speed / 4), dt);
      rig.look = approach(rig.look, 0, 0.8, dt);
    }

    rig.aim = approach(rig.aim, target.aiming ? 1 : 0, framing.aimEaseRate, dt);
    const sprint = target.sprinting && target.speed > 5 ? 1 : 0;
    const run = Math.min(1, target.speed / 4.3);
    const roamDistance = roam.distance + (roam.runDistance - roam.distance) * run + (roam.sprintDistance - roam.runDistance) * sprint;
    rig.distance = approach(rig.distance, roamDistance, framing.distanceEaseRate, dt);
    rig.fovOffset = approach(rig.fovOffset, roam.fieldOfView + (roam.sprintFieldOfView - roam.fieldOfView) * sprint, 1.8, dt);
    rig.shownSide = approach(rig.shownSide, rig.side, 5, dt);
    const distance = mix(rig.distance, aim.distance);
    const fovOffset = mix(rig.fovOffset, aim.fieldOfView);
    rig.screenOffset = mix(roam.screenOffset, aim.screenOffset);
    rig.pitch = mix(roam.pitch, aim.pitch) + rig.look;

    springToward(spring.x, target.x, framing.followHorizontal, dt);
    springToward(spring.z, target.z, framing.followHorizontal, dt);
    springToward(spring.y, target.y + mix(roam.pivotHeight, aim.pivotHeight), framing.followVertical, dt);
    pivot.x = spring.x.value; pivot.y = spring.y.value; pivot.z = spring.z.value;

    const shoulder = rig.shownSide * shoulderOffsetFor(rig.screenOffset, distance, fieldOfView + fovOffset, aspect);
    out.pivot.x = pivot.x; out.pivot.y = pivot.y; out.pivot.z = pivot.z;
    orbitPoint(out.shoulder, pivot, rig.yaw, rig.pitch, shoulder, 0, 0);
    orbitPoint(out.camera, pivot, rig.yaw, rig.pitch, shoulder, 0, distance);
    out.yaw = rig.yaw;
    out.pitch = rig.pitch;
    out.fovOffset = fovOffset;
  }

  return { rig, cut, update, get yaw() { return rig.yaw; } };
}

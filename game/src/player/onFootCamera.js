// The on-foot camera: the close, cinematic third-person view of modern open-world crime games
// (the owner's settled decision). The camera sits about 2.1 m behind the lead at head height,
// nearly level, so the street's vanishing point is some 40 % from the top of the picture; the
// lead is large and left of centre (spine at 37 % of the width), seen from about the thighs up,
// the head near the upper third line, the open street and the aim point to the right. Aiming
// eases in close over the right shoulder at eye height (about 1.5 m from the head, 0.52 m right
// of the spine, 49 deg): head, neck and shoulder large in the lower-left quarter, the hand and
// pistol near the centre line, the aim point at the exact screen centre. The mouse turns the view (pitch
// limited), V swaps the shoulder, the pivot follows the lead with a short critically damped lag,
// and every change (aim in and out, sprint pull-back, shoulder) eases in about 0.3 s and never
// snaps. Left alone while the lead runs, it drifts back behind the lead.
import { approach, approachAngle, createPointSpring, resetPointSpring, springToward, wrapAngle } from './smoothMotion.js';

/**
 * Every number of the on-foot framing, in one place. Distances are camera to pivot along the
 * view (metres); pitches in radians (negative looks down); fieldOfView is degrees added to the
 * settings' base of 58 (so 56 on foot, 49 aiming); screenOffset is the lead's spine left of
 * centre as a share of the half width (0.26: 37 % from the left edge). The camera's height is
 * pivotHeight + distance x sin(-pitch) (1.70 m on foot); its ground distance to the lead's
 * centre line is distance x cos(pitch) (2.23 m: 2.1 m behind the back).
 */
export const ON_FOOT_FRAMING = Object.freeze({
  close: Object.freeze({
    pivotHeight: 1.5, distance: 2.24, runDistance: 2.32, sprintDistance: 2.62, pitch: -0.087,
    screenOffset: 0.26, fieldOfView: -2, sprintFieldOfView: 2,
  }),
  // Aim (the owner's direction on aiming, 08:00): close over the right shoulder, the camera at eye
  // height (1.71 m), `shoulder` 0.52 m right of the spine and 1.5 m behind the pivot (about 1.5 m
  // from the head), 49 deg: the back of the head about 28 % from the left with its top about 38 %
  // from the top, head, neck and shoulder large in the lower-left quarter cut by the bottom edge,
  // the outstretched hand and pistol at about 40 % from the left near the centre line, the aim
  // point at the exact centre. `shoulder` is metres, so it does not change with the aspect.
  aim: Object.freeze({ pivotHeight: 1.69, distance: 1.5, pitch: -0.015, shoulder: 0.52, fieldOfView: -9 }),
  easeRate: 10,             // exponential rate of the aim change: about 0.3 s
  distanceEaseRate: 1.6,    // walk, run and sprint pull-back
  shoulderEaseRate: 10,     // swapping shoulder
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
 * @param {number} screenOffset Share of the half width (0.26: 37 % from the left edge).
 * @param {number} distance Camera to pivot along the view, metres.
 * @param {number} fieldOfView Vertical, degrees.
 * @param {number} aspect Width over height.
 */
export function shoulderOffsetFor(screenOffset, distance, fieldOfView, aspect) {
  return screenOffset * distance * Math.tan((fieldOfView * Math.PI) / 360) * aspect;
}

/**
 * Creates the on-foot camera.
 * @param {typeof ON_FOOT_FRAMING} [framing]
 */
export function createOnFootCamera(framing = ON_FOOT_FRAMING) {
  const free = framing.close, aim = framing.aim;
  const spring = createPointSpring();
  const pivot = { x: 0, y: 0, z: 0 };
  const rig = {
    yaw: 0, look: 0, pitch: free.pitch, side: 1, shownSide: 1, aim: 0, pace: 0, sprint: 0,
    screenOffset: free.screenOffset, idle: 0,
  };

  /** A framing number for the current pace and aim. */
  function blend(key, runKey, sprintKey) {
    let value = free[key];
    if (runKey) value += (free[runKey] - value) * rig.pace + (free[sprintKey] - free[runKey]) * rig.sprint;
    return value + (aim[key] - value) * rig.aim;
  }

  /** Puts the camera behind the lead at once. */
  function cut(target) {
    rig.yaw = target.heading;
    rig.look = 0;
    rig.aim = target.aiming ? 1 : 0;
    rig.shownSide = rig.side;
    rig.pace = 0; rig.sprint = 0;
    pivot.x = target.x; pivot.y = target.y + blend('pivotHeight'); pivot.z = target.z;
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

    rig.aim = approach(rig.aim, target.aiming ? 1 : 0, framing.easeRate, dt);
    rig.pace = approach(rig.pace, Math.min(1, target.speed / 4.3), framing.distanceEaseRate, dt);
    rig.sprint = approach(rig.sprint, target.sprinting && target.speed > 5 ? 1 : 0, framing.distanceEaseRate, dt);
    rig.shownSide = approach(rig.shownSide, rig.side, framing.shoulderEaseRate, dt);
    const distance = blend('distance', 'runDistance', 'sprintDistance');
    const fovOffset = blend('fieldOfView', 'fieldOfView', 'sprintFieldOfView');
    rig.pitch = blend('pitch') + rig.look;
    // The free view's offset is a share of the screen; the aim's is metres over the shoulder.
    const halfWidth = distance * Math.tan(((fieldOfView + fovOffset) * Math.PI) / 360) * aspect;
    const freeShoulder = free.screenOffset * halfWidth;
    const across = freeShoulder + (aim.shoulder - freeShoulder) * rig.aim;
    rig.screenOffset = across / halfWidth;

    springToward(spring.x, target.x, framing.followHorizontal, dt);
    springToward(spring.z, target.z, framing.followHorizontal, dt);
    springToward(spring.y, target.y + blend('pivotHeight'), framing.followVertical, dt);
    pivot.x = spring.x.value; pivot.y = spring.y.value; pivot.z = spring.z.value;

    const shoulder = rig.shownSide * across;
    out.pivot.x = pivot.x; out.pivot.y = pivot.y; out.pivot.z = pivot.z;
    orbitPoint(out.shoulder, pivot, rig.yaw, rig.pitch, shoulder, 0, 0);
    orbitPoint(out.camera, pivot, rig.yaw, rig.pitch, shoulder, 0, distance);
    out.yaw = rig.yaw;
    out.pitch = rig.pitch;
    out.fovOffset = fovOffset;
  }

  return { rig, cut, update, get yaw() { return rig.yaw; } };
}

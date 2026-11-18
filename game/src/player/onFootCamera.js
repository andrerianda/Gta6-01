// The on-foot camera, framed the way modern open-world crime games frame their lead, in two
// modes the player cycles with V (the owner's settled decision):
// - "close" (default, and every showcase): cinematic, about 2.1 m behind the lead at head
//   height, nearly level, the street's vanishing point some 40 % from the top, the lead large
//   and left of centre (spine at 37 %), seen from about the thighs up, the head near the upper
//   third line;
// - "classic": the lead centred, the whole body in view, the camera ~3.9 m behind and above the
//   head looking 10 degrees down.
// Aiming, in either mode, eases in close over the right shoulder at shoulder height, the lead at
// a third from the left seen from the waist up, the aim point at the screen centre. The mouse
// turns the view (pitch limited), the pivot follows the lead with a short critically damped
// lag, and every change (mode, aim in and out, sprint pull-back) eases in about 0.3 s and never
// snaps. Left alone while the lead runs, it drifts back behind the lead.
import { approach, approachAngle, createPointSpring, resetPointSpring, springToward, wrapAngle } from './smoothMotion.js';

/**
 * Every number of the on-foot framing, in one place. Distances are camera to pivot along the
 * view (metres); pitches in radians (negative looks down); fieldOfView is degrees added to the
 * settings' base of 58 (close 56, classic 53, aim 50); screenOffset is the lead's spine left of
 * centre as a share of the half width (0.26: 37 % from the left edge). The camera's height is
 * pivotHeight + distance x sin(-pitch); its ground distance is distance x cos(pitch).
 */
export const ON_FOOT_FRAMING = Object.freeze({
  close: Object.freeze({
    pivotHeight: 1.5, distance: 2.24, runDistance: 2.32, sprintDistance: 2.62, pitch: -0.087,
    screenOffset: 0.26, fieldOfView: -2, sprintFieldOfView: 2,
  }),
  classic: Object.freeze({
    pivotHeight: 1.76, distance: 3.96, runDistance: 4.04, sprintDistance: 4.36, pitch: -0.175,
    screenOffset: 0, fieldOfView: -5, sprintFieldOfView: -1,
  }),
  aim: Object.freeze({ pivotHeight: 1.5, distance: 1.42, pitch: -0.035, screenOffset: 0.32, fieldOfView: -8 }),
  modes: Object.freeze(['close', 'classic']),
  easeRate: 10,             // exponential rate of mode and aim changes: about 0.3 s
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
 * @param {string} [mode] 'close' (default) or 'classic'.
 * @param {typeof ON_FOOT_FRAMING} [framing]
 */
export function createOnFootCamera(mode = 'close', framing = ON_FOOT_FRAMING) {
  const close = framing.close, classic = framing.classic, aim = framing.aim;
  const spring = createPointSpring();
  const pivot = { x: 0, y: 0, z: 0 };
  const rig = {
    mode: framing.modes.includes(mode) ? mode : 'close', classic: 0, aim: 0,
    yaw: 0, look: 0, pitch: close.pitch, side: 1, shownSide: 1, pace: 0, sprint: 0,
    screenOffset: close.screenOffset, idle: 0,
  };
  rig.classic = rig.mode === 'classic' ? 1 : 0;

  /** A framing number for the current blend of mode, pace and aim. */
  function blend(key, runKey, sprintKey) {
    let a = close[key], b = classic[key];
    if (runKey) {
      a += (close[runKey] - a) * rig.pace + (close[sprintKey] - close[runKey]) * rig.sprint;
      b += (classic[runKey] - b) * rig.pace + (classic[sprintKey] - classic[runKey]) * rig.sprint;
    }
    const free = a + (b - a) * rig.classic;
    return free + (aim[key] - free) * rig.aim;
  }

  /** Puts the camera behind the lead at once. */
  function cut(target) {
    rig.yaw = target.heading;
    rig.look = 0;
    rig.aim = target.aiming ? 1 : 0;
    rig.classic = rig.mode === 'classic' ? 1 : 0;
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
    rig.classic = approach(rig.classic, rig.mode === 'classic' ? 1 : 0, framing.easeRate, dt);
    rig.pace = approach(rig.pace, Math.min(1, target.speed / 4.3), framing.distanceEaseRate, dt);
    rig.sprint = approach(rig.sprint, target.sprinting && target.speed > 5 ? 1 : 0, framing.distanceEaseRate, dt);
    rig.shownSide = approach(rig.shownSide, rig.side, 5, dt);
    const distance = blend('distance', 'runDistance', 'sprintDistance');
    const fovOffset = blend('fieldOfView', 'fieldOfView', 'sprintFieldOfView');
    rig.screenOffset = blend('screenOffset');
    rig.pitch = blend('pitch') + rig.look;

    springToward(spring.x, target.x, framing.followHorizontal, dt);
    springToward(spring.z, target.z, framing.followHorizontal, dt);
    springToward(spring.y, target.y + blend('pivotHeight'), framing.followVertical, dt);
    pivot.x = spring.x.value; pivot.y = spring.y.value; pivot.z = spring.z.value;

    const shoulder = rig.shownSide * shoulderOffsetFor(rig.screenOffset, distance, fieldOfView + fovOffset, aspect);
    out.pivot.x = pivot.x; out.pivot.y = pivot.y; out.pivot.z = pivot.z;
    orbitPoint(out.shoulder, pivot, rig.yaw, rig.pitch, shoulder, 0, 0);
    orbitPoint(out.camera, pivot, rig.yaw, rig.pitch, shoulder, 0, distance);
    out.yaw = rig.yaw;
    out.pitch = rig.pitch;
    out.fovOffset = fovOffset;
  }

  return {
    rig, cut, update,
    /** Cycles close -> classic -> close (V); eases over about 0.3 s. Returns the new mode. */
    cycleMode() {
      const modes = framing.modes;
      rig.mode = modes[(modes.indexOf(rig.mode) + 1) % modes.length];
      return rig.mode;
    },
    /** Sets the mode by name ('close' or 'classic'). */
    setMode(name) {
      if (!framing.modes.includes(name)) return false;
      rig.mode = name;
      return true;
    },
    get mode() { return rig.mode; },
    get yaw() { return rig.yaw; },
  };
}

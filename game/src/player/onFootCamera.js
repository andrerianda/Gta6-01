// The on-foot camera: the close, cinematic third-person view of modern open-world crime games
// (the owner's settled decision). The camera sits about 2.1 m behind the lead at head height,
// nearly level, so the street's vanishing point is some 40 % from the top of the picture; the
// lead is large and left of centre (spine at 37 % of the width), seen from about the thighs up,
// the head near the upper third line, the open street and the aim point to the right. Aiming
// eases in close over the right shoulder and above the head (2.0 m up, 1.22 m behind, 0.35 m
// right, 10 deg down, 48 deg), looking down onto the crown and shoulders: the head about 30 %
// from the left, the hand and pistol below and left of the aim point at the exact screen
// centre. The mouse turns the view (pitch
// limited), V swaps the shoulder, the pivot follows the lead with a short critically damped lag,
// and every change (aim in and out, sprint pull-back, shoulder) eases in about 0.3 s and never
// snaps. Left alone while the lead runs, it drifts back behind the lead.
import { approach, approachAngle, createPointSpring, resetPointSpring, springToward, wrapAngle } from './smoothMotion.js';

/**
 * Every number of the on-foot framing, in one place. Distances are camera to pivot along the
 * view (metres); pitches in radians (negative looks down); fieldOfView is degrees added to the
 * settings' base of 58 (so 56 on foot, 48 aiming); screenOffset is the lead's spine left of
 * centre as a share of the half width (0.26: 37 % from the left edge). The camera's height is
 * pivotHeight + distance x sin(-pitch) (1.70 m on foot); its ground distance to the lead's
 * centre line is distance x cos(pitch) (2.23 m: 2.1 m behind the back).
 */
export const ON_FOOT_FRAMING = Object.freeze({
  close: Object.freeze({
    pivotHeight: 1.5, distance: 2.24, runDistance: 2.32, sprintDistance: 2.62, pitch: -0.087,
    screenOffset: 0.26, fieldOfView: -2, sprintFieldOfView: 2,
  }),
  // Aim (the owner's second aiming reference, 08:40): the camera ABOVE the head looking down onto
  // the crown, neck and shoulders: 1.98 m above the ground (about 0.12 m over the crown), 1.13 m
  // behind the spine, `shoulder` 0.32 m right of it, 10 deg down, 48 deg: at 16:10 the head
  // centre about 30 % from the left, its top about 43 % from the top, the head about 11.5 % of
  // the width (measured on Gran Via at 1.22 m: 30.6 %, 43.5 %, 10.6 %, so moved in to 1.13 m);
  // back and right shoulder in the lower left cut by the bottom edge; the hand and pistol held
  // at shoulder height land below and left of the centre (about 41 %, 60 %); the aim point
  // exactly at the centre. The owner's measured 0.45-0.55 m to the side would put the head at
  // about 22 %, so the screen numbers were kept. `shoulder` is metres (independent of aspect).
  // `bodyTurn` (owner, 08:40 "aim camera at an angle"): while aiming the lead's body faces this
  // much right of the view (radians), so the camera behind the right shoulder sees the back at
  // three-quarter (the right side of the back, shoulder and upper arm partly from the side): the
  // camera's offset gives about 16 degrees and the turn the rest of the 20-30 the owner asked for.
  // Shift 08:31 compared side by side with the reference at 16:9 (/tmp/marazul/player/aimcmp-*):
  // the earlier 1.98 m / 10 deg / 1.13 m showed the head small (9.9 % of the width) over a lot
  // of pavement (horizon 37 % from the top); 1.90 m / 5 deg / 0.9 m matched the reference's look
  // better (head 12.9 %, shoulders filling the lower left, horizon near 45 %) but dropped the hand
  // to 73 %. Owner 09:00 ("the hand while shooting"): at rest the aim looks out nearly level,
  // 4 deg down, so the reticle rests at chest height of a person 15-25 m away, not on the
  // pavement 11 m ahead; the head framing is kept by height and distance: 1.87 m up (level with
  // the crown), 1.03 m behind, 0.30 m right, 3 deg down (the centre ray 1.1 m above the ground
  // 15 m out: 4-5 deg would put it on the road by 20-25 m), 48 deg.
  aim: Object.freeze({ pivotHeight: 1.82, distance: 1.03, pitch: -0.0524, shoulder: 0.3, fieldOfView: -10, bodyTurn: 0.2 }),
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
  const free = framing.close;
  const aim = { ...framing.aim }; // a copy, so tuneAim() can try numbers in the running game
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

  return {
    rig, cut, update,
    get yaw() { return rig.yaw; },
    /** How far right of the view the lead's body faces now (radians, eased with the aim). */
    get bodyTurn() { return (aim.bodyTurn || 0) * rig.aim; },
    /** Replaces some aim framing numbers (keys of ON_FOOT_FRAMING.aim): tuning and scenes. */
    tuneAim(patch) {
      for (const key of Object.keys(aim)) if (typeof patch[key] === 'number') aim[key] = patch[key];
      return { ...aim };
    },
  };
}

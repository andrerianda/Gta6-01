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
  // 15 m out: 4-5 deg would put it on the road by 20-25 m), 48 deg. Shift 8: with the run-time's
  // bladed stance bodyTurn 0.2 measured 31.6 deg between the shoulders' back and the camera
  // line. Measured in one tree at 10:00 (aim-final.js with tuneAim, /tmp/marazul/player/aim-bt0.log,
  // aim-bt30.log): bodyTurn 0 -> 39.7 deg, 0.3 -> 36.9 deg: the run-time's aimAt drives the trunk
  // (chest 18-21 deg off the view, its blade) and the facing barely counts, so the angle is the
  // blade plus the camera's own ~16 deg; 0.3 is the best this lever gives. 25-30 needs the chest
  // about 10 deg off the view (run-time) or a smaller `shoulder` (the head then leaves 30 %).
  // Owner 11:12 ("lower the point of view a bit so the body shows"): neck/shoulder height, 1.25-1.4 m
  // behind the head, 0-2 deg down, FOV ~50. Measured in the game at 1280x720 (aim-lowA.log,
  // /tmp/marazul/player/aim-low-vs-ref.jpg): camera 1.645 m up, 1.34 m behind the head, 1 deg
  // down, 50 deg; head 29.9 % from the left, its top ~37 % from the top; right hand 40 % / 56 %;
  // shoulders' back vs camera 26.9 deg. `shoulder` grew to 0.42 m so the head stays at 30 % from
  // further back (which also gives the camera's own share of the three-quarter angle).
  aim: Object.freeze({ pivotHeight: 1.72, distance: 1.28, pitch: -0.0175, shoulder: 0.42, fieldOfView: -8, bodyTurn: 0.3 }),
  easeRate: 10,             // exponential rate of the aim change: about 0.3 s
  // Shift 12 (owner's video: "smooth like a modern open-world crime game"): walk, run and sprint
  // pull-back and the sprint's wider view follow a critically damped spring (seconds), so they
  // ease IN as well as out (the old exponential started at full speed: a visible kick on Shift).
  paceSmoothTime: 0.45,
  shoulderEaseRate: 10,     // swapping shoulder
  minLook: -0.75,           // the mouse's pitch range around the framing's own pitch
  maxLook: 0.7,
  // Pivot lag, seconds: the camera trails the lead a little on starts, stops and turns (about
  // 0.4 m at a run) and the vertical lag swallows kerbs and steps, so the horizon stays put.
  followHorizontal: 0.1,
  followVertical: 0.22,
  recentreAfter: 1.2,       // seconds without mouse before it swings back behind the running lead
  recentreRate: 1.1,        // how fast it swings (per second, eased in over ~0.5 s)
  // Aiming starts level along the street (owner, 13:00 video): unless the mouse moved the view
  // up or down in the last `levelAimAfter` seconds, the vertical look eases to 0 as the aim begins.
  levelAimAfter: 1.0,
  levelAimRate: 8,
});

/**
 * One frame's mouse movement larger than this (pixels) is a glitch, not a hand: Chrome under
 * pointer lock sends movement spikes of the cursor's whole position (+x,+y then -x,-y; with a
 * button pressed in between they come unpaired: the 13:00 video's aim climbed to the sky by
 * -360 px per shot). A real fast flick moves well under 150 px vertically in one frame.
 */
export const LOOK_SPIKE = Object.freeze({ x: 450, y: 150 });

/**
 * Drops a frame's mouse look when it is a spike (see LOOK_SPIKE), in place.
 * @param {{lookX: number, lookY: number}} look
 * @returns {boolean} True when the frame's movement was dropped.
 */
export function steadyLook(look) {
  if (Math.abs(look.lookX) <= LOOK_SPIKE.x && Math.abs(look.lookY) <= LOOK_SPIKE.y) return false;
  look.lookX = 0; look.lookY = 0;
  return true;
}

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
  const paceSpring = { value: 0, velocity: 0 };
  const sprintSpring = { value: 0, velocity: 0 };
  const pivot = { x: 0, y: 0, z: 0 };
  const rig = {
    yaw: 0, look: 0, pitch: free.pitch, side: 1, shownSide: 1, aim: 0, pace: 0, sprint: 0,
    screenOffset: free.screenOffset, idle: 0, idleY: 0, follow: 0, wasAiming: false, levelling: false,
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
    rig.pace = 0; rig.sprint = 0; rig.follow = 0; rig.idleY = 0;
    paceSpring.value = paceSpring.velocity = sprintSpring.value = sprintSpring.velocity = 0;
    rig.wasAiming = rig.aim > 0.5; rig.levelling = false;
    const head = rig.aim;
    pivot.x = target.x + (target.headDx || 0) * head;
    pivot.y = target.y + blend('pivotHeight') + (target.headDy || 0) * head;
    pivot.z = target.z + (target.headDz || 0) * head;
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
    rig.idleY = turnY !== 0 ? 0 : rig.idleY + dt;
    if (look.swapShoulder) rig.side = -rig.side;
    // Left alone while the lead runs, the view swings back behind the lead: the swing eases in
    // (rig.follow) so a turn reads as the camera gently catching up, never as a snap.
    const following = rig.idle > framing.recentreAfter && target.speed > 0.6 && !target.aiming && !Number.isFinite(target.frameYaw)
      && Math.abs(wrapAngle(target.heading - rig.yaw)) < 2.3;
    rig.follow = approach(rig.follow, following ? 1 : 0, 2.5, dt);
    if (rig.follow > 1e-3) {
      rig.yaw = approachAngle(rig.yaw, target.heading, framing.recentreRate * rig.follow * Math.min(1, target.speed / 4), dt);
      rig.look = approach(rig.look, 0, 0.8 * rig.follow, dt);
    }
    // Getting into a car the view swings behind the lead at the driver's door (target.frameYaw):
    // the door, the climb in and the car stay in frame. The mouse still wins.
    if (Number.isFinite(target.frameYaw) && rig.idle > 0.3) {
      rig.yaw = approachAngle(rig.yaw, target.frameYaw, 2.6, dt);
      rig.look = approach(rig.look, 0, 2, dt);
    }
    // The aim starts level unless the player just moved the view up or down.
    if (target.aiming && !rig.wasAiming) rig.levelling = rig.idleY > framing.levelAimAfter;
    if (!target.aiming || turnY !== 0) rig.levelling = false;
    rig.wasAiming = target.aiming;
    if (rig.levelling) rig.look = approach(rig.look, 0, framing.levelAimRate, dt);

    rig.aim = approach(rig.aim, target.aiming ? 1 : 0, framing.easeRate, dt);
    rig.pace = Math.min(1, Math.max(0, springToward(paceSpring, Math.min(1, target.speed / 4.3), framing.paceSmoothTime, dt)));
    rig.sprint = Math.min(1, Math.max(0, springToward(sprintSpring, target.sprinting && target.speed > 5 ? 1 : 0, framing.paceSmoothTime, dt)));
    rig.shownSide = approach(rig.shownSide, rig.side, framing.shoulderEaseRate, dt);
    const distance = blend('distance', 'runDistance', 'sprintDistance');
    const fovOffset = blend('fieldOfView', 'fieldOfView', 'sprintFieldOfView');
    rig.pitch = blend('pitch') + rig.look;
    // The free view's offset is a share of the screen; the aim's is metres over the shoulder.
    const halfWidth = distance * Math.tan(((fieldOfView + fovOffset) * Math.PI) / 360) * aspect;
    const freeShoulder = free.screenOffset * halfWidth;
    const across = freeShoulder + (aim.shoulder - freeShoulder) * rig.aim;
    rig.screenOffset = across / halfWidth;

    // Aiming, the pivot follows the head's shift from its rest place (target.headDx/Dy/Dz, from
    // the director): the aim stance's lower, forward head keeps its place in the picture.
    const head = rig.aim;
    springToward(spring.x, target.x + (target.headDx || 0) * head, framing.followHorizontal, dt);
    springToward(spring.z, target.z + (target.headDz || 0) * head, framing.followHorizontal, dt);
    springToward(spring.y, target.y + blend('pivotHeight') + (target.headDy || 0) * head, framing.followVertical, dt);
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

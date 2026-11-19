// The camera director: decides what the follow camera shows and draws it. It samples the
// followed subject (the lead on foot, or the vehicle being driven) at every fixed step and
// blends the last two samples by the frame's alpha, so the camera moves as smoothly as the
// drawn subject at any frame rate; it runs the shoulder rig or the chase rig, keeps the camera
// out of walls and above the ground, adds shake, holds scripted cuts, and writes the view
// camera and `context.focus`.
import * as THREE from 'three';
import { GAME_EVENTS } from '../core/events/gameEvents.js';
import { createCameraCollision } from './cameraCollision.js';
import { createDownedCamera } from './downedCamera.js';
import { createOnFootCamera, steadyLook } from './onFootCamera.js';
import { createVehicleChaseCamera } from './vehicleChaseCamera.js';
import { lerpAngle } from './smoothMotion.js';

const point = () => ({ x: 0, y: 0, z: 0 });
/** On foot the camera never comes closer to the pivot (the lead's spine) than this, metres:
 * 0.95 m along the aim line is 0.3 m right of the spine and 0.9 m behind it, well clear of the
 * body capsule and the shoulder, so the near plane never cuts the lead. */
const ON_FOOT_CLEARANCE = 0.95;
/** How fast the near plane comes back once a passed occluder is behind the camera, metres a second. */
const NEAR_RELEASE = 3;
/** The head bone over the feet when the lead stands at rest (lead_a rig), metres; sampled live
 * whenever the lead stands still without aiming. */
const HEAD_REST = Object.freeze({ forward: 0, right: 0, up: 1.66 });
/** How far the aim camera follows the head's shift, metres (a fall or a ragdoll is not followed). */
const HEAD_SHIFT_LIMIT = Object.freeze({ forward: 0.35, right: 0.25, down: 0.4, up: 0.15 });
const clamp = (value, low, high) => (value < low ? low : value > high ? high : value);
/**
 * People never fill the frame from inside the camera (owner, 13:00 video: a pedestrian's head in
 * a corner): anyone (but the lead) whose body is within PERSON_REACH of the camera is cut away by
 * the near plane, PERSON_DEPTH past their centre, never closer to the lead than LEAD_KEEP.
 */
const PERSON_REACH = 1.3;
const PERSON_DEPTH = 0.42;
const LEAD_KEEP = 0.6;

/**
 * The near plane (metres from the camera, 0 for none) that cuts away the people standing at the
 * camera, for a camera at `camera` looking along (fx, fy, fz) at a lead `leadDepth` metres ahead.
 * @param {{x: number, y: number, z: number}} camera
 * @param {number} fx @param {number} fz Horizontal view direction (unit).
 * @param {number} leadDepth Camera to the pivot (the lead's spine) along the view, metres.
 * @param {Array<{position: {x: number, y: number, z: number}, tags?: Set<string>, kind?: string}>} people
 */
/** How close (horizontally, at body height) the camera may come to a person, metres. */
export const PERSON_KEEP = 0.55;

/**
 * The share (0..1) of the pivot -> camera line the camera may use so it stays PERSON_KEEP from
 * everyone but the lead, never shorter than `minimum` metres from the pivot (then the near plane
 * cuts the person away instead).
 */
export function personReachOf(pivot, camera, minimum, people) {
  const dx = camera.x - pivot.x, dy = camera.y - pivot.y, dz = camera.z - pivot.z;
  const length = Math.hypot(dx, dy, dz);
  if (length < 1e-3) return 1;
  const floor = Math.min(1, minimum / length);
  let reach = 1;
  for (const person of people) {
    if (person.kind && person.kind !== 'character') continue;
    if (person.tags && person.tags.has('player')) continue;
    const p = person.position;
    if (!p) continue;
    // Walk in from the camera until the point is clear of this person.
    for (let s = reach; s > floor; s -= 0.04) {
      const x = pivot.x + dx * s, y = pivot.y + dy * s, z = pivot.z + dz * s;
      if (y < p.y - 0.3 || y > p.y + 2.1 || Math.hypot(x - p.x, z - p.z) >= PERSON_KEEP) { reach = s; break; }
      reach = Math.max(floor, s - 0.04);
    }
  }
  return Math.max(floor, reach);
}

export function personClipNear(camera, fx, fz, leadDepth, people) {
  let near = 0;
  for (const person of people) {
    if (person.kind && person.kind !== 'character') continue;
    if (person.tags && person.tags.has('player')) continue;
    const p = person.position;
    if (!p || camera.y < p.y - 0.3 || camera.y > p.y + 2.1) continue;
    const dx = p.x - camera.x, dz = p.z - camera.z;
    if (Math.hypot(dx, dz) > PERSON_REACH) continue;
    const depth = dx * fx + dz * fz;
    if (depth < -PERSON_DEPTH) continue;
    near = Math.max(near, depth + PERSON_DEPTH);
  }
  return Math.min(near, Math.max(0, leadDepth - LEAD_KEEP));
}

/**
 * Creates the camera director.
 * @param {import('../core/systems/gameContext.js').GameContext} context
 */
export function createCameraDirector(context) {
  const onFoot = createOnFootCamera();
  const chase = createVehicleChaseCamera();
  const collision = createCameraCollision(() => context.systems.find('physics'));
  const shot = { pivot: point(), shoulder: point(), camera: point(), yaw: 0, pitch: 0, fovOffset: 0 };
  const sample = { px: 0, py: 0, pz: 0, ph: 0, x: 0, y: 0, z: 0, h: 0, valid: false };
  const target = {
    x: 0, y: 0, z: 0, heading: 0, speed: 0, sprinting: false, aiming: false, radius: 1, steer: 0, lookBehind: false, craft: null,
    headDx: 0, headDy: 0, headDz: 0,
  };
  // The aim follows the head: how far the head bone has moved from where it is when the lead
  // stands at rest (the aim stance drops it and brings it forward), in the lead's own frame.
  const headRest = { forward: HEAD_REST.forward, right: HEAD_REST.right, up: HEAD_REST.up };
  const headShift = { forward: 0, right: 0, up: 0 };
  const headPoint = new THREE.Vector3();
  let headBone = null, headOwner = null;
  const look = { lookX: 0, lookY: 0, sensitivity: 0.0022, invertY: false, swapShoulder: false };
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const lookTarget = new THREE.Vector3();
  const shake = { strength: 0, seconds: 0, left: 0, time: 0 };
  const downed = createDownedCamera();
  let mode = 'onFoot';
  let cutReason = 'start';
  let held = null;
  let viewOffset = 0;
  let baseNear = 0; // the renderer's near plane (read on the first frame)
  let aimHeld = false;
  let aiming = false;
  let combat = null;
  // The view's kick from a shot (radians), springing back at RECOIL_RETURN per second.
  const recoil = { pitch: 0, yaw: 0 };
  const RECOIL_RETURN = 9;
  const nearPeople = [];
  let personReach = 1; // the share of the camera line people leave the camera, eased back out

  /** Whether the shot wants the aim framing: the aim key, setAimFraming, or combat's aimFraming. */
  function wantsAim(input) {
    if (!combat) combat = context.systems.find('combat') || null;
    return aimHeld || input.held('aim') || Boolean(combat && combat.aimFraming);
  }

  /** Turns the shot around its pivot by `angle` (radians, + turns the view left). */
  function orbitShot(angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    const dx = shot.camera.x - shot.pivot.x, dz = shot.camera.z - shot.pivot.z;
    shot.camera.x = shot.pivot.x + dx * c + dz * s;
    shot.camera.z = shot.pivot.z - dx * s + dz * c;
    shot.yaw += angle;
  }

  function subject() {
    const player = context.systems.find('player');
    if (!player || !player.motion) return null;
    return player;
  }

  /** Samples the followed subject; called once per fixed step, after the physics. */
  function sampleStep() {
    const player = subject();
    if (!player) return;
    const vehicle = player.vehicle;
    const wanted = vehicle ? 'inVehicle' : 'onFoot';
    if (wanted !== mode) {
      context.events.emit(GAME_EVENTS.CAMERA_MODE_CHANGED, { mode: wanted, previous: mode });
      mode = wanted;
      sample.valid = false;
      cutReason = cutReason || 'mode';
    }
    const s = player.motion;
    const x = vehicle ? vehicle.position.x : s.x;
    // On foot the drawn height: a kerb's step eases in (onFootMovement's stepOffset), as the body does.
    const y = vehicle ? vehicle.position.y : s.y + (s.stepOffset || 0);
    const z = vehicle ? vehicle.position.z : s.z;
    const h = vehicle ? vehicle.heading ?? 0 : s.heading;
    if (!sample.valid) {
      sample.px = x; sample.py = y; sample.pz = z; sample.ph = h;
      sample.valid = true;
      if (!cutReason) cutReason = 'mode';
    } else {
      sample.px = sample.x; sample.py = sample.y; sample.pz = sample.z; sample.ph = sample.h;
    }
    sample.x = x; sample.y = y; sample.z = z; sample.h = h;
  }

  /** Cuts to the subject on the next frame (teleport, spawn, release of a scripted shot). */
  function cut(reason) {
    sample.valid = false;
    cutReason = reason;
    // Face the subject's way at once: the lead's next step already walks relative to this yaw.
    const player = subject();
    if (player) {
      const heading = player.vehicle ? player.vehicle.heading ?? 0 : player.motion.heading;
      onFoot.rig.yaw = heading;
      chase.rig.yaw = heading;
    }
  }

  /**
   * Writes target.headDx/Dy/Dz: the head bone's shift from its rest place (world metres), eased,
   * which the aim framing adds to its pivot so the head keeps its place in the picture whatever
   * the aim stance does to it. Standing still and not aiming, the rest place is re-learned; never
   * while getting in (shift 14: F at the door learned the seated head, 0.3 m under and 1 m off
   * the door spot, so every aim after the drive framed from 0.27 m too high until the lead stood
   * un-aimed again), nor in a fall, a ragdoll or a stance.
   */
  function followHead(player, dt, aiming) {
    const instance = player.figure && player.figure.instance;
    if (instance && headOwner !== instance) {
      headOwner = instance; headBone = null;
      instance.traverse((node) => { if (!headBone && node.isBone && node.name === 'head') headBone = node; });
    }
    if (!headBone || player.down) { target.headDx = target.headDy = target.headDz = 0; return; }
    headBone.getWorldPosition(headPoint);
    const h = target.heading;
    const fx = -Math.sin(h), fz = -Math.cos(h), rx = Math.cos(h), rz = -Math.sin(h);
    const dx = headPoint.x - target.x, dz = headPoint.z - target.z;
    const forward = dx * fx + dz * fz, right = dx * rx + dz * rz, up = headPoint.y - target.y;
    const walker = player.figure && player.figure.walker;
    const standing = !player.boarding && !(walker && (walker.action || walker.seated || walker.ragdolling
      || (walker.stance && walker.stance !== 'stand')));
    if (!aiming && standing && player.motion.groundSpeed < 0.3) {
      const learn = dt > 0 ? 1 - Math.exp(-4 * dt) : 0;
      headRest.forward += (forward - headRest.forward) * learn;
      headRest.right += (right - headRest.right) * learn;
      headRest.up += (up - headRest.up) * learn;
    }
    const k = dt > 0 ? 1 - Math.exp(-8 * dt) : 1;
    headShift.forward += (clamp(forward - headRest.forward, -HEAD_SHIFT_LIMIT.forward, HEAD_SHIFT_LIMIT.forward) - headShift.forward) * k;
    headShift.right += (clamp(right - headRest.right, -HEAD_SHIFT_LIMIT.right, HEAD_SHIFT_LIMIT.right) - headShift.right) * k;
    headShift.up += (clamp(up - headRest.up, -HEAD_SHIFT_LIMIT.down, HEAD_SHIFT_LIMIT.up) - headShift.up) * k;
    target.headDx = headShift.forward * fx + headShift.right * rx;
    target.headDz = headShift.forward * fz + headShift.right * rz;
    target.headDy = headShift.up;
  }

  function writeFocus(x, y, z, speed, radius, ground, distance) {
    const focus = context.focus;
    focus.position.x = x; focus.position.y = y; focus.position.z = z;
    focus.groundLevel = ground;
    focus.speed = speed;
    focus.radius = radius;
    focus.distance = distance;
  }

  /** Draws the camera for this frame. */
  function frame(dt, alpha) {
    const camera = context.view.camera;
    const settings = context.settings;
    const baseFov = settings.get('graphics.fieldOfView') ?? 58;
    if (held) {
      camera.position.set(held.position.x, held.position.y, held.position.z);
      lookTarget.set(held.target.x, held.target.y, held.target.z);
      camera.lookAt(lookTarget);
      setFov(camera, held.fieldOfView ?? baseFov);
      if (baseNear) setNear(camera, baseNear);
      // The city streams around what the cutscene looks at, not where the lead last stood.
      const t = held.target, p = held.position;
      writeFocus(t.x, t.y, t.z, 0, 4, t.y - 1, Math.hypot(p.x - t.x, p.y - t.y, p.z - t.z));
      return;
    }
    const player = subject();
    if (!player) return;
    // The lead got in or out between fixed steps (the transit's last frame): switch rigs now. Shift
    // 12 (QA B2-enter-3.4s.jpg, probe entry2: the camera 300 m away at kerb height for one frame):
    // the chase rig ran one frame on its springs from the last drive before the step cut it.
    if (!sample.valid || (player.vehicle ? 'inVehicle' : 'onFoot') !== mode) sampleStep();
    const vehicle = player.vehicle;
    target.x = sample.px + (sample.x - sample.px) * alpha;
    target.y = sample.py + (sample.y - sample.py) * alpha;
    target.z = sample.pz + (sample.z - sample.pz) * alpha;
    target.heading = lerpAngle(sample.ph, sample.h, alpha);
    const input = context.input;
    look.lookX = input.lookX;
    look.lookY = input.lookY;
    steadyLook(look); // a pointer-lock glitch never throws the view at the sky
    look.sensitivity = 0.0022 * (settings.get('controls.mouseSensitivity') ?? 1);
    look.invertY = Boolean(settings.get('controls.invertLookY'));
    look.swapShoulder = !vehicle && input.pressed('changeCamera');
    const cutting = cutReason !== null;
    const step = cutting ? 0 : dt;
    if (vehicle) {
      const data = vehicle.data || {};
      target.speed = typeof data.speed === 'number' ? data.speed : 0;
      target.radius = vehicle.radius || 2.4;
      target.steer = data.controls ? data.controls.steer || 0 : input.axis('steer');
      target.lookBehind = input.held('lookBehind');
      target.craft = vehicle.tags && vehicle.tags.has('helicopter') ? 'helicopter' : vehicle.tags && vehicle.tags.has('boat') ? 'boat' : null;
      if (input.pressed('changeCamera')) chase.toggleDistance();
      if (cutting) chase.cut(target);
      chase.update(step, target, look, shot);
    } else {
      const s = player.motion;
      target.speed = s.groundSpeed;
      target.sprinting = s.sprinting;
      target.aiming = !player.down && wantsAim(input);
      target.frameYaw = player.boardingYaw ?? NaN;
      followHead(player, step, target.aiming);
      if (cutting) onFoot.cut(target);
      onFoot.update(step, target, look, baseFov, camera.aspect || 16 / 9, shot);
    }
    // A scene's turn of the view around the lead or the car (off the sun, or onto the driver's
    // window); the mouse eases it away.
    if (look.lookX !== 0) viewOffset = 0;
    if (viewOffset !== 0) orbitShot(viewOffset);
    downed.frame(cutting ? 0 : dt, player, shot);
    // On foot the camera stays at least ON_FOOT_CLEARANCE from the pivot: clear of the body.
    // On foot cars block it too (QA: the camera went inside vehicles).
    collision.resolve(shot.pivot, shot.camera, step, vehicle ? 0 : ON_FOOT_CLEARANCE, !vehicle);
    // Never inside a person (QA 13:15: 0.33 m, once 0.1 m): pull in along the line to the lead.
    if (!vehicle && context.entities && typeof context.entities.within === 'function') {
      context.entities.within(shot.camera.x, shot.camera.z, PERSON_REACH + 1, null, nearPeople);
      const wanted = personReachOf(shot.pivot, shot.camera, ON_FOOT_CLEARANCE, nearPeople);
      personReach = wanted < personReach || step <= 0 ? wanted : Math.min(wanted, personReach + 1.5 * step);
      if (personReach < 1) {
        shot.camera.x = shot.pivot.x + (shot.camera.x - shot.pivot.x) * personReach;
        shot.camera.y = shot.pivot.y + (shot.camera.y - shot.pivot.y) * personReach;
        shot.camera.z = shot.pivot.z + (shot.camera.z - shot.pivot.z) * personReach;
      }
    } else personReach = 1;
    // A thin occluder the camera passed (a palm trunk behind the lead) is cut away by the near
    // plane at once; the plane eases back as the camera clears it.
    if (baseNear === 0) baseNear = camera.near;
    let wantNear = vehicle ? baseNear : Math.max(baseNear, collision.clipNear);
    if (!vehicle && context.entities && typeof context.entities.within === 'function') {
      const fx = -Math.sin(shot.yaw), fz = -Math.cos(shot.yaw);
      const leadDepth = (shot.pivot.x - shot.camera.x) * fx + (shot.pivot.z - shot.camera.z) * fz;
      context.entities.within(shot.camera.x, shot.camera.z, PERSON_REACH, null, nearPeople);
      wantNear = Math.max(wantNear, personClipNear(shot.camera, fx, fz, leadDepth, nearPeople));
    }
    setNear(camera, wantNear >= camera.near || step <= 0 ? wantNear : Math.max(wantNear, camera.near - NEAR_RELEASE * step));
    const floor = (vehicle ? target.y : player.motion.groundLevel) + 0.3;
    if (shot.camera.y < floor) shot.camera.y = floor;

    aiming = !vehicle && target.aiming;
    const settle = Math.exp(-RECOIL_RETURN * dt);
    recoil.pitch *= settle; recoil.yaw *= settle;
    let shakeYaw = recoil.yaw, shakePitch = recoil.pitch;
    if (shake.left > 0) {
      shake.left = Math.max(0, shake.left - dt);
      shake.time += dt;
      const amount = shake.strength * (shake.left / shake.seconds) * (settings.get('graphics.cameraShake') ?? 1) * 0.03;
      shakeYaw += amount * (Math.sin(shake.time * 37) + 0.5 * Math.sin(shake.time * 61));
      shakePitch += amount * (Math.sin(shake.time * 43 + 1) + 0.5 * Math.sin(shake.time * 71));
    }
    camera.position.set(shot.camera.x, shot.camera.y, shot.camera.z);
    euler.set(shot.pitch + shakePitch, shot.yaw + shakeYaw, 0, 'YXZ');
    camera.quaternion.setFromEuler(euler);
    setFov(camera, baseFov + shot.fovOffset);
    camera.updateMatrixWorld();

    const distance = Math.hypot(shot.camera.x - target.x, shot.camera.y - target.y - 1, shot.camera.z - target.z);
    writeFocus(target.x, target.y + 1, target.z, Math.abs(target.speed), vehicle ? target.radius : 0.6,
      vehicle ? target.y : player.motion.groundLevel, distance);
    if (cutting) {
      context.events.emit(GAME_EVENTS.CAMERA_CUT, { reason: cutReason });
      cutReason = null;
    }
  }

  function setNear(camera, near) {
    if (Math.abs(camera.near - near) > 0.005) {
      camera.near = near;
      camera.updateProjectionMatrix();
    }
  }

  function setFov(camera, fov) {
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  }

  return {
    sampleStep,
    frame,
    cut,
    /** Holds a scripted shot until released (CAMERA_CUT_TO). */
    hold(shotRequest) {
      held = shotRequest;
      context.events.emit(GAME_EVENTS.CAMERA_CUT, { reason: 'scripted' });
    },
    release() {
      held = null;
      cut('release');
    },
    /** Shakes the view; with a `position` the strength falls off to nothing over `range` metres. */
    shake(strength, seconds, position, range = 60) {
      let amount = Math.min(1.5, Math.max(0, strength));
      if (position) amount *= Math.max(0, 1 - Math.hypot(position.x - target.x, position.z - target.z) / range);
      if (amount <= 0.01) return;
      shake.strength = Math.max(shake.left > 0 ? shake.strength : 0, amount);
      shake.seconds = shake.left = Math.max(0.05, seconds);
    },
    /** Kicks the view by a shot's recoil (radians, + up, + left); it springs back in ~0.3 s. */
    addRecoil(pitch = 0, yaw = 0) {
      recoil.pitch = Math.min(0.2, recoil.pitch + pitch);
      recoil.yaw = Math.max(-0.1, Math.min(0.1, recoil.yaw + yaw));
    },
    /** Holds the aim framing (over the right shoulder) whatever the aim key says. */
    setAimFraming(on) { aimHeld = Boolean(on); },
    /** Whether the on-foot shot is aiming now (aim key, setAimFraming or combat's aimFraming). */
    get aiming() { return aiming; },
    get aimBlend() { return onFoot.rig.aim; },
    /** How far right of the view the lead's body faces while aiming (radians, eased). */
    get aimBodyTurn() { return mode === 'onFoot' ? onFoot.bodyTurn : 0; },
    /**
     * The aim DIRECTION (owner, 09:00): the view's forward unit vector, written into `out`
     * ({x, y, z}); the arm follows it rather than the reticle's hit point.
     */
    aimDirection(out) {
      context.view.camera.getWorldDirection(lookTarget);
      out.x = lookTarget.x; out.y = lookTarget.y; out.z = lookTarget.z;
      return out;
    },
    /** The head's place at rest and its eased shift now (lead frame, metres): for measuring. */
    get headFollow() { return { rest: { ...headRest }, shift: { ...headShift } }; },
    /** Tries other aim framing numbers (keys of ON_FOOT_FRAMING.aim); returns them all. */
    tuneAim(patch = {}) { return onFoot.tuneAim(patch); },
    /** Turns the on-foot view around the lead by `angle` radians until the mouse moves. */
    setViewOffset(angle) { viewOffset = angle; },
    get mode() { return mode; },
    get yaw() { return mode === 'inVehicle' ? chase.yaw : onFoot.yaw; },
  };
}

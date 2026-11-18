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
import { createOnFootCamera } from './onFootCamera.js';
import { createVehicleChaseCamera } from './vehicleChaseCamera.js';
import { lerpAngle } from './smoothMotion.js';

const point = () => ({ x: 0, y: 0, z: 0 });

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
  const target = { x: 0, y: 0, z: 0, heading: 0, speed: 0, sprinting: false, aiming: false, radius: 1, steer: 0, lookBehind: false };
  const look = { lookX: 0, lookY: 0, sensitivity: 0.0022, invertY: false, swapShoulder: false };
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const lookTarget = new THREE.Vector3();
  const shake = { strength: 0, seconds: 0, left: 0, time: 0 };
  const downed = createDownedCamera();
  let mode = 'onFoot';
  let cutReason = 'start';
  let held = null;
  let viewOffset = 0;
  let aimHeld = false;

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
    const y = vehicle ? vehicle.position.y : s.y;
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
      return;
    }
    const player = subject();
    if (!player) return;
    if (!sample.valid) sampleStep();
    const vehicle = player.vehicle;
    target.x = sample.px + (sample.x - sample.px) * alpha;
    target.y = sample.py + (sample.y - sample.py) * alpha;
    target.z = sample.pz + (sample.z - sample.pz) * alpha;
    target.heading = lerpAngle(sample.ph, sample.h, alpha);
    const input = context.input;
    look.lookX = input.lookX;
    look.lookY = input.lookY;
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
      if (input.pressed('changeCamera')) chase.toggleDistance();
      if (cutting) chase.cut(target);
      chase.update(step, target, look, shot);
    } else {
      const s = player.motion;
      target.speed = s.groundSpeed;
      target.sprinting = s.sprinting;
      target.aiming = aimHeld || input.held('aim');
      if (cutting) onFoot.cut(target);
      onFoot.update(step, target, look, baseFov, camera.aspect || 16 / 9, shot);
      // A scene's turn of the view around the lead (off the sun); the mouse eases it away.
      if (look.lookX !== 0) viewOffset = 0;
      if (viewOffset !== 0) orbitShot(viewOffset);
    }
    downed.frame(cutting ? 0 : dt, player, shot);
    collision.resolve(shot.pivot, shot.camera, step);
    const floor = (vehicle ? target.y : player.motion.groundLevel) + 0.3;
    if (shot.camera.y < floor) shot.camera.y = floor;

    let shakeYaw = 0, shakePitch = 0;
    if (shake.left > 0) {
      shake.left = Math.max(0, shake.left - dt);
      shake.time += dt;
      const amount = shake.strength * (shake.left / shake.seconds) * (settings.get('graphics.cameraShake') ?? 1) * 0.03;
      shakeYaw = amount * (Math.sin(shake.time * 37) + 0.5 * Math.sin(shake.time * 61));
      shakePitch = amount * (Math.sin(shake.time * 43 + 1) + 0.5 * Math.sin(shake.time * 71));
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
    shake(strength, seconds) {
      shake.strength = Math.max(shake.left > 0 ? shake.strength : 0, strength);
      shake.seconds = shake.left = Math.max(0.05, seconds);
    },
    /** Holds the aim framing (over the right shoulder) whatever the aim key says. */
    setAimFraming(on) { aimHeld = Boolean(on); },
    get aimBlend() { return onFoot.rig.aim; },
    /** Turns the on-foot view around the lead by `angle` radians until the mouse moves. */
    setViewOffset(angle) { viewOffset = angle; },
    get mode() { return mode; },
    get yaw() { return mode === 'inVehicle' ? chase.yaw : onFoot.yaw; },
  };
}

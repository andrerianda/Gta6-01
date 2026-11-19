// The three cameras of a fixed-wing aircraft the lead flies (C or V cycles them; the choice is
// remembered in the settings as 'flightView'):
//   cockpit  at the pilot's eye (the model's anchor_camera, else the catalog's flight.layout.eye),
//            rolling and pitching with the aircraft; the mouse looks about 100 degrees to each
//            side and 45 up and down and eases back to straight ahead; a small near plane, so
//            the panel under the eye is drawn.
//   chase    behind and above, at a distance set by the aircraft's size; it follows the heading,
//            most of the pitch and a third of the bank on a spring, looks ahead of the flight
//            path and widens its field of view a little with speed; the mouse swings it for a
//            moment.
//   outside  a free orbit by the mouse at the same distance, the world's up kept.
// The camera is placed from the aircraft's drawn pose of this frame (the fleet's interpolated
// root), so nothing lags or jitters at 1000 m/s; only the chase frame's attitude is eased. The far
// plane grows with height, so the ground stays in the picture from 25 km up.
import * as THREE from 'three';
import { GAME_EVENTS } from '../core/events/gameEvents.js';

/** The views in the order C cycles them. */
export const FLIGHT_VIEWS = Object.freeze(['chase', 'cockpit', 'outside']);

/**
 * The numbers of the flight cameras.
 * lookYaw / lookPitch: the cockpit's head turn limits, radians. recentre: seconds without mouse
 * movement before the view eases back. chaseBank / chasePitch: the share of the aircraft's bank
 * and pitch the chase frame takes. chaseFollow: its spring, per second.
 */
export const FLIGHT_FRAMING = Object.freeze({
  lookYaw: 1.75, lookPitch: 0.8, recentre: 2.2, recentreRate: 3,
  cockpitNear: 0.06, cockpitFov: 6,
  chaseBank: 0.35, chasePitch: 0.7, chaseFollow: 4.5, chaseHeight: 0.24, chaseLookAhead: 0.55, chaseFovGain: 9,
  outsidePitch: 0.22, outsidePitchLimit: 1.35,
  farPerMetre: 9, farMax: 220000,
});

/**
 * How far behind an aircraft the chase and outside cameras sit, metres: about 2.2 spans for a
 * light aircraft, 1.3 for the big jets, and never less than a length and a half.
 * @param {{length: number, width: number}} dimensions The catalog dimensions (width is the span).
 */
export function chaseDistanceOf(dimensions) {
  const span = dimensions?.width ?? 10, length = dimensions?.length ?? 8;
  return Math.max((span < 12 ? 2.2 : 1.3) * span, 1.5 * length);
}

/**
 * Creates the flight cameras.
 * @param {import('../core/systems/gameContext.js').GameContext} context
 */
export function createAircraftCameras(context) {
  const saved = context.settings ? context.settings.get('flightView') : null;
  let view = FLIGHT_VIEWS.includes(saved) ? saved : 'chase';
  let announced = null;
  let flownId = null;
  let baseFar = 0;
  let idle = 0;
  let headYaw = 0, headPitch = 0;       // cockpit head turn, and the chase camera's momentary swing
  let orbitYaw = 0, orbitPitch = FLIGHT_FRAMING.outsidePitch;
  let distance = 20, eyeKnown = false;
  const eye = new THREE.Vector3();
  const frameTurn = new THREE.Quaternion(); // the chase frame, eased
  const wanted = new THREE.Quaternion();
  const head = new THREE.Quaternion();
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const offset = new THREE.Vector3();
  const lookAt = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const basis = new THREE.Matrix4();
  const up = new THREE.Vector3();

  const fleet = () => context.systems.find('vehicles');

  function announce(next) {
    if (next === announced) return;
    announced = next;
    context.events.emit(GAME_EVENTS.FLIGHT_VIEW_CHANGED, { view: next });
  }

  function setView(next) {
    if (!FLIGHT_VIEWS.includes(next)) return false;
    view = next;
    headYaw = headPitch = 0;
    if (context.settings) context.settings.set('flightView', next);
    if (flownId !== null) announce(view);
    return true;
  }

  /** The aircraft changed: its size, its eye point, a fresh chase frame behind it. */
  function adopt(vehicle, record, root) {
    flownId = vehicle.id;
    distance = chaseDistanceOf(record && record.entry ? record.entry.dimensions : null);
    const boarding = record && record.craft ? record.craft.boarding : null;
    eyeKnown = Boolean(boarding);
    if (boarding) eye.copy(boarding.eye); else eye.set(0, 1.5, 0);
    headYaw = headPitch = 0;
    orbitYaw = 0; orbitPitch = FLIGHT_FRAMING.outsidePitch;
    chaseFrameOf(root, wanted);
    frameTurn.copy(wanted);
    announce(view);
  }

  /** The chase frame for the aircraft's attitude: its heading, a share of its pitch and bank. */
  function chaseFrameOf(root, out) {
    euler.setFromQuaternion(root.quaternion, 'YXZ');
    euler.set(euler.x * FLIGHT_FRAMING.chasePitch, euler.y, euler.z * FLIGHT_FRAMING.chaseBank, 'YXZ');
    return out.setFromEuler(euler);
  }

  return {
    /** 'cockpit' | 'chase' | 'outside': the view used while flying. */
    get view() { return view; },
    /** The view while the lead flies an aircraft, else null. */
    get active() { return flownId === null ? null : view; },
    setView,
    /** The next view (C or V). */
    cycle() { return setView(FLIGHT_VIEWS[(FLIGHT_VIEWS.indexOf(view) + 1) % FLIGHT_VIEWS.length]); },
    /** The lead no longer flies: the far plane goes back, the view is announced as none. */
    release(camera) {
      if (flownId === null) return;
      flownId = null;
      if (baseFar && camera.far !== baseFar) { camera.far = baseFar; camera.updateProjectionMatrix(); }
      announce(null);
    },
    /**
     * Places the camera for this frame. Returns false when the aircraft has no drawn model yet
     * (the director then uses its ordinary vehicle camera).
     * @param {THREE.PerspectiveCamera} camera
     * @param {object} vehicle The aircraft's entity.
     * @param {{lookX: number, lookY: number, sensitivity: number, invertY: boolean}} look The mouse.
     * @param {number} dt Frame seconds (0 on a cut).
     * @param {number} baseFov Degrees.
     * @param {{near: number}} out Receives the near plane wanted.
     */
    frame(camera, vehicle, look, dt, baseFov, out) {
      const vehicles = fleet();
      const record = vehicles && typeof vehicles.get === 'function' ? vehicles.get(vehicle.id) : null;
      const root = record && record.rig ? record.rig.root : null;
      if (!root) return false;
      if (!baseFar) baseFar = camera.far;
      if (flownId !== vehicle.id) adopt(vehicle, record, root);
      const body = record.car;
      const state = body && body.state ? body.state : null;
      const speed = state ? state.airspeed || 0 : Math.abs(vehicle.data && vehicle.data.speed || 0);

      // The mouse: the head in the cockpit, a momentary swing behind, the orbit outside.
      const moved = look.lookX !== 0 || look.lookY !== 0;
      const dy = look.lookY * look.sensitivity * (look.invertY ? -1 : 1);
      if (view === 'outside') {
        orbitYaw -= look.lookX * look.sensitivity;
        orbitPitch = clamp(orbitPitch + dy, -0.25, FLIGHT_FRAMING.outsidePitchLimit);
      } else {
        headYaw = clamp(headYaw - look.lookX * look.sensitivity, -FLIGHT_FRAMING.lookYaw, FLIGHT_FRAMING.lookYaw);
        headPitch = clamp(headPitch - dy, -FLIGHT_FRAMING.lookPitch, FLIGHT_FRAMING.lookPitch);
        idle = moved ? 0 : idle + dt;
        if (idle > FLIGHT_FRAMING.recentre) {
          const back = Math.exp(-FLIGHT_FRAMING.recentreRate * dt);
          headYaw *= back; headPitch *= back;
        }
      }

      let fov = baseFov;
      if (view === 'cockpit') {
        camera.position.copy(eye).applyQuaternion(root.quaternion).add(root.position);
        euler.set(headPitch, headYaw, 0, 'YXZ');
        camera.quaternion.copy(root.quaternion).multiply(head.setFromEuler(euler));
        out.near = FLIGHT_FRAMING.cockpitNear;
        fov = baseFov + FLIGHT_FRAMING.cockpitFov;
      } else if (view === 'chase') {
        chaseFrameOf(root, wanted);
        if (dt > 0) frameTurn.slerp(wanted, 1 - Math.exp(-FLIGHT_FRAMING.chaseFollow * dt)); else frameTurn.copy(wanted);
        euler.set(headPitch * 0.6, headYaw, 0, 'YXZ');
        head.copy(frameTurn).multiply(wanted.setFromEuler(euler));
        offset.set(0, distance * FLIGHT_FRAMING.chaseHeight, distance).applyQuaternion(head);
        camera.position.copy(root.position).add(offset);
        lookAt.set(0, distance * 0.06, -distance * FLIGHT_FRAMING.chaseLookAhead).applyQuaternion(head).add(root.position);
        up.set(0, 1, 0).applyQuaternion(frameTurn);
        forward.copy(camera.position);
        basis.lookAt(forward, lookAt, up);
        camera.quaternion.setFromRotationMatrix(basis);
        out.near = Math.max(0.3, distance * 0.02);
        const cruise = body && body.tuning && body.tuning.cruiseSpeed ? body.tuning.cruiseSpeed : 60;
        fov = baseFov + FLIGHT_FRAMING.chaseFovGain * clamp(speed / cruise, 0, 1.2);
      } else {
        const c = Math.cos(orbitPitch);
        euler.setFromQuaternion(root.quaternion, 'YXZ');
        const yaw = euler.y + orbitYaw;
        offset.set(Math.sin(yaw) * c, Math.sin(orbitPitch), Math.cos(yaw) * c).multiplyScalar(distance);
        lookAt.set(0, eyeKnown ? eye.y * 0.6 : 1, 0).applyQuaternion(root.quaternion).add(root.position);
        camera.position.copy(lookAt).add(offset);
        basis.lookAt(camera.position, lookAt, up.set(0, 1, 0));
        camera.quaternion.setFromRotationMatrix(basis);
        out.near = Math.max(0.3, distance * 0.02);
      }

      // Never under the ground.
      if (view !== 'cockpit') {
        const city = context.systems.find('openWorldCity');
        const ground = city && typeof city.groundHeightAt === 'function' ? city.groundHeightAt(camera.position.x, camera.position.z) : NaN;
        const floor = (Number.isFinite(ground) ? Math.max(ground, 0) : 0) + 0.6;
        if (camera.position.y < floor) camera.position.y = floor;
      }
      const far = clamp(baseFar + Math.max(0, camera.position.y) * FLIGHT_FRAMING.farPerMetre, baseFar, FLIGHT_FRAMING.farMax);
      if (Math.abs(camera.far - far) > 50 || Math.abs(camera.fov - fov) > 0.01) {
        camera.far = far;
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }
      camera.updateMatrixWorld();
      return true;
    },
  };
}

function clamp(value, low, high) {
  return value < low ? low : value > high ? high : value;
}

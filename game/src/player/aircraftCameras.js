// The three cameras of a fixed-wing aircraft the lead flies. Every flight starts in the cockpit
// (DEFAULT_FLIGHT_VIEW); C or V cycles to the others for the rest of that flight only. A view asked
// for through setView (the launch's &flightview, a story stage) holds for the flight about to
// start or under way. The old saved 'flightView' setting is no longer read, so a 'chase' saved by
// an earlier version never overrides the cockpit. While the flown aircraft's cockpit model is
// still loading (flight deck's cockpitPendingFor), the cockpit view is held outside on the chase
// framing and announced as such: no frame shows the cockpit view without its model.
//   cockpit  at the pilot's eye, rolling and pitching with the aircraft; the mouse looks about 100
//            degrees to each side and 45 up and down and eases back to straight ahead; a small
//            near plane, so the panel, the frames and the hands under the eye are drawn. With a
//            cockpit model (flight deck's cockpitFraming) the eye, the lens and the resting gaze
//            are the model's own (`eye` node, `fov` and `gaze` extras: composed so the panel's top
//            edge sits a third up the screen); else the aircraft's anchor_camera, or the
//            catalog's flight.layout.eye, with the numbers below.
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

/** The views in the order C cycles them: from the cockpit out behind, then around, then back in. */
export const FLIGHT_VIEWS = Object.freeze(['cockpit', 'chase', 'outside']);

/** The view every flight starts in. */
export const DEFAULT_FLIGHT_VIEW = 'cockpit';

/**
 * The numbers of the flight cameras.
 * lookYaw / lookPitch: the cockpit's head turn limits, radians. recentre: seconds without mouse
 * movement before the view eases back. chaseBank / chasePitch: the share of the aircraft's bank
 * and pitch the chase frame takes. chaseFollow: its spring, per second.
 */
export const FLIGHT_FRAMING = Object.freeze({
  lookYaw: 1.75, lookPitch: 0.8, recentre: 2.2, recentreRate: 3,
  cockpitNear: 0.06, cockpitFov: 10, cockpitGaze: -0.1, // the resting gaze dips so the panel's lower row shows
  cockpitModelNear: 0.05, // with a cockpit model: nearer than the frames, the headrest and the hands ever come
  // chaseHeight: metres up per metre behind, over the body's middle (chaseLift of the aircraft's height above the
  // wheels), high enough that the wing's planform reads; it looks chaseLookAhead ahead and chaseLookUp up per metre
  chaseBank: 0.35, chasePitch: 0.7, chaseFollow: 4.5, chaseHeight: 0.28, chaseLift: 0.6, chaseLookAhead: 0.55, chaseLookUp: 0.1, chaseFovGain: 9,
  outsidePitch: 0.22, outsidePitchLimit: 1.35,
  farPerMetre: 9, farMax: 220000,
});

/**
 * The chase camera's framing. The wings fill `share` of the screen's width at cruise (vertical
 * field of view `fov`, the base 58 degrees plus chaseFovGain, on a 16:10 screen: more on the
 * ground, where the lens is narrower); a long, narrow aircraft is never nearer than `minLengths`
 * of its length, so its tail stays well ahead of the camera and the nose is not stretched.
 */
export const CHASE_FRAMING = Object.freeze({ share: 0.43, fov: 58 + FLIGHT_FRAMING.chaseFovGain, aspect: 1.6, minLengths: 0.9 });

/**
 * Metres along the chase camera's view from its eye to the aircraft's origin, per metre of chase
 * distance (the camera sits chaseHeight up and looks chaseLookAhead ahead and chaseLookUp up).
 */
export function chaseDepthPerMetre() {
  const h = FLIGHT_FRAMING.chaseHeight, ahead = FLIGHT_FRAMING.chaseLookAhead + 1, drop = h - FLIGHT_FRAMING.chaseLookUp;
  return (drop * h + ahead) / Math.hypot(drop, ahead);
}

/**
 * How far behind an aircraft the chase and outside cameras sit, metres: near enough that the
 * span fills CHASE_FRAMING.share of the screen's width, never nearer than 0.9 of its length.
 * Manta Sombra (46 m span) 49 m, Garza Negra (31 m long) 28 m, Gaviota T-2 (8.6 m span) 9.2 m.
 * @param {{length: number, width: number}} dimensions The catalog dimensions (width is the span).
 */
export function chaseDistanceOf(dimensions) {
  const span = dimensions?.width ?? 10, length = dimensions?.length ?? 8;
  const halfWidth = Math.tan((CHASE_FRAMING.fov * Math.PI) / 360) * CHASE_FRAMING.aspect;
  const bySpan = span / (2 * CHASE_FRAMING.share * halfWidth * chaseDepthPerMetre());
  return Math.max(bySpan, CHASE_FRAMING.minLengths * length);
}

/**
 * The height of the point the chase camera frames, metres above the aircraft's origin (the
 * wheels' plane): the body's middle, so a small high-wing aircraft is seen from above its wing too.
 * @param {{height: number}} dimensions The catalog dimensions.
 */
export function chaseLiftOf(dimensions) {
  return (dimensions?.height ?? 2.5) * FLIGHT_FRAMING.chaseLift;
}

/**
 * Creates the flight cameras.
 * @param {import('../core/systems/gameContext.js').GameContext} context
 */
export function createAircraftCameras(context) {
  let view = DEFAULT_FLIGHT_VIEW;      // the view chosen for this flight
  let chosen = null;                   // a view asked for through setView, kept for the flight it was asked for
  let shown = view;                    // what the camera shows now (the chase framing while the cockpit model loads)
  let announced = null;
  let flownId = null;
  let baseFar = 0;
  let idle = 0;
  let headYaw = 0, headPitch = 0;       // cockpit head turn, and the chase camera's momentary swing
  let orbitYaw = 0, orbitPitch = FLIGHT_FRAMING.outsidePitch;
  let distance = 20, lift = 1.5, eyeKnown = false;
  const pivot = new THREE.Vector3();
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

  /** C / V: the view for the rest of this flight (the next one starts in the cockpit again). */
  function switchTo(next) {
    if (!FLIGHT_VIEWS.includes(next)) return false;
    view = next;
    headYaw = headPitch = 0;
    return true;
  }

  /** Asked for by the launch or a scene: this flight's view, also for the aircraft about to be boarded. */
  function setView(next) {
    if (!switchTo(next)) return false;
    chosen = next;
    return true;
  }

  /** The cockpit view waits outside while the aircraft's cockpit model is still on its way. */
  function viewShown(vehicleId) {
    if (view !== 'cockpit') return view;
    const deck = context.systems.find('flightDeck');
    return deck && typeof deck.cockpitPendingFor === 'function' && deck.cockpitPendingFor(vehicleId) ? 'chase' : view;
  }

  /** The aircraft changed: its size, its eye point, a fresh chase frame behind it, a flight's first view. */
  function adopt(vehicle, record, root) {
    flownId = vehicle.id;
    view = chosen ?? DEFAULT_FLIGHT_VIEW;
    const dimensions = record && record.entry ? record.entry.dimensions : null;
    distance = chaseDistanceOf(dimensions);
    lift = chaseLiftOf(dimensions);
    const boarding = record && record.craft ? record.craft.boarding : null;
    eyeKnown = Boolean(boarding);
    if (boarding) eye.copy(boarding.eye); else eye.set(0, 1.5, 0);
    headYaw = headPitch = 0;
    orbitYaw = 0; orbitPitch = FLIGHT_FRAMING.outsidePitch;
    chaseFrameOf(root, wanted);
    frameTurn.copy(wanted);
  }

  /** The chase frame for the aircraft's attitude: its heading, a share of its pitch and bank. */
  function chaseFrameOf(root, out) {
    euler.setFromQuaternion(root.quaternion, 'YXZ');
    euler.set(euler.x * FLIGHT_FRAMING.chasePitch, euler.y, euler.z * FLIGHT_FRAMING.chaseBank, 'YXZ');
    return out.setFromEuler(euler);
  }

  return {
    /** 'cockpit' | 'chase' | 'outside': the view chosen for this flight (or the next one). */
    get view() { return view; },
    /** The view shown while the lead flies an aircraft (what the HUD and the voices follow), else null. */
    get active() { return flownId === null ? null : shown; },
    setView,
    /** The next view (C or V), for the rest of this flight. */
    cycle() { return switchTo(FLIGHT_VIEWS[(FLIGHT_VIEWS.indexOf(view) + 1) % FLIGHT_VIEWS.length]); },
    /** The lead no longer flies: the far plane goes back, the view is announced as none; the next flight starts in the cockpit. */
    release(camera) {
      if (flownId === null) return;
      flownId = null;
      chosen = null;
      view = DEFAULT_FLIGHT_VIEW;
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
      const before = shown;
      shown = viewShown(vehicle.id);
      // Into the chase view (C, or the cockpit still loading): its frame starts on the aircraft's attitude, not a stale one.
      if (shown !== before && shown === 'chase') { chaseFrameOf(root, wanted); frameTurn.copy(wanted); }
      announce(shown);
      const body = record.car;
      const state = body && body.state ? body.state : null;
      const speed = state ? state.airspeed || 0 : Math.abs(vehicle.data && vehicle.data.speed || 0);

      // The mouse: the head in the cockpit, a momentary swing behind, the orbit outside.
      const moved = look.lookX !== 0 || look.lookY !== 0;
      const dy = look.lookY * look.sensitivity * (look.invertY ? -1 : 1);
      if (shown === 'outside') {
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
      // (placed by what is shown: the chase framing while the cockpit model is still on its way)
      if (shown === 'cockpit') {
        // The cockpit model's own eye, lens and gaze when it is on the aircraft; today's numbers otherwise.
        const deck = context.systems.find('flightDeck');
        const framing = deck && deck.active !== false ? deck.cockpitFraming ?? null : null;
        const modelEye = framing && framing.eye ? framing.eye : null;
        if (modelEye) offset.set(modelEye.x, modelEye.y, modelEye.z); else offset.copy(eye);
        camera.position.copy(offset).applyQuaternion(root.quaternion).add(root.position);
        const gaze = framing && Number.isFinite(framing.gazeRadians) && framing.gazeRadians !== null ? framing.gazeRadians : FLIGHT_FRAMING.cockpitGaze;
        euler.set(headPitch + gaze, headYaw, 0, 'YXZ');
        camera.quaternion.copy(root.quaternion).multiply(head.setFromEuler(euler));
        out.near = framing ? FLIGHT_FRAMING.cockpitModelNear : FLIGHT_FRAMING.cockpitNear;
        fov = framing && Number.isFinite(framing.fovDegrees) && framing.fovDegrees !== null ? framing.fovDegrees : baseFov + FLIGHT_FRAMING.cockpitFov;
      } else if (shown === 'chase') {
        chaseFrameOf(root, wanted);
        if (dt > 0) frameTurn.slerp(wanted, 1 - Math.exp(-FLIGHT_FRAMING.chaseFollow * dt)); else frameTurn.copy(wanted);
        euler.set(headPitch * 0.6, headYaw, 0, 'YXZ');
        head.copy(frameTurn).multiply(wanted.setFromEuler(euler));
        // Framed on the body's middle (lift above the wheels' plane), not on the ground under it.
        pivot.set(0, lift, 0).applyQuaternion(root.quaternion).add(root.position);
        offset.set(0, distance * FLIGHT_FRAMING.chaseHeight, distance).applyQuaternion(head);
        camera.position.copy(pivot).add(offset);
        lookAt.set(0, distance * FLIGHT_FRAMING.chaseLookUp, -distance * FLIGHT_FRAMING.chaseLookAhead).applyQuaternion(head).add(pivot);
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
      if (shown !== 'cockpit') {
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

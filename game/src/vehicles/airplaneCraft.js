// The drawn parts of a fixed-wing aircraft of the fleet (catalog class 'airplane'), posed every
// frame from its physics state (physics/aircraft/Airplane.js: record.car.state and .input): the
// propeller and its blur disc, ailerons, elevator, rudder, elevons, stabilators and flaps
// deflecting, the gear legs folding by the asset's `gear_retract` extra, the door, canopy, belly
// hatch and ladder opening while the lead boards or leaves, and the lamps the cars do not have
// (beacon, strobe, landing, afterburner). Also where the lead boards, sits and looks out from:
// the model's anchors, or the catalog's flight.layout while the model is missing.
// Asset extras name axes in Blender's frame: x is the game's +X, y the game's -Z, z the game's +Y.
import * as THREE from 'three';
import { findNode } from '../assets/index.js';

/** Full deflections, radians. */
export const SURFACE_TRAVEL = Object.freeze({ aileron: 0.38, elevator: 0.42, rudder: 0.44, elevon: 0.36, stabilator: 0.3 });
/** Engine spool (state.rpm, 0..1) above which the blur disc replaces the propeller blades. */
const PROPELLER_BLUR_FROM = 0.3;
/** Propeller turns per second at full power (drawn, not physical). */
const PROPELLER_TURNS = 38;
/** Seconds a door, canopy or hatch takes to open, and how long it stays open after the lead left. */
const OPEN_SECONDS = 0.9;
const OPEN_HOLD = 2.5;
/** The lamp groups an aircraft has beyond the cars' (materials lamp_<group>). */
const AIR_LAMPS = ['lamp_beacon', 'lamp_strobe', 'lamp_landing', 'lamp_burner'];
const BLENDER_AXES = Object.freeze({ x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 0, -1), z: new THREE.Vector3(0, 1, 0) });
const AXIS_X = BLENDER_AXES.x;
const AXIS_Y = BLENDER_AXES.z;
const AXIS_Z = new THREE.Vector3(0, 0, 1);
const turn = new THREE.Quaternion();

/**
 * Finds the airplane's moving parts on its rig (after createVehicleRig).
 * @param {object} rig From createVehicleRig (rig.asset is null for the placeholder body).
 * @param {object} entry The vehicleCatalog entry (class 'airplane').
 * @returns {object} The craft record of an airplane.
 */
export function createAirplaneParts(rig, entry) {
  const near = rig.near;
  const extras = rig.asset?.extras ?? {};
  const part = (name) => {
    const node = findNode(near, name);
    return node ? { node, rest: node.quaternion.clone() } : null;
  };
  const hinged = (name, spec) => {
    const found = part(name);
    if (!found || !Array.isArray(spec) || !BLENDER_AXES[spec[0]]) return null;
    return { ...found, axis: BLENDER_AXES[spec[0]], angle: THREE.MathUtils.degToRad(Number(spec[1]) || 0) };
  };
  const retract = extras.gear_retract && typeof extras.gear_retract === 'object' ? extras.gear_retract : {};
  const lampMeshes = {};
  const lampLit = {};
  for (const name of AIR_LAMPS) { lampMeshes[name] = []; lampLit[name] = null; }
  near.traverse((node) => { if (node.isMesh && lampMeshes[node.material?.name]) lampMeshes[node.material.name].push(node); });
  const notches = entry.flight?.flapNotches ?? [0];
  const craft = {
    kind: 'airplane',
    lift: 0,
    boarding: airplaneBoardingPoints(rig.asset, entry),
    propeller: part('propeller'), propellerBlur: part('propeller_blur'),
    aileronL: part('aileron_l'), aileronR: part('aileron_r'), elevator: part('elevator'),
    rudders: [part('rudder'), part('rudder_l'), part('rudder_r')].filter(Boolean),
    flaps: [part('flap_l'), part('flap_r')].filter(Boolean),
    elevonL: part('elevon_l'), elevonR: part('elevon_r'),
    stabilatorL: part('stabilator_l'), stabilatorR: part('stabilator_r'),
    gear: ['gear_nose', 'gear_l', 'gear_r'].map((name) => hinged(name, retract[name])).filter(Boolean),
    openers: [hinged('door_fl', extras.door_open), hinged('canopy', extras.canopy_open), hinged('hatch', extras.hatch_open),
      hinged('ladder', extras.ladder_down)].filter(Boolean),
    flapTravel: THREE.MathUtils.degToRad(notches[notches.length - 1] || 0),
    asset: rig.asset ?? null,
    lampMeshes, lampLit,
    open: 0, openTarget: 0, openHold: 0,
    propellerAngle: 0, blurred: null, clock: 0,
    /** Smoothed stick and pedals as drawn (the keys step; the surfaces glide). */
    shown: { pitch: 0, roll: 0, yaw: 0 },
  };
  if (craft.propellerBlur?.node.isMesh) craft.propellerBlur.node.castShadow = false;
  showPropellerBlur(craft, false);
  return craft;
}

/**
 * Where the lead boards (on the ground), sits and looks out from, in model space (game axes).
 * @param {{anchors?: object} | null} asset The loaded model, or null.
 * @param {object} entry The vehicleCatalog entry.
 * @returns {{door: THREE.Vector3, seat: THREE.Vector3, eye: THREE.Vector3}}
 */
export function airplaneBoardingPoints(asset, entry) {
  const anchors = asset?.anchors ?? {};
  const layout = entry.flight?.layout ?? {};
  const eyeAt = layout.eye ?? { forward: 0, right: 0, up: (entry.dimensions?.height ?? 2) * 0.6 };
  const eye = anchors.anchor_camera ? anchors.anchor_camera.position.clone() : new THREE.Vector3(eyeAt.right, eyeAt.up, -eyeAt.forward);
  const seat = anchors.anchor_seat_driver ? anchors.anchor_seat_driver.position.clone() : new THREE.Vector3(eye.x, eye.y - 0.72, eye.z + 0.12);
  let door;
  if (anchors.anchor_door_driver) door = anchors.anchor_door_driver.position.clone();
  else if (layout.hatch) door = new THREE.Vector3(layout.hatch.right - 1.1, 0, -layout.hatch.forward);
  else door = new THREE.Vector3(eye.x - 1.7, 0, eye.z + 0.5);
  return { door, seat, eye };
}

/**
 * Opens (1) or shuts (0) the door, canopy or hatch with its ladder; it shuts itself a moment
 * after the lead has left.
 * @param {object} craft From createAirplaneParts.
 * @param {number} amount 0..1.
 */
export function setAirplaneOpen(craft, amount) {
  craft.openTarget = amount > 0.5 ? 1 : 0;
  craft.openHold = craft.openTarget ? OPEN_HOLD : 0;
}

/**
 * Poses the airplane's parts and switches its lamps for this frame (near level).
 * @param {object} craft From createAirplaneParts.
 * @param {object} body The Airplane (state, input, engineOn).
 * @param {number} dt Frame seconds.
 * @param {boolean} hasPilot Someone sits at the controls (an open canopy shuts).
 */
export function poseAirplaneRig(craft, body, dt, hasPilot) {
  const state = body.state;
  if (!state) return;
  const input = body.input ?? craft.shown;
  const shown = craft.shown;
  const ease = 1 - Math.exp(-12 * dt);
  shown.pitch += ((input.pitch || 0) - shown.pitch) * ease;
  shown.roll += ((input.roll || 0) - shown.roll) * ease;
  shown.yaw += ((input.yaw || 0) - shown.yaw) * ease;
  craft.clock += dt;

  // +angle about the game's X swings a trailing edge down; +angle about Y swings it to the right.
  spin(craft.elevator, AXIS_X, -shown.pitch * SURFACE_TRAVEL.elevator);
  spin(craft.aileronL, AXIS_X, shown.roll * SURFACE_TRAVEL.aileron);
  spin(craft.aileronR, AXIS_X, -shown.roll * SURFACE_TRAVEL.aileron);
  spin(craft.elevonL, AXIS_X, (-shown.pitch * 0.6 + shown.roll * 0.5) * SURFACE_TRAVEL.elevon);
  spin(craft.elevonR, AXIS_X, (-shown.pitch * 0.6 - shown.roll * 0.5) * SURFACE_TRAVEL.elevon);
  spin(craft.stabilatorL, AXIS_X, (-shown.pitch + shown.roll * 0.35) * SURFACE_TRAVEL.stabilator);
  spin(craft.stabilatorR, AXIS_X, (-shown.pitch - shown.roll * 0.35) * SURFACE_TRAVEL.stabilator);
  for (let i = 0; i < craft.rudders.length; i += 1) spin(craft.rudders[i], AXIS_Y, shown.yaw * SURFACE_TRAVEL.rudder);
  const flaps = (state.flaps || 0) * craft.flapTravel;
  for (let i = 0; i < craft.flaps.length; i += 1) spin(craft.flaps[i], AXIS_X, flaps);

  const folded = 1 - (typeof state.gear === 'number' ? state.gear : 1);
  for (let i = 0; i < craft.gear.length; i += 1) {
    const leg = craft.gear[i];
    spin(leg, leg.axis, leg.angle * smooth(folded));
    leg.node.visible = folded < 0.98;
  }

  // The door, canopy or hatch: open only standing on the ground; shut with a pilot aboard or after a moment.
  if (craft.openTarget && !hasPilot) {
    craft.openHold -= dt;
    if (craft.openHold <= 0) craft.openTarget = 0;
  }
  const wanted = craft.openTarget && state.onGround !== false && Math.abs(body.speed || 0) < 3 ? 1 : 0;
  const stepOpen = dt / OPEN_SECONDS;
  craft.open += Math.max(-stepOpen, Math.min(stepOpen, wanted - craft.open));
  for (let i = 0; i < craft.openers.length; i += 1) spin(craft.openers[i], craft.openers[i].axis, craft.openers[i].angle * smooth(craft.open));

  const rpm = state.rpm || 0;
  if (craft.propeller) {
    const blur = rpm > PROPELLER_BLUR_FROM;
    showPropellerBlur(craft, blur);
    craft.propellerAngle = (craft.propellerAngle + rpm * PROPELLER_TURNS * Math.PI * 2 * dt * (blur ? 0.03 : 1)) % (Math.PI * 2);
    spin(blur && craft.propellerBlur ? craft.propellerBlur : craft.propeller, AXIS_Z, -craft.propellerAngle);
  }

  const running = Boolean(body.engineOn) && !state.crashed;
  setAirLamp(craft, 'lamp_beacon', running && craft.clock % 1.2 < 0.16);
  const strobe = craft.clock % 1.4;
  setAirLamp(craft, 'lamp_strobe', running && state.onGround === false && (strobe < 0.06 || (strobe > 0.14 && strobe < 0.2)));
  setAirLamp(craft, 'lamp_landing', running && folded < 0.1);
  setAirLamp(craft, 'lamp_burner', running && (state.afterburner || 0) > 0.05);
}

function setAirLamp(craft, name, on) {
  if (craft.lampLit[name] === on) return;
  craft.lampLit[name] = on;
  const list = craft.lampMeshes[name];
  if (!craft.asset || typeof craft.asset.lampMaterial !== 'function') return;
  for (let i = 0; i < list.length; i += 1) list[i].material = craft.asset.lampMaterial(name, on);
}

function showPropellerBlur(craft, blur) {
  if (craft.blurred === blur) return;
  craft.blurred = blur;
  if (craft.propeller) craft.propeller.node.visible = !blur || !craft.propellerBlur;
  if (craft.propellerBlur) craft.propellerBlur.node.visible = blur;
}

function smooth(t) {
  const a = t < 0 ? 0 : t > 1 ? 1 : t;
  return a * a * (3 - 2 * a);
}

function spin(part, axis, angle) {
  if (!part) return;
  turn.setFromAxisAngle(axis, angle);
  part.node.quaternion.copy(part.rest).multiply(turn);
}

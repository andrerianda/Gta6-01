// The lamps and doors of one vehicle. Lamps: the lamp_* materials of its model switched on and
// off (headlamps, tail lamps, brake lamps, reversing lamps, indicators, and the two siren halves
// lamp_siren_a / lamp_siren_b, which only their owner switches), and real lights through the
// atmosphere's addLight while the car is near: a headlamp spot that lights the road at night
// and a red rear lamp that brightens when braking. Doors: door_fl / door_fr (and door_rl /
// door_rr where a model has them) swing about their hinge at the node origin, eased towards the
// amount asked for.
import * as THREE from 'three';
import { findNode } from '../assets/index.js';
import { placeholderLampMaterial } from './placeholderVehicleModel.js';

const GROUPS = ['lamp_head', 'lamp_tail', 'lamp_brake', 'lamp_reverse', 'lamp_indicator_l', 'lamp_indicator_r', 'lamp_siren_a', 'lamp_siren_b'];
/** Door nodes by side: front left, front right, rear left, rear right. */
export const DOOR_SIDES = Object.freeze({ fl: 'door_fl', fr: 'door_fr', rl: 'door_rl', rr: 'door_rr' });
const SIDE_ALIASES = { driver: 'fl', passenger: 'fr', left: 'fl', right: 'fr', rear_left: 'rl', rear_right: 'rr' };
/** A fully open door's swing, radians (about 62 degrees). */
const DOOR_SWING = 1.08;
/** Door travel per second, as a fraction of fully open (a full swing in about 0.4 s). */
const DOOR_RATE = 2.6;
const scratch = new THREE.Vector3();
const scratchB = new THREE.Vector3();
const forward = new THREE.Vector3();
const swing = new THREE.Quaternion();
const up = new THREE.Vector3(0, 1, 0);
/**
 * The rear light (candela) with the tail lamps on, braking, and its reach (metres). QA bug 6:
 * at 6 / 20 cd it still lit a person standing behind a car bright red at night (night2.jpg), so
 * the rear lamp is now carried by its lens and glow sprite, with only a faint real light and no
 * ground pool. Glow sprite brightness with the tail lamps on and braking.
 */
const TAIL_LIGHT = 1.2;
const BRAKE_LIGHT = 3.5;
const REAR_RANGE = 2.5;
const TAIL_GLOW = 0.55;
const BRAKE_GLOW = 1.1;
/** Headlamps aim this far below the horizon (radians): about four degrees. */
const HEADLAMP_DIP = 0.07;

/**
 * Collects the lamp meshes of a rig, by lamp group (the near level; the merged levels light
 * their lamps through their material, see vehicleMergedLevels.js).
 * @param {object} rig From createVehicleRig.
 * @returns {object} The lamp state: groups of meshes, what is lit, and the real lights.
 */
export function createVehicleLamps(rig) {
  const meshes = {};
  for (const name of GROUPS) meshes[name] = [];
  rig.near.traverse((node) => {
    if (node.isMesh && meshes[node.material?.name]) meshes[node.material.name].push(node);
  });
  const lit = {};
  for (const name of GROUPS) lit[name] = null;
  return { rig, meshes, lit, headLight: null, rearLight: null, blink: 0 };
}

/**
 * Lights or darkens one lamp group (only touches materials when the state changes).
 * @param {object} lamps From createVehicleLamps.
 * @param {string} name A lamp material name ("lamp_brake").
 * @param {boolean} on True to light it.
 * @returns {boolean} False when the group is not one of the fleet's.
 */
export function setVehicleLamp(lamps, name, on) {
  if (!(name in lamps.lit)) return false;
  if (lamps.lit[name] === on) return true;
  lamps.lit[name] = on;
  const asset = lamps.rig.asset;
  const list = lamps.meshes[name];
  for (let i = 0; i < list.length; i += 1) {
    list[i].material = asset ? asset.lampMaterial(name, on) : placeholderLampMaterial(name, on);
  }
  return true;
}

/**
 * The siren bits of the merged levels: 1 when lamp_siren_a is lit, 2 when lamp_siren_b is.
 * @param {object} lamps From createVehicleLamps.
 * @returns {number}
 */
export function sirenBitsOf(lamps) {
  return (lamps.lit.lamp_siren_a ? 1 : 0) | (lamps.lit.lamp_siren_b ? 2 : 0);
}

function midpoint(rig, a, b, out, fallbackZ) {
  const anchorA = rig.anchors[a];
  const anchorB = rig.anchors[b];
  if (anchorA && anchorB) return out.addVectors(anchorA, anchorB).multiplyScalar(0.5);
  return out.set(0, 0.7, fallbackZ);
}

/**
 * Updates the lamps for this frame.
 * @param {object} lamps From createVehicleLamps.
 * @param {object} atmosphere context.atmosphere (may be null).
 * @param {{head: boolean, brake: boolean, reverse: boolean, hazard: boolean, near: boolean,
 *   important: boolean, groundY: number, length: number, dt: number}} wanted What to show.
 */
export function updateVehicleLamps(lamps, atmosphere, wanted) {
  setVehicleLamp(lamps, 'lamp_head', wanted.head);
  setVehicleLamp(lamps, 'lamp_tail', wanted.head);
  setVehicleLamp(lamps, 'lamp_brake', wanted.brake);
  setVehicleLamp(lamps, 'lamp_reverse', wanted.reverse);
  lamps.blink = (lamps.blink + wanted.dt) % 0.8;
  const blinkOn = wanted.hazard && lamps.blink < 0.4;
  setVehicleLamp(lamps, 'lamp_indicator_l', blinkOn);
  setVehicleLamp(lamps, 'lamp_indicator_r', blinkOn);
  if (!atmosphere || typeof atmosphere.addLight !== 'function') return;
  const showLights = wanted.near && (wanted.head || wanted.brake);
  if (!showLights) {
    releaseVehicleLights(lamps, atmosphere);
    return;
  }
  const root = lamps.rig.root;
  if (!lamps.headLight) {
    lamps.headLight = atmosphere.addLight({
      kind: 'spot', position: [0, 0, 0], direction: [0, -0.07, -1], color: 0xfff0d8, intensity: 900,
      range: 42, angle: 0.42, penumbra: 0.55, importance: wanted.important ? 3 : 1, nightOnly: true, groundY: wanted.groundY, beam: 0.12,
    });
    // The tail lamps glow on their lenses (emissive) and in a small glow sprite; this light is
    // faint, rarely real (low importance) and draws no ground pool (QA bug 6: it was a 7 m red
    // floodlight, then still a red wash on people behind the car).
    lamps.rearLight = atmosphere.addLight({
      kind: 'point', position: [0, 0, 0], color: 0xff2418, intensity: TAIL_LIGHT, range: REAR_RANGE, importance: 0.1,
      nightOnly: true, groundY: wanted.groundY, pool: false, glow: TAIL_GLOW, glowSize: 0.42,
    });
  }
  midpoint(lamps.rig, 'anchor_light_head_l', 'anchor_light_head_r', scratch, -wanted.length / 2);
  root.localToWorld(lamps.headLight.position.copy(scratch));
  forward.set(0, -Math.sin(HEADLAMP_DIP), -Math.cos(HEADLAMP_DIP)).transformDirection(root.matrixWorld);
  lamps.headLight.direction.copy(forward);
  lamps.headLight.intensity = wanted.head ? 900 : 0;
  lamps.headLight.groundY = wanted.groundY;
  midpoint(lamps.rig, 'anchor_light_tail_l', 'anchor_light_tail_r', scratchB, wanted.length / 2);
  root.localToWorld(lamps.rearLight.position.copy(scratchB));
  lamps.rearLight.intensity = wanted.brake ? BRAKE_LIGHT : wanted.head ? TAIL_LIGHT : 0;
  lamps.rearLight.glow = wanted.brake ? BRAKE_GLOW : TAIL_GLOW;
  lamps.rearLight.groundY = wanted.groundY;
}

/**
 * Gives the vehicle's real lights back to the atmosphere (far away, removed or wrecked).
 * @param {object} lamps From createVehicleLamps.
 * @param {object} atmosphere context.atmosphere.
 */
export function releaseVehicleLights(lamps, atmosphere) {
  if (lamps.headLight && atmosphere) atmosphere.removeLight(lamps.headLight);
  if (lamps.rearLight && atmosphere) atmosphere.removeLight(lamps.rearLight);
  lamps.headLight = null;
  lamps.rearLight = null;
}

/**
 * Finds the doors of a rig.
 * @param {object} rig From createVehicleRig.
 * @returns {Record<string, {node: THREE.Object3D, rest: THREE.Quaternion, sign: number,
 *   amount: number, target: number}>} The doors by side (fl, fr, rl, rr), only those it has.
 */
export function createVehicleDoors(rig) {
  const doors = {};
  for (const side in DOOR_SIDES) {
    const node = findNode(rig.near, DOOR_SIDES[side]);
    // A left door (-X) swings its rear edge outwards to -X: a negative turn about +Y.
    if (node) doors[side] = { node, rest: node.quaternion.clone(), sign: side.endsWith('l') ? -1 : 1, amount: 0, target: 0 };
  }
  return doors;
}

/**
 * The door key for a side name: fl, fr, rl, rr, or driver, passenger, left, right, rear_left,
 * rear_right.
 * @param {string} side The side asked for.
 * @returns {string | null}
 */
export function doorSideOf(side) {
  const key = SIDE_ALIASES[side] ?? side;
  return key in DOOR_SIDES ? key : null;
}

/**
 * Eases every door towards its target and poses it (near level).
 * @param {object} doors From createVehicleDoors.
 * @param {number} dt Frame seconds.
 */
export function poseVehicleDoors(doors, dt) {
  for (const side in doors) {
    const door = doors[side];
    if (door.amount === door.target) continue;
    const step = DOOR_RATE * dt;
    door.amount = Math.abs(door.target - door.amount) <= step ? door.target : door.amount + Math.sign(door.target - door.amount) * step;
    // Ease out at both ends of the swing.
    const eased = door.amount * door.amount * (3 - 2 * door.amount);
    swing.setFromAxisAngle(up, door.sign * eased * DOOR_SWING);
    door.node.quaternion.copy(door.rest).premultiply(swing);
  }
}

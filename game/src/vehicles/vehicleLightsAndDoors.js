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
import { trackVehicleMaterial } from './vehicleNightReflections.js';

const GROUPS = [
  'lamp_head', 'lamp_tail', 'lamp_brake', 'lamp_reverse', 'lamp_indicator_l', 'lamp_indicator_r', 'lamp_siren_a', 'lamp_siren_b',
  'lamp_nav_red', 'lamp_nav_green',
];
/** Door nodes by side: front left, front right, rear left, rear right. */
export const DOOR_SIDES = Object.freeze({ fl: 'door_fl', fr: 'door_fr', rl: 'door_rl', rr: 'door_rr' });
const SIDE_ALIASES = { driver: 'fl', passenger: 'fr', left: 'fl', right: 'fr', rear_left: 'rl', rear_right: 'rr' };
/** A fully open door's swing, radians (about 62 degrees). */
const DOOR_SWING = 1.08;
/** Door travel per second, as a fraction of fully open (a full swing in about 0.4 s). */
const DOOR_RATE = 2.6;
const scratch = new THREE.Vector3();
const forward = new THREE.Vector3();
const swing = new THREE.Quaternion();
const up = new THREE.Vector3(0, 1, 0);
/**
 * The tail lamps are carried by their lenses: no real rear light (QA bug 6: at 6 / 20 cd it lit a
 * person behind a car bright red; at 1.2 / 3.5 cd it still left a red wash on the road).
 * QA bug 5: the glow sprites were the red pool and the white column. The atmosphere draws a glow
 * sprite stepped up to 0.4 m toward the camera, so the rear light's 0.42 m sprite at the middle
 * of the tail spilled over the bumper onto the road, and the headlamp spot's default 0.8 m sprite
 * at the middle of the nose rose over the hood and roof seen from behind. Now neither real light
 * has a sprite; each tail lens has its own small glow-only marker (importance 0: never a real
 * light, no pool), which also leaves a thin red streak on a wet road.
 */
const TAIL_GLOW = 0.5;
const BRAKE_GLOW = 1.0;
/** Radius of a tail lens's glow marker, metres (a lamp cluster is about 25 cm across). */
const LENS_GLOW_SIZE = 0.12;
const LENS_ANCHORS = ['anchor_light_tail_l', 'anchor_light_tail_r'];
/** Headlamps aim this far below the horizon (radians): about four degrees. */
const HEADLAMP_DIP = 0.07;
/** The headlamp spot's strength (candela-like, atmosphere lights) with nothing close ahead. */
const HEADLAMP_INTENSITY = 900;
/** Gap ahead (bumper to bumper, metres) from which the beam is at full strength. */
export const BEAM_FULL_GAP = 9;

/**
 * Share of the headlamp beam kept when another vehicle stands `gap` metres ahead. The spot falls
 * off with the square of distance, so a car queued 1-3 m behind the player's lit its rear into a
 * white blob at night exposure (QA districts tour, port and Isla Coral, shift 11): the beam is
 * scaled so the lit surface ahead is never brighter than at BEAM_FULL_GAP.
 * @param {number} gap Metres from this car's nose to the vehicle ahead (Infinity: none).
 * @returns {number} 0.02..1
 */
export function headlampBeamScale(gap) {
  if (!(gap < BEAM_FULL_GAP)) return 1;
  const share = Math.max(gap, 0.3) / BEAM_FULL_GAP;
  return Math.max(0.02, share * share);
}

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
  return { rig, meshes, lit, headLight: null, rearLight: null, lensGlows: null, blink: 0 };
}

/**
 * Where a tail lens is in the model: its anchor, or a corner of the tail when it has none.
 * @param {object} rig From createVehicleRig.
 * @param {number} side 0 left, 1 right.
 * @param {number} length The car's length, metres.
 * @param {THREE.Vector3} out Receives the point.
 * @returns {THREE.Vector3}
 */
export function tailLensPoint(rig, side, length, out) {
  const anchor = rig.anchors[LENS_ANCHORS[side]];
  if (anchor) return out.copy(anchor);
  return out.set(side === 0 ? -0.62 : 0.62, 0.8, length / 2);
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
    // The lit/unlit lamp materials are metallic too: they lose the night's sky reflection like the paint.
    trackVehicleMaterial(list[i].material);
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
  // Boats and helicopters: the port and starboard navigation lights burn with the running lights.
  setVehicleLamp(lamps, 'lamp_nav_red', wanted.head);
  setVehicleLamp(lamps, 'lamp_nav_green', wanted.head);
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
    // No glow sprite: the lit lenses and the bloom show the headlamps (QA bug 5).
    lamps.headLight = atmosphere.addLight({
      kind: 'spot', position: [0, 0, 0], direction: [0, -0.07, -1], color: 0xfff0d8, intensity: 900,
      range: 42, angle: 0.42, penumbra: 0.55, importance: wanted.important ? 3 : 1, nightOnly: true, groundY: wanted.groundY, beam: 0.12, glow: 0,
    });
    // No real rear light any more: even at 3.5 cd and 2.5 m it left a red wash on the asphalt
    // beside a braking car at night exposure (glowF.jpg, 18 Nov 10:06). The lenses carry it.
    lamps.lensGlows = LENS_ANCHORS.map(() => atmosphere.addLight({
      kind: 'point', position: [0, 0, 0], color: 0xff2a1c, intensity: 1, range: 0.5, importance: 0,
      nightOnly: true, groundY: wanted.groundY, pool: false, glow: TAIL_GLOW, glowSize: LENS_GLOW_SIZE,
    }));
  }
  midpoint(lamps.rig, 'anchor_light_head_l', 'anchor_light_head_r', scratch, -wanted.length / 2);
  root.localToWorld(lamps.headLight.position.copy(scratch));
  forward.set(0, -Math.sin(HEADLAMP_DIP), -Math.cos(HEADLAMP_DIP)).transformDirection(root.matrixWorld);
  lamps.headLight.direction.copy(forward);
  lamps.headLight.intensity = wanted.head ? HEADLAMP_INTENSITY * (wanted.beam ?? 1) : 0;
  lamps.headLight.groundY = wanted.groundY;
  for (let side = 0; side < lamps.lensGlows.length; side += 1) {
    const glow = lamps.lensGlows[side];
    root.localToWorld(tailLensPoint(lamps.rig, side, wanted.length, glow.position));
    glow.intensity = wanted.brake || wanted.head ? 1 : 0;
    glow.glow = wanted.brake ? BRAKE_GLOW : TAIL_GLOW;
    glow.groundY = wanted.groundY;
  }
}

/**
 * Gives the vehicle's real lights back to the atmosphere (far away, removed or wrecked).
 * @param {object} lamps From createVehicleLamps.
 * @param {object} atmosphere context.atmosphere.
 */
export function releaseVehicleLights(lamps, atmosphere) {
  if (lamps.headLight && atmosphere) atmosphere.removeLight(lamps.headLight);
  if (lamps.rearLight && atmosphere) atmosphere.removeLight(lamps.rearLight);
  if (lamps.lensGlows && atmosphere) for (const glow of lamps.lensGlows) atmosphere.removeLight(glow);
  lamps.headLight = null;
  lamps.rearLight = null;
  lamps.lensGlows = null;
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

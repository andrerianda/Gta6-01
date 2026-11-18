// The lamps of one vehicle: the lamp_* materials of its model switched on and off (headlamps,
// tail lamps, brake lamps, reversing lamps, indicators), and real lights through the
// atmosphere's addLight while the car is near: a headlamp spot that lights the road at night
// and a red rear lamp that brightens when braking. Doors open with the seats (later).
import * as THREE from 'three';
import { placeholderLampMaterial } from './placeholderVehicleModel.js';

const GROUPS = ['lamp_head', 'lamp_tail', 'lamp_brake', 'lamp_reverse', 'lamp_indicator_l', 'lamp_indicator_r'];
const scratch = new THREE.Vector3();
const scratchB = new THREE.Vector3();
const forward = new THREE.Vector3();
/** Headlamps aim this far below the horizon (radians): about four degrees. */
const HEADLAMP_DIP = 0.07;

/**
 * Collects the lamp meshes of a rig, by lamp group.
 * @param {object} rig From createVehicleRig.
 * @returns {object} The lamp state: groups of meshes, what is lit, and the real lights.
 */
export function createVehicleLamps(rig) {
  const meshes = {};
  for (const name of GROUPS) meshes[name] = [];
  for (const level of [rig.near, rig.far]) {
    if (!level) continue;
    level.traverse((node) => {
      if (node.isMesh && meshes[node.material?.name]) meshes[node.material.name].push(node);
    });
  }
  const lit = {};
  for (const name of GROUPS) lit[name] = null;
  return { rig, meshes, lit, headLight: null, rearLight: null, blink: 0 };
}

/**
 * Lights or darkens one lamp group (only touches materials when the state changes).
 * @param {object} lamps From createVehicleLamps.
 * @param {string} name A lamp material name ("lamp_brake").
 * @param {boolean} on True to light it.
 */
export function setVehicleLamp(lamps, name, on) {
  if (lamps.lit[name] === on) return;
  lamps.lit[name] = on;
  const asset = lamps.rig.asset;
  const list = lamps.meshes[name];
  for (let i = 0; i < list.length; i += 1) {
    list[i].material = asset ? asset.lampMaterial(name, on) : placeholderLampMaterial(name, on);
  }
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
      range: 42, angle: 0.42, penumbra: 0.55, importance: wanted.important ? 3 : 1, nightOnly: true, groundY: wanted.groundY, beam: 0.35,
    });
    lamps.rearLight = atmosphere.addLight({
      kind: 'point', position: [0, 0, 0], color: 0xff2418, intensity: 40, range: 7, importance: 0.5,
      nightOnly: true, groundY: wanted.groundY, glow: 0.8, glowSize: 0.5,
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
  lamps.rearLight.intensity = wanted.brake ? 140 : wanted.head ? 35 : 0;
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

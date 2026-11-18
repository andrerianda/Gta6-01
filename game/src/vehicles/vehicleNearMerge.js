// The near level of a car in a handful of draws. A near car's model is about 31 to 42 meshes
// (body, hood, trunk, bumpers, light bar, steering wheel and every lamp group, each split per
// material). For a car that is undamaged and not the player's, its static parts are drawn as ONE
// merged mesh (vehicleMergedLevels.js role attributes: atlas, paint with the clear coat on the
// paint only, lamps lit through the material state) and each door as one merged mesh under its
// own hinge node, so the doors still swing; the wheels (spinning, steering) and the windows
// (see-through, breakable) stay separate. That is about 11 draws instead of 32 to 42. A crash,
// a dropped bumper, a broken window or charring switch the car back to its separate parts (dents
// work on those); a repair merges it again. Merged geometry is built once per asset and shared.
import * as THREE from 'three';
import { findNode } from '../assets/index.js';
import { mergeVehicleParts, mergedVehicleMaterial } from './vehicleMergedLevels.js';

/** Nodes that move or break on their own and are never merged into the body. */
const MOVING = /^(wheel_|door_|window_)/;
const DOORS = ['door_fl', 'door_fr', 'door_rl', 'door_rr'];
/** @type {WeakMap<object, {body: object, doors: Record<string, object>}>} */
const partsByAsset = new WeakMap();

function moving(node, stop) {
  for (let each = node; each && each !== stop; each = each.parent) if (MOVING.test(each.name)) return true;
  return false;
}

function meshesOf(root, keep) {
  const found = [];
  root.traverse((node) => {
    if (node.isMesh && node.geometry?.attributes?.position && keep(node)) found.push(node);
  });
  return found;
}

/**
 * The merged near geometry of an asset: the body (static parts, in the lod0 node's space) and
 * each door (in its hinge node's space). Built on first use, then shared by every car.
 * @param {import('../assets/Asset.js').Asset} asset A loaded vehicle asset.
 * @returns {{body: {geometry: THREE.BufferGeometry, map: THREE.Texture | null}, doors: Record<string, {geometry: THREE.BufferGeometry, map: THREE.Texture | null}>}}
 */
export function nearMergedParts(asset) {
  let parts = partsByAsset.get(asset);
  if (parts) return parts;
  const instance = asset.instantiate({ lod: 0 });
  instance.updateMatrixWorld(true);
  const body = findNode(instance, 'lod0') ?? instance;
  parts = { body: mergeVehicleParts(meshesOf(body, (node) => !moving(node, body)), body), doors: {} };
  for (const name of DOORS) {
    const node = findNode(instance, name);
    const meshes = node ? meshesOf(node, () => true) : [];
    if (meshes.length) parts.doors[name] = mergeVehicleParts(meshes, node);
  }
  partsByAsset.set(asset, parts);
  return parts;
}

/**
 * Adds the merged near meshes to a car's near level (hidden until setNearMerged turns them on).
 * @param {object} rig From createVehicleRig (with an asset).
 * @param {string} colour The paint.
 * @returns {{originals: THREE.Mesh[], merged: THREE.Mesh[], active: boolean, colour: string | null, bits: number}}
 */
export function createNearMerge(rig, colour) {
  const parts = nearMergedParts(rig.asset);
  const bodyNode = findNode(rig.near, 'lod0') ?? rig.near;
  const originals = meshesOf(bodyNode, (node) => !moving(node, bodyNode));
  const merged = [];
  const add = (parent, part, name) => {
    const mesh = new THREE.Mesh(part.geometry, mergedVehicleMaterial(rig.asset, part, colour, false, 0, 0, true));
    mesh.name = name;
    mesh.userData.merged = part;
    mesh.castShadow = false; // the near level casts through its one merged shadow caster
    mesh.receiveShadow = true;
    mesh.visible = false;
    parent.add(mesh);
    merged.push(mesh);
  };
  for (const name in parts.doors) {
    const node = findNode(rig.near, name);
    if (!node) continue;
    originals.push(...meshesOf(node, () => true));
    add(node, parts.doors[name], `near_merged_${name}`);
  }
  add(bodyNode, parts.body, 'near_merged_body');
  return { originals, merged, active: false, colour: null, bits: -1 };
}

/**
 * Shows the merged near meshes (true) or the separate parts (false); cheap when unchanged.
 * @param {object} rig From createVehicleRig.
 * @param {boolean} on True to draw the merged meshes.
 */
export function setNearMerged(rig, on) {
  const merge = rig.nearMerge;
  if (!merge || merge.active === on) return;
  merge.active = on;
  merge.bits = -1;
  for (const mesh of merge.originals) mesh.visible = !on;
  for (const mesh of merge.merged) mesh.visible = on;
}

/**
 * Brings the merged near meshes' paint and lamps up to date with the car (the lamp groups lit in
 * createVehicleLamps' state); swaps materials only when something changed.
 * @param {object} rig From createVehicleRig.
 * @param {string} colour The paint.
 * @param {{lit: Record<string, boolean | null>}} lamps From createVehicleLamps.
 */
export function setNearMergedLook(rig, colour, lamps) {
  const merge = rig.nearMerge;
  if (!merge || !merge.active) return;
  const lit = lamps.lit;
  const bits = (lit.lamp_head || lit.lamp_tail ? 1 : 0) | (lit.lamp_siren_a ? 2 : 0) | (lit.lamp_siren_b ? 4 : 0)
    | (lit.lamp_brake ? 8 : 0) | (lit.lamp_reverse ? 16 : 0) | (lit.lamp_indicator_l ? 32 : 0) | (lit.lamp_indicator_r ? 64 : 0);
  if (bits === merge.bits && colour === merge.colour) return;
  merge.bits = bits;
  merge.colour = colour;
  for (const mesh of merge.merged) {
    mesh.material = mergedVehicleMaterial(rig.asset, mesh.userData.merged, colour, bits & 1, (bits >> 1) & 3, bits >> 3, true);
  }
}

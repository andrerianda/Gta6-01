// The near level of a car in a handful of draws. A near car's model is about 31 to 42 meshes
// (body, hood, trunk, bumpers, light bar, steering wheel and every lamp group, each split per
// material, plus doors, wheels and windows). For a car that is undamaged and not the player's the
// near level is drawn in one of three merged modes (vehicleMergedLevels.js role attributes: atlas,
// paint with the clear coat on the paint only, lamps lit through the material state):
//   OPEN    a door is open or moving: the static parts as one mesh, each door as one mesh under
//           its own hinge node (so it swings, its panes too), the wheels apart, the windows as
//           one glass mesh;
// The door panes always keep their own see-through glass material (shift 11: merged into the
// door's opaque role mesh, every traffic car's front side windows read black).
//   CLOSED  every door shut: the static parts and the doors as one mesh, the wheels apart (they
//           roll and steer), one glass mesh: 1 + wheels + 1 draws (7 for a car, 4 for a bike);
//   STILL   every door shut and the physics body asleep (parked, waiting): body, doors and wheels
//           as one mesh seated on the road, and one glass mesh: 2 draws.
// PARTS shows the separate parts: a crash, a dropped bumper, a broken window or charring switch
// the car to it (dents work on those); a repair merges it again. A motorcycle's fork steers, so it
// is running gear like the wheels. Merged geometry is built once per asset and shared.
import * as THREE from 'three';
import { findNode } from '../assets/index.js';
import { mergeVehicleParts, mergedVehicleMaterial } from './vehicleMergedLevels.js';

/** What the near level draws: see the header. */
export const NEAR_MODE = Object.freeze({ PARTS: 0, OPEN: 1, CLOSED: 2, STILL: 3 });
const DOORS = ['door_fl', 'door_fr', 'door_rl', 'door_rr'];
/** @type {WeakMap<object, object>} */
const partsByAsset = new WeakMap();

/**
 * The kind of a mesh of the lod0 node: 'door' (anything under a door, its glass too), 'gear'
 * (wheels, a bike's fork), 'window' (body glass, breakable) or 'static'.
 * @param {THREE.Object3D} node A mesh.
 * @param {THREE.Object3D} stop The lod0 node.
 * @returns {'door' | 'gear' | 'window' | 'static'}
 */
export function nearPartKind(node, stop) {
  let door = false;
  let gear = false;
  let window = false;
  for (let each = node; each && each !== stop; each = each.parent) {
    const name = each.name ?? '';
    if (name.startsWith('door_')) door = true;
    else if (name.startsWith('wheel_') || name.startsWith('fork')) gear = true;
    else if (name.startsWith('window_')) window = true;
  }
  return door ? 'door' : gear ? 'gear' : window ? 'window' : 'static';
}

function meshesOf(root) {
  const found = [];
  root.traverse((node) => {
    if (node.isMesh && node.geometry?.attributes?.position) found.push(node);
  });
  return found;
}

/** Glass that stays see-through in the merged modes (lamp lenses merge with the body). */
const isPaneGlass = (mesh) => /^glass(_rear|_roof)?$/.test(mesh.material?.name ?? '');

function sortedParts(body) {
  // doorGlass: the panes in the doors (also listed under door, which PARTS shows). The merged
  // modes draw them with their own glass material, not in the door's opaque role mesh (the
  // side glass read dark and solid from outside on every traffic car).
  const kinds = { static: [], door: [], gear: [], window: [], doorGlass: [] };
  for (const mesh of meshesOf(body)) {
    const kind = nearPartKind(mesh, body);
    kinds[kind].push(mesh);
    if (kind === 'door' && isPaneGlass(mesh)) kinds.doorGlass.push(mesh);
  }
  return kinds;
}

function glassGroups(meshes, space) {
  const byMaterial = new Map();
  for (const mesh of meshes) {
    const name = mesh.material?.name ?? '';
    if (!byMaterial.has(name)) byMaterial.set(name, []);
    byMaterial.get(name).push(mesh);
  }
  return [...byMaterial].map(([materialName, list]) => ({ materialName, part: mergeVehicleParts(list, space) }));
}

/**
 * The merged near geometry of an asset, built on first use and shared by every car: body (static
 * parts), each door (in its hinge's space), closed (body and doors), still (body, doors and
 * running gear), and the body windows grouped by glass material.
 * @param {import('../assets/Asset.js').Asset} asset A loaded vehicle asset.
 * @returns {{body: object, doors: Record<string, object>, closed: object, still: object,
 *   glass: {materialName: string, part: object}[]}} Each part is {geometry, map}.
 */
export function nearMergedParts(asset) {
  let parts = partsByAsset.get(asset);
  if (parts) return parts;
  const instance = asset.instantiate({ lod: 0 });
  instance.updateMatrixWorld(true);
  const body = findNode(instance, 'lod0') ?? instance;
  const kinds = sortedParts(body);
  const doorSolid = kinds.door.filter((mesh) => !kinds.doorGlass.includes(mesh));
  parts = {
    body: mergeVehicleParts(kinds.static, body),
    doors: {},
    closed: doorSolid.length ? mergeVehicleParts([...kinds.static, ...doorSolid], body) : null,
    still: mergeVehicleParts([...kinds.static, ...doorSolid, ...kinds.gear], body),
    // Body windows (OPEN: the door panes swing with their doors, doorGlass below).
    glass: glassGroups(kinds.window, body),
    // Body windows and the door panes, doors shut (CLOSED, STILL).
    glassClosed: glassGroups([...kinds.window, ...kinds.doorGlass], body),
    /** Each door's panes in its hinge's space. */
    doorGlass: {},
  };
  parts.closed ??= parts.body;
  for (const name of DOORS) {
    const node = findNode(instance, name);
    const meshes = node ? meshesOf(node) : [];
    const solid = meshes.filter((mesh) => !isPaneGlass(mesh));
    const panes = meshes.filter(isPaneGlass);
    if (solid.length) parts.doors[name] = mergeVehicleParts(solid, node);
    if (panes.length) parts.doorGlass[name] = glassGroups(panes, node);
  }
  partsByAsset.set(asset, parts);
  return parts;
}

/**
 * Adds the merged near meshes to a car's near level (hidden until setNearMerged turns them on).
 * @param {object} rig From createVehicleRig (with an asset).
 * @param {string} colour The paint.
 * @returns {object} The merge state of the rig (rig.nearMerge).
 */
export function createNearMerge(rig, colour) {
  const parts = nearMergedParts(rig.asset);
  const bodyNode = findNode(rig.near, 'lod0') ?? rig.near;
  const kinds = sortedParts(bodyNode);
  const merge = {
    kinds, role: [], open: [], closed: [], still: [], stillNode: new THREE.Group(),
    mode: NEAR_MODE.PARTS, active: false, colour: null, bits: -1,
  };
  merge.stillNode.name = 'near_merged_still';
  bodyNode.add(merge.stillNode);
  const addRole = (parent, part, name, lists) => {
    const mesh = new THREE.Mesh(part.geometry, mergedVehicleMaterial(rig.asset, part, colour, false, 0, 0, true));
    mesh.name = name;
    mesh.userData.merged = part;
    mesh.castShadow = false; // the near level casts through its one merged shadow caster
    mesh.receiveShadow = true;
    mesh.visible = false;
    parent.add(mesh);
    merge.role.push(mesh);
    for (const list of lists) list.push(mesh);
  };
  const panes = [...kinds.window, ...kinds.doorGlass];
  const addGlass = (parent, groups, lists) => {
    for (const { materialName, part } of groups) {
      const source = panes.find((mesh) => mesh.material?.name === materialName) ?? panes[0];
      if (!source) continue;
      const mesh = new THREE.Mesh(part.geometry, source.material);
      mesh.name = `near_merged_glass_${materialName}`;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.renderOrder = source.renderOrder;
      mesh.visible = false;
      parent.add(mesh);
      for (const list of lists) list.push(mesh);
    }
  };
  for (const name in parts.doors) {
    const node = findNode(rig.near, name);
    if (node) addRole(node, parts.doors[name], `near_merged_${name}`, [merge.open]);
  }
  for (const name in parts.doorGlass) {
    const node = findNode(rig.near, name);
    if (node) addGlass(node, parts.doorGlass[name], [merge.open]);
  }
  addRole(bodyNode, parts.body, 'near_merged_body', [merge.open]);
  if (parts.closed !== parts.body) addRole(bodyNode, parts.closed, 'near_merged_closed', [merge.closed]);
  else merge.closed.push(merge.role[merge.role.length - 1]);
  addGlass(bodyNode, parts.glass, [merge.open]);
  addGlass(bodyNode, parts.glassClosed, [merge.closed]);
  addRole(merge.stillNode, parts.still, 'near_merged_still_body', [merge.still]);
  addGlass(merge.stillNode, parts.glassClosed, [merge.still]);
  return merge;
}

function show(list, on) {
  for (let i = 0; i < list.length; i += 1) list[i].visible = on;
}

/**
 * Chooses what the near level draws; cheap when unchanged.
 * @param {object} rig From createVehicleRig.
 * @param {number | boolean} mode A NEAR_MODE (true means OPEN, false PARTS).
 */
export function setNearMerged(rig, mode) {
  const merge = rig.nearMerge;
  const wanted = mode === true ? NEAR_MODE.OPEN : mode === false ? NEAR_MODE.PARTS : mode;
  if (!merge || merge.mode === wanted) return;
  merge.mode = wanted;
  merge.active = wanted !== NEAR_MODE.PARTS;
  merge.bits = -1;
  const { kinds } = merge;
  const parts = wanted === NEAR_MODE.PARTS;
  show(kinds.static, parts);
  show(kinds.door, parts);
  show(kinds.window, parts);
  show(kinds.gear, wanted !== NEAR_MODE.STILL);
  show(merge.open, false);
  show(merge.closed, false);
  show(merge.still, false);
  if (wanted === NEAR_MODE.OPEN) show(merge.open, true);
  else if (wanted === NEAR_MODE.CLOSED) show(merge.closed, true);
  else if (wanted === NEAR_MODE.STILL) show(merge.still, true);
}

/**
 * The near mode a car should draw in.
 * @param {boolean} separate True for the player's car or a damaged one (PARTS).
 * @param {Record<string, {amount: number, target: number}>} doors From createVehicleDoors.
 * @param {boolean} asleep True when its physics body sleeps.
 * @returns {number} A NEAR_MODE.
 */
export function nearModeOf(separate, doors, asleep) {
  if (separate) return NEAR_MODE.PARTS;
  for (const side in doors) if (doors[side].amount !== 0 || doors[side].target !== 0) return NEAR_MODE.OPEN;
  return asleep ? NEAR_MODE.STILL : NEAR_MODE.CLOSED;
}

/**
 * Seats the STILL mesh on the road: the springs hold a parked body a centimetre or two high and
 * the separate wheels drop to the ground, so the one-piece car is lowered by the same amount.
 * @param {object} rig From createVehicleRig.
 * @param {number} height From settleMergedVehicleLevels (negative when the body rides high).
 */
export function settleNearStill(rig, height) {
  const node = rig.nearMerge?.stillNode;
  if (node && node.position.y !== height) node.position.y = height;
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
  for (const mesh of merge.role) {
    mesh.material = mergedVehicleMaterial(rig.asset, mesh.userData.merged, colour, bits & 1, (bits >> 1) & 3, bits >> 3, true);
  }
}

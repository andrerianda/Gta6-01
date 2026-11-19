// Junction control dressing: the traffic signals, walker signals, stop signs and street-name posts
// of one sector (junctionControlLayout.js) as instance groups of set_traffic_control for the
// city-wide pools (streetItemPools.js), so they take far levels by distance like the lamps and
// cost the same few draw calls however many sectors are built. Each object is a body group (its
// non-lamp parts) and, for every lamp material (lamp_red, lamp_amber, lamp_green, lamp_stop,
// lamp_walk), an "on" group (glowing day and night) and an "off" group (dark): a signal lamp is
// shown in one of the two, switched through the pools only when its light changes.
//
//   const junction = buildJunctionControls(items, { assets, heightAt });
//   const handle = pools.addSector([...other, ...junction.instances]);
//   junction.attach(handle, other.length);     // the index of its first group in that list
//   junction.update(lightOf);                  // when lights may have changed
import * as THREE from 'three';
import { objectParts } from './sectorStreetDressing.js';

const SET = 'set_traffic_control';
/** Collider half heights (metres) of the objects' poles. */
const POLE_HALF_HEIGHT = { traffic_signal_mast: 3.4, traffic_signal_post: 2.05, pedestrian_signal: 1.5, sign_octagon: 1.3, street_name_post: 1.7 };
const lampMaterials = new WeakMap();

/**
 * Builds a sector's junction controls.
 * @param {object[]} items From layOutJunctionControls ({object, x, z, rotationY, nodeId, phase, role}).
 * @param {{assets: {has: Function, get: Function}, heightAt: (x: number, z: number) => number}} options
 * @returns {{instances: object[], colliders: object[], placed: {object: string, x: number, y: number, z: number, rotationY: number, item: object}[],
 *   attach: (handle: {setShown: Function}, offset: number) => void,
 *   update: (lightOf: (nodeId: number, phase: number) => string) => void}}
 */
export function buildJunctionControls(items, options) {
  const { assets, heightAt } = options;
  const instances = [];
  const colliders = [];
  const placed = [];
  const switches = [];
  let handle = null;
  let offset = 0;
  const result = {
    instances,
    colliders,
    placed,
    attach(poolHandle, at) {
      handle = poolHandle;
      offset = at;
      for (const entry of switches) entry.light = '';
    },
    /** Shows each signal's light; `lightOf(nodeId, phase)` answers 'green', 'yellow' or 'red'. */
    update(lightOf) {
      if (!handle) return;
      for (const entry of switches) {
        const light = lightOf(entry.item.nodeId, entry.item.phase);
        if (light === entry.light) continue;
        entry.light = light;
        for (const lamp of entry.lamps) {
          const lit = lampLit(lamp.lamp, entry.item.role, light);
          handle.setShown(offset + lamp.on, entry.index, lit);
          handle.setShown(offset + lamp.off, entry.index, !lit);
        }
      }
    },
  };
  if (!items.length || !assets?.has?.(SET)) return result;
  const asset = assets.get(SET);
  const byObject = new Map();
  for (const item of items) {
    if (!byObject.has(item.object)) byObject.set(item.object, []);
    byObject.get(item.object).push(item);
  }
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const unit = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);

  for (const [object, list] of byObject) {
    const parts = objectParts(asset, { assetId: SET, object }, 0);
    if (!parts.length) continue;
    const lampNames = [...new Set(parts.map((part) => part.material?.name ?? '').filter((name) => name.startsWith('lamp_')))];
    const matrices = new Float32Array(list.length * 16);
    list.forEach((item, index) => {
      const y = heightAt(item.x, item.z);
      position.set(item.x, y, item.z);
      rotation.setFromAxisAngle(up, item.rotationY);
      matrix.compose(position, rotation, unit);
      matrix.toArray(matrices, index * 16);
      const half = POLE_HALF_HEIGHT[object] ?? 1.5;
      colliders.push({ shape: 'cyl', x: item.x, y: y + half, z: item.z, radius: 0.16, halfHeight: half });
      placed.push({ object, x: item.x, y, z: item.z, rotationY: item.rotationY, item });
    });
    const body = { source: { assetId: SET, object, select: lampNames.length ? 'body' : undefined }, kind: 'control', matrices, count: list.length };
    instances.push(body);
    // The lenses follow the body (pole, mast arm, housings): drawn only where it is drawn and at
    // its level (owner 12:00: signal heads with no poles), never on their own.
    const lamps = lampNames.map((name) => {
      const on = instances.length;
      instances.push({ source: { assetId: SET, object, select: name, state: 'on', swap: switchedMaterial, noShadow: true }, kind: 'control', matrices, count: list.length, hidden: true, follows: body });
      // A dark lens is invisible beyond the level 1 distance: the off copies stop there.
      instances.push({ source: { assetId: SET, object, select: name, state: 'off', swap: switchedMaterial, noShadow: true, maxLevel: 1 }, kind: 'control', matrices, count: list.length, follows: body });
      return { lamp: name.slice(5), on, off: on + 1 };
    });
    if (lamps.length) list.forEach((item, index) => { if (item.phase >= 0) switches.push({ item, index, lamps, light: '' }); });
  }
  return result;
}

/** Whether a lamp group is lit for a light: vehicle heads by colour; walkers walk on red. */
export function lampLit(lamp, role, light) {
  if (role === 'walker') return lamp === 'walk' ? light === 'red' : light !== 'red';
  if (lamp === 'red') return light === 'red';
  if (lamp === 'amber') return light === 'yellow';
  if (lamp === 'green') return light === 'green';
  return false;
}

/** A lamp material's lit copy (glowing day and night) or dark copy, shared by every sector. */
function switchedMaterial(material, state) {
  let pair = lampMaterials.get(material);
  if (!pair) {
    const on = material.clone();
    on.name = `${material.name}_on`;
    if (on.emissive) {
      if (on.emissive.getHex() === 0) on.emissive.copy(on.color);
      on.emissiveIntensity = Math.max(on.emissiveIntensity ?? 1, 3);
    }
    on.toneMapped = true;
    const off = material.clone();
    off.name = `${material.name}_off`;
    if ('emissiveIntensity' in off) off.emissiveIntensity = 0;
    off.color.multiplyScalar(0.3);
    pair = { on, off };
    lampMaterials.set(material, pair);
  }
  return state === 'on' ? pair.on : pair.off;
}

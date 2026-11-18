// Junction control dressing: the traffic signals, walker signals, stop signs and street-name posts
// of one sector (junctionControlLayout.js) as instanced batches of set_traffic_control, with the
// signal lamps switched by the light each junction shows. Every lamp material (lamp_red,
// lamp_amber, lamp_green, lamp_stop, lamp_walk) has an "on" and an "off" batch; a lamp moves
// between them by its instance matrix, only when its light changes, so a sector's signals are a
// dozen draw calls and cost nothing in a frame where no light changes.
import * as THREE from 'three';
import { InstancedBatch } from '../../assets/index.js';
import { objectParts } from './sectorStreetDressing.js';

const SET = 'set_traffic_control';
/** Collider half heights (metres) of the objects' poles. */
const POLE_HALF_HEIGHT = { traffic_signal_mast: 3.1, pedestrian_signal: 1.5, sign_octagon: 1.3, street_name_post: 1.7 };
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const lampMaterials = new WeakMap();

/**
 * Builds a sector's junction controls.
 * @param {object[]} items From layOutJunctionControls.
 * @param {{assets: {has: Function, get: Function}, heightAt: (x: number, z: number) => number,
 *   origin: {x: number, z: number}}} options
 * @returns {{group: THREE.Group, colliders: object[], batches: InstancedBatch[],
 *   update: (lightOf: (nodeId: number, phase: number) => string) => void}}
 */
export function buildJunctionControls(items, options) {
  const { assets, heightAt, origin } = options;
  const group = new THREE.Group();
  group.name = 'junction_controls';
  const colliders = [];
  const batches = [];
  const switches = [];
  if (!items.length || !assets?.has?.(SET)) return { group, colliders, batches, update() {} };
  const asset = assets.get(SET);
  const byObject = new Map();
  for (const item of items) {
    if (!byObject.has(item.object)) byObject.set(item.object, []);
    byObject.get(item.object).push(item);
  }
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const unit = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);

  for (const [object, list] of byObject) {
    const parts = objectParts(asset, { assetId: SET, object }, 0);
    if (!parts.length) continue;
    const body = parts.filter((part) => !lampGroupOf(part.material));
    const lamps = parts.filter((part) => lampGroupOf(part.material));
    const bodyBatch = body.length ? new InstancedBatch(body.map((part) => ({ ...part, castShadow: false })), list.length, `${object}_body`) : null;
    const lampBatches = lamps.map((part) => {
      const { on, off } = switchedMaterials(part.material);
      return {
        lamp: lampGroupOf(part.material),
        on: new InstancedBatch([{ ...part, material: on, castShadow: false }], list.length, `${object}_${on.name}`),
        off: new InstancedBatch([{ ...part, material: off, castShadow: false }], list.length, `${object}_${off.name}`),
      };
    });
    list.forEach((item, index) => {
      const y = heightAt(item.x, item.z);
      position.set(item.x - origin.x, y, item.z - origin.z);
      rotation.setFromAxisAngle(up, item.rotationY);
      const matrix = new THREE.Matrix4().compose(position, rotation, unit);
      bodyBatch?.setMatrixAt(index, matrix);
      for (const lamp of lampBatches) {
        lamp.on.setMatrixAt(index, ZERO);
        lamp.off.setMatrixAt(index, matrix);
      }
      const half = POLE_HALF_HEIGHT[object] ?? 1.5;
      colliders.push({ shape: 'cyl', x: item.x, y: y + half, z: item.z, radius: 0.16, halfHeight: half });
      if (lampBatches.length && item.phase >= 0) switches.push({ item, index, matrix, lampBatches, light: '' });
    });
    for (const batch of [bodyBatch, ...lampBatches.flatMap((lamp) => [lamp.on, lamp.off])]) {
      if (!batch) continue;
      batch.setCount(list.length);
      batch.commit();
      for (const mesh of batch.meshes) {
        mesh.matrixAutoUpdate = false;
        // Lamps move between batches: their bounds change, so they are never culled (few).
        if (batch !== bodyBatch) mesh.frustumCulled = false;
      }
      group.add(batch.object);
      batches.push(batch);
    }
  }

  return {
    group,
    colliders,
    batches,
    /** Shows each signal's light; `lightOf(nodeId, phase)` answers 'green', 'yellow' or 'red'. */
    update(lightOf) {
      for (const entry of switches) {
        const light = lightOf(entry.item.nodeId, entry.item.phase);
        if (light === entry.light) continue;
        entry.light = light;
        for (const lamp of entry.lampBatches) {
          const lit = lampLit(lamp.lamp, entry.item.role, light);
          lamp.on.setMatrixAt(entry.index, lit ? entry.matrix : ZERO);
          lamp.off.setMatrixAt(entry.index, lit ? ZERO : entry.matrix);
          lamp.on.meshes[0].instanceMatrix.needsUpdate = true;
          lamp.off.meshes[0].instanceMatrix.needsUpdate = true;
        }
      }
    },
  };
}

/** Whether a lamp group is lit for a light: vehicle heads by colour; walkers walk on red. */
export function lampLit(lamp, role, light) {
  if (role === 'walker') return lamp === 'walk' ? light === 'red' : light !== 'red';
  if (lamp === 'red') return light === 'red';
  if (lamp === 'amber') return light === 'yellow';
  if (lamp === 'green') return light === 'green';
  return false;
}

function lampGroupOf(material) {
  const name = material?.name ?? '';
  return name.startsWith('lamp_') ? name.slice(5) : null;
}

/** A lamp material's lit copy (glowing day and night) and dark copy, shared by every sector. */
function switchedMaterials(material) {
  let pair = lampMaterials.get(material);
  if (pair) return pair;
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
  return pair;
}

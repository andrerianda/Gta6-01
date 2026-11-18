// Sector street dressing: turns the lamp and planting layouts of one sector into instanced
// batches of the built assets (set_street_lighting objects or street_lamp_a; royal and coconut
// palms or the example palm), one draw call per material per kind, with a near level and a far
// level, the lamps' lights described at their anchors, and a cylinder collider per pole and trunk.
import * as THREE from 'three';
import { InstancedBatch } from '../../assets/index.js';

const SPECIES_ASSETS = {
  royal_palm: [['royal_palm', 'variant_a'], ['royal_palm', 'variant_b'], ['royal_palm_a', null]],
  coconut_palm: [['coconut_palm', 'variant_a'], ['coconut_palm', 'variant_b'], ['royal_palm_a', null]],
  street_tree: [['street_tree', 'variant_a'], ['royal_palm_a', null]],
};

/**
 * Builds the batches of a sector's lamps and plants.
 * @param {{lamps: object[], plants: object[]}} layout From streetFurnitureLayout.js and
 *   vegetation/roadsidePlantingLayout.js.
 * @param {{assets: {has: (id: string) => boolean, get: (id: string) => object}, heightAt: (x: number, z: number) => number,
 *   origin: {x: number, z: number}}} options The asset library, the ground and the sector origin.
 * @returns {{near: THREE.Group, far: THREE.Group, lights: object[], colliders: object[], batches: InstancedBatch[]}}
 */
export function buildSectorStreetDressing(layout, options) {
  const { assets, heightAt, origin } = options;
  const near = new THREE.Group();
  near.name = 'street_dressing_near';
  const far = new THREE.Group();
  far.name = 'street_dressing_far';
  const lights = [];
  const colliders = [];
  const batches = [];
  const groups = new Map();
  const add = (source, item, kind) => {
    const key = `${source.assetId}/${source.object ?? ''}`;
    if (!groups.has(key)) groups.set(key, { source, kind, items: [] });
    groups.get(key).items.push(item);
  };

  for (const lamp of layout.lamps) {
    const source = lampSource(assets, lamp.object);
    if (source) add(source, lamp, 'lamp');
  }
  for (const plant of layout.plants) {
    const choices = (SPECIES_ASSETS[plant.species] ?? SPECIES_ASSETS.royal_palm).filter(([id]) => assets.has(id));
    if (!choices.length) continue;
    const variant = choices.filter(([id]) => id === choices[0][0]);
    const [assetId, object] = variant[Math.floor((plant.rotationY / (Math.PI * 2)) * variant.length) % variant.length];
    add({ assetId, object, plain: object === null || object.startsWith('variant') }, plant, 'plant');
  }

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  for (const { source, kind, items } of groups.values()) {
    const asset = assets.get(source.assetId);
    const levels = kind === 'lamp' ? [0, null] : [0, 2];
    const made = levels.map((lod) => (lod === null ? null : new InstancedBatch(objectParts(asset, source, lod), items.length, `${source.assetId}_${source.object ?? 'all'}_lod${lod}`)));
    const anchors = kind === 'lamp' ? objectAnchors(asset, source) : [];
    items.forEach((item, index) => {
      const y = heightAt(item.x, item.z);
      position.set(item.x - origin.x, y, item.z - origin.z);
      rotation.setFromAxisAngle(up, item.rotationY);
      const s = item.scale ?? 1;
      scale.set(s, s, s);
      matrix.compose(position, rotation, scale);
      for (const batch of made) batch?.setMatrixAt(index, matrix);
      for (const anchor of anchors) {
        const world = anchor.clone().applyQuaternion(rotation).multiplyScalar(s);
        lights.push({ kind: 'spot', position: [item.x + world.x, y + world.y, item.z + world.z], direction: [0, -1, 0],
          color: 0xffd9a0, intensity: kind === 'lamp' ? 320 : 120, range: 24, angle: 1.05, groundY: y });
      }
      colliders.push({ shape: 'cyl', x: item.x, y: y + (kind === 'lamp' ? 3 : 1.5), z: item.z,
        radius: kind === 'lamp' ? 0.16 : 0.22 * s, halfHeight: kind === 'lamp' ? 3 : 1.5 });
    });
    made.forEach((batch, level) => {
      if (!batch) return;
      batch.setCount(items.length);
      batch.commit();
      for (const mesh of batch.meshes) {
        mesh.castShadow = level === 0 && kind === 'plant';
        mesh.matrixAutoUpdate = false;
      }
      (level === 0 ? near : far).add(batch.object);
      batches.push(batch);
    });
  }
  return { near, far, lights, colliders, batches };
}

function lampSource(assets, object) {
  if (assets.has('set_street_lighting')) return { assetId: 'set_street_lighting', object };
  if (assets.has('street_lamp_a')) return { assetId: 'street_lamp_a', object: null, plain: true };
  return null;
}

const partCache = new WeakMap();

/**
 * The meshes of one object of an asset at one level, in the object's own space, ready for an
 * InstancedBatch. Set objects are "<object>" roots with "<object>_lod<n>" levels; single assets
 * have "lod<n>" (or "variant_a_lod<n>") under the root.
 */
function objectParts(asset, source, lod) {
  let cache = partCache.get(asset);
  if (!cache) partCache.set(asset, (cache = new Map()));
  const key = `${source.object}/${lod}`;
  if (cache.has(key)) return cache.get(key);
  asset.scene.updateMatrixWorld(true);
  const root = source.object && !source.object.startsWith('variant') ? asset.scene.getObjectByName(source.object) ?? asset.scene : asset.scene;
  const prefix = source.object && source.object.startsWith('variant') ? `${source.object}_lod` : source.object && root !== asset.scene ? `${source.object}_lod` : 'lod';
  let level = null;
  for (let l = lod; l >= 0 && !level; l -= 1) level = asset.scene.getObjectByName(`${prefix}${l}`);
  level ??= root;
  const inverse = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const parts = [];
  level.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const geometry = mesh.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld));
    parts.push({ geometry, material: mesh.material, castShadow: mesh.castShadow, receiveShadow: true });
  });
  cache.set(key, parts);
  return parts;
}

/** The light anchors of a lamp object, in the object's space. */
function objectAnchors(asset, source) {
  asset.scene.updateMatrixWorld(true);
  const root = source.object ? asset.scene.getObjectByName(source.object) ?? asset.scene : asset.scene;
  const inverse = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const found = [];
  asset.scene.traverse((node) => {
    if (!node.name.startsWith('anchor_light')) return;
    if (source.object && !node.name.endsWith(`__${source.object}`)) return;
    found.push(new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().multiplyMatrices(inverse, node.matrixWorld)));
  });
  return found;
}

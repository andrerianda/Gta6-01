// Street wear decals: a sector's set_street_wear items (streetWearLayout.js) merged into one mesh
// per material: the soft decals (stains, cracks, covers, graffiti, posters, streaks) in one draw
// with a transparent copy of `cutout_decal` (no depth write, polygon offset, no shadows), the weed
// cards in one more with the alpha-tested `cutout`. Ground decals lie 5 mm over the ground (or the
// kerb-raised pavement); wall decals stand at the facade foot on the building's pad. The meshes
// are drawn only while the camera is within WEAR_DISTANCE of the sector (setCamera).
import * as THREE from 'three';
import { objectParts } from './sectorStreetDressing.js';

/** Sectors farther than this (metres, camera to the sector's box) do not draw their wear. */
export const WEAR_DISTANCE = 90;
const decalCopies = new WeakMap();

/**
 * Builds a sector's wear.
 * @param {object[]} items From layOutSectorWear.
 * @param {{assets: {has: Function, get: Function}, heightAt: (x: number, z: number) => number,
 *   bounds: {minX: number, minZ: number, maxX: number, maxZ: number}}} options
 * @returns {{object3d: THREE.Group, count: number, draws: number, setCamera: (x: number, z: number) => void, dispose: () => void} | null}
 */
export function buildSectorWear(items, options) {
  const { assets, heightAt, bounds } = options;
  if (!items.length || !assets?.has?.('set_street_wear')) return null;
  const asset = assets.get('set_street_wear');
  if (!asset?.scene) return null;
  const byMaterial = new Map();
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const unit = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);
  let count = 0;
  for (const item of items) {
    const parts = objectParts(asset, { assetId: 'set_street_wear', object: item.object }, 0);
    if (!parts.length) continue;
    const y = item.base ?? heightAt(item.x, item.z);
    position.set(item.x, y + (item.wall ? 0 : 0.005), item.z);
    rotation.setFromAxisAngle(up, item.rotationY);
    matrix.compose(position, rotation, unit);
    for (const part of parts) {
      if (!byMaterial.has(part.material)) byMaterial.set(part.material, []);
      byMaterial.get(part.material).push(part.geometry, matrix.clone());
    }
    count += 1;
  }
  const group = new THREE.Group();
  group.name = 'city_dressing_street_wear';
  for (const [material, list] of byMaterial) {
    const geometry = mergeTransformed(list);
    if (!geometry) continue;
    const mesh = new THREE.Mesh(geometry, wearMaterial(material));
    mesh.name = `street_wear_${material.name || 'decal'}`;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.renderOrder = material.alphaTest > 0 ? 0 : 1;
    group.add(mesh);
  }
  group.matrixAutoUpdate = false;
  return {
    object3d: group,
    count,
    draws: group.children.length,
    /** Shows the wear only while the camera is near the sector. */
    setCamera(x, z) {
      const dx = Math.max(bounds.minX - x, 0, x - bounds.maxX);
      const dz = Math.max(bounds.minZ - z, 0, z - bounds.maxZ);
      group.visible = dx * dx + dz * dz < WEAR_DISTANCE * WEAR_DISTANCE;
    },
    dispose() {
      group.removeFromParent();
      for (const mesh of group.children) mesh.geometry.dispose();
    },
  };
}

/** Merges [geometry, matrix, geometry, matrix, ...] keeping position, normal and uv (Float32). */
function mergeTransformed(list) {
  let vertices = 0;
  let indices = 0;
  for (let i = 0; i < list.length; i += 2) {
    const geometry = list[i];
    vertices += geometry.attributes.position.count;
    indices += geometry.index ? geometry.index.count : geometry.attributes.position.count;
  }
  if (!vertices) return null;
  const positions = new Float32Array(vertices * 3);
  const normals = new Float32Array(vertices * 3);
  const uvs = new Float32Array(vertices * 2);
  const index = new Uint32Array(indices);
  const point = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3();
  let v = 0;
  let k = 0;
  for (let i = 0; i < list.length; i += 2) {
    const geometry = list[i];
    const matrix = list[i + 1];
    normalMatrix.getNormalMatrix(matrix);
    const { position, normal, uv } = geometry.attributes;
    for (let j = 0; j < position.count; j += 1) {
      point.fromBufferAttribute(position, j).applyMatrix4(matrix);
      point.toArray(positions, (v + j) * 3);
      if (normal) point.fromBufferAttribute(normal, j).applyMatrix3(normalMatrix).normalize();
      else point.set(0, 1, 0);
      point.toArray(normals, (v + j) * 3);
      if (uv) { uvs[(v + j) * 2] = uv.getX(j); uvs[(v + j) * 2 + 1] = uv.getY(j); }
    }
    if (geometry.index) for (let j = 0; j < geometry.index.count; j += 1) index[k + j] = geometry.index.getX(j) + v;
    else for (let j = 0; j < position.count; j += 1) index[k + j] = j + v;
    k += geometry.index ? geometry.index.count : position.count;
    v += position.count;
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  merged.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  merged.setIndex(new THREE.BufferAttribute(index, 1));
  merged.computeBoundingSphere();
  merged.computeBoundingBox();
  return merged;
}

/** The soft decal material as a transparent overlay (one copy per source); the weed cutout as it is. */
function wearMaterial(material) {
  if (material.alphaTest > 0 && material.side === THREE.DoubleSide) return material;
  let copy = decalCopies.get(material);
  if (!copy) {
    copy = material.clone();
    copy.name = `${material.name || 'decal'}_overlay`;
    copy.transparent = true;
    copy.depthWrite = false;
    copy.alphaTest = 0;
    copy.polygonOffset = true;
    copy.polygonOffsetFactor = -1;
    copy.polygonOffsetUnits = -1;
    decalCopies.set(material, copy);
  }
  return copy;
}

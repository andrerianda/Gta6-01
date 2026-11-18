// Merging the parts of one car model that share a material into one geometry, for the instanced
// batches of distant and parked cars (distantTrafficBatches.js). The parts come from Draco
// compressed .glb files, where each part is quantised on its own: the same attribute (uv1, the
// baked-light uv, above all) can arrive as Float32 in one part and as normalised Uint16 in the
// next, and three.js refuses to merge those (a console error, and the part is missing). So every
// part keeps exactly the attributes all of them have, all indexed or none, and an attribute whose
// array types or normalisation differ between parts is rewritten as plain Float32 in all of them.
import * as THREE from 'three';
import { BufferGeometryUtils } from '../../vendor/three/three-gltf-addons.min.js';

/**
 * One geometry from several geometries with the same material (they are changed: pass clones).
 * @param {THREE.BufferGeometry[]} geometries
 * @returns {THREE.BufferGeometry | null} Null only when three.js still cannot merge them.
 */
export function mergeSameMaterialParts(geometries) {
  if (geometries.length === 1) return geometries[0];
  const names = Object.keys(geometries[0].attributes).filter((name) => geometries.every((g) => g.attributes[name]));
  const indexed = geometries.every((g) => g.index);
  const list = geometries.map((g) => {
    const geometry = indexed || !g.index ? g : g.toNonIndexed();
    for (const name of Object.keys(geometry.attributes)) if (!names.includes(name)) geometry.deleteAttribute(name);
    geometry.morphAttributes = {};
    return geometry;
  });
  for (const name of names) {
    const first = list[0].attributes[name];
    const mixed = list.some((g) => {
      const attribute = g.attributes[name];
      return attribute.isInterleavedBufferAttribute || attribute.array.constructor !== first.array.constructor
        || attribute.normalized !== first.normalized || attribute.itemSize !== first.itemSize;
    });
    if (mixed) for (const g of list) g.setAttribute(name, toFloat32Attribute(g.attributes[name], first.itemSize));
  }
  return BufferGeometryUtils.mergeGeometries(list, false);
}

/**
 * The same values as plain Float32 (normalised integers become their 0..1 or -1..1 values).
 * @param {THREE.BufferAttribute} attribute
 * @param {number} itemSize Components kept per vertex.
 */
export function toFloat32Attribute(attribute, itemSize = attribute.itemSize) {
  const array = new Float32Array(attribute.count * itemSize);
  const size = Math.min(itemSize, attribute.itemSize);
  for (let i = 0; i < attribute.count; i += 1) {
    for (let c = 0; c < size; c += 1) array[i * itemSize + c] = attribute.getComponent(i, c);
  }
  return new THREE.BufferAttribute(array, itemSize);
}

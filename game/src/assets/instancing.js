// Cheap instancing of static models: one InstancedMesh per material of an asset, all sharing
// one buffer of instance matrices. Use it for anything placed many times that has no moving
// parts (street furniture, vegetation, building modules, parked props).
import * as THREE from 'three';

/**
 * Many copies of one static asset, drawn with one draw call per material.
 *
 *   const batch = assets.get('royal_palm_a').createBatch(400, { lod: 1 });
 *   scene.add(batch.object);
 *   batch.setMatrixAt(0, matrix);   // asset-space to world, same for every part
 *   batch.setCount(1);
 *   batch.commit();
 */
export class InstancedBatch {
  /**
   * @param {{ geometry: THREE.BufferGeometry, material: THREE.Material, castShadow: boolean,
   *   receiveShadow: boolean }[]} parts The asset's meshes with their geometry already in asset
   *   space (Asset.createBatch prepares them).
   * @param {number} capacity The largest number of instances the batch can hold.
   * @param {string} [name] A name for the batch's root object.
   */
  constructor(parts, capacity, name = 'batch') {
    /** The object to add to the scene. */
    this.object = new THREE.Group();
    this.object.name = name;
    /** The largest number of instances. */
    this.capacity = capacity;
    /** @type {THREE.InstancedMesh[]} One mesh per material of the asset. */
    this.meshes = [];
    for (const part of parts) {
      const mesh = new THREE.InstancedMesh(part.geometry, part.material, capacity);
      mesh.castShadow = part.castShadow;
      mesh.receiveShadow = part.receiveShadow;
      mesh.count = 0;
      if (this.meshes.length > 0) mesh.instanceMatrix = this.meshes[0].instanceMatrix;
      this.meshes.push(mesh);
      this.object.add(mesh);
    }
    this.meshes[0]?.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }

  /** The number of instances drawn. */
  get count() {
    return this.meshes[0]?.count ?? 0;
  }

  /**
   * Sets how many instances are drawn (the first `count` slots).
   * @param {number} count A number from 0 to capacity.
   */
  setCount(count) {
    if (count > this.capacity) throw new Error(`batch holds ${this.capacity} instances, not ${count}`);
    for (const mesh of this.meshes) mesh.count = count;
  }

  /**
   * Places one instance.
   * @param {number} index The slot, from 0 to capacity - 1.
   * @param {THREE.Matrix4} matrix The instance's transform (asset space to the batch's space).
   */
  setMatrixAt(index, matrix) {
    this.meshes[0]?.setMatrixAt(index, matrix);
  }

  /**
   * Reads one instance's transform.
   * @param {number} index The slot.
   * @param {THREE.Matrix4} target Where to write the matrix.
   * @returns {THREE.Matrix4} The target.
   */
  getMatrixAt(index, target) {
    this.meshes[0]?.getMatrixAt(index, target);
    return target;
  }

  /**
   * Tints one instance: the colour multiplies the materials' own colour (white = unchanged).
   * @param {number} index The slot.
   * @param {THREE.Color} color The tint.
   */
  setColorAt(index, color) {
    for (const mesh of this.meshes) mesh.setColorAt(index, color);
  }

  /** Uploads the changes made with setMatrixAt and setColorAt and refits the culling bounds. */
  commit() {
    if (this.meshes.length === 0) return;
    this.meshes[0].instanceMatrix.needsUpdate = true;
    for (const mesh of this.meshes) {
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.computeBoundingBox();
    }
  }

  /** Frees the per-batch GPU buffers (the asset's geometry and materials stay loaded). */
  dispose() {
    for (const mesh of this.meshes) mesh.dispose();
    this.object.removeFromParent();
  }
}

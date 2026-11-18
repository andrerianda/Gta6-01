// Joins the street, road-paint and waterfront meshes of every streamed sector into one
// THREE.BatchedMesh per material (and shadow and draw-order setting), so the whole streamed ring
// of streets costs about one draw call per material instead of one per material per sector. A
// sector's meshes are copied in when it is built and their space given back when it is released;
// each piece is still culled against the view and the shadow cameras on its own. The batches
// grow (and compact the space released sectors left) when a new sector does not fit.
//
//   const batches = createSectorMeshBatches(layer);
//   const handle = batches.add([streets.object3d, paint.object3d]);  // source geometries disposed
//   batches.remove(handle);
//   batches.stats()   // [{ name, pieces, vertices, capacity }]

import * as THREE from 'three';

/** Starting room of a batch; it grows by half again whenever a sector does not fit. */
const START_VERTICES = 98304;
const START_INSTANCES = 64;

/**
 * Creates the batches under a parent object (the world layer).
 * @param {THREE.Object3D} parent
 */
export function createSectorMeshBatches(parent) {
  /** Batches by material, shadow flags, draw order and attribute layout. */
  const batches = new Map();
  const matrix = new THREE.Matrix4();

  function keyOf(mesh) {
    const geometry = mesh.geometry;
    let layout = geometry.index ? 'i' : 'n';
    for (const name of Object.keys(geometry.attributes).sort()) layout += `|${name}${geometry.attributes[name].itemSize}`;
    return `${mesh.material.uuid}:${mesh.castShadow ? 1 : 0}${mesh.receiveShadow ? 1 : 0}:${mesh.renderOrder}:${layout}`;
  }

  function batchFor(mesh) {
    const key = keyOf(mesh);
    let batch = batches.get(key);
    if (batch) return batch;
    const vertices = Math.max(START_VERTICES, mesh.geometry.attributes.position.count * 4);
    const indices = mesh.geometry.index ? vertices * 2 : vertices;
    const batched = new THREE.BatchedMesh(START_INSTANCES, vertices, indices, mesh.material);
    batched.name = `city-batch-${mesh.material.name || 'surface'}`;
    batched.castShadow = mesh.castShadow;
    batched.receiveShadow = mesh.receiveShadow;
    batched.renderOrder = mesh.renderOrder;
    // Opaque ground needs no depth sort; each piece is culled on its own, the batch never whole.
    batched.sortObjects = false;
    batched.perObjectFrustumCulled = true;
    batched.frustumCulled = false;
    parent.add(batched);
    batch = { mesh: batched, vertices, indices, instances: START_INSTANCES, active: 0, pieces: 0 };
    batches.set(key, batch);
    return batch;
  }

  /** Makes room for one more geometry: compacts first, then grows by half again. */
  function ensureRoom(batch, vertexCount, indexCount) {
    const mesh = batch.mesh;
    if (mesh.unusedVertexCount < vertexCount || mesh.unusedIndexCount < indexCount) {
      mesh.optimize();
      if (mesh.unusedVertexCount < vertexCount || mesh.unusedIndexCount < indexCount) {
        batch.vertices = Math.ceil(Math.max(batch.vertices * 1.5, batch.vertices - mesh.unusedVertexCount + vertexCount * 2));
        batch.indices = Math.ceil(Math.max(batch.indices * 1.5, batch.indices - mesh.unusedIndexCount + indexCount * 2));
        mesh.setGeometrySize(batch.vertices, batch.indices);
      }
    }
    if (batch.active >= batch.instances) {
      batch.instances *= 2;
      mesh.setInstanceCount(batch.instances);
    }
  }

  return {
    /**
     * Copies every mesh under the given objects into the batches and disposes its geometry.
     * @param {THREE.Object3D[]} objects
     * @returns {{batch: object, geometryId: number}[]} The handle remove() takes.
     */
    add(objects) {
      const handle = [];
      for (const object of objects) {
        if (!object) continue;
        object.updateMatrixWorld(true);
        object.traverse((node) => {
          if (!node.isMesh || node.isBatchedMesh || Array.isArray(node.material)) return;
          const geometry = node.geometry;
          const vertexCount = geometry.attributes.position.count;
          const indexCount = geometry.index ? geometry.index.count : vertexCount;
          if (vertexCount === 0) return;
          const batch = batchFor(node);
          ensureRoom(batch, vertexCount, indexCount);
          const geometryId = batch.mesh.addGeometry(geometry);
          const instanceId = batch.mesh.addInstance(geometryId);
          batch.mesh.setMatrixAt(instanceId, matrix.copy(node.matrixWorld));
          batch.active += 1;
          batch.pieces += 1;
          handle.push({ batch, geometryId });
          geometry.dispose();
        });
      }
      return handle;
    },

    /** Gives a sector's pieces back (their space is reused after the next compaction). */
    remove(handle) {
      for (const { batch, geometryId } of handle) {
        batch.mesh.deleteGeometry(geometryId);
        batch.active -= 1;
        batch.pieces -= 1;
      }
      handle.length = 0;
    },

    /** How many batches there are (they are only ever added): a cheap test for a changed objects(). */
    get size() {
      return batches.size;
    },

    /** The batch meshes (to leave out of a capture whose material cannot draw batches). */
    objects() {
      return [...batches.values()].map((batch) => batch.mesh);
    },

    /** One line per batch, for measuring: name, pieces, vertices in use and capacity. */
    stats() {
      return [...batches.values()].map((batch) => ({
        name: batch.mesh.name, pieces: batch.pieces, vertices: batch.vertices - batch.mesh.unusedVertexCount, capacity: batch.vertices,
      }));
    },

    dispose() {
      for (const batch of batches.values()) {
        batch.mesh.removeFromParent();
        batch.mesh.dispose();
      }
      batches.clear();
    },
  };
}

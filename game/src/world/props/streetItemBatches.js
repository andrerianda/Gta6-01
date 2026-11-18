// Street item batches: every part of every street item pool drawn through one BatchedMesh per
// (material, shadow flag, vertex layout), so a whole set file's atlas parts at every level cost
// ONE draw call (engine 10:50: each draw in view costs ~10 us of CPU; the InstancedMesh per
// object, part and level made the pools 110-160 draws on Gran Via). Geometries are added to a
// batch once; an item's part is an instance of it (added, moved, deleted; deleted ids are reused).
// Batches that cast are tagged userData.shadowCascades = 'near' and handed to options.onCaster
// (the dressing keeps them out of the far cascades). Per-instance culling and sorting are off:
// the pools already drop what is beyond each kind's draw distance, and the walk over the
// instances per pass is cheaper than the culling. Nothing is allocated per instance change.
//
//   const batches = createStreetItemBatches(root, { onCaster });
//   const part = batches.partFor(material, castsShadow, geometry, tinted);   // once per pool part
//   const id = batches.add(part, matrices, offset, colours, colourOffset);    // colours may be null
//   batches.remove(part, id);
import * as THREE from 'three';

/** The attribute layout a batch's geometries must share (names, sizes, array types, index). */
export function geometryLayoutOf(geometry) {
  const names = Object.keys(geometry.attributes).sort();
  let layout = geometry.index ? 'i' : 'n';
  for (const name of names) {
    const attribute = geometry.attributes[name];
    layout += `|${name}:${attribute.itemSize}${attribute.normalized ? 'n' : ''}:${attribute.array?.constructor?.name ?? '?'}`;
  }
  return layout;
}

/**
 * Creates the batch set under a root group.
 * @param {THREE.Object3D} root
 * @param {{onCaster?: (mesh: THREE.BatchedMesh) => void}} [options]
 */
export function createStreetItemBatches(root, options = {}) {
  const batches = new Map();
  const matrix = new THREE.Matrix4();
  const colour = new THREE.Color();

  function batchFor(material, casts, geometry) {
    const key = `${material.uuid}|${casts ? 1 : 0}|${geometryLayoutOf(geometry)}`;
    let entry = batches.get(key);
    if (entry) return entry;
    const maxInstances = 128;
    const maxVertices = 8192;
    const maxIndices = 16384;
    const mesh = new THREE.BatchedMesh(maxInstances, maxVertices, maxIndices, material);
    mesh.name = `street_items_${material.name || 'material'}${casts ? '_cast' : ''}`;
    mesh.perObjectFrustumCulled = false;
    mesh.sortObjects = false;
    mesh.frustumCulled = false;
    mesh.castShadow = casts;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.visible = false;
    if (casts) {
      mesh.userData.shadowCascades = 'near';
      options.onCaster?.(mesh);
    }
    root.add(mesh);
    entry = { key, mesh, casts, geometryIds: new Map(), vertices: 0, indices: 0, maxVertices, maxIndices, maxInstances, live: 0, coloured: false };
    batches.set(key, entry);
    return entry;
  }

  function geometryIn(entry, geometry) {
    let id = entry.geometryIds.get(geometry);
    if (id !== undefined) return id;
    const vertices = geometry.attributes.position.count;
    const indices = geometry.index ? geometry.index.count : 0;
    if (entry.vertices + vertices > entry.maxVertices || entry.indices + indices > entry.maxIndices) {
      entry.maxVertices = Math.max(entry.maxVertices * 2, entry.vertices + vertices);
      entry.maxIndices = Math.max(entry.maxIndices * 2, entry.indices + indices);
      entry.mesh.setGeometrySize(entry.maxVertices, entry.maxIndices);
    }
    id = entry.mesh.addGeometry(geometry);
    entry.vertices += vertices;
    entry.indices += indices;
    entry.geometryIds.set(geometry, id);
    return id;
  }

  return {
    /** A pool part's place: its batch and its geometry in it (both made on first use). */
    partFor(material, casts, geometry, tinted = false) {
      const entry = batchFor(material, casts, geometry);
      if (tinted) entry.coloured = true;
      return { entry, geometryId: geometryIn(entry, geometry), tinted };
    },
    /** Adds an instance of a part with the matrix at matrices[offset..+16]; returns its id. */
    add(part, matrices, offset, colours = null, colourOffset = 0) {
      const { entry } = part;
      const { mesh } = entry;
      if (entry.live >= entry.maxInstances) {
        entry.maxInstances *= 2;
        mesh.setInstanceCount(entry.maxInstances);
      }
      const id = mesh.addInstance(part.geometryId);
      mesh.setMatrixAt(id, matrix.fromArray(matrices, offset));
      if (entry.coloured) {
        if (part.tinted && colours) colour.setRGB(colours[colourOffset], colours[colourOffset + 1], colours[colourOffset + 2]);
        else colour.setRGB(1, 1, 1);
        mesh.setColorAt(id, colour);
      }
      entry.live += 1;
      mesh.visible = true;
      return id;
    },
    remove(part, id) {
      const { entry } = part;
      entry.mesh.deleteInstance(id);
      entry.live -= 1;
      if (entry.live === 0) entry.mesh.visible = false;
    },
    /** The batches (BatchedMesh) and the instances each holds. */
    list: () => [...batches.values()].map((entry) => ({ mesh: entry.mesh, instances: entry.live, casts: entry.casts })),
    dispose() {
      for (const entry of batches.values()) {
        entry.mesh.removeFromParent();
        entry.mesh.dispose();
      }
      batches.clear();
    },
  };
}

// Soft contact shadows under the fleet's cars, so that they sit on the road instead of floating:
// one dark, blurred rounded rectangle per car, scaled to its footprint and laid on the ground
// under it, drawn for every car at once as one instanced mesh (one draw call in all). The blob
// is depth-tested, writes no depth and is lifted off the road by polygon offset; its texture is
// made once at start (no file). The sun's own shadows still fall from the cars; this is the
// ambient occlusion right under them that the sun shadow misses at golden hour and at night.
import * as THREE from 'three';

/** Texture size of the blob, in pixels. */
const BLOB_SIZE = 64;
/** The footprint is widened by these fractions of the car's width and length. */
const WIDEN = 0.34;
const LENGTHEN = 0.16;
/** Height above the road under the car, metres (polygon offset does the rest). */
const LIFT = 0.02;
/** Beyond this distance the blob is too small to matter and is left out. */
export const CONTACT_SHADOW_DISTANCE = 140;
const scratch = new THREE.Matrix4();

/**
 * The blob texture: alpha 1 in a rounded-rectangle core, falling smoothly to 0 at the edge.
 * @returns {THREE.DataTexture}
 */
function createBlobTexture() {
  const data = new Uint8Array(BLOB_SIZE * BLOB_SIZE * 4);
  for (let y = 0; y < BLOB_SIZE; y += 1) {
    for (let x = 0; x < BLOB_SIZE; x += 1) {
      const u = Math.abs((x + 0.5) / BLOB_SIZE * 2 - 1);
      const v = Math.abs((y + 0.5) / BLOB_SIZE * 2 - 1);
      // Distance outside a rounded rectangle of half-size 0.52 x 0.66 with corner radius 0.3.
      const dx = Math.max(u - 0.52 + 0.3, 0);
      const dy = Math.max(v - 0.66 + 0.3, 0);
      const outside = Math.hypot(dx, dy) - 0.3;
      const t = Math.min(1, Math.max(0, (outside + 0.06) / 0.5));
      const alpha = (1 - t * t * (3 - 2 * t)) ** 1.6;
      // An alpha map is read from the green channel: fill every channel.
      data.fill(Math.round(alpha * 255), (y * BLOB_SIZE + x) * 4, (y * BLOB_SIZE + x) * 4 + 4);
    }
  }
  const texture = new THREE.DataTexture(data, BLOB_SIZE, BLOB_SIZE, THREE.RGBAFormat);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

/**
 * The fleet's contact shadows.
 * @param {THREE.Object3D} parent Where to add the instanced mesh (the dynamic layer).
 * @param {number} capacity The most cars drawn at once.
 * @returns {{mesh: THREE.InstancedMesh, begin: () => void, add: (root: THREE.Object3D,
 *   footprint: THREE.Matrix4) => void, end: () => void, dispose: () => void}}
 */
export function createVehicleContactShadows(parent, capacity = 128) {
  const geometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({
    name: 'vehicle_contact_shadow', color: 0x000000, alphaMap: createBlobTexture(), transparent: true, opacity: 0.72,
    depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, fog: true,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.name = 'vehicle_contact_shadows';
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = 1;
  mesh.count = 0;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  parent.add(mesh);
  let used = 0;
  return {
    mesh,
    begin() {
      used = 0;
    },
    /**
     * Adds one car: its model root (world matrix up to date), its footprint matrix and the
     * ground's height under its origin relative to the body (settleMergedVehicleLevels).
     */
    add(root, footprint, ground = 0) {
      if (used >= capacity) return;
      scratch.multiplyMatrices(root.matrixWorld, footprint);
      scratch.elements[13] += ground;
      mesh.setMatrixAt(used, scratch);
      used += 1;
    },
    end() {
      mesh.count = used;
      if (used > 0) mesh.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      mesh.removeFromParent();
      geometry.dispose();
      material.alphaMap.dispose();
      material.dispose();
    },
  };
}

/**
 * The footprint of one model: where its blob lies in model space (origin on the ground at the
 * centre of the car, facing -Z) and how large it is.
 * @param {{dimensions: {length: number, width: number}}} entry The vehicleCatalog entry.
 * @returns {THREE.Matrix4}
 */
export function contactShadowFootprint(entry) {
  const { length, width } = entry.dimensions;
  return new THREE.Matrix4().compose(
    new THREE.Vector3(0, LIFT, 0),
    new THREE.Quaternion(),
    new THREE.Vector3(width * (1 + WIDEN), 1, length * (1 + LENGTHEN)),
  );
}

// Drawing of the distant traffic: every car beyond the physics ring is one instance in a few
// instanced meshes per vehicle model, made from the model's far level (lod2, the same merged
// mesh the vehicle fleet shows beyond 45 m, so a car changing between the two does not change
// its look). Per model: the paint (a white paint material tinted per instance with the car's
// colour), the atlas, the glass and any second paint, plus the lamps merged into a front and a
// rear group that are drawn only at night. No shadows: these cars are 150 m away and more.
// Beyond FAR_PROXY_DISTANCE from the camera every model is the one 48-triangle shape of
// farCarProxy.js scaled to the model's size: two draw calls (body, night lamps) for all of them.
import * as THREE from 'three';
import { BufferGeometryUtils } from '../../vendor/three/three-gltf-addons.min.js';
import { matrixInRoot } from '../assets/index.js';
import { createFarCarGeometry, createFarCarLampGeometry, createFarCarMaterial, createFarLampMaterial } from './farCarProxy.js';

/** The level of detail drawn for distant cars (clamped to the model's last level). */
export const DISTANT_LEVEL = 2;
/** Metres from the camera beyond which a distant car is drawn as the shared low-poly shape. */
export const FAR_PROXY_DISTANCE = 240;

const matrix = new THREE.Matrix4();
const position = new THREE.Vector3();
const quaternion = new THREE.Quaternion();
const unit = new THREE.Vector3(1, 1, 1);
const size = new THREE.Vector3();
const upAxis = new THREE.Vector3(0, 1, 0);
const box = new THREE.Box3();

/**
 * Creates the instanced meshes of distant traffic, one set per vehicle model made on first use.
 * @param {object} assets The asset library (context.assets).
 * @param {THREE.Object3D} layer Where the meshes go (context.view.layers.dynamic).
 * @param {number} capacity The most cars of one model drawn at once.
 */
export function createDistantTrafficBatches(assets, layer, capacity) {
  const root = new THREE.Group();
  root.name = 'distant_traffic';
  layer?.add(root);
  /** @type {Map<string, {meshes: THREE.InstancedMesh[], paint: THREE.InstancedMesh | null, lamps: THREE.InstancedMesh[], count: number} | null>} */
  const models = new Map();
  const stats = { cars: 0, drawCalls: 0, triangles: 0, models: 0, farCars: 0 };
  let night = false;
  // The far level: one body batch and one lamp batch sharing the instance matrices.
  const proxyCapacity = capacity * 3;
  const far = new THREE.InstancedMesh(createFarCarGeometry(), createFarCarMaterial(), proxyCapacity);
  const farLamps = new THREE.InstancedMesh(createFarCarLampGeometry(), createFarLampMaterial(), proxyCapacity);
  far.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  farLamps.instanceMatrix = far.instanceMatrix;
  far.setColorAt(0, new THREE.Color(1, 1, 1));
  far.instanceColor.setUsage(THREE.DynamicDrawUsage);
  for (const mesh of [far, farLamps]) {
    mesh.name = mesh === far ? 'distant_far_bodies' : 'distant_far_lamps';
    mesh.castShadow = mesh.receiveShadow = mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.visible = false;
    root.add(mesh);
  }
  let farCount = 0;
  let eyeX = NaN;
  let eyeZ = NaN;
  const farSquared = FAR_PROXY_DISTANCE * FAR_PROXY_DISTANCE;

  function modelOf(modelId) {
    if (models.has(modelId)) return models.get(modelId);
    let built = null;
    try {
      if (assets?.has?.(modelId)) built = buildModel(assets.get(modelId));
    } catch {
      built = null;
    }
    if (built) {
      for (const mesh of built.meshes) root.add(mesh);
      stats.models += 1;
    }
    models.set(modelId, built);
    return built;
  }

  function buildModel(asset) {
    const level = Math.min(DISTANT_LEVEL, asset.lodCount - 1);
    const instance = asset.instantiate({ lod: level });
    instance.updateMatrixWorld(true);
    const groups = new Map();
    instance.traverse((node) => {
      if (!node.isMesh || !node.geometry) return;
      const name = node.material?.name ?? '';
      const key = name === 'lamp_head' ? 'lamp_front' : name.startsWith('lamp_') ? 'lamp_rear' : name === 'glass_lens' ? null : name;
      if (!key) return;
      if (!groups.has(key)) groups.set(key, { geometries: [], material: node.material });
      groups.get(key).geometries.push(node.geometry.clone().applyMatrix4(matrixInRoot(node, instance)));
    });
    const meshes = [];
    const lamps = [];
    let paint = null;
    let shared = null;
    const bounds = new THREE.Box3();
    for (const [key, group] of groups) {
      const geometry = mergeParts(group.geometries);
      if (!geometry) continue;
      geometry.computeBoundingBox();
      if (!key.startsWith('lamp_')) bounds.union(box.copy(geometry.boundingBox));
      let material = group.material;
      if (key === 'paint') material = asset.paintMaterial('#ffffff');
      else if (key === 'lamp_front') material = asset.lampMaterial('lamp_head', true);
      else if (key === 'lamp_rear') material = asset.lampMaterial('lamp_tail', true);
      const mesh = new THREE.InstancedMesh(geometry, material, capacity);
      mesh.name = `distant_${asset.id}_${key}`;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.frustumCulled = false;
      mesh.count = 0;
      mesh.visible = false;
      if (shared) mesh.instanceMatrix = shared;
      else {
        shared = mesh.instanceMatrix;
        shared.setUsage(THREE.DynamicDrawUsage);
      }
      if (key === 'paint') {
        paint = mesh;
        mesh.setColorAt(0, new THREE.Color(1, 1, 1));
        mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      }
      if (key.startsWith('lamp_')) lamps.push(mesh);
      mesh.userData.triangles = (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3;
      meshes.push(mesh);
    }
    if (!meshes.length) return null;
    // Width, height and length of the far shape (the model faces -Z).
    const extent = bounds.isEmpty() ? new THREE.Vector3(1.8, 1.45, 4.5) : bounds.getSize(new THREE.Vector3());
    return { meshes, paint, lamps, count: 0, extent };
  }

  return {
    stats,

    /**
     * Starts a frame's list of cars.
     * @param {{x: number, z: number} | null} [eye] The camera: cars far from it get the far level.
     */
    begin(eye) {
      for (const model of models.values()) if (model) model.count = 0;
      farCount = 0;
      eyeX = eye ? eye.x : NaN;
      eyeZ = eye ? eye.z : NaN;
    },

    /**
     * Adds one car to this frame's picture.
     * @param {string} modelId The vehicle model.
     * @param {number} x
     * @param {number} y Ground height under the car.
     * @param {number} z
     * @param {number} heading Physics heading (0 north, clockwise).
     * @param {THREE.Color} colour The paint.
     * @returns {boolean} False when the model cannot be drawn.
     */
    add(modelId, x, y, z, heading, colour) {
      const model = modelOf(modelId);
      if (!model) return false;
      position.set(x, y, z);
      quaternion.setFromAxisAngle(upAxis, -heading);
      const dx = x - eyeX;
      const dz = z - eyeZ;
      if (dx * dx + dz * dz > farSquared && farCount < proxyCapacity) {
        matrix.compose(position, quaternion, size.copy(model.extent));
        far.setMatrixAt(farCount, matrix);
        far.setColorAt(farCount, colour);
        farCount += 1;
        return true;
      }
      if (model.count >= capacity) return false;
      matrix.compose(position, quaternion, unit);
      model.meshes[0].setMatrixAt(model.count, matrix);
      model.paint?.setColorAt(model.count, colour);
      model.count += 1;
      return true;
    },

    /**
     * Uploads this frame's cars.
     * @param {boolean} lampsLit Whether the lamps are drawn (night).
     */
    end(lampsLit) {
      night = lampsLit;
      stats.cars = 0;
      stats.drawCalls = 0;
      stats.triangles = 0;
      for (const model of models.values()) {
        if (!model) continue;
        stats.cars += model.count;
        for (const mesh of model.meshes) {
          const shown = model.count > 0 && (night || !model.lamps.includes(mesh));
          mesh.count = model.count;
          mesh.visible = shown;
          if (!shown) continue;
          stats.drawCalls += 1;
          stats.triangles += mesh.userData.triangles * model.count;
        }
        if (model.count > 0) {
          model.meshes[0].instanceMatrix.needsUpdate = true;
          if (model.paint?.instanceColor) model.paint.instanceColor.needsUpdate = true;
        }
      }
      far.count = farLamps.count = farCount;
      far.visible = farCount > 0;
      farLamps.visible = farCount > 0 && night;
      stats.farCars = farCount;
      stats.cars += farCount;
      if (farCount > 0) {
        far.instanceMatrix.needsUpdate = true;
        far.instanceColor.needsUpdate = true;
        stats.drawCalls += night ? 2 : 1;
        stats.triangles += farCount * (night ? 56 : 48);
      }
    },

    dispose() {
      for (const mesh of [far, farLamps]) {
        mesh.geometry.dispose();
        mesh.material.dispose();
        mesh.dispose();
      }
      for (const model of models.values()) {
        if (!model) continue;
        for (const mesh of model.meshes) {
          mesh.geometry.dispose();
          mesh.dispose();
        }
      }
      models.clear();
      root.removeFromParent();
    },
  };
}

// One geometry from several parts with the same material: only the attributes all of them
// have, all indexed or none.
function mergeParts(geometries) {
  if (geometries.length === 1) return geometries[0];
  const names = Object.keys(geometries[0].attributes).filter((name) => geometries.every((g) => g.attributes[name]));
  const indexed = geometries.every((g) => g.index);
  const list = geometries.map((g) => {
    let geometry = indexed ? g : g.index ? g.toNonIndexed() : g;
    for (const name of Object.keys(geometry.attributes)) if (!names.includes(name)) geometry.deleteAttribute(name);
    geometry.morphAttributes = {};
    return geometry;
  });
  return BufferGeometryUtils.mergeGeometries(list, false);
}
